-- Add checkout tracking columns to user_assets for payment flow and webhook fallback.
-- recordPaymentAttempt and getUserIdByCheckoutId (webhook) use these.

ALTER TABLE resume_surgeon.user_assets
  ADD COLUMN IF NOT EXISTS checkout_id text,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_status text;

COMMENT ON COLUMN resume_surgeon.user_assets.checkout_id IS 'Last IntaSend api_ref for this user; used by webhook to resolve userId when in-memory store is empty.';
COMMENT ON COLUMN resume_surgeon.user_assets.payment_method IS 'Last payment method (MPESA, CARD).';
COMMENT ON COLUMN resume_surgeon.user_assets.payment_status IS 'Last payment status (pending, completed).';

CREATE INDEX IF NOT EXISTS idx_user_assets_checkout_id ON resume_surgeon.user_assets(checkout_id) WHERE checkout_id IS NOT NULL;
