"""
Full statistical validation dashboard for a target's saved active/decoy
reference (enrichment_reference.json, written by scripts/validate_target.py).

annotate_with_reference() in enrichment.py gives every docked compound one
FREE percentile rank against this same reference — this module is the
richer, on-demand "how good is this target's validation, really" view:
per-group distribution stats, Z-score, ROC-AUC, PR-AUC, enrichment factor at
several cutoffs, BEDROC, and downloadable plots (score distribution, ROC
curve, PR curve, enrichment curve) — everything recomputed fresh from the
raw compound scores rather than reusing enrichment_reference.json's own
precomputed `metrics` block, whose exact definitions/history aren't
guaranteed to match these ones.

Vina score convention throughout this module: LOWER is better binding, so
every ranking/AUC/EF/BEDROC computation below sorts/flips accordingly —
"goodness" = -score, and "best first" = ascending score.
"""
import base64
import io

import numpy as np
from sklearn.metrics import roc_auc_score, roc_curve, average_precision_score, precision_recall_curve

from .enrichment import load_reference
from .profile import load_profile


def _fig_to_base64_png(fig):
    import matplotlib
    matplotlib.use("Agg")
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=110, bbox_inches="tight")
    import matplotlib.pyplot as plt
    plt.close(fig)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _dist_stats(scores):
    if not scores:
        return None
    arr = np.array(scores, dtype=float)
    return {
        "n": int(len(arr)),
        "mean": round(float(arr.mean()), 3),
        "median": round(float(np.median(arr)), 3),
        "sd": round(float(arr.std(ddof=1)), 3) if len(arr) > 1 else 0.0,
        "min": round(float(arr.min()), 3),
        "max": round(float(arr.max()), 3),
    }


def _enrichment_factors(y_sorted_best_first, prevalence):
    """y_sorted_best_first: 1/0 labels already ranked best-scoring-first.
       EF@X% = (fraction of actives in the top X%) / (actives' overall
       prevalence) — 1.0 means "no better than random," higher is better."""
    n_total = len(y_sorted_best_first)
    out = {}
    for pct in (1, 5, 10, 20):
        k = max(1, round(n_total * pct / 100))
        hits = float(np.sum(y_sorted_best_first[:k]))
        out[f"EF{pct}%"] = round((hits / k) / prevalence, 2) if prevalence > 0 else None
    return out


def _score_distribution_plot(actives, decoys):
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(5, 3.2))
    bins = np.histogram(np.concatenate([actives, decoys]), bins=15)[1]
    ax.hist(decoys, bins=bins, alpha=0.6, color="#94a3b8", label=f"Decoys (n={len(decoys)})")
    ax.hist(actives, bins=bins, alpha=0.7, color="#2b6cb0", label=f"Actives (n={len(actives)})")
    ax.set_xlabel("Vina score (kcal/mol, lower = better)")
    ax.set_ylabel("Count")
    ax.set_title("Score distribution")
    ax.legend(fontsize=8)
    fig.tight_layout()
    return _fig_to_base64_png(fig)


def _roc_plot(fpr, tpr, auc):
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(4, 4))
    ax.plot(fpr, tpr, color="#2b6cb0", linewidth=2, label=f"AUC = {auc:.3f}")
    ax.plot([0, 1], [0, 1], color="#cbd5e1", linestyle="--", linewidth=1)
    ax.set_xlabel("False positive rate")
    ax.set_ylabel("True positive rate")
    ax.set_title("ROC curve")
    ax.legend(fontsize=8, loc="lower right")
    fig.tight_layout()
    return _fig_to_base64_png(fig)


def _pr_plot(precision, recall, pr_auc, prevalence):
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(4, 4))
    ax.plot(recall, precision, color="#e2621a", linewidth=2, label=f"AP = {pr_auc:.3f}")
    ax.axhline(prevalence, color="#cbd5e1", linestyle="--", linewidth=1, label=f"baseline = {prevalence:.2f}")
    ax.set_xlabel("Recall")
    ax.set_ylabel("Precision")
    ax.set_title("Precision-recall curve")
    ax.legend(fontsize=8, loc="upper right")
    fig.tight_layout()
    return _fig_to_base64_png(fig)


