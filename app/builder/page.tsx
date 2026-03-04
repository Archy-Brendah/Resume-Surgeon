"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { ArrowLeft, Coins, Download, FileText, Lock, Activity, Sparkles } from "lucide-react";
import { getCost } from "@/lib/su-costs";
import { useSubscription } from "@/hooks/useSubscription";

type ResumeHealthData = {
  fullName: string;
  targetRole: string;
  email: string;
  profileUrl: string;
  experience: string;
  skills: string;
  sharpened: string;
};

type VitalStatus = "good" | "warning" | "bad";

export type AuditResult = {
  score: number;
  vitals: {
    contactInfo: { status: VitalStatus; label: string };
    impactMetrics: { status: VitalStatus; label: string };
    actionVerbs: { status: VitalStatus; label: string };
  };
  doctorsNote: string;
};

const ACTION_VERBS = [
  "managed", "developed", "increased", "led", "implemented", "delivered", "drove",
  "built", "created", "launched", "improved", "reduced", "achieved", "established",
  "designed", "executed", "optimized", "scaled", "transformed", "spearheaded",
  "oversaw", "coordinated", "streamlined", "negotiated", "mentored",
];

function analyzeResumeHealth(data: ResumeHealthData): AuditResult {
  const body = [
    data.fullName,
    data.targetRole,
    data.experience,
    data.skills,
    data.sharpened,
  ].filter(Boolean).join(" ");
  const wordCount = body.trim() ? body.split(/\s+/).length : 0;
  const bullets = (data.sharpened || data.experience)
    .split(/\n/)
    .map((l) => l.replace(/^[\s•\-*]+\s*/, "").trim())
    .filter(Boolean);

  const hasEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((data.email || "").trim());
  const hasName = (data.fullName || "").trim().length > 0;
  const contactOk = hasEmail && hasName;

  const actionVerbCount = bullets.filter((line) => {
    const first = (line.split(/\s+/)[0] || "").toLowerCase().replace(/[^a-z]/g, "");
    return ACTION_VERBS.some((v) => first === v || first.startsWith(v));
  }).length;
  const actionVerbRatio = bullets.length > 0 ? actionVerbCount / bullets.length : 0;

  const quantifiableRegex = /[%$+]|\d+/;
  const quantifiableCount = bullets.filter((line) => quantifiableRegex.test(line)).length;
  const quantifiableRatio = bullets.length > 0 ? quantifiableCount / bullets.length : 0;

  let wordScore = 25;
  if (wordCount < 200) wordScore = Math.max(0, 25 * (wordCount / 200));
  else if (wordCount > 600) wordScore = Math.max(0, 25 * (600 / wordCount));

  const contactScore = contactOk ? 25 : 0;
  const actionScore = Math.round(25 * actionVerbRatio);
  const quantScore = Math.round(25 * Math.min(1, quantifiableRatio * 2));

  const score = Math.min(100, Math.round(wordScore + contactScore + actionScore + quantScore));

  const contactStatus: VitalStatus = contactOk ? "good" : "bad";
  const contactLabel = contactOk ? "Detected" : "Missing";

  const impactStatus: VitalStatus = quantifiableCount >= 2 ? "good" : quantifiableCount >= 1 ? "warning" : "bad";
  const impactLabel = quantifiableCount >= 2 ? `Found ${quantifiableCount}` : "Needs More";

  const verbsStatus: VitalStatus = actionVerbRatio >= 0.6 ? "good" : actionVerbRatio >= 0.3 ? "warning" : "bad";
  const verbsLabel = actionVerbRatio >= 0.6 ? "Strong" : actionVerbRatio >= 0.3 ? "Improving" : "Weak";

  const notes: string[] = [];
  if (!contactOk) notes.push("Add your name and a valid email so recruiters can reach you.");
  if (wordCount > 0 && wordCount < 200) notes.push("Resume is too short. Add more experience and skills.");
  if (wordCount > 600) notes.push("Resume is too long. Trim to the most impactful 400–600 words.");
  if (verbsStatus !== "good" && bullets.length > 0) {
    notes.push("Your Experience section could sound more authoritative. Use \"Sharpen\" to inject stronger action verbs.");
  }
  if (impactStatus !== "good" && bullets.length > 0) {
    notes.push("Add numbers: percentages, dollar amounts, or time saved to show impact.");
  }
  const doctorsNote = notes.length > 0
    ? notes[0]
    : "Doctor's Note: Looking strong. Keep bullets concise and impact-focused.";

  return {
    score,
    vitals: {
      contactInfo: { status: contactStatus, label: contactLabel },
      impactMetrics: { status: impactStatus, label: impactLabel },
      actionVerbs: { status: verbsStatus, label: verbsLabel },
    },
    doctorsNote: notes.length > 0 ? `Doctor's Note: ${notes[0]}` : "Doctor's Note: Your resume passes the 6-second scan. Keep it sharp.",
  };
}

