import type { DockResultRow } from "./types";

export interface ResidueFrequencyRow {
  residue: string; // e.g. "THR143" — resname+resid, the natural grouping key
  resname?: string;
  resid?: number;
  chain?: string;
  /** Total interaction events across every compound (a compound can hit
      the same residue more than once, e.g. two different H-bonds). */
  interactionCount: number;
  /** Compounds that engage this residue at least once — the "how many
      hits in this library touch this residue" number the proposal asks
      for, distinct from the raw event count above. */
  compoundCount: number;
  types: string[]; // distinct interaction categories seen at this residue
}

/** B12 — aggregates per-compound interaction data (already real, already
    computed by the backend's interaction detector) across a whole batch
    into a "which residues does this library actually engage, and how
    often" summary — the one thing InteractionTable's per-compound view
    can't show on its own. Compounds with no valid pose/interactions are
    silently skipped, same as InteractionTable itself does per row. */
export function residueFrequency(results: (DockResultRow | null | undefined)[]): ResidueFrequencyRow[] {
  const byResidue = new Map<string, ResidueFrequencyRow & { _compoundsSeen: Set<number> }>();
  results.forEach((r, compoundIdx) => {
    if (!r?.interactions?.length) return;
    for (const h of r.interactions) {
      const key = h.residue || (h.chain && h.resid != null ? `${h.chain}:${h.resid}` : null);
      if (!key) continue;
      let row = byResidue.get(key);
      if (!row) {
        row = { residue: key, resname: h.resname, resid: h.resid, chain: h.chain, interactionCount: 0, compoundCount: 0, types: [], _compoundsSeen: new Set() };
        byResidue.set(key, row);
      }
      row.interactionCount++;
      const t = h.category || h.type;
      if (t && !row.types.includes(t)) row.types.push(t);
      row._compoundsSeen.add(compoundIdx);
    }
  });
  return Array.from(byResidue.values())
    .map((r) => ({ ...r, compoundCount: r._compoundsSeen.size }))
    .sort((a, b) => b.compoundCount - a.compoundCount || b.interactionCount - a.interactionCount)
    .map(({ _compoundsSeen, ...rest }) => rest);
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function residueFrequencyCsv(rows: ResidueFrequencyRow[]): string {
  const header = ["residue", "chain", "resname", "resid", "compounds_engaging", "total_interactions", "interaction_types"];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [r.residue, r.chain, r.resname, r.resid, r.compoundCount, r.interactionCount, r.types.join("; ")].map(csvCell).join(",")
    );
  }
  return lines.join("\n") + "\n";
}
