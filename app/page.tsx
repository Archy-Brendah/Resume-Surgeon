"use client";

import { Activity, Briefcase, Check, Coins, Copy, Eye, FileText, Linkedin, Link2, ListTodo, Lock, Mail, MessageCircle, Moon, Plus, Scissors, Shield, Star, Trash2, Compare } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useReactToPrint } from "react-to-print";
import confetti from "canvas-confetti";
import { useSubscription } from "@/hooks/useSubscription";
import { getCost } from "@/lib/su-costs";
import { REFILL_TIERS } from "@/lib/refill";

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
type ProposalStrategyTone = "conservative" | "bold";
type ProposalLineItem = { id: string; description: string; amount: string; optional?: boolean };

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
  nextSteps?: string;
  projectKickoffChecklist?: string[];
};

type TimelinePhase = { phase: string; timeframe: string; deliverables: string };

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

function OperatingTable() {
  const [compare, setCompare] = useState(false);
  const [fullName, setFullName] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [email, setEmail] = useState("");
  const [experience, setExperience] = useState("");
  const [skills, setSkills] = useState("");
  const [sharpened, setSharpened] = useState("");
  const [provider, setProvider] = useState<"gemini" | "groq" | null>(null);
  const [status, setStatus] = useState<SharpenState>("idle");
  const [scanKey, setScanKey] = useState(0);
  const [showPaywall, setShowPaywall] = useState(false);
  const { user: subscriptionUser, session, isPaid: subscriptionPaid, canAccessExecutivePdf, canAccessFirmProposal, refetchProfile, aiCredits } = useSubscription();
  const [showRefillModal, setShowRefillModal] = useState(false);
  const [showSuppliesRestockedToast, setShowSuppliesRestockedToast] = useState(false);
  const authHeaders = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};

  useEffect(() => {
    if (!showSuppliesRestockedToast) return;
    const t = setTimeout(() => setShowSuppliesRestockedToast(false), 3000);
    return () => clearTimeout(t);
  }, [showSuppliesRestockedToast]);
  const [isPaid, setIsPaid] = useState(false);
  const [purchaseTier, setPurchaseTier] = useState<PurchaseTier>(null);
  const effectivePaid = subscriptionPaid || isPaid;
  const [checkoutTier, setCheckoutTier] = useState<PurchaseTier | null>(null);
  const [checkoutStep, setCheckoutStep] = useState<"tier" | "method" | "mpesa-phone" | "pending" | "divine">("tier");
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("openCheckout") === "1") {
      setShowPaywall(true);
      setCheckoutTier("all_access");
      window.history.replaceState({}, "", window.location.pathname + window.location.hash);
    }
    if (params.get("refill") === "credits") {
      setShowPaywall(true);
      setCheckoutTier("credits");
      setCheckoutStep("method");
      window.history.replaceState({}, "", window.location.pathname + window.location.hash);
    }
    if (params.get("refill") === "1") {
      setShowRefillModal(true);
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

  const [dashboardTab, setDashboardTab] = useState<"resume" | "cover-letter" | "proposals" | "linkedin" | "followup" | "tracker" | "interview">("resume");
  const [humanizeAI, setHumanizeAI] = useState(false);
  const [coverLetterTone, setCoverLetterTone] = useState<CoverLetterTone>("professional");
  const [coverLetter, setCoverLetter] = useState("");
  const [coverLetterLoading, setCoverLetterLoading] = useState(false);
  const [syncToast, setSyncToast] = useState(false);

  const [proposalClientName, setProposalClientName] = useState("");
  const [proposalScope, setProposalScope] = useState("");
  const [proposalPainPoints, setProposalPainPoints] = useState("");
  const [proposalPricing, setProposalPricing] = useState("");
  const [proposalCaseStudies, setProposalCaseStudies] = useState("");
  const [proposalTrack, setProposalTrack] = useState<ProposalTrack>("freelancer");
  const [proposalCompanyName, setProposalCompanyName] = useState("");
  const [proposalTeamSize, setProposalTeamSize] = useState("");
  const [proposalMethodology, setProposalMethodology] = useState("");
  const [proposalFirmIdentity, setProposalFirmIdentity] = useState("");
  const [proposalMission, setProposalMission] = useState("");
  const [proposalSuccessMetrics, setProposalSuccessMetrics] = useState("");
  const [proposalLineItems, setProposalLineItems] = useState<ProposalLineItem[]>([
    { id: "1", description: "", amount: "", optional: false },
  ]);
  const [proposalLogo, setProposalLogo] = useState<string | null>(null);
  const [proposalBrandColor, setProposalBrandColor] = useState<string>("#14b8a6");
  const [proposalStrategyTone, setProposalStrategyTone] = useState<ProposalStrategyTone>("conservative");
  const [proposalContent, setProposalContent] = useState<ProposalContentData | null>(null);
  const [proposalLoading, setProposalLoading] = useState(false);
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
              standardPrice: Number(data.standardPrice) ?? 2500,
            });
          } else {
            setLivePricing({ price: 999, isEarlyBird: true, slotsRemaining: 100, standardPrice: 2500 });
          }
        })
        .catch(() => setLivePricing({ price: 999, isEarlyBird: true, slotsRemaining: 100, standardPrice: 2500 }));
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
  const [lowLightMode, setLowLightMode] = useState(false);
  const [showSuccessPulse, setShowSuccessPulse] = useState(false);
  const prevScoreRef = useRef(0);

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

      if (res.status === 402 && data?.code === "CREDITS_REQUIRED") {
        setShowRefillModal(true);
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
    } catch (err) {
      clearInterval(stepInterval);
      setSurgicalStep(0);
      console.error(err);
      setStatus("error");
    }
  }, [experience, jobDescription]);

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
          setIsPaid(true);
          setPurchaseTier(data.tier);
          setShowPaywall(false);
          setCheckoutTier(null);
          setCheckoutStep("tier");
          setPaymentMethod(null);
          setPendingTxId(null);
          setPaymentError(null);
          setPaymentRedirectToBuilder(false);
          if (typeof window !== "undefined" && window.history.replaceState) {
            const u = new URL(window.location.href);
            u.searchParams.delete("payment_ref");
            window.history.replaceState({}, "", u.pathname + u.search);
          }
          refetchProfile();
          if (isRefill) {
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

  const handleDownloadPdf = useCallback(() => {
    setShowPaywall(true);
  }, []);

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
      if (res.status === 402 && data?.code === "CREDITS_REQUIRED") {
        setShowRefillModal(true);
        setRecruiterFetched(true);
        return;
      }
      if (!res.ok) throw new Error("Recruiter eye failed");
      setRecruiterImpression(data.sixSecondImpression ?? null);
      setRecruiterVibeSummary(data.vibeSummary ?? null);
      setRecruiterQuestions(Array.isArray(data.hardQuestions) ? data.hardQuestions : []);
      setRecruiterFetched(true);
    } catch (err) {
      console.error(err);
      setRecruiterImpression("Simulation unavailable. Try again.");
      setRecruiterQuestions([]);
      setRecruiterFetched(true);
    } finally {
      setRecruiterLoading(false);
    }
  }, [fullName, targetRole, experience, sharpened, skills, authHeaders]);

  const handlePrint = useReactToPrint({
    content: () => previewRef.current,
    documentTitle: fullName ? `${fullName} – Executive Resume` : "Executive Resume",
    pageStyle: `
      @page { size: A4; margin: 0; }
      body { margin: 0; }
    `,
  });

  const handlePrintCoverLetter = useReactToPrint({
    content: () => coverRef.current,
    documentTitle: fullName ? `${fullName} – Cover Letter` : "Cover Letter",
    pageStyle: `
      @page { size: A4; margin: 0; }
      body { margin: 0; }
    `,
  });

  const handleGenerateCoverLetter = useCallback(async () => {
    setCoverLetterLoading(true);
    try {
      const res = await fetch("/api/cover-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          sharpenedResume: sharpened || experience,
          jobDescription: jobDescription || undefined,
          tone: coverLetterTone,
          fullName: fullName || undefined,
          targetRole: targetRole || undefined,
          skills: skills || undefined,
          humanize: humanizeAI,
        }),
      });
      const data = (await res.json()) as { coverLetter?: string; code?: string };
      if (res.status === 402 && data?.code === "CREDITS_REQUIRED") {
        setShowRefillModal(true);
        return;
      }
      if (!res.ok) throw new Error("Cover letter failed");
      setCoverLetter(data.coverLetter?.trim() ?? "");
    } catch (err) {
      console.error(err);
      setCoverLetter("Unable to generate. Try again.");
    } finally {
      setCoverLetterLoading(false);
    }
  }, [sharpened, experience, jobDescription, coverLetterTone, fullName, targetRole, skills, authHeaders]);

  const handleSyncWithResume = useCallback(() => {
    setSyncToast(true);
    const t = setTimeout(() => setSyncToast(false), 2000);
    return () => clearTimeout(t);
  }, []);

  const handleImportCaseStudies = useCallback(() => {
    setProposalCaseStudies(sharpened || experience || "");
  }, [sharpened, experience]);

  const handleGenerateProposal = useCallback(async () => {
    const useFirm = proposalTrack === "firm" && canUseFirmProposal;
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
          pricing: proposalPricing || undefined,
          skills: skills || undefined,
          caseStudies: proposalCaseStudies || sharpened || experience || undefined,
          fullName: fullName || undefined,
          companyName: useFirm ? proposalCompanyName || undefined : undefined,
          teamSize: useFirm ? proposalTeamSize || undefined : undefined,
          methodology: useFirm ? proposalMethodology || undefined : undefined,
          firmIdentity: useFirm ? proposalFirmIdentity || undefined : undefined,
          mission: useFirm ? proposalMission || undefined : undefined,
          successMetrics: useFirm ? proposalSuccessMetrics || undefined : undefined,
          strategyTone: useFirm ? proposalStrategyTone : undefined,
          humanize: humanizeAI,
        }),
      });
      const data = (await res.json()) as ProposalContentData & {
        code?: string;
        riskMitigations?: { risk: string; response: string }[];
        projectKickoffChecklist?: string[];
      };
      if (res.status === 402 && data?.code === "CREDITS_REQUIRED") {
        setShowRefillModal(true);
        return;
      }
      if (!res.ok) throw new Error("Proposal failed");
      setProposalContent({
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
      });
    } catch (err) {
      console.error(err);
      setProposalContent({
        executiveSummary: "Unable to generate. Try again.",
        strategicDiagnosis: "",
        proprietaryProcess: "",
        timelineDeliverables: "",
        investment: "",
      });
    } finally {
      setProposalLoading(false);
    }
  }, [proposalTrack, canUseFirmProposal, proposalClientName, proposalScope, proposalPainPoints, proposalPricing, proposalCaseStudies, sharpened, experience, skills, fullName, proposalCompanyName, proposalTeamSize, proposalMethodology, proposalStrategyTone, proposalFirmIdentity, proposalMission, proposalSuccessMetrics]);

  const handlePrintProposal = useReactToPrint({
    content: () => proposalRef.current,
    documentTitle: proposalTrack === "firm" && proposalCompanyName
      ? `${proposalCompanyName} – Proposal for ${proposalClientName || "Client"}`
      : fullName ? `${fullName} – Proposal for ${proposalClientName || "Client"}` : "Executive Proposal",
    pageStyle: `
      @page { size: A4; margin: 0.75in; }
      body { margin: 0; }
      .proposal-page-number::after { content: counter(page) " of " counter(pages); }
    `,
  });

  const handleGenerateLinkedIn = useCallback(async () => {
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
      const data = (await res.json()) as { headlines: string[]; about: string; topSkills: string[]; featuredProjects: string[]; code?: string };
      if (res.status === 402 && data?.code === "CREDITS_REQUIRED") {
        setShowRefillModal(true);
        return;
      }
      if (!res.ok) throw new Error("LinkedIn generation failed");
      setLinkedinContent({
        headlines: data.headlines || [],
        about: data.about || "",
        topSkills: data.topSkills || [],
        featuredStrategy: (data.featuredProjects?.length ? "Pin 2–3 of the Featured Projects below to your LinkedIn Featured section for maximum impact." : "Pin key project links or articles that demonstrate your expertise."),
        featuredProjects: data.featuredProjects || [],
      });
      setLinkedinSelectedHeadline(0);
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
  }, [fullName, targetRole, linkedinCurrentRole, linkedinCareerGoals, experience, skills, sharpened, jobDescription]);

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

  const canDownloadResume = (canAccessExecutivePdf || (isPaid && (purchaseTier === "single" || purchaseTier === "career" || purchaseTier === "closer" || purchaseTier === "business" || purchaseTier === null)));
  const canDownloadCoverLetter = (canAccessExecutivePdf || isPaid) && (purchaseTier === "career" || purchaseTier === "closer" || purchaseTier === "business");
  const canDownloadProposal = (canAccessExecutivePdf || isPaid) && (purchaseTier === "closer" || purchaseTier === "business");
  const canUseFirmProposal = canAccessFirmProposal || (isPaid && purchaseTier === "business");
  const canUseLinkedInExport = (canAccessExecutivePdf || isPaid) && (purchaseTier === "career" || purchaseTier === "closer" || purchaseTier === "business");
  const proposalAccentColor = proposalTrack === "firm" ? (proposalBrandColor || "#14b8a6") : "#14b8a6";
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

  return (
    <div
      className={`min-h-screen flex flex-col bg-slate-950 text-slate-50 transition-colors duration-300 ${
        isFirmLuxury ? "theme-firm-luxury" : ""
      } ${lowLightMode ? "low-light" : ""}`}
    >
      <header className="glass-panel border-b border-white/10 sticky top-0 z-30">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center justify-center rounded-xl bg-slate-900 border border-surgicalTeal/40 px-2 py-1">
              <Scissors className="h-5 w-5 text-surgicalTeal" />
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-display text-xl tracking-tight text-slate-50">
                  Resume Surgeon
                </span>
                <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] uppercase tracking-[0.18em] text-surgicalTeal border border-slate-800/80">
                  Precision AI Clinic
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Modern Medical / Precision theme · Deep Slate &amp; Surgical Teal
              </p>
              <div className="mt-2 rounded-premium border border-slate-700/60 bg-slate-800/40 px-3 py-2 shadow-card">
                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">Surgical Guarantee</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-slate-400">
                  <span className="inline-flex items-center gap-1"><Shield className="h-3 w-3 text-surgicalTeal/80 shrink-0" aria-hidden />ATS</span>
                  <span className="inline-flex items-center gap-1"><Check className="h-3 w-3 text-surgicalTeal/80 shrink-0" aria-hidden />Recruiter</span>
                  <span className="inline-flex items-center gap-1"><Star className="h-3 w-3 text-surgicalTeal/80 shrink-0" aria-hidden />99.9%</span>
                </div>
                <p className="text-[9px] text-slate-500 mt-0.5 leading-tight">Services more than worth the payment.</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 border-r border-slate-800 pr-3">
              <motion.button
                type="button"
                onClick={() => setDashboardTab("resume")}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`nav-pill ${dashboardTab === "resume" ? "nav-pill-active" : "nav-pill-inactive"}`}
              >
                Resume
              </motion.button>
              <motion.button
                type="button"
                onClick={() => setDashboardTab("cover-letter")}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`flex items-center gap-1.5 nav-pill ${dashboardTab === "cover-letter" ? "nav-pill-active" : "nav-pill-inactive"}`}
              >
                <FileText className="h-3.5 w-3.5" />
                Cover Letter
              </motion.button>
              <motion.button
                type="button"
                onClick={() => setDashboardTab("proposals")}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`flex items-center gap-1.5 nav-pill ${dashboardTab === "proposals" ? "nav-pill-active" : "nav-pill-inactive"}`}
              >
                <Briefcase className="h-3.5 w-3.5" />
                Proposals
              </motion.button>
              <motion.button
                type="button"
                onClick={() => setDashboardTab("linkedin")}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`flex items-center gap-1.5 nav-pill ${dashboardTab === "linkedin" ? "nav-pill-active" : "nav-pill-inactive"}`}
              >
                <Linkedin className="h-3.5 w-3.5" />
                LinkedIn
              </motion.button>
              <motion.button
                type="button"
                onClick={() => setDashboardTab("followup")}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`flex items-center gap-1.5 nav-pill ${dashboardTab === "followup" ? "nav-pill-active" : "nav-pill-inactive"}`}
              >
                <Mail className="h-3.5 w-3.5" />
                Follow-Up
              </motion.button>
              <motion.button
                type="button"
                onClick={() => setDashboardTab("tracker")}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`flex items-center gap-1.5 nav-pill ${dashboardTab === "tracker" ? "nav-pill-active" : "nav-pill-inactive"}`}
              >
                <ListTodo className="h-3.5 w-3.5" />
                Tracker
              </motion.button>
              <motion.button
                type="button"
                onClick={() => setDashboardTab("interview")}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`flex items-center gap-1.5 nav-pill ${dashboardTab === "interview" ? "nav-pill-active" : "nav-pill-inactive"}`}
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Interview
              </motion.button>
            </div>
            <motion.button
              type="button"
              onClick={() => setLowLightMode((v) => !v)}
              whileTap={{ scale: 0.95 }}
              className={`rounded-lg p-1.5 text-xs font-medium transition-colors ${
                lowLightMode ? "bg-amber-500/20 text-amber-400" : "text-slate-400 hover:text-slate-200"
              }`}
              title={lowLightMode ? "Low light on" : "Low light off — reduce eye strain"}
            >
              <Moon className="h-4 w-4" />
            </motion.button>
            <label className="flex items-center gap-2 cursor-pointer" title="Humanize AI output: vary sentence length and add burstiness so text is less likely to be flagged by AI content detectors">
              <span className="text-xs text-slate-400 whitespace-nowrap">Humanize</span>
              <button
                type="button"
                role="switch"
                aria-checked={humanizeAI}
                onClick={() => setHumanizeAI((v) => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors ${
                  humanizeAI ? "border-surgicalTeal/60 bg-surgicalTeal/20" : "border-slate-600 bg-slate-800"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-3.5 rounded-full bg-slate-200 shadow-sm transition-transform mt-0.5 ml-0.5 ${
                    humanizeAI ? "translate-x-4 bg-surgicalTeal" : "translate-x-0"
                  }`}
                />
              </button>
            </label>
            <div className="flex items-center gap-2">
              {session && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-xs text-slate-300" title="Surgical Units remaining">
                  <Coins className="h-3.5 w-3.5 text-surgicalTeal" />
                  <span className="hidden sm:inline text-slate-400">Surgical Units:</span>
                  <span className="font-medium text-slate-100">{aiCredits}</span>
                </span>
              )}
              {dashboardTab === "resume" && (
                <button
                  type="button"
                  onClick={() => setCompare((c) => !c)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    compare
                      ? "border-surgicalTeal/80 bg-surgicalTeal/10 text-surgicalTeal"
                      : "border-slate-700 bg-slate-900 text-slate-200 hover:border-surgicalTeal/60"
                  }`}
                >
                  <Compare className="h-4 w-4" />
                  <span>Compare</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={!canDownloadResume}
                className={`hidden sm:inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
                  canDownloadResume
                    ? "btn-glimmer border-surgicalTeal/70 bg-slate-900 text-slate-200 hover:border-surgicalTeal/80"
                    : "border-slate-800 bg-slate-900/60 text-slate-500 cursor-not-allowed"
                }`}
              >
                <span>Download Resume PDF</span>
              </button>
              {canDownloadCoverLetter && (
                <button
                  type="button"
                  onClick={() => handlePrintCoverLetter?.()}
                  className="btn-glimmer hidden sm:inline-flex items-center gap-2 rounded-full border border-surgicalTeal/70 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-surgicalTeal/80"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Download Cover Letter PDF</span>
                </button>
              )}
              {canDownloadProposal && (
                <button
                  type="button"
                  onClick={() => handlePrintProposal?.()}
                  className="btn-glimmer hidden sm:inline-flex items-center gap-2 rounded-full border border-surgicalTeal/70 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-surgicalTeal/80"
                >
                  <Briefcase className="h-3.5 w-3.5" />
                  <span>Download Proposal PDF</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
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
          {dashboardTab === "cover-letter" ? (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-start">
              <section className="resume-surface glass-card rounded-2xl border border-white/10 p-6 lg:p-7 space-y-6">
                <header>
                  <h2 className="font-display text-lg text-slate-50">Cover Letter Surgeon</h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Generate a matching cover letter from your resume and job description.
                  </p>
                </header>
                <div className="space-y-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Tone</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(["confident", "professional", "creative", "humble"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setCoverLetterTone(t)}
                        className={`rounded-lg border px-3 py-2 text-xs font-medium capitalize ${
                          coverLetterTone === t
                            ? "border-surgicalTeal/70 bg-surgicalTeal/10 text-surgicalTeal"
                            : "border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-600"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleSyncWithResume}
                    className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-300 hover:border-surgicalTeal/50 hover:text-surgicalTeal"
                  >
                    Sync with Resume
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateCoverLetter}
                    disabled={coverLetterLoading || (!sharpened && !experience.trim())}
                    className="btn-glimmer rounded-lg border border-surgicalTeal/70 bg-surgicalTeal/10 px-3 py-2 text-xs font-medium text-surgicalTeal disabled:opacity-50 inline-flex items-center gap-2"
                  >
                    {coverLetterLoading ? (<><span className="surgical-pulse" aria-hidden />Writing…</>) : <>Generate Cover Letter <span className="ml-1 rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] text-slate-400">{getCost("COVER_LETTER")} SU</span></>}
                  </button>
                  {canDownloadCoverLetter && coverLetter && (
                    <button
                      type="button"
                      onClick={() => handlePrintCoverLetter?.()}
                      className="rounded-lg border border-surgicalTeal/70 bg-surgicalTeal/10 px-3 py-2 text-xs font-medium text-surgicalTeal hover:bg-surgicalTeal/20"
                    >
                      Download Cover Letter PDF
                    </button>
                  )}
                </div>
                {syncToast && (
                  <p className="text-[11px] text-surgicalTeal">Contact info synced from resume.</p>
                )}
              </section>
              <section className="relative">
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
              </section>
            </div>
          ) : dashboardTab === "proposals" ? (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] items-start">
              <section className="resume-surface glass-card rounded-2xl border border-white/10 p-6 lg:p-7 space-y-5">
                <header className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-display text-lg text-slate-50">Surgical Proposal</h2>
                    <p className="text-xs text-slate-400 mt-1">
                      High-ticket proposals for freelancers and agencies. Same letterhead as your resume.
                    </p>
                  </div>
                  {proposalTrack === "firm" && (
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex flex-col items-end gap-1">
                        <label className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                          Company Logo
                        </label>
                        <div className="flex items-center gap-2">
                          {proposalLogo && (
                            <div className="h-8 w-8 rounded-full overflow-hidden border border-slate-700 bg-slate-900/60 flex items-center justify-center">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={proposalLogo}
                                alt="Company logo"
                                className="h-full w-full object-cover"
                              />
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              const input = document.createElement("input");
                              input.type = "file";
                              input.accept = "image/*";
                              input.onchange = () => {
                                const file = input.files?.[0];
                                if (!file) return;
                                const reader = new FileReader();
                                reader.onload = (e) => {
                                  const result = e.target?.result;
                                  if (typeof result === "string") {
                                    setProposalLogo(result);
                                  }
                                };
                                reader.readAsDataURL(file);
                              };
                              input.click();
                            }}
                          className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-[10px] text-slate-200 hover:border-surgicalTeal/60 hover:text-surgicalTeal"
                        >
                          {proposalLogo ? "Change Logo" : "Upload Logo"}
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                          Brand Color
                        </label>
                        <input
                          type="color"
                          value={proposalBrandColor}
                          onChange={(e) => setProposalBrandColor(e.target.value)}
                          className="h-6 w-6 rounded-full border border-slate-600 bg-slate-900/70 cursor-pointer"
                          aria-label="Primary brand color"
                        />
                      </div>
                    </div>
                  )}
                </header>
                <div className="space-y-2">
                  <label className="block text-[11px] uppercase tracking-[0.18em] text-slate-400">Track</label>
                  <div className="flex rounded-lg border border-slate-800 bg-slate-950/40 p-0.5">
                    <button
                      type="button"
                      onClick={() => setProposalTrack("freelancer")}
                      className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                        proposalTrack === "freelancer"
                          ? "bg-surgicalTeal/20 text-surgicalTeal"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Individual Freelancer
                    </button>
                    <button
                      type="button"
                      onClick={() => canUseFirmProposal && setProposalTrack("firm")}
                      className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                        !canUseFirmProposal ? "cursor-not-allowed opacity-60" : proposalTrack === "firm" ? "bg-surgicalTeal/20 text-surgicalTeal" : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Professional Firm
                    </button>
                  </div>
                  {proposalTrack === "firm" && !canUseFirmProposal && (
                    <p className="text-[11px] text-surgicalTeal">Upgrade to Business Surgeon to use the Firm track.</p>
                  )}
                </div>
                {proposalTrack === "firm" && canUseFirmProposal && (
                  <>
                    <div className="space-y-2">
                      <label className="block text-[11px] uppercase tracking-[0.18em] text-slate-400">Strategy tone</label>
                      <div className="flex rounded-lg border border-slate-800 bg-slate-950/40 p-0.5">
                        <button
                          type="button"
                          onClick={() => setProposalStrategyTone("conservative")}
                          className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                            proposalStrategyTone === "conservative"
                              ? "bg-slate-700 text-slate-100"
                              : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          Conservative / Safe
                        </button>
                        <button
                          type="button"
                          onClick={() => setProposalStrategyTone("bold")}
                          className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                            proposalStrategyTone === "bold"
                              ? "bg-surgicalTeal/20 text-surgicalTeal"
                              : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          Bold / Disruptive
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2 pt-1">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                        Discovery Questionnaire
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Capture how your firm positions this engagement before we generate the strategy.
                      </p>
                    </div>
                    <div className="space-y-3">
                      <label className="block text-[11px] uppercase tracking-[0.18em] text-slate-400">Company name</label>
                      <input
                        type="text"
                        placeholder="e.g. Acme Consulting"
                        value={proposalCompanyName}
                        onChange={(e) => setProposalCompanyName(e.target.value)}
                        className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/70 focus:outline-none focus:ring-1 focus:ring-surgicalTeal/60"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="block text-[11px] uppercase tracking-[0.18em] text-slate-400">Team size</label>
                      <input
                        type="text"
                        placeholder="e.g. 12 consultants"
                        value={proposalTeamSize}
                        onChange={(e) => setProposalTeamSize(e.target.value)}
                        className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/70 focus:outline-none focus:ring-1 focus:ring-surgicalTeal/60"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="block text-[11px] uppercase tracking-[0.18em] text-slate-400">Firm Identity</label>
                      <input
                        type="text"
                        placeholder="e.g. Creative Agency, SaaS Dev Shop, Consulting Group"
                        value={proposalFirmIdentity}
                        onChange={(e) => setProposalFirmIdentity(e.target.value)}
                        className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/70 focus:outline-none focus:ring-1 focus:ring-surgicalTeal/60"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="block text-[11px] uppercase tracking-[0.18em] text-slate-400">The Mission</label>
                      <textarea
                        rows={2}
                        placeholder="What is the primary goal of this project? (e.g. Scaling Revenue, Digital Transformation, Brand Rebirth)"
                        value={proposalMission}
                        onChange={(e) => setProposalMission(e.target.value)}
                        className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/70 focus:outline-none focus:ring-1 focus:ring-surgicalTeal/60"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="block text-[11px] uppercase tracking-[0.18em] text-slate-400">The Methodology</label>
                      <textarea
                        rows={2}
                        placeholder="How do you work? (e.g. Agile Sprints, The 4-Phase Framework, White-Glove Service)"
                        value={proposalMethodology}
                        onChange={(e) => setProposalMethodology(e.target.value)}
                        className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/70 focus:outline-none focus:ring-1 focus:ring-surgicalTeal/60"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="block text-[11px] uppercase tracking-[0.18em] text-slate-400">Success Metrics</label>
                      <textarea
                        rows={2}
                        placeholder="What does a 'win' look like for the client? (e.g. 20% Conversion Increase)"
                        value={proposalSuccessMetrics}
                        onChange={(e) => setProposalSuccessMetrics(e.target.value)}
                        className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/70 focus:outline-none focus:ring-1 focus:ring-surgicalTeal/60"
                      />
                    </div>
                  </>
                )}
                <div className="space-y-3">
                  <label className="block text-[11px] uppercase tracking-[0.18em] text-slate-400">Client name</label>
                  <input
                    type="text"
                    placeholder="e.g. Acme Corp"
                    value={proposalClientName}
                    onChange={(e) => setProposalClientName(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/70 focus:outline-none focus:ring-1 focus:ring-surgicalTeal/60"
                  />
                </div>
                <div className="space-y-3">
                  <label className="block text-[11px] uppercase tracking-[0.18em] text-slate-400">Project scope</label>
                  <textarea
                    rows={3}
                    placeholder="Describe the project or engagement..."
                    value={proposalScope}
                    onChange={(e) => setProposalScope(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/70 focus:outline-none focus:ring-1 focus:ring-surgicalTeal/60"
                  />
                </div>
                <div className="space-y-3">
                  <label className="block text-[11px] uppercase tracking-[0.18em] text-slate-400">Pain points</label>
                  <textarea
                    rows={2}
                    placeholder="Client challenges or goals..."
                    value={proposalPainPoints}
                    onChange={(e) => setProposalPainPoints(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/70 focus:outline-none focus:ring-1 focus:ring-surgicalTeal/60"
                  />
                </div>
                <div className="space-y-3">
                  <label className="block text-[11px] uppercase tracking-[0.18em] text-slate-400">Pricing</label>
                  <input
                    type="text"
                    placeholder="e.g. $X fixed / $X per phase"
                    value={proposalPricing}
                    onChange={(e) => setProposalPricing(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/70 focus:outline-none focus:ring-1 focus:ring-surgicalTeal/60"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-[11px] uppercase tracking-[0.18em] text-slate-400">Line items (for PDF)</label>
                  <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/40 p-2">
                    {proposalLineItems.map((item) => (
                      <div key={item.id} className="flex gap-2 items-center">
                        <input
                          type="text"
                          placeholder="Description"
                          value={item.description}
                          onChange={(e) =>
                            setProposalLineItems((prev) =>
                              prev.map((x) => (x.id === item.id ? { ...x, description: e.target.value } : x))
                            )
                          }
                          className="flex-1 min-w-0 rounded border border-slate-700 bg-slate-900/60 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/60 focus:outline-none"
                        />
                        <input
                          type="text"
                          placeholder="$0"
                          value={item.amount}
                          onChange={(e) =>
                            setProposalLineItems((prev) =>
                              prev.map((x) => (x.id === item.id ? { ...x, amount: e.target.value } : x))
                            )
                          }
                          className="w-20 rounded border border-slate-700 bg-slate-900/60 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/60 focus:outline-none"
                        />
                        <label className="flex items-center gap-1 text-[10px] text-slate-400">
                          <input
                            type="checkbox"
                            checked={!!item.optional}
                            onChange={(e) =>
                              setProposalLineItems((prev) =>
                                prev.map((x) =>
                                  x.id === item.id ? { ...x, optional: e.target.checked } : x
                                )
                              )
                            }
                            className="h-3 w-3 rounded border border-slate-600 bg-slate-900/70"
                          />
                          Optional
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setProposalLineItems((prev) => (prev.length > 1 ? prev.filter((x) => x.id !== item.id) : prev))
                          }
                          className="p-1.5 text-slate-400 hover:text-red-400 rounded"
                          aria-label="Remove line"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setProposalLineItems((prev) => [
                          ...prev,
                          { id: String(Date.now()), description: "", amount: "" },
                        ])
                      }
                      className="flex items-center gap-1.5 w-full rounded border border-dashed border-slate-600 py-1.5 text-xs text-slate-400 hover:border-surgicalTeal/50 hover:text-surgicalTeal"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add line item
                    </button>
                  </div>
                  {(() => {
                    const total = proposalLineItems.reduce((sum, i) => {
                      const n = parseFloat(String(i.amount).replace(/[^0-9.-]/g, ""));
                      return sum + (Number.isFinite(n) ? n : 0);
                    }, 0);
                    if (proposalLineItems.some((i) => i.description || i.amount)) {
                      return (
                        <p className="text-[11px] text-slate-400">
                          Total: {Number.isFinite(total) ? `$${total.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "—"}
                        </p>
                      );
                    }
                    return null;
                  })()}
                </div>
                <button
                  type="button"
                  onClick={handleImportCaseStudies}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-300 hover:border-surgicalTeal/50 hover:text-surgicalTeal"
                >
                  Import Case Studies from Resume
                </button>
                {proposalCaseStudies && (
                  <textarea
                    rows={4}
                    placeholder="Case studies (imported from resume)"
                    value={proposalCaseStudies}
                    onChange={(e) => setProposalCaseStudies(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/70 focus:outline-none focus:ring-1 focus:ring-surgicalTeal/60"
                  />
                )}
                <button
                  type="button"
                  onClick={handleGenerateProposal}
                  disabled={
                    proposalLoading ||
                    (proposalTrack === "firm"
                      ? !canTriggerFirmProposal
                      : !canTriggerFreelancerProposal)
                  }
                  className="btn-glimmer w-full rounded-lg border border-surgicalTeal/70 bg-surgicalTeal/10 px-3 py-2 text-xs font-medium text-surgicalTeal disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  {proposalLoading ? (
                    <><span className="surgical-pulse" aria-hidden />{proposalTrack === "firm" ? "Generating Strategy…" : "Generating…"}</>
                  ) : <>{(proposalTrack === "firm" ? "Generate Strategy" : "Generate Proposal")} <span className="ml-1 rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] text-slate-400">{getCost("PROPOSAL")} SU</span></>}
                </button>
                {proposalLoading && proposalTrack === "firm" && (
                  <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400 mb-1">
                      Strategy Engine
                    </p>
                    <ul className="space-y-0.5 text-[11px] text-slate-300">
                      <li>• Analyzing client pain points…</li>
                      <li>• Mapping methodology to mission…</li>
                      <li>• Calculating ROI and cost of inaction…</li>
                    </ul>
                  </div>
                )}
                {canDownloadProposal && proposalContent && (
                  <button
                    type="button"
                    onClick={() => handlePrintProposal?.()}
                    className="w-full rounded-lg border border-surgicalTeal/70 bg-surgicalTeal/10 px-3 py-2 text-xs font-medium text-surgicalTeal hover:bg-surgicalTeal/20"
                  >
                    Download Proposal PDF
                  </button>
                )}
              </section>
              <section className="relative">
                <div
                  ref={proposalRef}
                  className="proposal-print-wrapper"
                >
                  {/* Cover page for print */}
                  <div className="proposal-cover resume-paper print-resume-page rounded-2xl border border-slate-200/70 shadow-xl px-12 py-16 text-center mb-6 flex flex-col justify-center min-h-[320px]">
                    <div className="proposal-page-header border-b border-slate-200/50 pb-3 mb-6 text-left">
                      <p className="text-[10px] uppercase tracking-widest text-slate-400">Resume Surgeon · Executive Proposal</p>
                    </div>
                    <div className={`${theme === "surgeon" ? "theme-surgeon" : theme === "partner" ? "theme-partner" : "theme-innovator"}`}>
                      <p className="resume-header-name text-3xl text-slate-900 mb-2">
                        {proposalTrack === "firm" && proposalCompanyName ? proposalCompanyName : (fullName || "Your Name")}
                      </p>
                      <p className="resume-header-title text-sm uppercase tracking-[0.2em] text-slate-500 mb-6">
                        Executive Proposal
                      </p>
                      <p className="resume-body text-xl text-slate-700">
                        {proposalClientName ? `Prepared for ${proposalClientName}` : "Prepared for Client"}
                      </p>
                    </div>
                  </div>
                  {/* Proposal body - heavier layout */}
                  <div className={`resume-paper print-resume-page rounded-2xl border border-slate-200/70 shadow-xl px-10 py-10 ${theme === "surgeon" ? "theme-surgeon" : theme === "partner" ? "theme-partner" : "theme-innovator"}`}>
                    <div className="proposal-page-header border-b border-slate-200/50 pb-2 mb-4">
                      <p className="text-[10px] uppercase tracking-widest text-slate-400">Resume Surgeon · Executive Proposal</p>
                    </div>
                    <div className={`border-b border-slate-200/70 pb-4 mb-6 ${theme === "partner" ? "text-center" : "flex items-start justify-between gap-6"}`}>
                      <div className="flex-1 space-y-1 flex items-start gap-3">
                        {proposalTrack === "firm" && proposalLogo && (
                          <div className="h-10 w-10 rounded-full overflow-hidden border border-slate-300 bg-slate-100 flex-shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={proposalLogo}
                              alt="Company logo"
                              className="h-full w-full object-cover"
                            />
                          </div>
                        )}
                        <div className="space-y-1">
                          <p className="resume-header-name text-2xl text-slate-900 leading-snug">
                            {proposalTrack === "firm" && proposalCompanyName ? proposalCompanyName : (fullName || "Your Name")}
                          </p>
                          <p className="resume-header-title text-xs uppercase tracking-[0.22em] text-slate-500">
                            {proposalTrack === "firm" ? "Professional Services" : (targetRole || "Consultant")}
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
                          {proposalTrack === "firm" && proposalContent.riskMitigations && proposalContent.riskMitigations.length > 0 && (
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
                          {proposalTrack === "firm" && proposalContent.roadmapMilestones && (
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
                                  <span className="text-slate-300" aria-hidden="true">→</span>
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
                                  <span className="text-slate-300" aria-hidden="true">→</span>
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
                          <section className="proposal-cta proposal-section rounded-xl border-2 border-surgicalTeal/40 bg-surgicalTeal/5 p-6">
                            <h3 className="font-display text-sm uppercase tracking-[0.22em] text-slate-800 mb-3">The Investment</h3>
                            <div className="h-px w-16 mb-3" style={{ backgroundColor: proposalAccentColor }} />
                            <div className="resume-body text-slate-800 text-[12pt] leading-relaxed whitespace-pre-line">{proposalContent.investment}</div>
                            {proposalLineItems.some((i) => i.description.trim() || i.amount.trim()) && (
                              <div className="mt-6 proposal-pricing-table">
                                <table className="w-full border-collapse text-[11pt]">
                                  <thead>
                                    <tr className="border-b border-slate-300">
                                      <th className="text-left py-2 font-medium text-slate-700">Description</th>
                                      <th className="text-right py-2 font-medium text-slate-700">Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {proposalLineItems
                                      .filter((i) => i.description.trim() || i.amount.trim())
                                      .map((item) => {
                                        const amt = parseFloat(String(item.amount).replace(/[^0-9.-]/g, ""));
                                        return (
                                          <tr key={item.id} className="border-b border-slate-200/80 align-top">
                                            <td className="py-2.5 text-slate-800">
                                              <div className="text-[11pt]">
                                                {item.description || "—"}
                                              </div>
                                              {item.optional && (
                                                <div className="text-[9px] uppercase tracking-[0.18em] text-slate-500 mt-0.5">
                                                  Optional add-on
                                                </div>
                                              )}
                                            </td>
                                            <td className="py-2.5 text-right text-slate-800">
                                              {Number.isFinite(amt)
                                                ? `$${amt.toLocaleString("en-US", {
                                                    minimumFractionDigits: 0,
                                                    maximumFractionDigits: 0,
                                                  })}`
                                                : item.amount || "—"}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                  </tbody>
                                  <tfoot>
                                    <tr className="border-t-2 border-slate-400 font-semibold text-slate-900">
                                      <td className="pt-3 pb-1">Total</td>
                                      <td className="text-right pt-3 pb-1">
                                        ${proposalLineItems.reduce((sum, i) => {
                                          const n = parseFloat(String(i.amount).replace(/[^0-9.-]/g, ""));
                                          return sum + (Number.isFinite(n) ? n : 0);
                                        }, 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                      </td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            )}
                          </section>
                          {proposalTrack === "firm" && (proposalContent.costOfInaction || proposalContent.successOutcome || proposalContent.totalValueDelivered) && (
                            <section className="proposal-section rounded-xl border-2 border-slate-200 bg-slate-50/80 p-6">
                              <h3 className="font-display text-sm uppercase tracking-[0.22em] text-slate-800 mb-3">Impact Summary</h3>
                              <div className="h-px w-16 mb-4" style={{ backgroundColor: proposalAccentColor }} />
                              <div className="space-y-3 text-[11pt]">
                                {proposalContent.costOfInaction && (
                                  <p><span className="font-medium text-slate-700">Cost of inaction:</span> <span className="text-slate-700">{proposalContent.costOfInaction}</span></p>
                                )}
                                {proposalContent.successOutcome && (
                                  <p><span className="font-medium text-slate-700">Success outcome:</span> <span className="text-slate-700">{proposalContent.successOutcome}</span></p>
                                )}
                                {proposalContent.totalValueDelivered && (
                                  <p className="pt-2 border-t border-slate-200">
                                    <span className="font-semibold" style={{ color: proposalAccentColor }}>Total value delivered:</span>{" "}
                                    <span className="font-semibold text-slate-800" style={{ color: proposalAccentColor }}>{proposalContent.totalValueDelivered}</span>
                                  </p>
                                )}
                              </div>
                            </section>
                          )}
                          {proposalTrack === "firm" && (
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
                                  [Add team bios, photos, and roles here. This section can be customized in your exported document.]
                                </p>
                              </section>
                              <section className="proposal-section">
                                <h3 className="font-display text-sm uppercase tracking-[0.22em] text-slate-700 mb-3">Next Steps</h3>
                                <div className="h-px w-16 mb-3" style={{ backgroundColor: proposalAccentColor }} />
                                {proposalContent.nextSteps && (
                                  <p className="resume-body text-slate-800 text-[11pt] leading-relaxed mb-4 whitespace-pre-line">{proposalContent.nextSteps}</p>
                                )}
                                <div className="border-2 border-dashed border-slate-300 rounded-lg px-4 py-3 bg-slate-50">
                                  <p className="text-[11pt] font-medium text-slate-600">Click to sign</p>
                                  <p className="text-[10px] text-slate-400 mt-0.5">Acceptance line — to be signed by client</p>
                                </div>
                                {proposalContent.projectKickoffChecklist && proposalContent.projectKickoffChecklist.length > 0 && (
                                  <div className="mt-4">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 mb-2">Project kickoff checklist</p>
                                    <ul className="space-y-1.5 list-none pl-0">
                                      {proposalContent.projectKickoffChecklist.map((item, i) => (
                                        <li key={i} className="flex gap-2 items-start text-[10pt] text-slate-700">
                                          <span className="text-slate-400 mt-0.5">□</span>
                                          <span>{item}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </section>
                            </>
                          )}
                        </>
                      ) : (
                        <p className="resume-body text-slate-500 text-[11pt]">
                          Enter client and project details, then click Generate Proposal. Use &quot;Import Case Studies from Resume&quot; to pull in your experience as proof.
                        </p>
                      )}
                    </div>
                    <div className="mt-10 pt-4 border-t border-slate-200/60 text-center text-[10px] text-slate-400 proposal-page-number">
                      Resume Surgeon · Executive Proposal
                    </div>
                  </div>
                  {proposalTrack === "firm" && proposalContent && (
                    <div className={`resume-paper print-resume-page rounded-2xl border border-slate-200/70 shadow-xl px-10 py-10 ${theme === "surgeon" ? "theme-surgeon" : theme === "partner" ? "theme-partner" : "theme-innovator"}`}>
                      <div className="proposal-page-header border-b border-slate-200/50 pb-2 mb-4">
                        <p className="text-[10px] uppercase tracking-widest text-slate-400">Resume Surgeon · Executive Proposal</p>
                      </div>
                      <div className="proposal-body">
                        <h3 className="font-display text-sm uppercase tracking-[0.22em] text-slate-800 mb-4">Terms &amp; Conditions</h3>
                        <div className="h-px w-16 mb-4" style={{ backgroundColor: proposalAccentColor }} />
                        <div className="resume-body text-slate-700 text-[10pt] leading-relaxed space-y-3">
                          <p><strong>Scope of Work.</strong> Services are as described in this proposal. Any material changes require written agreement.</p>
                          <p><strong>Payment.</strong> Payment terms are as set out in the Investment section. Invoices are due within the period specified.</p>
                          <p><strong>Confidentiality.</strong> Both parties agree to keep confidential any proprietary or sensitive information shared during the engagement.</p>
                          <p><strong>Intellectual Property.</strong> Deliverables and IP created under this engagement will be assigned as agreed in a separate statement of work or contract.</p>
                          <p><strong>Termination.</strong> Either party may terminate with written notice as per the terms agreed. Fees for work completed up to the termination date remain payable.</p>
                          <p><strong>Limitation of Liability.</strong> Liability is limited to the fees paid for the relevant engagement, except where prohibited by law.</p>
                          <p>This proposal is valid for 30 days from the date of issue unless otherwise stated. By proceeding, the client agrees to these terms.</p>
                        </div>
                      </div>
                      <div className="mt-10 pt-4 border-t border-slate-200/60 text-center text-[10px] text-slate-400 proposal-page-number">
                        Resume Surgeon · Executive Proposal
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </div>
          ) : dashboardTab === "linkedin" ? (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] items-start">
              <section className="resume-surface glass-card rounded-2xl border border-white/10 p-6 lg:p-7 space-y-5">
                <header>
                  <h2 className="font-display text-lg text-slate-50">LinkedIn Surgeon</h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Social Authority Engine — headlines, About (Hook-Value-Proof-CTA), and Featured Projects for recruiters.
                  </p>
                </header>
                <div className="space-y-3">
                  <label className="block text-[11px] uppercase tracking-[0.18em] text-slate-400">Current role</label>
                  <input
                    type="text"
                    placeholder="e.g. Senior Product Manager"
                    value={linkedinCurrentRole}
                    onChange={(e) => setLinkedinCurrentRole(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/70 focus:outline-none focus:ring-1 focus:ring-surgicalTeal/60"
                  />
                </div>
                <div className="space-y-3">
                  <label className="block text-[11px] uppercase tracking-[0.18em] text-slate-400">Career goals</label>
                  <textarea
                    rows={2}
                    placeholder="Where you want to be — e.g. VP Product, founder..."
                    value={linkedinCareerGoals}
                    onChange={(e) => setLinkedinCareerGoals(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/70 focus:outline-none focus:ring-1 focus:ring-surgicalTeal/60"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleGenerateLinkedIn}
                  disabled={linkedinLoading || (!sharpened && !experience.trim())}
                  className="btn-glimmer w-full rounded-lg border border-surgicalTeal/70 bg-surgicalTeal/10 px-3 py-2 text-xs font-medium text-surgicalTeal disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  {linkedinLoading ? (<><span className="surgical-pulse" aria-hidden />Generating…</>) : <>Generate for LinkedIn <span className="ml-1 rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] text-slate-400">{getCost("LINKEDIN")} SU</span></>}
                </button>
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 space-y-2">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Networking Surgery</p>
                  <p className="text-[11px] text-slate-500">3 Cold Outreach variants (200 chars each): Recruiter, Peer, Hiring Manager.</p>
                  <button
                    type="button"
                    disabled={linkedinDmLoading || !jobDescription.trim()}
                    onClick={async () => {
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
                        if (res.status === 402 && data?.code === "CREDITS_REQUIRED") {
                          setShowRefillModal(true);
                        } else if (!res.ok) {
                          throw new Error("Failed");
                        } else {
                          setLinkedinDm(data.recruiter != null ? { recruiter: data.recruiter || "", peer: data.peer || "", hiringManager: data.hiringManager || "" } : null);
                        }
                      } catch {
                        setLinkedinDm(null);
                      }
                      setLinkedinDmLoading(false);
                    }}
                    className="w-full rounded-lg border border-surgicalTeal/50 bg-surgicalTeal/10 px-3 py-2 text-xs font-medium text-surgicalTeal hover:bg-surgicalTeal/20 disabled:opacity-50"
                  >
                    {linkedinDmLoading ? "Generating…" : <>Generate 3 LinkedIn DMs <span className="ml-1 rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] text-slate-400">{getCost("LINKEDIN_DM")} SU</span></>}
                  </button>
                  {linkedinDm && (
                    <div className="space-y-2">
                      {[
                        { key: "recruiter" as const, label: "Recruiter" },
                        { key: "peer" as const, label: "Peer (referral)" },
                        { key: "hiringManager" as const, label: "Hiring Manager" },
                      ].map(({ key, label }) => (
                        <div key={key} className="flex items-start justify-between gap-2 rounded-lg border border-slate-700 bg-slate-950/60 p-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">{label}</p>
                            <p className="text-xs text-slate-300">{linkedinDm[key]}</p>
                          </div>
                          <button type="button" onClick={() => navigator.clipboard.writeText(linkedinDm[key])} className="shrink-0 rounded p-1 text-surgicalTeal hover:bg-surgicalTeal/20" title="Copy"><Copy className="h-3.5 w-3.5" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {linkedinContent && (
                  <>
                    <div className="space-y-2 pt-2 border-t border-slate-800">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Pick a headline (free)</p>
                      <div className="space-y-1.5">
                        {linkedinContent.headlines.map((h, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setLinkedinSelectedHeadline(i)}
                            className={`block w-full rounded-lg border px-3 py-2 text-left text-xs ${
                              linkedinSelectedHeadline === i
                                ? "border-surgicalTeal/60 bg-surgicalTeal/10 text-surgicalTeal"
                                : "border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-600"
                            }`}
                          >
                            {h || `Headline ${i + 1}`}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Featured section strategy</p>
                      <p className="text-xs text-slate-300 leading-relaxed">{linkedinContent.featuredStrategy}</p>
                    </div>
                    {linkedinContent.featuredProjects?.length > 0 && (
                      <div className="space-y-2 pt-1 border-t border-slate-800">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Featured Projects (5)</p>
                        <ul className="space-y-1.5 text-[11px] text-slate-400">
                          {linkedinContent.featuredProjects.map((p, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="text-surgicalTeal shrink-0">•</span>
                              <span>{p}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="flex flex-col gap-2 pt-2 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={handleCopyAllLinkedIn}
                        className={`w-full rounded-lg border px-3 py-2 text-xs font-medium flex items-center justify-center gap-2 ${
                          canUseLinkedInExport
                            ? "border-surgicalTeal/70 bg-surgicalTeal/10 text-surgicalTeal hover:bg-surgicalTeal/20"
                            : "border-slate-700 bg-slate-900/60 text-slate-400"
                        }`}
                      >
                        {canUseLinkedInExport ? <Copy className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                        {canUseLinkedInExport ? "Copy All for LinkedIn" : "Copy All (Executive Pass)"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setBannerPatternSeed((s) => s + 1)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs font-medium text-slate-300 hover:border-surgicalTeal/50 hover:text-surgicalTeal flex items-center justify-center gap-2"
                      >
                        Regenerate Pattern
                      </button>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={canUseLinkedInExport ? handleDownloadBanner : () => setShowPaywall(true)}
                          className={`w-full rounded-lg border px-3 py-2 text-xs font-medium flex items-center justify-center gap-2 ${
                            canUseLinkedInExport
                              ? "border-surgicalTeal/70 bg-surgicalTeal/10 text-surgicalTeal hover:bg-surgicalTeal/20"
                              : "border-slate-700 bg-slate-900/60 text-slate-500 blur-[2px] select-none pointer-events-none"
                          }`}
                        >
                          <Linkedin className="h-3.5 w-3.5" />
                          Download High-Res Banner
                        </button>
                        {!canUseLinkedInExport && (
                          <button
                            type="button"
                            onClick={() => setShowPaywall(true)}
                            className="absolute inset-0 flex items-center justify-center gap-2 rounded-lg border border-surgicalTeal/70 bg-surgicalTeal/10 text-surgicalTeal text-xs font-medium hover:bg-surgicalTeal/20"
                          >
                            <Lock className="h-3.5 w-3.5" />
                            Executive Pass
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </section>
              <section className="relative">
                <div className="rounded-2xl border border-slate-700/80 bg-slate-900/40 overflow-hidden shadow-xl">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 px-4 py-2 border-b border-slate-800">LinkedIn profile mockup</p>
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
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 rounded-t-lg pointer-events-none">
                          <span className="text-[11px] text-slate-400">Unlock to download — Executive Pass</span>
                        </div>
                      )}
                    </div>
                    <div className="bg-slate-800/60 px-4 pt-12 pb-4">
                      <div className="flex items-end gap-4">
                        <div className="relative">
                          <div className="w-20 h-20 rounded-full border-4 border-slate-800 bg-slate-700 flex-shrink-0 flex items-center justify-center text-2xl font-bold text-slate-400">
                            {(fullName || "Y").charAt(0)}
                          </div>
                          <span className="absolute -bottom-1 left-0 right-0 text-center text-[9px] text-slate-500">Profile Photo</span>
                        </div>
                        <div className="flex-1 min-w-0 pb-1">
                          <p className="font-semibold text-slate-100 truncate">{fullName || "Your Name"}</p>
                          <p className="text-sm text-slate-400 truncate">
                            {linkedinContent?.headlines[linkedinSelectedHeadline] ||
                              linkedinContent?.headlines[0] ||
                              targetRole ||
                              "Headline"}
                          </p>
                        </div>
                      </div>
                    </div>
                    {linkedInConsistencyScore != null && (
                      <div className="px-4 py-2 border-t border-slate-800 flex items-center justify-between gap-2">
                        <span className="text-[10px] uppercase tracking-wider text-slate-500">Consistency Score</span>
                        <span className={`text-xs font-semibold tabular-nums ${linkedInConsistencyScore >= 40 ? "text-emerald-400" : "text-amber-400"}`}>
                          {linkedInConsistencyScore}%
                        </span>
                      </div>
                    )}
                    {linkedInBrandMismatch && (
                      <p className="px-4 py-2 text-[11px] text-amber-400 bg-amber-500/10 border-t border-slate-800">
                        ⚠️ Brand Mismatch. Your LinkedIn doesn&apos;t support your Resume&apos;s claims. Align your About with your resume summary.
                      </p>
                    )}
                    <div className="px-4 py-4 border-t border-slate-800 relative">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">About</p>
                      <div className={`text-xs text-slate-300 leading-relaxed whitespace-pre-line max-h-32 overflow-y-auto ${!canUseLinkedInExport ? "select-none blur-md pointer-events-none" : ""}`}>
                        {linkedinContent?.about || "Generate content to see your story-driven About (Hook-Value-Proof-CTA) here."}
                      </div>
                      {!canUseLinkedInExport && linkedinContent?.about && (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 rounded">
                          <span className="text-[11px] text-slate-400">Unlock with Executive Pass</span>
                        </div>
                      )}
                    </div>
                    {linkedinContent && (linkedinContent.topSkills?.length ?? 0) > 0 && (
                      <div className="px-4 py-3 border-t border-slate-800">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Top skills</p>
                        <div className="flex flex-wrap gap-1.5">
                          {linkedinContent.topSkills.map((s, i) => (
                            <span
                              key={i}
                              className="rounded-full bg-slate-700/80 px-2.5 py-0.5 text-[11px] text-slate-300"
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
              <section className="resume-surface glass-card rounded-2xl border border-white/10 p-6 lg:p-7 space-y-5">
                <header>
                  <h2 className="font-display text-lg text-slate-50">Follow-Up Kit</h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Ghosting prevention — 3 tiered follow-up emails based on your JD and resume.
                  </p>
                </header>
                <div className="space-y-3">
                  <label className="block text-[11px] uppercase tracking-[0.18em] text-slate-400">Job description</label>
                  <textarea
                    rows={4}
                    placeholder="Paste the job description (same as Target Job). Used to tailor follow-up emails."
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/70 focus:outline-none focus:ring-1 focus:ring-surgicalTeal/60 resize-y"
                  />
                  <label className="block text-[11px] uppercase tracking-[0.18em] text-slate-400">Company name (optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Acme Corp"
                    value={followUpCompanyName}
                    onChange={(e) => setFollowUpCompanyName(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/70 focus:outline-none focus:ring-1 focus:ring-surgicalTeal/60"
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
                      if (res.status === 402 && data?.code === "CREDITS_REQUIRED") {
                        setShowRefillModal(true);
                      } else if (!res.ok) {
                        throw new Error("Failed to generate");
                      } else {
                        setFollowUpEmails(data);
                      }
                    } catch {
                      setFollowUpEmails(null);
                    }
                    setFollowUpLoading(false);
                  }}
                  className="btn-glimmer w-full rounded-xl border border-surgicalTeal/70 bg-surgicalTeal/10 px-4 py-3 text-sm font-medium text-surgicalTeal hover:bg-surgicalTeal/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {followUpLoading ? "Generating…" : <>Generate 3 Follow-Up Emails <span className="ml-1 rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] text-slate-400">{getCost("FOLLOW_UP")} SU</span></>}
                </button>
              </section>
              <section className="resume-surface glass-card rounded-2xl border border-white/10 p-6 lg:p-7 space-y-6">
                <h3 className="font-display text-base text-slate-50">Your follow-up sequence</h3>
                {followUpEmails ? (
                  <div className="space-y-6">
                    {[
                      { key: "gentleCheckIn" as const, title: "48-Hour Gentle Nudge", subtitle: "Short, polite email nudge." },
                      { key: "valueAdd" as const, title: "7-Day Value-Add", subtitle: "Message suggesting a solution to a problem in the JD." },
                      { key: "closeTheLoop" as const, title: "14-Day Professional Close", subtitle: "Final check-in, keep door open." },
                    ].map(({ key, title, subtitle }) => (
                      <div key={key} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div>
                            <p className="text-sm font-medium text-slate-100">{title}</p>
                            <p className="text-[11px] text-slate-500">{subtitle}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => { navigator.clipboard.writeText(followUpEmails[key]); }}
                            className="rounded-lg border border-surgicalTeal/50 bg-surgicalTeal/10 px-2.5 py-1.5 text-[11px] font-medium text-surgicalTeal hover:bg-surgicalTeal/20"
                          >
                            <Copy className="h-3.5 w-3.5 inline mr-1" />
                            Copy
                          </button>
                        </div>
                        <p className="text-xs text-slate-300 whitespace-pre-line leading-relaxed">{followUpEmails[key]}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Generate follow-up emails to see the 48-hour check-in, 7-day value-add, and 14-day close-the-loop here.</p>
                )}
              </section>
            </div>
          ) : dashboardTab === "tracker" ? (
            <div className="max-w-3xl mx-auto space-y-6">
              <section className="resume-surface glass-card rounded-2xl border border-white/10 p-6 lg:p-7">
                <header>
                  <h2 className="font-display text-lg text-slate-50">My Operations</h2>
                  <p className="text-xs text-slate-400 mt-1">Surgical Tracker — Company, role, date applied, status. {operationsFromDb ? "Synced to your account." : "Saved locally until you sign in."}</p>
                </header>
                <div className="mt-4 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_auto_auto] items-end">
                    <input
                      type="text"
                      placeholder="Company name"
                      value={trackerNewCompany}
                      onChange={(e) => setTrackerNewCompany(e.target.value)}
                      className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/70 focus:outline-none focus:ring-1 focus:ring-surgicalTeal/60"
                    />
                    <input
                      type="text"
                      placeholder="Job title"
                      value={trackerNewTitle}
                      onChange={(e) => setTrackerNewTitle(e.target.value)}
                      className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/70 focus:outline-none focus:ring-1 focus:ring-surgicalTeal/60"
                    />
                    <input
                      type="date"
                      value={trackerNewDate}
                      onChange={(e) => setTrackerNewDate(e.target.value)}
                      className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 focus:border-surgicalTeal/70 focus:outline-none focus:ring-1 focus:ring-surgicalTeal/60"
                    />
                    <select
                      value={trackerNewStatus}
                      onChange={(e) => setTrackerNewStatus(e.target.value as ApplicationStatus)}
                      className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 focus:border-surgicalTeal/70 focus:outline-none focus:ring-1 focus:ring-surgicalTeal/60"
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
                      className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/70 focus:outline-none focus:ring-1 focus:ring-surgicalTeal/60"
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
                      className="rounded-lg border border-surgicalTeal/60 bg-surgicalTeal/10 px-4 py-2 text-sm font-medium text-surgicalTeal hover:bg-surgicalTeal/20 disabled:opacity-50"
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
                        <li key={job.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                          <span className="font-medium text-slate-200">{job.company_name}</span>
                          <span className="text-slate-400">·</span>
                          <span className="text-sm text-slate-300">{job.job_title}</span>
                          <span className="text-[11px] text-slate-500">{job.date_applied}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            job.status === "Offer" ? "bg-amber-500/20 text-amber-400" : job.status === "Interview" ? "bg-emerald-500/20 text-emerald-400" : job.status === "Rejected" ? "bg-slate-600/50 text-slate-400" : "bg-surgicalTeal/20 text-surgicalTeal"
                          }`}>{job.status}</span>
                          {job.link && (
                            <a href={job.link} target="_blank" rel="noopener noreferrer" className="text-xs text-surgicalTeal hover:underline truncate max-w-[180px]">Link</a>
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
              <section className="resume-surface glass-card rounded-2xl border border-white/10 p-6 lg:p-7">
                <header>
                  <h2 className="font-display text-lg text-slate-50">Interview Surgeon</h2>
                  <p className="text-xs text-slate-400 mt-1">Total Interview Prediction — 10 questions (Expert Check, Cultural Fit, Professional Story, Visionary), bespoke STAR scripts, recruiter motive & strategy.</p>
                </header>
                <div className="mt-4 space-y-4">
                  <label className="block text-[11px] uppercase tracking-[0.18em] text-slate-400">Target job description (used to tailor questions)</label>
                  <textarea
                    rows={3}
                    placeholder="Paste the job description so questions target top skills, company values, and role seniority."
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/70 focus:outline-none focus:ring-1 focus:ring-surgicalTeal/60 resize-y"
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
                        if (res.status === 402 && data?.code === "CREDITS_REQUIRED") {
                          setShowRefillModal(true);
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
                        }
                      } catch {
                        setInterviewPrep(null);
                      }
                      setInterviewPrepLoading(false);
                    }}
                    className="btn-glimmer w-full rounded-xl border border-surgicalTeal/70 bg-surgicalTeal/10 px-4 py-3 text-sm font-medium text-surgicalTeal hover:bg-surgicalTeal/20 disabled:opacity-50"
                  >
                    {interviewPrepLoading ? "Generating…" : <>Generate Interview Prep <span className="ml-1 rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] text-slate-400">{getCost("INTERVIEW_PREP")} SU</span></>}
                  </button>
                </div>
              </section>
              {interviewPrep && (
                <>
                  <section className="resume-surface glass-card rounded-2xl border border-white/10 p-6 lg:p-7">
                    <h3 className="font-display text-base text-slate-50 mb-1">Divine 30-Second Intro</h3>
                    <p className="text-[11px] text-slate-500 mb-3">Tell me about yourself — the 100% guaranteed first question. Blends your resume + LinkedIn brand.</p>
                    {canAccessExecutivePdf ? (
                      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                        <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-line">{interviewPrep.elevatorPitch}</p>
                        <button type="button" onClick={() => navigator.clipboard.writeText(interviewPrep.elevatorPitch)} className="mt-2 rounded-lg border border-surgicalTeal/50 bg-surgicalTeal/10 px-2.5 py-1.5 text-[11px] font-medium text-surgicalTeal hover:bg-surgicalTeal/20 inline-flex items-center gap-1"><Copy className="h-3.5 w-3.5" /> Copy</button>
                      </div>
                    ) : (
                      <div className="relative rounded-xl border border-slate-800 bg-slate-950/40 p-4 overflow-hidden">
                        <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-line blur-md select-none">{interviewPrep.elevatorPitch}</p>
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70">
                          <button type="button" onClick={() => { setCheckoutTier("all_access"); setCheckoutStep("divine"); }} className="rounded-xl border border-surgicalTeal/60 bg-surgicalTeal/10 px-4 py-2.5 text-sm font-medium text-surgicalTeal hover:bg-surgicalTeal/20 inline-flex items-center gap-2"><Lock className="h-4 w-4" /> Unlock with Executive Pass</button>
                        </div>
                      </div>
                    )}
                  </section>
                  <section className="resume-surface glass-card rounded-2xl border border-white/10 p-6 lg:p-7">
                    <div className="flex items-center justify-between gap-4 mb-4">
                      <div>
                        <h3 className="font-display text-base text-slate-50 mb-1">Predictive Questions (accordion)</h3>
                        <p className="text-[11px] text-slate-500">Expert Check · Cultural Fit · Professional Story · Visionary. Click to reveal motive, strategy & script.</p>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer shrink-0" title="Hide answers so you can rehearse out loud first">
                        <span className="text-[11px] text-slate-400">Practice mode</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={interviewPracticeMode}
                          onClick={() => setInterviewPracticeMode((v) => !v)}
                          className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors ${interviewPracticeMode ? "border-surgicalTeal/60 bg-surgicalTeal/20" : "border-slate-600 bg-slate-800"}`}
                        >
                          <span className={`pointer-events-none inline-block h-4 w-3.5 rounded-full bg-slate-200 shadow-sm transition-transform mt-0.5 ml-0.5 ${interviewPracticeMode ? "translate-x-4 bg-surgicalTeal" : "translate-x-0"}`} />
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
                          <li key={i} className="rounded-xl border border-slate-800 bg-slate-950/40 overflow-hidden">
                            <button
                              type="button"
                              onClick={() => setInterviewOpenIndex(isOpen ? null : i)}
                              className="w-full text-left p-4 flex items-start justify-between gap-3 hover:bg-slate-900/50 transition-colors"
                            >
                              <div className="min-w-0">
                                <span className="text-[10px] uppercase tracking-wider text-surgicalTeal">{label}</span>
                                <p className="text-sm font-medium text-slate-100 mt-0.5">{q.question}</p>
                              </div>
                              <span className="text-slate-500 shrink-0">{isOpen ? "−" : "+"}</span>
                            </button>
                            {isOpen && (
                              <div className="px-4 pb-4 pt-0 border-t border-slate-800 space-y-4">
                                {interviewPracticeMode ? (
                                  <p className="text-xs text-slate-500 italic py-2">Rehearse out loud, then turn Practice mode off to see the script, motive & strategy.</p>
                                ) : canAccessExecutivePdf ? (
                                  <>
                                    <div>
                                      <p className="text-[10px] uppercase tracking-wider text-amber-500/90 mb-1">What they are actually looking for</p>
                                      <p className="text-xs text-slate-400">{q.motive || q.trap}</p>
                                    </div>
                                    {q.strategy && (
                                      <div>
                                        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">The strategy</p>
                                        <p className="text-xs text-slate-400">{q.strategy}</p>
                                      </div>
                                    )}
                                    <div>
                                      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">The scripted answer (STAR)</p>
                                      <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">{q.winningAnswer}</p>
                                    </div>
                                    <button type="button" onClick={() => navigator.clipboard.writeText(q.winningAnswer)} className="rounded-lg border border-surgicalTeal/50 bg-surgicalTeal/10 px-2.5 py-1.5 text-[11px] font-medium text-surgicalTeal hover:bg-surgicalTeal/20 inline-flex items-center gap-1"><Copy className="h-3.5 w-3.5" /> Copy answer</button>
                                  </>
                                ) : (
                                  <div className="relative py-4 overflow-hidden">
                                    <p className="text-xs text-slate-400 blur-md select-none">{q.motive || q.trap}</p>
                                    <p className="text-xs text-slate-300 blur-md select-none mt-2">{q.winningAnswer}</p>
                                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70">
                                      <button type="button" onClick={() => { setCheckoutTier("all_access"); setCheckoutStep("divine"); }} className="rounded-lg border border-surgicalTeal/60 bg-surgicalTeal/10 px-3 py-2 text-xs font-medium text-surgicalTeal hover:bg-surgicalTeal/20 inline-flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> Executive Pass to unlock</button>
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
                </>
              )}
            </div>
          ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)] items-start">
            {/* Left: Bento-style Operating Table */}
            <section className="space-y-4">
              <motion.div
                layout
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 glass-card px-4 py-3"
              >
                <div>
                  <h2 className="font-display text-lg text-slate-50">Operating Table</h2>
                  <p className="text-xs text-slate-400">Feed in weak bullet points. The AI will perform precise resume surgery.</p>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
                  Gemini · Llama 3 ready
                </div>
              </motion.div>

              <motion.div layout className="bento-card p-4 space-y-3">
                <h3 className="font-medium text-slate-100 uppercase tracking-[0.18em] text-[11px]">
                  Vital Info
                </h3>
                  <div className="space-y-3">
                    <input
                      type="text"
                      placeholder="Full name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/70 focus:outline-none focus:ring-1 focus:ring-surgicalTeal/60"
                    />
                    <input
                      type="text"
                      placeholder="Target role or title (e.g. Senior Product Manager)"
                      value={targetRole}
                      onChange={(e) => setTargetRole(e.target.value)}
                      onBlur={() => setTouchedTitle(true)}
                      className={`w-full rounded-lg border bg-slate-950/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 ${
                        touchedTitle && !targetRole.trim()
                          ? "border-surgicalTeal/70 ring-surgicalTeal/60"
                          : "border-slate-800 focus:border-surgicalTeal/70 focus:ring-surgicalTeal/60"
                      }`}
                    />
                    {powerSkillsSuggestions.length > 0 && (
                      <div className="rounded-lg border border-white/5 bg-slate-900/30 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Power skills you might add</p>
                        <div className="flex flex-wrap gap-1.5">
                          {powerSkillsSuggestions.map((skill, i) => (
                            <motion.button
                              key={i}
                              type="button"
                              whileHover={{ scale: 1.03 }}
                              whileTap={{ scale: 0.97 }}
                              onClick={() => setSkills((s) => (s.trim() ? `${s}, ${skill}` : skill))}
                              className="rounded-md border border-surgicalTeal/30 bg-surgicalTeal/5 px-2 py-1 text-[11px] text-surgicalTeal hover:bg-surgicalTeal/15"
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
                      className={`w-full rounded-lg border bg-slate-950/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 ${
                        touchedEmail && !email.trim()
                          ? "border-surgicalTeal/70 ring-surgicalTeal/60"
                          : "border-slate-800 focus:border-surgicalTeal/70 focus:ring-surgicalTeal/60"
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
                        className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/70 focus:outline-none focus:ring-1 focus:ring-surgicalTeal/60"
                      />
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={handleCheckLink}
                          disabled={linkStatus === "checking" || !profileUrl.trim()}
                          className="text-[10px] text-surgicalTeal hover:underline disabled:opacity-50"
                        >
                          {linkStatus === "checking" ? "Checking…" : "Link Surgeon: Check & clean"}
                        </button>
                        {linkStatus === "valid" && (
                          <span className="text-[10px] text-emerald-400">✓ Valid</span>
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
                            className="text-[10px] text-surgicalTeal hover:underline"
                          >
                            Use clean link: {cleanLinkSuggestion}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>

              <motion.div layout className="bento-card p-4 space-y-2">
                <h3 className="font-medium text-slate-100 uppercase tracking-[0.18em] text-[11px]">Experience</h3>
                <textarea
                  rows={6}
                  placeholder="Paste weaker bullet points here. The Resume Surgeon will convert them into high-impact, results-driven achievements."
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/70 focus:outline-none focus:ring-1 focus:ring-surgicalTeal/60"
                />
              </motion.div>

              <motion.div layout className="bento-card p-4 space-y-2">
                <h3 className="font-medium text-slate-100 uppercase tracking-[0.18em] text-[11px]">Skills</h3>
                <textarea
                  rows={3}
                  placeholder="Key skills, tools, and domains you want emphasized."
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/70 focus:outline-none focus:ring-1 focus:ring-surgicalTeal/60"
                />
              </motion.div>

              <motion.div layout className="bento-card p-4 space-y-2">
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setShowJobDescription((v) => !v)}
                    className="flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-200 hover:border-surgicalTeal/70 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium uppercase tracking-[0.18em] text-[11px]">
                        Target Job Description
                      </span>
                      <span className="text-[10px] text-slate-500">
                        Optional · improves match rate
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-surgicalTeal text-[10px]">
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
                      className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/70 focus:outline-none focus:ring-1 focus:ring-surgicalTeal/60"
                    />
                  )}
                </div>
              </motion.div>

              {status === "sharpening" && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bento-card rounded-xl border border-white/10 px-4 py-3 space-y-2 flex items-start gap-3"
                >
                  <div className="surgical-pulse mt-0.5" aria-hidden />
                  <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-surgicalTeal font-medium">
                    Surgical Progress
                  </p>
                  <ul className="space-y-1.5 text-xs text-slate-300">
                    {[
                      "Generating Executive Summary...",
                      "Injecting Quantifiable Metrics...",
                      "Optimizing for ATS Parsers...",
                      "Final Polishing...",
                    ].map((label, i) => (
                      <li
                        key={i}
                        className={`flex items-center gap-2 ${
                          surgicalStep > i ? "text-surgicalTeal" : "text-slate-500"
                        }`}
                      >
                        {surgicalStep > i ? (
                          <span className="text-surgicalTeal" aria-hidden>✓</span>
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

              <motion.div layout className="bento-card rounded-2xl border border-white/10 p-4 mt-4">
              <div className="flex items-center justify-between">
                <div className="flex flex-col items-start gap-2 text-[11px] text-slate-400">
                  <p>
                    All sharpening is <span className="text-surgicalTeal">free</span> to try.
                    Executive PDFs are unlocked later.
                  </p>
                  {provider && status === "done" && (
                    <p className="text-surgicalTeal/80">
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
                  disabled={status === "sharpening" || !experience.trim()}
                  className="btn-glimmer inline-flex items-center gap-2 rounded-full border border-surgicalTeal/70 bg-surgicalTeal/10 px-4 py-1.5 text-xs font-medium text-surgicalTeal disabled:opacity-50 disabled:cursor-not-allowed"
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
                      <span className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] text-slate-400">{getCost("SHARPEN")} SU</span>
                      <span className="h-1.5 w-1.5 rounded-full bg-surgicalTeal shadow-[0_0_10px_rgba(45,212,191,0.9)]" />
                    </>
                  )}
                </motion.button>
              </div>
              </motion.div>
            </section>

            {/* Right: Executive Preview */}
            <section className="relative space-y-4">
              {/* Surgical Share – live link for recruiters */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-surgicalTeal font-medium">Surgical Share</p>
                <p className="text-xs text-slate-400">Share a public link to your Executive Resume. Recruiters can view, copy email, open LinkedIn, and download PDF (if you have Executive Pass).</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-[11px] text-slate-500">Public Visibility (allow search engines)</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={sharePublicVisibility}
                    onClick={() => setSharePublicVisibility((v) => !v)}
                    className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors ${sharePublicVisibility ? "border-surgicalTeal/60 bg-surgicalTeal/20" : "border-slate-600 bg-slate-800"}`}
                  >
                    <span className={`pointer-events-none inline-block h-4 w-3.5 rounded-full bg-slate-200 shadow-sm transition-transform mt-0.5 ml-0.5 ${sharePublicVisibility ? "translate-x-4 bg-surgicalTeal" : "translate-x-0"}`} />
                  </button>
                </label>
                <p className="text-[10px] text-slate-500">When OFF, the page uses noindex so it won&apos;t appear on Google.</p>
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
                  className="inline-flex items-center gap-2 rounded-lg border border-surgicalTeal/60 bg-surgicalTeal/10 px-3 py-2 text-xs font-medium text-surgicalTeal hover:bg-surgicalTeal/20 disabled:opacity-50"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  {shareLoading ? "Generating…" : "Share My Surgical Profile"}
                </button>
                {!session?.access_token && (
                  <p className="text-[10px] text-amber-500/90">Sign in to generate your share link.</p>
                )}
                {shareUrl && (
                  <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2">
                    <input readOnly value={shareUrl} className="flex-1 min-w-0 bg-transparent text-xs text-slate-300 outline-none" />
                    <button type="button" onClick={() => navigator.clipboard.writeText(shareUrl)} className="shrink-0 rounded p-1.5 text-surgicalTeal hover:bg-surgicalTeal/20" title="Copy"><Copy className="h-3.5 w-3.5" /></button>
                    <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[11px] text-surgicalTeal hover:underline">Open</a>
                  </div>
                )}
              </div>
              <div className="relative">
                <div className="pointer-events-none absolute -inset-6 rounded-[32px] border border-surgicalTeal/10 bg-gradient-to-br from-surgicalTeal/5 via-slate-900 to-slate-950 blur-0" />
              <motion.div
                className="relative"
                whileHover={{ scale: 1.02 }}
                transition={{ type: "spring", stiffness: 300, damping: 24 }}
              >
              <div
                className={`relative resume-paper print-resume-page rounded-2xl border border-slate-200/70 shadow-2xl px-10 py-8 ${
                  theme === "surgeon"
                    ? "theme-surgeon"
                    : theme === "partner"
                    ? "theme-partner"
                    : "theme-innovator"
                }`}
              >
                <div className="mb-4 flex border-b border-slate-200/60 pb-3">
                  <button
                    type="button"
                    onClick={() => setPreviewTab("preview")}
                    className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      previewTab === "preview"
                        ? "bg-slate-900/10 text-slate-800 border border-slate-200"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Executive Preview
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
                    Surgical Simulation
                  </button>
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
                  {!effectivePaid && (
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
                          ? "border-surgicalTeal/70 bg-surgicalTeal/10"
                          : "border-slate-200 bg-white/60"
                      }`}
                    >
                      <span className="h-4 w-6 rounded-sm bg-slate-900/90" />
                      <span>The Surgeon</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (effectivePaid) {
                          setTheme("partner");
                        } else {
                          setShowPaywall(true);
                        }
                      }}
                      className={`flex items-center gap-2 rounded-lg border px-2.5 py-1 ${
                        theme === "partner" && effectivePaid
                          ? "border-surgicalTeal/60 bg-surgicalTeal/5"
                          : "border-slate-200 bg-white/40"
                      }`}
                    >
                      <span className="h-4 w-6 rounded-sm bg-slate-800" />
                      <span>The Partner</span>
                      {!effectivePaid && <Lock className="h-3 w-3 text-slate-500" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (effectivePaid) {
                          setTheme("innovator");
                        } else {
                          setShowPaywall(true);
                        }
                      }}
                      className={`hidden sm:flex items-center gap-2 rounded-lg border px-2.5 py-1 ${
                        theme === "innovator" && effectivePaid
                          ? "border-surgicalTeal/60 bg-surgicalTeal/5"
                          : "border-slate-200 bg-white/40"
                      }`}
                    >
                      <span className="h-4 w-6 rounded-sm bg-slate-300" />
                      <span>The Innovator</span>
                      {!effectivePaid && <Lock className="h-3 w-3 text-slate-500" />}
                    </button>
                  </div>
                </div>

                <div className="mb-5 rounded-xl border border-surgicalTeal/40 bg-surgicalTeal/5 px-4 py-3 resume-body">
                  <div className="flex items-center justify-between gap-4 mb-2">
                    <div>
                      <p className="font-display text-[11px] uppercase resume-section-header text-slate-700">
                        Surgical Report
                      </p>
                      <p className="text-[10px] text-slate-500">
                        Real-time diagnosis of resume health.
                      </p>
                    </div>
                    <div className="text-right space-y-1">
                      <div className="relative">
                        <AnimatePresence>
                          {showSuccessPulse && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              className="success-pulse badge-glow absolute -top-1 -right-1 z-10 rounded-full bg-emerald-500 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white"
                            >
                              Surgical Success
                            </motion.div>
                          )}
                        </AnimatePresence>
                        <p className={`font-display text-xl leading-none transition-transform ${showSuccessPulse ? "text-emerald-600" : "text-slate-900"}`}>
                          {score}%
                        </p>
                        <p className="text-[10px] text-slate-500">Resume strength</p>
                      </div>
                      <div className="text-[10px]">
                        {matchRate == null ? (
                          <p className="text-slate-500">
                            Paste a Job Description to see your match rate.
                          </p>
                        ) : (
                          <p className="text-slate-700">
                            Match rate: <span className="font-semibold">{matchRate}%</span>
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
                        <div key={idx} className="rounded-md bg-slate-900/3 px-2 py-1.5">
                          <p className="font-semibold text-[10px] text-slate-800">
                            {item.title}
                          </p>
                          <p className="text-[10px] text-slate-600">{item.body}</p>
                        </div>
                      ))}
                      {jobDescription.trim() && missingKeywords.length > 0 && (
                        <div className="rounded-md bg-slate-900/3 px-2 py-1.5">
                          <p className="font-semibold text-[10px] text-slate-800">
                            Missing keywords
                          </p>
                          <p className="text-[10px] text-slate-600">
                            {missingKeywords.slice(0, 6).join(", ")}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {/* Bespoke header: centered name + title, surgical contact bar */}
                <div className="text-center pb-5 mb-5 border-b border-slate-200/50">
                  <h1 className="exec-name mb-1">
                    {fullName || "Candidate Name"}
                  </h1>
                  <p className="exec-body text-[10pt] uppercase tracking-[0.12em] text-[#0f172a]/80 mb-4">
                    {targetRole || "Target Role"}
                  </p>
                  <div className="exec-body flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[9pt] text-[#0f172a]/90">
                    <span className={effectivePaid ? "" : "resume-contact-blur"}>(555) 555-1234</span>
                    <span className="exec-contact-dot">•</span>
                    <span className={effectivePaid ? "" : "resume-contact-blur"}>{email || "you@example.com"}</span>
                    <span className="exec-contact-dot">•</span>
                    <span className={effectivePaid ? "" : "resume-contact-blur"}>{profileUrl.trim() || "linkedin.com/in/username"}</span>
                    <span className="exec-contact-dot">•</span>
                    <span className={effectivePaid ? "" : "resume-contact-blur"}>City, Country</span>
                  </div>
                </div>

                <div className={`space-y-5 exec-body ${theme === "innovator" ? "resume-layout" : ""}`}>
                  {/* Section: Professional Experience — grid layout, teal divider */}
                  <div className="resume-section-block space-y-3">
                    <h3 className="exec-section-header">
                      Professional Experience
                    </h3>
                    <div className="exec-divider mb-2" />
                    {experience.trim() || sharpened.length > 0 ? (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-x-4 gap-y-0 items-baseline">
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
                      </>
                    ) : null}
                  </div>

                  <div className="resume-section-block space-y-2">
                    <h4 className="exec-section-header">
                      Surgically Optimized Bullet Points
                    </h4>
                    <div className="exec-divider mb-2" />
                    {!(experience.trim() || sharpened.length) ? (
                      <p className="exec-ghost">Add your experience to see the magic…</p>
                    ) : sharpened ? (
                      <div className="space-y-2">
                        {experience.trim() && compare && (
                          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
                            <p className="font-medium uppercase tracking-[0.18em] mb-1">
                              Before
                            </p>
                            <ul className="resume-bullet-list space-y-1">
                              {experience
                                .split("\n")
                                .filter((line) => line.trim().length > 0)
                                .map((line, idx) => (
                                  <li key={`before-${idx}`} className="flex items-start gap-2">
                                    <span className="exec-bullet-dash" />
                                    <span className="resume-bullet-text">{line}</span>
                                  </li>
                                ))}
                            </ul>
                          </div>
                        )}

                        <motion.div
                          className={`group relative rounded-md border px-3 py-2 overflow-hidden ${
                            compare
                              ? "border-surgicalTeal/70 bg-surgicalTeal/5"
                              : "border-slate-200 bg-white"
                          }`}
                          layout
                          transition={{ type: "spring", stiffness: 250, damping: 26 }}
                        >
                          <p
                            className={`whitespace-pre-line relative z-0 ${
                              compare ? "text-surgicalTeal-foreground text-surgicalTeal" : "text-slate-800"
                            }`}
                          >
                            {displayedSharpened.length < sharpened.length
                              ? displayedSharpened
                              : sharpened}
                            {displayedSharpened.length > 0 && displayedSharpened.length < sharpened.length && (
                              <span className="animate-pulse text-surgicalTeal">|</span>
                            )}
                          </p>
                          <AnimatePresence>
                            {showGlimmer && (
                              <>
                                <motion.div
                                  className="pointer-events-none absolute inset-0 z-10 sharpen-glimmer"
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  transition={{ duration: 0.35 }}
                                />
                                <div className="pointer-events-none absolute inset-0 z-10 sharpen-glimmer-laser" aria-hidden />
                              </>
                            )}
                          </AnimatePresence>
                          <div className="pointer-events-none absolute right-2 top-2 rounded-full bg-slate-900/90 px-2 py-1 text-[9px] text-slate-100 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 z-20">
                            Optimized for ATS &amp; readability
                          </div>
                        </motion.div>
                      </div>
                    ) : (
                      <ul className="resume-bullet-list space-y-1.5 text-[#0f172a]">
                        <li className="flex items-start gap-2">
                          <span className="exec-bullet-dash" />
                          <span className="resume-bullet-text">
                            Transformed vague responsibilities into measurable, outcome-driven
                            achievements using the STAR method.
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="exec-bullet-dash" />
                          <span className="resume-bullet-text">
                            Highlighted scope, tools, and business impact to align with
                            high-compensation roles.
                          </span>
                        </li>
                      </ul>
                    )}
                  </div>

                  <div className="resume-section-block space-y-2">
                    <h3 className="exec-section-header">
                      Education
                    </h3>
                    <div className="exec-divider mb-2" />
                    <p className="exec-ghost">
                      Add your education to see the magic…
                    </p>
                  </div>

                  <div className="resume-section-block space-y-2">
                    <h3 className="exec-section-header">
                      Skills
                    </h3>
                    <div className="exec-divider mb-2" />
                    <p className={!skills?.trim() ? "exec-ghost" : ""}>
                      {skills?.trim() || "Add your skills to see the magic…"}
                    </p>
                  </div>
                </div>
              </div>

              {previewTab === "simulation" && (
                <div className="space-y-4 pt-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-slate-600">
                      Recruiter&apos;s Eye
                    </p>
                    <button
                      type="button"
                      onClick={handleRecruiterEye}
                      disabled={recruiterLoading || (!experience.trim() && !sharpened.trim())}
                      className="inline-flex items-center gap-2 rounded-full border border-surgicalTeal/70 bg-surgicalTeal/10 px-3 py-1.5 text-xs font-medium text-surgicalTeal disabled:opacity-50"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      {recruiterLoading ? "Running simulation…" : <>Run simulation <span className="ml-1 rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] text-slate-400">{getCost("RECRUITER_EYE")} SU</span></>}
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
                    <div className="rounded-xl border border-surgicalTeal/30 bg-surgicalTeal/5 px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-surgicalTeal mb-0.5">
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
                            className={`text-[12px] text-slate-700 space-y-2 ${!effectivePaid ? "select-none blur-md pointer-events-none" : ""}`}
                          >
                            {recruiterQuestions.map((q, i) => (
                              <p key={i} className="flex gap-2">
                                <span className="text-slate-400 font-medium">{i + 1}.</span>
                                {q}
                              </p>
                            ))}
                          </div>
                          {!effectivePaid && (
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
                                className="rounded-full border border-surgicalTeal/70 bg-surgicalTeal/10 px-4 py-2 text-xs font-medium text-surgicalTeal hover:bg-surgicalTeal/15"
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
              )}
              </div>
              </motion.div>
              </div>
            </section>
          </div>
            </motion.div>
          </AnimatePresence>
          )}
        </div>
      </main>

      <AnimatePresence>
        {syncingToast && (
          <motion.div
            className="fixed bottom-6 left-1/2 z-[38] -translate-x-1/2 rounded-full border border-white/10 glass-panel px-4 py-2 text-xs text-slate-300 shadow-lg flex items-center gap-2"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-surgicalTeal animate-pulse" />
            Syncing across documents…
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showPaywall && (
          <motion.div
            className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 backdrop-blur"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full max-w-md rounded-2xl border border-surgicalTeal/40 bg-slate-950 px-6 py-5 shadow-[0_24px_80px_rgba(15,23,42,0.9)]"
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 16, opacity: 0 }}
            >
              <h3 className="font-display text-xl text-slate-50 mb-1">
                {checkoutTier === "all_access" ? "Unlock All-Access Pass" : checkoutTier === "credits" ? "Top up Surgical Credits" : ["refill_minor", "refill_standard", "refill_executive"].includes(checkoutTier ?? "") ? "Surgical Refill" : "Checkout"}
              </h3>

              {checkoutStep === "tier" && (
                <>
                  <p className="text-sm text-slate-300 mb-4">Choose your tier. Then pay securely with Card or M-Pesa.</p>
                  <div className="space-y-2 mb-4 max-h-[280px] overflow-y-auto">
                    {[
                      { id: "single" as const, label: "The Single Surgeon", desc: "1 Resume · Executive PDF · All themes", price: 19 },
                      { id: "career" as const, label: "The Career Surgeon", desc: "Resume + Cover Letter", price: 29 },
                      { id: "closer" as const, label: "The High-Value Closer", desc: "Resume + Cover Letter + Proposal Engine + Lifetime theme access", price: 59 },
                      { id: "business" as const, label: "Business Surgeon", desc: "Everything in Closer + Firm Proposal Engine + Team Management layout", price: 99 },
                    ].map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setCheckoutTier(t.id);
                          setCheckoutStep("method");
                          setPaymentError(null);
                        }}
                        className={`w-full rounded-xl border px-4 py-2.5 text-left transition-colors ${
                          t.id === "business"
                            ? "border-surgicalTeal/50 bg-surgicalTeal/10 hover:border-surgicalTeal/70"
                            : "border-slate-700 bg-slate-900/80 hover:border-surgicalTeal/50"
                        }`}
                      >
                        <span className="font-semibold text-slate-100">{t.label}</span>
                        <span className="block text-xs text-slate-400 mt-0.5">{t.desc}</span>
                        <span className="text-surgicalTeal font-semibold">${t.price}</span>
                      </button>
                    ))}
                  </div>
                  <div className="rounded-xl border border-slate-700/80 bg-slate-800/40 px-3 py-2.5">
                    <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-2 text-center">Surgical Guarantee</p>
                    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 mb-2">
                      <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                        <Shield className="h-3.5 w-3.5 text-surgicalTeal/80" aria-hidden />
                        ATS-Verified Structure
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                        <Check className="h-3.5 w-3.5 text-surgicalTeal/80" aria-hidden />
                        Recruiter-Approved Logic
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                        <Star className="h-3.5 w-3.5 text-surgicalTeal/80" aria-hidden />
                        99.9% Surgical Precision
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 text-center leading-snug">You get services more than worth the payment.</p>
                  </div>
                </>
              )}

              {checkoutStep === "divine" && checkoutTier === "all_access" && (
                <>
                  <div className="mb-3 rounded-xl border border-slate-700/80 bg-slate-800/40 px-3 py-2.5 text-left">
                    <p className="text-xs font-medium text-slate-400 mb-1.5">Included with Executive Pass</p>
                    <ul className="text-xs text-slate-300 space-y-1">
                      <li>Executive PDF, all themes, Cover Letter & Proposal Engine</li>
                      <li>Interview Prep, LinkedIn Surgeon, Match & Tailor</li>
                      <li className="text-surgicalTeal/90">✨ FREE: 1-Click Professional Portfolio Website (Synced with your Resume).</li>
                    </ul>
                  </div>
                  <p className="text-sm text-slate-300 mb-3">Pay {(livePricing?.price ?? 999).toLocaleString()} KES with M-Pesa or use a card. Secure payment via IntaSend.</p>
                  {livePricing?.isEarlyBird && livePricing.slotsRemaining > 0 && (
                    <div className="mb-3 rounded-lg border border-surgicalTeal/40 bg-surgicalTeal/10 px-3 py-2 text-center">
                      <span className="text-xs font-medium text-surgicalTeal">Early Bird Price: Only {livePricing.slotsRemaining} slot{livePricing.slotsRemaining === 1 ? "" : "s"} remaining before price hits {(livePricing.standardPrice ?? 2500).toLocaleString()} KES!</span>
                    </div>
                  )}
                  <div className="flex rounded-xl bg-slate-800/60 p-1 mb-4">
                    <button
                      type="button"
                      onClick={() => { setPaymentTab("mpesa"); setPaymentError(null); }}
                      className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${paymentTab === "mpesa" ? "bg-surgicalTeal/20 text-surgicalTeal" : "text-slate-400 hover:text-slate-200"}`}
                    >
                      Local M-Pesa
                    </button>
                    <button
                      type="button"
                      onClick={() => { setPaymentTab("card"); setPaymentError(null); }}
                      className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${paymentTab === "card" ? "bg-surgicalTeal/20 text-surgicalTeal" : "text-slate-400 hover:text-slate-200"}`}
                    >
                      International Card
                    </button>
                  </div>
                  {paymentTab === "mpesa" && (
                    <>
                      <div className="flex items-center justify-between mb-3 rounded-xl border border-surgicalTeal/30 bg-surgicalTeal/5 px-4 py-3">
                        <span className="text-lg font-bold text-surgicalTeal">M-Pesa</span>
                        <span className="font-semibold text-slate-50">{(livePricing?.price ?? 999).toLocaleString()} KES</span>
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
                          className="w-full rounded-lg border border-slate-700 bg-slate-900/80 pl-12 pr-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/70 focus:outline-none focus:ring-1 focus:ring-surgicalTeal/60"
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
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                method: "MPESA",
                                phone: mpesaPhone.trim(),
                                email: email || undefined,
                                name: fullName || undefined,
                                amount: livePricing?.price ?? 999,
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
                        className="btn-glimmer w-full rounded-xl border border-surgicalTeal/70 bg-surgicalTeal/10 px-4 py-3 text-sm font-medium text-surgicalTeal disabled:opacity-50"
                      >
                        {paymentLoading ? (
                          <span className="flex items-center gap-2">
                            <span className="surgical-pulse" aria-hidden />
                            Requesting PIN…
                          </span>
                        ) : (
                          `Pay ${(livePricing?.price ?? 999).toLocaleString()} KES`
                        )}
                      </button>
                      {paymentLoading && (
                        <p className="mt-2 text-xs text-surgicalTeal/90 text-center">The Surgeon is requesting a PIN… check your phone.</p>
                      )}
                      <div className="mt-4 pt-4 border-t border-slate-700/80">
                        <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-2 text-center">Surgical Guarantee</p>
                        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 mb-2">
                          <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                            <Shield className="h-3.5 w-3.5 text-surgicalTeal/80" aria-hidden />
                            ATS-Verified Structure
                          </span>
                          <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                            <Check className="h-3.5 w-3.5 text-surgicalTeal/80" aria-hidden />
                            Recruiter-Approved Logic
                          </span>
                          <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                            <Star className="h-3.5 w-3.5 text-surgicalTeal/80" aria-hidden />
                            99.9% Surgical Precision
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 text-center leading-snug">You get services more than worth the payment.</p>
                      </div>
                    </>
                  )}
                  {paymentTab === "card" && (
                    <>
                      <div className="flex items-center justify-between mb-3 rounded-xl border border-slate-600 bg-slate-800/40 px-4 py-3">
                        <span className="text-slate-200 font-medium">Card</span>
                        <span className="font-semibold text-slate-50">{(livePricing?.price ?? 999).toLocaleString()} KES</span>
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
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                method: "CARD",
                                email: email || undefined,
                                name: fullName || undefined,
                                amount: livePricing?.price ?? 999,
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
                        className="w-full rounded-xl border border-surgicalTeal/70 bg-surgicalTeal/10 px-4 py-3 text-sm font-medium text-surgicalTeal hover:bg-surgicalTeal/20 disabled:opacity-50"
                      >
                        {paymentLoading ? "Redirecting…" : "Secure Card Checkout"}
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => { setShowPaywall(false); setCheckoutTier(null); setCheckoutStep("tier"); setPaymentError(null); }}
                    className="mt-3 text-xs text-slate-400 hover:text-slate-200"
                  >
                    ← Back
                  </button>
                </>
              )}

              {checkoutStep === "method" && checkoutTier && (
                <>
                  <p className="text-sm text-slate-300 mb-4">Pay with Card or M-Pesa. Secure payment via IntaSend.</p>
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
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              method: "card",
                              tier: checkoutTier,
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
                      className="flex-1 rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-sm font-medium text-slate-100 hover:border-surgicalTeal/50 disabled:opacity-60"
                    >
                      Pay with Card
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCheckoutStep("mpesa-phone");
                        setPaymentError(null);
                      }}
                      className="flex-1 rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-sm font-medium text-slate-100 hover:border-surgicalTeal/50"
                    >
                      Pay with M-Pesa
                    </button>
                  </div>
                  <button type="button" onClick={() => { setCheckoutStep("tier"); setCheckoutTier(null); }} className="text-xs text-slate-400 hover:text-slate-200">
                    ← Back
                  </button>
                </>
              )}

              {checkoutStep === "mpesa-phone" && checkoutTier && (
                <>
                  {(checkoutTier === "all_access" || checkoutTier === "credits" || checkoutTier === "refill_minor" || checkoutTier === "refill_standard" || checkoutTier === "refill_executive") && (
                    <div className="flex items-center justify-between mb-3 rounded-xl border border-surgicalTeal/30 bg-surgicalTeal/5 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-surgicalTeal">M-Pesa</span>
                        <span className="text-xs text-slate-400">via IntaSend</span>
                      </div>
                      <div className="text-right">
                        {checkoutTier === "credits" ? (
                          <span className="font-semibold text-slate-50">499 KES</span>
                        ) : checkoutTier === "refill_minor" ? (
                          <span className="font-semibold text-slate-50">299 KES · 5 SUs</span>
                        ) : checkoutTier === "refill_standard" ? (
                          <span className="font-semibold text-slate-50">999 KES · 30 SUs</span>
                        ) : checkoutTier === "refill_executive" ? (
                          <span className="font-semibold text-slate-50">2,499 KES · 100 SUs</span>
                        ) : (
                          <>
                            <span className="font-semibold text-slate-50">{(livePricing?.price ?? 999).toLocaleString()} KES</span>
                            <span className="ml-2 text-sm text-slate-500 line-through">{(livePricing?.standardPrice ?? 2500).toLocaleString()} KES</span>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                  <p className="text-sm text-slate-300 mb-3">
                    {checkoutTier === "all_access"
                      ? "Enter your M-Pesa number. We'll add 254 if you start with 0 or 7."
                      : checkoutTier === "credits"
                        ? "Enter your M-Pesa number. You'll receive 30 Surgical Credits after payment."
                        : checkoutTier === "refill_minor" || checkoutTier === "refill_standard" || checkoutTier === "refill_executive"
                          ? "Enter your M-Pesa number. Your Surgical Units will be restocked after payment."
                          : "Enter your M-Pesa phone number. You'll get a PIN prompt on your phone."}
                  </p>
                  <div className="relative mb-3">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">+254</span>
                    <input
                      type="tel"
                      placeholder="712 345 678"
                      value={mpesaPhone.startsWith("254") ? mpesaPhone.slice(3).replace(/\s/g, "") : mpesaPhone}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, "");
                        if (!raw) {
                          setMpesaPhone("");
                          return;
                        }
                        if (raw.startsWith("254")) setMpesaPhone(raw.slice(0, 12));
                        else if (raw.startsWith("0")) setMpesaPhone("254" + raw.slice(1, 10));
                        else setMpesaPhone("254" + raw.slice(0, 9));
                      }}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900/80 pl-12 pr-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/70 focus:outline-none focus:ring-1 focus:ring-surgicalTeal/60"
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
                        if (checkoutTier === "all_access") setPaymentRedirectToBuilder(true);
                        try {
                          const res = await fetch("/api/payment/initiate", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              method: "mpesa",
                              tier: checkoutTier,
                              email: email || undefined,
                              name: fullName || undefined,
                              phone: mpesaPhone.trim(),
                              userId: subscriptionUser?.id ?? undefined,
                            }),
                          });
                          const data = await res.json();
                          if (!res.ok) throw new Error(data.error || "STK Push failed");
                          setPendingTxId(data.transactionId);
                          setCheckoutStep("pending");
                        } catch (e) {
                          setPaymentError(e instanceof Error ? e.message : "STK Push failed");
                          if (checkoutTier === "all_access") setPaymentRedirectToBuilder(false);
                        }
                        setPaymentLoading(false);
                      }}
                      className="btn-glimmer rounded-xl border border-surgicalTeal/70 bg-surgicalTeal/10 px-4 py-2 text-sm font-medium text-surgicalTeal disabled:opacity-50"
                    >
                      {paymentLoading ? (
                        <span className="flex items-center gap-2">
                          <span className="surgical-pulse" aria-hidden />
                          {checkoutTier === "all_access" ? "Requesting PIN…" : "Sending…"}
                        </span>
                      ) : (
                        "Pay Now"
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (checkoutTier === "all_access") {
                          setShowPaywall(false);
                          setCheckoutTier(null);
                          setCheckoutStep("tier");
                        } else {
                          setCheckoutStep("method");
                        }
                        setPaymentError(null);
                      }}
                      className="text-sm text-slate-400 hover:text-slate-200"
                    >
                      Back
                    </button>
                  </div>
                  {paymentLoading && checkoutTier === "all_access" && (
                    <p className="mt-2 text-xs text-surgicalTeal/90">
                      The Surgeon is requesting a PIN… check your phone.
                    </p>
                  )}
                  <div className="mt-4 pt-4 border-t border-slate-700/80">
                    <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-2 text-center">Surgical Guarantee</p>
                    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 mb-2">
                      <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                        <Shield className="h-3.5 w-3.5 text-surgicalTeal/80" aria-hidden />
                        ATS-Verified Structure
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                        <Check className="h-3.5 w-3.5 text-surgicalTeal/80" aria-hidden />
                        Recruiter-Approved Logic
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                        <Star className="h-3.5 w-3.5 text-surgicalTeal/80" aria-hidden />
                        99.9% Surgical Precision
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 text-center leading-snug">You get services more than worth the payment.</p>
                  </div>
                </>
              )}

              {checkoutStep === "pending" && (
                <>
                  <p className="text-sm text-slate-300 mb-4">
                    The Surgeon is requesting a PIN… check your phone. We&apos;ll unlock your features as soon as payment is confirmed.
                  </p>
                  <div className="flex items-center gap-2 text-surgicalTeal mb-4">
                    <span className="surgical-pulse" aria-hidden />
                    <span className="text-xs font-medium">Waiting for payment…</span>
                  </div>
                  {paymentMethod === "mpesa" && mpesaPhone && (
                    <button
                      type="button"
                      disabled={paymentLoading}
                      onClick={async () => {
                        setPaymentLoading(true);
                        setPaymentError(null);
                        try {
                          if (checkoutTier) {
                            const res = await fetch("/api/payment/initiate", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                method: "mpesa",
                                tier: checkoutTier,
                                email: email || undefined,
                                name: fullName || undefined,
                                phone: mpesaPhone.trim(),
                                userId: subscriptionUser?.id ?? undefined,
                              }),
                            });
                            const data = await res.json();
                            if (!res.ok) throw new Error(data.error || "STK Push failed");
                            setPendingTxId(data.transactionId);
                          } else {
                            const res = await fetch("/api/checkout", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                method: "MPESA",
                                phone: mpesaPhone.trim(),
                                email: email || undefined,
                                name: fullName || undefined,
                                amount: livePricing?.price ?? 999,
                                userId: subscriptionUser?.id ?? undefined,
                              }),
                            });
                            const data = await res.json();
                            if (!res.ok) throw new Error(data.error || "STK Push failed");
                            setPendingTxId(data.transactionId ?? data.invoice_id);
                          }
                        } catch (e) {
                          setPaymentError(e instanceof Error ? e.message : "Retry failed");
                        }
                        setPaymentLoading(false);
                      }}
                      className="rounded-lg border border-slate-600 bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700/60 disabled:opacity-50"
                    >
                      {paymentLoading ? "Requesting…" : "Retry M-Pesa (same number)"}
                    </button>
                  )}
                </>
              )}

              <div className="flex items-center justify-between gap-4 pt-2 border-t border-slate-800">
                <button type="button" onClick={() => { setShowPaywall(false); setCheckoutStep("tier"); setCheckoutTier(null); setPaymentMethod(null); setPaymentError(null); setPendingTxId(null); setPaymentRedirectToBuilder(false); }} className="text-xs text-slate-400 hover:text-slate-200">
                  Maybe later
                </button>
                {effectivePaid && (
                  <button
                    type="button"
                    onClick={() => { if (handlePrint) handlePrint(); }}
                    className="inline-flex items-center gap-2 rounded-full border border-surgicalTeal/80 bg-surgicalTeal/10 px-4 py-1.5 text-xs font-medium text-surgicalTeal hover:bg-surgicalTeal/20"
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
            <div className="absolute inset-0 bg-surgicalTeal/20 animate-pulse" aria-hidden />
            <motion.div
              className="relative rounded-2xl border border-surgicalTeal/60 bg-slate-900/95 px-8 py-6 text-center shadow-[0_0_60px_rgba(45,212,191,0.3)]"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", damping: 20 }}
            >
              <p className="font-display text-xl font-semibold text-surgicalTeal">Surgery complete</p>
              <p className="mt-1 text-sm text-slate-300">Redirecting to Builder…</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showSuccessToast && (
          <motion.div
            className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-full border border-emerald-400/70 bg-slate-900/95 px-4 py-2 text-xs text-slate-50 shadow-lg"
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
            onClick={() => setShowRefillModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="rounded-2xl border border-white/10 bg-slate-900 shadow-2xl max-w-md w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="rounded-full w-12 h-12 mx-auto mb-4 flex items-center justify-center bg-surgicalTeal/20 text-surgicalTeal">
                <Coins className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-slate-100 mb-1 text-center">Surgical Refill</h3>
              <p className="text-slate-400 text-sm mb-5 text-center">
                Your Surgical Supplies are low. Top up to continue the operation.
              </p>
              <div className="space-y-2 mb-5">
                {(["refill_minor", "refill_standard", "refill_executive"] as const).map((tierId) => {
                  const t = REFILL_TIERS[tierId];
                  const isBest = tierId === "refill_standard";
                  return (
                    <button
                      key={tierId}
                      type="button"
                      onClick={() => {
                        setShowRefillModal(false);
                        setShowPaywall(true);
                        setCheckoutTier(tierId);
                        setCheckoutStep("method");
                      }}
                      className={`w-full rounded-xl border px-4 py-3 text-left flex items-center justify-between transition-colors ${
                        isBest ? "border-surgicalTeal/50 bg-surgicalTeal/10 hover:border-surgicalTeal/70" : "border-slate-700 bg-slate-800/60 hover:border-surgicalTeal/50"
                      }`}
                    >
                      <span className="text-sm font-medium text-slate-100">{t.label}{isBest ? " · Best Value" : ""}</span>
                      <span className="text-surgicalTeal font-semibold">{t.amount.toLocaleString()} KES</span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setShowRefillModal(false)}
                className="w-full py-2 rounded-lg border border-slate-600 text-slate-400 hover:bg-slate-800 text-sm"
              >
                Later
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showSuppliesRestockedToast && (
          <motion.div
            className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-surgicalTeal/60 bg-slate-900/95 px-5 py-2.5 text-sm text-surgicalTeal shadow-lg flex items-center gap-2"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
          >
            <Coins className="h-4 w-4" />
            Supplies Restocked
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Page() {
  return <OperatingTable />;
}

