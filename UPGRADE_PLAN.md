# PhytoScreen Upgrade Plan

Derived from `PhytoScreen_Upgrade_Proposal.md`, but re-sequenced and grounded
against the **real, current state of the codebase** (audited item by item —
see status marks below) rather than the proposal's own generic phase table.
Three items are already fully shipped; two "new feature" items turned out to
be confirmed regressions/bugs that should be fixed before anything is built
on top of them. Phases are ordered so each one's foundation is solid before
the next depends on it.

**Status marks:** ✅ done · 🐛 confirmed bug · 🟡 partial · ⭕ not started

---

## Already done — no work needed

- **B6 — Explicit docking mode.** Blind vs. site-specific is threaded through
  submit and shown in results; `RedockingBanner` (`DockingPieces.tsx`)
  already surfaces validated/RMSD/pdb_source per job.
- **B10b — Post-docking 3D complex view.** `PoseViewer.tsx` renders
  receptor+pose together with the full style switcher; `DownloadComplexButton`
  exports the combined PDB. 2D interaction diagrams already sit alongside it.
- **B14 — Background execution & progress feedback.** Real job/poll pattern
  with Stop buttons across Docking, Screen, and Downloads, all wired to real
  cancel endpoints in `app.py`.

These stay on the shelf — don't re-touch them unless a phase below
specifically says otherwise.

---

## Phase 0 — Fix the two confirmed regressions

Nothing else should be built on top of the binding-site/grid-box system or
the 3D viewer while these are still broken. Small, self-contained, high-trust
fixes — do these first.

### 0.1 — B2: Hydrophobicity-surface switch hangs 🐛
**Root cause (confirmed):** `applyProteinStyle()`'s `surfaceHydrophobicity`
case (`mol3d.ts`) passes a `colorfunc` closure to `viewer.addSurface()`.
3Dmol computes surface geometry across 4 Web Workers, but a closure can't
cross the Worker boundary — so `colorfunc` runs on the **main thread**, once
per vertex, as each worker posts geometry back (thousands of synchronous
calls for a full receptor). `clearSurfaces()` only calls `removeSurface(id)`,
which deletes rendered geometry but does **not** cancel the still-running
workers — so switching styles while they're mid-flight just queues more
main-thread `colorfunc` work behind the click, which is exactly why
switching *in* looks fine (one wait) and switching *out* looks hung
(unbounded queued work with no cancel path).
**Fix:** replace the per-vertex `colorfunc` with a precomputed
`colorscheme`/color map keyed by residue name (3Dmol can apply this without
a closure, so it stays worker-side) — this is the cleaner fix over adding a
cancellation-token guard, since it removes the root cause instead of racing it.
**Files:** `frontend/src/lib/mol3d.ts`.

