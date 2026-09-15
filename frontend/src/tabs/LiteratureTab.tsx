import { useState } from "react";
import * as api from "../lib/api";
import { SectionIntro } from "../components/Shell";
import { EmptyState, Notice } from "../components/Feedback";
import type { LiteratureResult } from "../lib/types";

export function LiteratureTab() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "error" | "done">("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<LiteratureResult | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const run = async () => {
    if (!query.trim()) {
      setError("Enter a search term — a target, compound, or plant name.");
      setState("error");
      return;
    }
    setState("loading");
    setError("");
    try {
      const r = await api.literatureSearch(query.trim(), 10);
      setResult(r);
      setExpanded(new Set());
      setState("done");
    } catch (e: any) {
      setError(e.message || "Error");
      setState("error");
    }
  };

  const toggle = (pmid: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(pmid)) next.delete(pmid);
      else next.add(pmid);
      return next;
    });
  };

  return (
    <div className="mx-auto grid max-w-[1280px] grid-cols-1 items-start gap-5 lg:grid-cols-[350px_1fr]">
      <aside className="card sticky top-[78px] max-h-[calc(100vh-96px)] overflow-y-auto p-[18px]">
        <SectionIntro
          title="Literature search"
          sub="Live PubMed search for a target, compound, or plant name — this pulls from the internet in real time and requires a connection, unlike the rest of the app."
        />
        <label className="field-label">Search term</label>
        <input
          className="field-input text-[13px]"
          placeholder="e.g. EGFR inhibitor, curcumin, Withania somnifera"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
        />
        <button className="btn-primary mt-[18px]" onClick={run} disabled={state === "loading"}>
          Search PubMed
        </button>
        {state === "loading" && <div className="field-hint">Searching PubMed…</div>}
        {state === "error" && <div className="field-hint text-clay">{error}</div>}
        {state === "done" && result && (
          <div className="field-hint">
            {result.n_results} paper{result.n_results === 1 ? "" : "s"} found for "{result.query}".
          </div>
        )}
      </aside>
      <main className="card min-h-[60vh] overflow-hidden p-[18px]">
        {state !== "done" || !result ? (
          <EmptyState title="Literature search" hint="Enter a search term in the sidebar to pull recent PubMed papers." />
        ) : result.papers.length === 0 ? (
          <EmptyState title="No papers found" hint="Try a broader or differently-worded search term." />
        ) : (
          <PaperList result={result} expanded={expanded} onToggle={toggle} />
        )}
      </main>
    </div>
  );
}

function PaperList({
  result,
  expanded,
  onToggle,
}: {
  result: LiteratureResult;
  expanded: Set<string>;
  onToggle: (pmid: string) => void;
}) {
  return (
    <div>
      <Notice>Live results from NCBI PubMed — not curated or validated by PhytoScreen.</Notice>
      <div className="mt-3 divide-y divide-line/70">
        {result.papers.map((p) => {
          const key = p.pmid || p.title;
          const isOpen = expanded.has(key);
          return (
            <div key={key} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <span className="font-semibold text-ink">{p.title}</span>
                {p.year && <span className="badge shrink-0 bg-brand-500/15 text-brand-800">{p.year}</span>}
              </div>
              <div className="mt-0.5 text-[12px] text-inkmut">
                {p.authors}
                {p.authors && p.journal ? " · " : ""}
                {p.journal}
              </div>
              <div className="mt-1.5 flex items-center gap-3 text-[11.5px]">
                {p.url && (
                  <a className="font-semibold text-brand-700 underline" href={p.url} target="_blank" rel="noreferrer">
                    View on PubMed
                  </a>
                )}
                {p.abstract && (
                  <button type="button" className="font-semibold text-brand-700 underline" onClick={() => onToggle(key)}>
                    {isOpen ? "Hide abstract" : "Show abstract"}
                  </button>
                )}
              </div>
              {isOpen && p.abstract && <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink">{p.abstract}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
