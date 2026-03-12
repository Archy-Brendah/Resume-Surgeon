/**
 * In-memory store for verified payment references.
 * In production, replace with Redis or DB.
 */
export type PurchaseTier = "single" | "career" | "closer" | "business" | "all_access" | "credits" | "refill_minor" | "refill_standard" | "refill_executive" | "surgical_refill";

type PendingRecord = {
  tier: PurchaseTier;
  verifiedAt: number;
  userId?: string;
  email?: string;
  name?: string;
};
const verifiedPayments = new Map<string, PendingRecord>();

/** Call when initiating payment so webhook can associate tx_ref with tier, userId (card → Supabase), and email/name (success email). */
export function setPaymentPending(
  reference: string,
  tier: PurchaseTier,
  userId?: string,
  email?: string,
  name?: string
): void {
  verifiedPayments.set(reference, { tier, verifiedAt: 0, userId, email, name });
}

export function setPaymentVerified(reference: string, tier: PurchaseTier): void {
  const existing = verifiedPayments.get(reference);
  verifiedPayments.set(reference, {
    tier,
    verifiedAt: Date.now(),
    userId: existing?.userId,
    email: existing?.email,
    name: existing?.name,
  });
}

export function getPaymentStatus(reference: string): { verified: true; tier: PurchaseTier } | { verified: false } {
  const entry = verifiedPayments.get(reference);
  if (!entry) return { verified: false };
  if (entry.verifiedAt === 0) return { verified: false };
  return { verified: true, tier: entry.tier };
}

/** Used by webhook to get tier for a pending ref. */
export function getPendingTier(reference: string): PurchaseTier | null {
  const entry = verifiedPayments.get(reference);
  return entry ? entry.tier : null;
}

/** Used by webhook to get userId for card payments (Supabase update). */
export function getPendingUserId(reference: string): string | null {
  const entry = verifiedPayments.get(reference);
  return entry?.userId ?? null;
}

/** Used by webhook to get recipient email for success email. */
export function getPendingEmail(reference: string): string | null {
  const entry = verifiedPayments.get(reference);
  return entry?.email ?? null;
}

/** Used by webhook to get recipient name for success email. */
export function getPendingName(reference: string): string | null {
  const entry = verifiedPayments.get(reference);
  return entry?.name ?? null;
}
