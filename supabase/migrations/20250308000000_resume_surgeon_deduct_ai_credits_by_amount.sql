-- Resume Surgeon: Deduct Surgical Units (SU) by amount for variable-cost actions.
-- ai_credits column represents Surgical Units (SUs). This RPC deducts N units atomically.

CREATE OR REPLACE FUNCTION resume_surgeon.deduct_ai_credits(amount int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = resume_surgeon
AS $$
DECLARE
  new_count int;
BEGIN
  IF amount IS NULL OR amount <= 0 THEN
    RETURN -1;
  END IF;
  UPDATE resume_surgeon.user_assets
  SET ai_credits = ai_credits - amount, updated_at = now()
  WHERE user_id = auth.uid() AND ai_credits >= amount
  RETURNING ai_credits INTO new_count;
  RETURN COALESCE(new_count, -1);
END;
$$;

GRANT EXECUTE ON FUNCTION resume_surgeon.deduct_ai_credits(int) TO authenticated;
