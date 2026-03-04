# Security & Flow

## Auth & session
- **Protected routes**: `/`, `/builder`, `/proposals` require a valid Supabase session; unauthenticated users are redirected to `/login`.
- **Public routes**: `/login`, `/signup`, `/view`, `/view/*` are accessible without auth.
- **ensure-user-asset**: Called on load when the user is logged in; creates a row in `resume_surgeon.user_assets` if missing (idempotent). Ensures every authenticated user has a profile before reading `is_paid` / `ai_credits`.
- **useSubscription**: Fetches session → ensure-user-asset → profile (is_paid, tier, ai_credits). Refetches profile on visibility change and on SIGNED_IN / TOKEN_REFRESHED. Handles getSession rejection so loading always resolves.

## Credits (Surgical Units)
- **Server-only**: `ai_credits` are never trusted from the client. All AI routes use `requireUnits(request, action)` which reads and deducts in the DB before running the AI.
- **Deduction order**: Deduct first (RPC `deduct_ai_credits`), then run AI. If the AI fails, the route should call `refundUnits(request, amount)` in the catch block.
- **402**: When credits are insufficient, APIs return 402 with `code: "CREDITS_REQUIRED"` so the client can show the Refill modal.

## Payment & webhook
- **Checkout**: Requires auth. Validates method (MPESA/CARD), amount (capped, sanitized), and sanitizes name/email. Stores pending payment in memory and in `user_assets.checkout_id` for webhook fallback.
- **Webhook** (`/api/webhooks/intasend`):
  - **Signature**: When `INTASEND_WEBHOOK_SECRET` is set, the request must send a matching value in `x-intasend-signature` or `Authorization`; otherwise 401.
  - **IP allowlist**: Optional `INTASEND_WEBHOOK_IP_ALLOWLIST` (comma-separated) restricts to allowed IPs.
  - **Idempotency**: `claimWebhookIdempotency(api_ref)` inserts into `processed_webhook_events`. Duplicate `api_ref` returns 200 without applying credits or is_paid again.
  - **UserId fallback**: If the in-memory store has no userId for `api_ref`, the webhook looks up `user_id` from `user_assets` where `checkout_id = api_ref` (service role) so payment can still be applied after a server restart.

## Input safety
- **AI routes**: Job descriptions and resume text are passed through `sanitizeForAI()` to limit length and strip prompt-injection / XSS patterns before sending to providers.
- **Short fields**: Names and similar inputs use `sanitizeShortField(value, maxLen)`.

## Rate limiting
- **Sharpen**: 10 requests per minute per user (in-memory). Other AI routes can use `checkRateLimit(userId, action, max)`; consider Upstash Redis for multi-instance production.
