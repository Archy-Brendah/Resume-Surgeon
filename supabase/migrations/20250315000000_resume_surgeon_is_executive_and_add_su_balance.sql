-- Resume Surgeon: is_executive (Executive Pass flag) and atomic add_su_balance RPC.
-- Run in Supabase SQL Editor or: supabase db push
--
-- is_executive: set to true when user buys Executive Pass (999 or 1499 KSH).
-- add_su_balance: atomic RPC to add SUs on top-up (prevents race conditions).

-- Add is_executive to user_assets if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'resume_surgeon' AND table_name = 'user_assets' AND column_name = 'is_executive'
  ) THEN
    ALTER TABLE resume_surgeon.user_assets ADD COLUMN is_executive boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Atomic add SU balance (used by webhook / refill). SECURITY DEFINER so service role can call with any user_id.
CREATE OR REPLACE FUNCTION resume_surgeon.add_su_balance(p_user_id uuid, p_amount int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = resume_surgeon
AS $$
DECLARE
  new_credits int;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN -1;
  END IF;
  UPDATE resume_surgeon.user_assets
  SET
    ai_credits = ai_credits + p_amount,
    total_credits_purchased = COALESCE(total_credits_purchased, 0) + p_amount,
    updated_at = now()
  WHERE user_id = p_user_id
  RETURNING ai_credits INTO new_credits;
  RETURN COALESCE(new_credits, -1);
END;
$$;

-- Allow service role (webhook) and authenticated (if ever needed) to call
GRANT EXECUTE ON FUNCTION resume_surgeon.add_su_balance(uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION resume_surgeon.add_su_balance(uuid, int) TO authenticated;
