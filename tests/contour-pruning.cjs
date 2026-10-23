'use strict';
const assert = require('node:assert/strict');
const S = require('../compact-solver.js');
const { P, E, baselineSolver, uniformStates } = require('./cube-fixtures.cjs');
const old = baselineSolver().solver, scalar = old.build(P), compiled = S.build(P);
let checked = 0;
// Independently check every encoded successor and all relevant slack cases.
for (const [A, D, ids, dictionary] of [
  [scalar.cp, scalar.cpSp, compiled.cpSp, compiled.cpSignatures],
  [scalar.ep, scalar.epSp, compiled.epSp, compiled.epSignatures],
]) {
  for (let key = 0; key < D.length; key++) {
    const sig = dictionary[ids[key]], d = sig >>> 20;
    assert.equal(d, D[key]);
    const a = Math.floor(key / 24) * 10, b = (key % 24) * 10;
    for (let m = 0; m < 10; m++) {
      const nd = D[A[a + m] * 24 + scalar.sp[b + m]];
      assert.equal(Boolean(sig & (1 << m)), nd <= d - 1);
      assert.equal(Boolean((sig >>> 10) & (1 << m)), nd <= d);
      assert.ok(nd <= d + 1); checked++;
    }
  }
}
assert.equal(compiled.cpSignatures.length, 5806);
assert.equal(compiled.epSignatures.length, 34803);
assert.equal(compiled.tableBytes, 7913041);
console.log(`PASS: ${checked.toLocaleString()} abstract successor certificates checked exhaustively.`);
function replay(stickers, result) {
  let state = stickers;
  for (const mi of result.moves) state = E.applyMove(P, state, mi);
  assert.deepEqual(Array.from(state), Array.from(P.solved));
}
const cases = uniformStates(120, 0x5f17a2);
cases.unshift({ stickers: P.solved }, ...P.moves.map((_, mi) => ({ stickers: E.applyMove(P, P.solved, mi) })));
let hardest = null, largestTrace = -1;
for (const [i, fixture] of cases.entries()) {
  if (fixture.cubies) assert.deepEqual(compiled.model.decode(fixture.stickers), fixture.cubies);
  const a = old.solve(scalar, fixture.stickers), b = S.solve(compiled, fixture.stickers);
  assert.deepEqual(b.moves, a.moves, `Output changed for fixture ${i}`);
  assert.equal(b.split, a.split); assert.equal(b.nodes, a.nodes);
  assert.equal(b.nodes, b.generatedNodes + b.skippedNodes);
  replay(fixture.stickers, b);
  if (a.nodes > largestTrace) { hardest = fixture.stickers; largestTrace = a.nodes; }
}
console.log(`PASS: ${cases.length} solved/single-turn/uniform-state cases have identical moves, splits and logical node counts.`);
function outcome(solver, tables, state, maxNodes) {
  const progress = [];
  try {
    const result = solver.solve(tables, state, { maxNodes, timeoutMs: 120000, report: p => progress.push({ nodes: p.nodes, ...(p.phase1Depth === undefined ? {} : { phase1Depth: p.phase1Depth }) }) });
    return { moves: result.moves, nodes: result.nodes, progress };
  } catch (error) { return { error: error.message, progress }; }
}
const fixture = hardest, total = largestTrace;
assert.ok(total > 250001, 'Boundary fixture must actually cross the tested checkpoint counts');
const limits = [0, 1, 10, 2047, 2048, 2049, 65535, 65536, 65537, 249999, 250000, 250001, total - 1, total, total + 1];
for (const limit of limits) assert.deepEqual(outcome(S, compiled, fixture, limit), outcome(old, scalar, fixture, limit), `Changed capped behavior at ${limit}`);
// The time guard is still enforced. Real timeout outcomes can differ because
// the candidate deliberately changes elapsed time.
assert.throws(() => S.solve(compiled, fixture, { timeoutMs: 0 }), /time budget/);
console.log(`PASS: ${limits.length} global-budget boundary cases preserve failures, solutions and progress checkpoints.`);
