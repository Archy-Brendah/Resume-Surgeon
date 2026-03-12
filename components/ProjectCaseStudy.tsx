"use client";

import type { ReactNode } from "react";

/** Bold percentages and currency in text for quick scan. */
function boldMetricsInText(text: string): ReactNode {
  if (!text || typeof text !== "string") return text;
  const regex = /(\d+(?:\.\d+)?%|Ksh\s*[\d,]+(?:\.\d+)?[KM]?|USD\s*[\d,]+(?:\.\d+)?[KM]?|\$[\d,]+(?:\.\d+)?[KM]?|\d{1,3}(?:,\d{3})+(?:\.\d+)?(?:\s*\+?)?(?:\s*applicants?|\s*users?)?)/gi;
  const parts = text.split(regex);
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}

export type ProjectCaseStudyProps = {
  /** Project title (from past_projects). */
  title: string;
  /** Client name. */
  client: string;
  /** Year delivered. */
  year: string;
  /** Optional value (e.g. contract value, scope summary). */
  value?: string;
  /** Solution & impact: AI-rewritten or original description; metrics will be bolded. */
  solutionAndImpact: string;
  /** Optional anchor id for in-page links. */
  caseStudyId?: string;
  /** Show loading state while AI is rewriting. */
  enhancing?: boolean;
};

export function ProjectCaseStudy({
  title,
  client,
  year,
  value,
  solutionAndImpact,
  caseStudyId,
  enhancing = false,
}: ProjectCaseStudyProps) {
  const raw = (solutionAndImpact || "").trim();
  const sentences = raw.split(/(?<=[.?!])\s+/).filter(Boolean);
  const challenge = sentences[0] ?? "";
  const middleSentences = sentences.slice(1, Math.max(1, sentences.length - 1));
  const lastSentence = sentences.length > 1 ? sentences[sentences.length - 1] : "";

  const metricsRegex =
    /(\d+(?:\.\d+)?%|Ksh\s*[\d,]+(?:\.\d+)?[KM]?|USD\s*[\d,]+(?:\.\d+)?[KM]?|\$[\d,]+(?:\.\d+)?[KM]?|\d{1,3}(?:,\d{3})+(?:\.\d+)?)/;

  // Prefer a sentence with metrics for Impact; fall back to last sentence, and ensure it is not identical to Challenge.
  let impactCandidate =
    (sentences.find((s, idx) => idx > 0 && metricsRegex.test(s)) ?? lastSentence ?? "").trim();
  if (impactCandidate && challenge && impactCandidate === challenge && sentences.length > 1) {
    impactCandidate = lastSentence && lastSentence !== challenge ? lastSentence.trim() : "";
  }

  const remainingForSolution = middleSentences.length > 0 ? middleSentences.join(" ") : lastSentence || "";
  const solutionBullets =
    remainingForSolution && remainingForSolution.includes("•")
      ? remainingForSolution
          .split(/•/g)
          .map((s) => s.trim())
          .filter(Boolean)
      : remainingForSolution
      ? [remainingForSolution]
      : challenge
      ? [challenge]
      : [];

  return (
    <div
      id={caseStudyId}
      className="rounded-lg border border-slate-200 border-l-4 border-l-emerald-600 bg-white p-4 scroll-mt-4"
    >
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h4 className="text-[11pt] font-semibold text-slate-900">
          {title}
        </h4>
        <span
          className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white"
          style={{ backgroundColor: "#F59E0B" }}
        >
          Case Study
        </span>
        {enhancing && (
          <span className="text-xs font-normal text-slate-500 italic">Rewriting for tender…</span>
        )}
      </div>
      <div className="grid gap-4 text-[10pt] md:grid-cols-2">
        <div className="space-y-2 text-slate-700">
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Client</dt>
            <dd className="mt-0.5 text-slate-800">{client || "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Year</dt>
            <dd className="mt-0.5 text-slate-800">{year || "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Value</dt>
            <dd className="mt-0.5 text-slate-800">{value ?? "—"}</dd>
          </div>
        </div>
        <div className="space-y-2">
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5 block">
              The Challenge (Situation)
            </dt>
            <dd className="mt-0.5 text-slate-700 leading-relaxed">
              {challenge ? challenge : "Context: addressing key tender requirements for this client."}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5 block">
              The Solution (Action)
            </dt>
            <dd className="mt-0.5 text-slate-700 leading-relaxed">
              {solutionBullets.length > 0 ? (
                <ul className="list-none space-y-0.5">
                  {solutionBullets.map((b, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-slate-400 shrink-0">•</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                "Solution details captured in project narrative."
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5 block">
              The Impact (Result)
            </dt>
            <dd className="mt-0.5 text-slate-700 leading-relaxed">
              {impactCandidate
                ? boldMetricsInText(impactCandidate)
                : boldMetricsInText(solutionAndImpact)}
            </dd>
          </div>
        </div>
      </div>
    </div>
  );
}
