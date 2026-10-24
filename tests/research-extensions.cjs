'use strict';
const assert = require('node:assert/strict');
const S = require('../compact-solver.js');
const R = require('./replay-candidate.cjs');
const C = require('./corridor-candidate.cjs');
const { P, E, uniformStates } = require('./cube-fixtures.cjs');
const T = S.build(P);
const cases = [{ stickers: P.solved }, ...P.moves.map((_, mi) => ({ stickers: E.applyMove(P, P.solved, mi) })), ...uniformStates(150, 0x61bcd7)];
let hardest, total = -1, hits = 0, corridors = 0;
for (const f of cases) {
  const reference = S.solve(T, f.stickers);
  for (const solver of [R, C]) {
    const result = solver.solve(T, f.stickers);
    assert.deepEqual(result.moves, reference.moves);
    assert.equal(result.nodes, reference.nodes); assert.equal(result.split, reference.split);
    assert.equal(result.nodes, result.generatedNodes + result.skippedNodes);
    let state = f.stickers;
    for (const mi of result.moves) state = E.applyMove(P, state, mi);
    assert.deepEqual(Array.from(state), Array.from(P.solved));
    hits += result.replayHits || 0; corridors += result.corridorSteps || 0;
  }
  if (reference.nodes > total) { total = reference.nodes; hardest = f.stickers; }
}
assert.ok(hits > 0 && corridors > 0 && total > 250001);
function outcome(solver, maxNodes, extra = {}) {
  const progress = [];
  try {
    const r = solver.solve(T, hardest, { maxNodes, timeoutMs: 120000, ...extra, report: p => progress.push([p.nodes, p.phase1Depth ?? null]) });
    return { moves: r.moves, nodes: r.nodes, split: r.split, progress };
  } catch (e) { return { error: e.message, progress }; }
}
const caps = [0, 1, 10, 2047, 2048, 2049, 65535, 65536, 65537, 249999, 250000, 250001, total - 1, total, total + 1];
for (const cap of caps) {
  const reference = outcome(S, cap);
  assert.deepEqual(outcome(R, cap), reference, `Replay cap ${cap}`);
  assert.deepEqual(outcome(C, cap), reference, `Corridor cap ${cap}`);
  // A two-slot cache causes frequent hash collisions and replacement. Exact
  // keys must prevent incorrect certificate reuse regardless of collisions.
  assert.deepEqual(outcome(R, cap, { replayBits: 1 }), reference, `Collision cap ${cap}`);
}
for (const solver of [R, C]) assert.throws(() => solver.solve(T, hardest, { timeoutMs: 0 }), /time budget/);
console.log(`PASS: ${cases.length} fixtures × 2 extensions, ${caps.length} caps × 3 configurations, exact outputs/counts/progress, collision stress and timeout guards; ${hits} replay hits, ${corridors} corridor steps.`);
