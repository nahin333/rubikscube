const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const solver = require('../compact-solver.js');
const html = fs.readFileSync('index.html', 'utf8');
const core = html.slice(html.indexOf('// ---------- Puzzle model'), html.indexOf('// ---------- App state'));
const E = vm.runInNewContext(core + '\n({buildPuzzle, applyMove})');
const P = E.buildPuzzle(3), model = solver.createModel(P);
let seed = 381755;
const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.floor(seed / 4294967296 * n); };
let state = P.solved, cubies = model.decode(state);
for (let trial = 0; trial < 1000; trial++) {
  const mi = random(18);
  state = E.applyMove(P, state, mi); cubies = model.turn(cubies, mi);
  assert.deepEqual(cubies, model.decode(state), 'Cubie transitions must agree with facelet geometry');
}
for (let i = 0; i < 40320; i++) assert.equal(solver.rank(solver.unrank(i, 8)), i);
console.log('PASS: 1,000 cubie transitions and all 40,320 permutation ranks.');
const start = performance.now();
const tables = solver.build(P, stage => console.log(stage));
console.log(`Tables: ${tables.tableBytes} bytes; built in ${Math.round(performance.now() - start)} ms`);
const cases = [[]];
for (let i = 0; i < 18; i++) cases.push([i]);
for (let i = 0; i < 200; i++) {
  const moves = []; let last = -1;
  for (let k = 0, length = 20 + random(21); k < length; k++) {
    let face; do { face = random(6); } while (face === last);
    moves.push(face * 3 + random(3)); last = face;
  }
  cases.push(moves);
}
const times = [], lengths = [];
for (let i = 0; i < cases.length; i++) {
  let state = P.solved;
  for (const mi of cases[i]) state = E.applyMove(P, state, mi);
  const result = solver.solve(tables, state);
  let midway = model.decode(state);
  for (const mi of result.moves.slice(0, result.split)) midway = model.turn(midway, mi);
  assert.equal(solver.orientation(midway.co, 3), 0);
  assert.equal(solver.orientation(midway.eo, 2), 0);
  assert.equal(tables.slice(midway.ep), tables.sliceGoal);
  assert.ok(result.moves.slice(result.split).every(mi => tables.phase2.includes(mi)));
  for (const mi of result.moves) state = E.applyMove(P, state, mi);
  assert.deepEqual(Array.from(state), Array.from(P.solved), `Facelet replay failed for case ${i}`);
  times.push(result.elapsedMs); lengths.push(result.moves.length);
  if (i % 10 === 0) console.log(`Verified ${i + 1}/${cases.length} solves`);
}
assert.throws(() => solver.solve(tables, E.applyMove(P, P.solved, 3), { maxNodes: 0 }), /budget/);
const invalid = new Uint8Array(P.solved); invalid[0] = 49;
assert.throws(() => solver.solve(tables, invalid), /nine times/);
const flipped = new Uint8Array(P.solved), edge = P.edges[0];
[flipped[edge[0]], flipped[edge[1]]] = [flipped[edge[1]], flipped[edge[0]]];
assert.throws(() => solver.solve(tables, flipped), /parity/);
const twisted = new Uint8Array(P.solved), corner = P.corners[0];
[twisted[corner[0]], twisted[corner[1]], twisted[corner[2]]] = [twisted[corner[1]], twisted[corner[2]], twisted[corner[0]]];
assert.throws(() => solver.solve(tables, twisted), /parity/);
console.log(JSON.stringify({ verified: cases.length, medianMs: times.sort((a,b) => a-b)[times.length >> 1], maxMs: Math.max(...times), maxMoves: Math.max(...lengths) }));
