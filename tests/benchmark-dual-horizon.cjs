// node tests/benchmark-dual-horizon.cjs --output research/results/dual-horizon-ablation.json
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const S = require('../compact-solver.js');
const { P, E, root, baselineRevision, baselineSolver, uniformStates, scrambleState, rng } = require('./cube-fixtures.cjs');

const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const count = Number(arg('--count', 500)), repeats = Number(arg('--repeats', 5));
const seed = Number(arg('--seed', '0xd48a63')), output = arg('--output', null);
assert.ok(Number.isInteger(count) && count > 0 && Number.isInteger(repeats) && repeats > 0);

// Load both the pinned scalar baseline (e7023a8d) and the pinned COVE-3 contour
// baseline (f26aa421) in the same V8 realm so neither baseline pays dispatch overhead.
const pinnedScalar = baselineSolver(), oldScalar = pinnedScalar.solver;
const cove3Revision = 'f26aa42148c509bb9fd81058696599be497e5968';
const cove3Source = execFileSync('git', ['show', `${cove3Revision}:compact-solver.js`], { cwd: root, encoding: 'utf8' });
const cove3Filename = path.join(__dirname, 'pinned-cove3-solver.cjs');
const cove3Module = new Module(cove3Filename, module);
cove3Module.filename = cove3Filename; cove3Module.paths = module.paths;
cove3Module._compile(cove3Source, cove3Filename);
const oldContour = cove3Module.exports;

const devStates = JSON.parse(fs.readFileSync(path.join(root, 'research/results/solver-comparison.json'), 'utf8')).rows.slice(0, 30).map(r => scrambleState(r.scramble));
const fixtures = uniformStates(count, seed);
function median(values) { const a = values.slice().sort((x, y) => x - y), m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }
const quantile = (values, p) => values.slice().sort((x, y) => x - y)[Math.ceil(p * values.length) - 1];

function pairedBootstrap(ratios, bootSeed) {
  const random = rng(bootSeed), boot = [];
  for (let b = 0; b < 2000; b++) boot.push(median(Array.from({ length: count }, () => ratios[random(count)])));
  return {
    pairedMedianSpeedup: median(ratios),
    pairedMedianSpeedupCI95: [quantile(boot, 0.025), quantile(boot, 0.975)],
    fasterCases: ratios.filter(r => r > 1).length,
    minRatio: Math.min(...ratios),
    maxRatio: Math.max(...ratios),
  };
}

// Stage 1: Primary 3-way matched-output study (original 5.55 MiB + contour 7.55 MiB + dual 11.49 MiB = 24.59 MiB < 32 MiB L3 slice).
const setup = {};
let t0 = performance.now(); let scalarTables = oldScalar.build(P); setup.scalarMs = performance.now() - t0;
t0 = performance.now(); let contourTables = oldContour.build(P); setup.contourMs = performance.now() - t0;
t0 = performance.now(); const rawTables = S.build(P, undefined, { expansion: 'scalar' }); setup.rawScalarMs = performance.now() - t0;
t0 = performance.now(); let dualTables = S.compileTables(rawTables, undefined, { expansion: 'dual' }); setup.dualCompileOnlyMs = performance.now() - t0; setup.dualMs = setup.rawScalarMs + setup.dualCompileOnlyMs;

const primaryConfigs = ['original', 'contour', 'dual'];
const runPrimary = (name, state) => {
  if (name === 'original') return oldScalar.solve(scalarTables, state);
  if (name === 'contour') return oldContour.solve(contourTables, state);
  return S.solve(dualTables, state);
};

for (const st of devStates) for (const name of primaryConfigs) runPrimary(name, st);

const rows = fixtures.map(fixture => {
  assert.deepEqual(dualTables.model.decode(fixture.stickers), fixture.cubies);
  return {
    id: fixture.id,
    stickers: Array.from(fixture.stickers),
    times: Object.fromEntries(primaryConfigs.map(k => [k, []])),
    generated: {},
    skipped: {},
  };
});

