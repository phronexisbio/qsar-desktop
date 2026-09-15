import * as api from "../lib/api";
import type { DistStats, EnrichmentStats } from "../lib/types";

/** B7's decoy-validation statistical dashboard — expands the single free
    percentile rank every docked compound already gets into the full
    picture: per-group distribution stats, Z-score, ROC-AUC, PR-AUC,
    enrichment factor, BEDROC, downloadable plots, and the run settings
    the reference was actually built against (grid box/mode — the same
    transparency a live docking submission already gets). */
export function EnrichmentStatsPanel({ stats, targetId }: { stats: EnrichmentStats; targetId: string }) {
  if (stats.error) {
    return (
      <div className="mx-5 mb-5 rounded-lg border border-line bg-surface2/40 p-3.5 text-[12.5px] text-inkmut">{stats.error}</div>
    );
  }
  const rs = stats.run_settings;
  return (
    <div className="px-5 pb-5">
      <div className="pb-2 pt-2 text-[10.5px] font-bold uppercase tracking-wide text-brand-700">Decoy validation statistics</div>

      {rs && (
        <div className="mb-3 rounded-lg border border-line bg-surface2/40 px-3 py-2.5 text-[12px] text-inkmut">
          Run settings: {rs.docking_mode === "blind" ? "blind (whole protein)" : "site-specific"} ·{" "}
          {rs.pdb_source ? `structure ${rs.pdb_source}` : "structure unknown"}
          {rs.center && rs.box_size
            ? ` · box center (${rs.center.map((v) => v.toFixed(1)).join(", ")}) size ${rs.box_size.map((v) => v.toFixed(1)).join(" × ")} Å`
            : ""}
          {rs.exhaustiveness != null ? ` · exhaustiveness ${rs.exhaustiveness}` : ""}
        </div>
      )}

      <div className="mb-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile label="Actives / decoys / failed" value={`${stats.counts.actives} / ${stats.counts.decoys} / ${stats.counts.failed}`} />
        <StatTile
          label="ROC-AUC"
          value={stats.roc_auc != null ? stats.roc_auc.toFixed(3) : "—"}
          tip="Area under the ROC curve — how well the score separates actives from decoys overall. 0.5 = random, 1.0 = perfect."
        />
        <StatTile
          label="PR-AUC"
          value={stats.pr_auc != null ? stats.pr_auc.toFixed(3) : "—"}
          tip="Area under the precision-recall curve — more sensitive than ROC-AUC when actives are rare (as they typically are here)."
        />
        <StatTile
          label="BEDROC (α=20)"
          value={stats.bedroc != null ? stats.bedroc.toFixed(3) : "—"}
          tip={stats.bedroc_note || "Early-recognition metric — weights the best-scoring compounds much more heavily than ROC-AUC."}
        />
        <StatTile
          label="Z-score"
          value={stats.z_score != null ? stats.z_score.toFixed(2) : "—"}
          tip={stats.z_score_note}
        />
        {stats.enrichment_factor &&
          Object.entries(stats.enrichment_factor).map(([k, v]) => (
            <StatTile key={k} label={`Enrichment factor ${k}`} value={v != null ? v.toFixed(2) : "—"} tip="1.0 = no better than random; higher is better." />
          ))}
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <DistStatsTable title="Active scores (kcal/mol)" s={stats.active_stats} />
        <DistStatsTable title="Decoy scores (kcal/mol)" s={stats.decoy_stats} />
      </div>

      {stats.plots && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(
            [
              ["score_distribution", "Score distribution"],
              ["roc_curve", "ROC curve"],
              ["pr_curve", "Precision-recall curve"],
              ["enrichment_curve", "Enrichment curve"],
            ] as const
          ).map(([key, label]) => (
            <figure key={key} className="m-0 overflow-hidden rounded-xl border border-line bg-surface">
              <img src={`data:image/png;base64,${stats.plots![key]}`} className="block w-full" />
              <figcaption className="flex items-center justify-between gap-2 px-2.5 py-2 text-[11.5px] text-inkmut">
                {label}
                <span className="flex shrink-0 gap-2">
                  <a className="btn-link" href={`data:image/png;base64,${stats.plots![key]}`} download={`${key}.png`}>
                    PNG
                  </a>
                  <a className="btn-link" href={api.enrichmentPlotUrl(targetId, key, "svg")} download>
                    SVG
                  </a>
                  <a className="btn-link" href={api.enrichmentPlotUrl(targetId, key, "tiff")} download>
                    TIFF
                  </a>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, tip }: { label: string; value: string; tip?: string }) {
  return (
    <div className={`rounded-lg border border-line bg-surface2/50 px-3 py-2.5 ${tip ? "cursor-help" : ""}`} title={tip}>
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-inkmut">{label}</div>
      <div className="mt-0.5 text-[16px] font-semibold text-ink">{value}</div>
    </div>
  );
}

function DistStatsTable({ title, s }: { title: string; s?: DistStats | null }) {
  if (!s) return null;
  return (
    <div className="rounded-lg border border-line px-3 py-2.5 text-[12.5px]">
      <div className="mb-1.5 font-semibold text-ink">
        {title} <span className="font-normal text-inkmut">(n={s.n})</span>
      </div>
      <div className="grid grid-cols-5 gap-1.5 text-center text-inkmut">
        {(["mean", "median", "sd", "min", "max"] as const).map((k) => (
          <div key={k}>
            <div className="text-[10px] uppercase tracking-wide">{k}</div>
            <div className="font-semibold text-ink">{s[k]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
