-- Bank-Grade Security: RLS Vault Lock
-- Ensure resume_surgeon tables are not accessible by anon for sensitive data.
-- user_assets: ONLY authenticated users, and ONLY their own row (auth.uid() = user_id).

-- Revoke table-level access from anon for sensitive tables (RLS still applies to authenticated).
-- This prevents anon key from even attempting SELECT/INSERT/UPDATE/DELETE on user_assets and applications.
REVOKE ALL ON resume_surgeon.user_assets FROM anon;
REVOKE ALL ON resume_surgeon.applications FROM anon;

-- Ensure authenticated has necessary privileges (RLS policies already restrict to own rows).
GRANT SELECT, INSERT, UPDATE ON resume_surgeon.user_assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON resume_surgeon.applications TO authenticated;

-- processed_webhook_events: only service_role (backend webhook handler); no anon/authenticated.
REVOKE ALL ON resume_surgeon.processed_webhook_events FROM anon;
REVOKE ALL ON resume_surgeon.processed_webhook_events FROM authenticated;
-- Service role retains full access by default in Supabase.

-- public_profiles: anon can SELECT (for /view/[username]); authenticated can manage own row.
GRANT SELECT ON resume_surgeon.public_profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON resume_surgeon.public_profiles TO authenticated;

-- pricing_config: anon can SELECT (for getLivePrice/checkout UI); only service_role updates via RPC.
GRANT SELECT ON resume_surgeon.pricing_config TO anon;
GRANT SELECT ON resume_surgeon.pricing_config TO authenticated;

-- RPCs: deduct_ai_credits and add_ai_credits are already granted to authenticated.
-- increment_pricing_paid_count is granted to service_role only.

COMMENT ON TABLE resume_surgeon.user_assets IS 'Vault: RLS enforces auth.uid() = user_id for ALL operations. Anon has no access.';
