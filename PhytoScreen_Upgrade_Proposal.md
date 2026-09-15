# PhytoScreen: Consolidated Upgrade & Feature Proposal

**Purpose of this document:** merge the two sets of notes collected so far — (A) the general docking-platform transparency/validation/export requirements, and (B) the new phytochemical/natural-product-specific requirements — into one prioritized upgrade list for PhytoScreen.

**Product direction:** move PhytoScreen from *"a tool that runs docking on natural products"* to *"a research platform that identifies, validates, interprets, and documents natural-product drug candidates end-to-end, producing a manuscript-ready evidence package."*

> **Revision note (v2):** Sections B1–B2, B3–B5, B7, and B10 updated based on follow-up clarification from the team — see those sections for the specifics (hydrophobicity-switch bug direction confirmed, grid box must not auto-select, full residue panel required, manual vs. automatic site selection must both be offered, redocking ligand/mode must be disclosed, decoy validation must show its run settings, and a 3D complex view is required post-docking).

---

## Part A — Natural-Product / Phytochemical-Specific Upgrades (new)

These are what make PhytoScreen distinct from a generic docking tool — they should be treated as the highest strategic priority since they define the product's identity.

### A1. Plant Metadata
- Optional "Name of plant" field at project intake.
- Should propagate through the whole workflow (results, exports, reports) so every compound is traceable back to its plant source.

### A2. Target-Prediction Mode Selector
Two explicit, mutually available entry points — the user must be able to choose:
1. **Compound → Target mode:** "I have compounds, tell me their likely protein targets."
2. **Disease → Target mode:** "I want to screen against a specific disease/target of interest."

The UI should present both as first-class options (not one hidden behind the other), since researchers enter the workflow from either direction depending on the project.

### A3. Similarity Search
Let the researcher upload a known drug/lead compound and ask *"find natural products structurally similar to this."* Required methods:
- Morgan fingerprints (ECFP-style)
- Tanimoto similarity scoring
- Scaffold similarity (e.g., Murcko scaffolds)
- Maximum common substructure (MCS)

Output should show similarity score, matched scaffold/substructure, and let results be ranked/filtered by similarity threshold.

### A4. Literature Intelligence
Automatically retrieve and organize, per compound:
- Original isolation paper
- Plant source
- Traditional/ethnobotanical use
- Reported biological activity
- Experimental IC50 (with target, cell line, or animal model)
- Prior computational studies on the same compound/target

Goal: replace hours of manual literature search with an auto-populated evidence card per compound.

### A5. "Research Story Generator" (Computational Evidence Report)
The key differentiator. For each top-ranked compound, auto-assemble a linear evidence chain:

```
Natural source → Chemical identity → Reported activity → Target prediction
→ QSAR prediction → Docking → Interaction analysis → ADMET → Off-target analysis
→ Overall evidence summary
```

And auto-generate, from that chain:
- Tables (properties, activity, docking, ADMET)
- Figures (structures, binding poses, interaction diagrams)
- A workflow diagram of the pipeline used
- Draft Methods, Results, and Supplementary Tables sections

Deliverable: a manuscript-ready computational evidence package per compound, not just a score.

### A6. Reproducibility / Project Management
Every project run should automatically log:
- Compound database version
- Protein/structure version
- Software version
- Parameters used
- Random seeds
- Model version (for any ML/QSAR models)
- Database version(s) queried
- Date/timestamp

With a **"Reproduce this analysis"** one-click action that re-runs the exact same pipeline against the logged versions/parameters. This is a common gap in CADD platforms and is high-value for academic reproducibility requirements.

---

## Part B — Core Docking Engine & Platform Upgrades

Organized from the consolidated notes into themed groups.

