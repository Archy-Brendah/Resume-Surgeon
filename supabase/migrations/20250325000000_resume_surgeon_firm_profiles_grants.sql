-- Grant table-level access for firm_profiles (RLS policies restrict to own rows).
-- Without these grants, authenticated users get "permission denied for table firm_profiles".
REVOKE ALL ON resume_surgeon.firm_profiles FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON resume_surgeon.firm_profiles TO authenticated;
