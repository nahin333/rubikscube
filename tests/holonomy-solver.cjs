'use strict';
const assert = require('node:assert/strict');
const S = require('../compact-solver.js');
const { P, E, uniformStates } = require('./cube-fixtures.cjs');

const scalar = S.build(P, undefined, { expansion: 'scalar' });
const dual = S.compileTables(scalar, undefined, { expansion: 'dual' });
const holo = S.compileHolonomy(scalar);

// 1. Verify backward compatibility of COVE-3 footprints and idempotence of compileHolonomy.
assert.equal(scalar.tableBytes, 5815245);
assert.equal(dual.tableBytes, 12043251);
assert.equal(holo.tableBytes, 12043251);
assert.equal(holo.holonomyBytes, 2665303);
assert.equal(holo.holonomyTotalBytes, 14708554);
assert.equal(S.compileHolonomy(holo), holo, 'compileHolonomy must be idempotent for matching psiHorizon');
console.log(`PASS: Table footprints verified (COVE-3 Dual = ${holo.tableBytes.toLocaleString()} B, HBEW extra = ${holo.holonomyBytes.toLocaleString()} B, Total = ${holo.holonomyTotalBytes.toLocaleString()} B).`);

const H = holo.holonomy;
const allowed = (face, last) => face !== last && !(last >= 0 && (face + 3) % 6 === last && face < last);
const readNib = (arr, idx) => (arr[idx >>> 1] >>> ((idx & 1) << 2)) & 15;

// 2. Exhaustive verification of Proposition 8 (Equatorial UD-Slice Funnel & Seam Invariants).
let dist1Count = 0, dist2Count = 0;
for (let s = 0; s < 495; s++) {
  const reachingFaces = new Set();
  for (let k = 0; k < H.nonH.length; k++) {
    const m = H.nonH[k];
    if (scalar.sl[s * 18 + m] === scalar.sliceGoal) reachingFaces.add(Math.floor(m / 3));
  }
  if (reachingFaces.size > 0) {
    dist1Count++;
    assert.equal(reachingFaces.size, 1, 'UD-slice dist-1 state must have a unique equatorial entry face');
    const [f] = reachingFaces;
    assert.equal(H.slEntryFace[s], f);
    assert.notEqual(s, scalar.sliceGoal, 'sliceGoal cannot reach itself in 1 equatorial quarter-turn');
    assert.equal(scalar.sl[s * 18 + H.fQuarterPos[f]], scalar.sliceGoal);
    assert.equal(scalar.sl[s * 18 + H.fQuarterNeg[f]], scalar.sliceGoal);
  } else {
    assert.equal(H.slEntryFace[s], -1);
  }

  let canReachIn2 = 0, maskExpected = 0;
  for (let m1 = 0; m1 < 18; m1++) {
    const s1 = scalar.sl[s * 18 + m1], fm = Math.floor(m1 / 3);
    for (let k = 0; k < H.nonH.length; k++) {
      if (scalar.sl[s1 * 18 + H.nonH[k]] === scalar.sliceGoal) {
        canReachIn2 = 1;
        maskExpected |= 1;
        for (let last = 0; last < 6; last++) if (allowed(fm, last)) maskExpected |= 1 << (last + 1);
        break;
      }
    }
  }
  assert.equal(H.slDist2[s], canReachIn2);
  assert.equal(H.slDist2Mask[s], maskExpected);
  dist2Count += canReachIn2;
}
assert.equal(dist1Count, 4, 'Expected exactly 4 dist-1 equatorial UD-slice states');
assert.equal(dist2Count, 55, 'Expected exactly 55 dist-2 equatorial UD-slice states');
console.log(`PASS: Proposition 8 verified exhaustively (dist-1 slice funnel = ${dist1Count}/495, dist-2 slice funnel = ${dist2Count}/495).`);

