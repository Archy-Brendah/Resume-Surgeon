-- Add mandatory_docs to firm_profiles for Kenyan tender compliance documents
-- Structure: array of { doc_name: string, status: boolean, expiry_date: date | null }
-- Examples: KRA Tax Compliance, CR12, NCA Registration

ALTER TABLE resume_surgeon.firm_profiles
  ADD COLUMN IF NOT EXISTS mandatory_docs jsonb DEFAULT '[]';

COMMENT ON COLUMN resume_surgeon.firm_profiles.mandatory_docs IS 'Array of { doc_name, status, expiry_date } for KRA, CR12, NCA, etc.';
