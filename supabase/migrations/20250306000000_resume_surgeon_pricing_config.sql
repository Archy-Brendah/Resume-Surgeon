-- Resume Surgeon: pricing_config for Smart Dynamic Pricing
-- Edit these values in Supabase Dashboard (Table Editor) to change prices or extend the offer.

CREATE TABLE IF NOT EXISTS resume_surgeon.pricing_config (
  id text PRIMARY KEY DEFAULT 'default',
  user_limit int NOT NULL DEFAULT 100,
  current_paid_count int NOT NULL DEFAULT 0,
  early_bird_price int NOT NULL DEFAULT 999,
  standard_price int NOT NULL DEFAULT 2500,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Single row: early bird until current_paid_count reaches user_limit, then standard_price
INSERT INTO resume_surgeon.pricing_config (id, user_limit, current_paid_count, early_bird_price, standard_price)
VALUES ('default', 100, 0, 999, 2500)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE resume_surgeon.pricing_config ENABLE ROW LEVEL SECURITY;

-- Anyone can read (for getLivePrice and checkout UI)
CREATE POLICY "Pricing config is readable by anyone"
  ON resume_surgeon.pricing_config FOR SELECT
  USING (true);

-- Only service role can update (increment from webhook); no policy for anon UPDATE.
-- Increment is done via RPC so only backend with service role can call it.
CREATE OR REPLACE FUNCTION resume_surgeon.increment_pricing_paid_count()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = resume_surgeon
AS $$
  UPDATE resume_surgeon.pricing_config
  SET current_paid_count = current_paid_count + 1, updated_at = now()
  WHERE id = 'default';
$$;

GRANT EXECUTE ON FUNCTION resume_surgeon.increment_pricing_paid_count() TO service_role;
