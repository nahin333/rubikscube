"""Reproduce the paper figure from archived measurements; no new experiments."""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch
import numpy as np

ROOT = Path(__file__).resolve().parent
data = json.loads((ROOT / "results/solver-comparison.json").read_text())
rows = data["rows"]
baseline = np.array([r["cubejs"]["ms"] for r in rows])
candidate = np.array([r["compact"]["ms"] for r in rows])
delta = np.array([r["compact"]["length"] - r["cubejs"]["length"] for r in rows])
assert len(rows) == 200 and np.all(baseline > 0) and np.all(candidate > 0)
assert np.isclose(np.sort(candidate)[100], data["compact"]["medianMs"])
assert np.isclose(delta.mean(), 1.06)

plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10,
                     "axes.spines.top": False, "axes.spines.right": False,
                     "svg.fonttype": "none", "pdf.fonttype": 42})
fig, axes = plt.subplots(1, 3, figsize=(13, 3.8), layout="constrained")
blue, orange = "#2563a6", "#cc6b26"
lo = min(baseline.min(), candidate.min()) * 0.7
hi = max(baseline.max(), candidate.max()) * 1.4
ax = axes[0]
ax.scatter(baseline, candidate, s=16, alpha=0.65, color=blue, linewidths=0)
ax.plot([lo, hi], [lo, hi], "--", color="0.45", linewidth=1, label="Equal latency")
ax.set(xscale="log", yscale="log", xlim=(lo, hi), ylim=(lo, hi),
       xlabel="cubejs latency (ms)", ylabel="COVE-3 latency (ms)",
       title="(a) Paired latency")
ax.legend(frameon=False, fontsize=9)
ax = axes[1]
for times, label, color in [(baseline, "cubejs 1.3.2", orange), (candidate, "COVE-3", blue)]:
    ax.step(np.sort(times), np.arange(1, len(times) + 1) / len(times),
            where="post", label=label, color=color, linewidth=1.8)
ax.set(xscale="log", xlabel="Solve latency (ms)", ylabel="Empirical cumulative fraction",
       ylim=(0, 1.02), title="(b) Latency distribution")
ax.legend(frameon=False, fontsize=9, loc="lower right")
ax = axes[2]
values, counts = np.unique(delta, return_counts=True)
ax.bar(values, counts, width=0.8, color=blue)
ax.axvline(0, color="0.45", linestyle="--", linewidth=1)
ax.set(xlabel="Extra moves: COVE-3 − cubejs", ylabel="Number of cases",
       title="(c) Solution-length tradeoff", xticks=values)
for ax in axes:
    ax.grid(axis="y", alpha=0.15)
    ax.set_axisbelow(True)
out = ROOT / "figures"
out.mkdir(exist_ok=True)
for extension in ("svg", "pdf", "png"):
    fig.savefig(out / f"solver-comparison.{extension}", dpi=200)
plt.close(fig)

# Conceptual systems diagram; the evaluation plot above is data-driven.
fig, ax = plt.subplots(figsize=(13, 2.55), layout="constrained")
ax.set_xlim(0, 13)
ax.set_ylim(0, 2.55)
ax.axis("off")

def stage(x, y, width, title, detail, fill):
    ax.add_patch(FancyBboxPatch((x, y), width, 0.78,
                                boxstyle="round,pad=0.08,rounding_size=0.1",
                                facecolor=fill, edgecolor="#344054", linewidth=1))
    ax.text(x + width / 2, y + 0.53, title, ha="center", va="center",
            fontsize=11, fontweight="bold", color="#12243b")
    ax.text(x + width / 2, y + 0.22, detail, ha="center", va="center",
            fontsize=8.5, color="#344054")

def arrow(x1, x2, y=1.27):
    ax.add_patch(FancyArrowPatch((x1, y), (x2, y), arrowstyle="-|>",
                                 mutation_scale=13, color="#475467", linewidth=1.4))

stage(0.12, 0.88, 2.1, "Symbolic input", "typed turns / corrected stickers", "#eaf2fb")
stage(2.61, 0.88, 1.72, "Validate", "piece and parity checks", "#eaf2fb")
stage(4.72, 0.88, 1.72, "Phase 1", "reach subgroup H", "#e7f4f1")
stage(6.83, 0.88, 1.72, "Phase 2", "solve inside H", "#e7f4f1")
stage(8.94, 0.88, 1.72, "Verify", "cubies + sticker replay", "#fff0df")
stage(11.05, 0.88, 1.72, "Output", "solution or explicit failure", "#eaf2fb")
for left, right in [(2.22, 2.58), (4.33, 4.69), (6.44, 6.80),
                    (8.55, 8.91), (10.66, 11.02)]:
    arrow(left, right)
ax.text(6.58, 2.19, "Browser worker: generated transition tables + four paired distance tables",
        ha="center", va="center", fontsize=10, fontweight="bold", color="#344054")
ax.text(6.58, 0.37, "Bounded candidate search; cancellation remains available. Solver timing excludes input interpretation and table setup.",
        ha="center", va="center", fontsize=9, color="#475467")
for extension in ("svg", "pdf", "png"):
    fig.savefig(out / f"system-pipeline.{extension}", dpi=200)
plt.close(fig)
print(json.dumps({"cases": len(rows), "compact_faster": int(np.sum(candidate < baseline)),
                  "compact_shorter": int(np.sum(delta < 0)), "equal_length": int(np.sum(delta == 0)),
                  "compact_longer": int(np.sum(delta > 0)), "mean_extra_moves": float(delta.mean())}))