for (let repeat = 0; repeat < repeats; repeat++) {
  for (let offset = 0; offset < count; offset++) {
    const i = repeat % 2 ? count - offset - 1 : offset, row = rows[i], state = fixtures[i].stickers;
    const rotation = (i + repeat) % primaryConfigs.length;
    for (let j = 0; j < primaryConfigs.length; j++) {
      const name = primaryConfigs[(j + rotation) % primaryConfigs.length];
      const begin = performance.now(), res = runPrimary(name, state), elapsed = performance.now() - begin;
      row.times[name].push(elapsed);
      const moves = Array.from(res.moves);
      if (!row.moves) { row.moves = moves; row.split = res.split; row.logicalNodes = res.nodes; }
      assert.deepEqual(moves, row.moves); assert.equal(res.split, row.split); assert.equal(res.nodes, row.logicalNodes);
      if (res.generatedNodes !== undefined) {
        assert.equal(res.generatedNodes + res.skippedNodes, res.nodes);
        row.generated[name] = res.generatedNodes; row.skipped[name] = res.skippedNodes;
      }
      let replay = state;
      for (const mi of res.moves) replay = E.applyMove(P, replay, mi);
      assert.deepEqual(Array.from(replay), Array.from(P.solved));
    }
  }
  console.error(`Primary study repeat ${repeat + 1}/${repeats} verified.`);
}

for (const row of rows) {
  row.medianMs = Object.fromEntries(primaryConfigs.map(k => [k, median(row.times[k])]));
  row.generated.original = row.logicalNodes; row.skipped.original = 0;
}
const logicalTotal = rows.reduce((s, r) => s + r.logicalNodes, 0);
const summary = Object.fromEntries(primaryConfigs.map(name => {
  const gen = rows.reduce((s, r) => s + r.generated[name], 0);
  const skip = rows.reduce((s, r) => s + r.skipped[name], 0);
  return [name, {
    verified: count,
    medianMs: median(rows.map(r => r.medianMs[name])),
    p95Ms: quantile(rows.map(r => r.medianMs[name]), 0.95),
    meanMs: rows.reduce((s, r) => s + r.medianMs[name], 0) / count,
    meanMoves: rows.reduce((s, r) => s + r.moves.length, 0) / count,
    generatedNodes: gen,
    skippedNodes: skip,
    generatedFractionOfScalar: gen / logicalTotal,
    prunedFractionOfScalar: skip / logicalTotal,
  }];
}));

// Release scalarTables before pairwise ablations so each pairwise comparison stays well within L3 cache.
const scalarTableBytes = scalarTables.tableBytes;
scalarTables = null;

function runPairwiseAblation(baseName, baseFn, candName, candFn, bootSeed) {
  for (const st of devStates) { baseFn(st); candFn(st); }
  const baseTimes = Array.from({ length: count }, () => []), candTimes = Array.from({ length: count }, () => []);
  let candGenerated = 0, candSkipped = 0;
  for (let repeat = 0; repeat < repeats; repeat++) {
    for (let offset = 0; offset < count; offset++) {
      const i = repeat % 2 ? count - offset - 1 : offset, state = fixtures[i].stickers;
      const order = (i + repeat) % 2 ? [candName, baseName] : [baseName, candName];
      for (const which of order) {
        const begin = performance.now(), res = which === baseName ? baseFn(state) : candFn(state), elapsed = performance.now() - begin;
        assert.deepEqual(Array.from(res.moves), rows[i].moves);
        assert.equal(res.nodes, rows[i].logicalNodes);
        if (which === baseName) baseTimes[i].push(elapsed);
        else {
          candTimes[i].push(elapsed);
          if (repeat === 0) { candGenerated += res.generatedNodes; candSkipped += res.skippedNodes; }
        }
      }
    }
  }
  const baseMed = baseTimes.map(median), candMed = candTimes.map(median);
  const ratios = baseMed.map((b, i) => b / candMed[i]);
  console.error(`Pairwise ablation ${candName} vs ${baseName} verified.`);
  return {
    baseline: { name: baseName, medianMs: median(baseMed), p95Ms: quantile(baseMed, 0.95), meanMs: baseMed.reduce((a, b) => a + b, 0) / count },
    candidate: { name: candName, medianMs: median(candMed), p95Ms: quantile(candMed, 0.95), meanMs: candMed.reduce((a, b) => a + b, 0) / count, generatedNodes: candGenerated, skippedNodes: candSkipped },
    ...pairedBootstrap(ratios, bootSeed),
  };
}

// Stage 2A: Phase-2 Coboundary Horizon-2 only (7.49 MiB) vs Pinned COVE-3 Contour (7.55 MiB).
t0 = performance.now(); const h2onlyTables = S.compileTables(rawTables, undefined, { expansion: 'h2only' }); setup.h2onlyMs = setup.rawScalarMs + (performance.now() - t0);
const h2onlyBytes = h2onlyTables.tableBytes;
const h2onlyAblation = runPairwiseAblation('contour', st => oldContour.solve(contourTables, st), 'h2only', st => S.solve(h2onlyTables, st), 0x73c7f);

