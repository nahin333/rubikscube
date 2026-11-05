'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const S = require('../compact-solver.js');
const { root, P, E, baselineRevision, baselineSolver, uniformStates } = require('./cube-fixtures.cjs');

const pinned = baselineSolver(), old = pinned.solver;
const scalar = S.build(P, undefined, { expansion: 'scalar' });
const contour = S.compileTables(scalar, undefined, { expansion: 'contour' });
const h2only = S.compileTables(scalar, undefined, { expansion: 'h2only' });
const dual = S.compileTables(scalar, undefined, { expansion: 'dual' });
const dual32 = S.compileTables(scalar, undefined, { expansion: 'dual32' });

assert.equal(scalar.tableBytes, 5815245);
assert.equal(contour.tableBytes, 7913041);
assert.equal(h2only.tableBytes, 7850601);
assert.equal(dual.tableBytes, 12043251);
assert.equal(dual32.tableBytes, 14139576);
assert.equal(dual.h2Dict.length, 24743);
assert.ok(h2only.tableBytes < contour.tableBytes, 'Unified coboundary H2 dictionary must shrink Phase-2 footprint below COVE-3');

const allowed = (face, last) => face !== last && !(last >= 0 && (face + 3) % 6 === last && face < last);
const face2 = scalar.phase2.map(mi => Math.floor(mi / 3));
const allowed2 = Array.from({ length: 7 }, (_, i) => scalar.phase2.reduce((mask, mi, j) => allowed(Math.floor(mi / 3), i - 1) ? mask | (1 << j) : mask, 0));

// 1. Exhaustively check all 37,733,850 Phase-1 Cayley-clique SWAR & coboundary transitions.
let p1Transitions = 0;
const syndromeSet = new Set();
for (const [A, aSize, D, swar, raw24] of [
  [scalar.co, 2187, scalar.coSl, dual32.coSwar, dual.co24],
  [scalar.eo, 2048, scalar.eoSl, dual32.eoSwar, dual.eo24],
]) {
  for (let ai = 0, key = 0; ai < aSize; ai++) {
    const ab = ai * 18;
    for (let bi = 0; bi < 495; bi++, key++) {
      const d = D[key], w = swar[key], bb = bi * 18;
      const w24 = raw24[key * 3] | (raw24[key * 3 + 1] << 8) | (raw24[key * 3 + 2] << 16);
      assert.equal(w >>> 24, d);
      assert.equal(w & 0xffffff, w24);
      const mask3 = ((w >>> 3) & 0x111111) * 7;
      const mDown = w & mask3, mStay = (w & 0x777777) | mask3;
      for (let f = 0; f < 6; f++) {
        const nib = (w >>> (f * 4)) & 15, mu = (nib >>> 3) & 1;
        syndromeSet.add(nib);
        let hasDown = false, allStay = true;
        for (let q = 0; q < 3; q++) {
          const mi = f * 3 + q, pos = f * 4 + q, bit = 1 << pos;
          const nd = D[A[ab + mi] * 495 + scalar.sl[bb + mi]];
          if (nd < d) hasDown = true;
          if (nd > d) allStay = false;
          assert.equal(Boolean(mDown & bit), nd === d - 1);
          assert.equal(Boolean(mStay & bit), nd <= d);
          // Closed-form Cayley K_4 clique coboundary identity: nd - d = 1 - mu_f - v_{f,q}.
          assert.equal(nd - d, 1 - mu - ((nib >>> q) & 1));
          p1Transitions++;
        }
        if (hasDown) assert.ok(allStay, 'Cayley K_4 clique implication violated');
      }
    }
  }
}
assert.ok(syndromeSet.size <= 15, `Expected at most 15 face syndromes, saw ${syndromeSet.size}`);
console.log(`PASS: ${p1Transitions.toLocaleString()} Phase-1 transitions verified (SWAR masks, K_4 clique law, ${syndromeSet.size}/15 syndromes, coboundary identity).`);

