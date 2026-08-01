CREATE TABLE IF NOT EXISTS public_content_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES businesses(id),
  section_key text NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','published','unpublished','archived')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb, active_from timestamptz, active_to timestamptz,
  created_by uuid REFERENCES users(id), updated_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, section_key)
);
CREATE TABLE IF NOT EXISTS content_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), section_id uuid NOT NULL REFERENCES public_content_sections(id) ON DELETE CASCADE,
  version_no integer NOT NULL, payload jsonb NOT NULL, status text NOT NULL DEFAULT 'draft', published_at timestamptz,
  created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(section_id, version_no)
);
CREATE TABLE IF NOT EXISTS offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES businesses(id), title text NOT NULL, description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','active','paused','expired','archived')),
  discount_type text CHECK (discount_type IN ('percentage','fixed','benefit')), discount_value bigint NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  promo_code text, starts_at timestamptz, ends_at timestamptz, applicable_service_ids uuid[] NOT NULL DEFAULT '{}', terms text,
  usage_limit integer, created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS offer_eligibility (
  offer_id uuid NOT NULL REFERENCES offers(id) ON DELETE CASCADE, membership_plan_id uuid, customer_type text, branch_id uuid REFERENCES branches(id), PRIMARY KEY (offer_id, branch_id, customer_type)
);
CREATE TABLE IF NOT EXISTS offer_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), offer_id uuid NOT NULL REFERENCES offers(id), customer_id uuid REFERENCES customers(id), job_id uuid REFERENCES jobs(id), discount_snapshot jsonb NOT NULL DEFAULT '{}', used_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS membership_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES businesses(id), name text NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','archived')), created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS membership_plan_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan_id uuid NOT NULL REFERENCES membership_plans(id) ON DELETE CASCADE, version_no integer NOT NULL,
  price_toman bigint NOT NULL DEFAULT 0, duration_days integer NOT NULL DEFAULT 30, terms text, included_services jsonb NOT NULL DEFAULT '[]', discount_basis_points integer NOT NULL DEFAULT 0, loyalty_multiplier numeric(8,2) NOT NULL DEFAULT 1, usage_limit integer,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(plan_id, version_no)
);
CREATE TABLE IF NOT EXISTS membership_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES businesses(id), plan_id uuid NOT NULL REFERENCES membership_plans(id), plan_version_id uuid NOT NULL REFERENCES membership_plan_versions(id), customer_id uuid NOT NULL REFERENCES customers(id), status text NOT NULL DEFAULT 'active', starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, usage_count integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS loyalty_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES businesses(id), customer_id uuid NOT NULL REFERENCES customers(id), balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0), expires_at timestamptz, UNIQUE(business_id, customer_id)
);
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), loyalty_account_id uuid NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE, job_id uuid REFERENCES jobs(id), points integer NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS staff_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES businesses(id), email text NOT NULL, phone text, display_name text NOT NULL, role_key text NOT NULL REFERENCES roles(key), branch_id uuid REFERENCES branches(id), token_hash text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'sent' CHECK (status IN ('draft','sent','viewed','accepted','expired','cancelled')), expires_at timestamptz NOT NULL, invited_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES businesses(id), user_id uuid NOT NULL REFERENCES users(id), role_key text NOT NULL REFERENCES roles(key), branch_id uuid REFERENCES branches(id), status text NOT NULL DEFAULT 'active', starts_on date, ends_on date, assigned_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS business_registration_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), requested_by uuid REFERENCES users(id), business_name text NOT NULL, contact_name text NOT NULL, phone text NOT NULL, email text NOT NULL, city text NOT NULL, branch_count integer NOT NULL DEFAULT 1 CHECK (branch_count > 0), description text, status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','under_review','more_information_required','approved','rejected')), created_at timestamptz NOT NULL DEFAULT now(), reviewed_by uuid REFERENCES users(id), reviewed_at timestamptz
);
CREATE TABLE IF NOT EXISTS customer_notification_preferences (
  customer_id uuid PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE, language text NOT NULL DEFAULT 'en', marketing_opt_in boolean NOT NULL DEFAULT false, service_updates boolean NOT NULL DEFAULT true, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS testimonials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES businesses(id), customer_id uuid REFERENCES customers(id), display_name text NOT NULL, vehicle_type text, rating integer CHECK (rating BETWEEN 1 AND 5), comment text NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','archived')), branch_id uuid REFERENCES branches(id), created_at timestamptz NOT NULL DEFAULT now(), approved_by uuid REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS faq_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES businesses(id), question text NOT NULL, answer text NOT NULL, sort_order integer NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS contact_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid REFERENCES businesses(id), name text NOT NULL, email text, phone text, message text NOT NULL, status text NOT NULL DEFAULT 'new', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS customer_complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES businesses(id), customer_id uuid NOT NULL REFERENCES customers(id), job_id uuid REFERENCES jobs(id), category text NOT NULL, description text NOT NULL, status text NOT NULL DEFAULT 'submitted', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_public_sections_published ON public_content_sections(business_id, status, active_from, active_to);
CREATE INDEX IF NOT EXISTS idx_offers_public_window ON offers(business_id, status, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_customer_complaints_owner ON customer_complaints(customer_id, created_at DESC);
INSERT INTO permissions(key, label) VALUES ('website.manage','Manage public website content'), ('staff.manage','Manage staff invitations and role assignments') ON CONFLICT (key) DO NOTHING;
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.key IN ('platform_super_admin','business_owner','company_administrator') AND p.key IN ('website.manage','staff.manage')
ON CONFLICT DO NOTHING;