// 3. Exhaustive verification of Proposition 9 (K_2 Coset-Lift Pairing & O(1) Sister Coboundary Identity).
const eqFaces = [1, 2, 4, 5];
let p1PairingChecks = 0;
for (const f of eqFaces) {
  const mPos = H.fQuarterPos[f], mNeg = H.fQuarterNeg[f];
  for (let c = 0; c < 2187; c++) {
    assert.equal(scalar.co[c * 18 + mPos] === 0, scalar.co[c * 18 + mNeg] === 0);
    p1PairingChecks++;
  }
  for (let e = 0; e < 2048; e++) {
    assert.equal(scalar.eo[e * 18 + mPos] === 0, scalar.eo[e * 18 + mNeg] === 0);
    p1PairingChecks++;
  }
  for (let s = 0; s < 495; s++) {
    assert.equal(scalar.sl[s * 18 + mPos] === scalar.sliceGoal, scalar.sl[s * 18 + mNeg] === scalar.sliceGoal);
    p1PairingChecks++;
  }
}
let sisterChecks = 0;
for (const [A, D, ids] of [
  [scalar.cp, scalar.cpSp, holo.cpSp],
  [scalar.ep, scalar.epSp, holo.epSp],
]) {
  for (let a = 0, key = 0; a < 40320; a++) {
    const ab = a * 10;
    for (let s = 0; s < 24; s++, key++) {
      const dPlus = D[key], wPlus = holo.h2Dict[ids[key]], sb = s * 10;
      for (const f of eqFaces) {
        const jHalf = H.faceToJHalf[f], bit = 1 << jHalf;
        const aMinus = A[ab + jHalf], sMinus = scalar.sp[sb + jHalf];
        const dMinusExact = D[aMinus * 24 + sMinus];
        const dMinusCoboundary = dPlus - ((wPlus & bit) ? 1 : 0) + (((wPlus >>> 10) & bit) ? 0 : 1);
        assert.equal(dMinusCoboundary, dMinusExact);
        sisterChecks++;
      }
    }
  }
}
console.log(`PASS: Proposition 9 verified exhaustively (${p1PairingChecks.toLocaleString()} quotient lift equivalences & ${sisterChecks.toLocaleString()} sister coboundary transitions).`);

// 4. Exhaustive verification of Proposition 10 (Two-Regime Phase-Crossing Bellman Potentials).
let psiEntriesChecked = 0;
for (const [psi, trans18, size, goalIdx] of [
  [H.cPsiC, H.cpG, 40320, 0],
  [H.cPsiEU, H.p12_4G, 11880, H.goalEU],
  [H.cPsiED, H.p12_4G, 11880, H.goalED],
  [H.cPsiES, H.p12_4G, 11880, H.goalES],
]) {
  for (let l = 0; l < 6; l++) assert.equal(readNib(psi, goalIdx * 6 + l), 0);
  // Check r1 = 1 step inequality: Psi(u, last, 1) <= Psi(u*m, face(m), 0) for all m in S_eq with allowed(face(m), last)
  for (let u = 0; u < size; u++) {
    const ub = u * 18;
    for (let last = 0; last < 6; last++) {
      const v0 = readNib(psi, u * 6 + last);
      const v1 = readNib(psi, (size + u) * 6 + last);
      const v2 = readNib(psi, (2 * size + u) * 6 + last);
      assert.ok(v0 >= 0 && v0 <= 15 && v1 >= 0 && v1 <= 15 && v2 >= 0 && v2 <= 15);
      psiEntriesChecked += 3;
      for (let k = 0; k < 8; k++) {
        const m = H.nonH[k], fm = Math.floor(m / 3);
        if (!allowed(fm, last)) continue;
        const succ0 = readNib(psi, trans18[ub + m] * 6 + fm);
        assert.ok(v1 <= succ0, `Bellman r1=1 consistency violated at u=${u}, last=${last}, m=${m}`);
      }
      for (let m = 0; m < 18; m++) {
        const fm = Math.floor(m / 3);
        if (!allowed(fm, last)) continue;
        const succ1 = readNib(psi, (size + trans18[ub + m]) * 6 + fm);
        assert.ok(v2 <= succ1, `Bellman r1=2 consistency violated at u=${u}, last=${last}, m=${m}`);
      }
    }
  }
}
console.log(`PASS: Proposition 10 verified exhaustively (${psiEntriesChecked.toLocaleString()} Bellman potential entries & all ambient/equatorial step inequalities).`);

// 5. Solution validity, short-scramble optimality, subgroup H inputs, and seam canonicalization.
function verifySolution(stickers, res) {
  let st = stickers;
  for (let i = 0; i < res.moves.length; i++) {
    const mi = res.moves[i];
    if (i > 0) assert.notEqual(Math.floor(mi / 3), Math.floor(res.moves[i - 1] / 3), 'Adjacent same-face moves must never occur');
    st = E.applyMove(P, st, mi);
  }
  assert.deepEqual(Array.from(st), Array.from(P.solved));
}

// 0-turn, all 18 1-turn, and all 270 non-same-face 2-turn states
const res0 = S.solveHolonomy(holo, P.solved, { targetBound: 0 });
assert.equal(res0.moves.length, 0);
assert.equal(res0.optimal, true);
verifySolution(P.solved, res0);

for (let m1 = 0; m1 < 18; m1++) {
  const s1 = E.applyMove(P, P.solved, m1);
  const r1 = S.solveHolonomy(holo, s1, { targetBound: 0 });
  assert.equal(r1.moves.length, 1, `1-turn scramble m1=${m1} must solve in 1 move`);
  verifySolution(s1, r1);
  for (let m2 = 0; m2 < 18; m2++) {
    const f1 = Math.floor(m1 / 3), f2 = Math.floor(m2 / 3);
    if (f1 === f2) continue;
    const s2 = E.applyMove(P, s1, m2);
    const r2 = S.solveHolonomy(holo, s2, { targetBound: 0 });
    assert.equal(r2.moves.length, 2, `2-turn scramble (${m1},${m2}) must solve in 2 moves`);
    verifySolution(s2, r2);
  }
}

