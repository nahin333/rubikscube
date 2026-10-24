# COVE-3: proposed novelty and prior-work review

Review date: **2026-10-22**. This is a focused technical review, not an exhaustive literature survey or certification of worldwide priority.

## Exact proposed contribution

**Budget-preserving contour compilation:** compile a scalar, paired-abstraction phase-2 solver into a dictionary of exact distance/operator-filter signatures, select successors by mask intersection, and batch-charge omitted calls so fixed-order outputs, logical visit limits, endpoint abandonment, and count checkpoints follow the original scalar policy. Equivalence excludes an intervening real-time guard.

This proposal is implemented in [compact-solver.js](../compact-solver.js). [Propositions 1 and 2](REPORT.md#42-exact-contour-filters) cover exact selection and count-budget equivalence. The [matched-output experiment](results/contour-ablation.json) and [budget-policy counterexample](results/budget-witness.json) make the implementation and its purpose reviewable.

## Closest primary sources examined

| Source | Known overlap | Boundary of the present proposal |
| :--- | :--- | :--- |
| [Kociemba: coordinates](https://kociemba.org/math/twophase.htm) and [pruning tables](https://kociemba.org/math/pruning.htm) | Two-phase decomposition, coordinate heuristics, distance compression | We retain the decomposition and bounds; compile this implementation’s operators and budget accounting |
| [Felner et al., AAAI 2012](https://ojs.aaai.org/index.php/AAAI/article/view/8137/7995), especially its iterative-deepening algorithm and Rubik’s Cube section | Selective generation and delta/operator-effect PDBs, with compression suggested | Our proposed distinction is the compact signature dictionary combined with exact scalar count-budget simulation; selective generation alone is not new |
| [Sturtevant, Felner and Helmert, AAAI 2017](https://ojs.aaai.org/index.php/AAAI/article/view/10665/10524) | Compression of heuristic values | Our compiler losslessly shares complete distance/filter signatures and preserves the original capped-search policy |

The reviewed algorithms establish substantial prior foundations. No reviewed source was identified that documents the exact full combination above, including its scalar guard-order and visit-charge contract. This is a finding about the materials reviewed, not proof that another paper, thesis, implementation, or unpublished project does not contain it. Representation choices and dictionary coding may be considered incremental by a reviewer.

## What the evidence establishes

- A concrete algorithm change to this project, rather than a new label for the previous implementation.
- Exact equality of outputs, splits and logical counts across the 500-state primary experiment and additional fixtures.
- An actual latency benefit with a selective-generation ablation, plus an explicit storage and preprocessing cost.
- A constructive negative control: at a 50,375-visit cap, deleting charges changes failure into success on evaluation state 0. This demonstrates the reason for the preserved contract.

The evidence does **not** establish first-ever discovery, superiority to all published solvers, a new worst-case complexity class, or acceptance-level novelty for a particular conference.

## Search scope and unresolved work

Searches covered combinations of: `pattern databases operator selection compression`; `delta pattern databases dictionary`; `selective node generation budget`; `EPE-IDA budget`; `Rubik budget preserving`; and `pattern database logical visits budget`. Primary publisher PDFs were inspected for the closest selective-generation and value-compression methods; Kociemba’s original technical documentation was also consulted. Sparse or absent keyword results were not treated as proof of novelty.

This review is not a complete audit of source histories across modern min2phase implementations, all lossless PDB encodings, all bounded-search literature, patents, theses, or non-English work. Those remain priority-review gaps. A public research claim should remain scoped to the method, theorem, reviewed distinctions, and released results unless those gaps are addressed by a broader review.

## Wording used in the README and paper

> We propose budget-preserving contour compilation: a dictionary representation and selective generator for paired phase-2 abstractions that preserves the scalar solver’s count-budget trace. We establish its correctness contract and measure its execution-time improvement. Selective generation and PDB compression are prior work; worldwide priority of the complete combination is not established.

Avoid: “Nobody has done this before,” “the first selective cube solver,” “a new two-phase theory,” or “provably faster than every existing method.”

## Follow-up review: 2026-10-24

Two additional research constructions are implemented independently of the deployed solver:

- **Exact-cost failure replay.** Cache a complete failed subtree's exact logical traversal cost, keyed by all phase-2 coordinates, remaining depth, and last face. Replay only when the complete remaining cost fits both budgets; retain checkpoints. Proposition 3 establishes the scoped contract. Full keys prevent false hits under replacement and collisions.
- **Deferred-charge chain traversal.** Follow a unique surviving successor iteratively while accumulating the counts of later rejected siblings. Charge that debt only on failure, preserving the original successful-path policy.

[Akagi, Kishimoto and Fukunaga (2010)](https://doi.org/10.1609/socs.v1i1.18164) is a direct precedent for transposition-table reuse and careful correctness conditions. Its publisher PDF was reviewed. [Lammich and Neumann (2015)](https://doi.org/10.1145/2676724.2693165) studies formal DFS refinement, including recursive and tail-recursive forms. These sources preclude claiming caching or iterative traversal as new general techniques. Follow-up searches included `IDA* transposition table subtree node count budget preserving search memoization` and `depth first search single successor chain compression tail recursion search algorithm`. This remains a bounded review, not a priority certification.

The proposed extension concerns the exact logical-cost contract and its proof for this solver. On 500 separately seeded states with five repetitions, both implementations preserve outputs and logical counts but increase latency. Failure replay reduces generated visits by only 3.89%, despite replacing 13.46 million logical visits, since many of those visits were already avoided by contours. Chain traversal reduces recursive calls without reducing generated visits. The [follow-up evaluation](REPORT.md#65-follow-up-extensions-preserved-behavior-without-a-speedup) publishes these negative results. Neither candidate is shipped as the browser solver, and neither is described as a breakthrough, new worst-case class, or demonstrated additional speedup.
