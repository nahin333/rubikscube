// node tests/benchmark-contours.cjs --output research/results/contour-ablation.json
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const S = require('../compact-solver.js');
const { P, E, root, baselineRevision, baselineSolver, uniformStates, scrambleState, rng } = require('./cube-fixtures.cjs');
const args = process.argv.slice(2), arg = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const count = Number(arg('--count', 500)), repeats = Number(arg('--repeats', 5)), output = arg('--output', null);
assert.ok(Number.isInteger(count) && count > 0 && Number.isInteger(repeats) && repeats > 0);
const pinned = baselineSolver(), old = pinned.solver;
const setup = {};
let begin = performance.now(); const scalar = old.build(P); setup.scalarMs = performance.now() - begin;
begin = performance.now(); const compiled = S.build(P); setup.contourMs = performance.now() - begin;
// Ablation: identical dictionary tables and bookkeeping, scalar child generation.
// Original: the actual pinned pre-change solver, not a rewritten slower baseline.
const configs = ['original', 'dictionaryScalar', 'contour'];
const run = (name, state) => name === 'original' ? old.solve(scalar, state) : S.solve(compiled, state, { expansion: name === 'dictionaryScalar' ? 'scalar' : 'contour' });
const devRows = JSON.parse(fs.readFileSync(path.join(root, 'research/results/solver-comparison.json'), 'utf8')).rows;
for (const row of devRows.slice(0, 30)) for (const name of configs) run(name, scrambleState(row.scramble));
const seed = 0x913b5e, fixtures = uniformStates(count, seed), rows = [];
for (const fixture of fixtures) {
  assert.deepEqual(compiled.model.decode(fixture.stickers), fixture.cubies);
  rows.push({ id: fixture.id, stickers: Array.from(fixture.stickers), times: Object.fromEntries(configs.map(k => [k, []])) });
}
// Alternate configuration order and traverse the corpus in reverse on alternate
// repeats; each result is verified outside the timed interval.
for (let repeat = 0; repeat < repeats; repeat++) {
  for (let offset = 0; offset < count; offset++) {
    const i = repeat % 2 ? count - offset - 1 : offset, row = rows[i], state = fixtures[i].stickers;
    const rotation = (i + repeat) % configs.length;
    for (let j = 0; j < configs.length; j++) {
      const name = configs[(j + rotation) % configs.length], t0 = performance.now(), result = run(name, state);
      row.times[name].push(performance.now() - t0);
      const moves = Array.from(result.moves);
      if (!row.moves) { row.moves = moves; row.split = result.split; row.logicalNodes = result.nodes; }
      assert.deepEqual(moves, row.moves); assert.equal(result.split, row.split); assert.equal(result.nodes, row.logicalNodes);
      if (name === 'contour') {
        row.generatedNodes = result.generatedNodes; row.skippedNodes = result.skippedNodes;
        assert.equal(result.nodes, result.generatedNodes + result.skippedNodes);
      }
      let replay = state;
      for (const mi of result.moves) replay = E.applyMove(P, replay, mi);
      assert.deepEqual(Array.from(replay), Array.from(P.solved));
    }
  }
  console.error(`Verified repeat ${repeat + 1}/${repeats}: ${count} states × ${configs.length} configurations.`);
}
function median(values) { const a = values.slice().sort((a, b) => a - b), m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }
const quantile = (values, p) => values.slice().sort((a, b) => a - b)[Math.ceil(p * values.length) - 1];
for (const row of rows) row.medianMs = Object.fromEntries(configs.map(k => [k, median(row.times[k])]));
const summary = Object.fromEntries(configs.map(name => [name, {
  verified: count, medianMs: median(rows.map(r => r.medianMs[name])), p95Ms: quantile(rows.map(r => r.medianMs[name]), 0.95),
  meanMs: rows.reduce((s, r) => s + r.medianMs[name], 0) / count,
  meanMoves: rows.reduce((s, r) => s + r.moves.length, 0) / count,
}]));
const ratios = rows.map(r => r.medianMs.original / r.medianMs.contour), random = rng(0x72ea1), bootstrap = [];
for (let b = 0; b < 2000; b++) bootstrap.push(median(Array.from({ length: count }, () => ratios[random(count)])));
const totals = { logicalNodes: rows.reduce((s, r) => s + r.logicalNodes, 0), generatedNodes: rows.reduce((s, r) => s + r.generatedNodes, 0), skippedNodes: rows.reduce((s, r) => s + r.skippedNodes, 0) };
const result = {
  schemaVersion: 1, experiment: 'Budget-preserving dictionary contour compilation; matched moves and matched logical work caps',
  baselineRevision, baselineSha256: createHash('sha256').update(pinned.source).digest('hex'),
  candidateSha256: createHash('sha256').update(fs.readFileSync(path.join(root, 'compact-solver.js'))).digest('hex'),
  environment: { node: process.version, platform: os.platform(), arch: os.arch(), cpu: os.cpus()[0].model },
  corpus: { seed: `0x${seed.toString(16)}`, count, generator: 'Fisher-Yates corner/edge permutations; parity correction; constrained independent orientations. Pseudorandom legal-state sampling, not a scramble-length proxy.', role: 'Separate from the 200-scramble development corpus; reused for verification, not claimed to be an independently held-out or preregistered study.' },
  protocol: { repeats, warmupStates: 30, warmupSource: 'First 30 archived 200-scramble development cases', timing: 'performance.now around solve; includes input decode and internal replay, excludes setup and external sticker replay', statistic: 'median per instance across repeats, then corpus median / nearest-rank P95', order: 'rotating configurations and alternating corpus direction', confidenceInterval: '2000 seeded paired-instance bootstrap resamples; hardware/runtime conditional; not cross-device uncertainty' },
  setup, tableBytes: { original: scalar.tableBytes, contourDictionary: compiled.tableBytes, flatContourEquivalent: scalar.tableBytes + 3 * (scalar.cpSp.length + scalar.epSp.length) },
  dictionaries: { cornerSignatures: compiled.cpSignatures.length, edgeSignatures: compiled.epSignatures.length },
  summary, totals, generatedReduction: totals.skippedNodes / totals.logicalNodes,
  pairedMedianSpeedup: median(ratios), pairedMedianSpeedupCI95: [quantile(bootstrap, 0.025), quantile(bootstrap, 0.975)],
  contourFasterCases: ratios.filter(r => r > 1).length, rows,
};
if (output) fs.writeFileSync(path.resolve(root, output), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, rows: undefined }, null, 2));
