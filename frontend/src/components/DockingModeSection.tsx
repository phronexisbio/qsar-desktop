import { useState } from "react";
import type { AdvancedDockingState } from "../lib/useAdvancedDocking";
import { SegmentedToggle } from "./SegmentedToggle";
import { BindingSiteModal } from "./BindingSiteModal";

export function DockingModeSection({ adv, targetId }: { adv: AdvancedDockingState; targetId: string }) {
  const [modalOpen, setModalOpen] = useState(false);
  const { site, dockingMode, setDockingMode, siteConfirmed, siteMethod, confirmAutomaticSite, useManualSite } = adv;

  let summary: React.ReactNode = <span className="text-inkmut">No binding-site evidence for this target.</span>;
  let showBtn = false;
  // Blind mode doesn't need a site-method choice at all — the toggle above
  // IS the explicit choice, there's no pocket to define either way.
  let needsChoice = false;
  if (site) {
    if (dockingMode === "blind") {
      if (site.blind_box_size) {
        summary = (
          <>
            Blind docking: whole-protein search box{" "}
            <b>{site.blind_box_size.map((v) => v.toFixed(0)).join(" × ")}</b> Å — no pocket assumed.
          </>
        );
        showBtn = true;
      } else {
        summary = <span className="text-inkmut">Blind box unavailable — no prepared receptor on disk for this target.</span>;
      }
    } else if (!siteConfirmed) {
      needsChoice = true;
    } else {
      const n = site.residues.length;
      summary =
        siteMethod === "manual" ? (
          <>
            Binding site: <b>{n}</b> residue(s) picked manually · box{" "}
            {site.box_size?.map((v) => v.toFixed(1)).join(" × ") || "not yet sized — pick residues below"} Å
          </>
        ) : (
          <>
            Binding site: <b>{n}</b> pocket residue(s) within 5 Å of the reference ligand (automatic) · box{" "}
            {site.box_size?.map((v) => v.toFixed(1)).join(" × ")} Å
          </>
        );
      showBtn = true;
    }
  } else if (targetId.startsWith("GENE_")) {
    summary = <span className="text-inkmut">No automatic default yet for this target — pick a structure below (Advanced Settings).</span>;
  }

  return (
    <div>
      <label className="field-label">Docking mode</label>
      <SegmentedToggle
        value={dockingMode}
        onChange={(v) => setDockingMode(v as any)}
        options={[
          { value: "site_specific", label: "Site-specific" },
          { value: "blind", label: "Blind (whole protein)" },
        ]}
      />
      {needsChoice ? (
        <div className="mt-1.5 rounded-lg border border-line bg-surface2/40 p-2.5">
          <div className="field-hint mt-0 mb-1.5">How should the binding site be defined for this run?</div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className="btn-link font-semibold" onClick={confirmAutomaticSite}>
              Automatic — use the co-crystallized reference ligand's site
            </button>
            <span className="text-inkmut">·</span>
            <button type="button" className="btn-link font-semibold" onClick={useManualSite}>
              Manual — I'll pick residues myself
            </button>
          </div>
        </div>
      ) : (
        <div className="field-hint">{summary}</div>
      )}
      {showBtn && (
        <button type="button" className="btn-link mt-1.5" onClick={() => setModalOpen(true)}>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="6" cy="6" r="2.2" />
            <circle cx="18" cy="18" r="2.2" />
            <path d="M8 7.5C10 10 14 14 16 16.5" />
          </svg>
          {siteConfirmed && siteMethod === "manual" ? "Pick residues in 3D" : "View binding site in 3D"}
        </button>
      )}
      {modalOpen && <BindingSiteModal adv={adv} targetId={targetId} onClose={() => setModalOpen(false)} />}
    </div>
  );
}
