import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { URL } from 'node:url';
import { config, assertProductionConfig } from '../config.mjs';
import { pool, withTransaction } from '../db/pool.mjs';
import { AppError, errorResponse } from '../errors.mjs';
import { createSession, getActor, makePasswordHash, revokeSession, verifyPassword, loginBlocked, recordLoginAttempt } from '../auth/sessions.mjs';
import { requireBusiness, requireBranch, requirePermission } from '../auth/permissions.mjs';
import { transitionJob } from '../domain/jobs.mjs';
import { createPayment } from '../domain/payments.mjs';
import { audit } from '../audit.mjs';

assertProductionConfig();
const requestId = () => crypto.randomUUID();
const cookieToken = request => request.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith('shinepro_session='))?.split('=')[1];
async function body(request) { let raw = ''; let bytes = 0; for await (const chunk of request) { bytes += Buffer.byteLength(chunk); if (bytes > config.maxBodyBytes) throw new AppError('REQUEST_TOO_LARGE', 'Request body exceeds the configured limit.', 413); raw += chunk; } if (!raw) return {}; try { return JSON.parse(raw); } catch { throw new AppError('INVALID_JSON', 'Request body must be valid JSON.', 400); } }
function send(response, status, payload, headers = {}) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }); response.end(JSON.stringify(payload)); }
function ok(response, data, status = 200, headers = {}) { send(response, status, { data }, headers); }
function methodNotAllowed(response) { send(response, 405, { error: 'METHOD_NOT_ALLOWED', message: 'This action is not available for the requested method.' }); }
const staticTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' };
async function serveStatic(pathname, response) {
  const requested = pathname === '/' ? 'landing.html' : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(process.cwd(), requested);
  const root = path.resolve(process.cwd());
  if (!filePath.startsWith(`${root}${path.sep}`) || !staticTypes[path.extname(filePath).toLowerCase()]) return false;
  try { const content = await fs.readFile(filePath); response.removeHeader('Content-Security-Policy'); response.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'"); response.writeHead(200, { 'Content-Type': staticTypes[path.extname(filePath).toLowerCase()], 'Cache-Control': pathname === '/' ? 'no-store' : 'public, max-age=300' }); response.end(content); return true; } catch { return false; }
}
async function actorFor(request, client = pool) { const token = cookieToken(request) || request.headers.authorization?.replace(/^Bearer\s+/i, ''); return getActor(client, token); }
function queryScope(actor) { const globalRoles = ['platform_super_admin','business_owner','company_administrator','accountant']; const globalScope = actor.roles.length > 0 && actor.roles.every(role => globalRoles.includes(role)); const branches = actor.branchIds.length ? actor.branchIds : ['00000000-0000-0000-0000-000000000000']; return { businesses: actor.businessIds, branches, globalScope }; }
function isWorkerOnly(actor) { return actor.roles.includes('worker') && !actor.roles.some(role => ['platform_super_admin','business_owner','company_administrator','branch_manager','accountant'].includes(role)); }
function isCustomer(actor) { return actor.roles.includes('customer') && !actor.roles.some(role => role !== 'customer'); }
const tokenHash = value => crypto.createHash('sha256').update(value).digest('hex');
async function publicBusinessId(client) {
  if (config.publicBusinessId) return config.publicBusinessId;
  const result = await client.query("SELECT id FROM businesses WHERE status='active' ORDER BY created_at LIMIT 2");
  if (result.rowCount === 1) return result.rows[0].id;
  throw new AppError('PUBLIC_BUSINESS_NOT_CONFIGURED', 'Configure PUBLIC_BUSINESS_ID before enabling public signup.', 503);
}

async function handle(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`); const path = url.pathname; const rid = requestId();
  if (request.method === 'OPTIONS') return send(response, 204, {}, { 'Access-Control-Allow-Origin': config.allowedOrigin, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, Idempotency-Key' });
  if (!path.startsWith('/api/') && request.method === 'GET' && await serveStatic(path, response)) return;
  if (path === '/api/health' && request.method === 'GET') return ok(response, { status: 'ok', environment: config.env, label: config.label, payments: config.paymentsMode, notifications: config.notificationsMode });
  try {
    if (path === '/api/public/catalog' && request.method === 'GET') {
      const businessId = await publicBusinessId(pool);
      const services = await pool.query(`SELECT s.id,s.name,s.description,COALESCE(sp.amount_toman,0) starting_price_toman FROM services s LEFT JOIN LATERAL (SELECT amount_toman FROM service_prices WHERE service_id=s.id AND effective_from <= now() AND (effective_to IS NULL OR effective_to > now()) ORDER BY effective_from DESC LIMIT 1) sp ON true WHERE s.business_id=$1 AND s.status='active' ORDER BY s.created_at`, [businessId]);
      const offers = await pool.query(`SELECT id,title,description,discount_type,discount_value,promo_code,starts_at,ends_at,terms FROM offers WHERE business_id=$1 AND status='active' AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now()) ORDER BY created_at DESC LIMIT 12`, [businessId]);
      return ok(response, { services: services.rows, offers: offers.rows, cache: 'public-catalog' });
    }
    if (path === '/api/auth/signup' && request.method === 'POST') {
      const input = await body(request); const email = String(input.email || '').trim().toLowerCase(); const displayName = String(input.displayName || '').trim(); const phone = String(input.phone || '').trim(); const password = String(input.password || '');
      if (!displayName || !phone || !email || password.length < 10) throw new AppError('VALIDATION_ERROR', 'Name, phone, email and a 10-character password are required.', 422);
      const created = await withTransaction(async client => {
        const businessId = await publicBusinessId(client); const existing = await client.query('SELECT id FROM users WHERE lower(email)=lower($1)', [email]); if (existing.rowCount) throw new AppError('ACCOUNT_EXISTS', 'An account already exists for this email.', 409);
        const customer = await client.query('INSERT INTO customers(business_id,name,phone,customer_type) VALUES($1,$2,$3,\'member\') RETURNING id', [businessId, displayName, phone]);
        const user = await client.query('INSERT INTO users(email,password_hash,display_name,status,customer_id) VALUES($1,$2,$3,\'active\',$4) RETURNING id,email,display_name,status', [email, makePasswordHash(password), displayName, customer.rows[0].id]);
        await client.query("INSERT INTO business_memberships(business_id,user_id,role_id,status) SELECT $1,$2,id,'active' FROM roles WHERE key='customer'", [businessId, user.rows[0].id]);
        await client.query('INSERT INTO customer_notification_preferences(customer_id,language,marketing_opt_in) VALUES($1,$2,$3)', [customer.rows[0].id, input.language === 'fa' ? 'fa' : 'en', Boolean(input.marketingOptIn)]);
        await client.query('INSERT INTO loyalty_accounts(business_id,customer_id) VALUES($1,$2)', [businessId, customer.rows[0].id]);
        return { user: user.rows[0], customerId: customer.rows[0].id, role: 'customer', accountType: 'member' };
      });
      return ok(response, created, 201);
    }
    if (path === '/api/business-registration-requests' && request.method === 'POST') {
      const input = await body(request); if (!input.businessName || !input.contactName || !input.phone || !input.email || !input.city) throw new AppError('VALIDATION_ERROR', 'Business name, contact, phone, email and city are required.', 422);
      const result = await pool.query('INSERT INTO business_registration_requests(business_name,contact_name,phone,email,city,branch_count,description) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,status,created_at', [input.businessName, input.contactName, input.phone, input.email, input.city, Number(input.branchCount || 1), input.description || null]);
      return ok(response, result.rows[0], 201);
    }
    if (path === '/api/auth/login' && request.method === 'POST') {
      const input = await body(request); if (!input.email || !input.password) throw new AppError('INVALID_CREDENTIALS', 'Email and password are required.', 401);
      if (await loginBlocked(pool, input.email)) throw new AppError('LOGIN_RATE_LIMITED', 'Too many failed attempts. Try again later or use password reset.', 429);
      const user = await pool.query('SELECT id,email,password_hash,status,display_name FROM users WHERE lower(email)=lower($1)', [input.email]); const valid = user.rowCount && user.rows[0].status === 'active' && verifyPassword(input.password, user.rows[0].password_hash);
      await recordLoginAttempt(pool, { email: input.email, ip: request.socket.remoteAddress, succeeded: Boolean(valid) });
      if (!valid) throw new AppError('INVALID_CREDENTIALS', 'Email or password is incorrect.', 401);
      const token = await withTransaction(client => createSession(client, user.rows[0].id)); await pool.query('UPDATE users SET last_login_at=now() WHERE id=$1', [user.rows[0].id]);
      return ok(response, { user: { id: user.rows[0].id, email: user.rows[0].email, displayName: user.rows[0].display_name }, environment: config.label }, 200, { 'Set-Cookie': `shinepro_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${config.sessionTtlSeconds}` });
    }
    if (path === '/api/auth/logout' && request.method === 'POST') { await withTransaction(client => revokeSession(client, cookieToken(request))); return ok(response, { loggedOut: true }, 200, { 'Set-Cookie': 'shinepro_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' }); }
    const actor = await actorFor(request);
    if (path === '/api/me' && request.method === 'GET') return ok(response, actor);
    if (path === '/api/jobs' && request.method === 'GET') {
      requirePermission(actor, 'jobs.view'); const scope = queryScope(actor); const params = [scope.businesses]; const filters = ['business_id = ANY($1::uuid[])'];
      if (!scope.globalScope) { params.push(scope.branches); filters.push(`branch_id = ANY($${params.length}::uuid[])`); }
      if (isWorkerOnly(actor)) { params.push(actor.userId); filters.push(`EXISTS (SELECT 1 FROM worker_assignments wa JOIN workers w ON w.id=wa.worker_id WHERE wa.job_id=jobs.id AND w.user_id=$${params.length})`); }
      if (isCustomer(actor)) { if (!actor.customerId) throw new AppError('CUSTOMER_PROFILE_REQUIRED', 'Your customer profile is not linked to this account.', 403); params.push(actor.customerId); filters.push(`customer_id=$${params.length}`); }
      if (url.searchParams.get('status')) { params.push(url.searchParams.get('status')); filters.push(`status=$${params.length}`); } if (url.searchParams.get('q')) { params.push(`%${url.searchParams.get('q')}%`); filters.push(`(code ILIKE $${params.length} OR notes ILIKE $${params.length})`); }
      const result = await pool.query(`SELECT id,code,status,payment_status,final_price_toman,created_at,version FROM jobs WHERE ${filters.join(' AND ')} ORDER BY created_at DESC LIMIT 100`, params); return ok(response, { items: result.rows, pageSize: 100 });
    }
    const actionMatch = path.match(/^\/api\/jobs\/([0-9a-f-]+)\/actions\/([a-z_]+)$/); if (actionMatch && request.method === 'POST') { const input = await body(request); const job = await withTransaction(client => transitionJob(client, actor, { jobId: actionMatch[1], action: actionMatch[2], expectedVersion: input.expectedVersion, requestId: rid })); return ok(response, job); }
    if (path === '/api/payments' && request.method === 'POST') { const input = await body(request); const key = request.headers['idempotency-key'] || input.idempotencyKey; if (!key) throw new AppError('IDEMPOTENCY_KEY_REQUIRED', 'Financial requests require an Idempotency-Key.', 400); input.idempotencyKey = key; const result = await withTransaction(client => createPayment(client, actor, { ...input, requestId: rid })); return ok(response, result, result.duplicate ? 200 : 201); }
    if (path === '/api/customers' && request.method === 'GET') { requirePermission(actor, 'customers.view'); const scope = queryScope(actor); const params = [scope.businesses]; const filters = ['business_id=ANY($1::uuid[])']; if (isCustomer(actor)) { if (!actor.customerId) throw new AppError('CUSTOMER_PROFILE_REQUIRED', 'Your customer profile is not linked to this account.', 403); params.push(actor.customerId); filters.push(`id=$${params.length}`); } const result = await pool.query(`SELECT id,name,phone,customer_type,credit_status,created_at,version FROM customers WHERE ${filters.join(' AND ')} ORDER BY created_at DESC LIMIT 100`, params); return ok(response, { items: result.rows, pageSize: 100 }); }
    if (path === '/api/customer/vehicles' && request.method === 'GET') { requirePermission(actor, 'customers.view'); if (!isCustomer(actor) || !actor.customerId) throw new AppError('CUSTOMER_PROFILE_REQUIRED', 'A linked customer profile is required.', 403); const result = await pool.query('SELECT id,plate,vehicle_type,brand,model,colour,notes,created_at,version FROM vehicles WHERE business_id=ANY($1::uuid[]) AND customer_id=$2 ORDER BY created_at DESC', [actor.businessIds, actor.customerId]); return ok(response, { items: result.rows }); }
    if (path === '/api/customer/jobs' && request.method === 'GET') { requirePermission(actor, 'customers.view'); if (!isCustomer(actor) || !actor.customerId) throw new AppError('CUSTOMER_PROFILE_REQUIRED', 'A linked customer profile is required.', 403); const result = await pool.query('SELECT id,code,status,payment_status,final_price_toman,created_at,version FROM jobs WHERE business_id=ANY($1::uuid[]) AND customer_id=$2 ORDER BY created_at DESC LIMIT 100', [actor.businessIds, actor.customerId]); return ok(response, { items: result.rows }); }
    if (path === '/api/customer/receipts' && request.method === 'GET') { requirePermission(actor, 'customers.view'); if (!isCustomer(actor) || !actor.customerId) throw new AppError('CUSTOMER_PROFILE_REQUIRED', 'A linked customer profile is required.', 403); const result = await pool.query(`SELECT p.id,p.status,p.total_amount_toman,p.tip_amount_toman,p.confirmed_at,j.code FROM payments p JOIN jobs j ON j.id=p.job_id WHERE p.business_id=ANY($1::uuid[]) AND j.customer_id=$2 ORDER BY p.created_at DESC LIMIT 100`, [actor.businessIds, actor.customerId]); return ok(response, { items: result.rows }); }
    if (path === '/api/customer/loyalty' && request.method === 'GET') { requirePermission(actor, 'customers.view'); if (!isCustomer(actor) || !actor.customerId) throw new AppError('CUSTOMER_PROFILE_REQUIRED', 'A linked customer profile is required.', 403); const account = await pool.query('SELECT id,balance,expires_at FROM loyalty_accounts WHERE business_id=ANY($1::uuid[]) AND customer_id=$2 LIMIT 1', [actor.businessIds, actor.customerId]); const history = account.rowCount ? await pool.query('SELECT points,reason,created_at FROM loyalty_transactions WHERE loyalty_account_id=$1 ORDER BY created_at DESC LIMIT 50', [account.rows[0].id]) : { rows: [] }; return ok(response, { account: account.rows[0] || null, transactions: history.rows }); }
    if (path === '/api/customer/membership' && request.method === 'GET') { requirePermission(actor, 'customers.view'); if (!isCustomer(actor) || !actor.customerId) throw new AppError('CUSTOMER_PROFILE_REQUIRED', 'A linked customer profile is required.', 403); const result = await pool.query(`SELECT ms.id,ms.status,ms.starts_at,ms.ends_at,ms.usage_count,mp.name,mv.price_toman,mv.duration_days,mv.included_services,mv.discount_basis_points,mv.loyalty_multiplier FROM membership_subscriptions ms JOIN membership_plans mp ON mp.id=ms.plan_id JOIN membership_plan_versions mv ON mv.id=ms.plan_version_id WHERE ms.business_id=ANY($1::uuid[]) AND ms.customer_id=$2 ORDER BY ms.ends_at DESC LIMIT 20`, [actor.businessIds, actor.customerId]); return ok(response, { items: result.rows }); }
    if (path === '/api/customer/complaints' && request.method === 'POST') { requirePermission(actor, 'customers.view'); if (!isCustomer(actor) || !actor.customerId) throw new AppError('CUSTOMER_PROFILE_REQUIRED', 'A linked customer profile is required.', 403); const input = await body(request); if (!input.category || !input.description) throw new AppError('VALIDATION_ERROR', 'Complaint category and description are required.', 422); const result = await pool.query('INSERT INTO customer_complaints(business_id,customer_id,job_id,category,description) VALUES($1,$2,$3,$4,$5) RETURNING id,status,created_at', [actor.businessIds[0], actor.customerId, input.jobId || null, input.category, input.description]); return ok(response, result.rows[0], 201); }
    if (path === '/api/staff/invitations' && request.method === 'POST') { requirePermission(actor, 'settings.manage'); const input = await body(request); if (!input.email || !input.displayName || !input.roleKey) throw new AppError('VALIDATION_ERROR', 'Invite email, name and role are required.', 422); const allowed = ['company_administrator','branch_manager','cashier','quality_controller','team_leader','worker','accountant','inventory_manager']; if (!allowed.includes(input.roleKey)) throw new AppError('ROLE_ASSIGNMENT_RESTRICTED', 'This role may only be assigned by platform policy.', 403); const rawToken = crypto.randomBytes(32).toString('base64url'); const result = await withTransaction(async client => { const row = await client.query('INSERT INTO staff_invitations(business_id,email,phone,display_name,role_key,branch_id,token_hash,expires_at,invited_by) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval \'72 hours\',$8) RETURNING id,status,expires_at', [actor.businessIds[0], input.email, input.phone || null, input.displayName, input.roleKey, input.branchId || null, tokenHash(rawToken), actor.userId]); await audit(client, {actor,businessId:actor.businessIds[0],action:'staff.invitation.created',entityType:'staff_invitation',entityId:row.rows[0].id,newValues:row.rows[0],requestId:rid}); return row.rows[0]; }); return ok(response, { ...result, invitationToken: config.env === 'production' ? undefined : rawToken }, 201); }
    if (path === '/api/customers' && request.method === 'POST') { requirePermission(actor, 'customers.manage'); const input = await body(request); if (!input.name) throw new AppError('VALIDATION_ERROR', 'Customer name is required.', 422); const businessId = actor.businessIds[0]; const created = await withTransaction(async client => { const result = await client.query('INSERT INTO customers(business_id,name,phone,customer_type,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *', [businessId, input.name, input.phone || null, input.customerType || 'walk_in', actor.userId]); await audit(client, { actor, businessId, action: 'customer.created', entityType: 'customer', entityId: result.rows[0].id, newValues: result.rows[0], requestId: rid }); return result.rows[0]; }); return ok(response, created, 201); }
    if (path === '/api/audit' && request.method === 'GET') { requirePermission(actor, 'audit.view'); const scope = queryScope(actor); const result = await pool.query('SELECT id,action,entity_type,entity_id,role_key,reason,created_at FROM audit_events WHERE business_id=ANY($1::uuid[]) ORDER BY created_at DESC LIMIT 200', [scope.businesses]); return ok(response, { items: result.rows }); }
    methodNotAllowed(response);
  } catch (error) { const result = errorResponse(error); send(response, result.status, { ...result.body, requestId: rid }); }
}

const server = http.createServer((request, response) => { response.setHeader('Access-Control-Allow-Origin', config.allowedOrigin); response.setHeader('Access-Control-Allow-Credentials', 'true'); response.setHeader('Vary', 'Origin'); response.setHeader('X-Content-Type-Options', 'nosniff'); response.setHeader('Referrer-Policy', 'no-referrer'); response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'"); void handle(request, response); });
server.listen(config.port, () => console.log(`${config.label} API listening on http://localhost:${config.port}`));
process.on('SIGTERM', async () => { await pool.end(); server.close(() => process.exit(0)); });
