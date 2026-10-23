# COVE-3 paper artifacts

[Read the two-column PDF](paper.pdf) · [Read the Markdown manuscript](REPORT.md) · [Inspect the primary measurements](results/contour-ablation.json)

The paper evaluates **budget-preserving contour compilation in COVE-3** (Compact Output-Verified Exploration for 3×3). Its primary comparison freezes the actual previous scalar solver and requires identical returned moves and logical visit counts. It includes a dictionary-only ablation, a separate cubejs comparison, explicit contributions, prior selective-generation work, two proofs, a Big-O comparison, storage derivations, three figures, five tables, and limitations. The [project README](../README.md#reproduce-the-paper-artifacts) provides reproduction commands and environment details.

The [proposed-novelty review](NOVELTY.md) distinguishes the budget-preserving compiler from reviewed prior techniques and records the remaining priority-review gaps. The [budget counterexample](results/budget-witness.json) demonstrates why removing rejected visits without accounting changes the capped-search policy. Neither document claims certified worldwide priority.

To rebuild the figures, install Python 3 with NumPy and Matplotlib, then run from the repository root:

```sh
python3 research/plot_results.py
```

To rebuild the paper, install Pandoc and Tectonic, then run from `research/`:

```sh
pandoc REPORT.md --from=markdown+tex_math_dollars --to=latex --standalone --template=paper-template.tex --lua-filter=paper-filter.lua --number-sections --no-highlight -o paper.tex
tectonic paper.tex
```

`paper.tex` and `references.bib` are included. The layout and bibliography use the [official CVPR 2026 author-kit style](https://github.com/cvpr-org/author-kit) at commit `291758547e923160eb4d37079b7b9f0dfce82355`, with Liberation Serif/Sans/Mono for Unicode-capable typesetting. This is a formatting choice only: the paper has not been submitted to or accepted by CVPR. The figures use [matched-output measurements](results/contour-ablation.json) and the [separate external-baseline rerun](results/cubejs-contours.json). The earlier scalar comparison remains in `results/solver-comparison.json` for historical context.
