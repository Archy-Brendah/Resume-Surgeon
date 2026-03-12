"use client";

import { useCallback, useState } from "react";

export type MandatoryDoc = {
  doc_name: string;
  status: boolean;
  expiry_date: string | null;
};

const DEFAULT_DOCS: MandatoryDoc[] = [
  { doc_name: "Certificate of Incorporation", status: false, expiry_date: null },
  { doc_name: "Valid KRA Tax Compliance Certificate", status: false, expiry_date: null },
  { doc_name: "CR12 (not older than 6 months)", status: false, expiry_date: null },
  { doc_name: "Valid Business Permit (County Government)", status: false, expiry_date: null },
  { doc_name: "Access to Government Procurement Opportunities (AGPO) Certificate (Optional)", status: false, expiry_date: null },
];

type DocumentChecklistProps = {
  value: MandatoryDoc[];
  onChange: (docs: MandatoryDoc[]) => void;
};

export function mergeMandatoryDocsWithDefaults(defaults: MandatoryDoc[], saved: MandatoryDoc[] | null | undefined): MandatoryDoc[] {
  if (!saved?.length) return defaults;
  const defaultNames = new Set(defaults.map((d) => d.doc_name));
  const byName = new Map(saved.map((d) => [d.doc_name, d]));

  const mergedDefaults = defaults.map((d) => {
    const found = byName.get(d.doc_name);
    if (found) {
      return {
        doc_name: d.doc_name,
        status: Boolean(found.status),
        expiry_date: typeof found.expiry_date === "string" ? found.expiry_date : null,
      };
    }
    return d;
  });

  const extraSaved = saved
    .filter((d) => d.doc_name && !defaultNames.has(d.doc_name))
    .map((d) => ({
      doc_name: d.doc_name,
      status: Boolean(d.status),
      expiry_date: typeof d.expiry_date === "string" ? d.expiry_date : null,
    }));

  return [...mergedDefaults, ...extraSaved];
}

export function DocumentChecklist({ value, onChange }: DocumentChecklistProps) {
  const docs = value.length > 0 ? value : DEFAULT_DOCS;
  const [newDocName, setNewDocName] = useState("");

  const updateDoc = useCallback(
    (index: number, updates: Partial<MandatoryDoc>) => {
      const next = docs.map((d, i) => (i === index ? { ...d, ...updates } : d));
      onChange(next);
    },
    [docs, onChange]
  );

  const handleCheck = useCallback(
    (index: number, checked: boolean) => {
      updateDoc(index, { status: checked, expiry_date: checked ? docs[index].expiry_date : null });
    },
    [docs, updateDoc]
  );

  const handleExpiryChange = useCallback(
    (index: number, dateStr: string) => {
      updateDoc(index, { expiry_date: dateStr || null });
    },
    [updateDoc]
  );

  const handleAddDoc = useCallback(() => {
    const name = newDocName.trim();
    if (!name) return;
    const exists = docs.some((d) => d.doc_name.toLowerCase() === name.toLowerCase());
    if (exists) {
      setNewDocName("");
      return;
    }
    const next: MandatoryDoc[] = [...docs, { doc_name: name, status: false, expiry_date: null }];
    onChange(next);
    setNewDocName("");
  }, [docs, newDocName, onChange]);

  const handleRemoveDoc = useCallback(
    (index: number) => {
      const doc = docs[index];
      const isDefault = DEFAULT_DOCS.some((d) => d.doc_name === doc.doc_name);
      if (isDefault) return;
      const next = docs.filter((_, i) => i !== index);
      onChange(next);
    },
    [docs, onChange]
  );

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Track mandatory documents for Kenyan tender compliance. Check when obtained and add expiry dates where applicable.
      </p>
      <ul className="space-y-4 list-none pl-0">
        {docs.map((doc, idx) => (
          <li
            key={doc.doc_name}
            className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg surgical-card p-4"
          >
            <label className="flex items-start gap-3 cursor-pointer flex-1">
              <input
                type="checkbox"
                checked={doc.status}
                onChange={(e) => handleCheck(idx, e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-400 bg-white text-emerald-500 focus:ring-emerald-500/50 focus:ring-offset-0"
              />
              <span className={`text-sm ${doc.status ? "text-[#020617]" : "text-[#475569]"}`}>
                {doc.doc_name}
              </span>
            </label>
            {doc.status && (
              <div className="flex items-center gap-2 sm:pl-4">
                <label htmlFor={`expiry-${idx}`} className="text-[10px] uppercase tracking-wider text-slate-500 shrink-0">
                  Expiry
                </label>
                <input
                  id={`expiry-${idx}`}
                  type="date"
                  value={doc.expiry_date ?? ""}
                  onChange={(e) => handleExpiryChange(idx, e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                />
              </div>
            )}
            {!DEFAULT_DOCS.some((d) => d.doc_name === doc.doc_name) && (
              <button
                type="button"
                onClick={() => handleRemoveDoc(idx)}
                className="self-start rounded-md border border-slate-300 bg-white/70 px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-red-50 hover:text-red-600"
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="flex gap-2 pt-2 border-t border-slate-800/60">
        <input
          type="text"
          placeholder="Add another mandatory document"
          value={newDocName}
          onChange={(e) => setNewDocName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddDoc())}
          className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
        />
        <button
          type="button"
          onClick={handleAddDoc}
          className="rounded-lg border border-emerald-500/70 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-500/20"
        >
          Add
        </button>
      </div>
    </div>
  );
}

export { DEFAULT_DOCS };