function getPowerSkillsSuggestions(role: string): string[] {
  const r = (role || "").toLowerCase();
  const map: { pattern: RegExp; skills: string[] }[] = [
    { pattern: /product|pm|manager/, skills: ["Stakeholder Management", "Roadmap Prioritization", "Cross-functional Leadership"] },
    { pattern: /engineer|developer|software/, skills: ["System Design", "Performance Optimization", "Code Review"] },
    { pattern: /design|ux|ui/, skills: ["User Research", "Design Systems", "Prototyping"] },
    { pattern: /data|analyst|science/, skills: ["Data Modeling", "SQL", "Visualization"] },
    { pattern: /executive|ceo|vp|director/, skills: ["Strategic Planning", "Board Reporting", "P&L Ownership"] },
  ];
  for (const { pattern, skills } of map) {
    if (pattern.test(r)) return skills;
  }
  return ["Leadership", "Problem Solving", "Communication"];
}

export default function BuilderPage() {
  const router = useRouter();
  const { isPaid, canAccessExecutivePdf, aiCredits, session, refetchProfile } = useSubscription();
  const [builderTab, setBuilderTab] = useState<"input" | "preview">("input");
  const [showRefillModal, setShowRefillModal] = useState(false);

  const [fullName, setFullName] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [email, setEmail] = useState("");
  const [profileUrl, setProfileUrl] = useState("");
  const [experience, setExperience] = useState("");
  const [skills, setSkills] = useState("");
  const [sharpened, setSharpened] = useState("");
  const [status, setStatus] = useState<"idle" | "sharpening" | "done" | "error">("idle");
  const [glimmerOnSection, setGlimmerOnSection] = useState(false);
  const [rescanTrigger, setRescanTrigger] = useState(0);
  const [jobDescription, setJobDescription] = useState("");
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchResult, setMatchResult] = useState<{
    matchPercentage: number;
    skillAlignment: number;
    roleExperience: number;
    toneCulture: number;
    gapReport: {
      criticalGaps: string[];
      optimizationGaps: string[];
      bonusMatches: string[];
    };
    foundKeywords: string[];
    missingKeywords: string[];
    surgicalAdjustments: string[];
  } | null>(null);
  const [tailorLoading, setTailorLoading] = useState(false);
  const [humanizeAI, setHumanizeAI] = useState(false);
  const experiencePreviewRef = useRef<HTMLDivElement>(null);

  const powerSkillsSuggestions = targetRole.trim() ? getPowerSkillsSuggestions(targetRole) : [];
  const canDownload = canAccessExecutivePdf || isPaid;

  const audit = useMemo(
    () =>
      analyzeResumeHealth({
        fullName,
        targetRole,
        email,
        profileUrl,
        experience,
        skills,
        sharpened,
      }),
    [fullName, targetRole, email, profileUrl, experience, skills, sharpened]
  );

  const authHeaders = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  const handleSharpen = useCallback(async () => {
    if (!experience.trim()) return;
    setStatus("sharpening");
    setGlimmerOnSection(true);
    try {
      const res = await fetch("/api/sharpen", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ text: experience, jobDescription: "", humanize: humanizeAI }),
      });
      const data = (await res.json()) as { result?: string; code?: string };
      if (res.status === 402 && data?.code === "CREDITS_REQUIRED") {
        setShowRefillModal(true);
        setStatus("idle");
        return;
      }
      if (!res.ok) throw new Error("Sharpen failed");
      if (data.result) setSharpened(data.result.trim());
      setStatus("done");
      setRescanTrigger((t) => t + 1);
      if (typeof (data as { creditsRemaining?: number }).creditsRemaining === "number") {
        refetchProfile();
      }
    } catch {
      setStatus("error");
    } finally {
      setTimeout(() => setGlimmerOnSection(false), 1200);
    }
  }, [experience, humanizeAI, authHeaders, refetchProfile]);

  const handleDivineUnlock = useCallback(() => {
    router.push("/?openCheckout=1");
  }, [router]);

  const handleAnalyzeMatch = useCallback(async () => {
    const jd = jobDescription.trim();
    if (!jd) return;
    const resumeText = [fullName, targetRole, experience, sharpened, skills].filter(Boolean).join("\n");
    setMatchLoading(true);
    setMatchResult(null);
    try {
      const res = await fetch("/api/match-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ resumeText, jobDescription: jd, humanize: humanizeAI }),
      });
      const data = await res.json();
      if (res.status === 402 && data?.code === "CREDITS_REQUIRED") {
        setShowRefillModal(true);
        return;
      }
      if (!res.ok) throw new Error("Match failed");
      const gap = data.gapReport ?? {};
      setMatchResult({
        matchPercentage: data.matchPercentage ?? 0,
        skillAlignment: Math.min(100, Math.max(0, data.skillAlignment ?? data.matchPercentage ?? 0)),
        roleExperience: Math.min(100, Math.max(0, data.roleExperience ?? data.matchPercentage ?? 0)),
        toneCulture: Math.min(100, Math.max(0, data.toneCulture ?? data.matchPercentage ?? 0)),
        gapReport: {
          criticalGaps: Array.isArray(gap.criticalGaps) ? gap.criticalGaps : [],
          optimizationGaps: Array.isArray(gap.optimizationGaps) ? gap.optimizationGaps : [],
          bonusMatches: Array.isArray(gap.bonusMatches) ? gap.bonusMatches : [],
        },
        foundKeywords: data.foundKeywords ?? [],
        missingKeywords: data.missingKeywords ?? [],
        surgicalAdjustments: data.surgicalAdjustments ?? [],
      });
      if (typeof data.creditsRemaining === "number") refetchProfile();
    } catch {
      setMatchResult(null);
    } finally {
      setMatchLoading(false);
    }
  }, [jobDescription, fullName, targetRole, experience, sharpened, skills, authHeaders, refetchProfile]);

  useEffect(() => {
    if (matchResult && matchResult.matchPercentage >= 90) {
      try {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        confetti({ particleCount: 60, angle: 60, spread: 55, origin: { x: 0 } });
        confetti({ particleCount: 60, angle: 120, spread: 55, origin: { x: 1 } });
      } catch (_) {}
    }
  }, [matchResult?.matchPercentage]);

  const handleTailorResume = useCallback(async () => {
    const jd = jobDescription.trim();
    const resumeText = [fullName, targetRole, experience, sharpened, skills].filter(Boolean).join("\n");
    if (!jd || !resumeText || !canDownload) return;
    setTailorLoading(true);
    try {
      const res = await fetch("/api/tailor-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          resumeText,
          jobDescription: jd,
          missingKeywords: matchResult?.missingKeywords ?? [],
          humanize: humanizeAI,
        }),
      });
      const data = await res.json();
      if (res.status === 402 && data?.code === "CREDITS_REQUIRED") {
        setShowRefillModal(true);
        return;
      }
      if (!res.ok) throw new Error("Tailor failed");
      const bullets = data.tailoredBullets ?? [];
      const existing = (sharpened || experience).split("\n").filter((l) => l.trim());
      const merged = [...bullets, ...existing.slice(bullets.length)].filter(Boolean).join("\n");
      if (merged) setSharpened(merged);
      setRescanTrigger((t) => t + 1);
      if (typeof data.creditsRemaining === "number") refetchProfile();
    } catch {
      // silent fail or toast
    } finally {
      setTailorLoading(false);
    }
  }, [jobDescription, fullName, targetRole, experience, sharpened, skills, canDownload, matchResult?.missingKeywords, authHeaders, refetchProfile]);

  return (
    <div className="min-h-screen app-bg text-slate-100 flex flex-col">
      <header className="glass-panel border-b border-white/10 sticky top-0 z-30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-200 text-sm transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Clinic
            </Link>
            {session && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-xs text-slate-300" title="Surgical Units remaining">
                <Coins className="h-3.5 w-3.5 text-surgicalTeal" />
                <span className="font-medium text-slate-100">{aiCredits}</span>
                <span className="hidden sm:inline">SUs</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="relative">
              <button
                type="button"
                onClick={() => canDownload && router.push("/")}
                disabled={!canDownload}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                  canDownload
                    ? "border-surgicalTeal/70 bg-surgicalTeal/10 text-surgicalTeal hover:bg-surgicalTeal/20"
                    : "border-slate-700 text-slate-500 cursor-not-allowed blur-[2px] select-none"
                }`}
                title={canDownload ? "Download PDF (from Clinic)" : "Unlock to download"}
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Download PDF</span>
              </button>
              {!canDownload && (
                <button
                  type="button"
                  onClick={handleDivineUnlock}
                  className="absolute inset-0 flex items-center justify-center rounded-full border border-surgicalTeal/70 bg-surgicalTeal/15 text-surgicalTeal text-xs font-medium hover:bg-surgicalTeal/25"
                >
                  Divine Unlock
                </button>
              )}
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => canDownload && router.push("/")}
                disabled={!canDownload}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
                  canDownload
                    ? "border-surgicalTeal/70 bg-surgicalTeal/10 text-surgicalTeal hover:bg-surgicalTeal/20"
                    : "border-slate-700 text-slate-500 cursor-not-allowed blur-[2px] select-none"
                }`}
                title={canDownload ? "Export Proposal (from Clinic)" : "Unlock to export"}
              >
                <FileText className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Export Proposal</span>
              </button>
              {!canDownload && (
                <button
                  type="button"
                  onClick={handleDivineUnlock}
                  className="absolute inset-0 flex items-center justify-center rounded-full border border-surgicalTeal/70 bg-surgicalTeal/15 text-surgicalTeal text-xs font-medium hover:bg-surgicalTeal/25"
                >
                  Divine Unlock
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        {/* Mobile: tabbed view */}
        <div className="lg:hidden border-b border-slate-800 bg-slate-900/40 px-4 py-2 flex gap-2">
          <button
            type="button"
            onClick={() => setBuilderTab("input")}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              builderTab === "input" ? "bg-surgicalTeal/20 text-surgicalTeal" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Input
          </button>
          <button
            type="button"
            onClick={() => setBuilderTab("preview")}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              builderTab === "preview" ? "bg-surgicalTeal/20 text-surgicalTeal" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Preview
          </button>
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 h-full">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] items-stretch h-[calc(100vh-8rem)] lg:h-[calc(100vh-6rem)] min-h-[480px]">
            {/* Left: Input panel — Bento sections */}
            <section
              className={`flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 ${
                builderTab !== "input" ? "hidden lg:flex" : ""
              }`}
            >
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                <div className="bento-card p-4 rounded-xl space-y-3">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-surgicalTeal">Vitals</h2>
                  <input
                    type="text"
                    placeholder="Full name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/70 focus:outline-none focus:ring-1 focus:ring-surgicalTeal/60"
                  />
                  <input
                    type="text"
                    placeholder="Target role (e.g. Senior Product Manager)"
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/70 focus:outline-none focus:ring-1 focus:ring-surgicalTeal/60"
                  />
                  <input
                    type="email"
                    placeholder="Professional email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/70 focus:outline-none focus:ring-1 focus:ring-surgicalTeal/60"
                  />
                  <input
                    type="url"
                    placeholder="LinkedIn or portfolio URL"
                    value={profileUrl}
                    onChange={(e) => setProfileUrl(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/70 focus:outline-none focus:ring-1 focus:ring-surgicalTeal/60"
                  />
                  {powerSkillsSuggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {powerSkillsSuggestions.map((skill, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setSkills((s) => (s.trim() ? `${s}, ${skill}` : skill))}
                          className="rounded-md border border-surgicalTeal/30 bg-surgicalTeal/5 px-2 py-1 text-[11px] text-surgicalTeal hover:bg-surgicalTeal/15"
                        >
                          + {skill}
                        </button>
                      ))}
                    </div>
                  )}
                  <label className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800 mt-2 cursor-pointer" title="Humanize AI output to reduce detection by AI content detectors">
                    <span className="text-[11px] text-slate-400">Humanize (Anti-AI)</span>
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
                </div>

                {/* Target Job — Surgical Matcher */}
                <div className="bento-card p-4 rounded-xl space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-surgicalTeal flex items-center gap-1.5">
                      Target Job
                      {matchLoading && <Activity className="h-3.5 w-3.5 text-surgicalTeal animate-pulse" aria-hidden />}
                    </h2>
                    {matchLoading && (
                      <span className="flex items-center gap-1.5 text-[10px] text-surgicalTeal" aria-live="polite">
                        <span className="surgical-pulse" aria-hidden />
                        Analyzing…
                      </span>
                    )}
                  </div>
                  <textarea
                    rows={4}
                    placeholder="Paste the job description you're applying for. We'll compare it to your resume."
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/70 focus:outline-none focus:ring-1 focus:ring-surgicalTeal/60 resize-y min-h-[90px]"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <motion.button
                      type="button"
                      onClick={handleAnalyzeMatch}
                      disabled={matchLoading || !jobDescription.trim()}
                      className="inline-flex items-center gap-1.5 rounded-full border border-surgicalTeal/70 bg-surgicalTeal/10 px-3 py-1.5 text-[11px] font-medium text-surgicalTeal disabled:opacity-50"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {matchLoading ? (
                        <>
                          <span className="surgical-pulse" aria-hidden />
                          Analyzing…
                        </>
                      ) : (
                        <>Analyze match <span className="ml-1 rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] text-slate-400">{getCost("MATCH")} SU</span></>
                      )}
                    </motion.button>
                    {matchResult && (
                      <span className="text-[10px] text-slate-500">
                        Match: {matchResult.matchPercentage}%
                      </span>
                    )}
                  </div>
                </div>

                <div className="bento-card p-4 rounded-xl space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-surgicalTeal">Experience</h2>
                    <motion.button
                      type="button"
                      onClick={handleSharpen}
                      disabled={status === "sharpening" || !experience.trim()}
                      className="inline-flex items-center gap-1.5 rounded-full border border-surgicalTeal/70 bg-surgicalTeal/10 px-2.5 py-1 text-[11px] font-medium text-surgicalTeal disabled:opacity-50"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Sparkles className="h-3 w-3" />
                      Sharpen with AI
                      <span className="ml-1 rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] text-slate-400">{getCost("SHARPEN")} SU</span>
                    </motion.button>
                  </div>
                  <textarea
                    rows={6}
                    placeholder="Paste bullet points here. Use Sharpen with AI to optimize."
                    value={experience}
                    onChange={(e) => setExperience(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/70 focus:outline-none focus:ring-1 focus:ring-surgicalTeal/60 resize-y min-h-[120px]"
                  />
                  {status === "sharpening" && (
                    <p className="text-[10px] text-surgicalTeal flex items-center gap-2">
                      <span className="surgical-pulse" aria-hidden /> Performing surgery…
                    </p>
                  )}
                </div>

                <div className="bento-card p-4 rounded-xl space-y-2">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-surgicalTeal">Skills</h2>
                  <textarea
                    rows={3}
                    placeholder="Key skills, tools, and domains."
                    value={skills}
                    onChange={(e) => setSkills(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/70 focus:outline-none focus:ring-1 focus:ring-surgicalTeal/60 resize-y min-h-[80px]"
                  />
                </div>
              </div>
            </section>

            {/* Right: Sticky live preview — Surgical Report + Executive template */}
            <section
              className={`flex flex-col overflow-hidden rounded-2xl border border-slate-700/50 ${
                builderTab !== "preview" ? "hidden lg:flex" : ""
              }`}
            >
              <div className="flex-1 overflow-y-auto p-4 lg:p-6 flex flex-col items-stretch gap-4">
                {/* Surgical Report — Recruiter's 6-Second Audit */}
                <motion.div
                  key={rescanTrigger}
                  initial={rescanTrigger > 0 ? { opacity: 0.7, scale: 0.98 } : false}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4 }}
                  className="audit-card rounded-xl border border-surgicalTeal/30 bg-slate-900/60 backdrop-blur-sm p-4"
                >
                  <p className="text-[10px] uppercase tracking-[0.2em] text-surgicalTeal font-medium mb-3">
                    Recruiter&apos;s 6-Second Audit
                  </p>
                  <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                    <div className="flex items-center gap-3">
                      <div className="relative h-14 w-14 flex-shrink-0">
                        <svg className="h-14 w-14 -rotate-90" viewBox="0 0 36 36" aria-hidden>
                          <path
                            className="text-slate-700"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            fill="none"
                            d="M18 2.5 a 15.5 15.5 0 0 1 0 31 a 15.5 15.5 0 0 1 0 -31"
                          />
                          <motion.path
                            className="text-surgicalTeal"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            fill="none"
                            strokeDasharray="97.4"
                            initial={{ strokeDashoffset: 97.4 - (97.4 * audit.score) / 100 }}
                            animate={{ strokeDashoffset: 97.4 - (97.4 * audit.score) / 100 }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                            d="M18 2.5 a 15.5 15.5 0 0 1 0 31 a 15.5 15.5 0 0 1 0 -31"
                          />
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-100 tabular-nums">
                          {audit.score}%
                        </span>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-200">Recruiter Impact Score</p>
                        <p className="text-[10px] text-slate-500">Based on length, verbs &amp; metrics</p>
                      </div>
                    </div>
                    {/* Match Rate badge — ATS Scanner */}
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-400">Match Rate</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                          matchResult
                            ? matchResult.matchPercentage >= 70
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-amber-500/20 text-amber-400"
                            : "bg-slate-700/80 text-slate-500"
                        }`}>
                          {matchResult != null ? `${matchResult.matchPercentage}%` : "—"}
                        </span>
                      </div>
                      {matchResult != null && matchResult.matchPercentage < 70 && (
                        <p className="text-[10px] text-amber-400/90 max-w-[200px]">
                          ⚠️ Low ATS compatibility. Tailor your resume to avoid rejection.
                        </p>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className={audit.vitals.contactInfo.status === "good" ? "text-emerald-400" : "text-slate-500"}>✅</span>
                        <span className="text-slate-400">Contact Info:</span>
                        <span className={audit.vitals.contactInfo.status === "good" ? "text-emerald-300" : "text-amber-400"}>
                          {audit.vitals.contactInfo.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className={
                          audit.vitals.impactMetrics.status === "good" ? "text-emerald-400" :
                          audit.vitals.impactMetrics.status === "warning" ? "text-amber-400" : "text-slate-500"
                        }>⚠️</span>
                        <span className="text-slate-400">Impact Metrics:</span>
                        <span className={
                          audit.vitals.impactMetrics.status === "good" ? "text-emerald-300" :
                          audit.vitals.impactMetrics.status === "warning" ? "text-amber-300" : "text-rose-400"
                        }>
                          {audit.vitals.impactMetrics.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className={
                          audit.vitals.actionVerbs.status === "good" ? "text-emerald-400" :
                          audit.vitals.actionVerbs.status === "warning" ? "text-amber-400" : "text-slate-500"
                        }>❌</span>
                        <span className="text-slate-400">Action Verbs:</span>
                        <span className={
                          audit.vitals.actionVerbs.status === "good" ? "text-emerald-300" :
                          audit.vitals.actionVerbs.status === "warning" ? "text-amber-300" : "text-rose-400"
                        }>
                          {audit.vitals.actionVerbs.label}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-700/80">
                    <p className="text-[11px] text-slate-400 leading-snug">
                      {audit.doctorsNote}
                    </p>
                  </div>
                </motion.div>

                {/* Surgical Matcher — Keywords & Adjustments (keywords free; Tailor locked) */}
                {matchResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4 space-y-3"
                  >
                    {/* Match Breakdown — 3 bars */}
                    <div className="space-y-2">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-surgicalTeal font-medium">
                        Match Breakdown
                      </p>
                      <div className="space-y-2">
                        {[
                          { label: "Skill Alignment", value: matchResult.skillAlignment ?? matchResult.matchPercentage },
                          { label: "Role Experience", value: matchResult.roleExperience ?? matchResult.matchPercentage },
                          { label: "Tone & Culture", value: matchResult.toneCulture ?? matchResult.matchPercentage },
                        ].map(({ label, value }) => (
                          <div key={label} className="flex items-center gap-2">
                            <span className="w-28 text-[10px] text-slate-400 shrink-0">{label}</span>
                            <div className="flex-1 h-2 rounded-full bg-slate-700/80 overflow-hidden">
                              <motion.div
                                className="h-full rounded-full bg-surgicalTeal"
                                initial={{ width: 0 }}
                                animate={{ width: `${value}%` }}
                                transition={{ duration: 0.6, ease: "easeOut" }}
                              />
                            </div>
                            <span className="w-8 text-right text-[10px] text-slate-300 tabular-nums">{value}%</span>
                          </div>
                        ))}
                      </div>
                      {((matchResult.skillAlignment ?? 0) >= 90 && (matchResult.roleExperience ?? 0) >= 90 && (matchResult.toneCulture ?? 0) >= 90) && (
                        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/50 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-medium text-emerald-400">
                          <span aria-hidden>✓</span>
                          Surgical Seal of Approval
                        </div>
                      )}
                    </div>
                    {/* Strategic Gap Report */}
                    {matchResult.gapReport && (matchResult.gapReport.criticalGaps?.length > 0 || matchResult.gapReport.optimizationGaps?.length > 0 || matchResult.gapReport.bonusMatches?.length > 0) && (
                      <div className="space-y-2 pt-2 border-t border-slate-700/50">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-medium">Strategic Gap Report</p>
                        {matchResult.gapReport.criticalGaps?.length > 0 && (
                          <div>
                            <p className="text-[10px] text-rose-400/90 mb-1">Critical Gaps (must fix for ATS)</p>
                            <ul className="space-y-0.5 text-[11px] text-slate-400">
                              {matchResult.gapReport.criticalGaps.map((g, i) => (
                                <li key={i} className="flex gap-2"><span className="text-rose-400 shrink-0">•</span><span>{g}</span></li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {matchResult.gapReport.optimizationGaps?.length > 0 && (
                          <div>
                            <p className="text-[10px] text-amber-400/90 mb-1">Optimization Gaps (top 10% candidate)</p>
                            <ul className="space-y-0.5 text-[11px] text-slate-400">
                              {matchResult.gapReport.optimizationGaps.map((g, i) => (
                                <li key={i} className="flex gap-2"><span className="text-amber-400 shrink-0">•</span><span>{g}</span></li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {matchResult.gapReport.bonusMatches?.length > 0 && (
                          <div>
                            <p className="text-[10px] text-emerald-400/90 mb-1">Bonus Matches</p>
                            <ul className="space-y-0.5 text-[11px] text-slate-400">
                              {matchResult.gapReport.bonusMatches.map((g, i) => (
                                <li key={i} className="flex gap-2"><span className="text-emerald-400 shrink-0">•</span><span>{g}</span></li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                    <p className="text-[10px] uppercase tracking-[0.2em] text-surgicalTeal font-medium">
                      Critical Keywords
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(matchResult.foundKeywords ?? []).slice(0, 12).map((kw, i) => (
                        <span key={`f-${i}`} className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300">
                          ✅ {kw}
                        </span>
                      ))}
                      {(matchResult.missingKeywords ?? []).slice(0, 12).map((kw, i) => (
                        <span key={`m-${i}`} className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 px-2 py-0.5 text-[10px] text-rose-300">
                          ❌ {kw}
                        </span>
                      ))}
                    </div>
                    {(matchResult.surgicalAdjustments?.length ?? 0) > 0 && (
                      <div className="space-y-1.5 pt-1 border-t border-slate-700/50">
                        <p className="text-[10px] uppercase tracking-[0.15em] text-slate-500">Surgical Adjustments</p>
                        <ul className="space-y-1 text-[11px] text-slate-400">
                          {(matchResult.surgicalAdjustments ?? []).map((adj, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="text-surgicalTeal shrink-0">•</span>
                              <span>{adj}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="pt-2">
                      {canDownload ? (
                        <motion.button
                          type="button"
                          onClick={handleTailorResume}
                          disabled={tailorLoading}
                          className="inline-flex items-center gap-1.5 rounded-full border border-surgicalTeal/70 bg-surgicalTeal/10 px-3 py-1.5 text-[11px] font-medium text-surgicalTeal hover:bg-surgicalTeal/20 disabled:opacity-50"
                        >
                          {tailorLoading ? (
                            <><span className="surgical-pulse" aria-hidden /> Tailoring…</>
                          ) : (
                            <><Sparkles className="h-3 w-3" /> Tailor Resume to this Job <span className="ml-1 rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] text-slate-400">{getCost("TAILOR")} SU</span></>
                          )}
                        </motion.button>
                      ) : (
                        <div className="relative inline-block">
                          <button
                            type="button"
                            disabled
                            className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-[11px] text-slate-500 blur-[1px] select-none"
                          >
                            <Sparkles className="h-3 w-3" />
                            Tailor Resume to this Job
                          </button>
                          <button
                            type="button"
                            onClick={handleDivineUnlock}
                            className="absolute inset-0 flex items-center justify-center gap-1.5 rounded-full border border-surgicalTeal/70 bg-surgicalTeal/15 text-surgicalTeal text-[11px] font-medium hover:bg-surgicalTeal/25"
                          >
                            <Lock className="h-3 w-3" />
                            Executive Pass
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                <motion.div
                  className="w-full max-w-[21cm] exec-template-paper rounded-2xl border border-slate-200/80 shadow-2xl px-8 sm:px-10 py-8"
                  layout
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                >
                  {!isPaid && !canAccessExecutivePdf && (
                    <div className="exec-template-watermark-bottom">Optimized by Resume Surgeon</div>
                  )}

                  <div className="text-center pb-4 mb-5 border-b border-slate-200/60">
                    <h1 className="exec-name mb-1">{fullName || "Your Name"}</h1>
                    <p className="exec-body text-[10pt] uppercase tracking-[0.12em] text-[#0f172a]/80">
                      {targetRole || "Target Role"}
                    </p>
                    <div className="exec-body flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[9pt] text-[#0f172a]/90 mt-3">
                      <span>Phone</span>
                      <span className="exec-contact-dot">•</span>
                      <span>{email || "you@example.com"}</span>
                      <span className="exec-contact-dot">•</span>
                      <span>{profileUrl || "linkedin.com/in/username"}</span>
                      <span className="exec-contact-dot">•</span>
                      <span>Location</span>
                    </div>
                  </div>

                  <div className="space-y-5 exec-body">
                    <div className="resume-section-block space-y-2 relative" ref={experiencePreviewRef}>
                      <h3 className="exec-section-header">Professional Experience</h3>
                      <div className="exec-divider mb-2" />
                      <AnimatePresence>
                        {glimmerOnSection && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.25 }}
                            className="pointer-events-none absolute inset-0 z-10 sharpen-glimmer-laser rounded overflow-hidden"
                            aria-hidden
                          />
                        )}
                      </AnimatePresence>
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-x-4 gap-y-0 items-baseline">
                        <div>
                          <p className="font-semibold text-[#0f172a]">{targetRole || "Role Title"}</p>
                          <p className="text-[9pt] text-[#0f172a]/75">Company Name</p>
                        </div>
                        <div className="text-right text-[9pt] text-[#0f172a]/75">
                          2020 – Present · Location
                        </div>
                      </div>
                      <ul className="resume-bullet-list space-y-1.5 text-[#0f172a] mt-2">
                        {(sharpened || experience)
                          .split("\n")
                          .filter((line) => line.trim())
                          .slice(0, 6)
                          .map((line, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="exec-bullet-dash" />
                              <span className="resume-bullet-text">{line}</span>
                            </li>
                          ))}
                        {!experience.trim() && !sharpened && (
                          <li className="exec-ghost">Add your experience and tap Sharpen with AI…</li>
                        )}
                      </ul>
                    </div>

                    <div className="resume-section-block space-y-2">
                      <h3 className="exec-section-header">Skills</h3>
                      <div className="exec-divider mb-2" />
                      <p className={!skills.trim() ? "exec-ghost" : ""}>
                        {skills.trim() || "Add your skills to see the magic…"}
                      </p>
                    </div>
                  </div>
                </motion.div>
              </div>
            </section>
          </div>
        </div>
      </main>

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
              className="rounded-2xl border border-white/10 bg-slate-900 shadow-2xl max-w-md w-full p-6 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="rounded-full w-12 h-12 mx-auto mb-4 flex items-center justify-center bg-surgicalTeal/20 text-surgicalTeal">
                <Coins className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-slate-100 mb-2">Surgical Refill</h3>
              <p className="text-slate-400 text-sm mb-6">
                Your Surgical Supplies are low. Top up to continue the operation.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  type="button"
                  onClick={() => setShowRefillModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-600 text-slate-400 hover:bg-slate-800 text-sm"
                >
                  Later
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowRefillModal(false);
                    router.push("/?refill=1");
                  }}
                  className="px-5 py-2 rounded-lg bg-surgicalTeal text-slate-900 font-medium hover:bg-surgicalTeal/90 text-sm"
                >
                  Choose a refill pack
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
