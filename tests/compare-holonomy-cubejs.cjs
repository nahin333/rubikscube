// CUBEJS_MODULE=/tmp/rubiks-comparison/node_modules/cubejs node tests/compare-holonomy-cubejs.cjs --output research/results/cubejs-holonomy.json
'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const compact = require('../compact-solver.js');
const cubejsPath = process.env.CUBEJS_MODULE || 'cubejs';
const Cube = require(cubejsPath);
assert.equal(require(cubejsPath + '/package.json').version, '1.3.2', 'Use the pinned cubejs 1.3.2 baseline');

const html = fs.readFileSync('index.html', 'utf8');
const core = html.slice(html.indexOf('// ---------- Puzzle model'), html.indexOf('// ---------- App state'));
const E = vm.runInNewContext(core + '\n({buildPuzzle, applyMove})'), P = E.buildPuzzle(3);
const views = [[[1, 0, 0], [0, 0, 1]], [[0, 0, -1], [0, -1, 0]], [[1, 0, 0], [0, -1, 0]], [[1, 0, 0], [0, 0, -1]], [[0, 0, 1], [0, -1, 0]], [[-1, 0, 0], [0, -1, 0]]];
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const indices = P.stickers.map(s => s.face * 9 + (dot(s.p, views[s.face][1]) / 2 + 1) * 3 + dot(s.p, views[s.face][0]) / 2 + 1);
function facelets(state) {
  const chars = [];
  state.forEach((c, i) => { chars[indices[i]] = 'URFDLB'[c - 48]; });
  return chars.join('');
}

let t0 = performance.now();
const dualTables = compact.build(P);
const cove3SetupMs = performance.now() - t0;
t0 = performance.now();
const holoTables = compact.compileHolonomy(dualTables);
const hbewExtraSetupMs = performance.now() - t0;
const hbewTotalSetupMs = cove3SetupMs + hbewExtraSetupMs;
t0 = performance.now();
Cube.initSolver();
const cubejsSetupMs = performance.now() - t0;

let seed = 0x74bc39;
const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.floor(seed / 4294967296 * n); };
const scrambles = [];
for (let trial = 0; trial < 200; trial++) {
  const scramble = [];
  let state = P.solved, last = -1;
  for (let k = 0, length = 20 + random(21); k < length; k++) {
    let face; do { face = random(6); } while (face === last);
    const mi = face * 3 + random(3);
    scramble.push(P.moves[mi].name);
    state = E.applyMove(P, state, mi);
    last = face;
  }
  scrambles.push({ trial, scramble: scramble.join(' '), state, faceletStr: facelets(state) });
}

const modes = ['cubejs', 'cove3Dual', 'hbewFast', 'hbewDefault', 'hbewExact'];
function runSolver(name, item) {
  if (name === 'cubejs') {
    const input = Cube.fromString(item.faceletStr);
    const b = performance.now(), str = input.solve(), ms = performance.now() - b;
    const moves = str.trim() ? str.trim().split(/\s+/).map(n => P.moveIndex.get(n)) : [];
    return { ms, moves };
  }
  if (name === 'cove3Dual') {
    const b = performance.now(), res = compact.solve(dualTables, item.state), ms = performance.now() - b;
    return { ms, moves: res.moves, nodes: res.generatedNodes, logicalNodes: res.nodes };
  }
  const opts = name === 'hbewFast'
    ? { maxD1Cap: 11, maxDeltaD1: 1, targetBound: 20 }
    : name === 'hbewDefault'
      ? { maxD1Cap: 11, maxDeltaD1: 2, targetBound: 20 }
      : { maxD1Cap: 11, maxDeltaD1: 2, targetBound: 0 };
  const b = performance.now(), res = compact.solveHolonomy(holoTables, item.state, opts), ms = performance.now() - b;
  return { ms, moves: res.moves, nodes: res.nodes, harvestedLifts: res.harvestedLifts, zeroSlackHits: res.zeroSlackHits };
}

// Warmup JIT across first 15 scrambles
for (let i = 0; i < 15; i++) for (const m of modes) runSolver(m, scrambles[i]);

const repeats = 3;
const rows = scrambles.map(item => ({
  trial: item.trial,
  scramble: item.scramble,
  times: Object.fromEntries(modes.map(m => [m, []])),
  data: {},
}));

for (let rep = 0; rep < repeats; rep++) {
  for (let offset = 0; offset < 200; offset++) {
    const i = rep % 2 ? 199 - offset : offset, item = scrambles[i], row = rows[i];
    const rot = (i + rep) % modes.length;
    for (let j = 0; j < modes.length; j++) {
      const name = modes[(j + rot) % modes.length];
      const out = runSolver(name, item);
      row.times[name].push(out.ms);
      if (rep === 0) {
        let replay = item.state;
        for (const mi of out.moves) { assert.notEqual(mi, undefined); replay = E.applyMove(P, replay, mi); }
        assert.deepEqual(Array.from(replay), Array.from(P.solved));
        row.data[name] = {
          length: out.moves.length,
          ...(out.nodes === undefined ? {} : { nodes: out.nodes }),
          ...(out.harvestedLifts === undefined ? {} : { harvestedLifts: out.harvestedLifts, zeroSlackHits: out.zeroSlackHits }),
        };
      }
    }
  }
  console.error(`cubejs vs HBEW head-to-head repeat ${rep + 1}/${repeats} verified.`);
}

