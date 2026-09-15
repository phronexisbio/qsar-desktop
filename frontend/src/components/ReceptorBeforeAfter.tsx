import { ReceptorPreview } from "./ReceptorPreview";
import { apiUrl } from "../lib/api";

/** Side-by-side original-vs-prepared receptor comparison for a manually
    picked Advanced Settings structure — the "before/after 3D preview" part
    of receptor-prep transparency (the step-by-step pipeline labels are
    surfaced live during prep itself, see useAdvancedDocking's pickStructure).
    Reuses ReceptorPreview (style switcher included) for both sides rather
    than a bespoke viewer. */
export function ReceptorBeforeAfter({ rawPdbPath, cleanPdbPath }: { rawPdbPath: string; cleanPdbPath: string }) {
  const rawUrl = apiUrl(`/api/docking/receptor_file?path=${encodeURIComponent(rawPdbPath)}`);
  const cleanUrl = apiUrl(`/api/docking/receptor_file?path=${encodeURIComponent(cleanPdbPath)}`);
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      <div>
        <div className="field-hint mb-1">Before — original PDB (waters, heteroatoms, missing atoms as deposited)</div>
        <ReceptorPreview receptorUrl={rawUrl} ligandUrl={null} />
      </div>
      <div>
        <div className="field-hint mb-1">After — stripped, repaired, protonated (this is what gets docked against)</div>
        <ReceptorPreview receptorUrl={cleanUrl} ligandUrl={null} />
      </div>
    </div>
  );
}
