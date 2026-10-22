# COVE-3 paper artifacts

[Read the two-column PDF](paper.pdf) · [Read the Markdown manuscript](REPORT.md) · [Inspect the archived measurements](results/solver-comparison.json)

The paper reports the project-specific **COVE-3** configuration (Compact Output-Verified Exploration for 3×3). It does not claim to invent Kociemba's two-phase method or pattern databases. The paper includes an explicit contributions section, related work and numbered references, mathematical derivations, a systems diagram, a three-panel measurement figure, tables, and limitations.

To rebuild the figures, install Python 3 with NumPy and Matplotlib, then run from the repository root:

```sh
python3 research/plot_results.py
```

To rebuild the paper, install Pandoc and Tectonic, then run from `research/`:

```sh
pandoc REPORT.md --from=markdown+tex_math_dollars --to=latex --standalone --template=paper-template.tex --lua-filter=paper-filter.lua --number-sections --no-highlight -o paper.tex
tectonic paper.tex
```

`paper.tex` is included, so the PDF can also be rebuilt with Tectonic alone. The layout uses the [official CVPR 2026 author-kit style](https://github.com/cvpr-org/author-kit) at commit `291758547e923160eb4d37079b7b9f0dfce82355`, with Liberation Serif/Sans/Mono for Unicode-capable typesetting. This is a formatting choice only: the paper has not been submitted to or accepted by CVPR. The PDF omits shell transcripts for readable two-column typesetting; exact commands remain in the Markdown manuscript. The figures are generated from the archived comparison data, not from new benchmark runs.
