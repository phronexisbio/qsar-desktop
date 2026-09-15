"""
A2 — precomputes Morgan/ECFP4 fingerprints for models/curated/*.csv (the
same compound pool scripts/generate_decoys.py already uses, and the
source target_fishing.py's search() reads) into a small, committable
artifact — same reasoning as scripts/build_similarity_index.py, but on
data that's ALREADY bundled in this repo (~178K compounds, not COCONUT's
~739K), so the output is small enough to commit directly to git instead
of needing R2 hosting: no live per-query fingerprint computation (which
measured ~35s for the full pool — a real UX problem for a live search
endpoint), and no new external download.

Output (backend/target_fishing_index/):
  - fingerprints.npy : (n, 256) uint8, packed Morgan bits (same convention
                        as similarity.py / build_similarity_index.py)
  - compounds.csv     : target_chembl, smiles, pchembl_value

Usage (run from the repo root, matching CURATED_DATA_DIR's default):
    python -m scripts.build_target_fishing_index
"""
import argparse
import glob
import os

import numpy as np
import pandas as pd
from rdkit import Chem, RDLogger
from rdkit.Chem import rdFingerprintGenerator

RDLogger.DisableLog("rdApp.*")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--curated-dir", default=os.environ.get("CURATED_DATA_DIR", "models/curated"))
    ap.add_argument("--out-dir", default=os.path.join(os.path.dirname(__file__), "..", "target_fishing_index"))
    args = ap.parse_args()

    out_dir = os.path.abspath(args.out_dir)
    os.makedirs(out_dir, exist_ok=True)
    morgan = rdFingerprintGenerator.GetMorganGenerator(radius=2, fpSize=2048)

    rows = []
    fps = []
    for path in sorted(glob.glob(os.path.join(args.curated_dir, "*.csv"))):
        target_chembl = os.path.splitext(os.path.basename(path))[0]
        df = pd.read_csv(path)
        seen = set()
        for _, r in df.iterrows():
            smi = r.get("smiles")
            if not isinstance(smi, str) or smi in seen:
                continue
            seen.add(smi)
            mol = Chem.MolFromSmiles(smi)
            if mol is None:
                continue
            fp = morgan.GetFingerprint(mol)
            bits = np.zeros(2048, dtype=np.uint8)
            on = list(fp.GetOnBits())
            if on:
                bits[on] = 1
            fps.append(np.packbits(bits))
            rows.append({"target_chembl": target_chembl, "smiles": smi, "pchembl_value": r.get("pchembl_value")})
        print(f"  {target_chembl}: {len(seen)} unique compounds", flush=True)

    fps_arr = np.vstack(fps)
    np.savez_compressed(os.path.join(out_dir, "fingerprints.npz"), fps=fps_arr)
    pd.DataFrame(rows).to_csv(os.path.join(out_dir, "compounds.csv.gz"), index=False, compression="gzip")
    print(f"Done: {len(rows)} compounds across {len(set(r['target_chembl'] for r in rows))} targets -> {out_dir}")


if __name__ == "__main__":
    main()
