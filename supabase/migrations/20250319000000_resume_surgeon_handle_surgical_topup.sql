-- Surgical Unit Refill: variable-amount top-up using tiered SU/KSH rates.
-- Same tiers as lib/surgical-refill-calc.ts: <500=3.5, 500-999=4.0, 1000-1999=4.5, 2000+=5.0 SU/KSH.

CREATE OR REPLACE FUNCTION resume_surgeon.handle_surgical_topup(p_user_id uuid, p_amount_kes int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = resume_surgeon
AS $$
DECLARE
  su_to_add int;
  new_balance int;
BEGIN
  IF p_user_id IS NULL OR p_amount_kes IS NULL OR p_amount_kes <= 0 THEN
    RETURN -1;
  END IF;

  su_to_add := CASE
    WHEN p_amount_kes >= 2000 THEN FLOOR(p_amount_kes * 5.0)::int
    WHEN p_amount_kes >= 1000 THEN FLOOR(p_amount_kes * 4.5)::int
    WHEN p_amount_kes >= 500 THEN FLOOR(p_amount_kes * 4.0)::int
    ELSE FLOOR(p_amount_kes * 3.5)::int
  END;

  IF su_to_add <= 0 THEN
    RETURN -1;
  END IF;

  SELECT resume_surgeon.add_su_balance(p_user_id, su_to_add) INTO new_balance;
  RETURN COALESCE(new_balance, -1);
END;
$$;

GRANT EXECUTE ON FUNCTION resume_surgeon.handle_surgical_topup(uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION resume_surgeon.handle_surgical_topup(uuid, int) TO authenticated;
