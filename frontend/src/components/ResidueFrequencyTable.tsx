import { useState } from "react";
import { residueFrequency, residueFrequencyCsv } from "../lib/residueFrequency";
import type { DockResultRow } from "../lib/types";

function downloadCsv(csv: string, name: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** B12 — cross-compound "hot residue" summary: which binding-site residues
    this batch's docked compounds actually engage, how often, and with
    what interaction types — collapsible since it's a secondary view next
    to the main per-compound results table, not the primary one. */
export function ResidueFrequencyTable({ results, fileBaseName }: { results: (DockResultRow | null | undefined)[]; fileBaseName: string }) {
  const [open, setOpen] = useState(false);
  const rows = residueFrequency(results);
  if (!rows.length) return null;
  return (
    <div className="border-t border-line px-5 py-3.5">
      <button type="button" className="btn-link font-semibold" onClick={() => setOpen((o) => !o)}>
        {open ? "▾" : "▸"} Residue interaction frequency ({rows.length} residue{rows.length === 1 ? "" : "s"} engaged)
      </button>
      {open && (
        <div className="mt-2">
          <div className="mb-2 flex justify-end">
            <button type="button" className="btn-link" onClick={() => downloadCsv(residueFrequencyCsv(rows), `${fileBaseName}_residue_frequency.csv`)}>
              Download CSV
            </button>
          </div>
          <div className="max-h-[320px] overflow-y-auto rounded-lg border border-line">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr>
                  {["Residue", "Chain", "Compounds engaging", "Total interactions", "Types"].map((h) => (
                    <th key={h} className="sticky top-0 z-10 border-b border-line bg-surface2 px-2.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-inkmut">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.residue} className="hover:bg-canvas">
                    <td className="border-b border-surface2 px-2.5 py-1.5 font-semibold text-ink">{r.residue}</td>
                    <td className="border-b border-surface2 px-2.5 py-1.5 text-inkmut">{r.chain || "—"}</td>
                    <td className="border-b border-surface2 px-2.5 py-1.5">{r.compoundCount}</td>
                    <td className="border-b border-surface2 px-2.5 py-1.5 text-inkmut">{r.interactionCount}</td>
                    <td className="border-b border-surface2 px-2.5 py-1.5 text-inkmut">{r.types.join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