### B1. Transparency of Displayed Values
- Every numeric value in the UI must show: parameter name, unit (if applicable), and how/where it was calculated. No bare numbers like `470.7464` without context.
- Target names should show the full gene/protein name alongside the short code (e.g., `CDE6C → [Full Gene/Protein Name]`), visible throughout the workflow — **open item: dev team should first check whether the underlying data source (e.g., UniProt/PDB metadata) already provides this full-name mapping. If it's available, surface it in the UI; if it isn't in the current data pipeline, this is not a must-have and can be skipped.**

### B2. Visualization Performance & Switching
- Support Ribbon, Stick, Line, Sphere, Surface, and Hydrophobicity Surface modes.
- **Confirmed direction of the bug:** switching *into* Hydrophobicity Surface works fine and renders correctly. The problem is switching *out of* it to any other mode (Ribbon/Stick/Line/Sphere) — this hangs and the view doesn't update. Old Hydrophobicity rendering must be cancelled/deprioritized the moment the user picks a new mode, not left running in the background blocking the switch.
- Immediate UI acknowledgment of mode switch + loading/progress indicator during heavy rendering.
- Visualization should stay responsive while background computation runs.

### B3. Binding-Site & Residue Selection
- Full residue panel showing **every amino acid in the selected chain** (e.g., all of Chain A) — this must be the complete list, not a filtered/pre-selected subset.
- Search, multi-select, and select-by-number on that full list.
- **Two-way linkage** between residue list and 3D view: selecting in the list highlights in 3D, and clicking a residue in 3D selects it in the list.
- **Grid box must NOT auto-generate the moment site-specific mode is chosen.** Auto-generation on mode-select was flagged as a bug/unwanted behavior — grid box creation only happens after the user (or the automatic detector, see B5) has defined residues/a pocket.

**Two explicit, user-selectable methods — neither should be forced:**
1. **Manual method:** researcher has already studied the target externally and knows which residues form the active site. They mark those residues in the panel (or click them in 3D) → matching residues highlight in the 3D structure → researcher then manually places/sizes the grid box around the marked residues.
2. **Automatic method:** platform runs a binding-site/pocket-detection algorithm and proposes a site automatically (see B5).

The choice between manual and automatic is entirely the user's — the interface should offer both up front rather than defaulting to one.

### B4. Grid Box Control
- Grid box is created only after a site is defined (manually or automatically) — never pre-populated by default.
- Once created, allow manual move/resize/dimension/coordinate edits regardless of which method (manual or automatic) generated it.
- Grid coordinates and dimensions always visible on screen.

### B5. Automatic Site Detection — Explainability
When the user chooses the automatic method, present detected pockets as **recommendations, not decisions**, showing: pocket ID, location, residues involved, volume, detection method/algorithm, and ranking/score. The user can accept the suggested pocket as-is or switch to manual adjustment from there.

### B6. Explicit Docking Mode
Always state Blind vs. Site-Specific docking in the results, along with binding site, grid center, and grid size — this also matters for interpreting decoy validation correctly.

### B7. Decoy Validation — Statistical Dashboard
Expand validation output to include: counts (actives/decoys/success/fail), mean, median, SD, min/max, Z-score, ROC-AUC, PR-AUC, enrichment factor, BEDROC, and score distributions — plus downloadable plots (score distribution, active-vs-decoy, ROC curve, PR curve, enrichment curve, Z-score distribution).

**Also show the run settings used for that specific decoy validation** — grid box size/coordinates, binding site/residues used, and docking mode (blind vs. site-specific) — the same transparency required in B6, applied here too, so the statistics can actually be interpreted correctly.

### B8. Docking Failure Diagnostics
Classify every failure (ligand prep failed, invalid molecule, protonation/charge/conversion errors, receptor prep issues, invalid grid, engine error, timeout, missing atoms/residues, unsupported structure, other) in a table: **Compound | Status | Failure reason | Suggested action**. Distinguish expected/compound-specific failures from software/workflow failures.

