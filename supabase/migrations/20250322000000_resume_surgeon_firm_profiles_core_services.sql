-- Add core_services to firm_profiles for tag-style service list (e.g. ICT, Civil Works)
ALTER TABLE resume_surgeon.firm_profiles
  ADD COLUMN IF NOT EXISTS core_services jsonb DEFAULT '[]';
