-- Add methodology, mission, success_metrics, team_size to firm_profiles for proposal auto-fill
ALTER TABLE resume_surgeon.firm_profiles ADD COLUMN IF NOT EXISTS methodology text;
ALTER TABLE resume_surgeon.firm_profiles ADD COLUMN IF NOT EXISTS mission text;
ALTER TABLE resume_surgeon.firm_profiles ADD COLUMN IF NOT EXISTS success_metrics text;
ALTER TABLE resume_surgeon.firm_profiles ADD COLUMN IF NOT EXISTS team_size text;

COMMENT ON COLUMN resume_surgeon.firm_profiles.methodology IS 'Firm delivery methodology or approach for proposals';
COMMENT ON COLUMN resume_surgeon.firm_profiles.mission IS 'Company mission or vision';
COMMENT ON COLUMN resume_surgeon.firm_profiles.success_metrics IS 'How firm measures success or typical client outcomes';
COMMENT ON COLUMN resume_surgeon.firm_profiles.team_size IS 'Team size or composition';
