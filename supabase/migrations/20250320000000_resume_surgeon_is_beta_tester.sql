-- Add is_beta_tester to user_assets for "God Mode" (unlimited SU, bypass credit checks).
-- When true, backend RPCs (e.g. deduct_ai_credits) can bypass deduction; frontend shows "∞ SU".
ALTER TABLE resume_surgeon.user_assets
  ADD COLUMN IF NOT EXISTS is_beta_tester boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN resume_surgeon.user_assets.is_beta_tester IS 'When true, user has unlimited SU and bypasses credit deduction (beta/admin testing).';