### B9. Receptor Preparation — Transparency & Preview
- Show the full pipeline: original PDB → validation → chain selection → ligand ID → water/heteroatom handling → missing atom/residue check → hydrogenation → protonation → charge assignment → atom typing → final receptor.
- On failures like *"Could not prepare receptor: ligand X not found in chain Y,"* explain what was expected, why it failed, and let the user manually pick chain + reference ligand + receptor components.
- Before/after 3D preview comparing original vs. prepared receptor, highlighting what changed.

### B10. Redocking Validation
- Explicitly show PDB → chain → experimental ligand → ligand ID being redocked. **This is not optional:** a protein often has several co-crystallized ligands across different structures/pockets, and right now it's unclear which one the RMSD is even computed against.
- Explicitly state whether the redocking was run in **blind** or **site-specific** mode — the RMSD number is not interpretable without knowing this, since it changes what "success" should look like.
- Provide experimental pose, redocked pose, and an **overlay view** (not just an RMSD number) so the user can visually compare position, orientation, pocket, and key residues.

### B10b. Post-Docking 3D Complex View
In addition to the 2D interaction diagram (which already exists), provide a **3D view of the full protein–ligand complex** after docking completes — both should be available side by side, not just the 2D diagram. Improving the visual styling/layout ("card" design) of the 2D interaction diagram is a valid future polish item, but lower priority than getting the 3D complex view in place.

### B11. Researcher-Oriented Result Dashboard
Consolidate results into clear sections: Target, Ligand, Docking, Binding Site, Interactions (H-bonds, hydrophobic, π-π, π-cation, salt bridges, ionic), Validation (RMSD, decoy stats, ROC-AUC, enrichment, Z-score), and Computational Info (prep status, engine/version, runtime, warnings/errors).

### B12. Interaction & Residue-Level Tables
- Downloadable per-interaction table: Compound | Residue | Chain | Interaction | Distance | Score.
- Residue-level summary table showing interaction frequency, interaction types, and number of compounds per residue — useful for identifying consistently-engaged "hot" residues across a library.

### B13. Download / Export Everything
- **Images:** all visualization modes, pocket/grid views, poses, overlays, interaction diagrams, validation plots — exportable as PNG/TIFF/SVG at publication quality.
- **Tables:** all result and statistics tables as CSV/XLSX/TSV (docking results, scores, binding residues, interactions, residue frequency, ADME properties, validation stats, failure logs, prep reports).
- **Full experiment export:** one-click package (receptor, ligand, docking outputs, interactions, validation, figures, metadata/JSON) for full reproducibility — see folder structure already specified in the source notes.
- **Metadata:** PDB/ligand IDs, SMILES, prep settings, site/grid definitions, engine/version, parameters, timestamps, warnings — enough to write a Methods section directly from it.

### B14. Performance & Progress Feedback
- Background execution for heavy tasks (prep, docking, validation) so the UI never appears frozen.
- Explicit progress states (e.g., *"Preparing receptor... 65%"*, *"Docking compound 24/100"*) and clear per-job failure messages with suggested actions.

---

## Suggested Phasing

| Phase | Focus | Items |
|---|---|---|
| 1 — Foundation | Transparency & trust in existing outputs | B1, B6, B9, B10, B14 |
| 2 — Control | Give researchers manual control over the experiment | B3, B4, B5, B12 |
| 3 — Validation rigor | Statistically defensible results | B7, B8 |
| 4 — Differentiators | What makes PhytoScreen unique vs. generic docking tools | A1–A6 |
| 5 — Output & reproducibility | Manuscript/export readiness | B11, B13, A6 (reproduce button) |
| 6 — Polish | Speed and responsiveness | B2 |

*(A6 appears in both Phase 4 and Phase 5 since project-versioning needs to exist early to be useful, but the "Reproduce this analysis" button is most valuable once export is complete.)*

---

## One-Line Summary

PhytoScreen should evolve from *"predict a docking score for a natural compound"* to *"take a plant or a disease target, find and validate the most promising natural compounds against it, explain why, and hand back a reproducible, manuscript-ready evidence package."*
