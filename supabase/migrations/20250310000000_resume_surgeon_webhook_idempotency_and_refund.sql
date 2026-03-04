-- Resume Surgeon: Webhook idempotency + SU refund support.
-- 1) processed_webhook_events: prevents double-crediting when IntaSend sends payment.cleared twice.
-- 2) add_ai_credits: RPC to refund SUs when an AI call fails after deduction.

-- Idempotency: one row per processed payment (api_ref / checkout_id).
CREATE TABLE IF NOT EXISTS resume_surgeon.processed_webhook_events (
  idempotency_key text PRIMARY KEY,
  processed_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE resume_surgeon.processed_webhook_events IS 'Tracks processed IntaSend webhook events by api_ref to avoid double credits on duplicate delivery.';

-- Refund: add SUs back for the current user (e.g. when AI fails after deduct).
CREATE OR REPLACE FUNCTION resume_surgeon.add_ai_credits(amount int)
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
  SET ai_credits = ai_credits + amount, updated_at = now()
  WHERE user_id = auth.uid()
  RETURNING ai_credits INTO new_count;
  RETURN COALESCE(new_count, -1);
END;
$$;

GRANT EXECUTE ON FUNCTION resume_surgeon.add_ai_credits(int) TO authenticated;