// 2. Exhaustively check all 19,353,600 Phase-2 coboundary differentials, h2s0 masks, and 1,935,360 1-form root walks.
let p2Transitions = 0, p2Walks = 0;
for (const [A, D, ids] of [
  [scalar.cp, scalar.cpSp, dual.cpSp],
  [scalar.ep, scalar.epSp, dual.epSp],
]) {
  for (let ai = 0, key = 0; ai < 40320; ai++) {
    const ab = ai * 10;
    for (let bi = 0; bi < 24; bi++, key++) {
      const d = D[key], w = dual.h2Dict[ids[key]], bb = bi * 10;
      const mDown = w & 1023, mStay = (w >>> 10) & 1023, h2s0 = (w >>> 20) & 1023;
      for (let j = 0; j < 10; j++) {
        const bit = 1 << j, ck = A[ab + j] * 24 + scalar.sp[bb + j], nd = D[ck];
        const cw = dual.h2Dict[ids[ck]];
        assert.equal(Boolean(mDown & bit), nd === d - 1);
        assert.equal(Boolean(mStay & bit), nd <= d);
        // Exact coboundary step recovery without stored scalar distance.
        assert.equal(nd, d - ((mDown & bit) ? 1 : 0) + ((mStay & bit) ? 0 : 1));
        // Exact unary Horizon-2 canonical survival mask.
        const survivesH2 = Boolean(mDown & bit) && Boolean(allowed2[face2[j] + 1] & (cw & 1023));
        assert.equal(Boolean(h2s0 & bit), survivesH2);
        p2Transitions++;
      }
      // Verify steepest-descent 1-form walk recovers exact distance for every state.
      let ca = ai, cb = bi, steps = 0;
      while (ca !== 0 || cb !== 0) {
        const md = dual.h2Dict[ids[ca * 24 + cb]] & 1023;
        assert.ok(md !== 0);
        const j = 31 - Math.clz32(md & -md);
        ca = A[ca * 10 + j]; cb = scalar.sp[cb * 10 + j]; steps++;
      }
      assert.equal(steps, d);
      p2Walks++;
    }
  }
}
console.log(`PASS: ${p2Transitions.toLocaleString()} Phase-2 transitions & ${p2Walks.toLocaleString()} 1-form steepest-descent walks verified (${dual.h2Dict.length.toLocaleString()} shared signatures).`);

// 3. Verify exact trace equivalence across solved, 1-turn, 2-turn, and uniform random states.
function replay(stickers, result) {
  let state = stickers;
  for (const mi of result.moves) state = E.applyMove(P, state, mi);
  assert.deepEqual(Array.from(state), Array.from(P.solved));
}
const cases = [{ stickers: P.solved }];
for (let m1 = 0; m1 < 18; m1++) {
  const s1 = E.applyMove(P, P.solved, m1);
  cases.push({ stickers: s1 });
  for (let m2 = 0; m2 < 18; m2++) {
    if (Math.floor(m1 / 3) !== Math.floor(m2 / 3)) cases.push({ stickers: E.applyMove(P, s1, m2) });
  }
}
cases.push(...uniformStates(150, 0x4d92b7));

const oldScalarTables = old.build(P);
let hardest = null, largestTrace = -1;
for (const [i, fixture] of cases.entries()) {
  const ref = old.solve(oldScalarTables, fixture.stickers);
  for (const [label, T] of [['contour', contour], ['h2only', h2only], ['dual32', dual32], ['dual', dual]]) {
    const res = S.solve(T, fixture.stickers);
    assert.deepEqual(res.moves, ref.moves, `${label} moves changed at fixture ${i}`);
    assert.equal(res.split, ref.split, `${label} split changed at fixture ${i}`);
    assert.equal(res.nodes, ref.nodes, `${label} logical nodes changed at fixture ${i}`);
    assert.equal(res.generatedNodes + res.skippedNodes, res.nodes);
    replay(fixture.stickers, res);
  }
  if (ref.nodes > largestTrace) { hardest = fixture.stickers; largestTrace = ref.nodes; }
}
console.log(`PASS: ${cases.length} fixtures × 4 compiled modes match frozen scalar moves, splits, and logical node counts identically.`);

// 4. Dense count-budget cap & periodic checkpoint equivalence.
function outcome(solver, T, state, maxNodes) {
  const progress = [];
  try {
    const r = solver.solve(T, state, {
      maxNodes, timeoutMs: 120000,
      report: p => progress.push({ nodes: p.nodes, ...(p.phase1Depth === undefined ? {} : { phase1Depth: p.phase1Depth }) }),
    });
    return { moves: r.moves, split: r.split, nodes: r.nodes, progress };
  } catch (error) { return { error: error.message, progress }; }
}
assert.ok(largestTrace > 250001);
const limits = new Set([0, 1, 2, 10, 2047, 2048, 2049, 4095, 4096, 4097, 65535, 65536, 65537, 249999, 250000, 250001, largestTrace - 1, largestTrace, largestTrace + 1]);
for (let k = 1; k <= 120; k++) limits.add(Math.floor((largestTrace * k) / 121));
const sortedLimits = Array.from(limits).sort((a, b) => a - b);
for (const limit of sortedLimits) {
  const refOut = outcome(old, oldScalarTables, hardest, limit);
  for (const [label, T] of [['h2only', h2only], ['dual32', dual32], ['dual', dual]]) {
    assert.deepEqual(outcome(S, T, hardest, limit), refOut, `${label} capped behavior diverged at maxNodes=${limit}`);
  }
}
assert.throws(() => S.solve(dual, hardest, { timeoutMs: 0 }), /time budget/);
console.log(`PASS: ${sortedLimits.length} global node-cap boundaries × 3 new modes preserve exact failures, solutions, and progress checkpoints.`);

