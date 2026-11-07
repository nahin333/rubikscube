![Rubik's Graph Lab — explore shortest paths, solve longer scrambles](docs/banner.svg)

<p align="center">
  <a href="https://nahin333.github.io/rubikscube/"><strong>Open the live lab →</strong></a>
  &nbsp; · &nbsp; <a href="research/paper.pdf">Read the PDF paper</a>
  &nbsp; · &nbsp; <a href="research/REPORT.md">Read the mathematics</a>
  &nbsp; · &nbsp; <a href="research/results/holonomy-ablation.json">Inspect Stage-3 HBEW measurements</a>
  &nbsp; · &nbsp; <a href="research/results/cubejs-holonomy.json">cubejs 1.3.2 head-to-head</a>
</p>

Turn a scramble into a graph, watch algorithms explore it, and replay a verified solution on a 3D cube. **COVE-3** and **HBEW** solve longer 3×3 scrambles in your browser; BFS, bidirectional BFS, and A\* expose shortest-path search on smaller problems.

> **Three cumulative stages: two exact output-equivalent search compilations + a novel principal-bundle solving algorithm.**
> - **Stage 1 (1-step Phase-2 contour dictionary):** Cut median solve latency from **6.19 ms to 2.20 ms** on 500 states (`seed 0x913b5e`), avoiding **79.33%** of recursive visits (`7.55 MiB` vs. `5.55 MiB` scalar).
> - **Stage 2 (Potential-Free Dual-Horizon Clique-Syndrome & Coboundary Compilation):** Eliminates stored scalar distances from **both** phases. On a held-out 500-state corpus (`seed 0xd48a63`), it cuts generated visits by **68.47% beyond Stage-1 COVE-3** (**93.62% vs. scalar**, `131.54M → 8.39M`), reaches **1.43 ms** median latency (`11.49 MiB`), and returns **100% identical move sequences, phase splits, and logical node budgets**.
> - **Stage 3 (HBEW — Holonomy-Guided Bifurcated Eikonal Wavefront Search, newly proposed 3×3 algorithm):** Reformulates two-phase solving on the principal $H$-bundle $\pi: G \to G/H$ (`+2.54 MiB`, `14.03 MiB` total). On a fresh 500-state uniform corpus (`seed 0x5e71a9`), `hbewDefault` cuts mean solution length by **2.368 moves** vs. COVE-3 (**22.944 → 20.576**, **500/500 states ≤ 22 moves**, **47.0% ≤ 20**) in **4.84 ms** median (`hbewExact` proves bounded-shell optimality over $\mathcal{T}_H^{\le D_1}(s)$ at **20.524** mean moves). On 200 shared scrambles against external **`cubejs 1.3.2`**, `hbewDefault` **strictly Pareto-dominates `cubejs` on every metric**: faster cold init (**1,162 ms vs. 1,247 ms**), **6.54× faster median** (**4.70 ms vs. 30.70 ms**, `192/200` faster), **15.71× faster P95** (**10.79 ms vs. 169.43 ms**), **29.3× lower max spike**, and **1.25 fewer moves** (**20.46 vs. 21.71**, **51.0% vs. 4.0% ≤ 20**).

## What we contributed

### Stage 3 — HBEW: Holonomy-Guided Bifurcated Eikonal Wavefront Search (`solveHolonomy`)

Standard single-endpoint COVE-3 commits greedily to early subgroup-$H$ landings and averages `22.94` moves; conversely, Kociemba's continued-shrinking IDA\* (`cubejs 1.3.2`) reaches `21.71` moves at `30.70 ms` median with `>1 s` tail spikes because coset paths induce chaotic holonomy permutations in $H$. Rather than importing multi-axis coordinate rotations or inverse pre-moves (`min2phase`), **HBEW** attacks the fiber-holonomy bottleneck directly via four proven mathematical mechanisms:

1. **Principal $H$-bundle defect decomposition & UD-slice penultimate funnel ([Proposition 8](research/REPORT.md#411-principal-h-bundle-defect-decomposition-and-ud-slice-funnel)).** Every Phase-1 word $w$ landing on $G/H$ induces a fiber holonomy $h(w) \in H$ whose Phase-2 residual decomposes into corner/UD-edge parity-locked core $\Phi_{\mathrm{core}}(h)$ and UD-slice defect $\Phi_{\mathrm{sl}}(h)$. Every minimal entry into $H$ traverses one of **4 quarter-turn entry slices** (`4/495` of $G/H$) at depth $d_1 - 1$ and **55 funnel slices** (`55/495`) at $d_1 - 2$, bounding $\Phi_{\mathrm{sl}}(h)$ one move before $H$.
2. **$K_2$ quarter-turn sister-fiber involution & joint coboundary ([Proposition 9](research/REPORT.md#412-k2-quarter-turn-sister-fiber-involution-and-joint-coboundary)).** Each entry slice admits a canonical sister involution $q \leftrightarrow q^{-1} = q \cdot f^2$ generating two distinct subgroup fibers $y_+ = x q$ and $y_- = x q^{-1} = y_+ f^2$ from a **single shared Phase-1 prefix**, coupled by the exact Phase-2 coboundary law $\Phi_{\mathrm{core}}(y_-) - \Phi_{\mathrm{core}}(y_+) \in \{-1, 0, +1\}$ (`0` extra Phase-1 expansions; exhaustively verified across all `7,741,440` sister transitions).
3. **Admissible phase-crossing Bellman potentials & inline zero-slack sieve ([Proposition 10](research/REPORT.md#413-phase-crossing-bellman-potentials-and-inline-zero-slack-sieve)).** A backward Bellman operator over corner permutations modulo $H$-stabilizers (`40,320 × 67` penultimate slice-orientations, `1,367,280` 4-bit nibbles = `683,640` B) gives a closed-form lower bound $g + r + \Psi_r(\mathrm{cp}(x), \mathrm{sl}(x), \mathrm{co}(x)) \le |w \cdot u|$ before Phase 2 is ever entered, paired with an $O(1)$ zero-slack coboundary check (`h2s0`) for $d_2 \le 3$.
4. **$\sigma_2$-defect-stratified Eikonal wavefront & bounded-shell optimality ([Theorem 1](research/REPORT.md#414-defect-stratified-eikonal-wavefront-and-bounded-shell-optimality)).** Harvested subgroup endpoints $(y_i, d_1(y_i), \ell_0(y_i))$ evolve simultaneously inside min-total-horizon buckets $F = d_1 + d_2$, stratified within each bucket by Phase-2 slack budget $\sigma_2 = F - d_1 - \ell_0$, guaranteeing **exact optimality over $\mathcal{T}_H^{\le D_1}(s)$** when target stopping is disabled (`hbewExact`, $\tau = 0$).

### Stages 1 & 2 — Potential-Free Dual-Horizon Coboundary Compilation (`COVE-3`)

1. **Cayley-$K_4$ clique-syndrome SWAR compilation (Phase 1).** Each outer face's coset forms a $K_4$ clique in every half-turn abstract Cayley graph ($M_-^{(f)} \ne \mathbf{0} \implies M_0^{(f)} = \mathbf{1}$), collapsing 64 move-mask pairs to **15 realizable 4-bit syndromes** per face. All 18 Phase-1 moves pack into **24 potential-free bits** (3 B/state) with closed-form coboundary integration $D(\delta(a,3f+q)) - D(a) = 1 - \mu_f(a) - v_{f,q}(a)$.
2. **Potential-free unified coboundary Horizon-2 dictionary (Phase 2).** Omitting scalar potentials frees 10 bits per 32-bit word for unary Horizon-2 survival masks $M_-^{(2)}$, compressing both Phase-2 abstractions into **24,743 shared signatures (`98,972` B)**—**39.07% fewer entries** than Stage-1 COVE-3 (`40,609` entries).
3. **Three-tier ghost accounting & the Horizon-2 barrier ([Propositions 6 & 7](research/REPORT.md#410-multi-tier-ghost-accounting-and-the-horizon-2-barrier)).** Multi-tier charges preserve exact scalar visit counts (`horizon2-witness.json`), and a communication-complexity reduction proves **Horizon 2 is maximal** for factored unary exact accounting.
4. **Published negative results that guided all three stages.** Exact-cost failure replay and chain traversal ([Section 6.5](research/REPORT.md#65-follow-up-extensions-preserved-behavior-without-a-speedup)) isolated working-set locality in Stage 2; in Stage 3, subgroup-conjugation wormholes $\mathcal{W}_5 = \{h \in H : d_H(h) \ge 6,\; d_G(h) \le 5\}$ yielded `0/200` hits inside optimal coset funnels ([NOVELTY.md](research/NOVELTY.md)), redirecting HBEW toward $K_2$ sister holonomy and $\Psi$-potentials.

### Proposed technical novelty and honest boundaries

Reviewed against Korf (1997), Kociemba, Rokicki/`min2phase`, Breyer & Korf (AAAI 2010), Felner et al. (AAAI 2012), Goldenberg et al. (JAIR 2014), Sturtevant et al. (AAAI 2017), Akagi et al. (SoCS 2010), Lammich & Neumann (CPP 2015), and Sethian (PNAS 1996) in [research/NOVELTY.md](research/NOVELTY.md): Stages 1–2 innovate in potential-free coboundary search compilation with identical scalar outputs, while Stage 3 proposes **HBEW** as a distinct two-phase solving algorithm on $\pi: G \to G/H$. Theorem 1 proves exact optimality over the **bounded Phase-1 shell** $\mathcal{T}_H^{\le D_1}(s)$, **not** unrestricted God's-number optimality over $G$ (`0.2%` of `hbewExact` states at $D_1 = 11$ take 23 moves when a globally shorter path never enters $H$ within 11 moves). Certified worldwide priority across unpublished solvers and sub-exponential worst-case complexity are **not** claimed.

## Stage-3 HBEW evaluation (`seed 0x5e71a9` 500 states & `cubejs 1.3.2` 200 scrambles)

![Stage-3 HBEW solution lengths, latency CDFs vs. cubejs 1.3.2, and component ablations](research/figures/holonomy-wavefront.svg)

| Corpus / Solver | Persistent tables | Mean / max moves | ≤ 20 / ≤ 22 | Lifts / state | Median latency | P95 / Max latency |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| **500 uniform (`0x5e71a9`):** `cove3Dual` | **11.49 MiB** | 22.944 / 25 | 3.2% / 30.0% | 1.0 | **1.053 ms** | **5.23** / 17.5 ms |
| **500 uniform:** `hbewFast` (`δ=1, τ=20`) | 14.03 MiB | 20.774 / **22** | 36.0% / **100%** | 147.3 | 3.786 ms | 8.45 / 22.8 ms |
| **500 uniform:** `hbewDefault` (`δ=2, τ=20`) | 14.03 MiB | 20.576 / **22** | **47.0%** / **100%** | 240.9 | 4.840 ms | 11.40 / 33.4 ms |
| **500 uniform:** `hbewExact` (`δ=2, τ=0`) | 14.03 MiB | **20.524** / 23 | **47.0%** / 99.8% | 349.3 | 5.413 ms | 10.63 / **16.2 ms** |
| **200 scrambles (`0x74bc39`):** `cubejs 1.3.2` | *(~5.2 MiB JS)* | 21.71 / **22** | 4.0% / **100%** | — | 30.698 ms | 169.43 / 1,039.4 ms |
| **200 scrambles:** `cove3Dual` | **11.49 MiB** | 22.77 / 26 | 4.5% / 41.0% | 1.0 | **1.606 ms** | **8.62** / 23.5 ms |
| **200 scrambles:** `hbewFast` (`δ=1, τ=20`) | 14.03 MiB | 20.68 / **22** | 41.0% / **100%** | 145.4 | 4.398 ms | 12.11 / 41.8 ms |
| **200 scrambles:** `hbewDefault` (`δ=2, τ=20`) | 14.03 MiB | 20.46 / **22** | **51.0%** / **100%** | 226.4 | 4.697 ms | 10.79 / 35.5 ms |
| **200 scrambles:** `hbewExact` (`δ=2, τ=0`) | 14.03 MiB | **20.45** / 23 | **51.0%** / 99.5% | 342.1 | 5.933 ms | 10.38 / **13.5 ms** |

Compared against an unpruned multi-shell baseline (`unprunedMultiShell`, [holonomy-ablation.json](research/results/holonomy-ablation.json)), full HBEW cuts harvested subgroup-$H$ lifts by **74.4%** (`940.0 → 240.9`), reduces Phase-1 visits by **22.1%** (`41,305 → 32,181`), lowers paired mean latency by **11.1%** (`6.02 → 5.35 ms`), and suppresses pathological tail spikes by up to **154.7×**.

## Held-out Stage-2 COVE-3 evidence (`seed 0xd48a63`, 500 states × 5 repeats)

![Held-out paired latency, empirical distributions, and five-stage ablation ladder](research/figures/dual-horizon.svg)

| Study / Configuration | Persistent tables | Generated visits | Median latency | P95 latency | Mean moves |
| :--- | ---: | ---: | ---: | ---: | ---: |
| Primary 3-way: Frozen scalar (`e7023a8d`) | **5.55 MiB** | 131,538,403 | 5.583 ms | 28.388 ms | 22.962 |
| Primary 3-way: Pinned COVE-3 (`f26aa421`) | 7.55 MiB | 26,601,908 | 2.574 ms | 10.764 ms | 22.962 |
| Primary 3-way: Potential-free Dual (`dual`) | 11.49 MiB | **8,388,304** | **1.838 ms** | **9.024 ms** | 22.962 |
| Pairwise A: Pinned COVE-3 (`contour`) | 7.55 MiB | 26,601,908 | 2.143 ms | 9.190 ms | 22.962 |
| Pairwise A: Coboundary H2-only (`h2only`) | **7.49 MiB** | **16,712,753** | **2.040 ms** | **8.539 ms** | 22.962 |
| Pairwise B: 32-bit Clique-SWAR (`dual32`) | 13.48 MiB | 8,388,304 | 1.456 ms | 7.617 ms | 22.962 |
| Pairwise B: Potential-free Dual (`dual`) | **11.49 MiB** | 8,388,304 | **1.430 ms** | **7.565 ms** | 22.962 |

The original Stage-1 evaluation ([contour-ablation.json](research/results/contour-ablation.json)), Stage-2 witness and external comparison ([dual-horizon-ablation.json](research/results/dual-horizon-ablation.json), [horizon2-witness.json](research/results/horizon2-witness.json), [cubejs-dual-horizon.json](research/results/cubejs-dual-horizon.json)), and negative follow-up archives ([failure-replay.json](research/results/failure-replay.json), [corridor-traversal.json](research/results/corridor-traversal.json)) remain preserved verbatim.

## Run locally

```sh
python3 -m http.server 8000
```

Open **http://localhost:8000**. Select **COVE-3 (two-phase)**, **HBEW (holonomy)**, or click **Compare COVE-3 vs HBEW** on any 3×3 scramble to inspect the live Principal $H$-Bundle Holonomy Fiber Fan and side-by-side latency/move-count comparison.

## Verify every theorem, certificate, and benchmark

```sh
node tests/search.cjs
node tests/compact-solver.cjs
node tests/contour-pruning.cjs
node tests/budget-witness.cjs
node tests/research-extensions.cjs
node tests/dual-horizon.cjs --witness-output research/results/horizon2-witness.json
node tests/holonomy-solver.cjs
node tests/benchmark-dual-horizon.cjs --output research/results/dual-horizon-ablation.json
node tests/benchmark-holonomy.cjs --output research/results/holonomy-ablation.json
```

| Verification check | Coverage |
| :--- | :--- |
| Stage-3 HBEW theorems ([Propositions 8–10, Theorem 1](research/REPORT.md#411-principal-h-bundle-defect-decomposition-and-ud-slice-funnel)) | `4/495` & `55/495` slice funnels, `18,920` lifts, all `7,741,440` $K_2$ sister coboundaries, `1,367,280` $\Psi$-entries, `25 × 6` exact bounded-shell checks |
| Stage-3 held-out & external `cubejs` benchmarks | 500 states (`0x5e71a9`, 5 repeats + 5 ablations) + 200 scrambles vs. `cubejs 1.3.2` (`0x74bc39`, 3 repeats) |
| Phase-1 Cayley-$K_4$ & SWAR certificates | All `37,733,850` transitions (`coSl`, `eoSl`), `15/15` syndromes, linear coboundary law |
| Phase-2 coboundary & 1-form walks | All `19,353,600` transitions (`cpSp`, `epSp`), `h2s0` masks, all `1,935,360` root walks |
| Multi-mode trace & budget equivalence | 439 fixtures × 4 modes + 139 global node-cap boundaries × 3 modes + constructive witnesses |
| Exact search, practical & browser E2E | 2,013 BFS/A\* checks, 219 scrambles, Chromium desktop/mobile HBEW + COVE-3 comparison, worker recovery |

Rebuild all six paper figures and the 16-page two-column PDF paper:

```sh
python3 research/plot_results.py
cd research
pandoc REPORT.md --from=markdown+tex_math_dollars --to=latex --standalone --template=paper-template.tex --lua-filter=paper-filter.lua --number-sections --no-highlight -o paper.tex
tectonic paper.tex
```

## Scope and limitations

Supported models are **2×2 and 3×3**, with compiled two-phase and HBEW solving for **3×3 only**. COVE-3 enforces finite node and wall-clock caps; HBEW proves bounded-shell optimality over $\mathcal{T}_H^{\le D_1}(s)$ (`hbewExact`) rather than unrestricted 20-move God's-number optimality over $G$, and retains exponential worst-case search complexity. Measurements reflect single-machine Node 18.19.1 / Chromium testing on AMD EPYC 9254.

---

**Read next:** [PDF paper →](research/paper.pdf) · [Method, proofs and comparisons](research/REPORT.md) · [Novelty review](research/NOVELTY.md) · [Paper artifact guide](research/README.md)
