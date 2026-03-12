-- Resume Surgeon: Global safety (daily 1450, minute 14 wait), user throttle (2/min), get_global_request_counts.
-- Sliding window: count rows where created_at > now() - interval.

-- 1) Add user_id to request_log for per-user throttle
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'resume_surgeon' AND table_name = 'request_log' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE resume_surgeon.request_log ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_request_log_user_created ON resume_surgeon.request_log (user_id, created_at);

-- 2) get_global_request_counts(): sliding window minute and daily (for wait/maintenance logic)
CREATE OR REPLACE FUNCTION resume_surgeon.get_global_request_counts()
RETURNS TABLE(minute_count bigint, daily_count bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = resume_surgeon
AS $$
  SELECT
    (SELECT count(*) FROM resume_surgeon.request_log WHERE created_at > now() - interval '1 minute'),
    (SELECT count(*) FROM resume_surgeon.request_log WHERE created_at > now() - interval '1 day');
$$;

GRANT EXECUTE ON FUNCTION resume_surgeon.get_global_request_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION resume_surgeon.get_global_request_counts() TO service_role;

-- 3) process_ai_usage: daily 1450 (maintenance -3), user 2/min (-4), global 15/min (-2), then insert + deduct
CREATE OR REPLACE FUNCTION resume_surgeon.process_ai_usage(p_amount int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = resume_surgeon
AS $$
DECLARE
  daily_count int;
  minute_count int;
  user_minute_count int;
  new_balance int;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN -1;
  END IF;

  -- Maintenance: reserve last 50 for admin (block at 1450 daily)
  SELECT count(*)::int INTO daily_count
  FROM resume_surgeon.request_log
  WHERE created_at > now() - interval '1 day';
  IF daily_count >= 1450 THEN
    RETURN -3;
  END IF;

  -- User throttle: 2 AI generations per minute per user
  SELECT count(*)::int INTO user_minute_count
  FROM resume_surgeon.request_log
  WHERE user_id = auth.uid() AND created_at > now() - interval '1 minute';
  IF user_minute_count >= 2 THEN
    RETURN -4;
  END IF;

  -- Global 15 RPM (Gemini free tier) - sliding window
  SELECT count(*)::int INTO minute_count
  FROM resume_surgeon.request_log
  WHERE created_at > now() - interval '1 minute';
  IF minute_count >= 15 THEN
    RETURN -2;
  END IF;

  INSERT INTO resume_surgeon.request_log (user_id, created_at) VALUES (auth.uid(), now());

  SELECT resume_surgeon.deduct_ai_credits(p_amount) INTO new_balance;
  RETURN COALESCE(new_balance, -1);
END;
$$;

GRANT EXECUTE ON FUNCTION resume_surgeon.process_ai_usage(int) TO authenticated;
GRANT EXECUTE ON FUNCTION resume_surgeon.process_ai_usage(int) TO service_role;
