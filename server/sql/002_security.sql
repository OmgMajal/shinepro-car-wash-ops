-- Security and migration hardening. Run after 001_core.sql.
ALTER TABLE users ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS legacy_source_id text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS legacy_source_id text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS legacy_source_id text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_customer_id ON users(customer_id) WHERE customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_business_legacy ON customers(business_id, legacy_source_id) WHERE legacy_source_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_business_legacy ON vehicles(business_id, legacy_source_id) WHERE legacy_source_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_business_legacy ON jobs(business_id, legacy_source_id) WHERE legacy_source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_memberships_user_business ON business_memberships(user_id, business_id, status);
CREATE INDEX IF NOT EXISTS idx_branch_assignments_user_branch ON user_branch_assignments(user_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_worker_assignments_worker_job ON worker_assignments(worker_id, job_id);
CREATE INDEX IF NOT EXISTS idx_payments_job_status ON payments(job_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refunds_payment_status ON refunds(payment_id, status);
CREATE INDEX IF NOT EXISTS idx_stock_movements_item_created ON stock_movements(inventory_item_id, created_at DESC);

CREATE TABLE IF NOT EXISTS login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  ip_hash text,
  succeeded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_created ON login_attempts(lower(email), created_at DESC);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS migration_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_label text NOT NULL,
  status text NOT NULL CHECK (status IN ('preview','imported','rolled_back','failed')),
  imported_by uuid REFERENCES users(id),
  report jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Explicit role-permission links are kept in the database for policy inspection.
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.key IN ('platform_super_admin','business_owner')
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.key = ANY(ARRAY['jobs.view','jobs.create','jobs.transition','customers.view','customers.manage','inventory.manage','settings.manage','audit.view'])
WHERE r.key='company_administrator' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.key = ANY(ARRAY['jobs.view','jobs.create','jobs.transition','customers.view','customers.manage','payments.create','inventory.manage','audit.view'])
WHERE r.key='branch_manager' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.key = ANY(ARRAY['jobs.view','customers.view','payments.create','payments.reverse','payroll.view','payroll.approve','audit.view'])
WHERE r.key='accountant' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.key = ANY(ARRAY['jobs.view','jobs.create','customers.view','customers.manage','payments.create'])
WHERE r.key='cashier' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.key = ANY(ARRAY['jobs.view','jobs.transition','audit.view'])
WHERE r.key='quality_controller' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.key = ANY(ARRAY['jobs.view','jobs.transition'])
WHERE r.key='team_leader' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.key = 'jobs.view'
WHERE r.key='worker' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.key = ANY(ARRAY['jobs.view','inventory.manage'])
WHERE r.key='inventory_manager' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.key = 'customers.view'
WHERE r.key='customer' ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION deny_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events_are_immutable';
END;
$$;
DROP TRIGGER IF EXISTS audit_events_immutable ON audit_events;
CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION deny_audit_mutation();

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_nonnegative_prices;
ALTER TABLE jobs ADD CONSTRAINT jobs_nonnegative_prices CHECK (original_price_toman >= 0 AND discount_toman >= 0 AND final_price_toman >= 0 AND discount_toman <= original_price_toman);
