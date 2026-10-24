'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const { createHash } = require('node:crypto');
const S = require('../compact-solver.js');
const { P, E, uniformStates } = require('./cube-fixtures.cjs');
const args = process.argv.slice(2);
const arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const variant = arg('--variant', 'replay');
assert.ok(['replay', 'corridor'].includes(variant));
const R = require(`./${variant}-candidate.cjs`);
const count = Number(arg('--count', 100)), repeats = Number(arg('--repeats', 3));
const seed = Number(arg('--seed', '0xb217ef'));
const options = { replayMinDepth: Number(arg('--min-depth', 3)), replayMaxDepth: Number(arg('--max-depth', 8)), replayBits: Number(arg('--bits', 16)) };
assert.ok(Number.isInteger(count) && count > 0 && Number.isInteger(repeats) && repeats > 0);
const T = S.build(P), fixtures = uniformStates(count, seed);
const run = (name, state, extra = {}) => (name === 'contour' ? S : R).solve(T, state, { ...options, ...extra });
for (const f of uniformStates(20, 0xabc123)) for (const name of ['contour', 'candidate']) run(name, f.stickers);
const rows = fixtures.map(f => ({ id: f.id, stickers: Array.from(f.stickers), times: { contour: [], candidate: [] } }));
for (let repeat = 0; repeat < repeats; repeat++) {
  for (let offset = 0; offset < count; offset++) {
    const i = repeat % 2 ? count - offset - 1 : offset, row = rows[i], state = fixtures[i].stickers;
    for (const name of (i + repeat) % 2 ? ['candidate', 'contour'] : ['contour', 'candidate']) {
      const start = performance.now(), result = run(name, state);
      row.times[name].push(performance.now() - start);
      if (!row.moves) { row.moves = result.moves; row.nodes = result.nodes; row.split = result.split; }
      assert.deepEqual(result.moves, row.moves); assert.equal(result.nodes, row.nodes); assert.equal(result.split, row.split);
      assert.equal(result.generatedNodes + result.skippedNodes, result.nodes);
      let replay = state;
      for (const mi of result.moves) replay = E.applyMove(P, replay, mi);
      assert.deepEqual(Array.from(replay), Array.from(P.solved));
      row[name] = { generatedNodes: result.generatedNodes, replayHits: result.replayHits ?? 0, replayVisits: result.replayVisits ?? 0, replayBytes: result.replayBytes ?? 0, corridorSteps: result.corridorSteps ?? 0 };
    }
  }
  console.error('Verified repeat', repeat + 1);
}
const median = xs => { const a = [...xs].sort((a, b) => a - b), n = a.length; return (a[(n - 1) >> 1] + a[n >> 1]) / 2; };
for (const row of rows) row.medianMs = Object.fromEntries(Object.entries(row.times).map(([k, v]) => [k, median(v)]));
const summary = Object.fromEntries(['contour', 'candidate'].map(name => [name, {
  medianMs: median(rows.map(r => r.medianMs[name])),
  p95Ms: rows.map(r => r.medianMs[name]).sort((a, b) => a - b)[Math.ceil(count * .95) - 1],
  generatedNodes: rows.reduce((sum, r) => sum + r[name].generatedNodes, 0),
}]));
const result = {
  experiment: `Experimental ${variant}; matched output and logical budgets`,
  options, count, repeats, seed, environment: { node: process.version, cpu: os.cpus()[0].model },
  protocol: { timing: 'performance.now around solve, including per-solve cache allocation; excludes shared table build and external sticker replay', warmup: '20 distinct states, seed 0xabc123, both configurations', order: 'alternating configuration order and corpus direction', statistic: 'median per state across repetitions, then corpus median and nearest-rank P95', development: '100-state pilot seed 0xb217ef; final implementations fixed before using evaluation seed 0x83d92a; one CPU/runtime, no preregistration', caveat: 'Logical visits and generated visits are different; corridorSteps counts removed recursive calls, not removed generated states.' },
  sourceHashes: Object.fromEntries(['compact-solver.js', `tests/${variant}-candidate.cjs`, 'tests/benchmark-replay.cjs'].map(f => [f, createHash('sha256').update(fs.readFileSync(f)).digest('hex')])),
  summary, replayHits: rows.reduce((s, r) => s + r.candidate.replayHits, 0), replayVisits: rows.reduce((s, r) => s + r.candidate.replayVisits, 0),
  pairedMedianSpeedup: median(rows.map(r => r.medianMs.contour / r.medianMs.candidate)),
  fasterCases: rows.filter(r => r.medianMs.candidate < r.medianMs.contour).length, rows,
  corridorSteps: rows.reduce((s, r) => s + r.candidate.corridorSteps, 0),
};
const output = arg('--output', null);
if (output) fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, rows: undefined }, null, 2));
