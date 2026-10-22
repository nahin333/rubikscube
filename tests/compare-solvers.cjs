// CUBEJS_MODULE=/path/to/cubejs node tests/compare-solvers.cjs
// Emits raw JSON; all times exclude facelet replay and table setup unless noted.
const fs = require('node:fs');
const vm = require('node:vm');
const os = require('node:os');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const compact = require('../compact-solver.js');
const Cube = require(process.env.CUBEJS_MODULE || 'cubejs');
assert.equal(require((process.env.CUBEJS_MODULE || 'cubejs') + '/package.json').version, '1.3.2', 'Use the pinned cubejs baseline');
const html = fs.readFileSync('index.html', 'utf8');
const core = html.slice(html.indexOf('// ---------- Puzzle model'), html.indexOf('// ---------- App state'));
const E = vm.runInNewContext(core + '\n({buildPuzzle, applyMove})'), P = E.buildPuzzle(3);
const views = [ [[1,0,0],[0,0,1]], [[0,0,-1],[0,-1,0]], [[1,0,0],[0,-1,0]], [[1,0,0],[0,0,-1]], [[0,0,1],[0,-1,0]], [[-1,0,0],[0,-1,0]] ];
const dot = (a,b) => a.reduce((sum,v,i) => sum + v*b[i],0);
const indices = P.stickers.map(s => s.face * 9 + (dot(s.p,views[s.face][1])/2 + 1)*3 + dot(s.p,views[s.face][0])/2 + 1);
function facelets(state) { const chars = []; state.forEach((c,i) => chars[indices[i]] = 'URFDLB'[c-48]); return chars.join(''); }
let start = performance.now(); const tables = compact.build(P); const compactSetupMs = performance.now()-start;
start = performance.now(); Cube.initSolver(); const cubejsSetupMs = performance.now()-start;
let seed = 0x74bc39;
const random = n => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return Math.floor(seed/4294967296*n); };
const rows = [];
for (let trial=0; trial<200; trial++) {
  const scramble=[]; let state=P.solved, last=-1;
  for (let k=0, length=20+random(21); k<length; k++) {
    let face; do { face=random(6); } while(face===last);
    const mi=face*3+random(3); scramble.push(P.moves[mi].name); state=E.applyMove(P,state,mi); last=face;
  }
  const row={trial, scramble:scramble.join(' ')};
  // Alternate order to reduce a consistent order advantage.
  for (const name of trial%2 ? ['cubejs','compact'] : ['compact','cubejs']) {
    const input = name === 'cubejs' ? Cube.fromString(facelets(state)) : state;
    const begin=performance.now();
    let moves, nodes;
    if(name==='compact') { const result=compact.solve(tables,input); moves=result.moves; nodes=result.nodes; }
    else { const str=input.solve(); moves=str.trim() ? str.trim().split(/\s+/).map(n=>P.moveIndex.get(n)) : []; }
    const ms=performance.now()-begin;
    let replay=state;
    for(const mi of moves) { assert.notEqual(mi,undefined); replay=E.applyMove(P,replay,mi); }
    assert.deepEqual(Array.from(replay),Array.from(P.solved));
    row[name]={ms,length:moves.length,...(nodes===undefined?{}:{nodes})};
  }
  rows.push(row);
}
function summary(name) {
  const times=rows.map(r=>r[name].ms).sort((a,b)=>a-b), lengths=rows.map(r=>r[name].length);
  return {verified:rows.length, medianMs:times[Math.floor(times.length/2)], p95Ms:times[Math.ceil(times.length*0.95)-1], maxMs:times.at(-1), meanMoves:lengths.reduce((a,b)=>a+b,0)/lengths.length, maxMoves:Math.max(...lengths)};
}
console.log(JSON.stringify({compactSourceSha256:createHash('sha256').update(fs.readFileSync('compact-solver.js')).digest('hex'),baselineVersion:'cubejs 1.3.2',environment:{node:process.version,platform:os.platform(),arch:os.arch(),cpu:os.cpus()[0].model}, seed:'0x74bc39', fixture:'200 seeded 20–40-turn scrambles, no consecutive same-face turns; not uniformly random states', compactSetupMs,cubejsSetupMs,compactTableBytes:tables.tableBytes,compact:summary('compact'),cubejs:summary('cubejs'),rows},null,2));