// 5. Constructive witness: why Horizon-1 unit-charge accounting fails under Horizon-2/3 pruning.
const source = fs.readFileSync(path.join(root, 'compact-solver.js'), 'utf8');
const flatChargeSource = source
  .replace('skip(popcount(pre) + extra[pre & dead1]);', 'skip(popcount(pre));')
  .replaceAll('skip(1 + deadCost2[f]);', 'skip(1);')
  .replace('skip(1 + deadCost2[f] + extra[nh1]);', 'skip(1);')
  .replace('skip(popcount(rem) + extra[rem & dead1]);', 'skip(popcount(rem));')
  .replaceAll('skip(1 + deadCost1[f]);', 'skip(1);');
assert.notEqual(flatChargeSource, source);
const flatMod = new Module(path.join(__dirname, 'unit-charge-h2-control.cjs'), module);
flatMod.filename = path.join(__dirname, 'unit-charge-h2-control.cjs');
flatMod._compile(flatChargeSource, flatMod.filename);
const unitChargeSolver = flatMod.exports;

const witnessFixture = uniformStates(1, 0x913b5e)[0];
const witnessState = witnessFixture.stickers;
const fullRef = old.solve(oldScalarTables, witnessState, { timeoutMs: 120000 });
const fullDual = S.solve(dual, witnessState, { timeoutMs: 120000 });
const fullUnit = unitChargeSolver.solve(dual, witnessState, { timeoutMs: 120000 });
assert.ok(fullUnit.nodes < fullRef.nodes, 'Unit-charging Horizon-2/3 ghosts must undercount scalar visits');
const witnessCap = fullUnit.nodes;
const scalarAtCap = outcome(old, oldScalarTables, witnessState, witnessCap);
const dualAtCap = outcome(S, dual, witnessState, witnessCap);
const unitAtCap = outcome(unitChargeSolver, dual, witnessState, witnessCap);
assert.deepEqual(dualAtCap, scalarAtCap);
assert.ok(scalarAtCap.error && /node budget/.test(scalarAtCap.error));
assert.ok(Array.isArray(unitAtCap.moves) && unitAtCap.moves.length > 0);
console.log(`PASS: Horizon-2/3 accounting witness verified (scalar/dual require ${fullRef.nodes} logical visits and fail at cap ${witnessCap}; naive unit-charge succeeds at ${fullUnit.nodes}).`);

const outIdx = process.argv.indexOf('--witness-output');
if (outIdx >= 0) {
  const witnessJson = {
    experiment: 'Multi-tier Horizon-2/3 accounting witness: unit-charge vs exact subtree-charge under Horizon-2/3 pruning',
    baselineRevision,
    candidateSha256: createHash('sha256').update(source).digest('hex'),
    unitChargeControlSha256: createHash('sha256').update(flatChargeSource).digest('hex'),
    fixtureSeed: '0x913b5e',
    fixtureId: witnessFixture.id,
    maxNodes: witnessCap,
    scalarReferenceNodes: fullRef.nodes,
    dualGeneratedNodes: fullDual.generatedNodes,
    dualSkippedNodes: fullDual.skippedNodes,
    unitChargeReportedNodes: fullUnit.nodes,
    undercountedGhostChildrenVisits: fullRef.nodes - fullUnit.nodes,
    atCap: {
      scalar: { solved: false, error: scalarAtCap.error },
      dualMultiTier: { solved: false, error: dualAtCap.error },
      naiveUnitChargeH2: { solved: true, nodes: unitAtCap.nodes, moves: unitAtCap.moves },
    },
  };
  fs.writeFileSync(path.resolve(root, process.argv[outIdx + 1]), JSON.stringify(witnessJson, null, 2) + '\n');
}

