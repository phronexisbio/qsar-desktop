import { useEffect, useState } from "react";
import * as api from "../lib/api";
import { SectionIntro } from "../components/Shell";
import { EmptyState, Notice, Spinner } from "../components/Feedback";
import type { TargetFishingResult } from "../lib/types";

export function TargetFishingTab() {
  const [available, setAvailable] = useState<"loading" | "no" | "yes">("loading");
  const [smiles, setSmiles] = useState("");
  const [threshold, setThreshold] = useState("0.4");
  const [state, setState] = useState<"idle" | "loading" | "error" | "done">("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<TargetFishingResult | null>(null);

  useEffect(() => {
    api
      .targetFishingStatus()
      .then((s) => setAvailable(s.available ? "yes" : "no"))
      .catch(() => setAvailable("no"));
  }, []);

  const run = async () => {
    if (!smiles.trim()) {
      setError("Enter a SMILES string.");
      setState("error");
      return;
    }
    setState("loading");
    setError("");
    try {
      const r = await api.targetFishingSearch(smiles.trim(), parseFloat(threshold) || 0.4);
      setResult(r);
      setState("done");
    } catch (e: any) {
      setError(e.message || "Error");
      setState("error");
    }
  };

  return (
    <div className="mx-auto grid max-w-[1280px] grid-cols-1 items-start gap-5 lg:grid-cols-[350px_1fr]">
      <aside className="card sticky top-[78px] max-h-[calc(100vh-96px)] overflow-y-auto p-[18px]">
        <SectionIntro
          title="Target fishing"
          sub="Given one compound, which protein targets is it likely to hit? Searches for structurally similar known bioactive compounds across every curated target — the reverse of disease-first browsing."
        />
        {available === "loading" && <Spinner />}
        {available === "no" && <Notice>Target-fishing data isn't available in this build.</Notice>}
        {available === "yes" && (
          <>
            <label className="field-label">Query SMILES</label>
            <input
              className="field-input font-mono text-[12.5px]"
              placeholder="e.g. a natural product or lead compound"
              value={smiles}
              onChange={(e) => setSmiles(e.target.value)}
            />
            <label className="field-label" style={{ marginTop: 12 }}>
              Minimum Tanimoto similarity
            </label>
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              className="field-input"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
            <button className="btn-primary mt-[18px]" onClick={run} disabled={state === "loading"}>
              Search
            </button>
            {state === "loading" && <div className="field-hint">Searching curated bioactivity data…</div>}
            {state === "error" && <div className="field-hint text-clay">{error}</div>}
            {state === "done" && result && (
              <div className="field-hint">
                {result.n_targets_matched} target(s) matched above {threshold} similarity, out of {result.n_targets_searched} searched (
                {result.n_curated_compounds.toLocaleString()} curated compounds).
              </div>
            )}
          </>
        )}
      </aside>
      <main className="card min-h-[60vh] overflow-hidden p-[18px]">
        {state !== "done" || !result ? (
          <EmptyState title="Target fishing" hint="Enter a compound in the sidebar to see its likely targets." />
        ) : (
          <ResultsTable result={result} />
        )}
      </main>
    </div>
  );
}

/** Every row is "similar known actives found for this target," not a
    calibrated probability — the disclaimer stays visible above the
    table rather than being a one-time notice, since it materially
    changes how a result should be read. */
function ResultsTable({ result }: { result: TargetFishingResult }) {
  if (!result.results.length) {
    return <EmptyState title="No targets matched" hint="Try lowering the similarity threshold." />;
  }
  return (
    <div>
      <Notice>
        Ligand-based prediction: results are targets with structurally similar known active compounds in our curated
        data, not a trained multi-target classifier or a calibrated probability. Treat as a starting hypothesis to
        confirm with Docking or Screen, not a final answer.
      </Notice>
      <div className="mt-3 divide-y divide-line/70">
        {result.results.map((r) => (
          <div key={r.target_chembl} className="py-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-ink">{r.target_id}</span>
              <span className="badge bg-brand-500/15 text-brand-800">best {r.best_similarity}</span>
            </div>
            <div className="mt-0.5 text-[12px] text-inkmut">
              {r.n_similar_actives} similar known active{r.n_similar_actives === 1 ? "" : "s"} found
            </div>
            <div className="mt-1.5 space-y-1">
              {r.compounds.map((c, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-[11.5px]">
                  <span className="smi-mono truncate text-inkmut" title={c.smiles}>
                    {c.smiles}
                  </span>
                  <span className="shrink-0 text-inkmut">
                    tanimoto {c.tanimoto}
                    {c.pchembl_value != null ? ` · pChEMBL ${c.pchembl_value}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
