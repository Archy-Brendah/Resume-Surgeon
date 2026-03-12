/**
 * Surgical Unit (SU) costs per action. Safe to import on client and server.
 * ai_credits in resume_surgeon.user_assets = SUs.
 */

export type SurgicalUnitAction =
  | "SHARPEN"
  | "POLISH_RESUME"
  | "MATCH"
  | "TAILOR"
  | "LINKEDIN"
  | "LINKEDIN_DM"
  | "COVER_LETTER"
  | "PROPOSAL_EVIDENCE"
  | "PROPOSAL_FREELANCE"
  | "PROPOSAL_FIRM"
  | "TENDER_COMPLIANCE"
  | "TENDER_READINESS"
  | "PRICING_MILESTONES"
  | "PROPOSAL_METHODOLOGY"
  | "INTERVIEW_PREP"
  | "RECRUITER_EYE"
  | "FOLLOW_UP"
  | "SURGICAL_AUTOFILL"
  | "PORTFOLIO_IMPORT"
  | "TENDER_METADATA"
  | "PROJECT_DESCRIPTION_ENHANCE";

/**
 * FEATURE_COSTS: unified Surgical Units (SUs) per feature.
 *
 * Proposal module:
 * - PROPOSAL_FREELANCE: 150 SU (scope and pain points).
 * - PROPOSAL_FIRM: 300 SU (brand colors, logo, Challenger-style strategy).
 *
 * STEALTH_TOGGLE (Humanize/Stealth ON): 20% multiplier applied in validateAndDeduct.
 */
export const SU_COSTS: Record<SurgicalUnitAction, number> = {
  SHARPEN: 10,
  POLISH_RESUME: 80,
  MATCH: 50,
  TAILOR: 100,
  LINKEDIN: 150,
  LINKEDIN_DM: 10,
  COVER_LETTER: 80,
  PROPOSAL_EVIDENCE: 30,
  PROPOSAL_FREELANCE: 150,
  PROPOSAL_FIRM: 300,
  TENDER_COMPLIANCE: 40,
  TENDER_READINESS: 50,
  PRICING_MILESTONES: 15,
  PROPOSAL_METHODOLOGY: 25,
  INTERVIEW_PREP: 200,
  RECRUITER_EYE: 10,
  FOLLOW_UP: 50,
  SURGICAL_AUTOFILL: 50,
  PORTFOLIO_IMPORT: 20,
  TENDER_METADATA: 15,
  PROJECT_DESCRIPTION_ENHANCE: 15,
};

export function getCost(action: SurgicalUnitAction): number {
  return SU_COSTS[action] ?? 1;
}