// Stage 2B: 32-bit distance-stored Clique-SWAR (13.48 MiB) vs 24-bit potential-free Clique-SWAR (11.49 MiB).
const contourTableBytes = contourTables.tableBytes;
const contourCpLen = contourTables.cpSignatures.length, contourEpLen = contourTables.epSignatures.length;
contourTables = null;
t0 = performance.now(); const dual32Tables = S.compileTables(rawTables, undefined, { expansion: 'dual32' }); setup.dual32Ms = setup.rawScalarMs + (performance.now() - t0);
const dual32Bytes = dual32Tables.tableBytes;
const dual24VsDual32Ablation = runPairwiseAblation('dual32', st => S.solve(dual32Tables, st), 'dual', st => S.solve(dualTables, st), 0x95e52);

const comparisons = {
  dualVsOriginal: {
    ...pairedBootstrap(rows.map(r => r.medianMs.original / r.medianMs.dual), 0x51a9d),
    generatedVisitReduction: 1 - (summary.dual.generatedNodes / summary.original.generatedNodes),
  },
  dualVsContour: {
    ...pairedBootstrap(rows.map(r => r.medianMs.contour / r.medianMs.dual), 0x62b8e),
    generatedVisitReduction: 1 - (summary.dual.generatedNodes / summary.contour.generatedNodes),
  },
  h2onlyVsContourPairwise: {
    ...h2onlyAblation,
    generatedVisitReduction: 1 - (h2onlyAblation.candidate.generatedNodes / summary.contour.generatedNodes),
  },
  dualPotentialFreeVsDual32Pairwise: dual24VsDual32Ablation,
};

const result = {
  schemaVersion: 2,
  experiment: 'Potential-free Cayley-clique SWAR & coboundary Horizon-2 compilation; exact scalar-trace equivalence and cache-aware ablations',
  revisions: {
    scalarBaselineRevision: baselineRevision,
    scalarBaselineSha256: createHash('sha256').update(pinnedScalar.source).digest('hex'),
    cove3ContourRevision: cove3Revision,
    cove3ContourSha256: createHash('sha256').update(cove3Source).digest('hex'),
    candidateSha256: createHash('sha256').update(fs.readFileSync(path.join(root, 'compact-solver.js'))).digest('hex'),
  },
  environment: { node: process.version, platform: os.platform(), arch: os.arch(), cpu: os.cpus()[0].model },
  corpus: {
    seed: `0x${seed.toString(16)}`,
    count,
    generator: 'Fisher-Yates corner/edge permutations; parity correction; constrained independent orientations.',
    role: seed === 0xd48a63
      ? 'Fresh held-out evaluation seed not used during algorithm prototyping (prototyping used 0x913b5e).'
      : 'Secondary cross-check on archived verification seed.',
  },
  protocol: {
    repeats,
    warmupStates: 30,
    warmupSource: 'First 30 archived 200-scramble development cases',
    timing: 'performance.now around solve; includes input decode and internal verification, excludes table setup and external 54-sticker replay',
    statistic: 'median per instance across 5 repeats, then corpus median and nearest-rank P95',
    order: '3-way cyclic rotation (original, contour, dual; 24.59 MiB total < 32 MiB L3 slice) plus separate 2-way interleaved ablations (h2only vs contour; dual vs dual32)',
    confidenceInterval: '2000 seeded paired-instance bootstrap resamples; hardware/runtime conditional',
  },
  setup,
  tableBytes: {
    original: scalarTableBytes,
    contour: contourTableBytes,
    h2only: h2onlyBytes,
    dual: dualTables.tableBytes,
    dual32: dual32Bytes,
    naiveFlatDualCalculated: 1783560 + 8 * (2187 * 495 + 2048 * 495) + 8 * (40320 * 24 * 2),
  },
  dictionaries: {
    cove3CornerSignatures: contourCpLen,
    cove3EdgeSignatures: contourEpLen,
    cove3TotalSignatures: contourCpLen + contourEpLen,
    unifiedCoboundaryH2Signatures: dualTables.h2Dict.length,
    phase1RealizableFaceSyndromes: 15,
  },
  logicalTotalNodes: logicalTotal,
  summary,
  comparisons,
  rows,
};

if (output) fs.writeFileSync(path.resolve(root, output), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, rows: undefined }, null, 2));
