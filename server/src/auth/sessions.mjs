import crypto from 'node:crypto';
import { config } from '../config.mjs';
import { AppError } from '../errors.mjs';

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
export const requestFingerprint = value => hash(`${config.passwordPepper}:${value || 'unknown'}`);
export async function loginBlocked(client, email) { const result = await client.query(`SELECT count(*)::int AS failures FROM login_attempts WHERE lower(email)=lower($1) AND succeeded=false AND created_at > now() - interval '15 minutes'`, [email]); return Number(result.rows[0]?.failures || 0) >= 8; }
export async function recordLoginAttempt(client, { email, ip, succeeded }) { await client.query(`INSERT INTO login_attempts(email,ip_hash,succeeded) VALUES($1,$2,$3)`, [email, requestFingerprint(ip), succeeded]); }
export function hashPassword(password) { return crypto.scryptSync(`${password}${config.passwordPepper}`, crypto.randomBytes(16), 64).toString('hex'); }
export function verifyPassword(password, stored) { const [salt, digest] = String(stored || '').split('$'); if (!salt || !digest) return false; const candidate = crypto.scryptSync(`${password}${config.passwordPepper}`, salt, 64).toString('hex'); return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(digest)); }
export function makePasswordHash(password) { const salt = crypto.randomBytes(16).toString('hex'); const digest = crypto.scryptSync(`${password}${config.passwordPepper}`, salt, 64).toString('hex'); return `${salt}$${digest}`; }
export async function createSession(client, userId) { const raw = crypto.randomBytes(32).toString('base64url'); await client.query('INSERT INTO sessions(user_id, token_hash, expires_at) VALUES($1,$2,now() + ($3 || \' seconds\')::interval)', [userId, hash(raw), config.sessionTtlSeconds]); return raw; }
export async function revokeSession(client, rawToken) { if (rawToken) await client.query('UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [hash(rawToken)]); }
export async function getActor(client, rawToken) {
  if (!rawToken) throw new AppError('AUTHENTICATION_REQUIRED', 'Sign in is required.', 401);
  const result = await client.query(`SELECT u.id user_id, u.customer_id, u.display_name, u.status user_status, bm.business_id, r.key role_key, COALESCE(array_agg(DISTINCT uba.branch_id) FILTER (WHERE uba.branch_id IS NOT NULL), '{}') branch_ids
    FROM sessions s JOIN users u ON u.id=s.user_id JOIN business_memberships bm ON bm.user_id=u.id JOIN roles r ON r.id=bm.role_id
    LEFT JOIN user_branch_assignments uba ON uba.user_id=u.id
    WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.status='active' AND bm.status='active'
    GROUP BY u.id,u.display_name,u.status,bm.business_id,r.key`, [hash(rawToken)]);
  if (!result.rowCount) throw new AppError('AUTHENTICATION_REQUIRED', 'Your session is expired or no longer active.', 401);
  const row = result.rows[0];
  const rolesByBusiness = Object.fromEntries([...new Set(result.rows.map(x => x.business_id))].map(businessId => [businessId, [...new Set(result.rows.filter(x => x.business_id === businessId).map(x => x.role_key))]]));
  const branchScopes = Object.fromEntries([...new Set(result.rows.map(x => x.business_id))].map(businessId => [businessId, [...new Set(result.rows.filter(x => x.business_id === businessId).flatMap(x => x.branch_ids || []))]]));
  return { userId: row.user_id, customerId: row.customer_id || null, displayName: row.display_name, roles: [...new Set(result.rows.map(x => x.role_key))], rolesByBusiness, branchScopes, businessIds: Object.keys(rolesByBusiness), branchIds: [...new Set(result.rows.flatMap(x => x.branch_ids || []))] };
}
