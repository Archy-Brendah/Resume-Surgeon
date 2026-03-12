/**
 * Surgical Unit Refill calculator: KSH → SU with tiered rates.
 * Used by Refill Balance modal (live preview) and by Supabase RPC handle_surgical_topup.
 *
 * - < 500 KSH: 3.5 SU/KSH
 * - 500–999 KSH: 4.0 SU/KSH (15% Bonus)
 * - 1000–1999 KSH: 4.5 SU/KSH (30% Bonus)
 * - 2000+ KSH: 5.0 SU/KSH (Best Value)
 */

export type RefillTierBadge = "15% Bonus" | "30% Bonus" | "Best Value" | null;

export function getSuPerKsh(amountKsh: number): number {
  const k = Math.max(0, Math.floor(Number(amountKsh)));
  if (k >= 2000) return 5.0;
  if (k >= 1000) return 4.5;
  if (k >= 500) return 4.0;
  return 3.5;
}

export function computeSuFromKsh(amountKsh: number): number {
  const k = Math.max(0, Math.floor(Number(amountKsh)));
  const rate = getSuPerKsh(k);
  return Math.floor(k * rate);
}

export function getTierBadge(amountKsh: number): RefillTierBadge {
  const k = Math.max(0, Math.floor(Number(amountKsh)));
  if (k >= 2000) return "Best Value";
  if (k >= 1000) return "30% Bonus";
  if (k >= 500) return "15% Bonus";
  return null;
}
