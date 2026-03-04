-- Resume Surgeon: public_profiles for Surgical Share (live link)
-- Run in Supabase SQL Editor or via: supabase db push

CREATE TABLE IF NOT EXISTS resume_surgeon.public_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  snapshot jsonb NOT NULL DEFAULT '{}',
  noindex boolean NOT NULL DEFAULT true,
  is_paid boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_public_profiles_username ON resume_surgeon.public_profiles(username);
CREATE INDEX IF NOT EXISTS idx_public_profiles_user_id ON resume_surgeon.public_profiles(user_id);

ALTER TABLE resume_surgeon.public_profiles ENABLE ROW LEVEL SECURITY;

-- Anyone can read a profile by username (public view)
CREATE POLICY "Public profiles are readable by anyone"
  ON resume_surgeon.public_profiles FOR SELECT
  USING (true);

-- Only the owner can insert/update/delete their profile
CREATE POLICY "Users can insert own public_profile"
  ON resume_surgeon.public_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own public_profile"
  ON resume_surgeon.public_profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own public_profile"
  ON resume_surgeon.public_profiles FOR DELETE
  USING (auth.uid() = user_id);
