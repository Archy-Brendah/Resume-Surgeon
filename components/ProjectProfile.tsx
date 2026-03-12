"use client";

import type { ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";

/** Bold percentages and currency in text for quick scan. */
function boldMetricsInText(text: string): ReactNode {
  if (!text || typeof text !== "string") return text;
  const regex = /(\d+(?:\.\d+)?%|Ksh\s*[\d,]+(?:\.\d+)?[KM]?|USD\s*[\d,]+(?:\.\d+)?[KM]?|\$[\d,]+(?:\.\d+)?[KM]?|\d{1,3}(?:,\d{3})+(?:\.\d+)?(?:\s*\+?)?(?:\s*applicants?|\s*users?)?)/gi;
  const parts = text.split(regex);
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}

export type ProjectProfileProps = {
  /** Project title (from DB). */
  title: string;
  /** Client name (from DB). */
  client: string;
  /** Year (from DB). */
  year: string;
  /** Original results/description from DB; or AI-enhanced description. */
  results: string;
  /** Tender requirements this project addresses (for "Addresses requirements" line). */
  requirementsAddressed: string[];
  /** Optional: anchor id for Evidence Reference links from the matrix. */
  profileId?: string;
  /** Optional: show loading state for AI enhancement. */
  enhancing?: boolean;
};

export function ProjectProfile({
  title,
  client,
  year,
  results,
  requirementsAddressed,
  profileId,
  enhancing = false,
}: ProjectProfileProps) {
  return (
    <div
      id={profileId}
      className="rounded-lg border border-slate-200 border-l-4 border-l-emerald-600 bg-slate-50 p-4 scroll-mt-4"
    >
      <div className="flex items-start gap-2 mb-3">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 mt-0.5" aria-hidden />
        <h4 className="text-[11pt] font-semibold text-slate-800">
          Relevant Experience: {title}
          {enhancing && (
            <span className="ml-2 text-xs font-normal text-slate-500 italic">Enhancing for tender…</span>
          )}
        </h4>
      </div>
      <dl className="grid gap-2 text-[10pt] text-slate-700 md:grid-cols-2">
        <div>
          <dt className="block font-medium text-slate-600">Project &amp; Client</dt>
          <dd className="mt-0.5 text-slate-700">
            {title} · {client} ({year})
          </dd>
        </div>
        <div>
          <dt className="block font-medium text-slate-600">Scope &amp; Key Deliverables</dt>
          <dd className="mt-0.5 text-slate-700">{boldMetricsInText(results)}</dd>
        </div>
        {requirementsAddressed.length > 0 && (
          <div className="md:col-span-2">
            <dt className="block font-medium text-slate-600">Addresses requirements</dt>
            <dd className="mt-0.5 text-slate-700">{requirementsAddressed.join("; ")}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
