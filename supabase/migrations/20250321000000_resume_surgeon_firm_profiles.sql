-- Resume Surgeon: firm_profiles table for Professional Firm proposal data
-- Run in Supabase SQL Editor or via: supabase db push
--
-- Stores company profile, bio, and past projects for firm proposals.
-- RLS: Users can only see and edit their own profile.
-- Trigger: updated_at is set automatically on row modification.

CREATE TABLE resume_surgeon.firm_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  company_name text,
  bio text,
  past_projects jsonb DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE resume_surgeon.firm_profiles ENABLE ROW LEVEL SECURITY;

-- Users can only see and edit their own profile based on auth.uid()
CREATE POLICY "Users can view own firm_profile"
  ON resume_surgeon.firm_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own firm_profile"
  ON resume_surgeon.firm_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own firm_profile"
  ON resume_surgeon.firm_profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own firm_profile"
  ON resume_surgeon.firm_profiles FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger function: set updated_at to now() on row modification
CREATE OR REPLACE FUNCTION resume_surgeon.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = resume_surgeon
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger: fire before UPDATE on firm_profiles
CREATE TRIGGER firm_profiles_updated_at
  BEFORE UPDATE ON resume_surgeon.firm_profiles
  FOR EACH ROW
  EXECUTE FUNCTION resume_surgeon.set_updated_at();
