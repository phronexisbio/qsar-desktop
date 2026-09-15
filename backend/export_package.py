"""
B13's "one-click experiment package" — bundles everything about one
completed docking/screen run into a single ZIP: metadata (A6's
reproducibility snapshot), the receptor, per-compound complex poses,
interaction diagrams, and a results CSV. Shared by both /api/docking/job/
{jid}/export_package and /api/screen/job/{jid}/export_package since the
per-compound result shape (DockResultRow) is the same either way.
"""
import base64
import csv
import io
import json
import os
import re
import zipfile


def _safe_name(smiles, idx):
    s = re.sub(r"[^A-Za-z0-9]+", "_", smiles)[:40] or "compound"
    return f"{idx:03d}_{s}"


def _combine_pdb_text(receptor_pdb, pose_pdb):
    """Same strip-terminators-then-TER-then-END logic as the frontend's
       mol3d.ts combinePdbText — duplicated here (not imported, there's no
       shared JS/Python boundary) because a server-side ZIP export can't
       depend on client-side JS having run."""
    def strip(s):
        lines = [ln for ln in s.split("\n") if not re.match(r"^(END|ENDMDL)\s*$", ln.strip())]
        return "\n".join(lines).rstrip("\n")
    return f"{strip(receptor_pdb)}\nTER\n{strip(pose_pdb)}\nEND\n"


def build_zip(run_metadata: dict, receptor_pdb_path, results: list) -> bytes:
    buf = io.BytesIO()
    receptor_pdb_text = None
    if receptor_pdb_path and os.path.exists(receptor_pdb_path):
        with open(receptor_pdb_path) as f:
            receptor_pdb_text = f.read()

    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("metadata.json", json.dumps(run_metadata, indent=2, default=str))

        if receptor_pdb_text:
            z.writestr("receptor.pdb", receptor_pdb_text)

        csv_buf = io.StringIO()
        w = csv.writer(csv_buf)
        w.writerow(["smiles", "status", "vina_score", "confidence", "n_valid", "category", "reason", "suggested_action"])
        for r in results:
            w.writerow([r.get("smiles"), r.get("status"), r.get("vina_score"), r.get("confidence"),
                       r.get("n_valid"), r.get("category"), r.get("reason"), r.get("suggested_action")])
        z.writestr("results.csv", csv_buf.getvalue())

        for i, r in enumerate(results):
            name = _safe_name(r.get("smiles") or "", i)
            pose_pdb = r.get("pose_pdb")
            if pose_pdb:
                text = _combine_pdb_text(receptor_pdb_text, pose_pdb) if receptor_pdb_text else pose_pdb
                z.writestr(f"poses/{name}.pdb", text)
            png_b64 = r.get("interaction_png")
            if png_b64:
                try:
                    z.writestr(f"interactions/{name}.png", base64.b64decode(png_b64))
                except Exception:
                    pass
    return buf.getvalue()
