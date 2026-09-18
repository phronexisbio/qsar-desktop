import { useState } from "react";
import * as api from "../lib/api";
import { apiUrl } from "../lib/api";
import { combinePdbText, fetchTextCached } from "../lib/mol3d";
import type { AdvancedDockingBody, AlternateLigand, DockResultRow } from "../lib/types";
import { PoseViewer } from "./PoseViewer";
import { Notice } from "./Feedback";

// Matches backend/docking/failure_diagnostics.py's category slugs exactly.
const FAILURE_CATEGORY_LABELS: Record<string, string> = {
  invalid_molecule: "Invalid molecule",
  conformer_generation_failed: "3D conformer generation failed",
  ligand_conversion_failed: "Ligand-to-PDBQT conversion failed",
  ligand_prep_failed: "Ligand preparation failed",
  engine_unavailable: "Docking engine unavailable",
  engine_error: "Docking engine error",
  pose_validity_failed: "No physically valid pose",
  no_pose: "No pose produced",
  other: "Failed",
};

/** Summarises the redocking-validation status of the receptor a batch of
    compounds was actually docked against — shown once above the results
    table/shortlist rather than per-row (validation is a property of the
    STRUCTURE, not of any one compound). Renders nothing when docking
    didn't run for this batch at all (validated == null/undefined), same
    as the rest of the docking UI already does for that case. */
export function RedockingBanner({
  validated,
  referenceRmsd,
  pdbSource,
}: {
  validated?: boolean | null;
  referenceRmsd?: number | null;
  pdbSource?: string | null;
}) {
  if (validated == null) return null;
  const rmsdText = referenceRmsd != null ? `${referenceRmsd} Å` : "—";
  return (
    <Notice tone={validated ? "brand" : "amber"}>
      {validated ? (
        <>
          ✓ Redocking-validated{pdbSource ? ` (${pdbSource})` : ""} — the receptor's own co-crystallized ligand
          redocks to within {rmsdText} of its crystal pose.
        </>
      ) : (
        <>
          ⚠ NOT redocking-validated{pdbSource ? ` (${pdbSource})` : ""}
          {referenceRmsd != null ? ` — redocking RMSD ${rmsdText} exceeds the 2 Å pass threshold` : ""}. Pose
          geometry for this structure is unconfirmed; treat Vina scores here with real caution.
        </>
      )}
    </Notice>
  );
}

/** Downloads the receptor+pose "complex" PDB for one docked compound —
    the same two structures PoseViewer already renders together in 3D,
    just written out as a real file. receptorPdbPath is the file that was
    ACTUALLY docked against for this job (from the job's own response),
    not necessarily whatever the target's current default happens to be
    now. */
