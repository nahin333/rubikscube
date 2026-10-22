// No browser or dependencies required: node tests/search.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');

function load(html) {
  const source = html.slice(html.indexOf('// ---------- Puzzle model'), html.indexOf('// ---------- App state'));
  const context = vm.createContext({ TextDecoder, performance });
  return vm.runInContext(source + '\n({buildPuzzle, applyMove, toKey, fromKey, heuristic, inverse, createSearch})', context);
}
const html = fs.readFileSync('index.html', 'utf8');
const engine = load(html);
// Parse the complete inline app as well as the independently executable core.
for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
  if (match[1].trim()) new vm.Script(match[1]);
}
const rawKey = state => Array.from(state).join(',');
function run(E, P, state, algo, cap = 50000) {
  const S = E.createSearch(P, E.toKey(state), algo, cap);
  let steps = 0;
  while (!S.done) { S.step(127); assert(++steps < 100000, 'Search failed to terminate'); }
  return S;
}
function checkSolution(E, P, state, S, distance) {
  assert.equal(S.error, null);
  assert.ok(S.result);
  if (distance !== undefined) assert.equal(S.result.moves.length, distance);
  for (const mi of S.result.moves) state = E.applyMove(P, state, mi);
  assert.equal(rawKey(state), rawKey(P.solved), 'Replay must solve every sticker');
  if (S.samples) {
    const actual = [[], []];
    for (let i = 0; i < S.n; i++) actual[S.sd[i]][S.dep[i]] = (actual[S.sd[i]][S.dep[i]] || 0) + 1;
    for (let side = 0; side < 2; side++) for (let depth = 0; depth < S.counts[side].length; depth++) {
      assert.equal(S.counts[side][depth], actual[side][depth] || 0, 'Chart must count current depths accurately');
    }
  }
  for (const chain of [S.result.fchain, Array.from(S.result.bchain).reverse()]) {
    for (let j = 1; j < chain.length; j++) {
      const parent = chain[j - 1], child = chain[j];
      const decoded = E.fromKey(S.keys[parent], new Uint8Array(P.S));
      assert.equal(E.toKey(E.applyMove(P, decoded, S.mv[child])), S.keys[child]);
    }
  }
}

// Seeded deeper cases exercise uneven frontier sizes and A* path improvements.
let checked = 0;
let seed = 0x52b1c;
const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
for (const [N, length] of [[2, 6], [3, 4]]) {
  const puzzle = engine.buildPuzzle(N);
  for (let trial = 0; trial < 12; trial++) {
    let state = puzzle.solved;
    for (let k = 0; k < length; k++) state = engine.applyMove(puzzle, state, random(puzzle.moves.length));
    const oracle = run(engine, puzzle, state, 'bfs', 100000);
    checkSolution(engine, puzzle, state, oracle);
    for (const algo of ['bidir', 'astar']) checkSolution(engine, puzzle, state, run(engine, puzzle, state, algo, 100000), oracle.result.moves.length);
    checked += 3;
  }
}

for (const [N, maxDepth] of [[2, 3], [3, 2]]) {
  const P = engine.buildPuzzle(N);
  for (let mi = 0; mi < P.moves.length; mi++) {
    assert.equal(rawKey(engine.applyMove(P, engine.applyMove(P, P.solved, mi), engine.inverse(mi))), rawKey(P.solved));
  }
  // Independent unpruned BFS with uncompressed keys is the shortest-distance oracle.
  const queue = [{ state: P.solved, depth: 0 }], seen = new Set([rawKey(P.solved)]);
  const perDepth = [];
  for (let head = 0; head < queue.length; head++) {
    const { state, depth } = queue[head];
    perDepth[depth] = (perDepth[depth] || 0) + 1;
    assert.equal(rawKey(engine.fromKey(engine.toKey(state), new Uint8Array(P.S))), rawKey(state));
    assert.ok(engine.heuristic(P, engine.toKey(state)) <= depth);
    for (const algo of ['bidir', 'bfs', 'astar']) {
      const S = run(engine, P, state, algo);
      checkSolution(engine, P, state, S, depth);
      for (const side of S.samples) for (const layer of side) if (layer) assert.ok(layer.ids.length <= 420);
      checked++;
    }
    if (depth === maxDepth) continue;
    for (let mi = 0; mi < P.moves.length; mi++) {
      const next = engine.applyMove(P, state, mi), key = rawKey(next);
      if (!seen.has(key)) { seen.add(key); queue.push({ state: next, depth: depth + 1 }); }
    }
  }
  assert.deepEqual(perDepth, N === 2 ? [1, 9, 54, 321] : [1, 18, 243]);
}

// A meeting at the exact memory limit must succeed; a genuine exhaustion must not.
const P = engine.buildPuzzle(3);
const oneTurn = engine.applyMove(P, P.solved, 2);
checkSolution(engine, P, oneTurn, run(engine, P, oneTurn, 'bidir', 3), 1);
for (const algo of ['bidir', 'bfs', 'astar']) {
  const state = engine.applyMove(P, engine.applyMove(P, P.solved, 0), 3);
  const S = run(engine, P, state, algo, 2);
  assert.equal(S.error, 'cap'); assert.equal(S.n, 2); assert.equal(S.result, null);
}
console.log(`PASS: ${checked} searches checked against independent BFS; move inverses, key round trips, replay, parent chains, samples and strict caps checked.`);

if (process.argv.includes('--benchmark')) {
  const baseline = load(execFileSync('git', ['show', '54b37a92fed869a00cf5ce1e1617cd19f5aa3545:index.html'], { encoding: 'utf8' }));
  for (const [N, scramble] of [[2, "R U F2 R' U2 F R2 U'"], [3, "R U F2 L D B' R2 U'"], [3, "R U F2 L D B' R2 U' F D2"]]) {
    let expectedLength;
    for (const [label, E] of [['before', baseline], ['after', engine]]) {
      const puzzle = E.buildPuzzle(N);
      let state = puzzle.solved;
      for (const token of scramble.split(' ')) state = E.applyMove(puzzle, state, puzzle.moveIndex.get(token));
      const times = [];
      let S;
      for (let trial = 0; trial < 3; trial++) {
        const started = performance.now(); S = run(E, puzzle, state, 'bidir', 1500000);
        times.push(performance.now() - started);
        checkSolution(E, puzzle, state, S, expectedLength);
      }
      expectedLength = S.result.moves.length;
      console.log(JSON.stringify({ N, scramble, version: label, medianMs: Math.round(times.sort((a,b) => a-b)[1]), states: S.n, expanded: S.expanded, length: S.result.moves.length, error: S.error }));
    }
  }
}