// Random states already inside subgroup H (d1 = 0)
let rng = 0x314159;
const nextRand = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng; };
for (let k = 0; k < 15; k++) {
  let st = P.solved;
  for (let t = 0; t < 25; t++) st = E.applyMove(P, st, holo.phase2[nextRand() % 10]);
  const rh = S.solveHolonomy(holo, st, { targetBound: 0 });
  assert.equal(rh.split, 0);
  assert.ok(rh.moves.length <= 18);
  verifySolution(st, rh);
}
console.log('PASS: Solved, all 18 1-turn, all 270 2-turn, and 15 subgroup-H scrambles solved & verified.');

// 6. Theorem 1 — Exact bounded-shell optimality equivalence across all 5 component ablations!
const optFixtures = uniformStates(25, 0x271828);
const ablationModes = [
  ['noFunnel (unpruned baseline)', { useFunnel: false, useSisterPairing: false, usePsi: false, useZeroSlackSieve: false, useStratified: false }],
  ['noSisterPairing', { useSisterPairing: false }],
  ['noPsi', { usePsi: false }],
  ['noZeroSlackSieve', { useZeroSlackSieve: false }],
  ['noStratified', { useStratified: false }],
];
let fullNodesSum = 0, baseNodesSum = 0, fullLiftsSum = 0, baseLiftsSum = 0;
for (const [idx, fx] of optFixtures.entries()) {
  const full = S.solveHolonomy(holo, fx.stickers, { maxD1Cap: 11, maxDeltaD1: 2, targetBound: 0, collectSampleFibers: true });
  assert.equal(full.optimalInShells, true);
  assert.ok(Array.isArray(full.sampleFibers) && full.sampleFibers.length > 0);
  verifySolution(fx.stickers, full);
  fullNodesSum += full.nodes;
  fullLiftsSum += full.harvestedLifts;

  for (const [label, opts] of ablationModes) {
    const abl = S.solveHolonomy(holo, fx.stickers, { maxD1Cap: 11, maxDeltaD1: 2, targetBound: 0, ...opts });
    assert.equal(abl.optimalInShells, true);
    assert.equal(abl.searchedMaxD1 >= full.firstValidD1, true);
    verifySolution(fx.stickers, abl);
    assert.equal(abl.moves.length, full.moves.length, `Theorem 1 optimality mismatch for ${label} at fixture ${idx}: got ${abl.moves.length}, expected ${full.moves.length}`);
    if (label.startsWith('noFunnel')) {
      baseNodesSum += abl.nodes;
      baseLiftsSum += abl.harvestedLifts;
    }
  }
}
assert.ok(fullNodesSum <= baseNodesSum * 1.15, `Unexpected exact node blowup: ${fullNodesSum} vs ${baseNodesSum}`);
assert.ok(fullLiftsSum * 3 < baseLiftsSum, `Expected full HBEW lifts (${fullLiftsSum}) to be <33% of unpruned lifts (${baseLiftsSum})`);
console.log(`PASS: Theorem 1 exact bounded-shell optimality verified across 25 scrambles × 6 configurations (lifts ${fullLiftsSum.toLocaleString()} vs ${baseLiftsSum.toLocaleString()}, 100% identical optimal lengths).`);

// 7. Default HBEW across 100 uniform scrambles + timeout/node budget enforcement.
const states100 = uniformStates(100, 0x8a4f2c);
let totalMoves = 0, maxMoves = 0;
for (const fx of states100) {
  const res = S.solveHolonomy(holo, fx.stickers);
  verifySolution(fx.stickers, res);
  totalMoves += res.moves.length;
  if (res.moves.length > maxMoves) maxMoves = res.moves.length;
}
assert.ok(totalMoves / 100 < 20.6, `Expected mean moves < 20.6, got ${(totalMoves / 100).toFixed(2)}`);
assert.ok(maxMoves <= 22, `Expected max moves <= 22, got ${maxMoves}`);
assert.throws(() => S.solveHolonomy(holo, states100[0].stickers, { timeoutMs: 0 }), /time budget/);
assert.throws(() => S.solveHolonomy(holo, states100[0].stickers, { maxNodes: 0 }), /node budget/);
assert.throws(() => S.solveHolonomy(holo, states100[0].stickers, { maxNodes: 25 }), /node budget/);
console.log(`PASS: 100 uniform scrambles solved (${(totalMoves / 100).toFixed(2)} mean moves, max ${maxMoves} <= 22) + timeout/node caps enforced.`);
