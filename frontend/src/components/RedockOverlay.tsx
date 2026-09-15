import { useEffect, useRef, useState } from "react";
import { fetchTextCached, get3Dmol } from "../lib/mol3d";
import { apiUrl } from "../lib/api";

/** Puts the receptor, the real experimental (crystal) pose, and the
    redocked pose in ONE 3D scene, colored distinctly — the actual point
    of a redocking check is "does Vina put the ligand back where it really
    was," which a bare RMSD number can't show. Cyan = experimental,
    magenta = redocked; closer overlap = better redocking. */
export function RedockOverlay({
  receptorPdbPath,
  crystalLigandPath,
  redockedPosePdb,
  referenceRmsd,
}: {
  receptorPdbPath: string;
  crystalLigandPath: string;
  redockedPosePdb: string;
  referenceRmsd?: number | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = "";
    (async () => {
      const $3Dmol = get3Dmol();
      if (!$3Dmol) {
        setError("3D viewer unavailable.");
        return;
      }
      const [receptorPdb, crystalSdf] = await Promise.all([
        fetchTextCached(apiUrl(`/api/docking/receptor_file?path=${encodeURIComponent(receptorPdbPath)}`)),
        fetchTextCached(apiUrl(`/api/docking/receptor_file?path=${encodeURIComponent(crystalLigandPath)}`)),
      ]);
      if (cancelled || !container) return;
      if (!receptorPdb || !crystalSdf) {
        setError("Could not load the structures for this overlay.");
        return;
      }
      const viewer = $3Dmol.createViewer(container, { backgroundColor: "white" });
      viewer.addModel(receptorPdb, "pdb");
      viewer.setStyle({ model: 0 }, { cartoon: { color: "lightgrey", opacity: 0.5 } });
      viewer.addModel(crystalSdf, "sdf");
      viewer.setStyle({ model: 1 }, { stick: { radius: 0.2, colorscheme: "cyanCarbon" } });
      viewer.addModel(redockedPosePdb, "pdb");
      viewer.setStyle({ model: 2 }, { stick: { radius: 0.2, colorscheme: "magentaCarbon" } });
      viewer.zoomTo({ model: 1 });
      viewer.render();
    })();
    return () => {
      cancelled = true;
    };
  }, [receptorPdbPath, crystalLigandPath, redockedPosePdb]);

  return (
    <div>
      <div className="field-hint mb-1">
        Redocking overlay — <span className="font-semibold" style={{ color: "#0891b2" }}>cyan = experimental (crystal) pose</span>,{" "}
        <span className="font-semibold" style={{ color: "#c026d3" }}>magenta = redocked pose</span>
        {referenceRmsd != null ? ` — RMSD ${referenceRmsd} Å between them` : ""}.
      </div>
      {error ? (
        <div className="rounded-lg border border-line bg-surface p-4 text-[12.5px] text-inkmut">{error}</div>
      ) : (
        <div ref={containerRef} className="relative h-[320px] w-full rounded-lg border border-line bg-white" />
      )}
    </div>
  );
}
