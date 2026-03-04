-- Resume Surgeon: Surgical Credits (ai_credits) to protect API costs
-- New users get 5 free credits; payment (999/1499/499) resets to 30.

ALTER TABLE resume_surgeon.user_assets
  ADD COLUMN IF NOT EXISTS ai_credits int NOT NULL DEFAULT 5;

-- Atomic deduct: only the owning user can call (auth.uid())
CREATE OR REPLACE FUNCTION resume_surgeon.deduct_ai_credit()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = resume_surgeon
AS $$
DECLARE
  new_count int;
BEGIN
  UPDATE resume_surgeon.user_assets
  SET ai_credits = GREATEST(0, ai_credits - 1), updated_at = now()
  WHERE user_id = auth.uid() AND ai_credits > 0
  RETURNING ai_credits INTO new_count;
  RETURN COALESCE(new_count, -1);
END;
$$;

GRANT EXECUTE ON FUNCTION resume_surgeon.deduct_ai_credit() TO authenticated;
