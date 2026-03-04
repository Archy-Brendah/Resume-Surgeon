-- Resume Surgeon: applications table (My Operations / Job Tracker)
-- Run in Supabase SQL Editor or via: supabase db push

CREATE TABLE IF NOT EXISTS resume_surgeon.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  job_title text NOT NULL,
  status text NOT NULL CHECK (status IN ('Applied', 'Interview', 'Offer', 'Rejected')),
  date_applied date NOT NULL DEFAULT (CURRENT_DATE),
  link text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_applications_user_id ON resume_surgeon.applications(user_id);
CREATE INDEX IF NOT EXISTS idx_applications_date_applied ON resume_surgeon.applications(date_applied DESC);

ALTER TABLE resume_surgeon.applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own applications"
  ON resume_surgeon.applications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own applications"
  ON resume_surgeon.applications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own applications"
  ON resume_surgeon.applications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own applications"
  ON resume_surgeon.applications FOR DELETE
  USING (auth.uid() = user_id);
