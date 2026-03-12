"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { MilestoneSuggestion } from "@/app/api/pricing-milestones/route";
import { getCost } from "@/lib/su-costs";

export type PricingTableRow = {
  id: string;
  task: string;
  timeline: string;
  costKsh: string;
};

type InteractivePricingTableProps = {
  items: PricingTableRow[];
  onChange: (items: PricingTableRow[]) => void;
  jobDescription: string;
  session: { access_token: string } | null;
  isBetaTester?: boolean;
  aiCredits?: number;
  onRefillRequest?: () => void;
  onCreditsRefetch?: () => void;
};

function parseKsh(value: string): number {
  const n = parseFloat(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function formatKsh(value: number): string {
  return value.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function InteractivePricingTable({
  items,
  onChange,
  jobDescription,
  session,
  isBetaTester = false,
  aiCredits = 0,
  onRefillRequest,
  onCreditsRefetch,
}: InteractivePricingTableProps) {
  const [autoSuggestLoading, setAutoSuggestLoading] = useState(false);

  const addRow = () => {
    onChange([
      ...items,
      { id: String(Date.now()), task: "", timeline: "", costKsh: "" },
    ]);
  };

  const updateRow = (id: string, field: keyof PricingTableRow, value: string) => {
    onChange(
      items.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  const removeRow = (id: string) => {
    if (items.length > 1) {
      onChange(items.filter((r) => r.id !== id));
    }
  };

  const grandTotal = items.reduce((sum, r) => sum + parseKsh(r.costKsh), 0);

  const handleAutoSuggest = async () => {
    if (!session) return;
    const cost = getCost("PRICING_MILESTONES");
    if (!isBetaTester && aiCredits < cost) {
      onRefillRequest?.();
      return;
    }
    if (!jobDescription.trim()) return;
    setAutoSuggestLoading(true);
    try {
      const res = await fetch("/api/pricing-milestones", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ jobDescription: jobDescription.trim() }),
      });
      const data = (await res.json()) as { milestones?: MilestoneSuggestion[]; error?: string };
      if (res.status === 402) {
        onRefillRequest?.();
        return;
      }
      if (!res.ok) throw new Error(data?.error || "Failed");
      const milestones = data.milestones ?? [];
      const newRows: PricingTableRow[] = milestones.map((m) => ({
        id: String(Date.now() + Math.random()),
        task: m.task,
        timeline: m.timeline,
        costKsh: m.costKsh,
      }));
      onChange(newRows.length > 0 ? newRows : items);
      onCreditsRefetch?.();
    } catch {
      // Silent fail or could add error state
    } finally {
      setAutoSuggestLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <label className="block text-[11px] uppercase tracking-[0.18em] text-slate-400">
          Pricing table (Task / Timeline / Cost Ksh)
        </label>
        <button
          type="button"
          onClick={handleAutoSuggest}
          disabled={autoSuggestLoading || !session || (!isBetaTester && aiCredits < getCost("PRICING_MILESTONES")) || !jobDescription.trim()}
          className="rounded-lg border border-surgicalTeal/60 bg-surgicalTeal/10 px-2.5 py-1.5 text-[11px] font-medium text-neonGreen hover:bg-surgicalTeal/20 disabled:opacity-50"
        >
          {autoSuggestLoading ? "Suggesting…" : "Auto-Suggest"}
        </button>
      </div>
      <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/40 p-2">
        {items.map((row) => (
          <div key={row.id} className="grid grid-cols-[1fr_1fr_minmax(80px,1fr)_auto] gap-2 items-center">
            <input
              type="text"
              placeholder="Task / Milestone"
              value={row.task}
              onChange={(e) => updateRow(row.id, "task", e.target.value)}
              className="min-w-0 rounded border border-slate-700 bg-slate-900/60 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/60 focus:outline-none"
            />
            <input
              type="text"
              placeholder="Timeline (e.g. 2 weeks)"
              value={row.timeline}
              onChange={(e) => updateRow(row.id, "timeline", e.target.value)}
              className="min-w-0 rounded border border-slate-700 bg-slate-900/60 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/60 focus:outline-none"
            />
            <input
              type="text"
              placeholder="Cost (Ksh)"
              value={row.costKsh}
              onChange={(e) => updateRow(row.id, "costKsh", e.target.value)}
              className="rounded border border-slate-700 bg-slate-900/60 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-surgicalTeal/60 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => removeRow(row.id)}
              disabled={items.length <= 1}
              className="p-1.5 text-slate-400 hover:text-red-400 rounded disabled:opacity-40"
              aria-label="Remove row"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-1.5 w-full rounded border border-dashed border-amber-400/60 bg-amber-50/50 py-1.5 text-xs text-amber-700 hover:border-amber-500/70 hover:bg-amber-100/80"
        >
          <Plus className="h-3.5 w-3.5" />
          Add row
        </button>
      </div>
      {items.some((r) => r.task || r.timeline || r.costKsh) && (
        <p className="text-[11px] text-slate-400">
          Grand Total: <span className="font-medium text-slate-300">{formatKsh(grandTotal)} Ksh</span>
        </p>
      )}
    </div>
  );
}
