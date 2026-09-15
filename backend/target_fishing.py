"""
A2 — "compound -> target" mode: given a compound, which protein targets
is it likely to hit? Complements the disease -> target flow TargetBrowser
already offers (see docking/recommend.py) — researchers enter from either
direction depending on the project.

Method: ligand-based target prediction via similarity to KNOWN bioactive
compounds already curated per-target (models/curated/*.csv — the SAME
compound pool scripts/generate_decoys.py already uses for decoy
generation, so this needs no new data or download; it's the "guilt by
association" principle SwissTargetPrediction and similar tools use, NOT
a trained multi-label classifier — none exists in this app). Results are
"similar known actives found for these targets," not a calibrated
probability, and are presented to the caller that way.

Reuses the same packed-bit-popcount Tanimoto approach as similarity.py
(measured there: >100x faster than constructing individual RDKit
bitvector objects per compound). Unlike similarity.py's COCONUT index
(~739K compounds, 87MB, hosted on R2 and downloaded on demand — needed
because it's third-party data with its own license), this pool is
derived entirely from data already bundled in this repo (models/curated/
*.csv, ~178K compounds), so its fingerprints are precomputed OFFLINE by
scripts/build_target_fishing_index.py and committed straight into the
repo as backend/target_fishing_index/ (8.4MB compressed) — no live
per-query fingerprinting (measured at ~35s for the full pool the first
time; unacceptable for a live search endpoint) and no extra download
step/R2 dependency.
"""
import functools
import json
import os

import numpy as np
import pandas as pd
from rdkit import Chem, RDLogger
from rdkit.Chem import rdFingerprintGenerator

RDLogger.DisableLog("rdApp.*")

INDEX_DIR = os.environ.get("TARGET_FISHING_INDEX_DIR", os.path.join(os.path.dirname(__file__), "target_fishing_index"))
REGISTRY = os.environ.get("DOCKING_REGISTRY", "docking_registry.json")
_morgan = rdFingerprintGenerator.GetMorganGenerator(radius=2, fpSize=2048)
_POPCOUNT_TABLE = np.array([bin(i).count("1") for i in range(256)], dtype=np.uint16)


def available():
    return os.path.exists(os.path.join(INDEX_DIR, "fingerprints.npz")) and os.path.exists(
        os.path.join(INDEX_DIR, "compounds.csv.gz")
    )


@functools.lru_cache(maxsize=1)
def _target_id_map():
    """CHEMBL203 -> CHEMBL203_EGFR, from docking_registry.json's own
       target_id list (already in that exact <CHEMBL_ID>_<SYMBOL> format
       for every registered target, not just downloaded ones) — lets a hit
       against the curated pool route straight into TargetBrowser's
       existing selection flow instead of a bare ChEMBL id the UI can't
       do anything with."""
    out = {}
    if os.path.exists(REGISTRY):
        try:
            with open(REGISTRY) as f:
                data = json.load(f)
            targets = data.get("targets", data)
            ids = [t["target_id"] for t in targets] if isinstance(targets, list) else list(targets.keys())
            for tid in ids:
                out[tid.split("_", 1)[0]] = tid
        except Exception:
            pass
    return out


def _packed_fingerprint(mol):
    fp = _morgan.GetFingerprint(mol)
    bits = np.zeros(2048, dtype=np.uint8)
    on = list(fp.GetOnBits())
    if on:
        bits[on] = 1
    return np.packbits(bits)


@functools.lru_cache(maxsize=1)
def _load():
    """Loads the offline-precomputed index (see module docstring) — no
       fingerprinting happens here, just an npz/gzip-csv read, so this is
       fast (well under a second) rather than the ~35s it took to
       fingerprint the pool live."""
    fps_arr = np.load(os.path.join(INDEX_DIR, "fingerprints.npz"))["fps"]
    df = pd.read_csv(os.path.join(INDEX_DIR, "compounds.csv.gz"))
    pop_counts = _POPCOUNT_TABLE[fps_arr].sum(axis=1)
    return fps_arr, pop_counts, df


def search(query_smiles, threshold=0.4, max_compounds_per_target=5):
    """Returns a result dict, or raises ValueError (bad SMILES) /
       FileNotFoundError (no curated data present)."""
    if not available():
        raise FileNotFoundError("curated compound data not found")
    mol = Chem.MolFromSmiles(query_smiles)
    if mol is None:
        raise ValueError("invalid SMILES")
    q_packed = _packed_fingerprint(mol)
    q_pop = int(_POPCOUNT_TABLE[q_packed].sum())

    fps_arr, pop_counts, df = _load()
    inter = _POPCOUNT_TABLE[np.bitwise_and(fps_arr, q_packed)].sum(axis=1)
    union = q_pop + pop_counts - inter
    tanimoto = np.divide(inter, union, out=np.zeros_like(inter, dtype=float), where=union > 0)

    hits = df.assign(tanimoto=tanimoto)
    hits = hits[hits["tanimoto"] >= threshold].sort_values("tanimoto", ascending=False)

    tid_map = _target_id_map()
    by_target = {}
    for _, r in hits.iterrows():
        t = r["target_chembl"]
        entry = by_target.setdefault(t, {"target_chembl": t, "target_id": tid_map.get(t, t),
                                          "n_similar_actives": 0, "best_similarity": 0.0, "compounds": []})
        entry["n_similar_actives"] += 1
        entry["best_similarity"] = max(entry["best_similarity"], float(r["tanimoto"]))
        if len(entry["compounds"]) < max_compounds_per_target:
            pchembl = r.get("pchembl_value")
            entry["compounds"].append({
                "smiles": r["smiles"], "tanimoto": round(float(r["tanimoto"]), 3),
                "pchembl_value": (float(pchembl) if pd.notna(pchembl) else None),
            })

    results = sorted(by_target.values(), key=lambda e: -e["best_similarity"])
    for r in results:
        r["best_similarity"] = round(r["best_similarity"], 3)

    return {
        "n_curated_compounds": len(df),
        "n_targets_searched": int(df["target_chembl"].nunique()),
        "n_targets_matched": len(results),
        "results": results,
    }
