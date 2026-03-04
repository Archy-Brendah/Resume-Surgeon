-- Resume Surgeon: Track total SUs purchased per user (loyalty / analytics).
ALTER TABLE resume_surgeon.user_assets
  ADD COLUMN IF NOT EXISTS total_credits_purchased int NOT NULL DEFAULT 0;

COMMENT ON COLUMN resume_surgeon.user_assets.total_credits_purchased IS 'Lifetime Surgical Units (SUs) purchased via refill packs.';
