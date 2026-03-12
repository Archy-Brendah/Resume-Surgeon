-- Resume Surgeon: global_api_limits table (1,500 daily guard), deduct_surgical_units RPC, get_global_guard().

-- 1) global_api_limits: daily limit for Global Guard (block when daily count >= daily_limit)
CREATE TABLE IF NOT EXISTS resume_surgeon.global_api_limits (
  id text PRIMARY KEY,
  daily_limit int NOT NULL DEFAULT 1500
);

INSERT INTO resume_surgeon.global_api_limits (id, daily_limit)
VALUES ('default', 1500)
ON CONFLICT (id) DO UPDATE SET daily_limit = EXCLUDED.daily_limit;

GRANT SELECT ON resume_surgeon.global_api_limits TO authenticated;
GRANT SELECT ON resume_surgeon.global_api_limits TO service_role;

-- 2) deduct_surgical_units(p_amount): deduct SU for current user (same semantics as deduct_ai_credits)
CREATE OR REPLACE FUNCTION resume_surgeon.deduct_surgical_units(p_amount int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = resume_surgeon
AS $$
DECLARE
  new_count int;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN -1;
  END IF;
  UPDATE resume_surgeon.user_assets
  SET ai_credits = ai_credits - p_amount, updated_at = now()
  WHERE user_id = auth.uid() AND ai_credits >= p_amount
  RETURNING ai_credits INTO new_count;
  RETURN COALESCE(new_count, -1);
END;
$$;

GRANT EXECUTE ON FUNCTION resume_surgeon.deduct_surgical_units(int) TO authenticated;
GRANT EXECUTE ON FUNCTION resume_surgeon.deduct_surgical_units(int) TO service_role;

-- 3) get_global_guard(): returns current daily count and configured daily limit (one round-trip for Global Guard)
CREATE OR REPLACE FUNCTION resume_surgeon.get_global_guard()
RETURNS TABLE(daily_count bigint, daily_limit int)
LANGUAGE sql
SECURITY DEFINER
SET search_path = resume_surgeon
AS $$
  SELECT
    (SELECT count(*) FROM resume_surgeon.request_log WHERE created_at > now() - interval '1 day'),
    (SELECT COALESCE((SELECT g.daily_limit FROM resume_surgeon.global_api_limits g WHERE g.id = 'default'), 1500));
$$;

GRANT EXECUTE ON FUNCTION resume_surgeon.get_global_guard() TO authenticated;
GRANT EXECUTE ON FUNCTION resume_surgeon.get_global_guard() TO service_role;
