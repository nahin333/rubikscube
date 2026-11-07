// node tests/benchmark-holonomy.cjs --output research/results/holonomy-ablation.json
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const S = require('../compact-solver.js');
const { P, E, root, uniformStates, scrambleState, rng } = require('./cube-fixtures.cjs');

const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const count = Number(arg('--count', 500)), repeats = Number(arg('--repeats', 5));
const ablationRepeats = Number(arg('--ablation-repeats', 3));
const seed = Number(arg('--seed', '0x5e71a9')), output = arg('--output', null);
assert.ok(Number.isInteger(count) && count > 0 && Number.isInteger(repeats) && repeats > 0);

const devStates = JSON.parse(fs.readFileSync(path.join(root, 'research/results/solver-comparison.json'), 'utf8'))
  .rows.slice(0, 30).map(r => scrambleState(r.scramble));
const fixtures = uniformStates(count, seed);

function median(values) {
  const a = values.slice().sort((x, y) => x - y), m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
const quantile = (values, p) => values.slice().sort((x, y) => x - y)[Math.ceil(p * values.length) - 1];
const mean = values => values.reduce((a, b) => a + b, 0) / values.length;

function pairedRatioBootstrap(ratios, bootSeed) {
  const random = rng(bootSeed), n = ratios.length, boot = [];
  for (let b = 0; b < 2000; b++) boot.push(median(Array.from({ length: n }, () => ratios[random(n)])));
  return {
    pairedMedianSpeedup: median(ratios),
    pairedMedianSpeedupCI95: [quantile(boot, 0.025), quantile(boot, 0.975)],
    fasterCases: ratios.filter(r => r > 1).length,
    minRatio: Math.min(...ratios),
    maxRatio: Math.max(...ratios),
  };
}

function pairedDiffBootstrap(diffs, bootSeed) {
  const random = rng(bootSeed), n = diffs.length, boot = [];
  for (let b = 0; b < 2000; b++) boot.push(mean(Array.from({ length: n }, () => diffs[random(n)])));
  return {
    meanMoveReduction: mean(diffs),
    meanMoveReductionCI95: [quantile(boot, 0.025), quantile(boot, 0.975)],
    medianMoveReduction: median(diffs),
    strictlyShorterCases: diffs.filter(d => d > 0).length,
    tiedCases: diffs.filter(d => d === 0).length,
    longerCases: diffs.filter(d => d < 0).length,
  };
}

function verifyReplay(stickers, moves, checkAdjacentFaces = true) {
  let st = stickers;
  for (let i = 0; i < moves.length; i++) {
    if (checkAdjacentFaces && i > 0) assert.notEqual(Math.floor(moves[i] / 3), Math.floor(moves[i - 1] / 3));
    st = E.applyMove(P, st, moves[i]);
  }
  assert.deepEqual(Array.from(st), Array.from(P.solved));
}

const setup = {};
let t0 = performance.now();
const rawScalar = S.build(P, undefined, { expansion: 'scalar' });
setup.rawScalarMs = performance.now() - t0;
t0 = performance.now();
const dualTables = S.compileTables(rawScalar, undefined, { expansion: 'dual' });
setup.dualCompileOnlyMs = performance.now() - t0;
setup.dualTotalMs = setup.rawScalarMs + setup.dualCompileOnlyMs;
t0 = performance.now();
const holoTables = S.compileHolonomy(dualTables);
setup.holonomyCompileOnlyMs = performance.now() - t0;
setup.holonomyTotalMs = setup.dualTotalMs + setup.holonomyCompileOnlyMs;

const primaryModes = {
  cove3Dual: st => S.solve(dualTables, st),
  hbewFast: st => S.solveHolonomy(holoTables, st, { maxD1Cap: 11, maxDeltaD1: 1, targetBound: 20 }),
  hbewDefault: st => S.solveHolonomy(holoTables, st, { maxD1Cap: 11, maxDeltaD1: 2, targetBound: 20 }),
  hbewExact: st => S.solveHolonomy(holoTables, st, { maxD1Cap: 11, maxDeltaD1: 2, targetBound: 0 }),
};
const primaryKeys = Object.keys(primaryModes);

for (const st of devStates) for (const k of primaryKeys) primaryModes[k](st);

const rows = fixtures.map(fx => ({
  id: fx.id,
  times: Object.fromEntries(primaryKeys.map(k => [k, []])),
  metrics: {},
}));

for (let rep = 0; rep < repeats; rep++) {
  for (let offset = 0; offset < count; offset++) {
    const i = rep % 2 ? count - offset - 1 : offset, row = rows[i], state = fixtures[i].stickers;
    const rot = (i + rep) % primaryKeys.length;
    for (let j = 0; j < primaryKeys.length; j++) {
      const key = primaryKeys[(j + rot) % primaryKeys.length];
      const begin = performance.now(), res = primaryModes[key](state), elapsed = performance.now() - begin;
      row.times[key].push(elapsed);
      if (rep === 0) {
        verifyReplay(state, res.moves, key !== 'cove3Dual');
        row.metrics[key] = {
          length: res.moves.length,
          split: res.split,
          nodes: key === 'cove3Dual' ? res.generatedNodes : res.nodes,
          logicalNodes: res.nodes,
          ...(key === 'cove3Dual' ? {} : {
            p1Nodes: res.p1Nodes,
            p2Nodes: res.p2Nodes,
            harvestedLifts: res.harvestedLifts,
            sisterLifts: res.sisterLifts,
            psiPruned: res.psiPruned,
            zeroSlackHits: res.zeroSlackHits,
            firstValidD1: res.firstValidD1,
            searchedMaxD1: res.searchedMaxD1,
            optimalInShells: res.optimalInShells,
          }),
        };
      } else {
        assert.equal(res.moves.length, row.metrics[key].length);
      }
    }
  }
  console.error(`Primary held-out study repeat ${rep + 1}/${repeats} verified.`);
}

for (const row of rows) {
  row.medianMs = Object.fromEntries(primaryKeys.map(k => [k, median(row.times[k])]));
}

function summarizeMode(key) {
  const medTimes = rows.map(r => r.medianMs[key]);
  const lengths = rows.map(r => r.metrics[key].length);
  const visited = rows.map(r => r.metrics[key].nodes);
  const base = {
    verified: count,
    medianMs: median(medTimes),
    p95Ms: quantile(medTimes, 0.95),
    meanMs: mean(medTimes),
    meanMoves: mean(lengths),
    medianMoves: median(lengths),
    maxMoves: Math.max(...lengths),
    minMoves: Math.min(...lengths),
    le20Fraction: lengths.filter(l => l <= 20).length / count,
    le21Fraction: lengths.filter(l => l <= 21).length / count,
    le22Fraction: lengths.filter(l => l <= 22).length / count,
    meanVisitedNodes: mean(visited),
    totalVisitedNodes: visited.reduce((a, b) => a + b, 0),
  };
  if (key !== 'cove3Dual') {
    base.meanP1Nodes = mean(rows.map(r => r.metrics[key].p1Nodes));
    base.meanP2Nodes = mean(rows.map(r => r.metrics[key].p2Nodes));
    base.meanHarvestedLifts = mean(rows.map(r => r.metrics[key].harvestedLifts));
    base.meanSisterLifts = mean(rows.map(r => r.metrics[key].sisterLifts));
    base.meanPsiPruned = mean(rows.map(r => r.metrics[key].psiPruned));
    base.meanZeroSlackHits = mean(rows.map(r => r.metrics[key].zeroSlackHits));
  }
  return base;
}

const summary = Object.fromEntries(primaryKeys.map(k => [k, summarizeMode(k)]));

// Component ablations against hbewDefault on the same held-out 500-state corpus.
const ablationSpecs = [
  ['unprunedMultiShell', { useFunnel: false, useSisterPairing: false, usePsi: false, useZeroSlackSieve: false, useStratified: false }],
  ['noSisterPairing', { useSisterPairing: false }],
  ['noPsiPotentials', { usePsi: false }],
  ['noZeroSlackSieve', { useZeroSlackSieve: false }],
  ['noStratifiedWavefront', { useStratified: false }],
];

const ablations = {};
for (const [ablIdx, [ablName, ablOpts]] of ablationSpecs.entries()) {
  const fullFn = st => S.solveHolonomy(holoTables, st, { maxD1Cap: 11, maxDeltaD1: 2, targetBound: 20 });
  const ablFn = st => S.solveHolonomy(holoTables, st, { maxD1Cap: 11, maxDeltaD1: 2, targetBound: 20, ...ablOpts });
  for (const st of devStates.slice(0, 10)) { fullFn(st); ablFn(st); }
  const fullTimes = Array.from({ length: count }, () => []), ablTimes = Array.from({ length: count }, () => []);
  let ablNodes = 0, ablP1 = 0, ablP2 = 0, ablLifts = 0, ablMoves = 0;
  let fullNodes = 0, fullP1 = 0, fullP2 = 0, fullLifts = 0;
  for (let rep = 0; rep < ablationRepeats; rep++) {
    for (let offset = 0; offset < count; offset++) {
      const i = rep % 2 ? count - offset - 1 : offset, state = fixtures[i].stickers;
      const firstAbl = (i + rep) % 2 === 1;
      if (firstAbl) {
        let b = performance.now(), ra = ablFn(state); ablTimes[i].push(performance.now() - b);
        b = performance.now(); const rf = fullFn(state); fullTimes[i].push(performance.now() - b);
        if (rep === 0) {
          verifyReplay(state, ra.moves);
          ablNodes += ra.nodes; ablP1 += ra.p1Nodes; ablP2 += ra.p2Nodes; ablLifts += ra.harvestedLifts; ablMoves += ra.moves.length;
          fullNodes += rf.nodes; fullP1 += rf.p1Nodes; fullP2 += rf.p2Nodes; fullLifts += rf.harvestedLifts;
        }
      } else {
        let b = performance.now(), rf = fullFn(state); fullTimes[i].push(performance.now() - b);
        b = performance.now(); const ra = ablFn(state); ablTimes[i].push(performance.now() - b);
        if (rep === 0) {
          verifyReplay(state, ra.moves);
          ablNodes += ra.nodes; ablP1 += ra.p1Nodes; ablP2 += ra.p2Nodes; ablLifts += ra.harvestedLifts; ablMoves += ra.moves.length;
          fullNodes += rf.nodes; fullP1 += rf.p1Nodes; fullP2 += rf.p2Nodes; fullLifts += rf.harvestedLifts;
        }
      }
    }
  }
  const fMed = fullTimes.map(median), aMed = ablTimes.map(median);
  ablations[ablName] = {
    ablatedMode: {
      medianMs: median(aMed),
      p95Ms: quantile(aMed, 0.95),
      meanMs: mean(aMed),
      meanMoves: ablMoves / count,
      meanNodes: ablNodes / count,
      meanP1Nodes: ablP1 / count,
      meanP2Nodes: ablP2 / count,
      meanHarvestedLifts: ablLifts / count,
    },
    fullHbewPaired: {
      medianMs: median(fMed),
      p95Ms: quantile(fMed, 0.95),
      meanMs: mean(fMed),
      meanNodes: fullNodes / count,
      meanP1Nodes: fullP1 / count,
      meanP2Nodes: fullP2 / count,
      meanHarvestedLifts: fullLifts / count,
    },
    ...pairedRatioBootstrap(aMed.map((a, i) => a / fMed[i]), 0x41000 + ablIdx * 0x1357),
  };
  console.error(`Component ablation ${ablName} verified.`);
}

const comparisons = {
  hbewDefaultVsCove3DualMoves: pairedDiffBootstrap(
    rows.map(r => r.metrics.cove3Dual.length - r.metrics.hbewDefault.length), 0x71a01
  ),
  hbewExactVsCove3DualMoves: pairedDiffBootstrap(
    rows.map(r => r.metrics.cove3Dual.length - r.metrics.hbewExact.length), 0x71a02
  ),
  hbewFastVsCove3DualMoves: pairedDiffBootstrap(
    rows.map(r => r.metrics.cove3Dual.length - r.metrics.hbewFast.length), 0x71a03
  ),
  hbewExactVsHbewDefaultMoves: pairedDiffBootstrap(
    rows.map(r => r.metrics.hbewDefault.length - r.metrics.hbewExact.length), 0x71a04
  ),
};

const result = {
  schemaVersion: 1,
  experiment: 'Stage-3 Holonomy-Guided Bifurcated Eikonal Wavefront (HBEW) held-out evaluation and 5-pillar ablation study',
  candidateSha256: createHash('sha256').update(fs.readFileSync(path.join(root, 'compact-solver.js'))).digest('hex'),
  environment: { node: process.version, platform: os.platform(), arch: os.arch(), cpu: os.cpus()[0].model },
  corpus: {
    seed: `0x${seed.toString(16)}`,
    count,
    generator: 'Fisher-Yates corner/edge permutations; parity correction; constrained independent orientations.',
    role: 'Fresh held-out evaluation seed never inspected during HBEW algorithm design or tuning.',
  },
  protocol: {
    repeats,
    ablationRepeats,
    warmupStates: 30,
    timing: 'performance.now around solve / solveHolonomy; includes input decode and internal cubie verification, excludes table setup and external 54-sticker replay',
    statistic: 'median per instance across repeats, then corpus median, mean, and nearest-rank P95',
    confidenceInterval: '2000 seeded paired-instance bootstrap resamples',
  },
  setup,
  tableBytes: {
    scalar: rawScalar.tableBytes,
    cove3Dual: dualTables.tableBytes,
    holonomyExtra: holoTables.holonomyBytes,
    holonomyTotal: holoTables.holonomyTotalBytes,
  },
  summary,
  comparisons,
  ablations,
  rows: rows.map(r => ({ id: r.id, medianMs: r.medianMs, metrics: r.metrics })),
};

if (output) fs.writeFileSync(path.resolve(root, output), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, rows: undefined }, null, 2));