def _enrichment_plot(y_sorted_best_first, prevalence):
    import matplotlib.pyplot as plt
    n = len(y_sorted_best_first)
    fracs = np.arange(1, n + 1) / n
    cum_actives = np.cumsum(y_sorted_best_first) / max(1, y_sorted_best_first.sum())
    fig, ax = plt.subplots(figsize=(4, 4))
    ax.plot(fracs * 100, cum_actives * 100, color="#2b6cb0", linewidth=2, label="This target")
    ax.plot([0, 100], [0, 100], color="#cbd5e1", linestyle="--", linewidth=1, label="Random")
    ax.set_xlabel("% of ranked compounds screened")
    ax.set_ylabel("% of actives found")
    ax.set_title("Enrichment curve")
    ax.legend(fontsize=8, loc="lower right")
    fig.tight_layout()
    return _fig_to_base64_png(fig)


def compute_stats(target_id, include_plots=True):
    """Returns None if there's no saved reference at all for this target
       (nothing to compute from) — distinct from an 'error' dict, which
       means a reference exists but doesn't have enough labeled data."""
    ref = load_reference(target_id)
    if not ref:
        return None

    compounds = [c for c in ref["compounds"] if c.get("score") is not None]
    n_failed = len(ref["compounds"]) - len(compounds)
    active_scores = [c["score"] for c in compounds if c["label"] == "active"]
    decoy_scores = [c["score"] for c in compounds if c["label"] == "decoy"]
    counts = {"actives": len(active_scores), "decoys": len(decoy_scores), "failed": n_failed}

    # Run settings the reference was actually built against — B7's own
    # "show the run settings used" requirement, same transparency B6
    # already applies to a live docking submission.
    run_settings = {"pdb_source": ref.get("pdb_source"), "decoy_method": ref.get("decoy_method"),
                     "engine": ref.get("engine"), "exhaustiveness": ref.get("exhaustiveness")}
    try:
        profile = load_profile(target_id)
        run_settings["center"] = profile.get("center")
        run_settings["box_size"] = profile.get("box_size")
        run_settings["docking_mode"] = "blind" if profile.get("site_source") == "blind_whole_protein" else "site_specific"
    except Exception:
        pass

    if len(active_scores) < 2 or len(decoy_scores) < 2:
        return {"counts": counts, "run_settings": run_settings,
                "error": "Not enough scored actives and decoys (need at least 2 of each) to compute "
                         "statistics that mean anything — ROC/PR/BEDROC need real class separation to measure."}

    y = np.array([1] * len(active_scores) + [0] * len(decoy_scores))
    goodness = np.array([-s for s in active_scores] + [-s for s in decoy_scores])  # higher = better, for sklearn's convention

    roc_auc = float(roc_auc_score(y, goodness))
    pr_auc = float(average_precision_score(y, goodness))
    fpr, tpr, _ = roc_curve(y, goodness)
    precision, recall, _ = precision_recall_curve(y, goodness)

    order = np.argsort(-goodness)  # best (most active-like) first
    y_sorted = y[order]
    prevalence = len(active_scores) / len(y)
    ef = _enrichment_factors(y_sorted, prevalence)

    bedroc = None
    try:
        from rdkit.ML.Scoring.Scoring import CalcBEDROC
        scored = sorted(zip(goodness.tolist(), y.tolist()), key=lambda t: -t[0])
        bedroc = round(float(CalcBEDROC([[lbl] for _, lbl in scored], 0, 20)), 3)
    except Exception:
        pass

    d_arr = np.array(decoy_scores)
    a_arr = np.array(active_scores)
    z_score = round(float((d_arr.mean() - a_arr.mean()) / d_arr.std(ddof=1)), 2) if d_arr.std(ddof=1) > 0 else None

    out = {
        "counts": counts,
        "active_stats": _dist_stats(active_scores),
        "decoy_stats": _dist_stats(decoy_scores),
        "z_score": z_score,
        "z_score_note": "Standard deviations the mean active score sits below the decoy mean (decoy SD) — positive means actives score better on average.",
        "roc_auc": round(roc_auc, 3),
        "pr_auc": round(pr_auc, 3),
        "enrichment_factor": ef,
        "bedroc": bedroc,
        "bedroc_note": "alpha=20 (RDKit/literature default) — weights early-ranked (best-scoring) compounds much more heavily than a plain ROC-AUC does.",
        "run_settings": run_settings,
    }
    if include_plots:
        out["plots"] = {
            "score_distribution": _score_distribution_plot(a_arr, d_arr),
            "roc_curve": _roc_plot(fpr, tpr, roc_auc),
            "pr_curve": _pr_plot(precision, recall, pr_auc, prevalence),
            "enrichment_curve": _enrichment_plot(y_sorted, prevalence),
        }
    return out
