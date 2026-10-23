'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const Module = require('node:module');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const E = vm.runInNewContext(html.slice(html.indexOf('// ---------- Puzzle model'), html.indexOf('// ---------- App state')) + '\n({buildPuzzle, applyMove})');
const P = E.buildPuzzle(3);
const baselineRevision = 'e7023a8d96681c6a4c23a19c4c4ecb5208b910e4';
function baselineSolver() {
  const filename = path.join(__dirname, 'pinned-scalar-solver.cjs');
  const source = execFileSync('git', ['show', `${baselineRevision}:compact-solver.js`], { cwd: root, encoding: 'utf8' });
  // Compile in the same JS realm as the candidate. A separate VM's global
  // lookups can distort timing even when the source code is identical.
  const loaded = new Module(filename, module); loaded.filename = filename;
  loaded.paths = module.paths; loaded._compile(source, filename);
  return { solver: loaded.exports, source };
}
function rng(seed) {
  return n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.floor(seed / 4294967296 * n); };
}
function scrambleState(scramble) {
  return scramble.trim().split(/\s+/).filter(Boolean).reduce((s, m) => E.applyMove(P, s, P.moveIndex.get(m)), P.solved);
}
const parity = p => { let result = 0; for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) result ^= Number(p[i] > p[j]); return result; };
const det = (a, b, c) => a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
const corners = P.corners.map(g => {
  const ud = g.find(i => P.stickers[i].n[1]), rest = g.filter(i => i !== ud);
  if (det(P.stickers[ud].n, P.stickers[rest[0]].n, P.stickers[rest[1]].n) < 0) rest.reverse();
  return [ud, ...rest];
});
const edges = P.edges.map(g => {
  const first = g.find(i => P.stickers[i].n[1]) ?? g.find(i => P.stickers[i].n[2]);
  return [first, g.find(i => i !== first)];
}).sort((a, b) => Number(!a.some(i => P.stickers[i].n[1])) - Number(!b.some(i => P.stickers[i].n[1])));
function uniformStates(count, seed) {
  const random = rng(seed);
  const permute = n => {
    const p = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = random(i + 1); [p[i], p[j]] = [p[j], p[i]]; }
    return p;
  };
  const orient = (n, base) => {
    const a = Array.from({ length: n - 1 }, () => random(base));
    a.push((base - a.reduce((s, v) => s + v, 0) % base) % base); return a;
  };
  return Array.from({ length: count }, (_, id) => {
    const cp = permute(8), ep = permute(12), co = orient(8, 3), eo = orient(12, 2);
    if (parity(cp) !== parity(ep)) [ep[0], ep[1]] = [ep[1], ep[0]];
    const stickers = new Uint8Array(P.solved);
    corners.forEach((g, i) => g.forEach((_, k) => { stickers[g[(co[i] + k) % 3]] = P.solved[corners[cp[i]][k]]; }));
    edges.forEach((g, i) => g.forEach((_, k) => { stickers[g[k ^ eo[i]]] = P.solved[edges[ep[i]][k]]; }));
    return { id, stickers, cubies: { cp, co, ep, eo } };
  });
}
module.exports = { P, E, root, baselineRevision, baselineSolver, rng, scrambleState, uniformStates };
