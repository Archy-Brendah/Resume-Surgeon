-- Resume Surgeon: refill_history, request_log, process_ai_usage (Gemini free-tier safety).
-- Price display: current_paid_count < user_limit → 999 KSH, else 1499 KSH (set standard_price below).

-- 1) refill_history: log every payment (Executive Pass or top-up)
CREATE TABLE IF NOT EXISTS resume_surgeon.refill_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_kes int NOT NULL,
  credits_added int NOT NULL,
  refill_type text NOT NULL CHECK (refill_type IN ('executive', 'topup')),
  checkout_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refill_history_user_created ON resume_surgeon.refill_history (user_id, created_at DESC);
ALTER TABLE resume_surgeon.refill_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own refill_history"
  ON resume_surgeon.refill_history FOR SELECT USING (auth.uid() = user_id);
GRANT INSERT, SELECT ON resume_surgeon.refill_history TO service_role;

-- 2) request_log: global AI request counter for rate limit (15/min)
CREATE TABLE IF NOT EXISTS resume_surgeon.request_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  feature text
);
CREATE INDEX IF NOT EXISTS idx_request_log_created ON resume_surgeon.request_log (created_at);
-- No RLS: only process_ai_usage (SECURITY DEFINER) reads/writes.

-- 3) process_ai_usage(amount): check global 15/min, log request, deduct credits. Returns: new balance, -1 = insufficient, -2 = rate limited.
CREATE OR REPLACE FUNCTION resume_surgeon.process_ai_usage(p_amount int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = resume_surgeon
AS $$
DECLARE
  recent_count int;
  new_balance int;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN -1;
  END IF;

  -- Global rate limit: 15 requests per minute (Gemini free tier)
  SELECT count(*)::int INTO recent_count
  FROM resume_surgeon.request_log
  WHERE created_at > now() - interval '1 minute';

  IF recent_count >= 15 THEN
    RETURN -2;
  END IF;

  INSERT INTO resume_surgeon.request_log (created_at) VALUES (now());

  SELECT resume_surgeon.deduct_ai_credits(p_amount) INTO new_balance;
  RETURN COALESCE(new_balance, -1);
END;
$$;

GRANT EXECUTE ON FUNCTION resume_surgeon.process_ai_usage(int) TO authenticated;
GRANT EXECUTE ON FUNCTION resume_surgeon.process_ai_usage(int) TO service_role;

-- 4) Ensure standard_price = 1499 when current_paid_count >= user_limit
UPDATE resume_surgeon.pricing_config SET standard_price = 1499 WHERE id = 'default';
