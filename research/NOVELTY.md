# COVE-3: proposed novelty and prior-work review

Review date: **2026-10-22** (updated **2026-10-24** and **2026-11-05**). This is a focused technical review, not an exhaustive literature survey or certification of worldwide priority.

## Stage-1 contribution (2026-10-22)

**Budget-preserving contour compilation:** compile a scalar, paired-abstraction phase-2 solver into a dictionary of exact distance/operator-filter signatures, select successors by mask intersection, and batch-charge omitted calls so fixed-order outputs, logical visit limits, endpoint abandonment, and count checkpoints follow the original scalar policy. Equivalence excludes an intervening real-time guard.

This foundation is preserved in [compact-solver.js](../compact-solver.js) (`expansion: 'contour'`). [Propositions 1 and 2](REPORT.md#42-exact-contour-filters) cover exact selection and count-budget equivalence. The [Stage-1 matched-output experiment](results/contour-ablation.json) and [budget-policy counterexample](results/budget-witness.json) make the initial compiler and its purpose reviewable.

| Source | Known overlap | Boundary of Stage-1 proposal |
| :--- | :--- | :--- |
| [Kociemba: coordinates](https://kociemba.org/math/twophase.htm) and [pruning tables](https://kociemba.org/math/pruning.htm) | Two-phase decomposition, coordinate heuristics, mod-3 distance compression | Retains the decomposition and bounds; compiles operator masks and scalar budget accounting |
| [Felner et al., AAAI 2012](https://doi.org/10.1609/aaai.v26i1.8137) | Selective generation and delta/operator-effect PDBs | Dictionary-coded paired signatures combined with exact scalar count-budget simulation |
| [Sturtevant, Felner and Helmert, AAAI 2017](https://doi.org/10.1609/aaai.v31i1.10665) | Compression of heuristic values | Losslessly shares complete distance/filter signatures and preserves the capped-search policy |

## Follow-up negative results (2026-10-24)

Two research constructions were implemented independently of the deployed solver:

- **Exact-cost failure replay:** cache an exhausted subtree's exact logical traversal cost, keyed by phase-2 coordinates, remaining depth, and last face; replay only when the remaining cost fits both budgets.
- **Deferred-charge chain traversal:** follow a unique surviving successor iteratively while accumulating the counts of later rejected siblings, charging that debt only on failure.

[Akagi, Kishimoto and Fukunaga (2010)](https://doi.org/10.1609/socs.v1i1.18164) and [Lammich and Neumann (2015)](https://doi.org/10.1145/2676724.2693165) establish prior foundations for IDA\* transposition reuse and formal DFS refinement. On 500 separately seeded states, both variants preserved outputs and logical counts but increased solve latency ([Section 6.5](REPORT.md#65-follow-up-extensions-preserved-behavior-without-a-speedup)), showing that reducing recursion frames without reducing random table lookups or Horizon-2 dead expansions did not speed up execution.

---

## Stage-2 review (2026-11-05): Potential-free coboundary & Cayley-clique dual-horizon compilation

### Diagnostic bottleneck motivating Stage 2

Audit of Stage-1 COVE-3 (`26,722,082` generated visits across `contour-ablation.json`) identified two structural barriers that prevented 1-step signature dictionaries from progressing further:

1. **Phase-1 signature explosion ($b_1 = 18$):** Naive contour signatures $(d, M_0, M_-)$ require $4 + 18 + 18 = 40$ bits (exceeding 32-bit bitwise words) and yield `623,078` (`coSl`) and `633,263` (`eoSl`) distinct signatures—overflowing 16-bit dictionary indices (`65,536`) by nearly $10\times$. Consequently, Phase 1 remained completely uncompiled (`9,083,786` scalar visits, `92.48%` immediately pruned).
2. **Phase-2 Horizon-1 "ghost admissibility" (`53.81%` dead-on-arrival expansions):** Of COVE-3's `17,638,253` generated Phase-2 visits, `9,490,757` (`53.81%`) enter recursion only to find an empty intersection $A_{\text{face}(j)} \cap F_C(c', r-1) \cap F_E(e', r-1) = \emptyset$: `49.60%` from unary canonical-move starvation (e.g., opposite-face canonical ordering forbids 6 of 10 moves after `D`) and `50.40%` from coupled cross-abstraction disjointness.

### Proposed Stage-2 contribution

We propose **potential-free dual-horizon compilation**, now shipped as the default compiler in [compact-solver.js](../compact-solver.js) (`expansion: 'dual'`), comprising three coupled mechanisms:

1. **Cayley-$K_4$ clique-syndrome SWAR encoding and closed-form coboundary law (Phase 1):** In the half-turn metric, the four coset states $\{x, F(x), F^2(x), F^3(x)\}$ of any outer face form a $K_4$ clique in every abstract Cayley graph, implying $M_-^{(f)}(a) \ne \mathbf{0} \implies M_0^{(f)}(a) = \mathbf{1}$ (`15` realizable patterns per face instead of $2^6 = 64$). Packing each face into a 4-bit syndrome $(\mu_f, v_f)$ compresses all 18 Phase-1 operators into **24 potential-free bits** (3 bytes/state, zero stored distance bits), decodes all 6 faces in parallel via constant-time SWAR (`mask3 = ((w >>> 3) & 0x111111) * 7`), and updates child distances via the exact linear coboundary identity $D(\delta(a, 3f+q)) - D(a) = 1 - \mu_f(a) - v_{f,q}(a)$ ([Proposition 4](REPORT.md#48-cayley-clique-syndrome-swar-and-closed-form-coboundary-law)).
2. **Potential-free unified coboundary Horizon-2 dictionary (Phase 2):** Omitting scalar distance $D(a)$ completely—recovering root potentials once per endpoint by a steepest-descent 1-form walk along $M_-$ and integrating child distances via $D(\delta(a,j)) = D(a) - [j \in M_-(a)] + [j \notin M_0(a)]$—quotients signatures across distance level sets and frees 10 bits in the 32-bit dictionary word for the **unary canonical Horizon-2 survival mask** $M_-^{(2)}(a) = \{j \in M_-(a) : A_{\text{face}(j)} \cap M_-(\delta(a,j)) \ne \emptyset\}$. Merging both Phase-2 abstractions into one shared dictionary yields **`24,743` total entries (`98,972` bytes)**—`39.07%` fewer signatures and `62,440` fewer persistent Phase-2 bytes than COVE-3's 1-step contour dictionaries (`40,609` entries), even while encoding 2-step lookahead ([Proposition 5](REPORT.md#49-potential-free-unified-coboundary-horizon-2-dictionary)).
3. **Three-tier Horizon-2/3 ghost accounting and communication-complexity barrier:** Whereas Horizon-1 rejections incur `1` scalar visit, Horizon-2 ghosts incur $1 + |A_{\text{face}(j)}|$ visits and hoisted children annihilated by unary $M_-^{(2)}$ incur $1 + |A_{\text{face}(j)}| + \sum_{k \in H_1(y)} |A_{\text{face}(k)}|$ visits (certifying **3-step subtree exhaustion**). A 1-KiB lookup table (`extraDead2`) batch-charges unary ghosts in $O(1)$ without child lookups, while surviving moves short-circuit second-abstraction lookups whenever the first abstraction's mask vanishes ([Proposition 6](REPORT.md#410-multi-tier-ghost-accounting-and-the-horizon-2-barrier)). By reduction from two-party set-disjointness / inner-product communication complexity, Horizon 2 is proved to be the **unique maximal lookahead depth** at which factored unary parent summaries can certify subtree exhaustion and exact scalar visit counts without constructing coupled child coordinates ([Proposition 7](REPORT.md#410-multi-tier-ghost-accounting-and-the-horizon-2-barrier)).

### Additional primary sources examined for Stage 2

| Source | Known overlap | Boundary of Stage-2 proposal |
| :--- | :--- | :--- |
| [Goldenberg et al., JAIR 2014](https://doi.org/10.1613/jair.4171) (*Enhanced Partial Expansion A\**) | Domain-specific and compressed PDB operator-selection functions (OSFs); notes multi-step OSF lookahead typically balloons table size | Does not eliminate scalar potentials via 1-form steepest-descent recovery, quotient level sets to fit canonical Horizon-2 masks in fewer dictionary entries than 1-step OSFs, exploit Cayley $K_4$ clique syndromes via SWAR, or simulate multi-tier scalar node budgets |
| [Breyer & Korf, AAAI 2010](https://doi.org/10.1609/aaai.v24i1.7535) (*1.6-Bit Pattern Databases*) and Kociemba mod-3 pruning | Storing relative / mod-3 heuristic values and reconstructing absolute distances by walking toward $h=0$ | Stores compressed scalar $h \bmod 3$ potentials requiring runtime neighbor scans to recover $\Delta h$; our representation stores **zero potential bits** and instead stores explicit coboundary operator masks $(M_-, M_0, M_-^{(2)})$ and $K_4$ syndromes for $O(1)$ bit-parallel pruning |
| Modern two-phase implementations (`cs0x7f/min2phase`, Rokicki `twophase`) | Pre-move / conjugate lookup optimizations, mod-3 nibble tables, move-mask tables | Do not compile potential-free unified Horizon-2 coboundary dictionaries, 24-bit Cayley-$K_4$ SWAR syndromes, or multi-tier exact scalar-trace budget accounting |

### Search scope and honest priority boundaries

Targeted searches in Stage 2 covered: `"Enhanced Partial Expansion" "two-step" OR "lookahead" "pattern database"`; `"1.6-bit pattern databases" Breyer Korf`; `"coboundary" OR "1-form" "pattern database" heuristic search`; `"potential-free" pattern database operator selection`; `"clique" syndrome SWAR Rubik pruning table`; and `"communication complexity" pattern database lookahead disjointness`.

Within all reviewed sources, we found no prior publication documenting: (i) potential-free coboundary quotienting of operator-selection dictionaries with steepest-descent root recovery to embed canonical Horizon-2 survival masks in smaller dictionaries than 1-step contours; (ii) the 4-bit Cayley-$K_4$ clique-syndrome SWAR encoding and its linear coboundary recurrence $1 - \mu_f - v_{f,q}$; (iii) multi-tier batched scalar-visit accounting across Horizons 1–3; or (iv) the communication-complexity barrier proving Horizon 2 maximal for factored unary exact accounting. As in Stage 1, this documents what was verified against reviewed literature; it does **not** certify worldwide priority across all unpublished codebases, theses, or non-English venues, nor does it alter the exponential worst-case time complexity of two-phase IDA\*.
