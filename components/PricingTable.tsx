"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { getCost } from "@/lib/su-costs";

export type PricingMilestone = {
  id: string;
  task: string;
  timeline: string;
  cost: number;
};

type PricingTableProps = {
  milestones: PricingMilestone[];
  onChange: (milestones: PricingMilestone[]) => void;
  jobDescription?: string;
  session?: { access_token: string } | null;
  isBetaTester?: boolean;
  aiCredits?: number;
  onRefillRequest?: () => void;
  onCreditsRefetch?: () => void;
  /** "USD" for international tone (dollars), "KSH" for Kenya (default) */
  currency?: "USD" | "KSH";
};

function formatCost(value: number, currency: "USD" | "KSH"): string {
  const opts = { minimumFractionDigits: 0, maximumFractionDigits: 0 };
  return currency === "USD"
    ? value.toLocaleString("en-US", opts)
    : value.toLocaleString("en-KE", opts);
}

export function PricingTable({
  milestones,
  onChange,
  jobDescription = "",
  session = null,
  isBetaTester = false,
  aiCredits = 0,
  onRefillRequest,
  onCreditsRefetch,
  currency = "KSH",
}: PricingTableProps) {
  const isUsd = currency === "USD";
  const costSymbol = isUsd ? "$" : "Ksh";
  const costLabel = isUsd ? "Cost ($)" : "Cost (Ksh)";
  const [suggestLoading, setSuggestLoading] = useState(false);
  const cost = getCost("PRICING_MILESTONES");
  const insufficientSu = !isBetaTester && aiCredits < cost;

  const handleAutoSuggest = async () => {
    const jd = jobDescription.trim();
    if (!jd || !session) return;
    if (insufficientSu) {
      onRefillRequest?.();
      return;
    }
    setSuggestLoading(true);
    try {
      const res = await fetch("/api/pricing-milestones", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ jobDescription: jd }),
      });
      const data = (await res.json()) as { milestones?: { task: string; timeline: string; cost_estimate?: number; costKsh?: string }[] };
      if (res.status === 402) {
        onRefillRequest?.();
        return;
      }
      if (res.ok && Array.isArray(data.milestones)) {
        onChange(
          data.milestones.map((m) => ({
            id: String(Date.now() + Math.random()),
            task: m.task,
            timeline: m.timeline,
            cost: typeof m.cost_estimate === "number" ? m.cost_estimate : parseFloat(String(m.costKsh || "0").replace(/[^0-9.-]/g, "")) || 0,
          }))
        );
        onCreditsRefetch?.();
      }
    } finally {
      setSuggestLoading(false);
    }
  };

  const addRow = () => {
    onChange([
      ...milestones,
      { id: String(Date.now()), task: "", timeline: "", cost: 0 },
    ]);
  };

  const updateRow = (id: string, field: keyof PricingMilestone, value: string | number) => {
    onChange(
      milestones.map((r) =>
        r.id === id
          ? { ...r, [field]: field === "cost" ? (typeof value === "number" ? value : parseFloat(String(value).replace(/[^0-9.-]/g, "")) || 0) : value }
          : r
      )
    );
  };

  const removeRow = (id: string) => {
    if (milestones.length > 1) {
      onChange(milestones.filter((r) => r.id !== id));
    }
  };

  const total = milestones.reduce((sum, r) => sum + (Number.isFinite(r.cost) ? r.cost : 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <label className="block text-[11px] uppercase tracking-[0.18em] text-slate-400">
          Pricing table (Task / Timeline / Cost)
        </label>
        {jobDescription.trim() && (
          <button
            type="button"
            onClick={handleAutoSuggest}
            disabled={suggestLoading || !session || insufficientSu}
            className="rounded-lg border border-amber-400/60 bg-amber-50/50 px-2.5 py-1.5 text-[11px] font-medium text-amber-700 hover:bg-amber-100/80 disabled:opacity-50"
          >
            {suggestLoading ? "Suggesting…" : "✨ Auto-Suggest Milestones"}
          </button>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200/80 bg-white/70 shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80">
              <th className="px-3 py-2.5 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-600">Task / Milestone</th>
              <th className="px-3 py-2.5 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-600 w-28">Timeline</th>
              <th className="px-3 py-2.5 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-600 w-32">{costLabel}</th>
              <th className="px-3 py-2.5 w-10" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {milestones.map((row) => (
              <tr key={row.id} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2">
                  <input
                    type="text"
                    placeholder="Task / Milestone"
                    value={row.task}
                    onChange={(e) => updateRow(row.id, "task", e.target.value)}
                    className="w-full min-w-0 rounded border border-slate-200 bg-white/80 px-2 py-1.5 text-xs text-slate-900 placeholder:text-slate-500 focus:border-emerald-500/60 focus:outline-none"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    placeholder="e.g. 2 weeks"
                    value={row.timeline}
                    onChange={(e) => updateRow(row.id, "timeline", e.target.value)}
                    className="w-full min-w-0 rounded border border-slate-200 bg-white/80 px-2 py-1.5 text-xs text-slate-900 placeholder:text-slate-500 focus:border-emerald-500/60 focus:outline-none"
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-600 shrink-0">{isUsd ? "$" : "Ksh"}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={row.cost === 0 ? "" : row.cost}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9.-]/g, "");
                        updateRow(row.id, "cost", v === "" ? 0 : parseFloat(v) || 0);
                      }}
                      className="w-full min-w-0 rounded border border-slate-200 bg-white/80 px-2 py-1.5 text-xs text-slate-900 placeholder:text-slate-500 focus:border-emerald-500/60 focus:outline-none"
                    />
                  </div>
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    disabled={milestones.length <= 1}
                    className="p-1.5 text-slate-600 hover:text-red-500 rounded disabled:opacity-40"
                    aria-label="Remove row"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50/80">
              <td className="px-3 py-2.5 text-xs font-semibold text-slate-700" colSpan={2}>
                Total
              </td>
              <td className="px-3 py-2.5 text-xs font-semibold text-slate-900">
                {isUsd ? "$" : "Ksh "}{formatCost(total, currency)}
              </td>
              <td className="px-3 py-2.5" />
            </tr>
          </tfoot>
        </table>
      </div>
      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-1.5 w-full rounded border border-dashed border-amber-400/60 bg-amber-50/50 py-1.5 text-xs text-amber-700 hover:border-amber-500/70 hover:bg-amber-100/80"
      >
        <Plus className="h-3.5 w-3.5" />
        Add row
      </button>
    </div>
  );
}
