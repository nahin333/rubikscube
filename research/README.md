# COVE-3 and HBEW paper artifacts

[Read the 16-page two-column PDF](paper.pdf) · [Read the Markdown manuscript](REPORT.md) · [Inspect Stage-3 HBEW measurements](results/holonomy-ablation.json) · [cubejs 1.3.2 head-to-head](results/cubejs-holonomy.json) · [Inspect Stage-2 dual-horizon measurements](results/dual-horizon-ablation.json) · [Inspect Stage-1 contour measurements](results/contour-ablation.json)

The paper develops and evaluates **COVE-3** (Compact Output-Verified Exploration for 3×3) and **HBEW** (Holonomy-Guided Bifurcated Eikonal Wavefront Search) across three cumulative research stages:

1. **Stage-1 budget-preserving contour compilation** (`expansion: 'contour'`, [contour-ablation.json](results/contour-ablation.json), [budget-witness.json](results/budget-witness.json)), plus two count-preserving follow-up extensions with published negative latency results ([failure-replay.json](results/failure-replay.json), [corridor-traversal.json](results/corridor-traversal.json)).
2. **Stage-2 potential-free dual-horizon compilation** (`expansion: 'dual'`, [dual-horizon-ablation.json](results/dual-horizon-ablation.json), [horizon2-witness.json](results/horizon2-witness.json), [cubejs-dual-horizon.json](results/cubejs-dual-horizon.json)), combining 24-bit Cayley-$K_4$ clique-syndrome SWAR compilation in Phase 1, a unified potential-free coboundary Horizon-2 dictionary in Phase 2 (`24,743` shared entries—smaller than Stage-1 COVE-3), three-tier batched ghost accounting, and a communication-complexity proof that Horizon 2 is maximal for factored unary exact accounting.
3. **Stage-3 HBEW: Holonomy-Guided Bifurcated Eikonal Wavefront Search** (`CompactSolver.solveHolonomy`, `+2.54 MiB` extra = `14.03 MiB` total; [holonomy-ablation.json](results/holonomy-ablation.json), [cubejs-holonomy.json](results/cubejs-holonomy.json)), a newly proposed 3×3 solving algorithm formulated on the principal $H$-bundle $\pi: G \to G/H$ combining UD-slice penultimate funnels (`4/495` and `55/495`), zero-extra-expansion $K_2$ quarter-turn sister-fiber involution with exact joint coboundary bounds, 4-bit backward Bellman phase-crossing potentials (`683,640` B), and $\sigma_2$-defect-stratified Eikonal wavefront evolution with proven bounded-shell optimality over $\mathcal{T}_H^{\le D_1}(s)$.

The manuscript includes **ten propositions and one optimality theorem** with proofs, **three algorithms**, a Big-O comparison, exact byte-level storage derivations, **six multi-panel figures**, **nine tables**, published negative results (including subgroup-conjugation wormholes $\mathcal{W}_5$), and explicit novelty and limitation boundaries ([NOVELTY.md](NOVELTY.md)).

To rebuild all six paper figures from the archived JSON measurements, run from the repository root:

```sh
python3 research/plot_results.py
```

To rebuild `paper.tex` and `paper.pdf`, install Pandoc and Tectonic and run from `research/`:

```sh
pandoc REPORT.md --from=markdown+tex_math_dollars --to=latex --standalone --template=paper-template.tex --lua-filter=paper-filter.lua --number-sections --no-highlight -o paper.tex
tectonic paper.tex
```

`paper.tex` and `references.bib` are included. Layout and bibliography use the [official CVPR 2026 author-kit style](https://github.com/cvpr-org/author-kit) at commit `291758547e923160eb4d37079b7b9f0dfce82355`, with Liberation Serif/Sans/Mono for Unicode-capable typesetting. This is a formatting choice only: the paper has not been submitted to or accepted by CVPR.