### 0.2 — B4/B5: Grid box auto-generates; no manual/automatic choice 🐛
**Root cause (confirmed):** `useAdvancedDocking.ts` defaults `dockingMode`
to `"site_specific"` and `loadBindingSite()` fires the instant a target is
selected — so a real grid box exists with zero user action, and there's no
"pick manual or automatic" step at all. `fpocket` exists only as an
availability check (`docking/availability.py`), never wired into a UI.
**Fix:** add an explicit "how do you want to define the binding site?"
step (Manual / Automatic) before any box is computed; manual mode starts
from an empty box (no default) and builds it from residues the user
picks (already scaffolded via `applyResidueSelection`/`boxFromResidues`);
automatic mode runs pocket detection and returns it as **candidates to
review**, not a silent default (this is B5 — do it here, not later, since
it's the same code path).
**Files:** `frontend/src/lib/useAdvancedDocking.ts`, `BindingSiteModal.tsx`,
new backend pocket-detection endpoint (likely wrapping `fpocket` output —
confirm it's actually bundleable for the Windows build before committing to
this, per `BUILD_WINDOWS.md`'s existing "accepted gap" note on fpocket).

---

## Phase 1 — Transparency & the result dashboard

These four items all touch the same result-display surface, so doing them
in one pass avoids reorganizing the same components twice.

- **B1 — Value transparency** 🟡. Docking numbers already show units; ADMET/
  Predict tables (`AdmetTab.tsx`) show bare column headers. Add units +
  tooltip provenance there. Full gene/protein name alongside short codes:
  **check first** whether UniProt/PDB metadata already sitting in the data
  pipeline covers this before building new fetching — the proposal itself
  flags this as skippable if not already available.
- **B9 — Receptor prep transparency** 🟡. Only one final status line exists
  today (`structureStatus`). Add the step-by-step pipeline view (strip →
  repair → protonate → PDBQT) and a before/after 3D preview.
- **B10 — Redocking overlay** 🟡. RMSD/pdb_source/validated already shown.
  Missing: an actual overlay view putting the experimental pose
  (`/api/targets/{id}/reference_ligand.sdf`, already served) and the
  redocked pose in the same 3D scene — reuse `PoseViewer`'s dual-model
  pattern from B10b rather than building a new viewer.
- **B11 — Consolidated dashboard** 🟡. Reorganize `DockDetailPanel`/
  `ScreenResults` into the proposal's explicit sections (Target, Ligand,
  Docking, Binding Site, Interactions, Validation, Computational Info) —
  do this last in the phase, once B1/B9/B10 have decided what data exists
  to put in each section.

---

## Phase 2 — Validation rigor

- **B7 — Decoy validation statistics** 🟡→ target full dashboard.
  `docking/enrichment.py` currently computes one percentile + a qualitative
  label. Add mean/median/SD/min/max, Z-score, ROC-AUC, PR-AUC, BEDROC, and
  downloadable plots (score distribution, active-vs-decoy, ROC/PR/enrichment
  curves). This is the single largest backend-math item outside Part A —
  budget real time for it.
- **B8 — Failure diagnostics** 🟡. Real status enum exists
  (`docking/pipeline.py`: `ligand_prep_failed`, `engine_unavailable`,
  `no_pose`, `ok`) but is coarser than the proposal's list and has no
  "Suggested action" column. Extend the enum, add the action-text mapping,
  and render as `Compound | Status | Failure reason | Suggested action`.

---

## Phase 3 — Export, residue analytics, reproducibility

- **B12 — Residue-level frequency table** ⭕ (confirmed zero hits on grep).
  Net-new: aggregate `InteractionTable` data across all compounds in a
  Screen/batch-dock run into a "hot residue" summary (frequency + types +
  compound count per residue).
- **B13 — Export everything** 🟡. Real today: ADMET/Screen CSV, PNG
  diagrams, PDB complex download. Missing: SVG/TIFF image export, stats/
  failure-log/prep-report exports, and the single biggest gap — a full
  "one-click experiment package" zip (receptor + ligand + outputs +
  interactions + validation + figures + metadata JSON). No `zipfile` usage
  exists anywhere in `app.py`/`serving/` yet — this is genuinely new
  plumbing, not an extension of something existing.
- **A6 — Reproducibility logging** ⭕. Nothing logs software/model/database
  versions per run today (ligand embedding does use fixed seeds already, a
  usable foundation). Add a run-metadata record (versions, params, seeds,
  timestamp) persisted per job, then the "Reproduce this analysis" button
  once B13's export/package plumbing exists to hang it off of.

---

## Phase 4 — Natural-product differentiators (the big net-new build)

This is the largest phase by scope and the one that actually changes what
PhytoScreen *is*, per the proposal's own framing — sequenced last because
everything here is genuinely new (⭕ across the board) and benefits from
landing on a platform whose transparency/validation/export story is already
solid, rather than being bolted onto the current thinner version.

1. **A1 — Plant metadata** ⭕ (small — a field + propagation, worth doing
   first in this phase since B13's export schema and A5's report both want
   it threaded through from day one).
2. **A2 — Compound→Target mode** ⭕. Disease→Target already fully exists
   (`recommend.py`, `TargetBrowser.tsx`); target-fishing *from* a compound
   (no target-prediction-from-structure path exists at all today) is the
   net-new half.
3. **A3 — Similarity search** ⭕. Morgan/Tanimoto already exist internally
   for QSAR featurization and decoy generation — reuse that math, but there
   is no user-facing endpoint/UI, and Murcko scaffold + MCS matching don't
   exist anywhere yet.
4. **A4 — Literature intelligence** ⭕. Fully new — no literature-fetch code
   exists. Needs a real external-API integration decision (PubMed E-utilities
   is the obvious default) before implementation starts.
5. **A5 — Research story generator** ⭕. Depends on A4 (content to report
   on) and B13 (export/packaging machinery) — sequenced last for that reason,
   not because it's less important.

---

## Working notes

- Phase 0 is the only phase with zero net-new product surface — it's purely
  "make the two things that already exist actually work correctly," so it
  should be quick and is the safest place to start.
- Re-verify the fpocket/Windows-bundling question from 0.2 early — if
  `fpocket` genuinely can't ship in the frozen Windows build, B5's
  "automatic detection" needs a different (bundleable) pocket-detection
  approach decided before Phase 0.2 is implemented, not discovered mid-way.
- B7 (Phase 2) and the A4/A5 pair (Phase 4) are the two biggest single
  chunks of new work in this plan — worth their own sub-scoping/design pass
  when their phase starts, rather than estimating them fully up front here.
