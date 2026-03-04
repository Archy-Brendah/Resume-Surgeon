-- Bank-Grade: processed_webhook_events is write-only by backend (service_role).
-- Enable RLS so that if any role ever gets privilege, they still see no rows.
-- service_role bypasses RLS and can INSERT (used by webhook handler).
ALTER TABLE resume_surgeon.processed_webhook_events ENABLE ROW LEVEL SECURITY;

-- No permissive policies: anon and authenticated get no access.
-- Only service_role (webhook) can insert/select.
