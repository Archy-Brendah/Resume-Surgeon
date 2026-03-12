"use client";

import { Activity, ArrowLeftRight, Briefcase, Check, CheckCircle2, ChevronLeft, ChevronRight, Coins, Copy, Eye, FileText, HelpCircle, Linkedin, Link2, ListTodo, Loader2, Lock, LogOut, Mail, MessageCircle, Moon, PanelRightClose, PanelRightOpen, Plus, Scissors, Settings, Shield, Star, Trash2, Upload, User } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useReactToPrint } from "react-to-print";
import confetti from "canvas-confetti";
import { useSubscription } from "@/hooks/useSubscription";
import { getCost } from "@/lib/su-costs";
import { computeSuFromKsh, getTierBadge } from "@/lib/surgical-refill-calc";
import { FEATURE_ROWS, EXAMPLE_FEATURES } from "@/lib/feature-costs-display";
import { supabase } from "@/lib/supabase";
import { PaymentSuccess } from "@/components/PaymentSuccess";
import { ProjectProfile } from "@/components/ProjectProfile";
import { ProjectCaseStudy } from "@/components/ProjectCaseStudy";
import { TenderCompliance } from "@/components/TenderCompliance";
import { TenderScanner } from "@/components/TenderScanner";
import { ComplianceDashboard } from "@/components/ComplianceDashboard";
import { DEFAULT_DOCS, mergeMandatoryDocsWithDefaults, type MandatoryDoc } from "@/components/DocumentChecklist";
import { PricingTable, type PricingMilestone } from "@/components/PricingTable";
import type { PreliminaryCheckItem } from "@/app/actions/compliance";
import type { ComplianceMatrixRow } from "@/app/actions/generate-compliance-matrix";
import type { SurgicalMatrixRow } from "@/app/actions/matrix";
import { enhanceProjectForTender } from "@/app/actions/enhance-project-for-tender";
import { scanTender, type TenderRequirement } from "@/app/actions/scan-tender";
import { toast } from "sonner";

type SharpenState = "idle" | "sharpening" | "done" | "error";

type VitalSign = {
  label: string;
  status: "good" | "warning" | "bad";
};

type SurgicalAdvice = {
  title: string;
  body: string;
};

type ThemeId = "surgeon" | "partner" | "innovator";

type CoverLetterTone = "confident" | "professional" | "creative" | "humble";

type PurchaseTier = null | "single" | "career" | "closer" | "business" | "all_access" | "credits" | "refill_minor" | "refill_standard" | "refill_executive";
type ProposalTrack = "freelancer" | "firm";
type ProposalContentData = {
  executiveSummary: string;
  strategicDiagnosis: string;
  proprietaryProcess: string;
  timelineDeliverables: string;
  investment: string;
  riskMitigations?: { risk: string; response: string }[];
  costOfInaction?: string;
  successOutcome?: string;
  totalValueDelivered?: string;
  roadmapMilestones?: { discovery: string[]; surgery: string[]; postOp: string[] };
  technicalCompliance?: string;
  nextSteps?: string;
  projectKickoffChecklist?: string[];
};

type TimelinePhase = { phase: string; timeframe: string; deliverables: string };

const CRITICAL_DOC_PATTERNS = /kra|cr12|incorporation|business permit|nca|tax compliance/i;

function mandatoryDocsToChecklist(docs: MandatoryDoc[]): PreliminaryCheckItem[] {
  return docs.map((d) => {
    const hasDoc = Boolean(d.status);
    const expired = hasDoc && d.expiry_date && (() => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const exp = new Date(d.expiry_date);
      exp.setHours(0, 0, 0, 0);
      return exp < today;
    })();
    const status: "Found" | "Missing" | "Expired" = !hasDoc ? "Missing" : expired ? "Expired" : "Found";
    return {
      requirement: d.doc_name,
      status,
      critical: CRITICAL_DOC_PATTERNS.test(d.doc_name),
    };
  });
}

function getPowerSkillsSuggestions(role: string): string[] {
  const r = (role || "").toLowerCase();
  const map: { pattern: RegExp; skills: string[] }[] = [
    { pattern: /product|pm|manager/, skills: ["Stakeholder Management", "Roadmap Prioritization", "Cross-functional Leadership"] },
    { pattern: /engineer|developer|software/, skills: ["System Design", "Performance Optimization", "Code Review"] },
    { pattern: /design|ux|ui/, skills: ["User Research", "Design Systems", "Prototyping"] },
    { pattern: /data|analyst|science/, skills: ["Data Modeling", "SQL", "Visualization"] },
    { pattern: /marketing|growth/, skills: ["Campaign Strategy", "Conversion Optimization", "Brand Positioning"] },
    { pattern: /sales|business development/, skills: ["Pipeline Management", "Negotiation", "CRM"] },
    { pattern: /executive|ceo|vp|director/, skills: ["Strategic Planning", "Board Reporting", "P&L Ownership"] },
  ];
  for (const { pattern, skills } of map) {
    if (pattern.test(r)) return skills;
  }
  return ["Leadership", "Problem Solving", "Communication"];
}

function parseTimelinePhases(text: string): TimelinePhase[] {
  if (!text?.trim()) return [];
  const phases: TimelinePhase[] = [];
  const phaseBlockRegex = /Phase\s*(\d+)\s*[:\-]\s*([^\n|]+)(?:\s*\|\s*([^\n]+))?\s*\n([\s\S]*?)(?=Phase\s*\d+\s*[:\-]|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = phaseBlockRegex.exec(text)) !== null) {
    const phaseName = m[2].trim();
    const timeframe = (m[3] || "").trim();
    const bullets = (m[4] || "")
      .trim()
      .split(/\n+/)
      .map((line) => line.replace(/^[\s•\-*]+\s*/, "").trim())
      .filter(Boolean);
    phases.push({
      phase: phaseName,
      timeframe,
      deliverables: bullets.length ? bullets.join(" · ") : m[4].trim() || "—",
    });
  }
  if (phases.length > 0) return phases;
  const fallbackPhase = /^\s*(\d+)\.\s*([^\n]+)\s*\n([\s\S]*?)(?=\n\s*\d+\.\s*|$)/gm;
  while ((m = fallbackPhase.exec(text)) !== null) {
    const phaseName = m[2].trim();
    const block = (m[3] || "").trim();
    const timeframeMatch = block.match(/(?:^|\n)\s*[(\[]?(?:Weeks?\s*\d+[\s\-–]\d+|Week\s*\d+|Month\s*\d+|^\d+\s*weeks?|^\d+\s*months?)[)\]]?/i);
    const timeframe = timeframeMatch ? timeframeMatch[0].replace(/^\s*[(\[]|[)\]]\s*$/g, "").trim() : "";
    const deliverables = block
      .split(/\n+/)
      .map((line) => line.replace(/^[\s•\-*]+\s*/, "").trim())
      .filter((l) => l && !l.match(/^(Weeks?|Month)\s*\d+/i))
      .join(" · ") || block;
    phases.push({ phase: phaseName, timeframe, deliverables: deliverables || "—" });
  }
  return phases;
}

/** Bold percentages (e.g. 85%) and currency (e.g. Ksh 4.5M, $1.2M) for quick scan in Section II. */
function boldMetricsInText(text: string): ReactNode {
  if (!text || typeof text !== "string") return text;
  const regex = /(\d+(?:\.\d+)?%|Ksh\s*[\d,]+(?:\.\d+)?[KM]?|USD\s*[\d,]+(?:\.\d+)?[KM]?|\$[\d,]+(?:\.\d+)?[KM]?)/gi;
  const parts = text.split(regex);
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}

/** Parse 4-phase methodology (Phase 1: ... / Phase 2: ... with • bullets) for vertical timeline. */
function parseMethodologyPhases(text: string): { title: string; bullets: string[] }[] {
  if (!text?.trim()) return [];
  const phases: { title: string; bullets: string[] }[] = [];
  const phaseBlockRegex = /Phase\s*\d+\s*:\s*([^\n•-]+)\n([\s\S]*?)(?=Phase\s*\d+\s*:|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = phaseBlockRegex.exec(text)) !== null) {
    const title = m[1].trim();
    const block = (m[2] || "").trim();
    const bullets = block
      .split(/\n+/)
      .map((line) => line.replace(/^[\s•\-*]+\s*/, "").trim())
      .filter(Boolean);
    if (title) phases.push({ title, bullets });
  }
  if (phases.length >= 1) return phases;
  // Fallback: STRATEGY / EXECUTION / OPTIMIZATION / SUPPORT (legacy)
  const legacyRegex = /^(STRATEGY|EXECUTION|OPTIMIZATION|SUPPORT)(?:\s*:?\s*)?$/gim;
  const parts = text.split(legacyRegex).filter(Boolean);
  const legacyNames = [...text.matchAll(legacyRegex)].map((m) => (m[1] ?? m[0]).trim().replace(/:$/, ""));
  for (let i = 0; i < legacyNames.length; i++) {
    const body = (parts[i * 2 + 1] ?? "").trim();
    if (legacyNames[i] && body) phases.push({ title: legacyNames[i], bullets: [body] });
  }
  return phases;
}

function OperatingTable() {
  const [compare, setCompare] = useState(false);
  const [fullName, setFullName] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [email, setEmail] = useState("");
  const [experience, setExperience] = useState("");
  const [resumeUploadLoading, setResumeUploadLoading] = useState(false);
  const [resumeUploadError, setResumeUploadError] = useState<string | null>(null);
  const [skills, setSkills] = useState("");
  const [education, setEducation] = useState("");
  const [projects, setProjects] = useState("");
  const [certification, setCertification] = useState("");
  const [sharpened, setSharpened] = useState("");
  const [provider, setProvider] = useState<"gemini" | "groq" | null>(null);
  const [status, setStatus] = useState<SharpenState>("idle");
  const [polishResumeLoading, setPolishResumeLoading] = useState(false);
  const [polishResumeError, setPolishResumeError] = useState<string | null>(null);
  const [scanKey, setScanKey] = useState(0);
  const [showPaywall, setShowPaywall] = useState(false);
  const router = useRouter();
  const {
    user: subscriptionUser,
    session,
    isPaid: subscriptionPaid,
    tier: subscriptionTier,
    canAccessExecutivePdf,
    canAccessFirmProposal,
    refetchProfile,
    aiCredits,
    totalCreditsPurchased,
    isBetaTester,
    loading,
  } = useSubscription();

  /** Open Refill Modal on 402 or when RPC returns success: false with "Insufficient units" message. Beta users never see refill. */
  const openRefillIfInsufficient = useCallback(
    (res: Response, data: { code?: string; message?: string; error?: string; success?: boolean }) => {
      if (isBetaTester) return;
      if (res.status === 402 && data?.code === "CREDITS_REQUIRED") {
        setShowRefillModal(true);
        return;
      }
      const msg = (data?.message ?? data?.error ?? "").toLowerCase();
      if (data?.success === false && (msg.includes("insufficient units") || msg.includes("insufficient credits"))) {
        setShowRefillModal(true);
      }
    },
    [isBetaTester]
  );

  const [showRefillModal, setShowRefillModal] = useState(false);
  const [showFeatureCostsModal, setShowFeatureCostsModal] = useState(false);
  const [showSuppliesRestockedToast, setShowSuppliesRestockedToast] = useState(false);
  const [showSurgeryRechargedToast, setShowSurgeryRechargedToast] = useState(false);
  const [showPaymentSuccessModal, setShowPaymentSuccessModal] = useState(false);
  const [paymentSuccessBalance, setPaymentSuccessBalance] = useState<number | undefined>(undefined);
  const [showProposalRefillToast, setShowProposalRefillToast] = useState(false);
  const [pendingCreditTask, setPendingCreditTask] = useState<"proposal" | null>(null);
  const [refillKshInput, setRefillKshInput] = useState("");
  const [refillMpesaPhone, setRefillMpesaPhone] = useState("");
  const [refillPaymentLoading, setRefillPaymentLoading] = useState(false);
  const [refillPendingTxId, setRefillPendingTxId] = useState<string | null>(null);
  const [refillError, setRefillError] = useState<string | null>(null);
  const authHeaders: Record<string, string> = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};

  useEffect(() => {
    if (!showSuppliesRestockedToast) return;
    const t = setTimeout(() => setShowSuppliesRestockedToast(false), 3000);
    return () => clearTimeout(t);
  }, [showSuppliesRestockedToast]);

  useEffect(() => {
    if (!showSurgeryRechargedToast) return;
    const t = setTimeout(() => setShowSurgeryRechargedToast(false), 3500);
    return () => clearTimeout(t);
  }, [showSurgeryRechargedToast]);

  useEffect(() => {
    if (!showProposalRefillToast) return;
    const t = setTimeout(() => setShowProposalRefillToast(false), 4000);
    return () => clearTimeout(t);
  }, [showProposalRefillToast]);
  const [isPaid, setIsPaid] = useState(false);
  const [purchaseTier, setPurchaseTier] = useState<PurchaseTier>(null);
  const effectivePaid = subscriptionPaid || isPaid;
  /** Beta users get full access: themes, real document (no watermark/blur), all downloads. */
  const hasFullAccess = effectivePaid || isBetaTester;
  const canUseFirmProposal = canAccessFirmProposal || (isPaid && purchaseTier === "business") || isBetaTester;
  const canDownloadResume = canAccessExecutivePdf || (isPaid && (purchaseTier === "single" || purchaseTier === "career" || purchaseTier === "closer" || purchaseTier === "business" || purchaseTier === null));
  const canDownloadCoverLetter = canAccessExecutivePdf || (isPaid && (purchaseTier === "career" || purchaseTier === "closer" || purchaseTier === "business"));
  const canDownloadProposal = canAccessExecutivePdf || (isPaid && (purchaseTier === "closer" || purchaseTier === "business"));
  const canUseLinkedInExport = canAccessExecutivePdf || (isPaid && (purchaseTier === "career" || purchaseTier === "closer" || purchaseTier === "business"));
  const [checkoutTier, setCheckoutTier] = useState<PurchaseTier | null>(null);
  const [checkoutStep, setCheckoutStep] = useState<"tier" | "method" | "mpesa-phone" | "pending" | "divine">("tier");
  /** User-chosen Executive Pass price: 999 (early bird) or 1499 (standard). Used when both options are shown. */
  const [executivePassChosenPrice, setExecutivePassChosenPrice] = useState<999 | 1499 | null>(null);
  const [paymentTab, setPaymentTab] = useState<"mpesa" | "card">("mpesa");
  const [paymentMethod, setPaymentMethod] = useState<"card" | "mpesa" | null>(null);
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [pendingTxId, setPendingTxId] = useState<string | null>(null);
  const [showDivineSuccess, setShowDivineSuccess] = useState(false);
  const [paymentRedirectToBuilder, setPaymentRedirectToBuilder] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const previewRef = useRef<HTMLDivElement | null>(null);
  const coverRef = useRef<HTMLDivElement | null>(null);
  const proposalRef = useRef<HTMLDivElement | null>(null);
  const resumeUploadInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("openCheckout") === "1") {
      setShowPaywall(true);
      setCheckoutTier("all_access");
      setCheckoutStep("divine");
      window.history.replaceState({}, "", window.location.pathname + window.location.hash);
    }
    if (params.get("refill") === "credits" || params.get("refill") === "1") {
      setShowRefillModal(true);
      window.history.replaceState({}, "", window.location.pathname + window.location.hash);
    }
    const tab = params.get("tab");
    if (tab === "proposals") {
      setDashboardTab("proposals");
      window.history.replaceState({}, "", window.location.pathname + window.location.hash);
    }
  }, []);
  const hasShownRefillForZeroRef = useRef(false);
  useEffect(() => {
    if (aiCredits > 0) hasShownRefillForZeroRef.current = false;
    if (loading || !session || aiCredits > 0) return;
    if (hasShownRefillForZeroRef.current) return;
    hasShownRefillForZeroRef.current = true;
    setShowRefillModal(true);
  }, [session, aiCredits, loading]);

  const [dashboardTab, setDashboardTab] = useState<"resume" | "cover-letter" | "proposals" | "linkedin" | "followup" | "tracker" | "interview" | "share">("resume");
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  const [profilePanelTab, setProfilePanelTab] = useState<"profile" | "settings" | "guide">("profile");
  const [humanizeAI, setHumanizeAI] = useState(false);
  const [lowLightMode, setLowLightMode] = useState(false);
  const [coverLetterTone, setCoverLetterTone] = useState<CoverLetterTone>("professional");
  const [coverLetter, setCoverLetter] = useState("");
  const [coverLetterLoading, setCoverLetterLoading] = useState(false);
  const [lastCoverLetterKey, setLastCoverLetterKey] = useState<string | null>(null);
  const [syncToast, setSyncToast] = useState(false);

  const [proposalClientName, setProposalClientName] = useState("");
  const [proposalScope, setProposalScope] = useState("");
  const [proposalPainPoints, setProposalPainPoints] = useState("");
  const [proposalCaseStudies, setProposalCaseStudies] = useState("");
  const [proposalTrack, setProposalTrack] = useState<ProposalTrack>("freelancer");
  const [proposalToneOfVoice, setProposalToneOfVoice] = useState<"nairobi_tech_startup" | "government_ngo" | "international_client" | "non_tech_startup">("nairobi_tech_startup");
  const [proposalTeamSize, setProposalTeamSize] = useState("");
  const [proposalMethodology, setProposalMethodology] = useState("");
  const [proposalMission, setProposalMission] = useState("");
  const [proposalSuccessMetrics, setProposalSuccessMetrics] = useState("");
  const [proposalPricingMilestones, setProposalPricingMilestones] = useState<PricingMilestone[]>([
    { id: "1", task: "", timeline: "", cost: 0 },
  ]);
  const [proposalLogo, setProposalLogo] = useState<string | null>(null);
  const [proposalBrandColor, setProposalBrandColor] = useState<string>("#14b8a6");
  const handleProposalLogoUpload = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = (e.target as FileReader)?.result;
        if (typeof result === "string") setProposalLogo(result);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }, []);

  const proposalFirmHeaderBlock =
    proposalTrack === "firm" ? (
      <div className="flex flex-col items-end gap-2">
        <div className="flex flex-col items-end gap-1">
          <label className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Company Logo</label>
          <div className="flex items-center gap-2">
            {proposalLogo ? (
              <div className="h-8 w-8 rounded-full overflow-hidden border border-slate-200 bg-white/70 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={proposalLogo} alt="Company logo" className="h-full w-full object-cover" />
              </div>
            ) : null}
            <button
              type="button"
              onClick={handleProposalLogoUpload}
              className="rounded-full border border-amber-400/60 bg-amber-50/50 px-3 py-1.5 text-[10px] text-amber-700 hover:border-amber-500/70 hover:bg-amber-100/80"
            >
              {proposalLogo ? "Change Logo" : "Upload Logo"}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Brand Color</label>
          <input
            type="color"
            value={proposalBrandColor}
            onChange={(e) => setProposalBrandColor(e.target.value)}
            className="h-6 w-6 rounded-full border border-slate-300 bg-white/80 cursor-pointer"
            aria-label="Primary brand color"
          />
        </div>
      </div>
    ) : null;

  const [proposalTenderRef, setProposalTenderRef] = useState("");
  const [proposalTenderName, setProposalTenderName] = useState("");
  const [proposalSubmittedTo, setProposalSubmittedTo] = useState("");
  const [proposalDocumentType, setProposalDocumentType] = useState<"ORIGINAL" | "COPY">("ORIGINAL");
  const [proposalTenderMatches, setProposalTenderMatches] = useState<Array<{ requirement: string; matched_project: string; confidence: number; gap_fix: string; result?: string }>>([]);
  const [complianceMatrix, setComplianceMatrix] = useState<ComplianceMatrixRow[] | null>(null);
  const [surgicalMatrix, setSurgicalMatrix] = useState<SurgicalMatrixRow[] | null>(null);
  const [enhancedProjectDescriptions, setEnhancedProjectDescriptions] = useState<Record<string, string>>({});
  const [enhancingProjectNames, setEnhancingProjectNames] = useState<Set<string>>(new Set());
  const [proposalPortfolioMatches, setProposalPortfolioMatches] = useState<Array<{ requirement: string; status: string; evidence: string; suggested_fix: string; result?: string }>>([]);
  const [proposalReadinessData, setProposalReadinessData] = useState<PreliminaryCheckItem[]>([]);
  const [proposalVatInclusive, setProposalVatInclusive] = useState(false);
  const [firmProfileForProposal, setFirmProfileForProposal] = useState<{
    company_name: string;
    bio: string;
    core_services: string[];
    past_projects?: Array<{ title: string; client: string; year: string; results: string }>;
    methodology?: string;
    mission?: string;
    success_metrics?: string;
    team_size?: string;
    mandatory_docs?: Array<{ doc_name: string; status: boolean; expiry_date: string | null }>;
  } | null>(null);
  const [proposalContent, setProposalContent] = useState<ProposalContentData | null>(null);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [proposalEvidenceLoading, setProposalEvidenceLoading] = useState(false);
  const [proposalMethodologyLoading, setProposalMethodologyLoading] = useState(false);
  const [proposalTenderPdfImporting, setProposalTenderPdfImporting] = useState(false);
  const proposalTenderPdfRef = useRef<HTMLInputElement>(null);
  const [proposalTenderRequirements, setProposalTenderRequirements] = useState<TenderRequirement[]>([]);
  const [proposalTenderText, setProposalTenderText] = useState("");
  const [proposalStep, setProposalStep] = useState(0);
  const [proposalPreviewPage, setProposalPreviewPage] = useState(0);
  const [showProposalPreview, setShowProposalPreview] = useState(false);
  const [proposalsHistory, setProposalsHistory] = useState<Array<{ id: string; title: string; client_name?: string; tender_ref?: string; track: string; created_at: string }>>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [lastTenderCached, setLastTenderCached] = useState<{ tender_data: { metadata?: Record<string, string>; requirements?: TenderRequirement[]; tenderText?: string }; tender_ref?: string } | null>(null);
  const [followUpCompanyName, setFollowUpCompanyName] = useState("");
  const [followUpEmails, setFollowUpEmails] = useState<{ gentleCheckIn: string; valueAdd: string; closeTheLoop: string } | null>(null);
  const [followUpLoading, setFollowUpLoading] = useState(false);
  type ApplicationStatus = "Applied" | "Interview" | "Offer" | "Rejected";
  type ApplicationEntry = { id: string; company_name: string; job_title: string; date_applied: string; status: ApplicationStatus; link?: string | null };
  const [operationsList, setOperationsList] = useState<ApplicationEntry[]>([]);
  const [operationsLoaded, setOperationsLoaded] = useState(false);
  const [operationsFromDb, setOperationsFromDb] = useState(false);
  const [trackerNewCompany, setTrackerNewCompany] = useState("");
  const [trackerNewTitle, setTrackerNewTitle] = useState("");
  const [trackerNewLink, setTrackerNewLink] = useState("");
  const [trackerNewDate, setTrackerNewDate] = useState("");
  const [trackerNewStatus, setTrackerNewStatus] = useState<ApplicationStatus>("Applied");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setTrackerNewDate(new Date().toISOString().slice(0, 10));
  }, []);

  useEffect(() => {
    if (!session?.access_token) {
      setOperationsFromDb(false);
      if (typeof window !== "undefined") {
        try {
          const s = localStorage.getItem("resume-surgeon-operations");
          setOperationsList(s ? (JSON.parse(s) as ApplicationEntry[]) : []);
        } catch {
          setOperationsList([]);
        }
      } else setOperationsList([]);
      setOperationsLoaded(true);
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/applications", { headers: { Authorization: `Bearer ${session.access_token}` } });
        if (res.ok) {
          const { applications } = await res.json();
          setOperationsList(Array.isArray(applications) ? applications : []);
          setOperationsFromDb(true);
        } else {
          const s = typeof window !== "undefined" ? localStorage.getItem("resume-surgeon-operations") : null;
          setOperationsList(s ? (JSON.parse(s) as ApplicationEntry[]) : []);
          setOperationsFromDb(false);
        }
      } catch {
        const s = typeof window !== "undefined" ? localStorage.getItem("resume-surgeon-operations") : null;
        setOperationsList(s ? (JSON.parse(s) as ApplicationEntry[]) : []);
        setOperationsFromDb(false);
      }
      setOperationsLoaded(true);
    })();
  }, [session?.access_token]);

  /** Surgical Cleanup: delete tender_cache rows older than 24h on sign-in to stay under DB limits */
  useEffect(() => {
    const userId = session?.user?.id ?? subscriptionUser?.id;
    if (!userId) return;
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    supabase
      .schema("resume_surgeon")
      .from("tender_cache")
      .delete()
      .eq("user_id", userId)
      .lt("created_at", cutoff)
      .then(({ error }) => {
        if (error) console.warn("[tender_cache] cleanup:", error.message);
      });
  }, [session?.user?.id, subscriptionUser?.id]);

  useEffect(() => {
    setProposalStep(0);
  }, [proposalTrack]);

  useEffect(() => {
    if (dashboardTab !== "proposals" || !proposalRef.current) return;
    const pages = proposalRef.current.querySelectorAll(".proposal-print-page");
    const target = pages[proposalPreviewPage];
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [proposalPreviewPage, dashboardTab]);

  const refetchFirmProfile = useCallback(async () => {
    if (!subscriptionUser?.id) return;
    try {
      const db = supabase.schema("resume_surgeon");
      let data: Record<string, unknown> | null = null;
      let err: { message?: string } | null = null;
      const { data: fullData, error: fullError } = await db
        .from("firm_profiles")
        .select("company_name, bio, core_services, past_projects, methodology, mission, success_metrics, team_size, mandatory_docs")
        .eq("user_id", subscriptionUser.id)
        .maybeSingle();
      if (fullError) {
        const { data: fallbackData, error: fallbackError } = await db
          .from("firm_profiles")
          .select("company_name, bio, core_services, past_projects, mandatory_docs")
          .eq("user_id", subscriptionUser.id)
          .maybeSingle();
        data = fallbackData as Record<string, unknown> | null;
        err = fallbackError;
      } else {
        data = fullData as Record<string, unknown> | null;
      }
      if (!err && data) {
        const raw = (data.past_projects as unknown) ?? [];
        const past_projects = Array.isArray(raw)
          ? raw
            .filter((p): p is Record<string, unknown> => p != null && typeof p === "object")
            .map((p) => ({
              title: String((p as { title?: string }).title ?? ""),
              client: String((p as { client?: string }).client ?? ""),
              year: String((p as { year?: string }).year ?? ""),
              results: String((p as { results?: string }).results ?? ""),
            }))
            .filter((p) => p.title || p.client || p.results)
          : undefined;
        const rawMandatory = data.mandatory_docs;
        const mandatory_docs = Array.isArray(rawMandatory)
          ? rawMandatory
            .filter((d): d is Record<string, unknown> => d != null && typeof d === "object" && typeof (d as { doc_name?: string }).doc_name === "string")
            .map((d) => ({
              doc_name: String((d as { doc_name?: string }).doc_name ?? "").trim(),
              status: Boolean((d as { status?: boolean }).status),
              expiry_date: (d as { expiry_date?: string | null }).expiry_date && typeof (d as { expiry_date?: string }).expiry_date === "string"
                ? (d as { expiry_date: string }).expiry_date
                : null,
            }))
            .filter((d) => d.doc_name)
          : undefined;
        setFirmProfileForProposal({
          company_name: (data.company_name as string) || "",
          bio: (data.bio as string) || "",
          core_services: Array.isArray(data.core_services) ? (data.core_services as string[]) : [],
          past_projects: past_projects && past_projects.length > 0 ? past_projects : undefined,
          methodology: (data.methodology as string) || undefined,
          mission: (data.mission as string) || undefined,
          success_metrics: (data.success_metrics as string) || undefined,
          team_size: (data.team_size as string) || undefined,
          mandatory_docs: mandatory_docs && mandatory_docs.length > 0 ? mandatory_docs : undefined,
        });
      } else {
        setFirmProfileForProposal(null);
      }
    } catch {
      setFirmProfileForProposal(null);
    }
  }, [subscriptionUser?.id]);

  useEffect(() => {
    if (proposalTrack !== "firm" || !subscriptionUser?.id) return;
    refetchFirmProfile();
  }, [proposalTrack, subscriptionUser?.id, refetchFirmProfile]);

  useEffect(() => {
    if (proposalTrack !== "firm" || !firmProfileForProposal) return;
    setProposalMethodology((prev) => (prev.trim() ? prev : (firmProfileForProposal.methodology ?? "")));
    setProposalMission((prev) => (prev.trim() ? prev : (firmProfileForProposal.mission ?? "")));
    setProposalSuccessMetrics((prev) => (prev.trim() ? prev : (firmProfileForProposal.success_metrics ?? "")));
    setProposalTeamSize((prev) => (prev.trim() ? prev : (firmProfileForProposal.team_size ?? "")));
  }, [proposalTrack, firmProfileForProposal]);

  const refetchProposals = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch("/api/proposals", { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (res.ok) {
        const { proposals } = (await res.json()) as { proposals: Array<{ id: string; title: string; client_name?: string; tender_ref?: string; track: string; created_at: string }> };
        setProposalsHistory(proposals ?? []);
      }
    } catch {
      // ignore
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (dashboardTab === "proposals" && session?.access_token) {
      refetchProposals();
      fetch("/api/tender-cache", { headers: { Authorization: `Bearer ${session.access_token}` } })
        .then((r) => r.ok ? r.json() : null)
        .then((j) => {
          if (j?.tender) setLastTenderCached({ tender_data: j.tender.tender_data, tender_ref: j.tender.tender_ref });
          else setLastTenderCached(null);
        })
        .catch(() => setLastTenderCached(null));
    } else {
      setLastTenderCached(null);
    }
  }, [dashboardTab, session?.access_token, refetchProposals]);

  const handleLoadProposalFromHistory = useCallback(
    async (id: string) => {
      if (!session?.access_token) return;
      try {
        const res = await fetch(`/api/proposals/${id}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
        if (!res.ok) return;
        const { snapshot, track } = (await res.json()) as {
          snapshot: {
            content: ProposalContentData;
            pricingMilestones: PricingMilestone[];
            tenderMatches: Array<{ requirement: string; matched_project: string; confidence: number; gap_fix: string; result?: string }>;
            complianceMatrix?: ComplianceMatrixRow[] | null;
            surgicalMatrix?: SurgicalMatrixRow[] | null;
            enhancedProjectDescriptions?: Record<string, string>;
            portfolioMatches: Array<{ requirement: string; status: string; evidence: string; suggested_fix: string; result?: string }>;
            readinessData: PreliminaryCheckItem[];
            cover: { tenderRef?: string; tenderName?: string; submittedTo?: string; clientName?: string; companyName?: string; logo?: string; documentType?: string };
            vatInclusive?: boolean;
            toneOfVoice?: string;
            brandColor?: string;
          };
          track: string;
        };
        const s = snapshot;
        if (!s?.content) return;
        setProposalTrack(track === "freelancer" ? "freelancer" : "firm");
        setProposalContent(s.content);
        setProposalPricingMilestones(s.pricingMilestones ?? []);
        setProposalTenderMatches(s.tenderMatches ?? []);
        setComplianceMatrix(s.complianceMatrix ?? null);
        setSurgicalMatrix(s.surgicalMatrix ?? null);
        setEnhancedProjectDescriptions(s.enhancedProjectDescriptions ?? {});
        setProposalPortfolioMatches(s.portfolioMatches ?? []);
        setProposalReadinessData(s.readinessData ?? []);
        if (s.cover) {
          setProposalTenderRef(s.cover.tenderRef ?? "");
          setProposalTenderName(s.cover.tenderName ?? "");
          setProposalSubmittedTo(s.cover.submittedTo ?? "");
          setProposalClientName(s.cover.clientName ?? "");
          setProposalLogo(s.cover.logo ?? null);
          setProposalDocumentType((s.cover.documentType as "ORIGINAL" | "COPY") || "ORIGINAL");
        }
        setProposalVatInclusive(s.vatInclusive ?? false);
        if (s.brandColor) setProposalBrandColor(s.brandColor);
        setProposalStep(track === "firm" ? 4 : 3);
        setDashboardTab("proposals");
        toast.success("Proposal loaded. You can now download it.");
      } catch {
        toast.error("Failed to load proposal.");
      }
    },
    [session?.access_token]
  );

  // AI-enhance project descriptions for the current tender (Section II: Surgical Pivot for all past_projects).
  const tenderRequirementsForEnhance = useMemo(() => {
    if (surgicalMatrix?.length) return surgicalMatrix.map((r) => r.requirement);
    if (complianceMatrix?.length) return complianceMatrix.map((r) => r.requirement);
    return [];
  }, [surgicalMatrix, complianceMatrix]);

  useEffect(() => {
    if (!tenderRequirementsForEnhance.length || !firmProfileForProposal?.past_projects?.length || !session) return;
    const pastProjects = firmProfileForProposal.past_projects;
    pastProjects.forEach((past) => {
      const ref = (past.title || "").trim() || "Project";
      if (enhancedProjectDescriptions[ref] || enhancingProjectNames.has(ref)) return;
      if (!past.results?.trim()) return;
      setEnhancingProjectNames((prev) => new Set(prev).add(ref));
      enhanceProjectForTender({
        title: past.title || ref,
        client: past.client || "—",
        year: past.year || "—",
        results: past.results,
        requirements: tenderRequirementsForEnhance,
      })
        .then((res) => {
          if (res.success) {
            setEnhancedProjectDescriptions((prev) => ({ ...prev, [ref]: res.description }));
          }
          setEnhancingProjectNames((prev) => {
            const next = new Set(prev);
            next.delete(ref);
            return next;
          });
        })
        .catch(() => {
          setEnhancingProjectNames((prev) => {
            const next = new Set(prev);
            next.delete(ref);
            return next;
          });
        });
    });
  }, [tenderRequirementsForEnhance, firmProfileForProposal?.past_projects, session?.access_token]);

  const proposalFirmCapabilityText = useMemo(() => {
    if (!firmProfileForProposal) return "";
    const p = firmProfileForProposal;
    const parts: string[] = [];
    if (p.company_name) parts.push(`Company: ${p.company_name}`);
    if (p.bio) parts.push(`About: ${p.bio}`);
    if (p.core_services?.length) parts.push(`Core services: ${p.core_services.join(", ")}`);
    if (p.past_projects?.length) {
      parts.push("Past projects:");
      p.past_projects.forEach((proj) => {
        parts.push(`- ${proj.title || "Project"} | ${proj.client || "Client"} | ${proj.year || "—"}`);
        if (proj.results) parts.push(`  Results: ${proj.results}`);
      });
    }
    if (p.methodology) parts.push(`Methodology: ${p.methodology}`);
    if (p.mission) parts.push(`Mission: ${p.mission}`);
    if (p.success_metrics) parts.push(`Success metrics: ${p.success_metrics}`);
    if (p.team_size) parts.push(`Team size: ${p.team_size}`);
    return parts.join("\n\n");
  }, [firmProfileForProposal]);

  useEffect(() => {
    if (!operationsFromDb && typeof window !== "undefined") {
      try {
        localStorage.setItem("resume-surgeon-operations", JSON.stringify(operationsList));
      } catch {}
    }
  }, [operationsFromDb, operationsList]);

  useEffect(() => {
    if (showPaywall) {
      fetch("/api/pricing")
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data && typeof data.price === "number") {
            setLivePricing({
              price: data.price,
              isEarlyBird: Boolean(data.isEarlyBird),
              slotsRemaining: Number(data.slotsRemaining) ?? 0,
              standardPrice: Number(data.standardPrice) ?? 1499,
            });
          } else {
            setLivePricing({ price: 999, isEarlyBird: true, slotsRemaining: 100, standardPrice: 1499 });
          }
        })
        .catch(() => setLivePricing({ price: 999, isEarlyBird: true, slotsRemaining: 100, standardPrice: 1499 }));
    }
  }, [showPaywall]);

  const [linkedinCurrentRole, setLinkedinCurrentRole] = useState("");
  const [linkedinCareerGoals, setLinkedinCareerGoals] = useState("");
  const [linkedinContent, setLinkedinContent] = useState<{
    headlines: string[];
    about: string;
    topSkills: string[];
    featuredStrategy: string;
    featuredProjects: string[];
  } | null>(null);
  const [linkedinLoading, setLinkedinLoading] = useState(false);
  const [linkedinSelectedHeadline, setLinkedinSelectedHeadline] = useState(0);
  const [linkedinDm, setLinkedinDm] = useState<{ recruiter: string; peer: string; hiringManager: string } | null>(null);
  const [linkedinDmLoading, setLinkedinDmLoading] = useState(false);
  const [lastLinkedInKey, setLastLinkedInKey] = useState<string | null>(null);
  const [lastLinkedInDmKey, setLastLinkedInDmKey] = useState<string | null>(null);
  const [bannerPatternSeed, setBannerPatternSeed] = useState(0);
  type InterviewPrepData = {
    questions: { category: string; question: string; winningAnswer: string; trap: string; motive: string; strategy: string }[];
    elevatorPitch: string;
  };
  const [interviewPrep, setInterviewPrep] = useState<InterviewPrepData | null>(null);
  const [interviewPrepLoading, setInterviewPrepLoading] = useState(false);
  const [interviewPracticeMode, setInterviewPracticeMode] = useState(false);
  const [interviewOpenIndex, setInterviewOpenIndex] = useState<number | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [sharePublicVisibility, setSharePublicVisibility] = useState(false);
  type LivePricing = { price: number; isEarlyBird: boolean; slotsRemaining: number; standardPrice: number };
  const [livePricing, setLivePricing] = useState<LivePricing | null>(null);
  const linkedinBannerRef = useRef<HTMLDivElement | null>(null);
  const linkedinBannerCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [syncingToast, setSyncingToast] = useState(false);
  const prevStatusRef = useRef<SharpenState>("idle");
  const [showSuccessPulse, setShowSuccessPulse] = useState(false);
  const prevScoreRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const h = localStorage.getItem("rs_humanize");
      const l = localStorage.getItem("rs_low_light");
      if (h === "1") setHumanizeAI(true);
      if (l === "1") setLowLightMode(true);
    } catch {}
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("rs_humanize", humanizeAI ? "1" : "0");
      localStorage.setItem("rs_low_light", lowLightMode ? "1" : "0");
    } catch {}
  }, [humanizeAI, lowLightMode]);

  const [score, setScore] = useState(0);
  const [vitalSigns, setVitalSigns] = useState<VitalSign[]>([]);
  const [advice, setAdvice] = useState<SurgicalAdvice[]>([]);
  const [touchedTitle, setTouchedTitle] = useState(false);
  const [touchedEmail, setTouchedEmail] = useState(false);
  const [jobDescription, setJobDescription] = useState("");
  const [showJobDescription, setShowJobDescription] = useState(false);
  const [matchRate, setMatchRate] = useState<number | null>(null);
  const [missingKeywords, setMissingKeywords] = useState<string[]>([]);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [theme, setTheme] = useState<ThemeId>("surgeon");
  const [previewTab, setPreviewTab] = useState<"preview" | "simulation">("preview");
  const [recruiterImpression, setRecruiterImpression] = useState<string | null>(null);
  const [recruiterVibeSummary, setRecruiterVibeSummary] = useState<string | null>(null);
  const [recruiterQuestions, setRecruiterQuestions] = useState<string[]>([]);
  const [recruiterLoading, setRecruiterLoading] = useState(false);
  const [recruiterFetched, setRecruiterFetched] = useState(false);
  const [surgicalStep, setSurgicalStep] = useState(0);
  const [resumeFormStep, setResumeFormStep] = useState(1);
  const [showResumePreview, setShowResumePreview] = useState(false);
  const [displayedSharpened, setDisplayedSharpened] = useState("");
  const [showGlimmer, setShowGlimmer] = useState(false);
  const [profileUrl, setProfileUrl] = useState("");
  const [linkStatus, setLinkStatus] = useState<"idle" | "checking" | "valid" | "invalid" | "suggested">("idle");
  const [cleanLinkSuggestion, setCleanLinkSuggestion] = useState<string | null>(null);

  useEffect(() => {
    const sourceText = `${experience}\n${sharpened}`.trim();
    const wordCount = sourceText ? sourceText.split(/\s+/).length : 0;

    const actionVerbs = [
      "led",
      "managed",
      "increased",
      "reduced",
      "optimized",
      "launched",
      "implemented",
      "delivered",
      "improved",
      "drove",
    ];
    const lower = sourceText.toLowerCase();
    const verbHits = actionVerbs.reduce(
      (acc, verb) => (lower.includes(verb) ? acc + 1 : acc),
      0,
    );

    const sentences = sourceText
      .split(/[.!?]\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const avgSentenceLength =
      sentences.length > 0
        ? sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0) /
          sentences.length
        : 0;

    let s = 50;
    if (wordCount > 40 && wordCount < 300) s += 20;
    else if (wordCount >= 300 && wordCount < 600) s += 10;

    if (verbHits >= 4) s += 20;
    else if (verbHits >= 2) s += 10;

    if (avgSentenceLength > 0 && avgSentenceLength <= 24) s += 10;
    else if (avgSentenceLength > 32) s -= 10;

    if (!email || !targetRole) s -= 10;

    const finalScore = Math.max(0, Math.min(100, Math.round(s)));
    setScore(finalScore);

    const vitals: VitalSign[] = [];
    vitals.push({
      label: email && email.includes("@") ? "Contact info detected" : "Contact email missing",
      status: email && email.includes("@") ? "good" : "bad",
    });
    const hasMetrics = /[\d%]/.test(sourceText);
    vitals.push({
      label: hasMetrics ? "Quantifiable impact present" : "Missing quantifiable data",
      status: hasMetrics ? "good" : "warning",
    });
    const hasSummary = skills.trim().length > 0;
    vitals.push({
      label: hasSummary ? "Skills summary present" : "Skills summary light",
      status: hasSummary ? "good" : "warning",
    });
    if (avgSentenceLength > 32) {
      vitals.push({
        label: "Some sentences are very long – consider tightening",
        status: "warning",
      });
    } else if (avgSentenceLength > 0) {
      vitals.push({
        label: "Sentence clarity within healthy range",
        status: "good",
      });
    }
    setVitalSigns(vitals);

    const recs: SurgicalAdvice[] = [];
    if (!hasMetrics) {
      recs.push({
        title: "Doctor's Note: Add metrics",
        body: "Your experience section lacks quantifiable results. Add percentages, revenue, or time saved to showcase impact.",
      });
    }
    if (verbHits < 3) {
      recs.push({
        title: "Doctor's Note: Stronger verbs",
        body: "Replace passive phrasing with action verbs like “led”, “optimized”, or “delivered” to signal leadership.",
      });
    }
    if (avgSentenceLength > 30) {
      recs.push({
        title: "Doctor's Note: Tighten clarity",
        body: "Several bullets are running long. Break them into shorter, scannable statements for recruiter speed-reading.",
      });
    }
    if (!email || !targetRole) {
      recs.push({
        title: "Doctor's Note: Complete vital info",
        body: "Ensure your target role and professional email are filled so your executive PDF is ready to send immediately.",
      });
    }
    if (recs.length === 0) {
      recs.push({
        title: "Doctor's Note: Healthy baseline",
        body: "Your resume reads clean and impact-driven. Consider tailoring bullets even more tightly to your target role.",
      });
    }
    setAdvice(recs.slice(0, 3));
  }, [experience, sharpened, skills, email, targetRole]);

  useEffect(() => {
    const jd = jobDescription.trim().toLowerCase();
    const resumeText = `${experience}\n${sharpened}`.trim().toLowerCase();

    if (!jd) {
      setMatchRate(null);
      setMissingKeywords([]);
      return;
    }

    const stopwords = new Set([
      "and",
      "the",
      "for",
      "with",
      "that",
      "this",
      "from",
      "your",
      "will",
      "have",
      "work",
      "team",
      "role",
      "you",
      "our",
      "are",
      "job",
      "description",
    ]);

    const tokens = jd
      .replace(/[^a-z0-9+ ]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 4 && !stopwords.has(t));

    const uniqueKeywords = Array.from(new Set(tokens));
    if (uniqueKeywords.length === 0) {
      setMatchRate(null);
      setMissingKeywords([]);
      return;
    }

    const present: string[] = [];
    const missing: string[] = [];

    for (const keyword of uniqueKeywords) {
      const pattern = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (pattern.test(resumeText)) {
        present.push(keyword);
      } else {
        missing.push(keyword);
      }
    }

    const rate = Math.round((present.length / uniqueKeywords.length) * 100);
    setMatchRate(Math.max(0, Math.min(100, rate)));
    setMissingKeywords(missing.slice(0, 8));

    if (rate >= 90) {
      setShowSuccessToast(true);
      const timeout = setTimeout(() => setShowSuccessToast(false), 3000);
      return () => clearTimeout(timeout);
    }
  }, [jobDescription, experience, sharpened]);

  const handleSharpen = useCallback(async () => {
    if (!experience.trim()) return;

    setStatus("sharpening");
    setProvider(null);
    setScanKey((k) => k + 1);
    setDisplayedSharpened("");
    setShowGlimmer(false);
    setSurgicalStep(0);

    const steps = [
      "Generating Executive Summary...",
      "Injecting Quantifiable Metrics...",
      "Optimizing for ATS Parsers...",
      "Final Polishing...",
    ];
    const stepInterval = setInterval(() => {
      setSurgicalStep((s) => (s < 3 ? s + 1 : s));
    }, 500);

    try {
      const res = await fetch("/api/sharpen", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ text: experience, jobDescription, humanize: humanizeAI }),
      });

      clearInterval(stepInterval);
      setSurgicalStep(4);

      const data = (await res.json()) as {
        result?: string;
        provider?: "gemini" | "groq";
        code?: string;
      };

      openRefillIfInsufficient(res, data);
      if (res.status === 402) {
        setSurgicalStep(0);
        return;
      }
      if (!res.ok) throw new Error("Sharpen request failed");
      if (!data.result) throw new Error("Empty response from AI");

      setSharpened(data.result.trim());
      if (data.provider) {
        setProvider(data.provider);
      }
      setStatus("done");
      setPreviewTab("preview"); // Show full resume so user can review and download
      refetchProfile();
    } catch (err) {
      clearInterval(stepInterval);
      setSurgicalStep(0);
      console.error(err);
      setStatus("error");
    }
  }, [experience, jobDescription, refetchProfile]);

  const hasResumeContent =
    [fullName, email, targetRole, experience, education, projects, certification, skills].some((s) => typeof s === "string" && s.trim().length > 0);

  const handlePolishFullResume = useCallback(async () => {
    if (!hasResumeContent) return;
    setPolishResumeError(null);
    setPolishResumeLoading(true);
    setStatus("sharpening");
    setScanKey((k) => k + 1);
    try {
      const res = await fetch("/api/polish-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          fullName: fullName || undefined,
          email: email || undefined,
          profileUrl: profileUrl || undefined,
          targetRole: targetRole || undefined,
          experience: (sharpened || experience) || undefined,
          education: education || undefined,
          projects: projects || undefined,
          certification: certification || undefined,
          skills: skills || undefined,
          jobDescription: jobDescription || undefined,
          humanize: humanizeAI,
        }),
      });
      const data = (await res.json()) as {
        formattedName?: string;
        email?: string;
        profileUrl?: string;
        targetRole?: string;
        experienceBullets?: string;
        education?: string;
        projects?: string;
        certifications?: string;
        skills?: string;
        error?: string;
      };
      openRefillIfInsufficient(res, data);
      if (res.status === 402) {
        setPolishResumeLoading(false);
        setStatus("idle");
        return;
      }
      if (!res.ok) {
        const errMsg = (data as { error?: string })?.error || "Polish failed.";
        setPolishResumeError(errMsg);
        throw new Error(errMsg);
      }
      if (data.formattedName !== undefined) setFullName(data.formattedName);
      if (data.email !== undefined) setEmail(data.email);
      if (data.profileUrl !== undefined) setProfileUrl(data.profileUrl);
      if (data.targetRole !== undefined) setTargetRole(data.targetRole);
      if (data.experienceBullets !== undefined) setSharpened(data.experienceBullets.trim());
      if (data.education !== undefined) setEducation(data.education);
      if (data.projects !== undefined) setProjects(data.projects);
      if (data.certifications !== undefined) setCertification(data.certifications);
      if (data.skills !== undefined) setSkills(data.skills);
      setStatus("done");
      setPreviewTab("preview");
      refetchProfile();
    } catch (err) {
      console.error(err);
      setStatus("error");
      setPolishResumeError(err instanceof Error ? err.message : "Failed to polish resume. Please try again.");
    } finally {
      setPolishResumeLoading(false);
    }
  }, [
    hasResumeContent,
    fullName,
    email,
    profileUrl,
    targetRole,
    sharpened,
    experience,
    education,
    projects,
    certification,
    skills,
    jobDescription,
    humanizeAI,
    authHeaders,
    openRefillIfInsufficient,
    refetchProfile,
  ]);

  useEffect(() => {
    const t = setTimeout(() => setSyncingToast(false), 1500);
    return () => clearTimeout(t);
  }, [syncingToast]);

  useEffect(() => {
    if (prevScoreRef.current < 100 && score === 100) {
      setShowSuccessPulse(true);
      const t = setTimeout(() => setShowSuccessPulse(false), 3500);
      return () => clearTimeout(t);
    }
    prevScoreRef.current = score;
  }, [score]);

  const startPollingPaymentStatus = useCallback((reference: string, redirectToBuilder = false) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    const pollInterval = 3000;
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/payment/status?reference=${encodeURIComponent(reference)}`);
        const data = await res.json();
        if (data.verified && data.tier) {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          const isRefill = data.tier === "refill_minor" || data.tier === "refill_standard" || data.tier === "refill_executive";
          const isSurgicalRefill = data.tier === "surgical_refill";
          setIsPaid(true);
          setPurchaseTier(data.tier);
          setShowPaywall(false);
          setCheckoutTier(null);
          setExecutivePassChosenPrice(null);
          setCheckoutStep("tier");
          setPaymentMethod(null);
          setPendingTxId(null);
          setRefillPendingTxId(null);
          setPaymentError(null);
          setPaymentRedirectToBuilder(false);
          if (typeof window !== "undefined" && window.history.replaceState) {
            const u = new URL(window.location.href);
            u.searchParams.delete("payment_ref");
            window.history.replaceState({}, "", u.pathname + u.search);
          }
          refetchProfile();
          if (isSurgicalRefill) {
            setShowRefillModal(false);
            setShowSurgeryRechargedToast(true);
            try {
              confetti({ particleCount: 100, spread: 70, origin: { y: 0.8 } });
              confetti({ particleCount: 60, angle: 60, spread: 55, origin: { x: 0 } });
              confetti({ particleCount: 60, angle: 120, spread: 55, origin: { x: 1 } });
            } catch (_) {}
          } else if (isRefill) {
            setShowSuppliesRestockedToast(true);
          }
          if (redirectToBuilder) {
            setShowDivineSuccess(true);
            try {
              confetti({ particleCount: 120, spread: 70, origin: { y: 0.7 } });
              confetti({ particleCount: 80, angle: 60, spread: 55, origin: { x: 0 } });
              confetti({ particleCount: 80, angle: 120, spread: 55, origin: { x: 1 } });
            } catch (_) {}
            setTimeout(() => {
              setShowDivineSuccess(false);
              window.location.href = "/builder";
            }, 2200);
          }
        }
      } catch {
        // keep polling
      }
    }, pollInterval);
  }, [refetchProfile]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("payment_ref");
    if (ref) {
      setPendingTxId(ref);
      startPollingPaymentStatus(ref);
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [startPollingPaymentStatus]);

  useEffect(() => {
    if (!pendingTxId || checkoutStep !== "pending") return;
    startPollingPaymentStatus(pendingTxId, paymentRedirectToBuilder);
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [pendingTxId, checkoutStep, paymentRedirectToBuilder, startPollingPaymentStatus]);

  const refillPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!refillPendingTxId?.trim()) return;
    refillPollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/payment/status?reference=${encodeURIComponent(refillPendingTxId)}`);
        const data = await res.json();
        if (data.verified && data.tier === "surgical_refill") {
          if (refillPollingRef.current) {
            clearInterval(refillPollingRef.current);
            refillPollingRef.current = null;
          }
          setRefillPendingTxId(null);
          setShowRefillModal(false);
          refetchProfile().then(() => {
            setShowPaymentSuccessModal(true);
            setPaymentSuccessBalance(undefined);
          });
          setShowSurgeryRechargedToast(true);
          try {
            confetti({ particleCount: 100, spread: 70, origin: { y: 0.8 } });
            confetti({ particleCount: 60, angle: 60, spread: 55, origin: { x: 0 } });
            confetti({ particleCount: 60, angle: 120, spread: 55, origin: { x: 1 } });
          } catch (_) {}
        }
      } catch {
        // keep polling
      }
    }, 3000);
    return () => {
      if (refillPollingRef.current) {
        clearInterval(refillPollingRef.current);
        refillPollingRef.current = null;
      }
    };
  }, [refillPendingTxId, refetchProfile]);

  useEffect(() => {
    if (prevStatusRef.current === "sharpening" && status === "done") {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.1);
      } catch (_) {}
    }
    prevStatusRef.current = status;
  }, [status]);

  const linkedinInitialNameRef = useRef(true);
  useEffect(() => {
    if (linkedinInitialNameRef.current) {
      if (fullName.trim()) linkedinInitialNameRef.current = false;
      return;
    }
    if (fullName.trim()) setSyncingToast(true);
  }, [fullName]);

  useEffect(() => {
    if (!sharpened) {
      setDisplayedSharpened("");
      setShowGlimmer(false);
      return;
    }
    setDisplayedSharpened("");
    const chars = sharpened.split("");
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setDisplayedSharpened(chars.slice(0, i).join(""));
      if (i >= chars.length) {
        clearInterval(t);
        setShowGlimmer(true);
        const off = setTimeout(() => setShowGlimmer(false), 700);
        return () => clearTimeout(off);
      }
    }, 18);
    return () => clearInterval(t);
  }, [sharpened]);

  const handleCheckLink = useCallback(async () => {
    const raw = profileUrl.trim();
    if (!raw) {
      setLinkStatus("idle");
      setCleanLinkSuggestion(null);
      return;
    }
    setLinkStatus("checking");
    setCleanLinkSuggestion(null);
    try {
      const res = await fetch(
        `/api/link-surgeon?url=${encodeURIComponent(raw)}`
      );
      const data = (await res.json()) as {
        valid?: boolean;
        cleanUrl?: string;
        suggestion?: string;
      };
      if (data.valid) {
        setLinkStatus("valid");
        setCleanLinkSuggestion(data.cleanUrl || data.suggestion || null);
      } else if (data.cleanUrl || data.suggestion) {
        setLinkStatus("suggested");
        setCleanLinkSuggestion(data.cleanUrl || data.suggestion || null);
      } else {
        setLinkStatus("invalid");
        setCleanLinkSuggestion(null);
      }
    } catch {
      setLinkStatus("invalid");
      setCleanLinkSuggestion(null);
    }
  }, [profileUrl]);

  const handlePrint = useReactToPrint({
    contentRef: previewRef,
    documentTitle: fullName ? `${fullName} – Executive Resume` : "Executive Resume",
    pageStyle: `
      @page { size: A4; margin: 0; }
      body { margin: 0; }
    `,
  });

  const handleDownloadPdf = useCallback(() => {
    if (!canDownloadResume) {
      setShowPaywall(true);
      return;
    }
    // Resume print content is only in DOM when Resume tab is active; switch to it first if needed
    if (!previewRef.current) {
      setDashboardTab("resume");
      setPreviewTab("preview");
      const tryPrint = (attempt = 0) => {
        const delay = attempt === 0 ? 400 : 600;
        setTimeout(() => {
          if (previewRef.current && typeof handlePrint === "function") {
            try {
              handlePrint();
            } catch {
              // no-op; library may log "nothing to print" if content still not ready
            }
          } else if (attempt < 1) {
            tryPrint(attempt + 1);
          }
        }, delay);
      };
      tryPrint();
      return;
    }
    try {
      handlePrint();
    } catch {
      // avoid unhandled rejection
    }
  }, [canDownloadResume, handlePrint]);

  const handlePrintProposal = useReactToPrint({
    contentRef: proposalRef,
    documentTitle: proposalTrack === "firm" && firmProfileForProposal?.company_name
      ? `${firmProfileForProposal.company_name} – Tender ${proposalTenderRef || "Proposal"}`
      : fullName ? `${fullName} – Proposal for ${proposalClientName || "Client"}` : "Executive Proposal",
    pageStyle: `
      @page { size: A4; margin: 0.75in 0.75in 1.1in 0.75in; }
      body, html { margin: 0; background: #ffffff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .proposal-print-wrapper {
        background: #ffffff !important;
        border: none !important;
        box-shadow: none !important;
        max-height: none !important;
        height: auto !important;
        overflow: visible !important;
      }
      .proposal-print-page, .tender-doc-page, .proposal-cover { border: none !important; box-shadow: none !important; border-radius: 0 !important; background: #ffffff !important; }
      .resume-paper, .theme-innovator .resume-paper { background: #ffffff !important; }
      .proposal-print-wrapper table thead tr, .proposal-print-wrapper .bg-slate-100 { background: #ffffff !important; }
      .proposal-print-wrapper .proposal-section, .proposal-print-wrapper .proposal-cta { background: #ffffff !important; border: none !important; box-shadow: none !important; }
      /* Let the browser paginate Section II and other pages naturally to avoid empty sheets. Serial numbering is handled by the footer DOM (.proposal-page-number). */
    `,
  });

  const handleDownloadProposalPdf = useCallback(() => {
    if (!canDownloadProposal) {
      setShowPaywall(true);
      return;
    }
    if (!proposalContent) {
      setDashboardTab("proposals");
      setProposalError("Generate a proposal first, then download.");
      return;
    }
    // Proposal print content only exists in DOM on the Proposals tab (and when preview is shown)
    if (!proposalRef.current) {
      setDashboardTab("proposals");
      setShowProposalPreview(true); // ensure preview is mounted for print
      const tryPrint = (attempt = 0) => {
        const delay = attempt === 0 ? 400 : 600;
        setTimeout(() => {
          if (proposalRef.current && typeof handlePrintProposal === "function") {
            try {
              handlePrintProposal();
            } catch {
              // no-op; library may log "nothing to print" if content still not ready
            }
          } else if (attempt < 1) {
            tryPrint(attempt + 1);
          }
        }, delay);
      };
      tryPrint();
      return;
    }
    try {
      handlePrintProposal?.();
    } catch {
      // avoid unhandled rejection
    }
  }, [canDownloadProposal, handlePrintProposal, proposalContent]);

  const handleRecruiterEye = useCallback(async () => {
    setRecruiterLoading(true);
    setRecruiterFetched(false);
    try {
      const res = await fetch("/api/recruiter-eye", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          fullName: fullName || undefined,
          targetRole: targetRole || undefined,
          experience: experience || undefined,
          sharpened: sharpened || undefined,
          skills: skills || undefined,
          humanize: humanizeAI,
        }),
      });
      const data = (await res.json()) as {
        sixSecondImpression?: string;
        vibeSummary?: string;
        hardQuestions?: string[];
        code?: string;
      };
      openRefillIfInsufficient(res, data);
      if (res.status === 402) {
        setRecruiterFetched(true);
        return;
      }
      if (!res.ok) throw new Error("Recruiter eye failed");
      setRecruiterImpression(data.sixSecondImpression ?? null);
      setRecruiterVibeSummary(data.vibeSummary ?? null);
      setRecruiterQuestions(Array.isArray(data.hardQuestions) ? data.hardQuestions : []);
      setRecruiterFetched(true);
      refetchProfile();
    } catch (err) {
      console.error(err);
      setRecruiterImpression("Simulation unavailable. Try again.");
      setRecruiterQuestions([]);
      setRecruiterFetched(true);
    } finally {
      setRecruiterLoading(false);
    }
  }, [fullName, targetRole, experience, sharpened, skills, authHeaders]);

  const handlePrintCoverLetter = useReactToPrint({
    contentRef: coverRef,
    documentTitle: fullName ? `${fullName} – Cover Letter` : "Cover Letter",
    pageStyle: `
      @page { size: A4; margin: 0; }
      body { margin: 0; }
    `,
  });

  const handleGenerateCoverLetter = useCallback(async () => {
    const resumeBlock = [
      fullName && `Name: ${fullName}`,
      targetRole && `Target role: ${targetRole}`,
      (sharpened || experience) && `Experience:\n${(sharpened || experience).trim()}`,
      education?.trim() && `Education:\n${education.trim()}`,
      projects?.trim() && `Projects:\n${projects.trim()}`,
      certification?.trim() && `Certifications:\n${certification.trim()}`,
      skills?.trim() && `Skills: ${skills.trim()}`,
    ].filter(Boolean).join("\n\n");
    const jd = jobDescription || "";
    const key = [
      resumeBlock,
      jd,
      coverLetterTone,
      fullName || "",
      targetRole || "",
      skills || "",
      humanizeAI ? "humanize" : "raw",
    ].join("||");
    if (key && key === lastCoverLetterKey && coverLetter.trim()) {
      return;
    }
    setCoverLetterLoading(true);
    try {
      const res = await fetch("/api/cover-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          sharpenedResume: resumeBlock,
          jobDescription: jd || undefined,
          tone: coverLetterTone,
          fullName: fullName || undefined,
          targetRole: targetRole || undefined,
          skills: skills || undefined,
          humanize: humanizeAI,
        }),
      });
      const data = (await res.json()) as { coverLetter?: string; code?: string; message?: string; error?: string; success?: boolean };
      openRefillIfInsufficient(res, data);
      if (res.status === 402) return;
      if (res.status === 401) {
        setCoverLetter("");
        return;
      }
      if (!res.ok) throw new Error(data?.error || "Cover letter failed");
      const text = data.coverLetter?.trim() ?? "";
      setCoverLetter(text);
      setLastCoverLetterKey(key || null);
      refetchProfile();
    } catch (err) {
      console.error(err);
      setCoverLetter("Unable to generate. Try again.");
    } finally {
      setCoverLetterLoading(false);
    }
  }, [sharpened, experience, jobDescription, coverLetterTone, fullName, targetRole, skills, education, projects, certification, humanizeAI, coverLetter, lastCoverLetterKey, authHeaders, openRefillIfInsufficient, refetchProfile]);

  const handleSyncWithResume = useCallback(() => {
    setSyncToast(true);
    const t = setTimeout(() => setSyncToast(false), 2500);
    return () => clearTimeout(t);
  }, []);

  const handleImportCaseStudies = useCallback(() => {
    setProposalCaseStudies(sharpened || experience || "");
  }, [sharpened, experience]);

  const evidenceCost = getCost("PROPOSAL_EVIDENCE");
  const insufficientEvidenceSu = !isBetaTester && aiCredits < evidenceCost;
  const handleAutoInjectEvidence = useCallback(async () => {
    if (!session) {
      setProposalError("Sign in required.");
      return;
    }
    if (insufficientEvidenceSu) {
      setShowProposalRefillToast(true);
      setShowRefillModal(true);
      return;
    }
    const jobDesc = proposalScope.trim() || proposalPainPoints.trim();
    const exp = (sharpened || experience || "").trim();
    const proj = (projects || "").trim();
    if (!jobDesc || (!exp && !proj)) {
      setProposalError("Add project scope and resume experience or projects first.");
      return;
    }
    setProposalError(null);
    setProposalEvidenceLoading(true);
    try {
      const res = await fetch("/api/proposal/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          jobDescription: jobDesc,
          resumeData: { experience: exp || undefined, projects: proj || undefined },
        }),
      });
      const data = (await res.json()) as { evidence?: string; error?: string; code?: string; message?: string };
      openRefillIfInsufficient(res, data);
      if (res.status === 402) return;
      if (!res.ok) {
        setProposalError(data?.error || "Failed to generate evidence. Try again.");
        return;
      }
      const evidence = (data?.evidence ?? "").trim();
      if (!evidence) {
        setProposalError("No evidence generated. Try again.");
        return;
      }
      setProposalCaseStudies((prev) => (prev ? `${prev}\n\n${evidence}` : evidence));
      refetchProfile();
    } catch (err) {
      console.error(err);
      setProposalError(err instanceof Error ? err.message : "Failed to inject evidence.");
    } finally {
      setProposalEvidenceLoading(false);
    }
  }, [session, proposalScope, proposalPainPoints, sharpened, experience, projects, insufficientEvidenceSu, authHeaders, openRefillIfInsufficient, refetchProfile]);

  const requiredProposalSu = proposalTrack === "firm" ? getCost("PROPOSAL_FIRM") : getCost("PROPOSAL_FREELANCE");
  const insufficientProposalSu = !isBetaTester && aiCredits < requiredProposalSu;
  const requiredMethodologySu = getCost("PROPOSAL_METHODOLOGY");
  const insufficientMethodologySu = !isBetaTester && aiCredits < requiredMethodologySu;

  const handleGenerateMethodology = useCallback(async () => {
    if (!session) {
      setProposalError("Sign in required.");
      return;
    }
    if (insufficientMethodologySu) {
      setShowProposalRefillToast(true);
      setShowRefillModal(true);
      return;
    }
    const jobDesc = (proposalScope || proposalPainPoints || proposalTenderName || "").trim();
    if (!jobDesc || jobDesc.length < 20) {
      setProposalError("Add project scope, tender name, or pain points (at least 20 characters) to generate methodology.");
      return;
    }
    setProposalError(null);
    setProposalMethodologyLoading(true);
    try {
      const industryLabel =
        proposalToneOfVoice === "government_ngo"
          ? "Government / NGO"
          : proposalToneOfVoice === "international_client"
            ? "International / Corporate"
            : proposalToneOfVoice === "non_tech_startup"
              ? "Operations / Non-Tech"
              : "Technology / Startup";
      const res = await fetch("/api/proposal/methodology", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          jobDescription: jobDesc,
          tenderTitle: proposalTenderName?.trim() || undefined,
          industry: industryLabel,
        }),
      });
      const data = (await res.json()) as { methodology?: string; error?: string; code?: string; creditsRemaining?: number };
      openRefillIfInsufficient(res, data);
      if (res.status === 402) return;
      if (!res.ok) {
        setProposalError(data?.error || "Failed to generate methodology. Try again.");
        return;
      }
      const methodology = (data?.methodology ?? "").trim();
      if (!methodology) {
        setProposalError("No methodology generated. Try again.");
        return;
      }
      setProposalContent((prev) =>
        prev
          ? { ...prev, proprietaryProcess: methodology }
          : {
              executiveSummary: "",
              strategicDiagnosis: "",
              proprietaryProcess: methodology,
              timelineDeliverables: "",
              investment: "",
            }
      );
      refetchProfile();
    } catch (err) {
      console.error(err);
      setProposalError(err instanceof Error ? err.message : "Failed to generate methodology.");
    } finally {
      setProposalMethodologyLoading(false);
    }
  }, [session, proposalScope, proposalPainPoints, proposalTenderName, proposalToneOfVoice, insufficientMethodologySu, authHeaders, openRefillIfInsufficient, refetchProfile]);

  const tenderMetadataCost = getCost("TENDER_METADATA");
  const insufficientTenderMetadataSu = !isBetaTester && aiCredits < tenderMetadataCost;

  const handleProposalTenderPdf = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || file.type !== "application/pdf") {
        toast.error("Please select a PDF file.");
        e.target.value = "";
        return;
      }
      const MAX_SIZE = 8 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        toast.error("File too large. Please upload a PDF under 8MB.");
        e.target.value = "";
        return;
      }
      if (!session?.access_token) {
        toast.error("Sign in required.");
        e.target.value = "";
        return;
      }
      if (insufficientTenderMetadataSu) {
        setShowProposalRefillToast(true);
        setShowRefillModal(true);
        e.target.value = "";
        return;
      }
      setProposalTenderPdfImporting(true);
      setProposalError(null);
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch("/api/tender-metadata", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: formData,
        });
        const data = (await res.json()) as {
          tender_reference?: string;
          tender_name?: string;
          submitted_to?: string;
          scope_summary?: string;
          client_name?: string;
          methodology?: string;
          mission?: string;
          success_metrics?: string;
          team_size?: string;
          error?: string;
          code?: string;
        };
        openRefillIfInsufficient(res, data);
        if (res.ok && !data.error) {
          if (data.tender_reference) setProposalTenderRef(data.tender_reference);
          if (data.tender_name) setProposalTenderName(data.tender_name);
          if (data.submitted_to) setProposalSubmittedTo(data.submitted_to);
          if (data.scope_summary) setProposalScope((prev) => (prev ? `${prev}\n\n${data.scope_summary}` : (data.scope_summary ?? "")));
          setProposalClientName((prev) => (prev.trim() ? prev : (data.client_name || data.submitted_to || "")));
          setProposalMethodology((prev) => (prev.trim() ? prev : (data.methodology || "")));
          setProposalMission((prev) => (prev.trim() ? prev : (data.mission || "")));
          setProposalSuccessMetrics((prev) => (prev.trim() ? prev : (data.success_metrics || "")));
          setProposalTeamSize((prev) => (prev.trim() ? prev : (data.team_size || "")));
          const scanFormData = new FormData();
          scanFormData.append("file", file);
          const scanResult = await scanTender(scanFormData);
          if (scanResult.success) {
            setProposalTenderRequirements(scanResult.requirements);
            setProposalTenderText(scanResult.tenderText ?? "");
          }
          toast.success("Tender details and requirements extracted. Use Tender Scanner in Step 2.");
          refetchProfile();
          if (session?.access_token) {
            try {
              await fetch("/api/tender-cache", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({
                  source: "pdf",
                  tender_ref: data.tender_reference ?? proposalTenderRef,
                  tender_data: {
                    metadata: {
                      tender_reference: data.tender_reference,
                      tender_name: data.tender_name,
                      submitted_to: data.submitted_to,
                      scope_summary: data.scope_summary,
                      client_name: data.client_name,
                      methodology: data.methodology,
                      mission: data.mission,
                      success_metrics: data.success_metrics,
                      team_size: data.team_size,
                    },
                    requirements: scanResult.success ? scanResult.requirements : [],
                    tenderText: scanResult.success ? scanResult.tenderText : "",
                  },
                }),
              });
            } catch {
              // non-blocking; cache save failed
            }
          }
        } else {
          const errMsg = res.status === 402 || data.code === "CREDITS_REQUIRED" ? "Insufficient credits. Top up to use Auto-Fill." : (data.error ?? "Auto-fill failed.");
          setProposalError(errMsg);
          toast.error(errMsg);
        }
      } catch (err) {
        setProposalError(err instanceof Error ? err.message : "Auto-fill failed.");
        toast.error("Auto-fill failed. Try again or enter manually.");
      } finally {
        setProposalTenderPdfImporting(false);
        e.target.value = "";
      }
    },
    [session?.access_token, insufficientTenderMetadataSu, openRefillIfInsufficient, refetchProfile]
  );

  const handleGenerateProposal = useCallback(async () => {
    if (insufficientProposalSu) {
      setShowProposalRefillToast(true);
      setPendingCreditTask("proposal");
      setShowRefillModal(true);
      return;
    }
    const useFirm = proposalTrack === "firm" && canUseFirmProposal;
    setProposalError(null);
    setProposalLoading(true);
    try {
      const res = await fetch("/api/proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          type: useFirm ? "firm" : "freelancer",
          clientName: proposalClientName || undefined,
          projectScope: proposalScope || undefined,
          painPoints: proposalPainPoints || undefined,
          pricing: (() => {
            const total = proposalPricingMilestones.reduce((sum, i) => sum + (Number.isFinite(i.cost) ? i.cost : 0), 0);
            if (total > 0) {
              const sym = proposalToneOfVoice === "international_client" ? "$" : "Ksh ";
              const fmt = sym + total.toLocaleString(sym === "$" ? "en-US" : "en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
              return `Total: ${fmt} (see Schedule of Rates)`;
            }
            return undefined;
          })(),
          skills: skills || undefined,
          caseStudies: useFirm && !proposalCaseStudies?.trim() && firmProfileForProposal?.past_projects?.length
            ? firmProfileForProposal.past_projects
                .map((p) => `• ${p.title || "Project"} (${p.client || "Client"}, ${p.year || "—"}): ${p.results || ""}`)
                .join("\n")
            : proposalCaseStudies || sharpened || experience || undefined,
          fullName: fullName || undefined,
          companyName: useFirm ? (firmProfileForProposal?.company_name || undefined) : undefined,
          teamSize: useFirm ? proposalTeamSize || undefined : undefined,
          methodology: useFirm ? proposalMethodology || undefined : undefined,
          firmIdentity: useFirm ? (firmProfileForProposal?.core_services?.length ? firmProfileForProposal.core_services.join(", ") : undefined) : undefined,
          mission: useFirm ? proposalMission || undefined : undefined,
          successMetrics: useFirm ? proposalSuccessMetrics || undefined : undefined,
          strategyTone: useFirm ? (proposalToneOfVoice === "nairobi_tech_startup" ? "bold" : "conservative") : undefined,
          toneOfVoice: proposalToneOfVoice,
          humanize: humanizeAI,
          tenderRef: useFirm ? proposalTenderRef || undefined : undefined,
          tenderName: useFirm ? proposalTenderName || undefined : undefined,
          submittedTo: useFirm ? proposalSubmittedTo || undefined : undefined,
        }),
      });
      const data = (await res.json()) as ProposalContentData & {
        code?: string;
        message?: string;
        error?: string;
        success?: boolean;
        riskMitigations?: { risk: string; response: string }[];
        projectKickoffChecklist?: string[];
      };
      openRefillIfInsufficient(res, data);
      if (res.status === 402) return;
      if (res.status === 401) {
        setProposalError("Sign in required to generate a proposal.");
        return;
      }
      if (!res.ok) {
        setProposalError((data as { error?: string })?.error || "Proposal failed. Try again.");
        throw new Error((data as { error?: string })?.error || "Proposal failed");
      }
      const mergedContent: ProposalContentData = {
        executiveSummary: data.executiveSummary ?? "",
        strategicDiagnosis: data.strategicDiagnosis ?? "",
        proprietaryProcess: data.proprietaryProcess ?? "",
        timelineDeliverables: data.timelineDeliverables ?? "",
        investment: data.investment ?? "",
        riskMitigations: data.riskMitigations,
        costOfInaction: data.costOfInaction,
        successOutcome: data.successOutcome,
        totalValueDelivered: data.totalValueDelivered,
        roadmapMilestones: data.roadmapMilestones,
        nextSteps: data.nextSteps,
        projectKickoffChecklist: data.projectKickoffChecklist,
        technicalCompliance: proposalContent?.technicalCompliance,
      };
      setProposalContent(mergedContent);
      refetchProfile();
      if (session?.access_token) {
        const title = useFirm && proposalTenderRef
          ? `Tender ${proposalTenderRef}`
          : proposalClientName
            ? `Proposal for ${proposalClientName}`
            : "Executive Proposal";
        const snapshot = {
          content: mergedContent,
          pricingMilestones: proposalPricingMilestones,
          tenderMatches: proposalTenderMatches,
          complianceMatrix: complianceMatrix ?? null,
          surgicalMatrix: surgicalMatrix ?? null,
          enhancedProjectDescriptions: enhancedProjectDescriptions,
          portfolioMatches: proposalPortfolioMatches,
          readinessData: proposalReadinessData,
          cover: {
            tenderRef: proposalTenderRef,
            tenderName: proposalTenderName,
            submittedTo: proposalSubmittedTo,
            clientName: proposalClientName,
            companyName: firmProfileForProposal?.company_name,
            logo: proposalLogo,
            documentType: proposalDocumentType,
          },
          vatInclusive: proposalVatInclusive,
          toneOfVoice: proposalToneOfVoice,
          brandColor: proposalBrandColor,
        };
        try {
          const saveRes = await fetch("/api/proposals", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders },
            body: JSON.stringify({
              title,
              client_name: proposalClientName || undefined,
              tender_ref: proposalTenderRef || undefined,
              tender_name: proposalTenderName || undefined,
              track: useFirm ? "firm" : "freelancer",
              snapshot,
            }),
          });
          if (saveRes.ok) {
            const saved = (await saveRes.json()) as { id?: string; created_at?: string };
            setProposalsHistory((prev) => [
              { id: saved.id ?? "", title, client_name: proposalClientName, tender_ref: proposalTenderRef, track: useFirm ? "firm" : "freelancer", created_at: saved.created_at ?? new Date().toISOString() },
              ...prev,
            ]);
          }
        } catch {
          // non-blocking
        }
      }
    } catch (err) {
      console.error(err);
      setProposalError(err instanceof Error ? err.message : "Unable to generate. Try again.");
    } finally {
      setProposalLoading(false);
    }
  }, [proposalTrack, canUseFirmProposal, proposalClientName, proposalScope, proposalPainPoints, proposalCaseStudies, sharpened, experience, skills, fullName, firmProfileForProposal, proposalTeamSize, proposalMethodology, proposalMission, proposalSuccessMetrics, proposalToneOfVoice, proposalTenderRef, proposalTenderName, proposalSubmittedTo, proposalPricingMilestones, proposalTenderMatches, complianceMatrix, surgicalMatrix, enhancedProjectDescriptions, proposalPortfolioMatches, proposalReadinessData, proposalLogo, proposalDocumentType, proposalVatInclusive, proposalBrandColor, proposalContent?.technicalCompliance, aiCredits, insufficientProposalSu, authHeaders, humanizeAI, session?.access_token]);

  // If a refill just succeeded and a proposal was pending, auto-run it once.
  useEffect(() => {
    if (!showSuppliesRestockedToast || pendingCreditTask !== "proposal") return;
    const t = setTimeout(() => {
      setPendingCreditTask(null);
      handleGenerateProposal();
    }, 600);
    return () => clearTimeout(t);
  }, [showSuppliesRestockedToast, pendingCreditTask, handleGenerateProposal]);

  const handleGenerateLinkedIn = useCallback(async () => {
    const key = [
      fullName || "",
      targetRole || "",
      linkedinCurrentRole || "",
      linkedinCareerGoals || "",
      experience || "",
      skills || "",
      sharpened || "",
      jobDescription || "",
      humanizeAI ? "humanize" : "raw",
    ].join("||");
    if (key && key === lastLinkedInKey && linkedinContent) {
      return;
    }
    setLinkedinLoading(true);
    try {
      const res = await fetch("/api/linkedin-surgeon", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          fullName: fullName || undefined,
          targetRole: targetRole || undefined,
          currentRole: linkedinCurrentRole || targetRole || undefined,
          careerGoals: linkedinCareerGoals || undefined,
          experience: experience || undefined,
          skills: skills || undefined,
          sharpenedResume: sharpened || experience || undefined,
          jobDescription: jobDescription || undefined,
          humanize: humanizeAI,
        }),
      });
      const data = (await res.json()) as { headlines: string[]; about: string; topSkills: string[]; featuredProjects: string[]; code?: string; message?: string; error?: string; success?: boolean };
      openRefillIfInsufficient(res, data);
      if (res.status === 402) return;
      if (!res.ok) throw new Error("LinkedIn generation failed");
      setLinkedinContent({
        headlines: data.headlines || [],
        about: data.about || "",
        topSkills: data.topSkills || [],
        featuredStrategy: (data.featuredProjects?.length ? "Pin 2–3 of the Featured Projects below to your LinkedIn Featured section for maximum impact." : "Pin key project links or articles that demonstrate your expertise."),
        featuredProjects: data.featuredProjects || [],
      });
      setLinkedinSelectedHeadline(0);
      setLastLinkedInKey(key || null);
      refetchProfile();
    } catch (err) {
      console.error(err);
      setLinkedinContent({
        headlines: [],
        about: "Unable to generate. Try again.",
        topSkills: [],
        featuredStrategy: "",
        featuredProjects: [],
      });
    } finally {
      setLinkedinLoading(false);
    }
  }, [fullName, targetRole, linkedinCurrentRole, linkedinCareerGoals, experience, skills, sharpened, jobDescription, humanizeAI, linkedinContent, lastLinkedInKey, authHeaders, openRefillIfInsufficient, refetchProfile]);

  const handleCopyAllLinkedIn = useCallback(() => {
    if (!canUseLinkedInExport) {
      setShowPaywall(true);
      return;
    }
    if (!linkedinContent) return;
    const headline = linkedinContent.headlines[linkedinSelectedHeadline] || linkedinContent.headlines[0] || "";
    const text = [
      headline,
      "",
      linkedinContent.about,
      "",
      "Top skills: " + (linkedinContent.topSkills || []).join(" · "),
      "",
      "Featured: " + linkedinContent.featuredStrategy,
    ].join("\n");
    void navigator.clipboard.writeText(text);
  }, [canUseLinkedInExport, linkedinContent, linkedinSelectedHeadline]);

  const W = 1584;
  const H = 396;
  const drawSurgicalBanner = useCallback(
    (ctx: CanvasRenderingContext2D, opts: { theme: ThemeId; jobTitle: string; fullName: string; seed: number; showWatermark: boolean }) => {
      const { theme, jobTitle, fullName, seed, showWatermark } = opts;
      const seeded = (s: number) => () => {
        s = Math.imul(48271, s) >>> 0;
        return s / 4294967296;
      };
      const rnd = seeded(seed + 1);

      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, W, H);

      const teal = theme === "surgeon" ? "rgba(45, 212, 191," : theme === "partner" ? "rgba(100, 116, 139," : "rgba(129, 140, 248,";
      const opacity = (o: number) => `${teal}${o})`;

      for (let i = 0; i < 24; i++) {
        const x1 = rnd() * W;
        const y1 = rnd() * H;
        const x2 = x1 + (rnd() - 0.5) * 400;
        const y2 = y1 + (rnd() - 0.5) * 400;
        ctx.strokeStyle = opacity(0.08 + rnd() * 0.12);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      for (let i = 0; i < 12; i++) {
        const x = rnd() * W;
        const y = rnd() * H;
        const size = 30 + rnd() * 80;
        ctx.fillStyle = opacity(0.06 + rnd() * 0.1);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + size, y);
        ctx.lineTo(x + size * 0.5, y - size * 0.866);
        ctx.closePath();
        ctx.fill();
      }

      const grad = ctx.createRadialGradient(0, H, 0, 0, H, H * 1.2);
      grad.addColorStop(0, theme === "surgeon" ? "rgba(45, 212, 191, 0.18)" : theme === "partner" ? "rgba(100, 116, 139, 0.15)" : "rgba(129, 140, 248, 0.18)");
      grad.addColorStop(0.6, "transparent");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      const grad2 = ctx.createRadialGradient(W, 0, 0, W, 0, W * 0.5);
      grad2.addColorStop(0, theme === "surgeon" ? "rgba(45, 212, 191, 0.12)" : theme === "partner" ? "rgba(100, 116, 139, 0.1)" : "rgba(129, 140, 248, 0.12)");
      grad2.addColorStop(0.7, "transparent");
      ctx.fillStyle = grad2;
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font = "600 32px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(fullName || "Your Name", W / 2, H / 2);

      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = "14px Inter, system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText(jobTitle || "Your Title", W - 24, H - 16);

      ctx.strokeStyle = theme === "surgeon" ? "rgba(45, 212, 191, 0.6)" : theme === "partner" ? "rgba(148, 163, 184, 0.5)" : "rgba(129, 140, 248, 0.6)";
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

      if (showWatermark) {
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.rotate(-0.25);
        ctx.translate(-W / 2, -H / 2);
        ctx.fillStyle = "rgba(15, 23, 42, 0.35)";
        ctx.font = "bold 48px Inter, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("RESUME SURGEON", W / 2, H / 2);
        ctx.restore();
      }
    },
    []
  );

  useEffect(() => {
    const canvas = linkedinBannerCanvasRef.current;
    if (!canvas || dashboardTab !== "linkedin") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = W;
    canvas.height = H;
    drawSurgicalBanner(ctx, {
      theme,
      jobTitle: targetRole || linkedinCurrentRole || "Your Title",
      fullName: fullName || "Your Name",
      seed: bannerPatternSeed,
      showWatermark: !canUseLinkedInExport,
    });
  }, [dashboardTab, theme, targetRole, fullName, linkedinCurrentRole, bannerPatternSeed, canUseLinkedInExport, drawSurgicalBanner]);

  const handleDownloadBanner = useCallback(() => {
    if (!canUseLinkedInExport) {
      setShowPaywall(true);
      return;
    }
    const canvas = linkedinBannerCanvasRef.current;
    if (canvas) {
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `linkedin-banner-${(fullName || "banner").replace(/\s+/g, "-")}.png`;
      a.click();
    }
  }, [canUseLinkedInExport, fullName]);

  const proposalAccentColor = proposalTrack === "firm" ? (proposalBrandColor || "#14b8a6") : "#14b8a6";
  const proposalCurrency = proposalToneOfVoice === "international_client"
    ? { symbol: "$", label: "$", costHeader: "Cost ($)" }
    : { symbol: "Ksh ", label: "Ksh", costHeader: "Cost (Ksh)" };
  const totalProposalPages = proposalTrack === "firm" ? 6 : 2;
  const formatProposalCost = (value: number) =>
    proposalCurrency.symbol + value.toLocaleString(proposalCurrency.label === "$" ? "en-US" : "en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const canTriggerFreelancerProposal = proposalScope.trim() !== "" || proposalPainPoints.trim() !== "";
  const canTriggerFirmProposal = proposalMission.trim() !== "" || proposalSuccessMetrics.trim() !== "" || proposalClientName.trim() !== "";

  const isFirmLuxury = dashboardTab === "proposals" && proposalTrack === "firm";
  const powerSkillsSuggestions = targetRole.trim() ? getPowerSkillsSuggestions(targetRole) : [];

  const resumeSummaryForSync = (sharpened || experience || "").split("\n").filter(Boolean).slice(0, 5).join(" ").toLowerCase();
  const linkedInAboutForSync = (linkedinContent?.about || "").toLowerCase();
  const syncWordSet = (s: string) => new Set(s.replace(/[^\w\s]/g, " ").split(/\s+/).filter((w) => w.length > 2));
  const summaryWords = syncWordSet(resumeSummaryForSync);
  const aboutWords = syncWordSet(linkedInAboutForSync);
  const overlap = summaryWords.size > 0 ? [...summaryWords].filter((w) => aboutWords.has(w)).length / summaryWords.size : 1;
  const linkedInConsistencyScore = linkedinContent?.about && resumeSummaryForSync ? Math.round(overlap * 100) : null;
  const linkedInBrandMismatch = linkedInConsistencyScore != null && linkedInConsistencyScore < 40;

  type NavTab = typeof dashboardTab;
  const breadcrumbLabels: Record<string, string> = {
    resume: "Resume Builder",
    "cover-letter": "Cover Letter",
    proposals: "Proposals",
    linkedin: "LinkedIn",
    interview: "Interview Prep",
    followup: "Follow-up",
    share: "Surgical Share",
    tracker: "Job Tracker",
  };
  const breadcrumbCurrent = breadcrumbLabels[dashboardTab] ?? "Dashboard";
  const sidebarNav = [
    { id: "lab" as const, label: "The Lab", items: [
      { tab: "resume" as NavTab, label: "Resume Builder", icon: Scissors, tooltip: "Resume Builder" },
      { tab: "resume" as NavTab, label: "Surgical Matcher", icon: Activity, tooltip: "Surgical Matcher" },
    ]},
    { id: "outreach" as const, label: "Outreach", items: [
      { tab: "cover-letter" as NavTab, label: "Cover Letter", icon: FileText, tooltip: "Cover Letter" },
      { tab: "proposals" as NavTab, label: "Proposals", icon: Briefcase, tooltip: "Proposals" },
      { tab: "linkedin" as NavTab, label: "LinkedIn Surgeon", icon: Linkedin, tooltip: "LinkedIn Surgeon" },
    ]},
    { id: "strategy" as const, label: "Strategy", items: [
      { tab: "interview" as NavTab, label: "Interview Prep", icon: MessageCircle, tooltip: "Interview Prep" },
      { tab: "followup" as NavTab, label: "Follow-Up Kit", icon: Mail, tooltip: "Follow-Up Kit" },
      { tab: "linkedin" as NavTab, label: "LinkedIn DM", icon: MessageCircle, tooltip: "LinkedIn DM" },
    ]},
    { id: "management" as const, label: "Management", items: [
      { tab: "tracker" as NavTab, label: "Job Tracker", icon: ListTodo, tooltip: "Job Tracker" },
      { tab: "share" as NavTab, label: "Surgical Share", icon: Link2, tooltip: "Surgical Share" },
    ]},
  ];

  return (
    <div
      className={`min-h-screen flex app-bg text-[#292524] transition-colors duration-300 ${
        isFirmLuxury ? "theme-firm-luxury" : ""
      } ${lowLightMode ? "low-light" : ""}`}
    >
      {/* Enterprise sidebar — Obsidian + Emerald gradient border */}
      <aside
        className={`bar-sidebar shrink-0 flex flex-col transition-[width] duration-200 ease-out z-20 font-sans ${
          sidebarExpanded ? "w-[240px]" : "w-16"
        }`}
      >
        <div className="flex h-12 shrink-0 items-center border-b border-white/10 px-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/10 border border-white/20 shrink-0">
            <Scissors className="h-5 w-5 text-slate-400" />
          </div>
          {sidebarExpanded && (
            <span className="ml-2 text-base font-semibold truncate flex items-center gap-0.5 min-w-0">
              <span className="text-white">Resume </span>
              <span className="bg-gradient-to-r from-emerald-500 to-[#F59E0B] bg-clip-text text-transparent">Surgeon</span>
            </span>
          )}
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {sidebarNav.map((group) => (
            <div key={group.id} className="mb-4">
              {sidebarExpanded && (
                <p className="px-3 mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {group.label}
                </p>
              )}
              {group.items.map((item) => {
                const isActive = dashboardTab === item.tab;
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => setDashboardTab(item.tab)}
                    title={item.tooltip}
                    className={`w-full flex items-center gap-2.5 py-2.5 px-3 mx-1 rounded-lg transition-colors ${
                      isActive ? "sidebar-nav-active" : "hover:bg-white/10 text-slate-400 hover:text-slate-200"
                    } ${sidebarExpanded ? "justify-start" : "justify-center"}`}
                  >
                    <Icon className={`sidebar-nav-icon h-5 w-5 shrink-0 ${isActive ? "" : "text-slate-400"}`} />
                    {sidebarExpanded && (
                      <>
                        <span className={`sidebar-nav-label text-sm font-medium truncate ${isActive ? "" : "text-slate-400"}`}>
                          {item.label}
                        </span>
                        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B] shrink-0 shadow-[0_0_8px_rgba(245,158,11,0.5)]" aria-hidden />}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        {/* Your journey — York Yellow for notification dots (incomplete) */}
        {sidebarExpanded && (
          <div className="shrink-0 border-t border-white/10 px-3 py-3">
            <p className="px-1 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Your journey</p>
            <div className="space-y-0.5 text-sm">
              {[
                { tab: "resume" as const, label: "Resume", done: sharpened.length > 0 },
                { tab: "cover-letter" as const, label: "Cover letter", done: !!coverLetter },
                { tab: "proposals" as const, label: "Proposals", done: !!proposalContent },
                { tab: "linkedin" as const, label: "LinkedIn", done: !!linkedinContent },
                { tab: "interview" as const, label: "Interview prep", done: !!interviewPrep },
                { tab: "followup" as const, label: "Follow-up", done: !!followUpEmails },
                { tab: "share" as const, label: "Share", done: !!shareUrl },
              ].map(({ tab, label, done }) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setDashboardTab(tab)}
                  className={`w-full flex items-center gap-2 py-1.5 px-2 rounded-md text-left transition-colors ${
                    dashboardTab === tab ? "bg-[#F59E0B]/15 text-[#F59E0B]" : "text-slate-400 hover:bg-white/10 hover:text-slate-200"
                  }`}
                >
                  <span className={`shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${done ? "bg-emerald-400/30 text-emerald-300" : "border border-[#F59E0B]/60 text-[#F59E0B]/80"}`}>
                    {done ? <Check className="h-2.5 w-2.5" /> : ""}
                  </span>
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </div>
            <p className="px-1 mt-2 text-xs text-slate-500">Complete each step; save or download from each page.</p>
          </div>
        )}
        <button
          type="button"
          onClick={() => setSidebarExpanded((e) => !e)}
          className="flex items-center justify-center h-10 border-t border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          title={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
        >
          {sidebarExpanded ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </aside>

      {/* Right: slim top bar + main workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Enterprise top bar — white/80 + backdrop-blur + breadcrumb */}
        <header className="bar-topbar h-12 shrink-0 flex items-center justify-between px-4 font-sans">
          <div className="flex items-center gap-4 min-w-0">
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-slate-600 shrink-0">
              <span className="font-medium text-slate-900">Dashboard</span>
              <span className="text-slate-400" aria-hidden>/</span>
              <span className="font-medium text-slate-800 truncate">{breadcrumbCurrent}</span>
            </nav>
            <div className="hidden sm:block w-px h-5 bg-slate-200" />
            <div className="flex items-center gap-3 min-w-0">
            {session && (
              <>
                <button
                  type="button"
                  onClick={() => setShowRefillModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-bold text-emerald-700 shadow-sm hover:border-emerald-500/60 hover:bg-emerald-500/15 transition-all"
                  title={
                    isBetaTester
                      ? "Beta tester – unlimited Surgical Units"
                      : totalCreditsPurchased > 0
                        ? `Remaining: ${aiCredits.toLocaleString()} SU · Purchased: ${totalCreditsPurchased.toLocaleString()} SU · Click to top up`
                        : `Remaining: ${aiCredits.toLocaleString()} Surgical Units · Click to top up`
                  }
                >
                  <Coins className="h-3.5 w-3.5" />
                  {isBetaTester ? "∞ SU" : totalCreditsPurchased > 0 ? `${aiCredits} / ${totalCreditsPurchased}` : aiCredits}
                </button>
                <button
                  type="button"
                  onClick={() => setShowFeatureCostsModal(true)}
                  className="text-sm text-slate-600 hover:text-slate-900 font-medium"
                >
                  Features & costs
                </button>
              </>
            )}
            {dashboardTab === "resume" && (
              <button
                type="button"
                onClick={() => setCompare((c) => !c)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  compare ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-700" : "border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900"
                }`}
              >
                <ArrowLeftRight className="h-3.5 w-3.5" />
                Compare
              </button>
            )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <motion.button
              type="button"
              onClick={() => setLowLightMode((v) => !v)}
              whileTap={{ scale: 0.95 }}
              className={`rounded-lg p-2 transition-colors ${lowLightMode ? "bg-amber-100 text-amber-700" : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"}`}
              title={lowLightMode ? "Low light on" : "Low light off"}
            >
              <Moon className="h-4 w-4" />
            </motion.button>
            <label className="flex items-center gap-1.5 cursor-pointer" title="Humanize output for AI detection">
              <span className="text-sm text-slate-600 hidden sm:inline font-medium">Humanize</span>
              <button
                type="button"
                role="switch"
                aria-checked={humanizeAI}
                onClick={() => setHumanizeAI((v) => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors ${
                  humanizeAI ? "border-emerald-500/60 bg-emerald-100" : "border-amber-400/60 bg-amber-100"
                }`}
              >
                <span className={`pointer-events-none inline-block h-4 w-3.5 rounded-full mt-0.5 ml-0.5 transition-transform ${humanizeAI ? "translate-x-4 bg-emerald-500" : "translate-x-0 bg-amber-400"}`} />
              </button>
            </label>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={!canDownloadResume}
              className={`hidden sm:inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium ${
                canDownloadResume ? "border-emerald-500/50 text-emerald-700 hover:bg-emerald-500/10" : "border-slate-200 text-slate-400 cursor-not-allowed"
              }`}
            >
              Download PDF
            </button>
            {canDownloadCoverLetter && (
              <button type="button" onClick={() => handlePrintCoverLetter?.()} className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border-2 border-amber-500/70 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100">
                <FileText className="h-3.5 w-3.5" /> Cover
              </button>
            )}
            {canDownloadProposal && (
              <button type="button" onClick={() => handleDownloadProposalPdf()} className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border-2 border-amber-500/70 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100">
                <Briefcase className="h-3.5 w-3.5" /> Proposal
              </button>
            )}
            <button
              type="button"
              onClick={() => (session ? setShowProfilePanel((v) => !v) : router.push("/login"))}
              className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center hover:bg-slate-200 hover:border-slate-300 transition-colors"
              title={session ? "Profile & Settings" : "Sign in"}
            >
              <User className="h-5 w-5 text-slate-600" />
            </button>
          </div>
        </header>

        {/* Progress strip — matches Surgical Executive topbar (glass on white canvas) */}
        {session && (
          <div className="shrink-0 px-4 py-2 bg-white/80 backdrop-blur-md border-b border-slate-100">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-600 uppercase tracking-wider mr-1 font-semibold">
                Your progress
              </span>
              {[
                { tab: "resume" as const, label: "Resume", done: sharpened.length > 0 },
                { tab: "cover-letter" as const, label: "Cover letter", done: !!coverLetter },
                { tab: "proposals" as const, label: "Proposals", done: !!proposalContent },
                { tab: "linkedin" as const, label: "LinkedIn", done: !!linkedinContent },
                { tab: "interview" as const, label: "Interview", done: !!interviewPrep },
                { tab: "followup" as const, label: "Follow-up", done: !!followUpEmails },
                { tab: "share" as const, label: "Share", done: !!shareUrl },
              ].map(({ tab, label, done }) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setDashboardTab(tab)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    dashboardTab === tab
                      ? "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-400/40"
                      : done
                        ? "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20"
                        : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 border border-transparent hover:border-yorkYellow/30"
                  }`}
                >
                  {done && <Check className="h-3 w-3 shrink-0" />}
                  {label}
                </button>
              ))}
              <span className="text-xs text-slate-500 ml-1">
                {[sharpened.length > 0, coverLetter, proposalContent, linkedinContent, interviewPrep, followUpEmails, shareUrl].filter(Boolean).length} of 7 · Save or download from each page
              </span>
            </div>
          </div>
        )}

      {/* Profile & Settings panel — slide-over from right */}
      <AnimatePresence>
        {showProfilePanel && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowProfilePanel(false)}
              className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "tween", duration: 0.2 }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white/95 backdrop-blur-xl border-l border-slate-200/60 shadow-2xl shadow-slate-200/50 z-50 flex flex-col"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/60">
                <h2 className="font-display text-xl font-semibold text-[#1c1917]">Profile & Settings</h2>
                <button type="button" onClick={() => setShowProfilePanel(false)} className="rounded-lg p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100">×</button>
              </div>
              <div className="flex border-b border-white/5">
                {(["profile", "settings", "guide"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setProfilePanelTab(tab)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors ${
                      profilePanelTab === tab ? "text-[#1c1917] border-b-2 border-emerald-600 bg-emerald-500/10" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {tab === "profile" && <User className="h-3.5 w-3.5" />}
                    {tab === "settings" && <Settings className="h-3.5 w-3.5" />}
                    {tab === "guide" && <HelpCircle className="h-3.5 w-3.5" />}
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {profilePanelTab === "profile" && (
                  <>
                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Account</h3>
                      <div className="rounded-xl border border-slate-200/60 bg-white/70 backdrop-blur-md p-4 space-y-2 shadow-sm shadow-slate-200/30">
                        <p className="text-base text-slate-800 break-all font-medium">{subscriptionUser?.email ?? "—"}</p>
                        {subscriptionUser?.created_at && (
                          <p className="text-sm text-slate-600">Member since {new Date(subscriptionUser.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</p>
                        )}
                      </div>
                    </section>
                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Summary</h3>
                      <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-white p-4 space-y-3 shadow-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-semibold text-slate-700">Surgical Units</span>
                          <span className="text-lg font-bold text-neonGreenDark">
                            {isBetaTester ? "∞ (Beta)" : `${aiCredits.toLocaleString()}${totalCreditsPurchased > 0 ? ` / ${totalCreditsPurchased.toLocaleString()}` : ""}`}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-slate-700 font-medium">Tier</span>
                          <span className="text-sm font-semibold text-slate-900 capitalize">{subscriptionTier ?? "free"}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-slate-700 font-medium">Executive Pass</span>
                          <span className="text-sm font-semibold text-slate-900">{canAccessExecutivePdf ? "Active" : "Not active"}</span>
                        </div>
                        {isBetaTester && (
                          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-sm font-medium text-amber-700">Beta tester — unlimited SU</div>
                        )}
                      </div>
                    </section>
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={async () => { await supabase.auth.signOut(); setShowProfilePanel(false); router.push("/login"); router.refresh(); }}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-amber-500/70 bg-amber-50 py-3 text-base font-semibold text-amber-800 hover:bg-amber-100 transition-colors"
                      >
                        <LogOut className="h-4 w-4" />
                        Sign out
                      </button>
                    </div>
                  </>
                )}
                {profilePanelTab === "settings" && (
                  <>
                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Preferences</h3>
                      <p className="text-sm text-slate-600">These are saved automatically and apply across the app.</p>
                      <div className="rounded-xl border border-slate-200/60 bg-white/70 backdrop-blur-md p-4 space-y-4 shadow-sm shadow-slate-200/30">
                        <label className="flex items-center justify-between gap-3 cursor-pointer">
                          <span className="text-base font-medium text-slate-800">Humanize output</span>
                          <button type="button" role="switch" aria-checked={humanizeAI} onClick={() => setHumanizeAI((v) => !v)} className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors ${humanizeAI ? "border-emerald-500/60 bg-emerald-100" : "border-amber-400/60 bg-amber-100"}`}>
                            <span className={`pointer-events-none inline-block h-4 w-3.5 rounded-full mt-0.5 ml-0.5 transition-transform ${humanizeAI ? "translate-x-4 bg-emerald-500" : "translate-x-0 bg-amber-400"}`} />
                          </button>
                        </label>
                        <p className="text-sm text-slate-600">Makes AI text read more human and better pass detection tools. Recommended for cover letters and proposals.</p>
                        <label className="flex items-center justify-between gap-3 cursor-pointer">
                          <span className="text-base font-medium text-slate-800">Low light mode</span>
                          <button type="button" role="switch" aria-checked={lowLightMode} onClick={() => setLowLightMode((v) => !v)} className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors ${lowLightMode ? "border-amber-500/50 bg-amber-500/20" : "border-amber-400/60 bg-amber-100"}`}>
                            <span className={`pointer-events-none inline-block h-4 w-3.5 rounded-full mt-0.5 ml-0.5 transition-transform ${lowLightMode ? "translate-x-4 bg-amber-400" : "translate-x-0 bg-amber-400"}`} />
                          </button>
                        </label>
                        <p className="text-sm text-slate-600">Reduces brightness and contrast for evening use.</p>
                      </div>
                    </section>
                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Quick actions</h3>
                      <div className="flex flex-col gap-2">
                        <button type="button" onClick={() => { setShowProfilePanel(false); setShowFeatureCostsModal(true); }} className="w-full text-left rounded-lg border-2 border-amber-500/70 bg-amber-50 px-4 py-3 text-base font-semibold text-amber-800 hover:bg-amber-100 flex items-center gap-2">
                          <Coins className="h-4 w-4 text-neonGreenDark" /> Features & costs
                        </button>
                        <button type="button" onClick={() => { setShowProfilePanel(false); setShowRefillModal(true); }} className="w-full text-left rounded-xl border-2 border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-base font-bold text-neonGreenDark hover:bg-emerald-500/20 hover:border-emerald-500/50 flex items-center gap-2 transition-all shadow-sm">
                          <Plus className="h-4 w-4 text-neonGreen" /> Top up Surgical Units
                        </button>
                        <a href="/builder" className="w-full text-left rounded-lg border-2 border-amber-500/70 bg-amber-50 px-4 py-3 text-base font-semibold text-amber-800 hover:bg-amber-100 flex items-center gap-2">
                          <FileText className="h-4 w-4 text-neonGreenDark" /> Resume Builder
                        </a>
                      </div>
                    </section>
                  </>
                )}
                {profilePanelTab === "guide" && (
                  <>
                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">One journey, all features</h3>
                      <div className="rounded-xl border border-surgicalTeal/20 bg-emerald-500/5 p-4 space-y-2 text-sm text-slate-700">
                        <p>The app is <strong className="text-slate-800">one connected flow</strong>: Resume → Cover letter → Proposals → LinkedIn → Interview prep → Follow-up → Share. You don’t have to explore on your own — use the <strong className="text-slate-800">progress bar</strong> under the top bar or <strong className="text-slate-800">Your journey</strong> in the sidebar to jump to any step. After each step you get a result you can <strong className="text-slate-800">save or download</strong> from that page (PDF, Copy, or link).</p>
                      </div>
                    </section>
                    <section className="space-y-3">
                      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Navigation</h3>
                      <div className="rounded-xl border border-slate-200/60 bg-white/70 backdrop-blur-md p-4 space-y-3 text-sm text-slate-600 shadow-sm shadow-slate-200/30">
                        <p><strong className="text-slate-800">Left sidebar</strong> — All tools are grouped into four categories. Click the <strong className="text-slate-800">chevron</strong> at the bottom to expand and see labels.</p>
                        <ul className="list-disc list-inside space-y-1.5 text-xs text-slate-600">
                          <li><strong className="text-slate-700">The Lab</strong> — Resume Builder, Surgical Matcher</li>
                          <li><strong className="text-slate-700">Outreach</strong> — Cover Letter, Proposals, LinkedIn Surgeon</li>
                          <li><strong className="text-slate-700">Strategy</strong> — Interview Prep, Follow-Up Kit, LinkedIn DM</li>
                          <li><strong className="text-slate-700">Management</strong> — Job Tracker, Surgical Share</li>
                        </ul>
                        <p className="text-xs"><strong className="text-slate-800">Top bar</strong> — Your SU balance (yellow), Humanize toggle, downloads, and this profile.</p>
                      </div>
                    </section>
                    <section className="space-y-3">
                      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Get the most out of Resume Surgeon</h3>
                      <ul className="rounded-xl border border-slate-200/60 bg-white/70 backdrop-blur-md p-4 space-y-2.5 text-sm text-slate-600 shadow-sm shadow-slate-200/30">
                        <li className="flex gap-2"><span className="text-neonGreenDark shrink-0">•</span> Use <strong>Resume Builder</strong> or <strong>Surgical Auto-Fill</strong> (Builder) to get started quickly from a PDF.</li>
                        <li className="flex gap-2"><span className="text-neonGreenDark shrink-0">•</span> Turn on <strong>Humanize</strong> for cover letters and proposals so output passes AI detection.</li>
                        <li className="flex gap-2"><span className="text-neonGreenDark shrink-0">•</span> Use <strong>Compare</strong> (Resume tab) to see before/after of your sharpened bullets.</li>
                        <li className="flex gap-2"><span className="text-neonGreenDark shrink-0">•</span> Top up Surgical Units via the top bar or Refill modal when you run low.</li>
                        <li className="flex gap-2"><span className="text-neonGreenDark shrink-0">•</span> <strong>Surgical Share</strong> gives recruiters a public link to your executive resume.</li>
                        <li className="flex gap-2"><span className="text-neonGreenDark shrink-0">•</span> Check <strong>Features & costs</strong> to see SU cost per feature and what you can afford.</li>
                      </ul>
                    </section>
                    <section className="space-y-2">
                      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Need help?</h3>
                      <p className="text-xs text-slate-600">All features are in the sidebar. Top bar shows your balance and quick actions. For payment or account issues, use the same email you signed up with.</p>
                    </section>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main className="flex-1 overflow-auto workspace-deep-space">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={dashboardTab}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.26, ease: [0.25, 0.1, 0.25, 1] }}
              className="min-w-0"
            >
          {dashboardTab === "share" ? (
            <div className="max-w-xl mx-auto py-8">
              <section className="resume-surface glass-card rounded-2xl border border-slate-200 p-6 lg:p-7 space-y-4">
                <p className="text-sm font-semibold uppercase tracking-wider text-neonGreenDark">Surgical Share</p>
                <p className="text-sm text-slate-600">Share a public link to your Executive Resume. Recruiters can view, copy email, open LinkedIn, and download PDF (if you have Executive Pass).</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-[11px] text-slate-500">Public Visibility (allow search engines)</span>
                  <button type="button" role="switch" aria-checked={sharePublicVisibility} onClick={() => setSharePublicVisibility((v) => !v)} className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors ${sharePublicVisibility ? "border-emerald-500/60 bg-emerald-100" : "border-amber-400/60 bg-amber-100"}`}>
                    <span className={`pointer-events-none inline-block h-4 w-3.5 rounded-full shadow-sm transition-transform mt-0.5 ml-0.5 ${sharePublicVisibility ? "translate-x-4 bg-emerald-500" : "translate-x-0 bg-amber-400"}`} />
                  </button>
                </label>
                <button type="button" disabled={shareLoading || !session?.access_token} onClick={async () => { setShareLoading(true); setShareUrl(null); try { const res = await fetch("/api/public-profile", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session!.access_token}` }, body: JSON.stringify({ snapshot: { fullName: fullName || undefined, targetRole: targetRole || undefined, email: email || undefined, profileUrl: profileUrl || undefined, experience: experience || undefined, sharpened: sharpened || undefined, skills: skills || undefined, education: education?.trim() || undefined, projects: projects?.trim() || undefined, certification: certification?.trim() || undefined }, noindex: !sharePublicVisibility }) }); if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed"); } const data = await res.json(); setShareUrl(data.url ?? null); if (data.url) navigator.clipboard.writeText(data.url); } catch (e) { setShareUrl(null); } setShareLoading(false); }} className="inline-flex items-center gap-2 rounded-lg border border-surgicalTeal/60 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-neonGreenDark hover:bg-emerald-600 disabled:opacity-50">
                  <Link2 className="h-3.5 w-3.5" />
                  {shareLoading ? "Generating…" : "Share My Surgical Profile"}
                </button>
                {!session?.access_token && <p className="text-[10px] text-amber-500/90">Sign in to generate your share link.</p>}
                {shareUrl && (
                  <>
                    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 mb-3">
                      <p className="text-xs text-neonGreenDark"><span className="font-medium">Result: 1 share link ready.</span> Save it: copy the link below or open it. Use this link in your job applications so recruiters can view your full resume.</p>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white/80 px-3 py-2">
                      <input readOnly value={shareUrl} className="flex-1 min-w-0 bg-transparent text-xs text-slate-700 outline-none" />
                      <button type="button" onClick={() => navigator.clipboard.writeText(shareUrl)} className="shrink-0 rounded p-1.5 text-neonGreenDark hover:bg-emerald-600" title="Copy"><Copy className="h-3.5 w-3.5" /></button>
                      <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[11px] text-neonGreenDark hover:underline">Open</a>
                    </div>
                    <div className="rounded-lg border border-surgicalTeal/30 bg-emerald-500/5 px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mt-3">
                      <p className="text-[11px] font-medium text-slate-600">What&apos;s next?</p>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setDashboardTab("tracker")} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/60 bg-emerald-50/50 px-2.5 py-1.5 text-xs font-medium text-neonGreenDark hover:bg-emerald-100/80 transition-colors">
                          Track applications <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => setDashboardTab("resume")} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/60 bg-amber-50/50 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100/80 transition-colors">
                          Update resume <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </section>
            </div>
          ) : dashboardTab === "cover-letter" ? (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-start">
              <section className="resume-surface glass-card rounded-2xl border border-slate-200 p-6 lg:p-7 space-y-6">
                <header>
                  <h2 className="font-display text-xl font-semibold text-[#1c1917]">Cover Letter Surgeon</h2>
                  <p className="text-sm text-slate-600 mt-1">
                    Generate a matching cover letter from your resume and job description.
                  </p>
                </header>
                <div className="space-y-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-600">Tone</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(["confident", "professional", "creative", "humble"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setCoverLetterTone(t)}
                        className={`rounded-lg border px-3 py-2 text-xs font-medium capitalize ${
                          coverLetterTone === t
                            ? "bg-emerald-500 text-black font-bold border border-emerald-500"
                            : "border-slate-200 bg-white/70 text-slate-700 hover:border-slate-600"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {!session && (
                    <p className="text-[11px] text-amber-400">Sign in to generate or sync with your resume.</p>
                  )}
                  <button
                    type="button"
                    onClick={handleSyncWithResume}
                    className="rounded-lg border border-amber-400/60 bg-amber-50/50 px-3 py-2 text-xs text-amber-700 hover:border-amber-500/70 hover:bg-amber-100/80"
                  >
                    Sync with Resume
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateCoverLetter}
                    disabled={coverLetterLoading || !session || (!sharpened && !experience.trim())}
                    className="btn-glimmer rounded-lg border bg-emerald-500 text-black font-bold border border-emerald-500 px-3 py-2 text-xs font-medium disabled:opacity-50 inline-flex items-center gap-2"
                  >
                    {coverLetterLoading ? (<><span className="surgical-pulse" aria-hidden />Writing…</>) : <>Generate Cover Letter <span className="ml-1 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700">{getCost("COVER_LETTER")} SU</span></>}
                  </button>
                  {canDownloadCoverLetter && coverLetter && (
                    <button
                      type="button"
                      onClick={() => handlePrintCoverLetter?.()}
                      className="rounded-lg border bg-emerald-500 text-black font-bold border border-emerald-500 px-3 py-2 text-xs font-medium hover:bg-emerald-600"
                    >
                      Download Cover Letter PDF
                    </button>
                  )}
                </div>
                {syncToast && (
                  <p className="text-[11px] text-neonGreenDark">Contact info synced from resume.</p>
                )}
              </section>
              <section className="relative space-y-3">
                <div className="flex flex-col gap-1">
                  <h3 className="text-sm font-semibold text-[#0F172A]">Your cover letter</h3>
                  <p className="text-[11px] text-slate-500">
                    {coverLetter
                      ? "Review below. Download when ready using the button on the left or the Cover button in the top bar."
                      : "Generate a cover letter to see the preview here. You can download it later from the top bar or the button on the left."}
                  </p>
                </div>
                <div
                  ref={coverRef}
                  className={`resume-paper print-resume-page rounded-2xl border border-slate-200/70 shadow-xl px-10 py-8 ${
                    theme === "surgeon" ? "theme-surgeon" : theme === "partner" ? "theme-partner" : "theme-innovator"
                  }`}
                >
                  <div
                    className={`border-b border-slate-200/70 pb-4 mb-4 ${
                      theme === "partner" ? "text-center" : "flex items-start justify-between gap-6"
                    }`}
                  >
                    <div className="flex-1 space-y-1">
                      <p className="resume-header-name text-2xl text-slate-900 leading-snug">
                        {fullName || "Your Name"}
                      </p>
                      <p className="resume-header-title text-xs uppercase tracking-[0.2em] text-slate-500">
                        {targetRole || "Target Role"}
                      </p>
                    </div>
                    <div className={`text-[10pt] text-slate-600 resume-body space-y-0.5 text-right ${theme === "partner" ? "mx-auto mt-2" : ""}`}>
                      <p>{email || "you@example.com"}</p>
                      <p>{profileUrl.trim() || "linkedin.com/in/username"}</p>
                    </div>
                  </div>
                  <div className="resume-body text-slate-800 text-[11pt] leading-relaxed space-y-4 whitespace-pre-line">
                    {coverLetter || "Generate a cover letter to see the preview here. It will use the same Executive letterhead as your resume."}
                  </div>
                </div>
                {coverLetter && (
                  <>
                    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                      <p className="text-xs text-neonGreenDark"><span className="font-medium">Result: 1 cover letter ready.</span> Save it: use <strong>Download PDF → Cover</strong> in the top bar or the button on the left.</p>
                    </div>
                    <div className="mt-3 rounded-lg border border-surgicalTeal/30 bg-emerald-500/5 px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    <p className="text-[11px] font-medium text-slate-700">What&apos;s next?</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setDashboardTab("proposals")} className="inline-flex items-center gap-1.5 rounded-lg border border-surgicalTeal/60 bg-white px-2.5 py-1.5 text-xs font-medium text-neonGreenDark hover:bg-emerald-100/80 transition-colors">
                        Create a proposal <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => setDashboardTab("linkedin")} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/60 bg-amber-50/50 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100/80 transition-colors">
                        Polish LinkedIn <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                        <button type="button" onClick={() => setDashboardTab("interview")} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/60 bg-amber-50/50 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100/80 transition-colors">
                        Interview prep <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  </>
                )}
              </section>
            </div>
          ) : dashboardTab === "proposals" ? (
            <div className="flex flex-col gap-6">
              {session && proposalsHistory.length > 0 && (
                <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-[#0F172A]">Proposal history</h3>
                      <p className="text-[11px] text-slate-500">
                        Load a saved proposal to view or download again.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsHistoryOpen((v) => !v)}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                    >
                      {isHistoryOpen ? "Hide history" : "View history"}{" "}
                      <span className="ml-1 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700">
                        {proposalsHistory.length}
                      </span>
                    </button>
                  </div>
                  {isHistoryOpen && (
                    <ul className="mt-3 space-y-2 max-h-56 overflow-y-auto">
                      {proposalsHistory.map((p) => (
                        <li
                          key={p.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white/80 px-3 py-2"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-slate-800 truncate">{p.title}</p>
                            <p className="text-[10px] text-slate-500">
                              {p.created_at
                                ? new Date(p.created_at).toLocaleDateString(undefined, {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  })
                                : ""}
                            </p>
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleLoadProposalFromHistory(p.id)}
                              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                            >
                              Load
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await handleLoadProposalFromHistory(p.id);
                                setTimeout(() => handleDownloadProposalPdf(), 500);
                              }}
                              className="rounded-lg border border-emerald-600 bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-700"
                            >
                              Download
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {/* Main form - takes most of page, multi-step */}
              <section className="resume-surface glass-card rounded-2xl border border-slate-200 p-8 lg:p-10 space-y-8 shadow-xl shadow-slate-200/50 flex-1">
                {(() => {
                  const totalSteps = proposalTrack === "firm" && canUseFirmProposal ? 5 : 3;
                  return (
                    <>
                      <div className="flex items-center justify-between gap-4">
                        <header>
                          <h2 className="font-display text-2xl font-semibold text-[#0F172A] tracking-tight">Proposals</h2>
                          <p className="text-base text-slate-600 mt-1">
                            <span className="text-slate-700">Step {proposalStep + 1} of {totalSteps}</span> — Create client-ready proposals.
                          </p>
                        </header>
                        <button
                          type="button"
                          onClick={() => setShowProposalPreview((v) => !v)}
                          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition-all ${
                            showProposalPreview
                              ? "border-emerald-500/60 bg-emerald-500/15 text-neonGreenDark"
                              : "border-emerald-400/80 bg-emerald-500/20 text-neonGreenDark shadow-[0_0_20px_rgba(0,255,136,0.3)] hover:shadow-[0_0_28px_rgba(0,255,136,0.45)] hover:scale-105"
                          }`}
                        >
                          {showProposalPreview ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                          {showProposalPreview ? "Hide preview" : "Show preview"}
                        </button>
                      </div>

                      <div className="space-y-6">
                {lastTenderCached && (proposalStep === 0 || proposalStep === 1) && (
                  <div className="rounded-xl border border-surgicalTeal/30 bg-emerald-500/5 px-4 py-3 flex items-center justify-between gap-3">
                    <p className="text-sm text-slate-800">You have a saved tender from a previous session.</p>
                    <button
                      type="button"
                      onClick={() => {
                        const m = lastTenderCached.tender_data?.metadata;
                        const r = lastTenderCached.tender_data?.requirements;
                        const t = lastTenderCached.tender_data?.tenderText;
                        if (m) {
                          setProposalTenderRef(m.tender_reference ?? lastTenderCached.tender_ref ?? "");
                          setProposalTenderName(m.tender_name ?? "");
                          setProposalSubmittedTo(m.submitted_to ?? "");
                          setProposalScope(m.scope_summary ?? "");
                          setProposalClientName(m.client_name ?? "");
                          setProposalMethodology(m.methodology ?? "");
                          setProposalMission(m.mission ?? "");
                          setProposalSuccessMetrics(m.success_metrics ?? "");
                          setProposalTeamSize(m.team_size ?? "");
                        }
                        if (r?.length) setProposalTenderRequirements(r);
                        if (t) setProposalTenderText(t);
                        toast.success("Last tender loaded.");
                      }}
                      className="rounded-lg border border-surgicalTeal/60 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-neonGreenDark hover:bg-emerald-600"
                    >
                      Load last tender
                    </button>
                  </div>
                )}
                {proposalStep === 0 && (
                <>
                <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div />
                  {proposalFirmHeaderBlock}
                </header>
                {!session && (
                  <p className="text-xs text-amber-400/90 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">Sign in to generate proposals.</p>
                )}
                <div className="space-y-2" role="group" aria-labelledby="proposal-track-label">
                  <label id="proposal-track-label" className="block text-sm font-medium text-slate-700">Track</label>
                  <div className="flex rounded-xl border border-slate-200/80 bg-white/70 p-1">
                    <button
                      type="button"
                      onClick={() => setProposalTrack("freelancer")}
                      className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                        proposalTrack === "freelancer"
                          ? "bg-emerald-500/20 text-neonGreenDark"
                          : "text-slate-600 hover:text-slate-800"
                      }`}
                    >
                      Individual Freelancer
                    </button>
                    <button
                      type="button"
                      onClick={() => canUseFirmProposal && setProposalTrack("firm")}
                      className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                        !canUseFirmProposal ? "cursor-not-allowed opacity-60" : proposalTrack === "firm" ? "bg-emerald-500/20 text-neonGreenDark" : "text-slate-600 hover:text-slate-800"
                      }`}
                    >
                      Professional Firm
                    </button>
                  </div>
                  {proposalTrack === "firm" && !canUseFirmProposal && (
                    <p className="text-[11px] text-neonGreenDark">Upgrade to Business Surgeon to use the Firm track.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700">Target Audience</label>
                  <select
                    value={proposalToneOfVoice}
                    onChange={(e) =>
                      setProposalToneOfVoice(
                        e.target.value as "nairobi_tech_startup" | "government_ngo" | "international_client" | "non_tech_startup"
                      )
                    }
                    className="w-full rounded-xl border-2 border-slate-200 bg-white/80 px-4 py-3 text-base text-slate-900 focus:border-emerald-500/70 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option value="nairobi_tech_startup">Nairobi Tech Startup (Bold, fast-paced, result-heavy)</option>
                    <option value="government_ngo">Government/NGO (Highly formal, respectful, mentions compliance)</option>
                    <option value="international_client">International Client (Direct, professional, minimalist)</option>
                    <option value="non_tech_startup">Non-Tech Startup (Operations Director – boots on the ground)</option>
                  </select>
                </div>
                {proposalTrack === "firm" && canUseFirmProposal && (
                  <>
                    <div className="rounded-xl border border-slate-200 bg-white/70 backdrop-blur-md p-4 space-y-3">
                      <h3 className="text-sm font-medium text-slate-800">Company Profile</h3>
                      <p className="text-sm text-slate-600">
                        {firmProfileForProposal?.company_name ? (
                          <>Using <strong className="text-slate-800">{firmProfileForProposal.company_name}</strong> from your Firm Profile.</>
                        ) : (
                          <>Set up your company info once in Firm Profile. It will be used for all proposals.</>
                        )}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href="/dashboard/firm-profile"
                          className="inline-flex items-center gap-2 rounded-xl border-2 border-surgicalTeal/60 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-neonGreenDark hover:bg-emerald-600 transition-colors"
                        >
                          <Settings className="h-4 w-4" />
                          {firmProfileForProposal?.company_name ? "Manage Firm Profile" : "Set Up Firm Profile"}
                        </Link>
                        {firmProfileForProposal?.company_name && (
                          <button
                            type="button"
                            onClick={() => { refetchFirmProfile(); toast.success("Synced from Firm Profile."); }}
                            className="inline-flex items-center gap-2 rounded-xl border-2 border-amber-400/60 bg-amber-50/50 px-4 py-3 text-sm font-medium text-amber-700 hover:border-amber-500/70 hover:bg-amber-100/80 transition-colors"
                          >
                            <ArrowLeftRight className="h-4 w-4" />
                            Sync
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2 pt-1">
                      <p className="text-sm font-medium text-slate-700">Engagement Details</p>
                      <p className="text-sm text-slate-600">
                        Capture how your firm positions this specific engagement.
                      </p>
                    </div>
                    <div className="space-y-3">
                      <label className="block text-sm font-medium text-slate-700">Team size</label>
                      <input
                        type="text"
                        placeholder="e.g. 12 consultants"
                        value={proposalTeamSize}
                        onChange={(e) => setProposalTeamSize(e.target.value)}
                        className="w-full rounded-xl border-2 border-slate-200 bg-white/80 px-4 py-3 text-base text-slate-900 placeholder:text-slate-500 focus:border-emerald-500/70 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="block text-sm font-medium text-slate-700">The Mission</label>
                      <textarea
                        rows={3}
                        placeholder="What is the primary goal of this project? (e.g. Scaling Revenue, Digital Transformation, Brand Rebirth)"
                        value={proposalMission}
                        onChange={(e) => setProposalMission(e.target.value)}
                        className="w-full rounded-xl border-2 border-slate-200 bg-white/80 px-4 py-3 text-base text-slate-900 placeholder:text-slate-500 focus:border-emerald-500/70 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 leading-relaxed"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="block text-sm font-medium text-slate-700">The Methodology</label>
                      <textarea
                        rows={3}
                        placeholder="How do you work? (e.g. Agile Sprints, The 4-Phase Framework, White-Glove Service)"
                        value={proposalMethodology}
                        onChange={(e) => setProposalMethodology(e.target.value)}
                        className="w-full rounded-xl border-2 border-slate-200 bg-white/80 px-4 py-3 text-base text-slate-900 placeholder:text-slate-500 focus:border-emerald-500/70 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 leading-relaxed"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="block text-sm font-medium text-slate-700">Success Metrics</label>
                      <textarea
                        rows={2}
                        placeholder="What does a 'win' look like for the client? (e.g. 20% Conversion Increase)"
                        value={proposalSuccessMetrics}
                        onChange={(e) => setProposalSuccessMetrics(e.target.value)}
                        className="w-full rounded-xl border-2 border-slate-200 bg-white/80 px-4 py-3 text-base text-slate-900 placeholder:text-slate-500 focus:border-emerald-500/70 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 leading-relaxed"
                      />
                    </div>
                  </>
                )}
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-slate-700">Client name</label>
                  <input
                    type="text"
                    placeholder="e.g. Acme Corp"
                    value={proposalClientName}
                    onChange={(e) => setProposalClientName(e.target.value)}
                    className="w-full rounded-xl border-2 border-slate-200 bg-white/80 px-4 py-3 text-base text-slate-900 placeholder:text-slate-500 focus:border-emerald-500/70 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                {proposalTrack === "freelancer" && (
                  <>
                    <div className="space-y-3">
                      <label className="block text-sm font-medium text-slate-700">Project scope</label>
                      <textarea
                        rows={4}
                        placeholder="Describe the project or engagement..."
                        value={proposalScope}
                        onChange={(e) => setProposalScope(e.target.value)}
                        className="w-full rounded-xl border-2 border-slate-200 bg-white/80 px-4 py-3 text-base text-slate-900 placeholder:text-slate-500 focus:border-emerald-500/70 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 leading-relaxed"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="block text-sm font-medium text-slate-700">Pain points</label>
                      <textarea
                        rows={3}
                        placeholder="Client challenges or goals..."
                        value={proposalPainPoints}
                        onChange={(e) => setProposalPainPoints(e.target.value)}
                        className="w-full rounded-xl border-2 border-slate-200 bg-white/80 px-4 py-3 text-base text-slate-900 placeholder:text-slate-500 focus:border-emerald-500/70 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 leading-relaxed"
                      />
                    </div>
                  </>
                )}
                </>
                )}
                {proposalStep === 1 && proposalTrack === "firm" && canUseFirmProposal && (
                  <>
                    <div className="rounded-xl border-2 border-slate-200/60 bg-white/70 p-5 space-y-4">
                      <h3 className="text-sm font-semibold text-slate-800">Upload Tender PDF</h3>
                      <p className="text-sm text-slate-600">
                        Upload the tender document once here. It auto-fills all fields below and powers the Tender Scanner in Step 2. Otherwise enter manually.
                      </p>
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => proposalTenderPdfRef.current?.click()}
                          disabled={proposalTenderPdfImporting || !session}
                          className="inline-flex items-center gap-2 rounded-xl border-2 border-surgicalTeal/60 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-neonGreenDark hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                        >
                          <input
                            ref={proposalTenderPdfRef}
                            type="file"
                            accept="application/pdf"
                            onChange={handleProposalTenderPdf}
                            className="hidden"
                            disabled={proposalTenderPdfImporting}
                          />
                          {proposalTenderPdfImporting ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Extracting…
                            </>
                          ) : (
                            <>
                              <Upload className="h-4 w-4" />
                              Upload Tender PDF
                            </>
                          )}
                        </button>
                        <span className="text-xs text-slate-500">
                          {insufficientTenderMetadataSu ? "Top up credits to auto-fill." : `${tenderMetadataCost} SU per upload`}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">— or enter manually below —</p>
                    </div>
                    <div className="space-y-3">
                      <label className="block text-sm font-medium text-slate-700">Tender Ref Number</label>
                      <input
                        type="text"
                        placeholder="e.g. TDR-2024-001"
                        value={proposalTenderRef}
                        onChange={(e) => setProposalTenderRef(e.target.value)}
                        className="w-full rounded-xl border-2 border-slate-200 bg-white/80 px-4 py-3 text-base text-slate-900 placeholder:text-slate-500 focus:border-emerald-500/70 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="block text-sm font-medium text-slate-700">Tender Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Supply of IT Equipment and Services"
                        value={proposalTenderName}
                        onChange={(e) => setProposalTenderName(e.target.value)}
                        className="w-full rounded-xl border-2 border-slate-200 bg-white/80 px-4 py-3 text-base text-slate-900 placeholder:text-slate-500 focus:border-emerald-500/70 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="block text-sm font-medium text-slate-700">Submitted To</label>
                      <input
                        type="text"
                        placeholder="e.g. Procurement Manager, Ministry of X"
                        value={proposalSubmittedTo}
                        onChange={(e) => setProposalSubmittedTo(e.target.value)}
                        className="w-full rounded-xl border-2 border-slate-200 bg-white/80 px-4 py-3 text-base text-slate-900 placeholder:text-slate-500 focus:border-emerald-500/70 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="block text-sm font-medium text-slate-700">Document Type</label>
                      <select
                        value={proposalDocumentType}
                        onChange={(e) => setProposalDocumentType(e.target.value as "ORIGINAL" | "COPY")}
                        className="w-full rounded-xl border-2 border-slate-200 bg-white/80 px-4 py-3 text-base text-slate-900 focus:border-emerald-500/70 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      >
                        <option value="ORIGINAL">ORIGINAL</option>
                        <option value="COPY">COPY</option>
                      </select>
                      <p className="text-sm text-slate-500">Header on each page per Kenyan tender standards</p>
                    </div>
                    <div className="space-y-3">
                      <label className="block text-sm font-medium text-slate-700">Project scope</label>
                      <textarea
                        rows={4}
                        placeholder="Describe the project or engagement..."
                        value={proposalScope}
                        onChange={(e) => setProposalScope(e.target.value)}
                        className="w-full rounded-xl border-2 border-slate-200 bg-white/80 px-4 py-3 text-base text-slate-900 placeholder:text-slate-500 focus:border-emerald-500/70 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 leading-relaxed"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="block text-sm font-medium text-slate-700">Pain points</label>
                      <textarea
                        rows={3}
                        placeholder="Client challenges or goals..."
                        value={proposalPainPoints}
                        onChange={(e) => setProposalPainPoints(e.target.value)}
                        className="w-full rounded-xl border-2 border-slate-200 bg-white/80 px-4 py-3 text-base text-slate-900 placeholder:text-slate-500 focus:border-emerald-500/70 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 leading-relaxed"
                      />
                    </div>
                  </>
                )}
                {proposalStep === 2 && proposalTrack === "firm" && canUseFirmProposal && (
                  <>
                    <div className="rounded-xl border border-surgicalTeal/30 bg-emerald-500/5 px-4 py-3">
                      <p className="text-sm font-medium text-slate-800">
                        Step 3: Run each analysis below, then use the action buttons to apply suggestions.
                      </p>
                      <p className="text-sm text-slate-600 mt-1">
                        Update missing docs or past projects in{" "}
                        <Link href="/dashboard/firm-profile" className="font-medium text-neonGreenDark hover:underline">
                          Firm Profile
                        </Link>
                        {" "}so analyses and your proposal stay accurate. Then add matches and fixes to your proposal.
                      </p>
                    </div>
                    <TenderScanner
                      session={session}
                      isBetaTester={isBetaTester}
                      aiCredits={aiCredits}
                      onRefillRequest={() => setShowRefillModal(true)}
                      onCreditsRefetch={refetchProfile}
                      proposalExists={!!proposalContent}
                      onMatchesReady={(matches) => setProposalTenderMatches(matches)}
                      onAddAllMatches={(matches) => setProposalTenderMatches(matches)}
                      onComplianceMatrixReady={(matrix) => {
                        setComplianceMatrix(matrix);
                        setEnhancedProjectDescriptions({});
                        setEnhancingProjectNames(new Set());
                      }}
                      onSurgicalMatrixReady={(matrix) => setSurgicalMatrix(matrix)}
                      onReadinessReady={(prelim) => setProposalReadinessData(prelim)}
                      initialRequirements={proposalTenderRequirements}
                      initialTenderText={proposalTenderText}
                      onAddMatchToProposal={(match) => {
                        const text = match.matched_project
                          ? `• ${match.requirement}: ${match.matched_project}`
                          : `• ${match.requirement}: ${match.gap_fix || "Add relevant experience."}`;
                        setProposalContent((prev) => {
                          if (!prev) return prev;
                          const existing = prev.technicalCompliance ?? "";
                          const separator = existing ? "\n\n" : "";
                          const header = existing ? "" : "Our firm addresses tender requirements as follows:\n\n";
                          return { ...prev, technicalCompliance: `${existing}${separator}${header}${text}` };
                        });
                        setProposalTenderMatches((prev) => (prev.some((m) => m.requirement === match.requirement) ? prev : [...prev, match]));
                      }}
                    />
                    <TenderCompliance
                      session={session}
                      isBetaTester={isBetaTester}
                      aiCredits={aiCredits}
                      onRefillRequest={() => setShowRefillModal(true)}
                      onCreditsRefetch={refetchProfile}
                      proposalExists={!!proposalContent}
                      initialTenderText={proposalTenderText}
                      initialFirmCapability={proposalFirmCapabilityText}
                      onUpdateProposalWithFixes={(items) => {
                        const section = items
                          .map((i) => `• ${i.requirement} (${i.status}): ${i.fix}`)
                          .join("\n\n");
                        const text = `Our firm addresses all tender requirements as follows:\n\n${section}`;
                        setProposalContent((prev) => (prev ? { ...prev, technicalCompliance: text } : prev));
                      }}
                    />
                    <ComplianceDashboard
                      session={session}
                      isBetaTester={isBetaTester}
                      aiCredits={aiCredits}
                      onRefillRequest={() => setShowRefillModal(true)}
                      onCreditsRefetch={refetchProfile}
                      initialRequirements={proposalTenderRequirements.map((r) => r.requirement)}
                      initialMatrix={complianceMatrix}
                      onPortfolioMatchesReady={(items) => setProposalPortfolioMatches(items)}
                      proposalExists={!!proposalContent}
                      onApplyToProposal={(items) => {
                        const section = items
                          .map((i) => `• ${i.requirement}: ${i.status === "Matched" && i.evidence ? i.evidence : i.suggested_fix || "Add evidence."}`)
                          .join("\n\n");
                        const text = `Our firm addresses tender requirements as follows:\n\n${section}`;
                        setProposalContent((prev) => (prev ? { ...prev, technicalCompliance: text } : prev));
                      }}
                    />
                  </>
                )}
                {((proposalStep === 1 && (proposalTrack === "freelancer" || (proposalTrack === "firm" && !canUseFirmProposal))) || (proposalStep === 3 && proposalTrack === "firm" && canUseFirmProposal)) && (
                  <>
                {(proposalStep === 1 && proposalTrack === "firm" && !canUseFirmProposal) && (
                  <>
                    <div className="space-y-3">
                      <label className="block text-sm font-medium text-slate-700">Project scope</label>
                      <textarea
                        rows={4}
                        placeholder="Describe the project or engagement..."
                        value={proposalScope}
                        onChange={(e) => setProposalScope(e.target.value)}
                        className="w-full rounded-xl border-2 border-slate-200 bg-white/80 px-4 py-3 text-base text-slate-900 placeholder:text-slate-500 focus:border-emerald-500/70 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 leading-relaxed"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="block text-sm font-medium text-slate-700">Pain points</label>
                      <textarea
                        rows={3}
                        placeholder="Client challenges or goals..."
                        value={proposalPainPoints}
                        onChange={(e) => setProposalPainPoints(e.target.value)}
                        className="w-full rounded-xl border-2 border-slate-200 bg-white/80 px-4 py-3 text-base text-slate-900 placeholder:text-slate-500 focus:border-emerald-500/70 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 leading-relaxed"
                      />
                    </div>
                  </>
                )}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700">Schedule of rates &amp; services</label>
                  <p className="text-[11px] text-slate-500">Add phases, timelines, and costs below. This table appears in your proposal PDF.</p>
                  <PricingTable
                    milestones={proposalPricingMilestones}
                    onChange={setProposalPricingMilestones}
                    jobDescription={proposalScope || proposalPainPoints}
                    currency={proposalToneOfVoice === "international_client" ? "USD" : "KSH"}
                    session={session}
                    isBetaTester={isBetaTester}
                    aiCredits={aiCredits}
                    onRefillRequest={() => setShowRefillModal(true)}
                    onCreditsRefetch={refetchProfile}
                  />
                  {proposalTrack === "firm" && (
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={proposalVatInclusive}
                        onChange={(e) => setProposalVatInclusive(e.target.checked)}
                        className="rounded border-slate-300 bg-white/80 text-neonGreenDark focus:ring-emerald-500/50"
                      />
                      <span>Prices are VAT Inclusive</span>
                    </label>
                  )}
                </div>
                {proposalTrack === "firm" && firmProfileForProposal?.past_projects?.length && (
                  <p className="text-sm text-slate-600">
                    Past projects from your Firm Profile are used automatically in the proposal.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {proposalTrack === "freelancer" && (
                    <button
                      type="button"
                      onClick={handleImportCaseStudies}
                      className="flex-1 min-w-[160px] rounded-xl border-2 border-amber-400/60 bg-amber-50/50 px-4 py-3 text-sm font-medium text-amber-700 hover:border-amber-500/70 hover:bg-amber-100/80"
                    >
                      Import Case Studies from Resume
                    </button>
                  )}
                  {proposalTrack === "freelancer" && (
                    <button
                      type="button"
                      onClick={handleAutoInjectEvidence}
                      disabled={proposalEvidenceLoading || !session || insufficientEvidenceSu}
                      className="flex-1 min-w-[160px] rounded-xl border-2 border-amber-400/60 bg-amber-50/50 px-4 py-3 text-sm font-medium text-amber-700 hover:border-amber-500/70 hover:bg-amber-100/80 disabled:opacity-50"
                    >
                      {proposalEvidenceLoading ? "Generating…" : "✨ Auto-Inject Evidence"}
                    </button>
                  )}
                  {proposalTrack === "firm" && (
                    <button
                      type="button"
                      onClick={handleGenerateMethodology}
                      disabled={proposalMethodologyLoading || !session || insufficientMethodologySu}
                      className="flex-1 min-w-[160px] rounded-xl border-2 border-amber-400/60 bg-amber-50/50 px-4 py-3 text-sm font-medium text-amber-700 hover:border-amber-500/70 hover:bg-amber-100/80 disabled:opacity-50"
                    >
                      {proposalMethodologyLoading ? "Generating…" : "📋 Generate Methodology"}
                    </button>
                  )}
                </div>
                {proposalCaseStudies && (
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-slate-700">Case studies</label>
                    <textarea
                      rows={4}
                      placeholder={proposalTrack === "firm" ? "Case studies (from Firm Profile)" : "Case studies (imported from resume)"}
                      value={proposalCaseStudies}
                      onChange={(e) => setProposalCaseStudies(e.target.value)}
                      className="w-full rounded-xl border-2 border-slate-200 bg-white/80 px-4 py-3 text-base text-slate-900 placeholder:text-slate-500 focus:border-emerald-500/70 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 leading-relaxed"
                    />
                  </div>
                )}
                  </>
                )}
                {((proposalStep === 2 && (proposalTrack === "freelancer" || (proposalTrack === "firm" && !canUseFirmProposal))) || (proposalStep === 4 && proposalTrack === "firm" && canUseFirmProposal)) && (
                  <>
                {showProposalRefillToast && (
                  <div className="mb-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-amber-200">Refill SU to generate proposal.</span>
                    <button
                      type="button"
                      onClick={() => { setShowProposalRefillToast(false); setShowRefillModal(true); }}
                      className="text-xs font-medium text-neonGreenDark hover:underline"
                    >
                      Refill
                    </button>
                  </div>
                )}
                {proposalError && (
                  <div className="mb-2 rounded-lg border border-red-500/20 bg-red-50 px-3 py-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-red-700">{proposalError}</span>
                    <button
                      type="button"
                      onClick={() => setProposalError(null)}
                      className="text-xs font-medium text-red-700 hover:text-red-900"
                      aria-label="Dismiss"
                    >
                      ×
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleGenerateProposal}
                  disabled={
                    proposalLoading ||
                    !session ||
                    insufficientProposalSu ||
                    (proposalTrack === "firm"
                      ? !canTriggerFirmProposal
                      : !canTriggerFreelancerProposal)
                  }
                  className="btn-glimmer w-full rounded-xl border-2 bg-emerald-500 text-black font-bold border border-emerald-500 px-6 py-4 text-base font-medium disabled:opacity-50 inline-flex items-center justify-center gap-2 transition-colors hover:bg-emerald-600"
                >
                  {proposalLoading ? (
                    <>
                      <span className="surgical-pulse" aria-hidden />
                      Generating Proposal…
                    </>
                  ) : (
                    <>
                      Generate Proposal{" "}
                      <span className="ml-1 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700">
                        {requiredProposalSu} SU
                      </span>
                    </>
                  )}
                </button>
                {proposalLoading && proposalTrack === "firm" && (
                  <div className="mt-2 rounded-lg border border-slate-200 bg-white/80 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-600 mb-1">
                      Strategy Engine
                    </p>
                    <ul className="space-y-0.5 text-[11px] text-slate-700">
                      <li>• Analyzing client pain points…</li>
                      <li>• Mapping methodology to mission…</li>
                      <li>• Calculating ROI and cost of inaction…</li>
                    </ul>
                  </div>
                )}
                {canDownloadProposal && proposalContent && (
                  <button
                    type="button"
                    onClick={() => handleDownloadProposalPdf()}
                    className="w-full rounded-xl border-2 bg-emerald-500 text-black font-bold border border-emerald-500 px-4 py-3 text-base font-medium hover:bg-emerald-600"
                  >
                    Download Proposal PDF
                  </button>
                )}
                  </>
                )}
                      </div>
                      {/* Previous / Next at bottom of form */}
                      <div className="flex items-center justify-end gap-2 pt-4 mt-6 border-t border-slate-200">
                        <button
                          type="button"
                          onClick={() => setProposalStep((s) => Math.max(0, s - 1))}
                          disabled={proposalStep === 0}
                          className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-base font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <ChevronLeft className="h-5 w-5" />
                          Previous
                        </button>
                        <button
                          type="button"
                          onClick={() => setProposalStep((s) => Math.min(totalSteps - 1, s + 1))}
                          disabled={proposalStep >= totalSteps - 1}
                          className="flex items-center gap-2 rounded-xl border bg-emerald-500 text-white font-semibold border-emerald-500 px-4 py-2.5 text-base hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Next
                          <ChevronRight className="h-5 w-5" />
                        </button>
                      </div>
                    </>
                  );
                })()}
              </section>
              <AnimatePresence>
              {showProposalPreview && (
              <>
                {/* Focused mode: dim surrounding UI so the PDF preview pops */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-[2px]"
                  onClick={() => setShowProposalPreview(false)}
                  aria-hidden
                />
              <motion.section
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                className="fixed right-0 top-0 z-40 flex h-full w-full max-w-[480px] flex-col overflow-hidden border-l border-slate-200/80 bg-white shadow-[0_0_60px_rgba(0,0,0,0.15)]"
              >
                <div className="flex items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 py-3">
                  <h3 className="text-sm font-semibold text-slate-800">Proposal preview</h3>
                  <button
                    type="button"
                    onClick={() => setShowProposalPreview(false)}
                    className="group relative rounded-xl border border-emerald-400/50 bg-emerald-500/10 px-3 py-2 text-neonGreenDark shadow-[0_0_20px_rgba(0,255,136,0.25)] transition-all duration-300 hover:border-emerald-400/80 hover:bg-emerald-500/20 hover:shadow-[0_0_28px_rgba(0,255,136,0.4)] hover:scale-105 active:scale-95"
                    aria-label="Hide preview"
                  >
                    <PanelRightClose className="h-4 w-4 transition-transform group-hover:rotate-90" />
                  </button>
                </div>
                <div className="flex items-center gap-2 overflow-x-auto border-b border-slate-200/60 bg-slate-50/50 px-3 py-2">
                  {[1, 2, 3, 4, 5, 6].slice(0, proposalTrack === "firm" ? 6 : 4).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setProposalPreviewPage(p - 1)}
                      className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                        proposalPreviewPage === p - 1
                          ? "bg-emerald-500/20 text-neonGreenDark border border-emerald-500/40"
                          : "text-slate-600 hover:bg-slate-100 border border-transparent"
                      }`}
                    >
                      Page {p}
                    </button>
                  ))}
                </div>
                <div className="flex-1 overflow-y-auto overscroll-contain p-4">
                <div className="flex flex-col gap-1 mb-4">
                  <p className="text-[11px] text-slate-500">
                    {proposalContent
                      ? "Review your proposal. Use Download PDF when ready."
                      : "Fill in details and generate to see your proposal."}
                  </p>
                </div>
                {proposalTrack === "firm" && (() => {
                  const effectiveChecklist = proposalReadinessData.length > 0
                    ? proposalReadinessData
                    : mandatoryDocsToChecklist(mergeMandatoryDocsWithDefaults(DEFAULT_DOCS, firmProfileForProposal?.mandatory_docs));
                  const missingOrExpired = effectiveChecklist.filter((item) => item.status === "Missing" || item.status === "Expired");
                  if (missingOrExpired.length === 0) return null;
                  const missing = missingOrExpired.filter((i) => i.status === "Missing");
                  const expired = missingOrExpired.filter((i) => i.status === "Expired");
                  return (
                    <div className="rounded-xl border border-amber-500/50 bg-amber-50 p-4 print:hidden" role="alert">
                      <p className="text-sm font-medium text-amber-800 mb-2">
                        Before downloading: the following mandatory requirements are missing or expired.
                      </p>
                      <p className="text-xs text-amber-700 mb-2">
                        Update mandatory documents and expiry dates in Firm Profile, then run Readiness Analysis in Step 3 if needed.
                      </p>
                      <Link
                        href="/dashboard/firm-profile"
                        className="inline-flex items-center gap-2 rounded-lg border border-amber-500/60 bg-amber-500/20 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-500/30 mb-3"
                      >
                        Update in Firm Profile →
                      </Link>
                      <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
                        {missing.length > 0 && (
                          <li><span className="font-medium">Missing:</span> {missing.map((i) => i.requirement).join("; ")}</li>
                        )}
                        {expired.length > 0 && (
                          <li><span className="font-medium">Expired:</span> {expired.map((i) => i.requirement).join("; ")}</li>
                        )}
                      </ul>
                    </div>
                  );
                })()}
                <div
                  ref={proposalRef}
                  className="proposal-print-wrapper rounded-xl overflow-x-hidden border border-slate-200/80 bg-[#fefefe] shadow-lg"
                >
                  {/* Page 1: Cover - Tender Name, Number, Company Logo/Name */}
                  <div className="proposal-print-page proposal-cover resume-paper print-resume-page rounded-xl shadow-lg px-10 py-14 mb-4 flex flex-col justify-center min-h-[280px] border border-slate-200/80 bg-[#fefefe] print:border-slate-400 relative" style={proposalTrack === "firm" ? { borderColor: proposalAccentColor } : undefined}>
                    {proposalTrack === "firm" && (
                      <div className="absolute top-4 right-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-600 print:text-slate-700 tender-doc-header">
                        {proposalDocumentType}
                      </div>
                    )}
                    <div className={`text-center ${theme === "surgeon" ? "theme-surgeon" : theme === "partner" ? "theme-partner" : "theme-innovator"}`}>
                      {proposalTrack === "firm" ? (
                        <>
                          {proposalLogo && (
                            <div className="flex justify-center mb-8">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={proposalLogo} alt="Company logo" className="h-16 w-auto max-w-[200px] object-contain print:h-14" />
                            </div>
                          )}
                          <p className="text-[18pt] font-bold text-slate-900 mb-2 print:text-black">TENDER NO.</p>
                          <p className="text-[18pt] font-bold text-slate-900 mb-6 print:text-black print:text-[18pt]" data-tender-ref>{proposalTenderRef || "[Tender Reference Number]"}</p>
                          <p className="text-[18pt] font-bold text-slate-900 mb-2 print:text-black">TENDER NAME</p>
                          <p className="text-[18pt] font-bold text-slate-900 mb-12 max-w-2xl mx-auto print:text-black print:text-[18pt]" data-tender-name>{proposalTenderName || proposalScope || "[Tender Name / Description]"}</p>
                          <div className="mt-8 space-y-4 text-left max-w-md mx-auto">
                            {proposalSubmittedTo && (
                              <p className="text-sm text-slate-700"><span className="font-semibold">Submitted to:</span> {proposalSubmittedTo}</p>
                            )}
                            <p className="text-sm text-slate-700"><span className="font-semibold">Submitted by:</span> {firmProfileForProposal?.company_name || "[Company Name]"}</p>
                            <p className="text-sm text-slate-700"><span className="font-semibold">Date of Submission:</span> {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="resume-header-name text-4xl md:text-5xl font-bold text-slate-900 mb-4 tracking-tight">
                            {firmProfileForProposal?.company_name || fullName || "Your Name"}
                          </p>
                          <p className="resume-header-title text-lg uppercase tracking-[0.25em] text-slate-600 mb-8">Executive Proposal</p>
                          <p className="resume-body text-base text-slate-600 mb-2">{proposalClientName ? `Prepared for ${proposalClientName}` : "Prepared for Client"}</p>
                          <p className="text-sm text-slate-500">{new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
                        </>
                      )}
                    </div>
                    <div className="proposal-page-footer proposal-page-number mt-auto pt-8 text-[10px] text-slate-500 text-center tender-page-serial">
                      Confidential
                    </div>
                  </div>
                  {/* Page 2: Table of Contents (firm only) */}
                  {proposalTrack === "firm" && (
                    <div className="proposal-print-page tender-doc-page resume-paper print-resume-page rounded-xl border border-slate-200/80 shadow-lg px-8 py-8 mb-4 relative bg-[#fefefe]">
                      <div className="absolute top-4 right-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-600 tender-doc-header">{proposalDocumentType}</div>
                      <h3 className="font-display text-sm uppercase tracking-[0.22em] text-slate-700 mb-4">Table of Contents</h3>
                      <div className="h-px w-16 mb-6" style={{ backgroundColor: proposalAccentColor }} />
                      <ul className="space-y-3 text-[11pt] text-slate-800 list-none pl-0">
                        <li className="flex items-baseline justify-between gap-4">
                          <div>
                            <a href="#section-i" className="font-semibold text-slate-800 hover:underline">
                              Section I: Preliminary Compliance
                            </a>
                            <ul className="mt-1 pl-4 text-[10pt] text-slate-600 space-y-0.5">
                              <li>Mandatory Requirements Checklist</li>
                            </ul>
                          </div>
                          <span className="text-[10pt] text-slate-500 tabular-nums">3</span>
                        </li>
                        <li className="flex items-baseline justify-between gap-4">
                          <div>
                            <a href="#section-ii" className="font-semibold text-slate-800 hover:underline">
                              Section II: Technical Capability &amp; Experience
                            </a>
                            <ul className="mt-1 pl-4 text-[10pt] text-slate-600 space-y-0.5">
                              <li>Executive Summary &amp; Strategic Diagnosis</li>
                              <li>Technical Compliance Matrix</li>
                              <li>Project Case Studies</li>
                              <li>Implementation Methodology</li>
                            </ul>
                          </div>
                          <span className="text-[10pt] text-slate-500 tabular-nums">4</span>
                        </li>
                        <li className="flex items-baseline justify-between gap-4">
                          <div>
                            <a href="#section-iii" className="font-semibold text-slate-800 hover:underline">
                              Section III: Schedule of Rates &amp; Services
                            </a>
                            <ul className="mt-1 pl-4 text-[10pt] text-slate-600 space-y-0.5">
                              <li>Financial Proposal</li>
                              <li>Schedule of Rates &amp; Services</li>
                              <li>Terms &amp; Conditions (Institutional)</li>
                            </ul>
                          </div>
                          <span className="text-[10pt] text-slate-500 tabular-nums">5</span>
                        </li>
                        <li className="flex items-baseline justify-between gap-4">
                          <div>
                            <a href="#section-next-steps" className="font-semibold text-slate-800 hover:underline">
                              Next Steps &amp; Terms
                            </a>
                            <ul className="mt-1 pl-4 text-[10pt] text-slate-600 space-y-0.5">
                              <li>Project Commencement &amp; Mobilization</li>
                              <li>Project Kickoff Checklist</li>
                              <li>Terms &amp; Conditions (The Legal Framework)</li>
                              <li>Signature of Authority</li>
                            </ul>
                          </div>
                          <span className="text-[10pt] text-slate-500 tabular-nums">6</span>
                        </li>
                      </ul>
                      <div className="tender-page-footer proposal-page-number mt-16 pt-6 border-t border-slate-200 text-[10px] text-slate-500 text-center">
                        Confidential
                      </div>
                    </div>
                  )}
                  {/* Section I: Preliminary Compliance - MANDATORY REQUIREMENTS CHECKLIST (firm only) */}
                  {proposalTrack === "firm" && (
                    <div className="proposal-print-page tender-doc-page resume-paper print-resume-page rounded-xl border border-slate-200/80 shadow-lg px-8 py-8 mb-4 relative bg-[#fefefe]" id="section-i">
                      {/* PDF Header: Deep Obsidian top bar (Tender No. + Company) + ORIGINAL stamp */}
                      <div className="-mx-8 -mt-8 flex items-center justify-between rounded-t-xl px-8 py-3 mb-6 print:bg-[#020617]" style={{ backgroundColor: "#020617" }}>
                        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-white/95">Tender No.</span>
                          <span className="text-sm font-bold text-emerald-400">{proposalTenderRef || "—"}</span>
                          <span className="text-white/40" aria-hidden>|</span>
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-white/95">Company</span>
                          <span className="text-sm font-bold text-white">{firmProfileForProposal?.company_name || "—"}</span>
                        </div>
                        <span className="shrink-0 text-sm font-bold uppercase tracking-[0.2em] select-none print:opacity-90" style={{ color: "rgba(127, 29, 29, 0.85)", fontFamily: "Georgia, 'Times New Roman', serif" }} aria-hidden>ORIGINAL</span>
                      </div>
                      <div className="tender-section-divider mb-6">
                        <h2 className="font-display text-base font-bold uppercase tracking-[0.2em] text-slate-800">Section I: Preliminary Compliance</h2>
                        <div className="h-px w-full mt-2 bg-slate-300" />
                      </div>
                      <h3 className="text-sm font-semibold text-slate-800 mb-4">INDEX OF MANDATORY ATTACHMENTS</h3>
                      <div className="mb-3 rounded-md border border-slate-200 bg-white/80 px-3 py-2">
                        <p className="text-[10px] italic text-slate-500">
                          Note to Evaluator: All mandatory documents have been chronologically serialized and labeled with the corresponding Annex/Appendix ID listed below for ease of preliminary verification.
                        </p>
                      </div>
                      <div className="border border-[#F59E0B] rounded-lg overflow-hidden">
                        <table className="w-full border-collapse text-[11pt]">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                              <th className="text-left py-2.5 px-4 font-semibold text-[12px] uppercase tracking-wider text-slate-500 border-r border-slate-200">
                                Document Description
                              </th>
                              <th className="text-left py-2.5 px-4 font-semibold text-[12px] uppercase tracking-wider text-slate-500 border-r border-slate-200">
                                Annex Reference
                              </th>
                              <th className="text-left py-2.5 px-4 font-semibold text-[12px] uppercase tracking-wider text-slate-500 w-32">
                                Status
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {(proposalReadinessData.length > 0
                              ? proposalReadinessData
                              : mandatoryDocsToChecklist(mergeMandatoryDocsWithDefaults(DEFAULT_DOCS, firmProfileForProposal?.mandatory_docs))
                            )
                              .filter((item) => item.status === "Found")
                              .map((item, i) => {
                                const annexLetter = String.fromCharCode(65 + (i % 26)); // A, B, C...
                                const annexCode = `${annexLetter}-${i + 1}`;
                                const referenceText = `Annex ${annexCode}`;
                                return (
                                  <tr key={i} className="border-b border-slate-200">
                                    <td className="py-2.5 px-4 text-slate-800 border-r border-slate-200">{item.requirement}</td>
                                    <td className="py-2.5 px-4 text-slate-700 border-r border-slate-200">{referenceText}</td>
                                    <td className="py-2.5 px-4 w-32">
                                      <span className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold bg-[#ECFDF5] text-[#064E3B]">
                                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#064E3B]" aria-hidden />
                                        Attached &amp; Valid
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                      <p className="mt-3 text-[10pt] font-semibold text-slate-700">
                        Note: All documents listed above are certified true copies of the original and are attached herein for your preliminary verification.
                      </p>
                      <div className="mt-3 text-[10pt] text-slate-600 italic">
                        Verification Signature: ______________________   Date: ______________________
                      </div>
                      {(() => {
                        const sectionIChecklist = proposalReadinessData.length > 0 ? proposalReadinessData : mandatoryDocsToChecklist(mergeMandatoryDocsWithDefaults(DEFAULT_DOCS, firmProfileForProposal?.mandatory_docs));
                        const hasExpired = sectionIChecklist.some((item) => item.status === "Expired");
                        return hasExpired ? (
                          <p className="mt-4 text-[10pt] text-slate-600 italic">Documents marked Expired should be renewed prior to submission.</p>
                        ) : null;
                      })()}
                      <div className="tender-page-footer proposal-page-number mt-12 pt-6 border-t border-slate-200 text-[10px] text-slate-500 text-center">
                        Confidential
                      </div>
                    </div>
                  )}
                  {/* Section II: Technical Capability & Experience - Executive Summary, Diagnosis, Evidence, Methodology (firm only) */}
                  {proposalTrack === "firm" && (
                    <div className="proposal-print-page tender-doc-page resume-paper print-resume-page rounded-xl border border-slate-200/80 shadow-lg px-8 py-8 mb-4 relative bg-[#fefefe]" id="section-ii">
                      <div className="absolute top-4 right-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-600 tender-doc-header">{proposalDocumentType}</div>
                      <div className="tender-section-divider mb-6">
                        <h2 className="font-display text-base font-bold uppercase tracking-[0.2em] text-slate-800">Section II: Technical Capability &amp; Experience</h2>
                        <div className="h-px w-full mt-2 bg-slate-300" />
                      </div>
                      {/* Compliance Matrix (Quick Win) — 3-column industry-agnostic table at top of Section II */}
                      {surgicalMatrix && surgicalMatrix.length > 0 && (
                        <div className="mb-8">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Compliance Matrix — Quick Win</p>
                          <div className="overflow-hidden rounded-lg border border-slate-200">
                            <table className="w-full border-collapse text-[11pt]">
                              <thead>
                                <tr className="bg-[#064E3B]">
                                  <th className="text-left py-2.5 px-4 font-semibold text-white text-[11px] uppercase tracking-wider border-r border-white/20">Technical Specification</th>
                                  <th className="text-left py-2.5 px-4 font-semibold text-white text-[11px] uppercase tracking-wider border-r border-white/20 w-40">Our Compliance Status</th>
                                  <th className="text-left py-2.5 px-4 font-semibold text-white text-[11px] uppercase tracking-wider">Evidence Reference</th>
                                </tr>
                              </thead>
                              <tbody>
                                {surgicalMatrix.map((row, i) => {
                                  const statusLabel = row.status === "Compliant" ? "Full Compliance" : "Substantial Compliance";
                                  const evidenceText = row.ref_project
                                    ? `${row.proof} — ${row.ref_project}`
                                    : row.proof;
                                  return (
                                    <tr key={i} className={`border-b border-slate-200 last:border-b-0 ${i % 2 === 0 ? "bg-slate-50/50" : "bg-white"}`}>
                                      <td className="py-2.5 px-4 text-slate-800 border-r border-slate-100 align-top">{row.requirement}</td>
                                      <td className="py-2.5 px-4 border-r border-slate-100 w-40 align-top">
                                        <span className="inline-flex items-center rounded-full border border-[#064E3B]/30 bg-[#ECFDF5] px-2.5 py-0.5 text-[10px] font-semibold text-[#064E3B]">
                                          {statusLabel}
                                        </span>
                                      </td>
                                      <td className="py-2.5 px-4 text-slate-700 align-top">{evidenceText || "—"}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      {proposalContent?.executiveSummary && (
                        <>
                          <h3 className="text-sm font-semibold text-slate-800 mb-3">EXECUTIVE SUMMARY</h3>
                          <div className="resume-body text-slate-700 text-[11pt] leading-relaxed whitespace-pre-line mb-6">{proposalContent.executiveSummary}</div>
                        </>
                      )}
                      {proposalContent?.strategicDiagnosis && (
                        <>
                          <h3 className="text-sm font-semibold text-slate-800 mb-3">STRATEGIC DIAGNOSIS</h3>
                          <div className="resume-body text-slate-700 text-[11pt] leading-relaxed whitespace-pre-line mb-6">{proposalContent.strategicDiagnosis}</div>
                        </>
                      )}
                      <h3 className="text-sm font-semibold text-slate-800 mb-4">TECHNICAL CAPABILITY &amp; EXPERIENCE</h3>
                      {(() => {
                        const slug = (s: string) => (s || "").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "profile";
                        const useMatrix = complianceMatrix && complianceMatrix.length > 0;
                        const projectNamesFromMatrix = useMatrix
                          ? Array.from(new Set(complianceMatrix.map((r) => r.project_reference).filter((n) => n && n.trim())))
                          : [];
                        const matches = proposalPortfolioMatches.length > 0 ? proposalPortfolioMatches : proposalTenderMatches;
                        const getEvidence = (m: typeof matches[0]) => ("evidence" in m ? m.evidence : m.matched_project) || ("suggested_fix" in m ? m.suggested_fix : m.gap_fix) || "";
                        const getResult = (m: typeof matches[0]) => ("result" in m ? m.result : undefined);
                        const extractProjectName = (s: string) => {
                          const t = s?.trim() || "";
                          const prefix = "Implementation Case Study:";
                          if (t.toLowerCase().startsWith(prefix.toLowerCase())) return t.slice(prefix.length).trim().split(/[.;]/)[0]?.trim() || t;
                          return t.split(/[.;]/)[0]?.trim() || t || "—";
                        };
                        const matrixRows = useMatrix
                          ? []
                          : matches.map((m) => ({
                              requirement: m.requirement,
                              ourCapability: getResult(m) || getEvidence(m)?.replace(/^Implementation Case Study:\s*/i, "").split(/[.;]/)[0]?.trim() || "—",
                              referenceProject: extractProjectName(getEvidence(m) || ""),
                            }));
                        const projectNames = useMatrix ? projectNamesFromMatrix : Array.from(new Set(matrixRows.map((r) => r.referenceProject).filter((n) => n && n !== "—")));
                        const pastProjects = firmProfileForProposal?.past_projects ?? [];
                        const projectProfiles = projectNames.map((refName) => {
                          const normalized = refName.toLowerCase().trim();
                          const fromPast = pastProjects.find((p) => (p.title || "").toLowerCase().trim() === normalized || (p.title || "").toLowerCase().includes(normalized) || normalized.includes((p.title || "").toLowerCase()));
                          const requirementsAddressed = useMatrix
                            ? (complianceMatrix ?? []).filter((r) => r.project_reference === refName).map((r) => r.requirement)
                            : matrixRows.filter((r) => r.referenceProject === refName).map((r) => r.requirement);
                          return {
                            projectName: refName,
                            client: fromPast?.client ?? "—",
                            year: fromPast?.year ?? "—",
                            scope: fromPast?.results ? fromPast.results.split(/[.!?]/)[0]?.trim() + (fromPast.results.includes(".") ? "." : "") : "—",
                            keyDeliverables: fromPast?.results ?? (requirementsAddressed.length ? `Addresses: ${requirementsAddressed.join("; ")}` : "—"),
                            requirementsAddressed,
                          };
                        });
                        const companyName = firmProfileForProposal?.company_name ?? "[Company Name]";
                        const tenderName = proposalTenderName || proposalTenderRef || "[Tender Name]";
                        const strategicAlignmentText = projectNames.length > 0
                          ? `Based on our successful delivery for ${projectNames.join(" and ")}, ${companyName} is uniquely positioned to handle the ${tenderName} with 100% technical alignment.`
                          : "";
                        const hasTable = useMatrix ? complianceMatrix!.length > 0 : matrixRows.length > 0;

                        return (
                          <>
                            {hasTable && (
                              <div className="mb-6">
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                                  Technical Compliance Matrix — Quick win view
                                </p>
                                <div className="overflow-hidden rounded-lg border border-slate-200">
                                  <table className="w-full border-collapse text-[11pt]">
                                    <thead>
                                      <tr className="bg-[#064E3B]">
                                        <th className="text-left py-2.5 px-4 font-semibold text-white text-[11px] uppercase tracking-wider border-r border-white/20">
                                          Technical Specification
                                        </th>
                                        <th className="text-left py-2.5 px-4 font-semibold text-white text-[11px] uppercase tracking-wider border-r border-white/20">
                                          Our Compliance Status
                                        </th>
                                        <th className="text-left py-2.5 px-4 font-semibold text-white text-[11px] uppercase tracking-wider">
                                          Evidence Reference
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {useMatrix && complianceMatrix
                                        ? complianceMatrix.map((row, i) => {
                                            const statusLabel =
                                              row.compliance_status === "Full" ? "Full Compliance" : "Substantial Compliance";
                                            return (
                                              <tr
                                                key={i}
                                                className={`border-b border-slate-200 last:border-b-0 ${
                                                  i % 2 === 0 ? "bg-slate-50/50" : "bg-white"
                                                }`}
                                              >
                                                <td className="py-2.5 px-4 text-slate-800 border-r border-slate-100">
                                                  {row.requirement}
                                                </td>
                                                <td className="py-2.5 px-4 text-slate-700 border-r border-slate-100 align-top">
                                                  <div className="space-y-1.5">
                                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ECFDF5] px-2.5 py-0.5 text-[10px] font-semibold text-[#064E3B]">
                                                      <span
                                                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#064E3B]"
                                                        aria-hidden
                                                      />
                                                      {statusLabel}
                                                    </span>
                                                    {row.proof_summary && (
                                                      <p className="text-[10px] leading-snug text-slate-700">
                                                        {row.proof_summary}
                                                      </p>
                                                    )}
                                                  </div>
                                                </td>
                                                <td className="py-2.5 px-4 text-slate-700">
                                                  {row.project_reference ? (
                                                    <a
                                                      href={`#profile-${slug(row.project_reference)}`}
                                                      className="text-emerald-700 font-medium underline hover:text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 rounded"
                                                    >
                                                      {row.project_reference}
                                                    </a>
                                                  ) : (
                                                    "—"
                                                  )}
                                                </td>
                                              </tr>
                                            );
                                          })
                                        : matrixRows.map((row, i) => (
                                            <tr key={i} className={`border-b border-slate-200 last:border-b-0 ${i % 2 === 0 ? "bg-slate-50/50" : "bg-white"}`}>
                                              <td className="py-2.5 px-4 text-slate-800 border-r border-slate-100">{row.requirement}</td>
                                              <td className="py-2.5 px-4 text-slate-700 border-r border-slate-100">{row.ourCapability}</td>
                                              <td className="py-2.5 px-4 text-slate-700">{row.referenceProject}</td>
                                            </tr>
                                          ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                            {projectProfiles.length > 0 && (
                              <div className="space-y-4 mb-6">
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Project Experience Profiles</p>
                                {projectProfiles.map((profile, i) => (
                                  <ProjectProfile
                                    key={i}
                                    title={profile.projectName}
                                    client={profile.client}
                                    year={profile.year}
                                    results={enhancedProjectDescriptions[profile.projectName] ?? profile.keyDeliverables}
                                    requirementsAddressed={profile.requirementsAddressed}
                                    profileId={`profile-${slug(profile.projectName)}`}
                                    enhancing={enhancingProjectNames.has(profile.projectName)}
                                  />
                                ))}
                              </div>
                            )}
                            {pastProjects.length > 0 && (
                              <div className="space-y-4 mb-6">
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Project Experience Profiles</p>
                                {pastProjects.map((p, i) => {
                                  const projectTitle = (p.title || "").trim() || "Project";
                                  const valueBrief = p.results?.trim() ? p.results.split(/[.!?]/)[0]?.trim() + (p.results.includes(".") ? "." : "") : undefined;
                                  return (
                                    <ProjectCaseStudy
                                      key={i}
                                      title={projectTitle}
                                      client={p.client || "—"}
                                      year={p.year || "—"}
                                      value={valueBrief}
                                      solutionAndImpact={enhancedProjectDescriptions[projectTitle] ?? p.results ?? "—"}
                                      caseStudyId={`case-study-${slug(projectTitle)}`}
                                      enhancing={enhancingProjectNames.has(projectTitle)}
                                    />
                                  );
                                })}
                              </div>
                            )}
                            {strategicAlignmentText && (
                              <p className="resume-body text-slate-700 text-[11pt] leading-relaxed border-t border-slate-200 pt-4">
                                {boldMetricsInText(strategicAlignmentText)}
                              </p>
                            )}
                            {!hasTable && projectProfiles.length === 0 && proposalContent?.technicalCompliance?.trim() && (
                              <div className="resume-body text-slate-700 text-[11pt] leading-relaxed whitespace-pre-line mb-4">
                                {boldMetricsInText(proposalContent.technicalCompliance)}
                              </div>
                            )}
                            {!hasTable && projectProfiles.length === 0 && !(proposalContent?.technicalCompliance?.trim()) && (
                              <p className="text-slate-600 text-[10pt] leading-relaxed italic">
                                Technical capability and evidence are set out in response to the tender requirements and the firm&apos;s past performance.
                              </p>
                            )}
                          </>
                        );
                      })()}
                      {proposalContent?.proprietaryProcess && (
                        <div className="mt-8 pt-6 border-t border-slate-200">
                          <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600 mb-1">Our Methodology</h3>
                          <p className="text-[10px] text-slate-500 mb-4">4-Phase Implementation Roadmap</p>
                          {(() => {
                            const text = proposalContent.proprietaryProcess.replace(/\*\*([^*]+)\*\*/g, "$1");
                            const phases = parseMethodologyPhases(text);
                            if (phases.length >= 1) {
                              return (
                                <div className="relative">
                                  {/* Vertical timeline with York Gold (#F59E0B) milestone circles */}
                                  {phases.map((phase, i) => (
                                    <div key={i} className="relative flex gap-4 last:pb-0" style={{ paddingBottom: i < phases.length - 1 ? "1.5rem" : 0 }}>
                                      <div className="flex flex-col items-center shrink-0 w-4">
                                        <div className="h-4 w-4 rounded-full border-2 border-[#F59E0B] bg-[#F59E0B] shrink-0" aria-hidden />
                                        {i < phases.length - 1 && (
                                          <div className="w-0.5 mt-1 bg-slate-200 min-h-[2rem] flex-1" aria-hidden />
                                        )}
                                      </div>
                                      <div className="flex-1 min-w-0 pt-0.5">
                                        <h4 className="text-[10pt] font-semibold text-slate-800 uppercase tracking-wider mb-1.5">{phase.title}</h4>
                                        {phase.bullets.length > 0 ? (
                                          <ul className="list-none space-y-1 text-slate-700 text-[10pt] leading-relaxed">
                                            {phase.bullets.map((bullet, j) => (
                                              <li key={j} className="flex gap-2">
                                                <span className="text-[#F59E0B] shrink-0">•</span>
                                                <span>{bullet}</span>
                                              </li>
                                            ))}
                                          </ul>
                                        ) : null}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              );
                            }
                            return <div className="resume-body text-slate-800 text-[11pt] leading-relaxed whitespace-pre-line">{text}</div>;
                          })()}
                        </div>
                      )}
                      {proposalContent?.timelineDeliverables && (
                        <div className="mt-8 pt-6 border-t border-slate-200">
                          <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600 mb-4">Timeline &amp; Deliverables</h3>
                          {(() => {
                            const phases = parseTimelinePhases(proposalContent.timelineDeliverables);
                            if (phases.length > 0) {
                              return (
                                <div className="border border-slate-200 rounded-lg overflow-hidden">
                                  <table className="w-full border-collapse text-[11pt]">
                                    <thead>
                                      <tr className="border-b border-slate-200 bg-slate-50">
                                        <th className="text-left py-2.5 px-4 font-medium text-slate-600 text-[10px] uppercase tracking-[0.18em]">Phase</th>
                                        <th className="text-left py-2.5 px-4 font-medium text-slate-600 text-[10px] uppercase tracking-[0.18em] w-28">Timeframe</th>
                                        <th className="text-left py-2.5 px-4 font-medium text-slate-600 text-[10px] uppercase tracking-[0.18em]">Key Deliverables</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {phases.map((row, i) => (
                                        <tr key={i} className="border-b border-slate-100">
                                          <td className="py-2.5 px-4 text-slate-800 font-medium">{row.phase}</td>
                                          <td className="py-2.5 px-4 text-slate-600 text-[10pt]">{row.timeframe || "—"}</td>
                                          <td className="py-2.5 px-4 text-slate-700 text-[10pt] leading-snug">{row.deliverables}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              );
                            }
                            return <div className="resume-body text-slate-700 text-[11pt] leading-relaxed whitespace-pre-line">{proposalContent.timelineDeliverables}</div>;
                          })()}
                        </div>
                      )}
                      {proposalContent?.riskMitigations && proposalContent.riskMitigations.length > 0 && (
                        <div className="mt-8 pt-6 border-t border-slate-200">
                          <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600 mb-4">Risk Assessment</h3>
                          <div className="border border-slate-300 rounded-lg overflow-hidden">
                            <table className="w-full border-collapse text-[11pt]">
                              <thead>
                                <tr className="bg-[#020617] text-white">
                                  <th className="text-left py-2.5 px-4 font-medium text-[10px] uppercase tracking-[0.18em] border-r border-white/10">Risk</th>
                                  <th className="text-left py-2.5 px-4 font-medium text-[10px] uppercase tracking-[0.18em]">Mitigation Strategy</th>
                                </tr>
                              </thead>
                              <tbody>
                                {proposalContent.riskMitigations.map((row, i) => (
                                  <tr
                                    key={i}
                                    className={i % 2 === 0 ? "bg-white border-b border-slate-200" : "bg-slate-50 border-b border-slate-200"}
                                  >
                                    <td className="py-2.5 px-4 text-slate-800 font-medium align-top">{row.risk}</td>
                                    <td className="py-2.5 px-4 text-slate-700 text-[10pt] leading-relaxed">
                                      {row.response}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      {proposalContent?.roadmapMilestones && (proposalContent.roadmapMilestones.discovery?.length || proposalContent.roadmapMilestones.surgery?.length || proposalContent.roadmapMilestones.postOp?.length) && (
                        <div className="mt-8 pt-6 border-t border-slate-200">
                          <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600 mb-4">Phased Roadmap</h3>
                          <div className="flex flex-wrap items-stretch gap-0">
                            <div className="flex-1 min-w-[120px] border border-slate-200 rounded-l-lg overflow-hidden">
                              <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200" style={{ color: proposalAccentColor }}>Discovery</div>
                              <ul className="px-3 py-2 space-y-1 list-none">
                                {(proposalContent.roadmapMilestones.discovery || []).map((m, i) => (
                                  <li key={i} className="text-[10pt] text-slate-700">• {m}</li>
                                ))}
                              </ul>
                            </div>
                            <div className="flex shrink-0 items-center px-1 self-center">
                              <span className="text-slate-700" aria-hidden>→</span>
                            </div>
                            <div className="flex-1 min-w-[120px] border border-slate-200 overflow-hidden">
                              <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider border-b border-slate-200" style={{ color: proposalAccentColor }}>Surgery / Execution</div>
                              <ul className="px-3 py-2 space-y-1 list-none">
                                {(proposalContent.roadmapMilestones.surgery || []).map((m, i) => (
                                  <li key={i} className="text-[10pt] text-slate-700">• {m}</li>
                                ))}
                              </ul>
                            </div>
                            <div className="flex shrink-0 items-center px-1 self-center">
                              <span className="text-slate-700" aria-hidden>→</span>
                            </div>
                            <div className="flex-1 min-w-[120px] border border-slate-200 rounded-r-lg overflow-hidden">
                              <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200" style={{ color: proposalAccentColor }}>Post-Op / Support</div>
                              <ul className="px-3 py-2 space-y-1 list-none">
                                {(proposalContent.roadmapMilestones.postOp || []).map((m, i) => (
                                  <li key={i} className="text-[10pt] text-slate-700">• {m}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      )}
                      {(proposalContent?.costOfInaction || proposalContent?.successOutcome || proposalContent?.totalValueDelivered) && (
                        <div className="mt-8 pt-6 border-t border-slate-200">
                          <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600 mb-4">Impact Summary</h3>
                          <div className="space-y-2 text-[11pt]">
                            {proposalContent.totalValueDelivered && (
                              <p>
                                <span className="font-semibold text-slate-800">Total value delivered:</span>{" "}
                                <span className="font-bold" style={{ color: "#F59E0B" }}>
                                  {proposalContent.totalValueDelivered}
                                </span>{" "}
                                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">ROI-Driven Investment</span>
                              </p>
                            )}
                            {proposalContent.costOfInaction && (
                              <p>
                                <span className="font-medium text-slate-500">Cost of inaction:</span>{" "}
                                <span className="text-slate-500">{proposalContent.costOfInaction}</span>
                              </p>
                            )}
                            {proposalContent.successOutcome && (
                              <p>
                                <span className="font-medium text-slate-700">Success outcome:</span>{" "}
                                <span className="text-slate-700">{proposalContent.successOutcome}</span>
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                      <div className="tender-page-footer proposal-page-number mt-12 pt-6 border-t border-slate-200 text-[10px] text-slate-500 text-center">
                        Confidential
                      </div>
                    </div>
                  )}
                  {/* Section III: Schedule of Rates & Services - Fiscal Authority tone, pricing table, footer, signature (firm only) */}
                  {proposalTrack === "firm" && (
                    <div className="proposal-print-page tender-doc-page resume-paper print-resume-page rounded-xl border border-slate-200/80 shadow-lg px-8 py-8 mb-4 relative bg-[#fefefe]" id="section-iii">
                      <div className="absolute top-4 right-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-600 tender-doc-header">{proposalDocumentType}</div>
                      <div className="tender-section-divider mb-6">
                        <h2 className="font-display text-base font-bold uppercase tracking-[0.2em] text-slate-800">Section III: Schedule of Rates &amp; Services</h2>
                        <div className="h-px w-full mt-2 bg-slate-300" />
                      </div>
                      <div className="mb-6">
                        <h3 className="text-sm font-semibold text-slate-800 mb-3">FINANCIAL PROPOSAL</h3>
                        <p className="resume-body text-slate-700 text-[11pt] leading-relaxed">
                          This Financial Proposal is submitted in accordance with the Tender Requirements. The total fixed-price investment for the full scope of works is {(() => {
                            const total = proposalPricingMilestones.reduce((sum, i) => sum + (Number.isFinite(i.cost) ? i.cost : 0), 0);
                            return total > 0 ? formatProposalCost(total) : "KES 12,000,000";
                          })()}. All prices are inclusive of 16% VAT and applicable statutory levies.
                        </p>
                      </div>
                      <h3 className="text-sm font-semibold text-slate-800 mb-4">SCHEDULE OF RATES &amp; SERVICES</h3>
                      <div className="proposal-pricing-table border border-slate-300 rounded-lg overflow-hidden">
                        <table className="w-full border-collapse text-[11pt]" style={{ borderCollapse: "collapse" }}>
                          <thead>
                            <tr className="bg-[#064E3B]">
                              <th className="text-left py-2.5 px-4 font-semibold text-white text-[10px] uppercase tracking-[0.18em] border-r border-white/20">Task / Milestone</th>
                              <th className="text-left py-2.5 px-4 font-semibold text-white text-[10px] uppercase tracking-[0.18em] w-28 border-r border-white/20">Timeline</th>
                              <th className="text-right py-2.5 px-4 font-semibold text-white text-[10px] uppercase tracking-[0.18em] border-r border-white/20">{proposalCurrency.costHeader}</th>
                              <th className="text-left py-2.5 px-4 font-semibold text-white text-[10px] uppercase tracking-[0.18em] w-32">Remarks</th>
                            </tr>
                          </thead>
                          <tbody>
                            {proposalPricingMilestones.filter((i) => i.task.trim() || i.timeline.trim() || i.cost).length > 0
                              ? proposalPricingMilestones
                                  .filter((i) => i.task.trim() || i.timeline.trim() || i.cost)
                                  .map((item) => (
                                    <tr key={item.id} className="align-top">
                                      <td className="py-2.5 px-4 text-slate-800 text-[11pt] border border-slate-300">{item.task || "—"}</td>
                                      <td className="py-2.5 px-4 text-slate-600 text-[10pt] border border-slate-300">{item.timeline || "—"}</td>
                                      <td className="py-2.5 px-4 text-right text-slate-800 border border-slate-300">
                                        {item.cost ? formatProposalCost(item.cost) : "—"}
                                      </td>
                                      <td className="py-2.5 px-4 text-slate-600 text-[10pt] border border-slate-300">Fixed Price</td>
                                    </tr>
                                  ))
                              : (
                                <tr>
                                  <td className="py-4 px-4 text-slate-600 text-[10pt] border border-slate-300">Rates and services as per commercial proposal</td>
                                  <td className="py-4 px-4 text-slate-500 text-[10pt] border border-slate-300">—</td>
                                  <td className="py-4 px-4 text-right text-slate-500 text-[10pt] border border-slate-300">—</td>
                                  <td className="py-4 px-4 text-slate-500 text-[10pt] border border-slate-300">Fixed Price</td>
                                </tr>
                              )}
                          </tbody>
                          <tfoot>
                            <tr className="bg-[#F59E0B]">
                              <td className="pt-3 pb-2 px-4 font-bold text-black border-t-2 border-[#F59E0B]" colSpan={2}>
                                Grand Total
                                {proposalVatInclusive && <span className="block text-[10px] font-semibold text-black/80 mt-0.5">VAT Inclusive</span>}
                              </td>
                              <td className="text-right pt-3 pb-2 px-4 font-bold text-black border-t-2 border-[#F59E0B]">
                                {formatProposalCost(proposalPricingMilestones.reduce((sum, i) => sum + (Number.isFinite(i.cost) ? i.cost : 0), 0))}
                                {proposalVatInclusive && <span className="block text-[10px] font-semibold text-black/80 mt-0.5">VAT Inclusive</span>}
                              </td>
                              <td className="pt-3 pb-2 px-4 font-bold text-black border-t-2 border-[#F59E0B]">—</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                      <div className="mt-6 space-y-2 text-[10pt] text-slate-700 border-t border-slate-200 pt-4">
                        <p className="font-medium text-slate-800">Validity:</p>
                        <p className="pl-0">This financial offer remains valid for 90 days from the date of tender opening.</p>
                        <p className="font-medium text-slate-800 mt-3">Payment Terms:</p>
                        <p className="pl-0">Invoicing will be triggered upon successful completion of each milestone as verified by the Procuring Entity.</p>
                      </div>
                      <div className="mt-8 pt-6 border-t border-slate-200">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Signature &amp; Stamp Block</p>
                        <p className="text-[11pt] text-slate-800 font-medium">Authorized Signature: _________________ Company Stamp: [Place Stamp Here]</p>
                      </div>
                      <div className="tender-page-footer proposal-page-number mt-12 pt-6 border-t border-slate-200 text-[10px] text-slate-500 text-center">
                        Confidential
                      </div>
                    </div>
                  )}
                  {/* Proposal body - heavier layout (freelancer only; firm uses 5-page template above) */}
                  {proposalTrack !== "firm" && (
                  <div className={`proposal-print-page resume-paper print-resume-page rounded-xl border border-slate-200/80 shadow-lg px-8 py-8 mb-4 bg-[#fefefe] ${theme === "surgeon" ? "theme-surgeon" : theme === "partner" ? "theme-partner" : "theme-innovator"}`}>
                    <div className="proposal-page-header border-b border-slate-200/50 pb-2 mb-4">
                      <p className="text-[10px] uppercase tracking-widest text-slate-600">Executive Proposal</p>
                    </div>
                    <div className={`border-b border-slate-200/70 pb-4 mb-6 ${theme === "partner" ? "text-center" : "flex items-start justify-between gap-6"}`}>
                      <div className="flex-1 space-y-1 flex items-start gap-3">
                        <div className="space-y-1">
                          <p className="resume-header-name text-2xl text-slate-900 leading-snug">
                            {fullName || "Your Name"}
                          </p>
                          <p className="resume-header-title text-xs uppercase tracking-[0.22em] text-slate-500">
                            {targetRole || "Consultant"}
                          </p>
                        </div>
                      </div>
                      <div className={`text-[10pt] text-slate-600 resume-body text-right ${theme === "partner" ? "mx-auto mt-2" : ""}`}>
                        <p>{email || "you@example.com"}</p>
                        <p>{profileUrl.trim() || "linkedin.com/in/username"}</p>
                      </div>
                    </div>
                    <div className="proposal-body space-y-8">
                      {proposalContent ? (
                        <>
                          <section className="proposal-section">
                            <h3 className="font-display text-sm uppercase tracking-[0.22em] text-slate-700 mb-3">Executive Summary</h3>
                            <div className="h-px w-16 mb-3" style={{ backgroundColor: proposalAccentColor }} />
                            <div className="resume-body text-slate-800 text-[11pt] leading-relaxed whitespace-pre-line">{proposalContent.executiveSummary}</div>
                          </section>
                          <section className="proposal-section">
                            <h3 className="font-display text-sm uppercase tracking-[0.22em] text-slate-700 mb-3">The Strategic Diagnosis</h3>
                            <div className="h-px w-16 mb-3" style={{ backgroundColor: proposalAccentColor }} />
                            <div className="resume-body text-slate-800 text-[11pt] leading-relaxed whitespace-pre-line">{proposalContent.strategicDiagnosis}</div>
                          </section>
                          {proposalContent.riskMitigations && proposalContent.riskMitigations.length > 0 && (
                            <section className="proposal-section">
                              <h3 className="font-display text-sm uppercase tracking-[0.22em] text-slate-700 mb-3">Project Safeguards</h3>
                              <div className="h-px w-16 mb-3" style={{ backgroundColor: proposalAccentColor }} />
                              <p className="text-[10pt] text-slate-600 mb-3">Risk &amp; Mitigation — our surgical response to keep the engagement on track.</p>
                              <div className="border border-slate-200 rounded-lg overflow-hidden">
                                <table className="w-full border-collapse text-[11pt]">
                                  <thead>
                                    <tr className="border-b border-slate-200 bg-slate-50">
                                      <th className="text-left py-2.5 px-4 font-medium text-slate-600 text-[10px] uppercase tracking-[0.18em]">Risk</th>
                                      <th className="text-left py-2.5 px-4 font-medium text-slate-600 text-[10px] uppercase tracking-[0.18em]">Surgical Response</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {proposalContent.riskMitigations.map((row, i) => (
                                      <tr key={i} className="border-b border-slate-100">
                                        <td className="py-2.5 px-4 text-slate-800 font-medium">{row.risk}</td>
                                        <td className="py-2.5 px-4 text-slate-700 text-[10pt]">{row.response}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </section>
                          )}
                          <section className="proposal-section">
                            <h3 className="font-display text-sm uppercase tracking-[0.22em] text-slate-700 mb-3">Our Proprietary Process</h3>
                            <div className="h-px w-16 mb-3" style={{ backgroundColor: proposalAccentColor }} />
                            <div className="resume-body text-slate-800 text-[11pt] leading-relaxed whitespace-pre-line mb-4">
                              {proposalContent.proprietaryProcess}
                            </div>
                            <ul className="space-y-3 list-none pl-0">
                              {["Discovery", "Strategy", "Execution", "Support"].map((label, idx) => (
                                <li key={label} className="flex gap-3 items-start">
                                  <span
                                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                                    style={{ backgroundColor: `${proposalAccentColor}20`, color: proposalAccentColor }}
                                  >
                                    {idx + 1}
                                  </span>
                                  <p className="text-[11px] text-slate-700 font-medium">{label}</p>
                                </li>
                              ))}
                            </ul>
                          </section>
                          <section className="proposal-section">
                            <h3 className="font-display text-sm uppercase tracking-[0.22em] text-slate-700 mb-3">Timeline &amp; Deliverables</h3>
                            <div className="h-px w-16 mb-3" style={{ backgroundColor: proposalAccentColor }} />
                            {(() => {
                              const phases = parseTimelinePhases(proposalContent.timelineDeliverables);
                              if (phases.length > 0) {
                                return (
                                  <div className="proposal-pricing-table border border-slate-200 rounded-lg overflow-hidden">
                                    <table className="w-full border-collapse text-[11pt]">
                                      <thead>
                                        <tr className="border-b border-slate-200 bg-slate-50">
                                          <th className="text-left py-2.5 px-4 font-medium text-slate-600 text-[10px] uppercase tracking-[0.18em]">Phase</th>
                                          <th className="text-left py-2.5 px-4 font-medium text-slate-600 text-[10px] uppercase tracking-[0.18em] w-28">Timeframe</th>
                                          <th className="text-left py-2.5 px-4 font-medium text-slate-600 text-[10px] uppercase tracking-[0.18em]">Key Deliverables</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {phases.map((row, i) => (
                                          <tr key={i} className="border-b border-slate-100">
                                            <td className="py-2.5 px-4 text-slate-800 font-medium">{row.phase}</td>
                                            <td className="py-2.5 px-4 text-slate-600 text-[10pt]">{row.timeframe || "—"}</td>
                                            <td className="py-2.5 px-4 text-slate-700 text-[10pt] leading-snug">{row.deliverables}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                );
                              }
                              return (
                                <div className="proposal-pricing-table border border-slate-200 rounded-lg overflow-hidden">
                                  <div className="bg-slate-50 px-4 py-2 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                                    Phases · Timeframes · Key Deliverables
                                  </div>
                                  <div className="px-4 py-3">
                                    <div className="resume-body text-slate-800 text-[11pt] leading-relaxed whitespace-pre-line">
                                      {proposalContent.timelineDeliverables}
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                          </section>
                          {proposalContent.roadmapMilestones && (
                            <section className="proposal-section">
                              <h3 className="font-display text-sm uppercase tracking-[0.22em] text-slate-700 mb-3">Phased Roadmap</h3>
                              <div className="h-px w-16 mb-4" style={{ backgroundColor: proposalAccentColor }} />
                              <div className="flex flex-wrap items-stretch gap-0">
                                <div className="flex-1 min-w-[140px] border border-slate-200 rounded-l-lg overflow-hidden">
                                  <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200" style={{ color: proposalAccentColor }}>
                                    Discovery
                                  </div>
                                  <ul className="px-3 py-2 space-y-1 list-none">
                                    {(proposalContent.roadmapMilestones.discovery || []).map((m, i) => (
                                      <li key={i} className="text-[10pt] text-slate-700">• {m}</li>
                                    ))}
                                  </ul>
                                </div>
                                <div className="flex shrink-0 items-center px-1 self-center">
                                  <span className="text-slate-700" aria-hidden="true">→</span>
                                </div>
                                <div className="flex-1 min-w-[140px] border border-slate-200 overflow-hidden">
                                  <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider border-b border-slate-200" style={{ color: proposalAccentColor }}>
                                    Surgery / Execution
                                  </div>
                                  <ul className="px-3 py-2 space-y-1 list-none">
                                    {(proposalContent.roadmapMilestones.surgery || []).map((m, i) => (
                                      <li key={i} className="text-[10pt] text-slate-700">• {m}</li>
                                    ))}
                                  </ul>
                                </div>
                                <div className="flex shrink-0 items-center px-1 self-center">
                                  <span className="text-slate-700" aria-hidden="true">→</span>
                                </div>
                                <div className="flex-1 min-w-[140px] border border-slate-200 rounded-r-lg overflow-hidden">
                                  <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200" style={{ color: proposalAccentColor }}>
                                    Post-Op / Support
                                  </div>
                                  <ul className="px-3 py-2 space-y-1 list-none">
                                    {(proposalContent.roadmapMilestones.postOp || []).map((m, i) => (
                                      <li key={i} className="text-[10pt] text-slate-700">• {m}</li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            </section>
                          )}
                          <section className="proposal-cta proposal-section rounded-xl border-2 border-surgicalTeal/40 bg-emerald-500/5 p-6">
                            <h3 className="font-display text-sm uppercase tracking-[0.22em] text-slate-800 mb-3">The Investment</h3>
                            <div className="h-px w-16 mb-3" style={{ backgroundColor: proposalAccentColor }} />
                            <div className="resume-body text-slate-800 text-[12pt] leading-relaxed whitespace-pre-line">{proposalContent.investment}</div>
                            {proposalPricingMilestones.some((i) => i.task.trim() || i.timeline.trim() || i.cost) && (
                              <div className="mt-6">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600 mb-2">Financial Proposal</p>
                                <div className="proposal-pricing-table border border-slate-300 rounded-lg overflow-hidden">
                                  <table className="w-full border-collapse text-[11pt]" style={{ borderCollapse: "collapse" }}>
                                    <thead>
                                      <tr className="bg-slate-100">
                                        <th className="text-left py-2.5 px-4 font-medium text-slate-700 text-[10px] uppercase tracking-[0.18em] border border-slate-300">Task / Milestone</th>
                                        <th className="text-left py-2.5 px-4 font-medium text-slate-700 text-[10px] uppercase tracking-[0.18em] w-28 border border-slate-300">Timeline</th>
                                        <th className="text-right py-2.5 px-4 font-medium text-slate-700 text-[10px] uppercase tracking-[0.18em] border border-slate-300">{proposalCurrency.costHeader}</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {proposalPricingMilestones
                                        .filter((i) => i.task.trim() || i.timeline.trim() || i.cost)
                                        .map((item) => (
                                          <tr key={item.id} className="align-top">
                                            <td className="py-2.5 px-4 text-slate-800 text-[11pt] border border-slate-300">{item.task || "—"}</td>
                                            <td className="py-2.5 px-4 text-slate-600 text-[10pt] border border-slate-300">{item.timeline || "—"}</td>
                                            <td className="py-2.5 px-4 text-right text-slate-800 border border-slate-300">
                                              {item.cost ? formatProposalCost(item.cost) : "—"}
                                            </td>
                                          </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                      <tr className="bg-slate-100">
                                        <td className="pt-3 pb-2 px-4 font-bold text-slate-900 border border-slate-300" colSpan={2}>Grand Total</td>
                                        <td className="text-right pt-3 pb-2 px-4 font-bold text-slate-900 border border-slate-300">
                                          {formatProposalCost(proposalPricingMilestones.reduce((sum, i) => sum + (Number.isFinite(i.cost) ? i.cost : 0), 0))}
                                        </td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                              </div>
                            )}
                          </section>
                          {proposalPricingMilestones.some((i) => i.task.trim() || i.timeline.trim() || i.cost) && (
                            <div className="proposal-print-page proposal-section mt-8" style={{ breakBefore: "page" }}>
                              <h3 className="font-display text-sm uppercase tracking-[0.22em] text-slate-800 mb-3">Financials</h3>
                              <div className="h-px w-16 mb-4" style={{ backgroundColor: proposalAccentColor }} />
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600 mb-2">Financial Proposal</p>
                                <div className="proposal-pricing-table border border-slate-300 rounded-lg overflow-hidden">
                                  <table className="w-full border-collapse text-[11pt]" style={{ borderCollapse: "collapse" }}>
                                    <thead>
                                      <tr className="bg-slate-100">
                                        <th className="text-left py-2.5 px-4 font-medium text-slate-700 text-[10px] uppercase tracking-[0.18em] border border-slate-300">Task / Milestone</th>
                                        <th className="text-left py-2.5 px-4 font-medium text-slate-700 text-[10px] uppercase tracking-[0.18em] w-28 border border-slate-300">Timeline</th>
                                        <th className="text-right py-2.5 px-4 font-medium text-slate-700 text-[10px] uppercase tracking-[0.18em] border border-slate-300">{proposalCurrency.costHeader}</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {proposalPricingMilestones
                                        .filter((i) => i.task.trim() || i.timeline.trim() || i.cost)
                                        .map((item) => (
                                          <tr key={item.id} className="align-top">
                                            <td className="py-2.5 px-4 text-slate-800 text-[11pt] border border-slate-300">{item.task || "—"}</td>
                                            <td className="py-2.5 px-4 text-slate-600 text-[10pt] border border-slate-300">{item.timeline || "—"}</td>
                                            <td className="py-2.5 px-4 text-right text-slate-800 border border-slate-300">
                                              {item.cost ? formatProposalCost(item.cost) : "—"}
                                            </td>
                                          </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                      <tr className="bg-slate-100">
                                        <td className="pt-3 pb-2 px-4 font-bold text-slate-900 border border-slate-300" colSpan={2}>Grand Total</td>
                                        <td className="text-right pt-3 pb-2 px-4 font-bold text-slate-900 border border-slate-300">
                                          {formatProposalCost(proposalPricingMilestones.reduce((sum, i) => sum + (Number.isFinite(i.cost) ? i.cost : 0), 0))}
                                        </td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                              </div>
                            </div>
                          )}
                          {(proposalContent.costOfInaction || proposalContent.successOutcome || proposalContent.totalValueDelivered) && (
                            <section className="proposal-section rounded-xl border-2 border-slate-200 bg-slate-50/80 p-6">
                              <h3 className="font-display text-sm uppercase tracking-[0.22em] text-slate-800 mb-3">Impact Summary</h3>
                              <div className="h-px w-16 mb-4" style={{ backgroundColor: proposalAccentColor }} />
                              <div className="space-y-3 text-[11pt]">
                                {proposalContent.totalValueDelivered && (
                                  <p>
                                    <span className="font-semibold text-slate-800">Total value delivered:</span>{" "}
                                    <span className="font-bold" style={{ color: "#F59E0B" }}>{proposalContent.totalValueDelivered}</span>{" "}
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">ROI-Driven Investment</span>
                                  </p>
                                )}
                                {proposalContent.costOfInaction && (
                                  <p className="text-slate-500">
                                    <span className="font-medium">Cost of inaction:</span>{" "}
                                    <span>{proposalContent.costOfInaction}</span>
                                  </p>
                                )}
                                {proposalContent.successOutcome && (
                                  <p><span className="font-medium text-slate-700">Success outcome:</span> <span className="text-slate-700">{proposalContent.successOutcome}</span></p>
                                )}
                              </div>
                            </section>
                          )}
                          {(
                            <>
                              <section className="proposal-section proposal-methodology">
                                <h3 className="font-display text-sm uppercase tracking-[0.22em] text-slate-700 mb-4">Our Methodology</h3>
                                <div className="h-px w-16 mb-4" style={{ backgroundColor: proposalAccentColor }} />
                                <ul className="space-y-4 list-none pl-0">
                                  <li className="flex gap-4 items-start">
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-semibold text-sm" style={{ backgroundColor: `${proposalAccentColor}20`, color: proposalAccentColor }}>1</span>
                                    <div>
                                      <p className="font-medium text-slate-800">Strategy</p>
                                      <p className="resume-body text-slate-600 text-[10pt]">Discovery, scope definition, and alignment on objectives and success criteria.</p>
                                    </div>
                                  </li>
                                  <li className="flex gap-4 items-start">
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-semibold text-sm" style={{ backgroundColor: `${proposalAccentColor}20`, color: proposalAccentColor }}>2</span>
                                    <div>
                                      <p className="font-medium text-slate-800">Execution</p>
                                      <p className="resume-body text-slate-600 text-[10pt]">Delivered work, milestones, and regular check-ins with your team.</p>
                                    </div>
                                  </li>
                                  <li className="flex gap-4 items-start">
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-semibold text-sm" style={{ backgroundColor: `${proposalAccentColor}20`, color: proposalAccentColor }}>3</span>
                                    <div>
                                      <p className="font-medium text-slate-800">Support</p>
                                      <p className="resume-body text-slate-600 text-[10pt]">Handoff, documentation, and ongoing support as agreed.</p>
                                    </div>
                                  </li>
                                </ul>
                                {proposalMethodology.trim() && (
                                  <p className="mt-4 resume-body text-slate-700 text-[10pt] italic">{proposalMethodology}</p>
                                )}
                              </section>
                              <section className="proposal-section">
                                <h3 className="font-display text-sm uppercase tracking-[0.22em] text-slate-700 mb-3">Meet the Team</h3>
                                <div className="h-px w-16 mb-3" style={{ backgroundColor: proposalAccentColor }} />
                                <p className="resume-body text-slate-600 text-[10pt]">
                                  Key personnel and roles will be confirmed at project kickoff.
                                </p>
                              </section>
                              {(proposalTenderMatches.length > 0 || (proposalContent.technicalCompliance && proposalContent.technicalCompliance.trim())) && (
                                <section className="proposal-section" id="technical-compliance">
                                  <h3 className="font-display text-sm uppercase tracking-[0.22em] text-slate-700 mb-3">Technical Compliance &amp; Alignment</h3>
                                  <div className="h-px w-16 mb-3" style={{ backgroundColor: proposalAccentColor }} />
                                  {(proposalContent.technicalCompliance && proposalContent.technicalCompliance.trim()) ? (
                                    <div className="resume-body text-slate-800 text-[11pt] leading-relaxed whitespace-pre-line">{proposalContent.technicalCompliance}</div>
                                  ) : proposalTenderMatches.length > 0 ? (
                                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                                      <table className="w-full border-collapse text-[11pt]">
                                        <thead>
                                          <tr className="border-b border-slate-200 bg-slate-50">
                                            <th className="text-left py-2.5 px-4 font-medium text-slate-600 text-[10px] uppercase tracking-[0.18em]">Requirement</th>
                                            <th className="text-left py-2.5 px-4 font-medium text-slate-600 text-[10px] uppercase tracking-[0.18em]">Our Evidence</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {proposalTenderMatches.map((m, i) => (
                                            <tr key={i} className="border-b border-slate-100">
                                              <td className="py-2.5 px-4 text-slate-800 font-medium align-top">{m.requirement}</td>
                                              <td className="py-2.5 px-4 text-slate-700 text-[10pt] leading-relaxed">{m.matched_project || m.gap_fix || "—"}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : null}
                                </section>
                              )}
                              <section className="proposal-section">
                                <h3 className="font-display text-sm uppercase tracking-[0.22em] text-slate-800 mb-3">PROJECT COMMENCEMENT &amp; MOBILIZATION</h3>
                                <div className="h-px w-16 mb-4" style={{ backgroundColor: proposalAccentColor }} />
                                <p className="resume-body text-slate-700 text-[11pt] leading-relaxed mb-6">
                                  Upon formal notification of award and signing of the Service Level Agreement (SLA), {fullName?.trim() || "[Consultant Name]"} shall mobilize the project team within forty-eight (48) business hours.
                                </p>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600 mb-2">Professional Kickoff Checklist</p>
                                {(() => {
                                  const kickoffItems = [
                                    "Execution of formal SLA",
                                    "Appointment of Project Implementation Team (PIT)",
                                    "Establishment of Data Privacy Protocols",
                                    "Technical API Handshake & Sandboxing",
                                  ];
                                  const fromContent = proposalContent.projectKickoffChecklist ?? [];
                                  const allItems = [...kickoffItems, ...fromContent.filter((s: string) => s?.trim())];
                                  return (
                                    <div className="rounded-lg border border-slate-200 overflow-hidden mb-6">
                                      <table className="w-full border-collapse text-[10pt]">
                                        <tbody>
                                          {allItems.map((item: string, i: number) => (
                                            <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                                              <td className="py-2.5 px-4 w-10 align-middle border-b border-slate-100">
                                                <Check className="h-5 w-5 shrink-0 text-[#10B981]" aria-hidden />
                                              </td>
                                              <td className="py-2.5 px-4 text-slate-700 border-b border-slate-100">{item}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  );
                                })()}
                                <h3 className="font-display text-sm uppercase tracking-[0.22em] text-slate-800 mb-4">Terms &amp; Conditions (Institutional)</h3>
                                <div className="h-px w-16 mb-4" style={{ backgroundColor: proposalAccentColor }} />
                                <div className="resume-body text-slate-700 text-[10pt] leading-relaxed space-y-4">
                                  <div>
                                    <p className="font-semibold text-[#064E3B] mb-0.5">Scope of Work.</p>
                                    <p className="text-slate-700 mt-0">Services are as described in this proposal. Any material changes require written agreement.</p>
                                  </div>
                                  <div>
                                    <p className="font-semibold text-[#064E3B] mb-0.5">Payment Terms.</p>
                                    <p className="text-slate-700 mt-0">Invoices are payable in Kenya Shillings (KES) within thirty (30) days of certification by the Procuring Entity.</p>
                                  </div>
                                  <div>
                                    <p className="font-semibold text-[#064E3B] mb-0.5">Confidentiality.</p>
                                    <p className="text-slate-700 mt-0">Both parties agree to keep confidential any proprietary or sensitive information shared during the engagement.</p>
                                  </div>
                                  <div>
                                    <p className="font-semibold text-[#064E3B] mb-0.5">Intellectual Property.</p>
                                    <p className="text-slate-700 mt-0">Deliverables and IP created under this engagement will be assigned as agreed in a separate statement of work or contract.</p>
                                  </div>
                                  <div>
                                    <p className="font-semibold text-[#064E3B] mb-0.5">Termination.</p>
                                    <p className="text-slate-700 mt-0">Either party may terminate with written notice as per the terms agreed. Fees for work completed up to the termination date remain payable.</p>
                                  </div>
                                  <div>
                                    <p className="font-semibold text-[#064E3B] mb-0.5">Limitation of Liability.</p>
                                    <p className="text-slate-700 mt-0">Liability is limited to the fees paid for the relevant engagement, except where prohibited by law.</p>
                                  </div>
                                  <div>
                                    <p className="font-semibold text-[#064E3B] mb-0.5">Governing Law (Mandatory).</p>
                                    <p className="text-slate-700 mt-0">This agreement shall be governed by and construed in accordance with the Laws of the Republic of Kenya.</p>
                                  </div>
                                  <p className="pt-2 text-slate-600">This proposal is valid for 30 days from the date of issue unless otherwise stated. By proceeding, the client agrees to these terms.</p>
                                </div>
                                <div className="relative mt-10 pt-8 border-t border-slate-200 overflow-hidden">
                                  <span
                                    className="pointer-events-none absolute inset-0 flex items-center justify-center select-none font-bold uppercase tracking-[0.35em]"
                                    style={{ fontSize: "clamp(4rem, 12vw, 140px)", color: "rgba(245, 158, 11, 0.14)", zIndex: 0 }}
                                    aria-hidden
                                  >
                                    ORIGINAL
                                  </span>
                                  <p className="relative z-10 text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-4">Signature of Authority</p>
                                  <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-4">
                                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-700">FOR THE CONSULTANT</p>
                                      <div className="space-y-3 text-[10pt] text-slate-700">
                                        <div>
                                          <p className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">Name</p>
                                          <div className="h-px w-full bg-slate-300 mt-1" />
                                        </div>
                                        <div>
                                          <p className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">Designation</p>
                                          <div className="h-px w-full bg-slate-300 mt-1" />
                                        </div>
                                        <div>
                                          <p className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">Signature</p>
                                          <div className="h-12 w-3/4 bg-slate-100 border border-slate-200 rounded mt-1" />
                                        </div>
                                        <div>
                                          <p className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">Date</p>
                                          <div className="h-px w-32 bg-slate-300 mt-1" />
                                        </div>
                                        <div>
                                          <p className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">Official Stamp</p>
                                          <div className="h-16 w-16 rounded-full border-2 border-dashed border-slate-300 mt-1 flex items-center justify-center text-[7px] text-slate-400 text-center leading-tight px-1">OFFICIAL STAMP</div>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="space-y-4">
                                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-700">FOR THE PROCURING ENTITY</p>
                                      <div className="space-y-3 text-[10pt] text-slate-700">
                                        <div>
                                          <p className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">Name</p>
                                          <div className="h-px w-full bg-slate-300 mt-1" />
                                        </div>
                                        <div>
                                          <p className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">Designation</p>
                                          <div className="h-px w-full bg-slate-300 mt-1" />
                                        </div>
                                        <div>
                                          <p className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">Signature</p>
                                          <div className="h-12 w-3/4 bg-slate-100 border border-slate-200 rounded mt-1" />
                                        </div>
                                        <div>
                                          <p className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">Date</p>
                                          <div className="h-px w-32 bg-slate-300 mt-1" />
                                        </div>
                                        <div>
                                          <p className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">Official Stamp</p>
                                          <div className="h-16 w-16 rounded-full border-2 border-dashed border-slate-300 mt-1 flex items-center justify-center text-[7px] text-slate-400 text-center leading-tight px-1">OFFICIAL STAMP</div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </section>
                            </>
                          )}
                        </>
                      ) : (
                        <div className="py-12 px-6 text-center">
                          <p className="resume-body text-slate-500 text-[11pt] max-w-sm mx-auto">
                            Add client name, project scope, and pain points on the left, then click <strong>Generate Proposal</strong>. Use &quot;Import Case Studies from Resume&quot; to add proof from your experience.
                          </p>
                        </div>
                      )}
                    </div>
                      <div className="mt-10 pt-4 border-t border-slate-200/60 text-center text-[10px] text-slate-600 proposal-footer proposal-page-number">
                      Executive Proposal
                    </div>
                  </div>
                  )}
                  {proposalTrack === "firm" && proposalContent && (
                    <div id="section-next-steps" className={`proposal-print-page tender-doc-page resume-paper print-resume-page rounded-xl border border-slate-200/80 shadow-lg px-8 py-8 relative bg-[#fefefe] ${theme === "surgeon" ? "theme-surgeon" : theme === "partner" ? "theme-partner" : "theme-innovator"}`}>
                      <div className="absolute top-4 right-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-600 tender-doc-header">{proposalDocumentType}</div>
                      <div className="proposal-body">
                        <div className="mb-8">
                          <h3 className="font-display text-sm uppercase tracking-[0.22em] text-slate-800 mb-3">PROJECT COMMENCEMENT &amp; MOBILIZATION</h3>
                          <div className="h-px w-16 mb-4" style={{ backgroundColor: proposalAccentColor }} />
                          <p className="resume-body text-slate-700 text-[11pt] leading-relaxed mb-6">
                            Upon formal notification of award and signing of the Service Level Agreement (SLA), {firmProfileForProposal?.company_name ?? "[Company Name]"} shall mobilize the project team within forty-eight (48) business hours.
                          </p>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600 mb-2">Professional Kickoff Checklist</p>
                          {(() => {
                            const kickoffItems = [
                              "Execution of formal SLA",
                              "Appointment of Project Implementation Team (PIT)",
                              "Establishment of Data Privacy Protocols",
                              "Technical API Handshake & Sandboxing",
                            ];
                            const fromContent = proposalContent.projectKickoffChecklist ?? [];
                            const allItems = [...kickoffItems, ...fromContent.filter((s) => s?.trim())];
                            return (
                              <div className="rounded-lg border border-slate-200 overflow-hidden">
                                <table className="w-full border-collapse text-[10pt]">
                                  <tbody>
                                    {allItems.map((item, i) => (
                                      <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                                        <td className="py-2.5 px-4 w-10 align-middle border-b border-slate-100">
                                          <Check className="h-5 w-5 shrink-0 text-[#10B981]" aria-hidden />
                                        </td>
                                        <td className="py-2.5 px-4 text-slate-700 border-b border-slate-100">{item}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            );
                          })()}
                        </div>
                        <h3 className="font-display text-sm uppercase tracking-[0.22em] text-slate-800 mb-4">Terms &amp; Conditions (Institutional)</h3>
                        <div className="h-px w-16 mb-4" style={{ backgroundColor: proposalAccentColor }} />
                        <div className="resume-body text-slate-700 text-[10pt] leading-relaxed space-y-4">
                          <div>
                            <p className="font-semibold text-[#064E3B] mb-0.5">Scope of Work.</p>
                            <p className="text-slate-700 mt-0">Services are as described in this proposal. Any material changes require written agreement.</p>
                          </div>
                          <div>
                            <p className="font-semibold text-[#064E3B] mb-0.5">Payment Terms.</p>
                            <p className="text-slate-700 mt-0">Invoices are payable in Kenya Shillings (KES) within thirty (30) days of certification by the Procuring Entity in accordance with the applicable Service Level Agreement (SLA) and the Laws of the Republic of Kenya.</p>
                          </div>
                          <div>
                            <p className="font-semibold text-[#064E3B] mb-0.5">Confidentiality.</p>
                            <p className="text-slate-700 mt-0">Both parties agree to keep confidential any proprietary or sensitive information shared during the engagement.</p>
                          </div>
                          <div>
                            <p className="font-semibold text-[#064E3B] mb-0.5">Intellectual Property.</p>
                            <p className="text-slate-700 mt-0">Deliverables and IP created under this engagement will be assigned as agreed in a separate statement of work or contract.</p>
                          </div>
                          <div>
                            <p className="font-semibold text-[#064E3B] mb-0.5">Termination.</p>
                            <p className="text-slate-700 mt-0">Either party may terminate with written notice as per the terms agreed. Fees for work completed up to the termination date remain payable.</p>
                          </div>
                          <div>
                            <p className="font-semibold text-[#064E3B] mb-0.5">Limitation of Liability.</p>
                            <p className="text-slate-700 mt-0">Liability is limited to the fees paid for the relevant engagement, except where prohibited by law.</p>
                          </div>
                          <div>
                            <p className="font-semibold text-[#064E3B] mb-0.5">Governing Law (Mandatory).</p>
                            <p className="text-slate-700 mt-0">This agreement shall be governed by and construed in accordance with the Laws of the Republic of Kenya.</p>
                          </div>
                          <p className="pt-2 text-slate-600">This financial offer remains valid for ninety (90) days from the date of tender opening unless otherwise stated. By signing this proposal and the accompanying Service Level Agreement (SLA), the Parties agree to be bound by these terms.</p>
                        </div>
                        <div className="relative mt-10 pt-8 border-t border-slate-200 overflow-hidden">
                          <span
                            className="pointer-events-none absolute inset-0 flex items-center justify-center select-none font-bold uppercase tracking-[0.35em]"
                            style={{ fontSize: "clamp(4rem, 12vw, 140px)", color: "rgba(245, 158, 11, 0.14)", zIndex: 0 }}
                            aria-hidden
                          >
                            ORIGINAL
                          </span>
                          <p className="relative z-10 text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-4">Signature of Authority</p>
                          <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-700">FOR THE CONSULTANT</p>
                              <div className="space-y-3 text-[10pt] text-slate-700">
                                <div>
                                  <p className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">Name</p>
                                  <div className="h-px w-full bg-slate-300 mt-1" />
                                </div>
                                <div>
                                  <p className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">Designation</p>
                                  <div className="h-px w-full bg-slate-300 mt-1" />
                                </div>
                                <div>
                                  <p className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">Signature</p>
                                  <div className="h-12 w-3/4 bg-slate-100 border border-slate-200 rounded mt-1" />
                                </div>
                                <div>
                                  <p className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">Date</p>
                                  <div className="h-px w-32 bg-slate-300 mt-1" />
                                </div>
                                <div>
                                  <p className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">Official Stamp</p>
                                  <div className="h-16 w-16 rounded-full border-2 border-dashed border-slate-300 mt-1 flex items-center justify-center text-[7px] text-slate-400 text-center leading-tight px-1">OFFICIAL STAMP</div>
                                </div>
                              </div>
                            </div>
                            <div className="space-y-4">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-700">FOR THE PROCURING ENTITY</p>
                              <div className="space-y-3 text-[10pt] text-slate-700">
                                <div>
                                  <p className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">Name</p>
                                  <div className="h-px w-full bg-slate-300 mt-1" />
                                </div>
                                <div>
                                  <p className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">Designation</p>
                                  <div className="h-px w-full bg-slate-300 mt-1" />
                                </div>
                                <div>
                                  <p className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">Signature</p>
                                  <div className="h-12 w-3/4 bg-slate-100 border border-slate-200 rounded mt-1" />
                                </div>
                                <div>
                                  <p className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">Date</p>
                                  <div className="h-px w-32 bg-slate-300 mt-1" />
                                </div>
                                <div>
                                  <p className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">Official Stamp</p>
                                  <div className="h-16 w-16 rounded-full border-2 border-dashed border-slate-300 mt-1 flex items-center justify-center text-[7px] text-slate-400 text-center leading-tight px-1">OFFICIAL STAMP</div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="mt-10 pt-4 border-t border-slate-200/60 text-center text-[10px] text-slate-500 proposal-page-footer proposal-page-number">
                        Confidential
                      </div>
                    </div>
                  )}
                </div>
                {proposalContent && (
                  <>
                    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                      <p className="text-xs text-neonGreenDark"><span className="font-medium">Result: 1 proposal ready.</span> Save it: <strong>Download PDF → Proposal</strong> in the top bar or the button on the left. In the print dialog, turn off &quot;Headers and footers&quot; for a clean PDF without the URL.</p>
                    </div>
                    <div className="mt-3 rounded-lg border border-surgicalTeal/30 bg-emerald-500/5 px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    <p className="text-[11px] font-medium text-slate-700">What&apos;s next?</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setDashboardTab("linkedin")} className="inline-flex items-center gap-1.5 rounded-lg border border-surgicalTeal/60 bg-white px-2.5 py-1.5 text-xs font-medium text-neonGreenDark hover:bg-emerald-100/80 transition-colors">
                        Polish LinkedIn <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => setDashboardTab("interview")} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/60 bg-amber-50/50 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100/80 transition-colors">
                        Interview prep <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                        <button type="button" onClick={() => setDashboardTab("share")} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/60 bg-amber-50/50 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100/80 transition-colors">
                          Share your profile <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                    </div>
                  </div>
                  </>
                )}
                </div>
              </motion.section>
              </>
              )}
            </AnimatePresence>
            </div>
          ) : dashboardTab === "linkedin" ? (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] items-start">
              <section className="resume-surface glass-card rounded-2xl border border-slate-200 p-6 lg:p-7 space-y-5">
                <header>
                  <h2 className="font-display text-lg text-[#0F172A]">LinkedIn Surgeon</h2>
                  <p className="text-sm text-slate-600 mt-1">
                    Social Authority Engine — headlines, About (Hook-Value-Proof-CTA), and Featured Projects for recruiters.
                  </p>
                </header>
                <div className="space-y-3">
                  <label className="block text-[11px] uppercase tracking-[0.18em] text-slate-600">Current role</label>
                  <input
                    type="text"
                    placeholder="e.g. Senior Product Manager"
                    value={linkedinCurrentRole}
                    onChange={(e) => setLinkedinCurrentRole(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                  />
                </div>
                <div className="space-y-3">
                  <label className="block text-[11px] uppercase tracking-[0.18em] text-slate-600">Career goals</label>
                  <textarea
                    rows={2}
                    placeholder="Where you want to be — e.g. VP Product, founder..."
                    value={linkedinCareerGoals}
                    onChange={(e) => setLinkedinCareerGoals(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleGenerateLinkedIn}
                  disabled={linkedinLoading || (!sharpened && !experience.trim())}
                  className="btn-glimmer w-full rounded-lg border bg-emerald-500 text-black font-bold border border-emerald-500 px-3 py-2 text-xs font-medium disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  {linkedinLoading ? (<><span className="surgical-pulse" aria-hidden />Generating…</>) : <>Generate for LinkedIn <span className="ml-1 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700">{getCost("LINKEDIN")} SU</span></>}
                </button>
                <div className="rounded-xl border border-slate-200 bg-white/80 p-3 space-y-2">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-600">Networking Surgery</p>
                  <p className="text-[11px] text-slate-500">3 Cold Outreach variants (200 chars each): Recruiter, Peer, Hiring Manager.</p>
                  <button
                    type="button"
                    disabled={linkedinDmLoading || !jobDescription.trim()}
                    onClick={async () => {
                      const key = [jobDescription || "", fullName || "", targetRole || ""].join("||");
                      if (key && key === lastLinkedInDmKey && linkedinDm) {
                        return;
                      }
                      setLinkedinDmLoading(true);
                      setLinkedinDm(null);
                      try {
                        const res = await fetch("/api/linkedin-dm", {
                          method: "POST",
                          headers: { "Content-Type": "application/json", ...authHeaders },
                          body: JSON.stringify({
                            jobDescription: jobDescription || undefined,
                            fullName: fullName || undefined,
                            targetRole: targetRole || undefined,
                          }),
                        });
                        const data = await res.json();
                        openRefillIfInsufficient(res, data);
                        if (res.status === 402) {
                          setLinkedinDm(null);
                        } else if (!res.ok) {
                          throw new Error("Failed");
                        } else {
                          setLinkedinDm(data.recruiter != null ? { recruiter: data.recruiter || "", peer: data.peer || "", hiringManager: data.hiringManager || "" } : null);
                          setLastLinkedInDmKey(key || null);
                          refetchProfile();
                        }
                      } catch {
                        setLinkedinDm(null);
                      }
                      setLinkedinDmLoading(false);
                    }}
                    className="w-full rounded-lg border border-surgicalTeal/50 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-neonGreenDark hover:bg-emerald-600 disabled:opacity-50"
                  >
                    {linkedinDmLoading ? "Generating…" : <>Generate 3 LinkedIn DMs <span className="ml-1 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700">{getCost("LINKEDIN_DM")} SU</span></>}
                  </button>
                  {linkedinDm && (
                    <div className="space-y-2">
                      <p className="text-[11px] text-slate-500 mb-1"><span className="font-medium text-neonGreen/90">Result: 3 LinkedIn DMs ready.</span> Save your work: copy any message with the copy icon. They stay here until you generate again.</p>
                      {[
                        { key: "recruiter" as const, label: "Recruiter" },
                        { key: "peer" as const, label: "Peer (referral)" },
                        { key: "hiringManager" as const, label: "Hiring Manager" },
                      ].map(({ key, label }) => (
                        <div key={key} className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 bg-white/80 p-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">{label}</p>
                            <p className="text-xs text-slate-700">{linkedinDm[key]}</p>
                          </div>
                          <button type="button" onClick={() => navigator.clipboard.writeText(linkedinDm[key])} className="shrink-0 rounded p-1 text-neonGreenDark hover:bg-emerald-600" title="Copy"><Copy className="h-3.5 w-3.5" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {linkedinContent && (
                  <>
                    <p className="text-[11px] text-slate-500 pt-2 border-t border-slate-200"><span className="font-medium text-neonGreen/90">Result: {linkedinContent.headlines?.length ?? 0} headlines + About + banner.</span> Save your work: copy with the buttons below or download the banner. Your content stays here until you change it.</p>
                    <div className="space-y-2 pt-2">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-600">Pick a headline (free)</p>
                      <div className="space-y-1.5">
                        {linkedinContent.headlines.map((h, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setLinkedinSelectedHeadline(i)}
                            className={`block w-full rounded-lg border px-3 py-2 text-left text-xs ${
                              linkedinSelectedHeadline === i
                                ? "border-surgicalTeal/60 bg-emerald-500/10 text-neonGreenDark"
                                : "border-slate-200 bg-white/70 text-slate-700 hover:border-slate-600"
                            }`}
                          >
                            {h || `Headline ${i + 1}`}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-600">Featured section strategy</p>
                      <p className="text-xs text-slate-700 leading-relaxed">{linkedinContent.featuredStrategy}</p>
                    </div>
                    {linkedinContent.featuredProjects?.length > 0 && (
                      <div className="space-y-2 pt-1 border-t border-slate-200">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-600">Featured Projects (5)</p>
                        <ul className="space-y-1.5 text-[11px] text-slate-600">
                          {linkedinContent.featuredProjects.map((p, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="text-neonGreenDark shrink-0">•</span>
                              <span>{p}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="flex flex-col gap-2 pt-2 border-t border-slate-200">
                      <button
                        type="button"
                        onClick={handleCopyAllLinkedIn}
                        className={`w-full rounded-lg border px-3 py-2 text-xs font-medium flex items-center justify-center gap-2 ${
                          canUseLinkedInExport
                            ? "bg-emerald-500 text-black font-bold border border-emerald-500 hover:bg-emerald-600"
                            : "border-slate-200 bg-white/70 text-slate-600"
                        }`}
                      >
                        {canUseLinkedInExport ? <Copy className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                        {canUseLinkedInExport ? "Copy All for LinkedIn" : "Copy All (Executive Pass)"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setBannerPatternSeed((s) => s + 1)}
                        className="w-full rounded-lg border border-amber-400/60 bg-amber-50/50 px-3 py-2 text-xs font-medium text-amber-700 hover:border-amber-500/70 hover:bg-amber-100/80 flex items-center justify-center gap-2"
                      >
                        Regenerate Pattern
                      </button>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={canUseLinkedInExport ? handleDownloadBanner : () => setShowPaywall(true)}
                          className={`w-full rounded-lg border px-3 py-2 text-xs font-medium flex items-center justify-center gap-2 ${
                            canUseLinkedInExport
                              ? "bg-emerald-500 text-black font-bold border border-emerald-500 hover:bg-emerald-600"
                              : "border-slate-200 bg-white/70 text-slate-500 blur-[2px] select-none pointer-events-none"
                          }`}
                        >
                          <Linkedin className="h-3.5 w-3.5" />
                          Download High-Res Banner
                        </button>
                        {!canUseLinkedInExport && (
                          <button
                            type="button"
                            onClick={() => setShowPaywall(true)}
                            className="absolute inset-0 flex items-center justify-center gap-2 rounded-lg border bg-emerald-500 text-black font-bold border border-emerald-500 text-xs font-medium hover:bg-emerald-600"
                          >
                            <Lock className="h-3.5 w-3.5" />
                            Executive Pass
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="rounded-lg border border-surgicalTeal/30 bg-emerald-500/5 px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mt-3">
                      <p className="text-[11px] font-medium text-slate-600">What&apos;s next?</p>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setDashboardTab("interview")} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/60 bg-emerald-50/50 px-2.5 py-1.5 text-xs font-medium text-neonGreenDark hover:bg-emerald-100/80 transition-colors">
                          Interview prep <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => setDashboardTab("followup")} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/60 bg-amber-50/50 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100/80 transition-colors">
                          Follow-up emails <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => setDashboardTab("share")} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/60 bg-amber-50/50 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100/80 transition-colors">
                          Share profile <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </section>
              <section className="relative">
                <div className="rounded-2xl border border-slate-200/80 bg-white/70 overflow-hidden shadow-xl">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 px-4 py-2 border-b border-slate-200">LinkedIn profile mockup</p>
                  <div className="p-4 space-y-0">
                    {/* Surgical Banner Generator — Canvas 1584×396, Live Preview */}
                    <div
                      ref={linkedinBannerRef}
                      className="w-full rounded-t-lg overflow-hidden relative border border-surgicalTeal/30"
                      style={{ aspectRatio: "1584/396" }}
                    >
                      <canvas
                        ref={linkedinBannerCanvasRef}
                        width={1584}
                        height={396}
                        className="w-full h-auto block"
                        style={{ maxWidth: "100%", height: "auto", display: "block" }}
                        aria-label="LinkedIn banner preview"
                      />
                      {!canUseLinkedInExport && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/90 rounded-t-lg pointer-events-none">
                          <span className="text-[11px] text-slate-600">Unlock to download — Executive Pass</span>
                        </div>
                      )}
                    </div>
                    <div className="bg-slate-200/80 px-4 pt-12 pb-4">
                      <div className="flex items-end gap-4">
                        <div className="relative">
                          <div className="w-20 h-20 rounded-full border-4 border-white bg-slate-300 flex-shrink-0 flex items-center justify-center text-2xl font-bold text-slate-600">
                            {(fullName || "Y").charAt(0)}
                          </div>
                          <span className="absolute -bottom-1 left-0 right-0 text-center text-[9px] text-slate-500">Profile Photo</span>
                        </div>
                        <div className="flex-1 min-w-0 pb-1">
                          <p className="font-semibold text-slate-900 truncate">{fullName || "Your Name"}</p>
                          <p className="text-sm text-slate-600 truncate">
                            {linkedinContent?.headlines[linkedinSelectedHeadline] ||
                              linkedinContent?.headlines[0] ||
                              targetRole ||
                              "Headline"}
                          </p>
                        </div>
                      </div>
                    </div>
                    {linkedInConsistencyScore != null && (
                      <div className="px-4 py-2 border-t border-slate-200 flex items-center justify-between gap-2">
                        <span className="text-[10px] uppercase tracking-wider text-slate-500">Consistency Score</span>
                        <span className={`text-xs font-semibold tabular-nums ${linkedInConsistencyScore >= 40 ? "text-neonGreen" : "text-amber-400"}`}>
                          {linkedInConsistencyScore}%
                        </span>
                      </div>
                    )}
                    {linkedInBrandMismatch && (
                      <p className="px-4 py-2 text-[11px] text-amber-400 bg-amber-500/10 border-t border-slate-200">
                        ⚠️ Brand Mismatch. Your LinkedIn doesn&apos;t support your Resume&apos;s claims. Align your About with your resume summary.
                      </p>
                    )}
                    <div className="px-4 py-4 border-t border-slate-200 relative">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">About</p>
                      <div className={`text-xs text-slate-700 leading-relaxed whitespace-pre-line max-h-32 overflow-y-auto ${!canUseLinkedInExport ? "select-none blur-md pointer-events-none" : ""}`}>
                        {linkedinContent?.about || "Generate content to see your story-driven About (Hook-Value-Proof-CTA) here."}
                      </div>
                      {!canUseLinkedInExport && linkedinContent?.about && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/95 rounded">
                          <span className="text-[11px] text-slate-600">Unlock with Executive Pass</span>
                        </div>
                      )}
                    </div>
                    {linkedinContent && (linkedinContent.topSkills?.length ?? 0) > 0 && (
                      <div className="px-4 py-3 border-t border-slate-200">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Top skills</p>
                        <div className="flex flex-wrap gap-1.5">
                          {linkedinContent.topSkills.map((s, i) => (
                            <span
                              key={i}
                              className="rounded-full bg-slate-700/80 px-2.5 py-0.5 text-[11px] text-slate-700"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </div>
          ) : dashboardTab === "followup" ? (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-start">
              <section className="resume-surface glass-card rounded-2xl border border-slate-200 p-6 lg:p-7 space-y-5">
                <header>
                  <h2 className="font-display text-lg text-slate-50">Follow-Up Kit</h2>
                  <p className="text-sm text-slate-600 mt-1">
                    Ghosting prevention — 3 tiered follow-up emails based on your JD and resume.
                  </p>
                </header>
                <div className="space-y-3">
                  <label className="block text-[11px] uppercase tracking-[0.18em] text-slate-600">Job description</label>
                  <textarea
                    rows={4}
                    placeholder="Paste the job description (same as Target Job). Used to tailor follow-up emails."
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/20 resize-y"
                  />
                  <label className="block text-[11px] uppercase tracking-[0.18em] text-slate-600">Company name (optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Acme Corp"
                    value={followUpCompanyName}
                    onChange={(e) => setFollowUpCompanyName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                  />
                </div>
                <button
                  type="button"
                  disabled={followUpLoading || !jobDescription.trim()}
                  onClick={async () => {
                    setFollowUpLoading(true);
                    setFollowUpEmails(null);
                    try {
                      const res = await fetch("/api/follow-up-emails", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", ...authHeaders },
                        body: JSON.stringify({
                          jobDescription: jobDescription.trim(),
                          fullName: fullName || undefined,
                          targetRole: targetRole || undefined,
                          companyName: followUpCompanyName.trim() || undefined,
                          resumeSummary: (sharpened || experience).slice(0, 500),
                          humanize: humanizeAI,
                        }),
                      });
                      const data = await res.json();
                      openRefillIfInsufficient(res, data);
                      if (res.status === 402) {
                        setFollowUpEmails(null);
                      } else if (!res.ok) {
                        throw new Error("Failed to generate");
                      } else {
                        setFollowUpEmails(data);
                        refetchProfile();
                      }
                    } catch {
                      setFollowUpEmails(null);
                    }
                    setFollowUpLoading(false);
                  }}
                  className="btn-glimmer w-full rounded-xl border bg-emerald-500 text-black font-bold border border-emerald-500 px-4 py-3 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {followUpLoading ? "Generating…" : <>Generate 3 Follow-Up Emails <span className="ml-1 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700">{getCost("FOLLOW_UP")} SU</span></>}
                </button>
              </section>
              <section className="resume-surface glass-card rounded-2xl border border-slate-200 p-6 lg:p-7 space-y-6">
                <h3 className="font-display text-base text-slate-50">Your follow-up sequence</h3>
                {followUpEmails ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <p className="text-[11px] text-slate-500"><span className="font-medium text-neonGreen/90">Result: 3 follow-up emails ready.</span> Save: copy each below or copy all.</p>
                      <button
                        type="button"
                        onClick={() => {
                          const all = `Gentle check-in (48h):\n${followUpEmails.gentleCheckIn}\n\n---\nValue-add (7-day):\n${followUpEmails.valueAdd}\n\n---\nClose the loop (14-day):\n${followUpEmails.closeTheLoop}`;
                          navigator.clipboard.writeText(all);
                        }}
                        className="shrink-0 rounded-lg border border-surgicalTeal/50 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-medium text-neonGreenDark hover:bg-emerald-600 inline-flex items-center gap-1"
                      >
                        <Copy className="h-3.5 w-3.5" /> Copy all emails
                      </button>
                    </div>
                    <div className="space-y-6">
                    {[
                      { key: "gentleCheckIn" as const, title: "48-Hour Gentle Nudge", subtitle: "Short, polite email nudge." },
                      { key: "valueAdd" as const, title: "7-Day Value-Add", subtitle: "Message suggesting a solution to a problem in the JD." },
                      { key: "closeTheLoop" as const, title: "14-Day Professional Close", subtitle: "Final check-in, keep door open." },
                    ].map(({ key, title, subtitle }) => (
                      <div key={key} className="rounded-xl border border-slate-200 bg-white/80 p-4">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div>
                            <p className="text-sm font-medium text-slate-900">{title}</p>
                            <p className="text-[11px] text-slate-500">{subtitle}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => { navigator.clipboard.writeText(followUpEmails[key]); }}
                            className="rounded-lg border border-surgicalTeal/50 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-medium text-neonGreenDark hover:bg-emerald-600"
                          >
                            <Copy className="h-3.5 w-3.5 inline mr-1" />
                            Copy
                          </button>
                        </div>
                        <p className="text-xs text-slate-700 whitespace-pre-line leading-relaxed">{followUpEmails[key]}</p>
                      </div>
                    ))}
                    </div>
                    <div className="rounded-lg border border-surgicalTeal/30 bg-emerald-500/5 px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mt-4">
                      <p className="text-[11px] font-medium text-slate-600">What&apos;s next?</p>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setDashboardTab("share")} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/60 bg-emerald-50/50 px-2.5 py-1.5 text-xs font-medium text-neonGreenDark hover:bg-emerald-100/80 transition-colors">
                          Share your profile <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => setDashboardTab("tracker")} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/60 bg-amber-50/50 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100/80 transition-colors">
                          Track applications <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => setDashboardTab("resume")} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/60 bg-amber-50/50 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100/80 transition-colors">
                          Back to resume <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">Generate follow-up emails to see the 48-hour check-in, 7-day value-add, and 14-day close-the-loop here.</p>
                )}
              </section>
            </div>
          ) : dashboardTab === "tracker" ? (
            <div className="max-w-3xl mx-auto space-y-6">
              <section className="resume-surface glass-card rounded-2xl border border-slate-200 p-6 lg:p-7">
                <header>
                  <h2 className="font-display text-lg text-slate-50">My Operations</h2>
                  <p className="text-sm text-slate-600 mt-1">Surgical Tracker — Company, role, date applied, status. {operationsFromDb ? "Synced to your account." : "Saved locally until you sign in."}</p>
                </header>
                <div className="mt-4 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_auto_auto] items-end">
                    <input
                      type="text"
                      placeholder="Company name"
                      value={trackerNewCompany}
                      onChange={(e) => setTrackerNewCompany(e.target.value)}
                      className="rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                    />
                    <input
                      type="text"
                      placeholder="Job title"
                      value={trackerNewTitle}
                      onChange={(e) => setTrackerNewTitle(e.target.value)}
                      className="rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                    />
                    <input
                      type="date"
                      value={trackerNewDate}
                      onChange={(e) => setTrackerNewDate(e.target.value)}
                      className="rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                    />
                    <select
                      value={trackerNewStatus}
                      onChange={(e) => setTrackerNewStatus(e.target.value as ApplicationStatus)}
                      className="rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                    >
                      <option value="Applied">Applied</option>
                      <option value="Interview">Interview</option>
                      <option value="Offer">Offer</option>
                      <option value="Rejected">Rejected</option>
                    </select>
                    <input
                      type="url"
                      placeholder="Link (optional)"
                      value={trackerNewLink}
                      onChange={(e) => setTrackerNewLink(e.target.value)}
                      className="rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                    />
                    <button
                      type="button"
                      disabled={!trackerNewCompany.trim() || !trackerNewTitle.trim()}
                      onClick={async () => {
                        const company_name = trackerNewCompany.trim();
                        const job_title = trackerNewTitle.trim();
                        if (!company_name || !job_title) return;
                        const date_applied = trackerNewDate || new Date().toISOString().slice(0, 10);
                        const link = trackerNewLink.trim() || undefined;
                        if (operationsFromDb && session?.access_token) {
                          try {
                            const res = await fetch("/api/applications", {
                              method: "POST",
                              headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
                              body: JSON.stringify({ company_name, job_title, status: trackerNewStatus, date_applied, link }),
                            });
                            if (!res.ok) throw new Error("Failed");
                            const created = await res.json();
                            setOperationsList((prev) => [{ id: created.id, company_name: created.company_name, job_title: created.job_title, date_applied: created.date_applied, status: created.status as ApplicationStatus, link: created.link ?? null }, ...prev]);
                          } catch {
                            return;
                          }
                        } else {
                          setOperationsList((prev) => [{ id: `local-${Date.now()}`, company_name, job_title, date_applied, status: trackerNewStatus, link: link || null }, ...prev]);
                        }
                        setTrackerNewCompany("");
                        setTrackerNewTitle("");
                        setTrackerNewLink("");
                        setTrackerNewDate(new Date().toISOString().slice(0, 10));
                        setTrackerNewStatus("Applied");
                      }}
                      className="rounded-lg border border-surgicalTeal/60 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-neonGreenDark hover:bg-emerald-600 disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>
                  <ul className="space-y-2">
                    {!operationsLoaded ? (
                      <li className="text-sm text-slate-500 py-4">Loading…</li>
                    ) : operationsList.length === 0 ? (
                      <li className="text-sm text-slate-500 py-4">No operations yet. Add company, job title, date, and status above.</li>
                    ) : (
                      operationsList.map((job) => (
                        <li key={job.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/80 p-3">
                          <span className="font-medium text-slate-800">{job.company_name}</span>
                          <span className="text-slate-600">·</span>
                          <span className="text-sm text-slate-700">{job.job_title}</span>
                          <span className="text-[11px] text-slate-500">{job.date_applied}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            job.status === "Offer" ? "bg-amber-500/20 text-[#020617]" : job.status === "Interview" ? "bg-emerald-500/20 text-[#020617]" : job.status === "Rejected" ? "bg-slate-600/50 text-slate-600" : "bg-emerald-500/20 text-[#020617]"
                          }`}>{job.status}</span>
                          {job.link && (
                            <a href={job.link} target="_blank" rel="noopener noreferrer" className="text-xs text-neonGreenDark hover:underline truncate max-w-[180px]">Link</a>
                          )}
                          <button
                            type="button"
                            onClick={async () => {
                              if (operationsFromDb && session?.access_token) {
                                try {
                                  await fetch(`/api/applications/${job.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${session.access_token}` } });
                                  setOperationsList((prev) => prev.filter((j) => j.id !== job.id));
                                } catch {}
                              } else {
                                setOperationsList((prev) => prev.filter((j) => j.id !== job.id));
                              }
                            }}
                            className="ml-auto text-slate-500 hover:text-rose-400 p-1"
                            title="Remove"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </section>
            </div>
          ) : dashboardTab === "interview" ? (
            <div className="max-w-4xl mx-auto space-y-6">
              <section className="resume-surface glass-card rounded-2xl border border-slate-200 p-6 lg:p-7">
                <header>
                  <h2 className="font-display text-lg text-slate-50">Interview Surgeon</h2>
                  <p className="text-sm text-slate-600 mt-1">Total Interview Prediction — 10 questions (Expert Check, Cultural Fit, Professional Story, Visionary), bespoke STAR scripts, recruiter motive & strategy.</p>
                </header>
                <div className="mt-4 space-y-4">
                  <label className="block text-[11px] uppercase tracking-[0.18em] text-slate-600">Target job description (used to tailor questions)</label>
                  <textarea
                    rows={3}
                    placeholder="Paste the job description so questions target top skills, company values, and role seniority."
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/20 resize-y"
                  />
                  <button
                    type="button"
                    disabled={interviewPrepLoading || (!sharpened && !experience.trim())}
                    onClick={async () => {
                      setInterviewPrepLoading(true);
                      setInterviewPrep(null);
                      setInterviewOpenIndex(null);
                      try {
                        const res = await fetch("/api/interview-prep", {
                          method: "POST",
                          headers: { "Content-Type": "application/json", ...authHeaders },
                          body: JSON.stringify({
                            sharpenedResume: sharpened || experience,
                            experience,
                            jobDescription: jobDescription.trim() || undefined,
                            fullName: fullName || undefined,
                            targetRole: targetRole || undefined,
                            linkedinAbout: linkedinContent?.about,
                            linkedinHeadline: linkedinContent?.headlines?.[linkedinSelectedHeadline] || linkedinContent?.headlines?.[0],
                            humanize: humanizeAI,
                          }),
                        });
                        const data = await res.json();
                        openRefillIfInsufficient(res, data);
                        if (res.status === 402) {
                          setInterviewPrep(null);
                        } else if (!res.ok) {
                          throw new Error("Failed");
                        } else {
                        setInterviewPrep({
                          questions: (data.questions ?? []).map((q: { category?: string; question?: string; winningAnswer?: string; trap?: string; motive?: string; strategy?: string }) => ({
                            category: q.category ?? "professional_story",
                            question: q.question ?? "",
                            winningAnswer: q.winningAnswer ?? "",
                            trap: q.trap ?? "",
                            motive: q.motive ?? "",
                            strategy: q.strategy ?? "",
                          })),
                          elevatorPitch: data.elevatorPitch ?? "",
                        });
                        refetchProfile();
                        }
                      } catch {
                        setInterviewPrep(null);
                      }
                      setInterviewPrepLoading(false);
                    }}
                    className="btn-glimmer w-full rounded-xl border bg-emerald-500 text-black font-bold border border-emerald-500 px-4 py-3 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50"
                  >
                    {interviewPrepLoading ? "Generating…" : <>Generate Interview Prep <span className="ml-1 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700">{getCost("INTERVIEW_PREP")} SU</span></>}
                  </button>
                </div>
              </section>
              {interviewPrep && (
                <>
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 flex-wrap">
                    <p className="text-xs text-emerald-200/90">
                      <span className="font-medium">Result: 1 elevator pitch + {interviewPrep.questions?.length ?? 0} interview questions with scripts.</span> Save: copy each section or copy all below.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        const all = [interviewPrep.elevatorPitch, ...(interviewPrep.questions ?? []).map((q) => `${q.question ?? ""}\n\n${q.winningAnswer ?? ""}`)].join("\n\n---\n\n");
                        navigator.clipboard.writeText(all);
                      }}
                      className="shrink-0 rounded-lg border border-emerald-500/50 bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-[#020617] hover:bg-emerald-500/30 inline-flex items-center gap-1"
                    >
                      <Copy className="h-3.5 w-3.5" /> Copy all
                    </button>
                  </div>
                  <section className="resume-surface glass-card rounded-2xl border border-slate-200 p-6 lg:p-7">
                    <h3 className="font-display text-base text-slate-50 mb-1">Divine 30-Second Intro</h3>
                    <p className="text-[11px] text-slate-500 mb-3">Tell me about yourself — the 100% guaranteed first question. Blends your resume + LinkedIn brand.</p>
                    {canAccessExecutivePdf ? (
                      <div className="rounded-xl border border-slate-200 bg-white/80 p-4">
                        <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-line">{interviewPrep.elevatorPitch}</p>
                        <button type="button" onClick={() => navigator.clipboard.writeText(interviewPrep.elevatorPitch)} className="mt-2 rounded-lg border border-surgicalTeal/50 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-medium text-neonGreenDark hover:bg-emerald-600 inline-flex items-center gap-1"><Copy className="h-3.5 w-3.5" /> Copy</button>
                      </div>
                    ) : (
                      <div className="relative rounded-xl border border-slate-200 bg-white/80 p-4 overflow-hidden">
                        <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-line blur-md select-none">{interviewPrep.elevatorPitch}</p>
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/30">
                          <button type="button" onClick={() => { setCheckoutTier("all_access"); setCheckoutStep("divine"); }} className="rounded-xl border border-surgicalTeal/60 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-neonGreenDark hover:bg-emerald-600 inline-flex items-center gap-2"><Lock className="h-4 w-4" /> Unlock with Executive Pass</button>
                        </div>
                      </div>
                    )}
                  </section>
                  <section className="resume-surface glass-card rounded-2xl border border-slate-200 p-6 lg:p-7">
                    <div className="flex items-center justify-between gap-4 mb-4">
                      <div>
                        <h3 className="font-display text-base text-slate-50 mb-1">Predictive Questions (accordion)</h3>
                        <p className="text-[11px] text-slate-500">Expert Check · Cultural Fit · Professional Story · Visionary. Click to reveal motive, strategy & script.</p>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer shrink-0" title="Hide answers so you can rehearse out loud first">
                        <span className="text-[11px] text-slate-600">Practice mode</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={interviewPracticeMode}
                          onClick={() => setInterviewPracticeMode((v) => !v)}
                          className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors ${interviewPracticeMode ? "border-emerald-500/60 bg-emerald-100" : "border-amber-400/60 bg-amber-100"}`}
                        >
                          <span className={`pointer-events-none inline-block h-4 w-3.5 rounded-full shadow-sm transition-transform mt-0.5 ml-0.5 ${interviewPracticeMode ? "translate-x-4 bg-emerald-500" : "translate-x-0 bg-amber-400"}`} />
                        </button>
                      </label>
                    </div>
                    <ul className="space-y-2">
                      {interviewPrep.questions.map((q, i) => {
                        const categoryLabels: Record<string, string> = {
                          expert_check: "The Expert Check (Technical)",
                          cultural_fit: "The Cultural Fit (Behavioral)",
                          professional_story: "The Professional Story (Resume)",
                          visionary: "The Visionary (Future)",
                        };
                        const label = categoryLabels[q.category] || q.category;
                        const isOpen = interviewOpenIndex === i;
                        return (
                          <li key={i} className="rounded-xl border border-slate-200 bg-white/80 overflow-hidden">
                            <button
                              type="button"
                              onClick={() => setInterviewOpenIndex(isOpen ? null : i)}
                              className="w-full text-left p-4 flex items-start justify-between gap-3 hover:bg-white/90 transition-colors"
                            >
                              <div className="min-w-0">
                                <span className="text-[10px] uppercase tracking-wider text-neonGreenDark">{label}</span>
                                <p className="text-sm font-medium text-slate-900 mt-0.5">{q.question}</p>
                              </div>
                              <span className="text-slate-500 shrink-0">{isOpen ? "−" : "+"}</span>
                            </button>
                            {isOpen && (
                              <div className="px-4 pb-4 pt-0 border-t border-slate-200 space-y-4">
                                {interviewPracticeMode ? (
                                  <p className="text-xs text-slate-500 italic py-2">Rehearse out loud, then turn Practice mode off to see the script, motive & strategy.</p>
                                ) : canAccessExecutivePdf ? (
                                  <>
                                    <div>
                                      <p className="text-[10px] uppercase tracking-wider text-amber-500/90 mb-1">What they are actually looking for</p>
                                      <p className="text-xs text-slate-600">{q.motive || q.trap}</p>
                                    </div>
                                    {q.strategy && (
                                      <div>
                                        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">The strategy</p>
                                        <p className="text-xs text-slate-600">{q.strategy}</p>
                                      </div>
                                    )}
                                    <div>
                                      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">The scripted answer (STAR)</p>
                                      <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">{q.winningAnswer}</p>
                                    </div>
                                    <button type="button" onClick={() => navigator.clipboard.writeText(q.winningAnswer)} className="rounded-lg border border-surgicalTeal/50 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-medium text-neonGreenDark hover:bg-emerald-600 inline-flex items-center gap-1"><Copy className="h-3.5 w-3.5" /> Copy answer</button>
                                  </>
                                ) : (
                                  <div className="relative py-4 overflow-hidden">
                                    <p className="text-xs text-slate-600 blur-md select-none">{q.motive || q.trap}</p>
                                    <p className="text-xs text-slate-700 blur-md select-none mt-2">{q.winningAnswer}</p>
                                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900/30">
                                      <button type="button" onClick={() => { setCheckoutTier("all_access"); setCheckoutStep("divine"); }} className="rounded-lg border border-surgicalTeal/60 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-neonGreenDark hover:bg-emerald-600 inline-flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> Executive Pass to unlock</button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                  <div className="rounded-lg border border-surgicalTeal/30 bg-emerald-500/5 px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    <p className="text-[11px] font-medium text-slate-600">What&apos;s next?</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setDashboardTab("followup")} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/60 bg-emerald-50/50 px-2.5 py-1.5 text-xs font-medium text-neonGreenDark hover:bg-emerald-100/80 transition-colors">
                        Follow-up emails <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => setDashboardTab("share")} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/60 bg-amber-50/50 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100/80 transition-colors">
                        Share your profile <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => setDashboardTab("tracker")} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/60 bg-amber-50/50 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100/80 transition-colors">
                        Track applications <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
          <div className="relative">
            {/* Full-width form — preview toggled separately */}
            <section className="space-y-4 max-w-4xl">
              <motion.div
                layout
                className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 glass-card px-4 py-3 flex-wrap"
              >
                <div className="flex-1 min-w-0">
                  <h2 className="font-display text-lg font-semibold text-[#1c1917]">Operating Table</h2>
                  <p className="text-sm text-slate-600 mt-0.5">
                    {!sharpened.length && !experience.trim()
                      ? "Step 1: Add experience, education, projects, and skills below. Click Sharpen to polish your experience bullets. The full resume (all sections) appears on the right and is what you download as PDF."
                      : "Sharpen improves your experience bullets; the final PDF includes name, contact, those bullets, plus education, projects, certifications, and skills. Download from the top bar when ready."}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(0,255,136,0.8)]" />
                  <span className="text-sm text-slate-600 hidden sm:inline">Gemini · Llama 3 ready</span>
                  <button
                    type="button"
                    onClick={() => setShowResumePreview((v) => !v)}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all duration-300 ${
                      showResumePreview
                        ? "border-emerald-500/60 bg-emerald-500/15 text-neonGreenDark"
                        : "border-emerald-400/80 bg-emerald-500/20 text-neonGreenDark shadow-[0_0_20px_rgba(0,255,136,0.3)] hover:shadow-[0_0_28px_rgba(0,255,136,0.45)] hover:scale-105 animate-[show-preview-pulse_2s_ease-in-out_infinite]"
                    }`}
                  >
                    {showResumePreview ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                    {showResumePreview ? "Hide preview" : "Show preview"}
                  </button>
                </div>
              </motion.div>

              {/* Step indicator */}
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 py-2">
                {[1, 2, 3].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setResumeFormStep(s)}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      resumeFormStep === s
                        ? "bg-emerald-500/15 text-neonGreenDark border border-emerald-500/40"
                        : "text-slate-600 hover:bg-slate-100 border border-transparent"
                    }`}
                  >
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs bg-emerald-500/20 text-neonGreenDark">{s}</span>
                    {s === 1 && "Vitals"}
                    {s === 2 && "Experience"}
                    {s === 3 && "Skills & More"}
                  </button>
                ))}
              </div>

              {resumeFormStep === 1 && (
              <motion.div layout className="bento-card p-4 space-y-3" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.2 }}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="font-medium text-slate-900 uppercase tracking-[0.18em] text-sm">
                    Vital Info
                  </h3>
                  <input
                    ref={resumeUploadInputRef}
                    type="file"
                    accept=".pdf,.txt,application/pdf,text/plain"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setResumeUploadError(null);
                      setResumeUploadLoading(true);
                      try {
                        const fd = new FormData();
                        fd.append("file", file);
                        const response = await fetch("/api/parse-resume", { method: "POST", body: fd });
                        const data = await response.json() as {
                          fullName?: string;
                          email?: string;
                          targetRole?: string;
                          profileUrl?: string;
                          experience?: string;
                          skills?: string;
                          education?: string;
                          projects?: string;
                          certifications?: string;
                          error?: string;
                        };
                        if (!response.ok) throw new Error(data.error || "Failed to parse file.");
                        if (data.fullName?.trim()) setFullName(data.fullName.trim());
                        if (data.email?.trim()) setEmail(data.email.trim());
                        if (data.targetRole?.trim()) setTargetRole(data.targetRole.trim());
                        if (data.profileUrl?.trim()) {
                          setProfileUrl(data.profileUrl.trim());
                          setLinkStatus("idle");
                          setCleanLinkSuggestion(null);
                        }
                        setExperience(data.experience != null ? String(data.experience).trim() : "");
                        setSkills(data.skills != null ? String(data.skills).trim() : "");
                        setEducation(data.education != null ? String(data.education).trim() : "");
                        setProjects(data.projects != null ? String(data.projects).trim() : "");
                        setCertification(data.certifications != null ? String(data.certifications).trim() : "");
                      } catch (err) {
                        setResumeUploadError(err instanceof Error ? err.message : "Upload failed.");
                      } finally {
                        setResumeUploadLoading(false);
                        e.target.value = "";
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => resumeUploadInputRef.current?.click()}
                    disabled={resumeUploadLoading}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/60 bg-amber-50/50 px-2.5 py-1.5 text-[11px] font-medium text-amber-700 hover:border-amber-500/70 hover:bg-amber-100/80 disabled:opacity-50 transition-colors"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {resumeUploadLoading ? "Reading…" : "Upload resume (PDF or TXT)"}
                  </button>
                </div>
                {resumeUploadError && (
                  <p className="text-[11px] text-rose-400">{resumeUploadError}</p>
                )}
                  <div className="space-y-3">
                    <input
                      type="text"
                      placeholder="Full name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                    />
                    <input
                      type="text"
                      placeholder="Target role or title (e.g. Senior Product Manager)"
                      value={targetRole}
                      onChange={(e) => setTargetRole(e.target.value)}
                      onBlur={() => setTouchedTitle(true)}
                      className={`w-full rounded-lg border bg-white/80 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-1 ${
                        touchedTitle && !targetRole.trim()
                          ? "border-surgicalTeal/70 ring-surgicalTeal/60"
                          : "border-slate-200 focus:border-emerald-500/70 focus:ring-emerald-500/20"
                      }`}
                    />
                    {powerSkillsSuggestions.length > 0 && (
                      <div className="rounded-lg border border-slate-200 bg-white/80 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Power skills you might add</p>
                        <div className="flex flex-wrap gap-1.5">
                          {powerSkillsSuggestions.map((skill, i) => (
                            <motion.button
                              key={i}
                              type="button"
                              whileHover={{ scale: 1.03 }}
                              whileTap={{ scale: 0.97 }}
                              onClick={() => setSkills((s) => (s.trim() ? `${s}, ${skill}` : skill))}
                              className="rounded-md border border-surgicalTeal/30 bg-emerald-500/5 px-2 py-1 text-[11px] text-neonGreenDark hover:bg-emerald-500/15"
                            >
                              + {skill}
                            </motion.button>
                          ))}
                        </div>
                      </div>
                    )}
                    <input
                      type="email"
                      placeholder="Professional email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onBlur={() => setTouchedEmail(true)}
                      className={`w-full rounded-lg border bg-white/80 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-1 ${
                        touchedEmail && !email.trim()
                          ? "border-surgicalTeal/70 ring-surgicalTeal/60"
                          : "border-slate-200 focus:border-emerald-500/70 focus:ring-emerald-500/20"
                      }`}
                    />
                    <div className="space-y-1">
                      <input
                        type="url"
                        placeholder="LinkedIn or portfolio URL"
                        value={profileUrl}
                        onChange={(e) => {
                          setProfileUrl(e.target.value);
                          setLinkStatus("idle");
                          setCleanLinkSuggestion(null);
                        }}
                        className="w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                      />
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={handleCheckLink}
                          disabled={linkStatus === "checking" || !profileUrl.trim()}
                          className="text-[10px] text-neonGreenDark hover:underline disabled:opacity-50"
                        >
                          {linkStatus === "checking" ? "Checking…" : "Link Surgeon: Check & clean"}
                        </button>
                        {linkStatus === "valid" && (
                          <span className="text-[10px] text-neonGreen">✓ Valid</span>
                        )}
                        {linkStatus === "invalid" && (
                          <span className="text-[10px] text-amber-400">Invalid or unreachable</span>
                        )}
                        {cleanLinkSuggestion && (
                          <button
                            type="button"
                            onClick={() => {
                              setProfileUrl(cleanLinkSuggestion!);
                              setCleanLinkSuggestion(null);
                              setLinkStatus("idle");
                            }}
                            className="text-[10px] text-neonGreenDark hover:underline"
                          >
                            Use clean link: {cleanLinkSuggestion}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
              </motion.div>
              )}

              {resumeFormStep === 2 && (
              <motion.div layout className="bento-card p-4 space-y-2" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.2 }}>
                <h3 className="font-medium text-slate-900 uppercase tracking-[0.18em] text-sm">Experience</h3>
                <textarea
                  rows={6}
                  placeholder="Paste your work experience and bullet points here, or upload your resume above."
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                />
              </motion.div>
              )}

              {resumeFormStep === 3 && (
              <>
              <motion.div layout className="bento-card p-4 space-y-2" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}>
                <h3 className="font-medium text-slate-900 uppercase tracking-[0.18em] text-sm">Skills</h3>
                <textarea
                  rows={3}
                  placeholder="Key skills, tools, and domains you want emphasized."
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                />
              </motion.div>

              <motion.div layout className="bento-card p-4 space-y-2">
                <h3 className="font-medium text-slate-900 uppercase tracking-[0.18em] text-[11px]">Education</h3>
                <textarea
                  rows={3}
                  placeholder="Degree(s), institution(s), year(s). Leave empty to omit from resume."
                  value={education}
                  onChange={(e) => setEducation(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                />
              </motion.div>

              <motion.div layout className="bento-card p-4 space-y-2">
                <h3 className="font-medium text-slate-900 uppercase tracking-[0.18em] text-[11px]">Projects</h3>
                <textarea
                  rows={3}
                  placeholder="Notable projects, deliverables, or side work. Leave empty to omit from resume."
                  value={projects}
                  onChange={(e) => setProjects(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                />
              </motion.div>

              <motion.div layout className="bento-card p-4 space-y-2">
                <h3 className="font-medium text-slate-900 uppercase tracking-[0.18em] text-sm">Certifications</h3>
                <textarea
                  rows={2}
                  placeholder="Certifications, licenses, or courses. Leave empty to omit from resume."
                  value={certification}
                  onChange={(e) => setCertification(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                />
              </motion.div>
              </>
              )}

              {/* Step navigation — at bottom of form */}
              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/80 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setResumeFormStep((s) => Math.max(1, s - 1))}
                  disabled={resumeFormStep === 1}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ← Previous
                </button>
                <span className="text-sm text-slate-500">Step {resumeFormStep} of 3</span>
                <button
                  type="button"
                  onClick={() => setResumeFormStep((s) => Math.min(3, s + 1))}
                  disabled={resumeFormStep === 3}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/60 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-neonGreenDark hover:bg-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>

              <motion.div layout className="bento-card p-4 space-y-2">
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setShowJobDescription((v) => !v)}
                    className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-xs text-slate-800 hover:border-surgicalTeal/70 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium uppercase tracking-[0.18em] text-[11px]">
                        Target Job Description
                      </span>
                      <span className="text-[10px] text-slate-500">
                        Optional · improves match rate
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-neonGreenDark text-[10px]">
                      <Activity className="h-3.5 w-3.5" />
                      <span>{showJobDescription ? "Hide" : "Listening"}</span>
                    </div>
                  </button>

                  {showJobDescription && (
                    <textarea
                      rows={5}
                      placeholder="Paste the target job description here. The Resume Surgeon will align your bullets to the exact role requirements."
                      value={jobDescription}
                      onChange={(e) => setJobDescription(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-500 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                    />
                  )}
                </div>
              </motion.div>

              {status === "sharpening" && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bento-card rounded-xl border border-slate-200 px-4 py-3 space-y-2 flex items-start gap-3"
                >
                  <div className="surgical-pulse mt-0.5" aria-hidden />
                  <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-neonGreenDark font-medium">
                    Surgical Progress
                  </p>
                  <ul className="space-y-1.5 text-xs text-slate-700">
                    {[
                      "Generating Executive Summary...",
                      "Injecting Quantifiable Metrics...",
                      "Optimizing for ATS Parsers...",
                      "Final Polishing...",
                    ].map((label, i) => (
                      <li
                        key={i}
                        className={`flex items-center gap-2 ${
                          surgicalStep > i ? "text-neonGreenDark" : "text-slate-500"
                        }`}
                      >
                        {surgicalStep > i ? (
                          <span className="text-neonGreenDark" aria-hidden>✓</span>
                        ) : (
                          <span className="w-4 h-4 rounded-full border border-slate-600" aria-hidden />
                        )}
                        <span>{label}</span>
                      </li>
                    ))}
                  </ul>
                  </div>
                </motion.div>
              )}

              <motion.div layout className="bento-card rounded-2xl border border-slate-200 p-4 mt-4 space-y-3">
                {/* Primary: polish every section — name, contact, experience, education, projects, certs, skills */}
                {polishResumeError && (
                  <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-red-200">{polishResumeError}</span>
                    <button type="button" onClick={() => setPolishResumeError(null)} className="text-slate-700 hover:text-white" aria-label="Dismiss">×</button>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[11px] text-slate-600">
                    <span className="font-medium text-slate-700">Polish full resume</span> — works on every part: name, contact, experience, education, projects, certifications, skills. Deletes unnecessary info, perfects wording (including how your name is written), arranges everything in a professional order with the right keywords.
                  </p>
                  <button
                    type="button"
                    onClick={handlePolishFullResume}
                    disabled={polishResumeLoading || !hasResumeContent}
                    className="btn-glimmer inline-flex items-center gap-2 rounded-lg border bg-emerald-500 text-black font-bold border border-emerald-500 px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {polishResumeLoading ? (
                      <>
                        <span className="surgical-pulse" aria-hidden />
                        Polishing entire resume…
                      </>
                    ) : (
                      <>
                        Polish full resume
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700">{getCost("POLISH_RESUME")} SU</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="border-t border-white/10 pt-3 flex items-center justify-between">
                <div className="flex flex-col items-start gap-2 text-[11px] text-slate-600">
                  <p>
                    <span className="text-slate-500">Quick:</span> Sharpen experience bullets only.
                  </p>
                  {provider && status === "done" && (
                    <p className="text-neonGreenDark/80">
                      Latest surgery powered by{" "}
                      <span className="font-semibold uppercase">
                        {provider === "gemini" ? "Gemini Pro" : "Llama 3 70B"}
                      </span>
                      .
                    </p>
                  )}
                </div>
                <motion.button
                  type="button"
                  onClick={handleSharpen}
                  disabled={status === "sharpening" || polishResumeLoading || !experience.trim()}
                  className="btn-glimmer inline-flex items-center gap-2 rounded-full border bg-emerald-500 text-black font-bold border border-emerald-500 px-4 py-1.5 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  animate={
                    status === "idle" && experience.trim()
                      ? {
                          boxShadow: [
                            "0 0 0 0 rgba(45,212,191,0.0)",
                            "0 0 0 8px rgba(45,212,191,0.0)",
                          ],
                        }
                      : {}
                  }
                  transition={{
                    duration: 1.5,
                    repeat: status === "idle" && experience.trim() ? Infinity : 0,
                  }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {status === "sharpening" ? (
                    <>
                      <span className="surgical-pulse" aria-hidden />
                      <span>Performing resume surgery…</span>
                    </>
                  ) : (
                    <>
                      <span>Sharpen bullet points</span>
                      <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700">{getCost("SHARPEN")} SU</span>
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(0,255,136,0.9)]" />
                    </>
                  )}
                </motion.button>
              </div>
              </motion.div>

              {/* Surgical Share — after form */}
              <div className="rounded-xl border border-slate-200 glass-card p-4 space-y-3">
                <p className="text-sm font-semibold uppercase tracking-wider text-neonGreenDark">Surgical Share</p>
                <p className="text-sm text-slate-600">Share a public link to your Executive Resume. Recruiters can view, copy email, open LinkedIn, and download PDF (if you have Executive Pass).</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-sm text-slate-600">Public Visibility (allow search engines)</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={sharePublicVisibility}
                    onClick={() => setSharePublicVisibility((v) => !v)}
                    className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors ${sharePublicVisibility ? "border-emerald-500/60 bg-emerald-100" : "border-amber-400/60 bg-amber-100"}`}
                  >
                    <span className={`pointer-events-none inline-block h-4 w-3.5 rounded-full shadow-sm transition-transform mt-0.5 ml-0.5 ${sharePublicVisibility ? "translate-x-4 bg-emerald-500" : "translate-x-0 bg-amber-400"}`} />
                  </button>
                </label>
                <button
                  type="button"
                  disabled={shareLoading || !session?.access_token}
                  onClick={async () => {
                    setShareLoading(true);
                    setShareUrl(null);
                    try {
                      const res = await fetch("/api/public-profile", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session!.access_token}` },
                        body: JSON.stringify({
                          snapshot: {
                            fullName: fullName || undefined,
                            targetRole: targetRole || undefined,
                            email: email || undefined,
                            profileUrl: profileUrl || undefined,
                            experience: experience || undefined,
                            sharpened: sharpened || undefined,
                            skills: skills || undefined,
                            education: education?.trim() || undefined,
                            projects: projects?.trim() || undefined,
                            certification: certification?.trim() || undefined,
                          },
                          noindex: !sharePublicVisibility,
                        }),
                      });
                      if (!res.ok) {
                        const err = await res.json().catch(() => ({}));
                        throw new Error(err.error || "Failed to create share link");
                      }
                      const data = await res.json();
                      setShareUrl(data.url ?? null);
                      if (data.url) navigator.clipboard.writeText(data.url);
                    } catch (e) {
                      setShareUrl(null);
                      console.error(e);
                    }
                    setShareLoading(false);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/60 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-neonGreenDark hover:bg-emerald-500/20 disabled:opacity-50"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  {shareLoading ? "Generating…" : "Share My Surgical Profile"}
                </button>
                {!session?.access_token && (
                  <p className="text-xs text-amber-600">Sign in to generate your share link.</p>
                )}
                {shareUrl && (
                  <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white/80 px-3 py-2">
                    <input readOnly value={shareUrl} className="flex-1 min-w-0 bg-transparent text-sm text-slate-700 outline-none" />
                    <button type="button" onClick={() => navigator.clipboard.writeText(shareUrl)} className="shrink-0 rounded p-1.5 text-neonGreenDark hover:bg-emerald-100" title="Copy"><Copy className="h-3.5 w-3.5" /></button>
                    <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-sm text-neonGreenDark hover:underline font-medium">Open</a>
                  </div>
                )}
              </div>
            </section>

            {/* Slide-over preview panel — only when toggled */}
            <AnimatePresence>
              {showResumePreview && (
              <motion.section
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                className="fixed right-0 top-0 z-40 flex h-full w-full max-w-[420px] flex-col overflow-hidden border-l border-slate-200/80 bg-white/98 shadow-[0_0_40px_rgba(15,23,42,0.12)] backdrop-blur-xl"
              >
                <div className="flex items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 py-3">
                  <h3 className="text-sm font-semibold text-slate-800">Resume preview</h3>
                  <button
                    type="button"
                    onClick={() => setShowResumePreview(false)}
                    className="group relative rounded-xl border border-emerald-400/50 bg-emerald-500/10 px-3 py-2 text-neonGreenDark shadow-[0_0_20px_rgba(0,255,136,0.35)] transition-all duration-300 hover:border-emerald-400/80 hover:bg-emerald-500/20 hover:shadow-[0_0_28px_rgba(0,255,136,0.5)] hover:scale-105 active:scale-95"
                    aria-label="Hide preview"
                  >
                    <PanelRightClose className="h-4 w-4 transition-transform group-hover:rotate-90" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto overscroll-contain p-4">
              <div className="relative">
              <motion.div
                className="relative"
                whileHover={{ scale: 1.02 }}
                transition={{ type: "spring", stiffness: 300, damping: 24 }}
              >
              <div
                className={`relative resume-paper print-resume-page rounded-xl border border-slate-200/80 bg-[#fefefe] shadow-lg px-6 py-6 ${
                  theme === "surgeon"
                    ? "theme-surgeon"
                    : theme === "partner"
                    ? "theme-partner"
                    : "theme-innovator"
                }`}
              >
                <div className="mb-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <p className="text-[11px] text-slate-500">Your full resume. Download from the top bar when ready.</p>
                    </div>
                    <div className="flex gap-1 border-b border-slate-200/60 pb-2">
                      <button
                        type="button"
                        onClick={() => setPreviewTab("preview")}
                        className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          previewTab === "preview"
                            ? "bg-slate-900/10 text-slate-800 border border-slate-200"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        View resume
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewTab("simulation")}
                        className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          previewTab === "simulation"
                            ? "bg-slate-900/10 text-slate-800 border border-slate-200"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Recruiter view
                      </button>
                    </div>
                  </div>
                  {status === "idle" && (sharpened.length > 0 || fullName.trim() || experience.trim()) && (
                    <>
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 flex-wrap">
                        <p className="text-xs text-neonGreenDark">
                          <span className="font-medium">Resume ready.</span> The preview below is your final document. Save or download from here or the top bar.
                        </p>
                        {canDownloadResume ? (
                          <button
                            type="button"
                            onClick={() => { setPreviewTab("preview"); setTimeout(() => { if (previewRef.current && typeof handlePrint === "function") handlePrint(); }, 100); }}
                            className="shrink-0 rounded-lg border border-emerald-600 bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-neonGreenDark hover:bg-emerald-500/30"
                          >
                            Download Resume PDF
                          </button>
                        ) : (
                          <button type="button" onClick={() => setShowPaywall(true)} className="shrink-0 rounded-lg border border-amber-400/60 bg-amber-50/50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100/80">Unlock PDF download</button>
                        )}
                      </div>
                      <div className="rounded-lg border border-surgicalTeal/30 bg-emerald-500/5 px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                        <p className="text-[11px] font-medium text-slate-700">What&apos;s next?</p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setDashboardTab("cover-letter")}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-surgicalTeal/60 bg-white px-2.5 py-1.5 text-xs font-medium text-neonGreenDark hover:bg-emerald-100/80 transition-colors"
                          >
                            Generate cover letter
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDashboardTab("proposals")}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/60 bg-amber-50/50 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100/80 transition-colors"
                          >
                            Create a proposal
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDashboardTab("linkedin")}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/60 bg-amber-50/50 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100/80 transition-colors"
                          >
                            Polish LinkedIn
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Printable resume content – kept in DOM when simulation active for print */}
                <div
                  ref={previewRef}
                  className={
                    previewTab === "preview"
                      ? "block"
                      : "absolute -left-[9999px] w-[210mm] opacity-0 pointer-events-none"
                  }
                  aria-hidden={previewTab !== "preview"}
                >
                  {!hasFullAccess && (
                    <div className="exec-watermark resume-watermark" aria-hidden>
                      <span>RESUME SURGEON — PREVIEW</span>
                    </div>
                  )}
                  <AnimatePresence initial={false}>
                    {status === "sharpening" && (
                      <motion.div
                        key={scanKey}
                        className="pointer-events-none absolute inset-x-[-32px] top-0 h-24 bg-gradient-to-b from-surgicalTeal/35 via-surgicalTeal/8 to-transparent mix-blend-screen"
                        initial={{ y: -160, opacity: 0 }}
                        animate={{ y: "120%", opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1.2, ease: "easeInOut" }}
                      >
                        <div className="absolute inset-x-0 top-8 h-px bg-gradient-to-r from-transparent via-surgicalTeal/70 to-transparent shadow-[0_0_24px_rgba(45,212,191,0.9)]" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="font-display text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    Bespoke Themes
                  </p>
                  <div className="flex gap-2 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setTheme("surgeon")}
                      className={`flex items-center gap-2 rounded-lg border px-2.5 py-1 ${
                        theme === "surgeon"
                          ? "bg-emerald-500 text-black font-bold border border-emerald-500"
                          : "border-slate-200 bg-white/60"
                      }`}
                    >
                      <span className="h-4 w-6 rounded-sm bg-slate-900/90" />
                      <span>The Surgeon</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (hasFullAccess) {
                          setTheme("partner");
                        } else {
                          setShowPaywall(true);
                        }
                      }}
                      className={`flex items-center gap-2 rounded-lg border px-2.5 py-1 ${
                        theme === "partner" && hasFullAccess
                          ? "border-surgicalTeal/60 bg-emerald-500/5"
                          : "border-slate-200 bg-white/40"
                      }`}
                    >
                      <span className="h-4 w-6 rounded-sm bg-slate-800" />
                      <span>The Partner</span>
                      {!hasFullAccess && <Lock className="h-3 w-3 text-slate-500" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (hasFullAccess) {
                          setTheme("innovator");
                        } else {
                          setShowPaywall(true);
                        }
                      }}
                      className={`hidden sm:flex items-center gap-2 rounded-lg border px-2.5 py-1 ${
                        theme === "innovator" && hasFullAccess
                          ? "border-surgicalTeal/60 bg-emerald-500/5"
                          : "border-slate-200 bg-white/40"
                      }`}
                    >
                      <span className="h-4 w-6 rounded-sm bg-slate-300" />
                      <span>The Innovator</span>
                      {!hasFullAccess && <Lock className="h-3 w-3 text-slate-500" />}
                    </button>
                  </div>
                </div>

                {/* Full resume: professional order — name, contact, experience, education, projects, certs, skills */}
                <div className="resume-doc">
                <div className="text-center pb-5 mb-5 border-b border-slate-200/50">
                  <h1 className="exec-name mb-1">
                    {fullName || "Candidate Name"}
                  </h1>
                  <p className="exec-body text-[10pt] uppercase tracking-[0.12em] text-[#0f172a]/80 mb-4">
                    {targetRole || "Target Role"}
                  </p>
                  <div className="exec-body flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[9pt] text-[#0f172a]/90">
                    <span className={hasFullAccess ? "" : "resume-contact-blur"}>(555) 555-1234</span>
                    <span className="exec-contact-dot">•</span>
                    <span className={hasFullAccess ? "" : "resume-contact-blur"}>{email || "you@example.com"}</span>
                    <span className="exec-contact-dot">•</span>
                    <span className={hasFullAccess ? "" : "resume-contact-blur"}>{profileUrl.trim() || "linkedin.com/in/username"}</span>
                    <span className="exec-contact-dot">•</span>
                    <span className={hasFullAccess ? "" : "resume-contact-blur"}>City, Country</span>
                  </div>
                </div>

                <div className={`space-y-5 exec-body ${theme === "innovator" ? "resume-layout" : ""}`}>
                  {/* Single Experience section: role/company + bullet points (sharpened or original) */}
                  <div className="resume-section-block space-y-2">
                    <h3 className="exec-section-header">Professional Experience</h3>
                    <div className="exec-divider mb-2" />
                    {(experience.trim() || sharpened.length > 0) && (
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-x-4 gap-y-0 items-baseline mb-2">
                        <div>
                          <p className="font-semibold text-[#0f172a]">{targetRole || "Role Title"}</p>
                          <p className="text-[9pt] text-[#0f172a]/75">Company Name</p>
                        </div>
                        <div className="text-right text-[9pt] text-[#0f172a]/75">
                          <span>2020 – Present</span>
                          <span className="exec-accent mx-1">·</span>
                          <span>Location</span>
                        </div>
                      </div>
                    )}
                    {!(experience.trim() || sharpened.length) ? (
                      <p className="exec-ghost">Add your experience to see the magic…</p>
                    ) : (
                      <div className="space-y-2">
                        {/* Before/after compare — hidden in print so PDF is clean */}
                        {experience.trim() && compare && (
                          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-500 print:hidden">
                            <p className="font-medium uppercase tracking-[0.18em] mb-1">Before</p>
                            <ul className="resume-bullet-list space-y-1">
                              {experience.split("\n").filter((line) => line.trim().length > 0).map((line, idx) => (
                                <li key={`before-${idx}`} className="flex items-start gap-2">
                                  <span className="exec-bullet-dash" />
                                  <span className="resume-bullet-text">{line}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {/* Final resume content: sharpened bullets as a proper list (screen + PDF) */}
                        <ul className="resume-bullet-list space-y-1.5 text-[#0f172a]">
                          {(sharpened || experience)
                            .trim()
                            .split("\n")
                            .filter((line) => line.trim().length > 0)
                            .map((line, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <span className="exec-bullet-dash" />
                                <span className="resume-bullet-text">{line.trim()}</span>
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {education?.trim() ? (
                    <div className="resume-section-block space-y-2">
                      <h3 className="exec-section-header">Education</h3>
                      <div className="exec-divider mb-2" />
                      <p className="whitespace-pre-line text-[#0f172a]">{education.trim()}</p>
                    </div>
                  ) : null}

                  {projects?.trim() ? (
                    <div className="resume-section-block space-y-2">
                      <h3 className="exec-section-header">Projects</h3>
                      <div className="exec-divider mb-2" />
                      <p className="whitespace-pre-line text-[#0f172a]">{projects.trim()}</p>
                    </div>
                  ) : null}

                  {certification?.trim() ? (
                    <div className="resume-section-block space-y-2">
                      <h3 className="exec-section-header">Certifications</h3>
                      <div className="exec-divider mb-2" />
                      <p className="whitespace-pre-line text-[#0f172a]">{certification.trim()}</p>
                    </div>
                  ) : null}

                  {skills?.trim() ? (
                    <div className="resume-section-block space-y-2">
                      <h3 className="exec-section-header">Skills</h3>
                      <div className="exec-divider mb-2" />
                      <p className="text-[#0f172a]">{skills.trim()}</p>
                    </div>
                  ) : null}
                </div>
                </div>

                {/* Resume health report — below your full resume */}
                <div className="mt-6 rounded-xl border border-slate-200/60 bg-slate-50/80 px-4 py-3">
                  <div className="flex items-center justify-between gap-4 mb-2">
                    <div>
                      <p className="font-display text-[11px] uppercase text-slate-600">Resume health</p>
                      <p className="text-[10px] text-slate-500">Real-time diagnosis. Paste a job description for match rate.</p>
                    </div>
                    <div className="text-right space-y-1">
                      <div className="relative">
                        <AnimatePresence>
                          {showSuccessPulse && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              className="success-pulse badge-glow absolute -top-1 -right-1 z-10 rounded-full bg-emerald-500 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-black"
                            >
                              Success
                            </motion.div>
                          )}
                        </AnimatePresence>
                        <p className={`font-display text-xl leading-none ${showSuccessPulse ? "text-neonGreenDark" : "text-slate-900"}`}>
                          {score}%
                        </p>
                        <p className="text-[10px] text-slate-500">Strength</p>
                      </div>
                      <div className="text-[10px]">
                        {matchRate == null ? (
                          <p className="text-slate-500">Add job description for match %</p>
                        ) : (
                          <p className="text-slate-700">
                            Match: <span className="font-semibold">{matchRate}%</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden mb-2">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-surgicalTeal to-surgicalTeal/80 transition-all duration-500"
                      style={{ width: `${score}%` }}
                    />
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 text-[10px]">
                    <ul className="space-y-1">
                      {vitalSigns.map((vital, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <span
                            className={`mt-[2px] h-1.5 w-1.5 rounded-full ${
                              vital.status === "good"
                                ? "bg-emerald-400"
                                : vital.status === "warning"
                                ? "bg-amber-400"
                                : "bg-rose-400"
                            }`}
                          />
                          <span className="text-slate-700">{vital.label}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="space-y-1">
                      {advice.map((item, idx) => (
                        <div key={idx} className="rounded-md bg-slate-900/5 px-2 py-1.5">
                          <p className="font-semibold text-[10px] text-slate-800">{item.title}</p>
                          <p className="text-[10px] text-slate-600">{item.body}</p>
                        </div>
                      ))}
                      {jobDescription.trim() && missingKeywords.length > 0 && (
                        <div className="rounded-md bg-slate-900/5 px-2 py-1.5">
                          <p className="font-semibold text-[10px] text-slate-800">Missing keywords</p>
                          <p className="text-[10px] text-slate-600">{missingKeywords.slice(0, 6).join(", ")}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {previewTab === "simulation" ? (
                <div className="space-y-4 pt-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-slate-600">
                      Recruiter&apos;s Eye
                    </p>
                    <button
                      type="button"
                      onClick={handleRecruiterEye}
                      disabled={recruiterLoading || (!experience.trim() && !sharpened.trim())}
                      className="inline-flex items-center gap-2 rounded-full border bg-emerald-500 text-black font-bold border border-emerald-500 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      {recruiterLoading ? "Running simulation…" : <>Run simulation <span className="ml-1 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700">{getCost("RECRUITER_EYE")} SU</span></>}
                    </button>
                  </div>

                  <div className="relative rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 min-h-[140px]">
                    <div className="recruiter-heatmap-resume text-[11px] text-slate-700 space-y-3">
                      <div className="relative recruiter-heat-zone-header rounded-md px-2 py-1.5 bg-white/90">
                        <div className="recruiter-heat-overlay" aria-hidden />
                        <p className="font-semibold">{fullName || "Name"}</p>
                        <p className="text-slate-500">{targetRole || "Title"}</p>
                      </div>
                      <div className="relative recruiter-heat-zone-job rounded-md px-2 py-1.5 bg-white/90">
                        <div className="recruiter-heat-overlay" aria-hidden />
                        <p className="font-medium text-slate-800">Most recent role</p>
                        <p className="text-slate-600 truncate">
                          {(sharpened || experience || "Experience bullets here").split("\n")[0] || "—"}
                        </p>
                      </div>
                      <div className="relative recruiter-heat-zone-skills rounded-md px-2 py-1.5 bg-white/90">
                        <div className="recruiter-heat-overlay" aria-hidden />
                        <p className="font-medium text-slate-800">Skills</p>
                        <p className="text-slate-600">{skills || "Skills listed here"}</p>
                      </div>
                    </div>
                  </div>

                  {recruiterFetched && recruiterVibeSummary && (
                    <div className="rounded-xl border border-surgicalTeal/30 bg-emerald-500/5 px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-neonGreenDark mb-0.5">
                        Voice / Vibe
                      </p>
                      <p className="text-[10px] text-slate-500 mb-1">Based on this resume, the recruiter sees you as:</p>
                      <p className="text-[13px] font-medium text-slate-800">
                        {recruiterVibeSummary}
                      </p>
                    </div>
                  )}
                  {recruiterFetched && recruiterImpression && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500 mb-1">6-Second Impression</p>
                      <p className="text-[12px] text-slate-800 leading-relaxed">
                        {recruiterImpression}
                      </p>
                    </div>
                  )}

                  <div className="rounded-xl border border-slate-200/80 bg-white/80 overflow-hidden">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 px-3 py-2 border-b border-slate-200/80">
                      Hard interview questions (premium)
                    </p>
                    <div className="relative min-h-[100px] p-3">
                      {recruiterFetched && recruiterQuestions.length > 0 ? (
                        <>
                          <div
                            className={`text-[12px] text-slate-700 space-y-2 ${!hasFullAccess ? "select-none blur-md pointer-events-none" : ""}`}
                          >
                            {recruiterQuestions.map((q, i) => (
                              <p key={i} className="flex gap-2">
                                <span className="text-slate-600 font-medium">{i + 1}.</span>
                                {q}
                              </p>
                            ))}
                          </div>
                          {!hasFullAccess && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/60">
                              <p className="text-[11px] text-slate-600 text-center px-4">
                                Unlock all Premium Surgical Styles with the Executive Pass.
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  setCheckoutTier("all_access");
                                  setCheckoutStep("divine");
                                  setPaymentTab("mpesa");
                                  setPaymentError(null);
                                  setShowPaywall(true);
                                }}
                                className="rounded-full border bg-emerald-500 text-black font-bold border border-emerald-500 px-4 py-2 text-xs font-medium hover:bg-emerald-500/15"
                              >
                                Unlock All-Access Pass
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-[11px] text-slate-500">
                          Run the simulation to generate 3 hard questions based on your resume.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
              </div>
              </motion.div>
            </div>
                </div>
              </motion.section>
              )}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  </div>
</main>
</div>

      <AnimatePresence>
        {syncingToast && (
          <motion.div
            className="fixed bottom-6 left-1/2 z-[38] -translate-x-1/2 rounded-full border border-slate-200 glass-panel px-4 py-2 text-xs text-slate-700 shadow-lg flex items-center gap-2"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Syncing across documents…
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showPaywall && (
          <motion.div
            className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/30 backdrop-blur"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full max-w-md rounded-2xl border border-surgicalTeal/40 bg-white/95 backdrop-blur-xl px-6 py-5 shadow-[0_24px_80px_rgba(15,23,42,0.9)]"
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 16, opacity: 0 }}
            >
              <h3 className="font-display text-xl text-slate-900 mb-1">
                {checkoutTier === "all_access" ? "Unlock Executive Pass" : "Checkout"}
              </h3>

              {checkoutStep === "tier" && (
              <>
                  <p className="text-sm text-slate-700 mb-4">Choose one option. Subscribe with Executive Pass or just top up Surgical Units.</p>
                  <div className="space-y-2 mb-4">
                    {(livePricing?.isEarlyBird && (livePricing?.slotsRemaining ?? 0) > 0) ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setExecutivePassChosenPrice(999);
                            setCheckoutTier("all_access");
                            setCheckoutStep("divine");
                            setPaymentError(null);
                          }}
                          className="w-full rounded-xl border border-surgicalTeal/50 bg-emerald-500/10 hover:border-surgicalTeal/70 px-4 py-3 text-left transition-colors"
                        >
                          <span className="font-semibold text-slate-900">Executive Pass — 999 KES</span>
                          <span className="block text-xs text-slate-600 mt-0.5">Early bird · First 100 only. Full access + ~5,000 SU. PDF, themes, Proposal Engine, portfolio site.</span>
                          <span className="mt-1 flex flex-wrap items-baseline gap-2">
                            <span className="text-neonGreenDark font-semibold">999 KES</span>
                            <span className="text-slate-500 text-xs line-through">1,499 KES</span>
                            <span className="text-amber-400/90 text-xs font-medium">500 KES off</span>
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setExecutivePassChosenPrice(1499);
                            setCheckoutTier("all_access");
                            setCheckoutStep("divine");
                            setPaymentError(null);
                          }}
                          className="w-full rounded-xl border border-amber-400/60 bg-amber-50/50 hover:border-amber-500/70 hover:bg-amber-100/80 px-4 py-3 text-left transition-colors"
                        >
                          <span className="font-semibold text-slate-900">Executive Pass — 1,499 KES</span>
                          <span className="block text-xs text-slate-600 mt-0.5">Standard price (after first 100). Same benefits: full access + ~5,000 SU.</span>
                          <span className="mt-1 text-neonGreenDark font-semibold">1,499 KES</span>
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setExecutivePassChosenPrice(1499);
                          setCheckoutTier("all_access");
                          setCheckoutStep("divine");
                          setPaymentError(null);
                        }}
                        className="w-full rounded-xl border border-surgicalTeal/50 bg-emerald-500/10 hover:border-surgicalTeal/70 px-4 py-3 text-left transition-colors"
                      >
                        <span className="font-semibold text-slate-900">Executive Pass — 1,499 KES</span>
                        <span className="block text-xs text-slate-600 mt-0.5">Full access + ~5,000 Surgical Units. One-time. PDF, themes, Proposal Engine, portfolio site.</span>
                        <span className="mt-1 text-neonGreenDark font-semibold">1,499 KES</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setShowPaywall(false);
                        setCheckoutTier(null);
                        setCheckoutStep("tier");
                        setExecutivePassChosenPrice(null);
                        setShowRefillModal(true);
                        setPaymentError(null);
                      }}
                      className="w-full rounded-xl border border-slate-200 bg-white/90 hover:border-surgicalTeal/50 px-4 py-3 text-left transition-colors"
                    >
                      <span className="font-semibold text-slate-900">Top up Surgical Units only</span>
                      <span className="block text-xs text-slate-600 mt-0.5">Add more SU with any amount (KSH). Bonus tiers at 500, 1000, 2000+. No subscription.</span>
                      <span className="text-neonGreenDark font-semibold mt-1">Refill Balance</span>
                    </button>
                  </div>
                  <div className="rounded-xl border border-slate-200/80 bg-slate-800/40 px-3 py-2.5">
                    <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-2 text-center">Surgical Guarantee</p>
                    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 mb-2">
                      <span className="inline-flex items-center gap-1 text-[10px] text-slate-600">
                        <Shield className="h-3.5 w-3.5 text-neonGreenDark/80" aria-hidden />
                        ATS-Verified Structure
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-slate-600">
                        <Check className="h-3.5 w-3.5 text-neonGreenDark/80" aria-hidden />
                        Recruiter-Approved Logic
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-slate-600">
                        <Star className="h-3.5 w-3.5 text-neonGreenDark/80" aria-hidden />
                        99.9% Surgical Precision
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 text-center leading-snug">One payment system. One top-up flow.</p>
                  </div>
                </>
              )}

              {checkoutStep === "divine" && checkoutTier === "all_access" && (
                <>
                  <div className="mb-3 rounded-xl border border-slate-200/80 bg-slate-800/40 px-3 py-2.5 text-left">
                    <p className="text-xs font-medium text-slate-600 mb-1.5">Included with Executive Pass</p>
                    <ul className="text-xs text-slate-700 space-y-1">
                      <li>Executive PDF, all themes, Cover Letter & Proposal Engine</li>
                      <li>Interview Prep, LinkedIn Surgeon, Match & Tailor</li>
                      <li className="text-neonGreenDark/90">~5,000 Surgical Units with your initial Executive Pass (early bird or standard).</li>
                      <li className="text-neonGreenDark/90">✨ FREE: 1-Click Professional Portfolio Website (Synced with your Resume).</li>
                    </ul>
                  </div>
                  <p className="text-sm text-slate-700 mb-2">Pay {(executivePassChosenPrice ?? livePricing?.price ?? 999).toLocaleString()} KES with M-Pesa or use a card. Secure payment via IntaSend.</p>
                  {((executivePassChosenPrice ?? livePricing?.price) === 999 && (livePricing?.slotsRemaining ?? 0) > 0) ? (
                    <div className="mb-3 space-y-2">
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center">
                        <span className="text-xs font-medium text-amber-400">Early bird: 999 KES (500 KES off 1,499). First 100 only.</span>
                      </div>
                      <div className="rounded-lg border border-surgicalTeal/40 bg-emerald-500/10 px-3 py-2 text-center">
                        <span className="text-xs font-medium text-neonGreenDark">Only {livePricing?.slotsRemaining ?? 0} slot{(livePricing?.slotsRemaining ?? 0) === 1 ? "" : "s"} left at 999 — then {(livePricing?.standardPrice ?? 1499).toLocaleString()} KES.</span>
                      </div>
                    </div>
                  ) : (executivePassChosenPrice ?? livePricing?.price) === 1499 ? (
                    <div className="mb-3 rounded-lg border border-slate-400 bg-slate-200/40 px-3 py-2 text-center">
                      <span className="text-xs font-medium text-slate-600">Standard Executive Pass — 1,499 KES. Same full access + ~5,000 SU.</span>
                    </div>
                  ) : null}
                  <div className="flex rounded-xl bg-slate-800/60 p-1 mb-4">
                    <button
                      type="button"
                      onClick={() => { setPaymentTab("mpesa"); setPaymentError(null); }}
                      className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${paymentTab === "mpesa" ? "bg-emerald-500/20 text-neonGreenDark" : "text-slate-600 hover:text-slate-800"}`}
                    >
                      Local M-Pesa
                    </button>
                    <button
                      type="button"
                      onClick={() => { setPaymentTab("card"); setPaymentError(null); }}
                      className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${paymentTab === "card" ? "bg-emerald-500/20 text-neonGreenDark" : "text-slate-600 hover:text-slate-800"}`}
                    >
                      International Card
                    </button>
                  </div>
                  {paymentTab === "mpesa" && (
                    <>
                      <div className="flex items-center justify-between mb-3 rounded-xl border border-surgicalTeal/30 bg-emerald-500/5 px-4 py-3">
                        <div>
                          <span className="text-lg font-bold text-neonGreenDark">M-Pesa</span>
                          {(executivePassChosenPrice ?? livePricing?.price) === 999 && (
                            <p className="text-[10px] text-amber-400/90 mt-0.5">500 KES off · First 100 only</p>
                          )}
                        </div>
                        <span className="font-semibold text-slate-50">{(executivePassChosenPrice ?? livePricing?.price ?? 999).toLocaleString()} KES</span>
                      </div>
                      <div className="relative mb-3">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">+254</span>
                        <input
                          type="tel"
                          placeholder="712 345 678"
                          value={mpesaPhone.startsWith("254") ? mpesaPhone.slice(3).replace(/\s/g, "") : mpesaPhone}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/\D/g, "");
                            if (!raw) { setMpesaPhone(""); return; }
                            if (raw.startsWith("254")) setMpesaPhone(raw.slice(0, 12));
                            else if (raw.startsWith("0")) setMpesaPhone("254" + raw.slice(1, 10));
                            else setMpesaPhone("254" + raw.slice(0, 9));
                          }}
                          className="w-full rounded-lg border border-slate-200 bg-white/90 pl-12 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                        />
                      </div>
                      {paymentError && <p className="text-xs text-rose-400 mb-2">{paymentError}</p>}
                      <button
                        type="button"
                        disabled={paymentLoading || !(mpesaPhone.length >= 12 && mpesaPhone.startsWith("254"))}
                        onClick={async () => {
                          setPaymentLoading(true);
                          setPaymentError(null);
                          setPaymentRedirectToBuilder(true);
                          try {
                            const res = await fetch("/api/checkout", {
                              method: "POST",
                              headers: { "Content-Type": "application/json", ...authHeaders },
                              body: JSON.stringify({
                                method: "MPESA",
                                phone: mpesaPhone.trim(),
                                email: email || undefined,
                                name: fullName || undefined,
                                amount: executivePassChosenPrice ?? livePricing?.price ?? 999,
                                product: "all_access",
                                executivePrice: executivePassChosenPrice ?? livePricing?.price ?? 999,
                                userId: subscriptionUser?.id ?? undefined,
                              }),
                            });
                            const data = await res.json();
                            if (!res.ok) throw new Error(data.error || "STK Push failed");
                            setPendingTxId(data.transactionId ?? data.invoice_id);
                            setCheckoutStep("pending");
                          } catch (e) {
                            setPaymentError(e instanceof Error ? e.message : "STK Push failed");
                            setPaymentRedirectToBuilder(false);
                          }
                          setPaymentLoading(false);
                        }}
                        className="btn-glimmer w-full rounded-xl border bg-emerald-500 text-black font-bold border border-emerald-500 px-4 py-3 text-sm font-medium text-neonGreenDark disabled:opacity-50"
                      >
                        {paymentLoading ? (
                          <span className="flex items-center gap-2">
                            <span className="surgical-pulse" aria-hidden />
                            Requesting PIN…
                          </span>
                        ) : (
                          `Pay ${(executivePassChosenPrice ?? livePricing?.price ?? 999).toLocaleString()} KES`
                        )}
                      </button>
                      {paymentLoading && (
                        <p className="mt-2 text-xs text-neonGreenDark/90 text-center">The Surgeon is requesting a PIN… check your phone.</p>
                      )}
                      <div className="mt-4 pt-4 border-t border-slate-200/80">
                        <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-2 text-center">Surgical Guarantee</p>
                        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 mb-2">
                          <span className="inline-flex items-center gap-1 text-[10px] text-slate-600">
                            <Shield className="h-3.5 w-3.5 text-neonGreenDark/80" aria-hidden />
                            ATS-Verified Structure
                          </span>
                          <span className="inline-flex items-center gap-1 text-[10px] text-slate-600">
                            <Check className="h-3.5 w-3.5 text-neonGreenDark/80" aria-hidden />
                            Recruiter-Approved Logic
                          </span>
                          <span className="inline-flex items-center gap-1 text-[10px] text-slate-600">
                            <Star className="h-3.5 w-3.5 text-neonGreenDark/80" aria-hidden />
                            99.9% Surgical Precision
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 text-center leading-snug">You get services more than worth the payment.</p>
                      </div>
                    </>
                  )}
                  {paymentTab === "card" && (
                    <>
                      <div className="flex items-center justify-between mb-3 rounded-xl border border-slate-400 bg-slate-200/40 px-4 py-3">
                        <div>
                          <span className="text-slate-800 font-medium">Card</span>
                          {(executivePassChosenPrice ?? livePricing?.price) === 999 && (
                            <p className="text-[10px] text-amber-400/90 mt-0.5">500 KES off · First 100 only</p>
                          )}
                        </div>
                        <span className="font-semibold text-slate-50">{(executivePassChosenPrice ?? livePricing?.price ?? 999).toLocaleString()} KES</span>
                      </div>
                      {paymentError && <p className="text-xs text-rose-400 mb-2">{paymentError}</p>}
                      <button
                        type="button"
                        disabled={paymentLoading}
                        onClick={async () => {
                          setPaymentLoading(true);
                          setPaymentError(null);
                          try {
                            const res = await fetch("/api/checkout", {
                              method: "POST",
                              headers: { "Content-Type": "application/json", ...authHeaders },
                              body: JSON.stringify({
                                method: "CARD",
                                email: email || undefined,
                                name: fullName || undefined,
                                amount: executivePassChosenPrice ?? livePricing?.price ?? 999,
                                product: "all_access",
                                executivePrice: executivePassChosenPrice ?? livePricing?.price ?? 999,
                                userId: subscriptionUser?.id ?? undefined,
                              }),
                            });
                            const data = await res.json();
                            if (!res.ok) throw new Error(data.error || "Checkout failed");
                            if (data.url) {
                              window.location.href = data.url;
                              return;
                            }
                            throw new Error("No payment URL");
                          } catch (e) {
                            setPaymentError(e instanceof Error ? e.message : "Checkout failed");
                            setPaymentLoading(false);
                          }
                        }}
                        className="w-full rounded-xl border bg-emerald-500 text-black font-bold border border-emerald-500 px-4 py-3 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50"
                      >
                        {paymentLoading ? "Redirecting…" : "Secure Card Checkout"}
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => { setShowPaywall(false); setCheckoutTier(null); setCheckoutStep("tier"); setExecutivePassChosenPrice(null); setPaymentError(null); }}
                    className="mt-3 text-xs text-slate-600 hover:text-slate-800"
                  >
                    ← Back
                  </button>
                </>
              )}

              {checkoutStep === "method" && checkoutTier === "all_access" && (
                <>
                  <p className="text-sm text-slate-700 mb-4">Pay with Card or M-Pesa. Secure payment via IntaSend.</p>
                  <div className="flex gap-3 mb-4">
                    <button
                      type="button"
                      disabled={paymentLoading}
                      onClick={async () => {
                        setPaymentMethod("card");
                        setPaymentLoading(true);
                        setPaymentError(null);
                        try {
                          const res = await fetch("/api/payment/initiate", {
                            method: "POST",
                            headers: { "Content-Type": "application/json", ...authHeaders },
                            body: JSON.stringify({
                              method: "card",
                              tier: "all_access",
                              email: email || undefined,
                              name: fullName || undefined,
                              userId: subscriptionUser?.id ?? undefined,
                            }),
                          });
                          const data = await res.json();
                          if (!res.ok) throw new Error(data.error || "Payment failed");
                          if (data.redirectUrl) {
                            window.location.href = data.redirectUrl;
                            return;
                          }
                          throw new Error("No redirect URL");
                        } catch (e) {
                          setPaymentError(e instanceof Error ? e.message : "Payment failed");
                          setPaymentLoading(false);
                        }
                      }}
                      className="flex-1 rounded-xl border border-slate-200 bg-white/90 px-4 py-3 text-sm font-medium text-slate-900 hover:border-surgicalTeal/50 disabled:opacity-60"
                    >
                      Pay with Card
                    </button>
                    <button
                      type="button"
                      onClick={() => { setPaymentMethod("mpesa"); setCheckoutStep("mpesa-phone"); setPaymentError(null); }}
                      className="flex-1 rounded-xl border border-slate-200 bg-white/90 px-4 py-3 text-sm font-medium text-slate-900 hover:border-surgicalTeal/50"
                    >
                      Pay with M-Pesa
                    </button>
                  </div>
                  <button type="button" onClick={() => { setCheckoutStep("tier"); setCheckoutTier(null); setExecutivePassChosenPrice(null); }} className="text-xs text-slate-600 hover:text-slate-800">
                    ← Back
                  </button>
                </>
              )}

              {checkoutStep === "mpesa-phone" && checkoutTier === "all_access" && (
                <>
                  <div className="flex items-center justify-between mb-3 rounded-xl border border-surgicalTeal/30 bg-emerald-500/5 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div>
                        <span className="text-lg font-bold text-neonGreenDark">M-Pesa</span>
                        <span className="text-xs text-slate-600 ml-1">via IntaSend</span>
                        {(executivePassChosenPrice ?? livePricing?.price) === 999 && (
                          <p className="text-[10px] text-amber-400/90 mt-0.5">500 KES off · First 100 only</p>
                        )}
                      </div>
                    </div>
                    <span className="font-semibold text-slate-50">{(executivePassChosenPrice ?? livePricing?.price ?? 999).toLocaleString()} KES</span>
                  </div>
                  <p className="text-sm text-slate-700 mb-3">Enter your M-Pesa number. You&apos;ll get a PIN prompt on your phone.</p>
                  <div className="relative mb-3">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">+254</span>
                    <input
                      type="tel"
                      placeholder="712 345 678"
                      value={mpesaPhone.startsWith("254") ? mpesaPhone.slice(3).replace(/\s/g, "") : mpesaPhone}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, "");
                        if (!raw) { setMpesaPhone(""); return; }
                        if (raw.startsWith("254")) setMpesaPhone(raw.slice(0, 12));
                        else if (raw.startsWith("0")) setMpesaPhone("254" + raw.slice(1, 10));
                        else setMpesaPhone("254" + raw.slice(0, 9));
                      }}
                      className="w-full rounded-lg border border-slate-200 bg-white/90 pl-12 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                    />
                  </div>
                  {paymentError && <p className="text-xs text-rose-400 mb-2">{paymentError}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={paymentLoading || !(mpesaPhone.length >= 12 && mpesaPhone.startsWith("254"))}
                      onClick={async () => {
                        setPaymentLoading(true);
                        setPaymentError(null);
                        setPaymentRedirectToBuilder(true);
                        try {
                          const res = await fetch("/api/checkout", {
                            method: "POST",
                            headers: { "Content-Type": "application/json", ...authHeaders },
                            body: JSON.stringify({
                              method: "MPESA",
                              phone: mpesaPhone.trim(),
                              email: email || undefined,
                              name: fullName || undefined,
                              amount: executivePassChosenPrice ?? livePricing?.price ?? 999,
                              product: "all_access",
                              executivePrice: executivePassChosenPrice ?? livePricing?.price ?? 999,
                              userId: subscriptionUser?.id ?? undefined,
                            }),
                          });
                          const data = await res.json();
                          if (!res.ok) throw new Error(data.error || "STK Push failed");
                          setPendingTxId(data.transactionId ?? data.invoice_id);
                          setCheckoutStep("pending");
                        } catch (e) {
                          setPaymentError(e instanceof Error ? e.message : "STK Push failed");
                          setPaymentRedirectToBuilder(false);
                        }
                        setPaymentLoading(false);
                      }}
                      className="btn-glimmer rounded-xl border bg-emerald-500 text-black font-bold border border-emerald-500 px-4 py-2 text-sm font-medium disabled:opacity-50"
                    >
                      {paymentLoading ? <span className="flex items-center gap-2"><span className="surgical-pulse" aria-hidden />Requesting PIN…</span> : "Pay Now"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setCheckoutStep("method"); setPaymentError(null); }}
                      className="text-sm text-slate-600 hover:text-slate-800"
                    >
                      Back
                    </button>
                  </div>
                  {paymentLoading && (
                    <p className="mt-2 text-xs text-neonGreenDark/90">Check your phone and enter your M-Pesa PIN.</p>
                  )}
                </>
              )}

              {checkoutStep === "mpesa-phone" && checkoutTier && checkoutTier !== "all_access" && (
                <div className="rounded-xl border border-slate-200 bg-slate-800/40 p-4 text-center">
                  <p className="text-sm text-slate-700 mb-3">To top up Surgical Units, use the unified Refill Balance.</p>
                  <button
                    type="button"
                    onClick={() => { setShowPaywall(false); setCheckoutTier(null); setCheckoutStep("tier"); setExecutivePassChosenPrice(null); setShowRefillModal(true); }}
                    className="rounded-lg bg-emerald-500/20 text-neonGreenDark px-4 py-2 text-sm font-medium hover:bg-emerald-500/30"
                  >
                    Open Refill Balance
                  </button>
                </div>
              )}

              {checkoutStep === "pending" && (
                <>
                  <p className="text-sm text-slate-700 mb-4">
                    The Surgeon is requesting a PIN… check your phone. We&apos;ll unlock your features as soon as payment is confirmed.
                  </p>
                  <div className="flex items-center gap-2 text-neonGreenDark mb-4">
                    <span className="surgical-pulse" aria-hidden />
                    <span className="text-xs font-medium">Waiting for payment…</span>
                  </div>
                  {checkoutTier === "all_access" && mpesaPhone && (
                    <button
                      type="button"
                      disabled={paymentLoading}
                      onClick={async () => {
                        setPaymentLoading(true);
                        setPaymentError(null);
                        try {
                          const res = await fetch("/api/checkout", {
                            method: "POST",
                            headers: { "Content-Type": "application/json", ...authHeaders },
                            body: JSON.stringify({
                              method: "MPESA",
                              phone: mpesaPhone.trim(),
                              email: email || undefined,
                              name: fullName || undefined,
                              amount: executivePassChosenPrice ?? livePricing?.price ?? 999,
                              product: "all_access",
                              executivePrice: executivePassChosenPrice ?? livePricing?.price ?? 999,
                              userId: subscriptionUser?.id ?? undefined,
                            }),
                          });
                          const data = await res.json();
                          if (!res.ok) throw new Error(data.error || "STK Push failed");
                          setPendingTxId(data.transactionId ?? data.invoice_id);
                        } catch (e) {
                          setPaymentError(e instanceof Error ? e.message : "Retry failed");
                        }
                        setPaymentLoading(false);
                      }}
                      className="rounded-lg border border-amber-400/60 bg-amber-50/50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100/80 disabled:opacity-50"
                    >
                      {paymentLoading ? "Requesting…" : "Retry M-Pesa (same number)"}
                    </button>
                  )}
                </>
              )}

              <div className="flex items-center justify-between gap-4 pt-2 border-t border-slate-200">
                <button type="button" onClick={() => { setShowPaywall(false); setCheckoutStep("tier"); setCheckoutTier(null); setExecutivePassChosenPrice(null); setPaymentMethod(null); setPaymentError(null); setPendingTxId(null); setPaymentRedirectToBuilder(false); }} className="text-xs text-slate-600 hover:text-slate-800">
                  Maybe later
                </button>
                {hasFullAccess && (
                  <button
                    type="button"
                    onClick={() => { setShowPaywall(false); handleDownloadPdf(); }}
                    className="inline-flex items-center gap-2 rounded-full border border-surgicalTeal/80 bg-emerald-500/10 px-4 py-1.5 text-xs font-medium text-neonGreenDark hover:bg-emerald-600"
                  >
                    Download Resume PDF
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showDivineSuccess && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-emerald-500/20 animate-pulse" aria-hidden />
            <motion.div
              className="relative rounded-2xl border border-emerald-400/60 bg-white/95 backdrop-blur-xl px-8 py-6 text-center shadow-xl shadow-slate-200/50"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", damping: 20 }}
            >
              <p className="font-display text-xl font-semibold text-neonGreenDark">Surgery complete</p>
              <p className="mt-1 text-sm text-slate-700">Redirecting to Builder…</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showSuccessToast && (
          <motion.div
            className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-full border border-emerald-400/70 bg-white/95 backdrop-blur-xl px-4 py-2 text-xs text-slate-900 shadow-lg"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
          >
            Surgical Success: Resume optimized for this role.
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showRefillModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4"
            onClick={() => { setShowRefillModal(false); setRefillError(null); setRefillPendingTxId(null); }}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: "spring", damping: 26, stiffness: 300 }}
              className="relative rounded-2xl overflow-hidden border border-brandGreen/25 bg-white shadow-[0_0_0_1px_rgba(16,185,129,0.08),0_24px_80px_-12px_rgba(15,23,42,0.4),0_0_60px_-20px_rgba(212,168,83,0.08)] max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Premium header strip — green + York yellow blend */}
              <div className="relative h-24 bg-gradient-to-br from-brandGreen/15 via-yorkYellow/10 to-transparent border-b border-brandGreen/20">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(16,185,129,0.12),transparent_70%)]" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_80%_20%,rgba(212,168,83,0.08),transparent)]" />
                <div className="relative flex flex-col items-center justify-center h-full pt-2">
                  <div className="rounded-2xl w-14 h-14 flex items-center justify-center bg-white/95 shadow-lg border border-brandGreen/30 ring-4 ring-brandGreen/10">
                    <Coins className="h-7 w-7 text-brandGreen" />
                  </div>
                  <h3 className="font-display text-xl font-bold text-slate-900 mt-3 tracking-tight">Refill Surgical Units</h3>
                  <p className="text-xs text-slate-600 mt-0.5">Power your resume surgery with more credits</p>
                </div>
              </div>
              <div className="p-6 pt-5">
              <div className="mb-4">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Amount (KSH)</label>
                <div className="relative flex items-center gap-2">
                  <span className="absolute left-4 text-slate-500 text-sm font-medium">KSH</span>
                  <input
                    type="number"
                    min={100}
                    max={500000}
                    step={50}
                    placeholder="500"
                    value={refillKshInput}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "");
                      setRefillKshInput(v.slice(0, 8));
                      setRefillError(null);
                    }}
                    className="w-full rounded-xl border-2 border-slate-200 bg-slate-50/80 pl-14 pr-4 py-3.5 text-base font-semibold text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                  />
                  {getTierBadge(Number(refillKshInput) || 0) && (
                    <span className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
                      getTierBadge(Number(refillKshInput) || 0) === "Best Value"
                        ? "bg-emerald-500/25 text-neonGreenDark border border-emerald-500/40"
                        : getTierBadge(Number(refillKshInput) || 0) === "30% Bonus"
                          ? "bg-amber-500/25 text-amber-800 border border-amber-500/40"
                          : "bg-slate-200/80 text-slate-700 border border-slate-300/60"
                    }`}>
                      {getTierBadge(Number(refillKshInput) || 0)}
                    </span>
                  )}
                </div>
                <p className="mt-2.5 flex items-center gap-1.5 text-base font-bold text-neonGreenDark">
                  {refillKshInput ? (
                    <><span className="text-slate-500 font-medium text-sm">≈</span> {computeSuFromKsh(Number(refillKshInput) || 0).toLocaleString()} Surgical Units</>
                  ) : (
                    <span className="text-slate-400 font-medium text-sm">Enter amount to see units</span>
                  )}
                </p>
              </div>
              <div className="flex gap-2 mb-4">
                {[200, 500, 1000].map((ksh) => {
                  const su = computeSuFromKsh(ksh);
                  const isSelected = refillKshInput === String(ksh);
                  return (
                    <button
                      key={ksh}
                      type="button"
                      onClick={() => { setRefillKshInput(String(ksh)); setRefillError(null); }}
                      className={`flex-1 rounded-xl border-2 py-2.5 px-2 text-sm font-semibold transition-all ${
                        isSelected
                          ? "border-brandGreen bg-brandGreen/15 text-brandGreen shadow-[0_0_12px_rgba(16,185,129,0.2)]"
                          : "border-slate-200 bg-white text-slate-700 hover:border-yorkYellow/50 hover:bg-yorkYellow/5"
                      }`}
                    >
                      <span className="block">KSH {ksh.toLocaleString()}</span>
                      <span className="block text-[10px] font-medium text-slate-500 mt-0.5">{su.toLocaleString()} SU</span>
                    </button>
                  );
                })}
              </div>
              <div className="rounded-xl border border-brandGreen/20 bg-gradient-to-br from-brandGreen/5 via-yorkYellow/5 to-slate-50/80 px-4 py-3.5 mb-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em] mb-2">What this buys you</p>
                {refillKshInput && (Number(refillKshInput) || 0) >= 100 ? (
                  <>
                    <p className="text-sm font-semibold text-slate-800 mb-2">
                      {computeSuFromKsh(Number(refillKshInput) || 0).toLocaleString()} units unlock:
                    </p>
                    <ul className="text-xs text-slate-600 space-y-1 mb-2">
                      {EXAMPLE_FEATURES.map(({ label, cost }) => {
                        const n = Math.floor(computeSuFromKsh(Number(refillKshInput) || 0) / cost);
                        return n > 0 ? <li key={label} className="flex items-center gap-2"><span className="text-neonGreen font-semibold">≈{n}×</span> {label}</li> : null;
                      })}
                    </ul>
                    <button
                      type="button"
                      onClick={() => setShowFeatureCostsModal(true)}
                      className="text-xs font-semibold text-neonGreenDark hover:text-neonGreen transition-colors"
                    >
                      See all features & costs →
                    </button>
                  </>
                ) : (
                  <p className="text-sm text-slate-600">
                    Enter an amount to see what you can do.{" "}
                    <button type="button" onClick={() => setShowFeatureCostsModal(true)} className="font-semibold text-neonGreenDark hover:text-neonGreen transition-colors">See all features & costs</button>
                  </p>
                )}
              </div>
              {!refillPendingTxId ? (
                <>
                  <div className="relative mb-3">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">M-Pesa phone</label>
                    <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-medium">+254</span>
                    <input
                      type="tel"
                      placeholder="712 345 678"
                      value={refillMpesaPhone.startsWith("254") ? refillMpesaPhone.slice(3).replace(/\s/g, "") : refillMpesaPhone}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, "");
                        if (!raw) { setRefillMpesaPhone(""); return; }
                        if (raw.startsWith("254")) setRefillMpesaPhone(raw.slice(0, 12));
                        else if (raw.startsWith("0")) setRefillMpesaPhone("254" + raw.slice(1, 10));
                        else setRefillMpesaPhone("254" + raw.slice(0, 9));
                      }}
                      className="w-full rounded-xl border-2 border-slate-200 bg-slate-50/80 pl-14 pr-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                    />
                    </div>
                  </div>
                  {refillError && <p className="text-xs text-rose-500 font-medium mb-2">{refillError}</p>}
                  <button
                    type="button"
                    disabled={refillPaymentLoading || (Number(refillKshInput) || 0) < 100 || !(refillMpesaPhone.length >= 12 && refillMpesaPhone.startsWith("254"))}
                    onClick={async () => {
                      const ksh = Math.round(Number(refillKshInput) || 0);
                      if (ksh < 100) return;
                      setRefillPaymentLoading(true);
                      setRefillError(null);
                      try {
                        const res = await fetch("/api/checkout", {
                          method: "POST",
                          headers: { "Content-Type": "application/json", ...authHeaders },
                          body: JSON.stringify({
                            method: "MPESA",
                            phone: refillMpesaPhone.trim(),
                            email: email || undefined,
                            name: fullName || undefined,
                            amount: ksh,
                            product: "surgical_refill",
                            userId: subscriptionUser?.id ?? undefined,
                          }),
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error || "STK Push failed");
                        setRefillPendingTxId(data.transactionId ?? data.invoice_id ?? null);
                      } catch (e) {
                        setRefillError(e instanceof Error ? e.message : "Payment failed");
                      } finally {
                        setRefillPaymentLoading(false);
                      }
                    }}
                    className="btn-glimmer w-full rounded-xl border-2 border-emerald-500 px-5 py-4 text-base font-bold text-black shadow-[0_4px_12px_rgba(0,255,136,0.25)] hover:shadow-[0_6px_20px_rgba(0,255,136,0.35)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {refillPaymentLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="surgical-pulse" aria-hidden />
                        Requesting PIN…
                      </span>
                    ) : (
                      `Pay ${(Number(refillKshInput) || 0).toLocaleString()} KSH`
                    )}
                  </button>
                </>
              ) : (
                <div className="rounded-xl border-2 border-emerald-500/30 bg-emerald-500/10 px-4 py-4 text-center">
                  <p className="text-sm font-bold text-neonGreenDark">Confirm on your phone</p>
                  <p className="text-sm text-slate-600 mt-1">Enter your M-Pesa PIN to complete the refill.</p>
                </div>
              )}
              <button
                type="button"
                onClick={() => { setShowRefillModal(false); setRefillError(null); setRefillPendingTxId(null); }}
                className="mt-4 w-full py-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 text-sm font-medium transition-colors"
              >
                {refillPendingTxId ? "Close" : "Maybe later"}
              </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showFeatureCostsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
            onClick={() => setShowFeatureCostsModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="rounded-2xl border border-slate-200 bg-white/95 backdrop-blur-xl shadow-2xl shadow-slate-200/50 max-w-md w-full max-h-[85vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-slate-200/80 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">Features & units</h3>
                <button type="button" onClick={() => setShowFeatureCostsModal(false)} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-800">×</button>
              </div>
              <div className="p-4 overflow-y-auto flex-1">
                <p className="text-xs text-slate-600 mb-2">Each action uses the units below. Your balance is used when you run a feature.</p>
                {isBetaTester && (
                  <p className="text-[11px] text-neonGreen/90 mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5">You&apos;re a beta tester: all features, themes, and downloads are free. No paywall.</p>
                )}
                <p className="text-[11px] text-slate-500 mb-2">Free: building and editing your resume (preview on the right). Download PDF, extra themes, and AI features use Surgical Units or Executive Pass.</p>
                <p className="text-[11px] text-neonGreenDark/90 mb-4 rounded-lg border border-surgicalTeal/20 bg-emerald-500/5 px-2.5 py-1.5">Content from Resume Surgeon is tuned to read like a human wrote it and to perform well on AI detection checks. Turn on &quot;Humanize&quot; in the header for an extra pass when you want maximum stealth.</p>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200/80">
                      <th className="pb-2 pr-2 font-medium text-slate-600">Feature</th>
                      <th className="pb-2 text-right font-medium text-slate-600 w-14">Units</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-700">
                    {FEATURE_ROWS.map(({ label, description, cost }) => (
                      <tr key={label} className="border-b border-slate-200/80 align-top">
                        <td className="py-2.5 pr-2">
                          <span className="font-medium text-slate-800">{label}</span>
                          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{description}</p>
                        </td>
                        <td className="py-2.5 text-right font-medium text-neonGreenDark whitespace-nowrap">{cost}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(isBetaTester || aiCredits > 0) && (
                  <div className="mt-4 pt-4 border-t border-slate-200/80">
                    <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-2">
                      {isBetaTester ? "Beta tester – unlimited units" : `With your current balance (${aiCredits.toLocaleString()} units) you could run`}
                    </p>
                    {!isBetaTester && (
                      <ul className="text-xs text-slate-600 space-y-1">
                        {FEATURE_ROWS.map(({ label, cost }) => {
                          const n = Math.floor(aiCredits / cost);
                          return n > 0 ? <li key={label}>{n}× {label}</li> : null;
                        })}
                      </ul>
                    )}
                    {isBetaTester && <p className="text-xs text-slate-600">All features available.</p>}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSuppliesRestockedToast && (
          <motion.div
            className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-emerald-500/60 bg-white/95 backdrop-blur-xl px-5 py-2.5 text-sm text-neonGreenDark shadow-lg flex items-center gap-2"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
          >
            <Coins className="h-4 w-4" />
            Supplies Restocked
          </motion.div>
        )}
        {showSurgeryRechargedToast && (
          <motion.div
            className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-emerald-500/60 bg-white/95 backdrop-blur-xl px-5 py-2.5 text-sm text-neonGreenDark shadow-lg flex items-center gap-2"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
          >
            <Coins className="h-4 w-4" />
            Surgery Recharged!
          </motion.div>
        )}
      </AnimatePresence>
      <PaymentSuccess
        open={showPaymentSuccessModal}
        onClose={() => setShowPaymentSuccessModal(false)}
        creditBalance={paymentSuccessBalance ?? (showPaymentSuccessModal ? aiCredits : undefined)}
      />
    </div>
  );
}

export default function Page() {
  return <OperatingTable />;
}