const median = arr => { const a = arr.slice().sort((x, y) => x - y), m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const quantile = (arr, p) => arr.slice().sort((x, y) => x - y)[Math.ceil(p * arr.length) - 1];
const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;

for (const row of rows) {
  for (const m of modes) row[m] = { ms: median(row.times[m]), ...row.data[m] };
  delete row.times;
  delete row.data;
}

function summarize(name) {
  const times = rows.map(r => r[name].ms), lengths = rows.map(r => r[name].length);
  const out = {
    verified: rows.length,
    medianMs: median(times),
    p95Ms: quantile(times, 0.95),
    meanMs: mean(times),
    maxMs: Math.max(...times),
    meanMoves: mean(lengths),
    medianMoves: median(lengths),
    maxMoves: Math.max(...lengths),
    minMoves: Math.min(...lengths),
    le20Fraction: lengths.filter(l => l <= 20).length / lengths.length,
    le21Fraction: lengths.filter(l => l <= 21).length / lengths.length,
    le22Fraction: lengths.filter(l => l <= 22).length / lengths.length,
  };
  if (rows[0][name].nodes !== undefined) out.meanVisitedNodes = mean(rows.map(r => r[name].nodes));
  return out;
}

const results = {
  compactSourceSha256: createHash('sha256').update(fs.readFileSync('compact-solver.js')).digest('hex'),
  baselineVersion: 'cubejs 1.3.2',
  environment: { node: process.version, platform: os.platform(), arch: os.arch(), cpu: os.cpus()[0].model },
  seed: '0x74bc39',
  repeats,
  fixture: '200 seeded 20–40-turn scrambles, no consecutive same-face turns; 3 interleaved repeats per solver',
  setupMs: {
    cubejs: cubejsSetupMs,
    cove3Dual: cove3SetupMs,
    hbewExtra: hbewExtraSetupMs,
    hbewTotal: hbewTotalSetupMs,
  },
  tableBytes: {
    cove3Dual: dualTables.tableBytes,
    hbewExtra: holoTables.holonomyBytes,
    hbewTotal: holoTables.holonomyTotalBytes,
  },
  summary: Object.fromEntries(modes.map(m => [m, summarize(m)])),
  headToHead: {
    hbewDefaultVsCubejs: {
      medianSpeedup: summarize('cubejs').medianMs / summarize('hbewDefault').medianMs,
      p95Speedup: summarize('cubejs').p95Ms / summarize('hbewDefault').p95Ms,
      meanMoveReduction: summarize('cubejs').meanMoves - summarize('hbewDefault').meanMoves,
      hbewShorterCases: rows.filter(r => r.hbewDefault.length < r.cubejs.length).length,
      tiedCases: rows.filter(r => r.hbewDefault.length === r.cubejs.length).length,
      cubejsShorterCases: rows.filter(r => r.hbewDefault.length > r.cubejs.length).length,
      hbewFasterCases: rows.filter(r => r.hbewDefault.ms < r.cubejs.ms).length,
    },
    hbewFastVsCubejs: {
      medianSpeedup: summarize('cubejs').medianMs / summarize('hbewFast').medianMs,
      p95Speedup: summarize('cubejs').p95Ms / summarize('hbewFast').p95Ms,
      meanMoveReduction: summarize('cubejs').meanMoves - summarize('hbewFast').meanMoves,
      hbewShorterCases: rows.filter(r => r.hbewFast.length < r.cubejs.length).length,
      tiedCases: rows.filter(r => r.hbewFast.length === r.cubejs.length).length,
      cubejsShorterCases: rows.filter(r => r.hbewFast.length > r.cubejs.length).length,
      hbewFasterCases: rows.filter(r => r.hbewFast.ms < r.cubejs.ms).length,
    },
    hbewDefaultVsCove3Dual: {
      meanMoveReduction: summarize('cove3Dual').meanMoves - summarize('hbewDefault').meanMoves,
      hbewShorterCases: rows.filter(r => r.hbewDefault.length < r.cove3Dual.length).length,
      tiedCases: rows.filter(r => r.hbewDefault.length === r.cove3Dual.length).length,
      cove3ShorterCases: rows.filter(r => r.hbewDefault.length > r.cove3Dual.length).length,
    },
  },
  rows,
};

const outputIndex = process.argv.indexOf('--output');
if (outputIndex >= 0) {
  if (!process.argv[outputIndex + 1]) throw new Error('--output needs a filename');
  fs.writeFileSync(path.resolve(process.argv[outputIndex + 1]), JSON.stringify(results, null, 2) + '\n');
}
console.log(JSON.stringify(outputIndex >= 0 ? { ...results, rows: undefined } : results, null, 2));
