-- Resume Surgeon: schema, user_assets table, and auth trigger
-- Run this in the Supabase SQL Editor or via: supabase db push
--
-- SECURITY: Row Level Security (RLS) is enabled so users can only see and update
-- their own row in resume_surgeon.user_assets.

CREATE SCHEMA IF NOT EXISTS resume_surgeon;

CREATE TABLE IF NOT EXISTS resume_surgeon.user_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_paid boolean NOT NULL DEFAULT false,
  tier text NOT NULL DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE resume_surgeon.user_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own user_assets"
  ON resume_surgeon.user_assets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own user_assets"
  ON resume_surgeon.user_assets FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own user_assets"
  ON resume_surgeon.user_assets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Auth trigger: when a new user signs up, create a row in user_assets with is_paid = false, tier = free
CREATE OR REPLACE FUNCTION resume_surgeon.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = resume_surgeon, public
AS $$
BEGIN
  INSERT INTO resume_surgeon.user_assets (user_id, is_paid, tier)
  VALUES (NEW.id, false, 'free')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION resume_surgeon.handle_new_user();