export function DownloadComplexButton({
  smiles,
  posePdb,
  receptorPdbPath,
}: {
  smiles: string;
  posePdb?: string | null;
  receptorPdbPath?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  if (!posePdb) return null;

  const run = async () => {
    setBusy(true);
    try {
      const receptorPdb = receptorPdbPath
        ? await fetchTextCached(apiUrl(`/api/docking/receptor_file?path=${encodeURIComponent(receptorPdbPath)}`))
        : null;
      const text = receptorPdb ? combinePdbText(receptorPdb, posePdb) : posePdb;
      const blob = new Blob([text], { type: "chemical/x-pdb" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeName = smiles.replace(/[^A-Za-z0-9]+/g, "_").slice(0, 40) || "compound";
      a.href = url;
      a.download = `${safeName}${receptorPdb ? "_complex" : "_pose"}.pdb`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className="btn-link" disabled={busy} onClick={run}>
      {busy ? "Preparing…" : receptorPdbPath ? "Download complex (PDB)" : "Download pose (PDB)"}
    </button>
  );
}

export function EnrichmentChip({ r }: { r: Pick<DockResultRow, "enrichment_percentile" | "enrichment_context"> }) {
  const pct = r.enrichment_percentile;
  if (pct == null) return <span className="text-inkmut">—</span>;
  const ec = r.enrichment_context || {};
  const dcls = pct >= 90 ? "bg-brand-500" : pct >= 65 ? "bg-amber" : "bg-clay";
  return (
    <span
      className="chip min-w-0 max-w-full"
      title={`${pct}th pct${ec.beats_best_known_active ? " · beats best known active" : ""} — ${ec.n_active ?? "?"} known active(s), ${ec.n_decoy ?? "?"} decoys (${ec.decoy_method ?? "?"})`}
    >
      <span className={`dot shrink-0 ${dcls}`} />
      <span className="min-w-0 truncate">
        {pct}th pct{ec.beats_best_known_active ? " · beats best" : ""}
      </span>
    </span>
  );
}

export function InteractionTable({ interactions }: { interactions?: DockResultRow["interactions"] }) {
  if (!interactions || !interactions.length) return null;
  const rows = [...interactions].sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
  return (
    <div className="mt-2.5">
      <div className="px-0 pb-1 text-[10.5px] font-bold uppercase tracking-wider text-brand-700">
        Protein-ligand nonbonding interactions ({rows.length})
      </div>
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            {["Name", "Category", "Type", "Distance (Å)"].map((h) => (
              <th key={h} className="border-b border-line px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-inkmut">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="border-b border-surface2 px-3 py-2">{r.name || r.residue}</td>
              <td className="border-b border-surface2 px-3 py-2">{r.category || ""}</td>
              <td className="border-b border-surface2 px-3 py-2">{r.label || r.type || ""}</td>
              <td className="border-b border-surface2 px-3 py-2">{r.distance ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FreshDecoyButton({ smiles, targetId, advanced }: { smiles: string; targetId: string | null; advanced: AdvancedDockingBody | null }) {
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("Run Fresh Decoy Validation");
  const [status, setStatus] = useState<{ kind: "muted" | "ok" | "err"; text: string } | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const run = async () => {
    if (!targetId) {
      setStatus({ kind: "err", text: "No target context for this result." });
      return;
    }
    setBusy(true);
    setLabel("Generating decoys & docking (~2-5 min)…");
    setStatus({ kind: "muted", text: "Generating ~50 decoys matched to this compound…" });
    try {
      const sub = await api.submitFreshDecoy(targetId, smiles, advanced);
      setJobId(sub.job_id);
      let j;
      while (true) {
        await api.sleep(2000);
        j = await api.pollRetry(() => api.freshDecoyJob(sub.job_id));
        if (j.status === "done" || j.status === "error" || j.status === "cancelled") break;
        const done = j.done || 0;
        const total = j.total || "?";
        setStatus({ kind: "muted", text: `Docking ${done}/${total}…` });
        setLabel(`Docking ${done}/${total}…`);
      }
      if (j.status === "cancelled") {
        setStatus({ kind: "muted", text: "Stopped by user." });
        return;
      }
      if (j.status === "error") {
        setStatus({ kind: "err", text: j.error || "failed" });
        return;
      }
      const res = j.result!;
      if (res.error) {
        setStatus({ kind: "muted", text: res.error });
        return;
      }
      const ds = res.decoy_stats;
      const rs = res.run_settings;
      setStatus({
        kind: "ok",
        text:
          `Fresh percentile: ${res.percentile}% · Decoy discrimination: ${res.discrimination} — compound score ${res.compound_score} kcal/mol vs ${res.n_decoys_docked} freshly-docked, property-matched & topologically-dissimilar decoys${res.n_decoys_failed ? ` (${res.n_decoys_failed} failed to dock)` : ""}.` +
          (ds ? ` Decoy scores: mean ${ds.mean}, median ${ds.median}, SD ${ds.sd} (range ${ds.min} to ${ds.max}).` : "") +
          (rs ? ` Run: ${rs.docking_mode === "blind" ? "blind" : "site-specific"}${rs.pdb_source ? `, ${rs.pdb_source}` : ""}${rs.exhaustiveness != null ? `, exhaustiveness ${rs.exhaustiveness}` : ""}.` : ""),
      });
    } catch (e: any) {
      setStatus({ kind: "err", text: e.message || "Error" });
    } finally {
      setBusy(false);
      setJobId(null);
      setLabel("Run Fresh Decoy Validation");
    }
  };

  const stop = async () => {
    if (!jobId) return;
    try {
      await api.cancelFreshDecoy(jobId);
    } catch {
      /* the poll loop will still surface a final status either way */
    }
  };

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <button type="button" className="btn-link" disabled={busy} onClick={run}>
        {label}
      </button>
      {busy && jobId && (
        <button type="button" className="btn-link ml-1.5" onClick={stop}>
          Stop
        </button>
      )}
      {status && (
        <div
          className={`mt-1.5 max-w-[220px] text-[12px] ${
            status.kind === "ok" ? "font-medium text-brand-700" : status.kind === "err" ? "text-clay" : "text-inkmut"
          }`}
        >
          {status.text}
        </div>
      )}
    </div>
  );
}

/** One labeled group in the consolidated per-compound detail view. Callers
    decide whether a section applies at all (conditionally rendering the
    whole <DetailSection> rather than this component guessing from its
    children) — a generic "are my children empty" heuristic can't tell a
    real wrapper <div> with nothing conditionally rendered inside it from
    one with real content, so that decision belongs with the caller, who
    actually knows. */
function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3.5 last:mb-0">
      <h5 className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-brand-700">{title}</h5>
      {children}
    </div>
  );
}

export function DockDetailPanel({
  r,
  receptorPdbPath,
  jobId,
  reportKind = "docking",
}: {
  r: DockResultRow;
  receptorPdbPath?: string | null;
  /** Enables the A5 "Generate research report" button when the caller
      has a completed job id to report against — omitted (e.g. from
      TargetInfoTab's ad-hoc panels, which have no job) hides it. */
  jobId?: string | null;
  reportKind?: "docking" | "screen";
}) {
  const canView = !!r.interaction_png;
  const g = r.gnina;
  const ec = r.enrichment_context;
  const hasDocking = r.vina_score != null || !!r.confidence || (g && (g.cnn_score != null || g.cnn_affinity != null || g.gnina_affinity != null));
  const hasCompInfo = r.n_valid != null || r.pose_self_consistency != null || (!!r.status && r.status !== "ok");
  return (
    <div className="bg-surface2/40 px-5 py-3.5">
      {r.suggested_action && (
        <DetailSection title="Failure diagnosis">
          <div className="rounded-lg border border-amber/30 bg-amber/10 px-3 py-2.5 text-[12.5px]">
            <div className="text-ink">
              <b>{FAILURE_CATEGORY_LABELS[r.category || ""] || r.category || "Failed"}</b>
              {r.reason || r.error ? ` — ${r.reason || r.error}` : ""}
            </div>
            <div className="mt-1 text-amber">{r.suggested_action}</div>
          </div>
        </DetailSection>
      )}
      {hasDocking && (
        <DetailSection title="Docking">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-inkmut">
            {r.vina_score != null && (
              <span>
                Vina score: <b className="text-ink">{r.vina_score} kcal/mol</b>
              </span>
            )}
            {r.confidence && (
              <span>
                Confidence: <b className="text-ink">{r.confidence}</b>
              </span>
            )}
            {g && (g.cnn_score != null || g.cnn_affinity != null || g.gnina_affinity != null) && (
              <span>
                GNINA:{" "}
                <b className="text-ink">
                  {g.cnn_score != null ? `CNN score ${g.cnn_score}` : ""}
                  {g.cnn_affinity != null ? ` · CNN affinity ${g.cnn_affinity}` : ""}
                  {g.gnina_affinity != null ? ` · ${g.gnina_affinity} kcal/mol` : ""}
                </b>
              </span>
            )}
          </div>
        </DetailSection>
      )}

      <DetailSection title="Binding site & interactions">
        {r.residue_overlap_pct != null && (
          <div className="mb-2 text-[12.5px] text-inkmut">Shares {r.residue_overlap_pct}% of the reference drug's contact residues.</div>
        )}
        {canView && r.interaction_source && <div className="mb-2 text-[12.5px] text-inkmut">Interaction detection: {r.interaction_source}.</div>}
        {canView ? (
          <>
            <img src={`data:image/png;base64,${r.interaction_png}`} className="max-w-full rounded-lg border border-line bg-white" />
            {jobId && (
              <div className="mt-1.5 flex gap-2.5 text-[11.5px]">
                <a className="btn-link" href={api.apiUrl(`/api/${reportKind}/job/${jobId}/interaction_diagram?smiles=${encodeURIComponent(r.smiles)}&fmt=svg`)} download>
                  Download SVG
                </a>
                <a className="btn-link" href={api.apiUrl(`/api/${reportKind}/job/${jobId}/interaction_diagram?smiles=${encodeURIComponent(r.smiles)}&fmt=tiff`)} download>
                  Download TIFF
                </a>
              </div>
            )}
          </>
        ) : (
          <div className="py-2 text-[13px] text-inkmut">No interaction diagram for this pose.</div>
        )}
        <InteractionTable interactions={r.interactions} />
      </DetailSection>

      {r.enrichment_percentile != null && (
        <DetailSection title="Validation">
          <div className="text-[12.5px] text-inkmut">
            Enrichment: <b className="text-ink">{r.enrichment_percentile}th percentile</b>
            {ec?.beats_best_known_active ? " · beats the best known active" : ""}
            {ec?.n_active != null || ec?.n_decoy != null
              ? ` (vs. ${ec?.n_active ?? "?"} known active(s), ${ec?.n_decoy ?? "?"} decoys${ec?.decoy_method ? `, ${ec.decoy_method}` : ""})`
              : ""}
          </div>
        </DetailSection>
      )}

      {r.pose_pdb && (
        <DetailSection title="3D pose">
          <PoseViewer posePdb={r.pose_pdb} receptorPdbPath={receptorPdbPath} interactions={r.interactions} />
          <div className="mt-2">
            <DownloadComplexButton smiles={r.smiles} posePdb={r.pose_pdb} receptorPdbPath={receptorPdbPath} />
          </div>
        </DetailSection>
      )}

      {hasCompInfo && (
        <DetailSection title="Computational info">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-inkmut">
            {r.n_valid != null && (
              <span>
                PoseBusters-valid poses: <b className="text-ink">{r.n_valid}</b>
              </span>
            )}
            {r.pose_self_consistency != null && (
              <span>
                Pose self-consistency: <b className="text-ink">{r.pose_self_consistency}</b>
              </span>
            )}
            {r.status && r.status !== "ok" && (
              <span className="text-amber">
                Status: <b>{r.status}</b>
                {r.reason ? ` — ${r.reason}` : ""}
              </span>
            )}
          </div>
        </DetailSection>
      )}

      {jobId && r.vina_score != null && (
        <DetailSection title="Research report">
          <ResearchReportButton jobId={jobId} smiles={r.smiles} kind={reportKind} />
        </DetailSection>
      )}
    </div>
  );
}

/** A5 — assembles and shows the full evidence-chain report for one
    compound (natural source, chemical identity, literature, target
    prediction, QSAR, docking, interactions, ADMET, off-target,
    summary) on demand, since it's a slower call (a live PubMed request
    is part of it) that most users won't want for every row. */
export function ResearchReportButton({ jobId, smiles, kind }: { jobId: string; smiles: string; kind: "docking" | "screen" }) {
  const [state, setState] = useState<"idle" | "loading" | "error" | "done">("idle");
  const [error, setError] = useState("");
  const [data, setData] = useState<{ report: any; markdown: string } | null>(null);

  const generate = async () => {
    setState("loading");
    setError("");
    try {
      const r = await api.researchReport(kind, jobId, smiles, true);
      setData(r);
      setState("done");
    } catch (e: any) {
      setError(e.message || "Error");
      setState("error");
    }
  };

  const downloadMarkdown = () => {
    if (!data) return;
    const blob = new Blob([data.markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `research_report_${(smiles || "compound").slice(0, 24).replace(/[^A-Za-z0-9]+/g, "_")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (state === "idle" || state === "error") {
    return (
      <div>
        <button type="button" className="btn-link" onClick={generate}>
          Generate research report
        </button>
        {state === "error" && <div className="field-hint text-clay">{error}</div>}
      </div>
    );
  }
  if (state === "loading") {
    return <div className="text-[12.5px] text-inkmut">Assembling evidence chain (includes a live PubMed lookup)…</div>;
  }
  const r = data!.report;
  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between">
        <div className="text-[11px] text-inkmut">{r.pipeline_stages.join(" → ")}</div>
        <button type="button" className="btn-link shrink-0" onClick={downloadMarkdown}>
          Download report (.md)
        </button>
      </div>
      <div className="rounded-lg border border-line bg-surface1 p-3 text-[12.5px] leading-relaxed text-ink">{r.evidence_summary}</div>
      <ReportField label="Natural source" value={r.natural_source?.plant_source} />
      <ReportField
        label="Chemical identity"
        value={r.chemical_identity?.available && `${r.chemical_identity.molecular_formula}, MW ${r.chemical_identity.molecular_weight}, LogP ${r.chemical_identity.logp}`}
      />
      <ReportField
        label="Reported activity"
        value={
          r.reported_activity?.available
            ? `${r.reported_activity.n_results} paper(s) for "${r.reported_activity.query}"`
            : r.reported_activity?.note
        }
      />
      <ReportField
        label="Target prediction"
        value={r.target_prediction?.available && (r.target_prediction.on_target_supported ? "Supported by similar known actives" : "No similar known actives found")}
      />
      <ReportField
        label="Off-target analysis"
        value={r.off_target_analysis?.available && `${r.off_target_analysis.n_off_targets ?? 0} other target(s) with similarity signal`}
      />
      <details className="mt-2">
        <summary className="cursor-pointer text-[11.5px] font-semibold text-brand-700">Methods (draft)</summary>
        <p className="mt-1 text-[12px] leading-relaxed text-inkmut">{r.methods_draft}</p>
      </details>
    </div>
  );
}

function ReportField({ label, value }: { label: string; value?: string | null | false }) {
  if (!value) return null;
  return (
    <div className="mt-1.5 text-[12px] text-inkmut">
      <b className="text-ink">{label}:</b> {value}
    </div>
  );
}

/** "Dock again with a different ligand": the same raw PDB structure a job
    docked against often has MORE than one real co-crystallized ligand
    (a second binding site, or one copy per chain in a crystallographic
    dimer) — the pipeline always silently centers the box on just the
    single largest one. This lets the user pick a different real ligand
    from the same structure and redock, with every other setting
    (exhaustiveness, poses, GNINA, compound list) held identical to the
    original run — the actual "build a new receptor + resubmit" work is
    owned by the caller (onRedock), since that has to replace the whole
    results table the same way "Reproduce this analysis" does; this
    component only owns fetching the candidate list and letting the user
    pick one. */
export function AlternateLigandButton({
  jobId,
  kind,
  onRedock,
  busy,
}: {
  jobId: string;
  kind: "docking" | "screen";
  onRedock: (lig: AlternateLigand) => void;
  busy?: boolean;
}) {
  const [state, setState] = useState<"idle" | "loading" | "picking" | "none" | "error">("idle");
  const [error, setError] = useState("");
  const [data, setData] = useState<{ current: AlternateLigand | null; ligands: AlternateLigand[] } | null>(null);
  const [picked, setPicked] = useState("");

  const open = async () => {
    setState("loading");
    setError("");
    try {
      const d = kind === "docking" ? await api.dockingAlternateLigands(jobId) : await api.screenAlternateLigands(jobId);
      if (!d.available || d.ligands.length < 2) {
        setState("none");
        return;
      }
      setData({ current: d.current, ligands: d.ligands });
      setPicked("");
      setState("picking");
    } catch (e: any) {
      setError(e.message || "Error");
      setState("error");
    }
  };

  const confirm = () => {
    if (!data || !picked) return;
    const lig = data.ligands.find((l) => `${l.chain}:${l.resnum}` === picked);
    if (lig) onRedock(lig);
    setState("idle");
  };

  if (state === "idle" || state === "error") {
    return (
      <span>
        <button type="button" className="btn-link" onClick={open} disabled={busy}>
          Dock again with a different ligand
        </button>
        {state === "error" && <div className="field-hint text-clay">{error}</div>}
      </span>
    );
  }
  if (state === "loading") return <span className="text-[12.5px] text-inkmut">Checking for other ligands in this structure…</span>;
  if (state === "none") return <span className="text-[12.5px] text-inkmut">Only one real ligand found in this structure.</span>;

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <select className="field-input inline-block w-auto text-[12.5px]" value={picked} onChange={(e) => setPicked(e.target.value)}>
        <option value="" disabled>
          Pick a different ligand…
        </option>
        {data!.ligands.map((l) => {
          const key = `${l.chain}:${l.resnum}`;
          const isCurrent = !!data!.current && l.chain === data!.current.chain && l.resnum === data!.current.resnum;
          return (
            <option key={key} value={key} disabled={isCurrent}>
              {l.resname} · chain {l.chain} · residue {l.resnum}
              {isCurrent ? " (current)" : ""}
            </option>
          );
        })}
      </select>
      <button type="button" className="btn-link" onClick={confirm} disabled={!picked || busy}>
        {busy ? "Docking…" : "Dock"}
      </button>
      <button type="button" className="btn-link" onClick={() => setState("idle")} disabled={busy}>
        Cancel
      </button>
    </span>
  );
}
