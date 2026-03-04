/**
 * Surgical Unit (SU) costs per action. Safe to import on client and server.
 * ai_credits in resume_surgeon.user_assets = SUs.
 */

export type SurgicalUnitAction =
  | "SHARPEN"
  | "MATCH"
  | "TAILOR"
  | "LINKEDIN"
  | "LINKEDIN_DM"
  | "COVER_LETTER"
  | "PROPOSAL"
  | "INTERVIEW_PREP"
  | "RECRUITER_EYE"
  | "FOLLOW_UP";

export const SU_COSTS: Record<SurgicalUnitAction, number> = {
  SHARPEN: 1,
  MATCH: 2,
  TAILOR: 2,
  LINKEDIN: 5,
  LINKEDIN_DM: 2,
  COVER_LETTER: 5,
  PROPOSAL: 5,
  INTERVIEW_PREP: 5,
  RECRUITER_EYE: 2,
  FOLLOW_UP: 3,
};

export function getCost(action: SurgicalUnitAction): number {
  return SU_COSTS[action] ?? 1;
}
