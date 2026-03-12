/**
 * User-facing feature names, short explanations, and SU costs. One place for labels shown in Refill modal and "All features" view.
 * Costs must match lib/su-costs.ts.
 */

import { SU_COSTS, type SurgicalUnitAction } from "./su-costs";

export type FeatureRow = {
  id: SurgicalUnitAction;
  label: string;
  /** Short, direct explanation so the user knows what the feature does and why they need it. */
  description: string;
  cost: number;
};

/** All features with display names and one-line explanations (no jargon). */
export const FEATURE_ROWS: FeatureRow[] = [
  { id: "SHARPEN", label: "Resume Sharpen", description: "Polish and tighten your resume wording so it reads clearly and hits keywords.", cost: SU_COSTS.SHARPEN },
  { id: "POLISH_RESUME", label: "Polish full resume", description: "Perfect every section—name, contact, experience, education, projects, certifications, skills—with the right keywords and professional structure.", cost: SU_COSTS.POLISH_RESUME },
  { id: "MATCH", label: "Resume–Job Match", description: "See how well your resume fits a job and get specific gaps to fix.", cost: SU_COSTS.MATCH },
  { id: "TAILOR", label: "Tailor Resume to Job", description: "Rewrite your resume so it targets one specific job description.", cost: SU_COSTS.TAILOR },
  { id: "COVER_LETTER", label: "Cover Letter", description: "Generate a cover letter that ties your experience to the role.", cost: SU_COSTS.COVER_LETTER },
  { id: "LINKEDIN", label: "LinkedIn Headlines & About", description: "Get a strong headline and About section that attract recruiters.", cost: SU_COSTS.LINKEDIN },
  { id: "LINKEDIN_DM", label: "LinkedIn DMs (3 variants)", description: "Short outreach messages for recruiter, peer, or hiring manager.", cost: SU_COSTS.LINKEDIN_DM },
  { id: "PROPOSAL_FREELANCE", label: "Proposal (Freelance)", description: "Draft a client proposal with scope, pain points, and pricing.", cost: SU_COSTS.PROPOSAL_FREELANCE },
  { id: "PROPOSAL_FIRM", label: "Proposal (Firm / Strategy)", description: "Full strategy-style proposal with brand, methodology, and investment.", cost: SU_COSTS.PROPOSAL_FIRM },
  { id: "INTERVIEW_PREP", label: "Interview Prep", description: "Practice questions and talking points tailored to the role.", cost: SU_COSTS.INTERVIEW_PREP },
  { id: "RECRUITER_EYE", label: "Recruiter Eye", description: "Simulate how a recruiter scores your resume and get improvement tips.", cost: SU_COSTS.RECRUITER_EYE },
  { id: "FOLLOW_UP", label: "Follow-up Emails (3)", description: "Three follow-up email variants after you apply: gentle, value-add, closing.", cost: SU_COSTS.FOLLOW_UP },
];

/** Short list for "What this buys you" examples: variety of low/mid/high cost. */
export const EXAMPLE_FEATURES = [
  { label: "Resume Sharpen", cost: SU_COSTS.SHARPEN },
  { label: "Polish full resume", cost: SU_COSTS.POLISH_RESUME },
  { label: "Resume–Job Match", cost: SU_COSTS.MATCH },
  { label: "Cover Letter", cost: SU_COSTS.COVER_LETTER },
  { label: "Proposal (Freelance)", cost: SU_COSTS.PROPOSAL_FREELANCE },
] as const;
