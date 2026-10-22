/* Project-owned two-phase solver. No third-party solver code or tables.
 * Coordinates and pruning use established two-phase / pattern-database ideas.
 * Tables are generated from the application's facelet move permutations.
 */
'use strict';
(function (root) {
  const factorial = [1, 1, 2, 6, 24, 120, 720, 5040, 40320];
  function rank(p) {
    let value = 0;
    for (let i = 0; i < p.length; i++) {
      let smaller = 0;
      for (let j = i + 1; j < p.length; j++) if (p[j] < p[i]) smaller++;
      value += smaller * factorial[p.length - i - 1];
    }
    return value;
  }
  function unrank(value, size) {
    const available = Array.from({ length: size }, (_, i) => i), p = [];
    for (let i = size - 1; i >= 0; i--) {
      const f = factorial[i], index = Math.floor(value / f);
      p.push(available.splice(index, 1)[0]); value %= f;
    }
    return p;
  }
  const det = (a, b, c) => a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  function createModel(P) {
    if (P.N !== 3) throw new Error('Compact two-phase supports 3×3 only.');
    const corners = P.corners.map(g => {
      const ud = g.find(i => P.stickers[i].n[1]), rest = g.filter(i => i !== ud);
      if (det(P.stickers[ud].n, P.stickers[rest[0]].n, P.stickers[rest[1]].n) < 0) rest.reverse();
      return [ud, ...rest];
    });
    const edges = P.edges.map(g => {
      const first = g.find(i => P.stickers[i].n[1]) ?? g.find(i => P.stickers[i].n[2]);
      return [first, g.find(i => i !== first)];
    }).sort((a, b) => Number(!a.some(i => P.stickers[i].n[1])) - Number(!b.some(i => P.stickers[i].n[1])));
    const homeC = corners.map(g => g.map(i => P.solved[i]).join(','));
    const homeE = edges.map(g => g.map(i => P.solved[i]));
    const parity = p => { let n = 0; for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) n ^= Number(p[i] > p[j]); return n; };
    function decode(st) {
      if (st.length !== 54) throw new Error('Expected 54 stickers.');
      const counts = new Uint8Array(6);
      for (const c of st) { if (!Number.isInteger(c) || c < 48 || c > 53) throw new Error('Invalid sticker color.'); counts[c - 48]++; }
      if (counts.some(n => n !== 9)) throw new Error('Each color must occur nine times.');
      for (let i = 0; i < 54; i++) if (P.stickers[i].p.filter(v => v !== 0).length === 1 && st[i] !== P.solved[i]) throw new Error('Centers do not match the fixed cube orientation.');
      const cp = [], co = [], ep = [], eo = [];
      for (const g of corners) {
        const colors = g.map(i => st[i]), twist = colors.findIndex(c => c === 48 || c === 51);
        const id = twist < 0 ? -1 : homeC.indexOf([colors[twist], colors[(twist + 1) % 3], colors[(twist + 2) % 3]].join(','));
        if (id < 0) throw new Error('Invalid corner.');
        cp.push(id); co.push(twist);
      }
      for (const g of edges) {
        const a = st[g[0]], b = st[g[1]];
        const id = homeE.findIndex(h => (a === h[0] && b === h[1]) || (a === h[1] && b === h[0]));
        if (id < 0) throw new Error('Invalid edge.');
        ep.push(id); eo.push(Number(a !== homeE[id][0]));
      }
      if (new Set(cp).size !== 8 || new Set(ep).size !== 12) throw new Error('Duplicate cube pieces.');
      if (co.reduce((a, b) => a + b, 0) % 3 || eo.reduce((a, b) => a + b, 0) % 2 || parity(cp) !== parity(ep)) throw new Error('Impossible twist, flip, or permutation parity.');
      return { cp, co, ep, eo };
    }
    const moves = P.moves.map(m => decode(Array.from(m.perm, i => P.solved[i])));
    function turn(s, mi) {
      const m = moves[mi];
      return {
        cp: m.cp.map(i => s.cp[i]), co: m.cp.map((i, j) => (s.co[i] + m.co[j]) % 3),
        ep: m.ep.map(i => s.ep[i]), eo: m.ep.map((i, j) => s.eo[i] ^ m.eo[j]),
      };
    }
    return { decode, moves, turn, solved: decode(P.solved) };
  }
  function orientation(a, base) { let v = 0; for (let i = 0; i < a.length - 1; i++) v = v * base + a[i]; return v; }
  function unorientation(v, n, base) {
    const a = new Uint8Array(n); let sum = 0;
    for (let i = n - 2; i >= 0; i--) { a[i] = v % base; sum += a[i]; v = Math.floor(v / base); }
    a[n - 1] = (base - sum % base) % base; return a;
  }
  function pairDistances(A, aSize, B, bSize, width, goalA, goalB) {
    const distances = new Uint8Array(aSize * bSize); distances.fill(255);
    const queue = new Uint32Array(distances.length), start = goalA * bSize + goalB;
    queue[0] = start; distances[start] = 0;
    let tail = 1;
    for (let head = 0; head < tail; head++) {
      const key = queue[head], a = Math.floor(key / bSize) * width, b = (key % bSize) * width, depth = distances[key] + 1;
      for (let m = 0; m < width; m++) {
        const next = A[a + m] * bSize + B[b + m];
        if (distances[next] === 255) { distances[next] = depth; queue[tail++] = next; }
      }
    }
    if (tail !== distances.length) throw new Error('Incomplete pruning table.');
    return distances;
  }
  function build(P, report = () => {}) {
    const model = createModel(P), moves = model.moves;
    const phase2 = P.moves.map((m, i) => m.face === 'U' || m.face === 'D' || m.q === 2 ? i : -1).filter(i => i >= 0);
    const masks = [], maskIndex = new Int16Array(4096); maskIndex.fill(-1);
    for (let mask = 0; mask < 4096; mask++) { let bits = 0; for (let x = mask; x; x &= x - 1) bits++; if (bits === 4) { maskIndex[mask] = masks.length; masks.push(mask); } }
    const slice = ep => { let mask = 0; for (let i = 0; i < 12; i++) if (ep[i] >= 8) mask |= 1 << i; return maskIndex[mask]; };
    const sliceGoal = slice(model.solved.ep);
    function orientTable(size, n, base, permName, oriName) {
      const table = new Uint16Array(size * 18);
      for (let i = 0; i < size; i++) {
        const a = unorientation(i, n, base);
        for (let m = 0; m < 18; m++) {
          let value = 0;
          for (let k = 0; k < n - 1; k++) value = value * base + (a[moves[m][permName][k]] + moves[m][oriName][k]) % base;
          table[i * 18 + m] = value;
        }
      }
      return table;
    }
    report('Building orientation transitions');
    const co = orientTable(2187, 8, 3, 'cp', 'co'), eo = orientTable(2048, 12, 2, 'ep', 'eo');
    const sl = new Uint16Array(495 * 18);
    for (let i = 0; i < 495; i++) for (let m = 0; m < 18; m++) {
      let mask = 0; for (let k = 0; k < 12; k++) if (masks[i] & (1 << moves[m].ep[k])) mask |= 1 << k;
      sl[i * 18 + m] = maskIndex[mask];
    }
    function permutationTable(size, part, offset) {
      const table = new Uint16Array(factorial[size] * 10);
      for (let i = 0; i < factorial[size]; i++) {
        const p = unrank(i, size);
        for (let m = 0; m < 10; m++) table[i * 10 + m] = rank(moves[phase2[m]][part].slice(offset, offset + size).map(j => p[j - offset]));
      }
      return table;
    }
    report('Building subgroup transitions');
    const cp = permutationTable(8, 'cp', 0), ep = permutationTable(8, 'ep', 0), sp = permutationTable(4, 'ep', 8);
    report('Building corner-orientation / slice distances');
    const coSl = pairDistances(co, 2187, sl, 495, 18, 0, sliceGoal);
    report('Building edge-orientation / slice distances');
    const eoSl = pairDistances(eo, 2048, sl, 495, 18, 0, sliceGoal);
    report('Building corner-permutation / slice distances');
    const cpSp = pairDistances(cp, 40320, sp, 24, 10, 0, 0);
    report('Building edge-permutation / slice distances');
    const epSp = pairDistances(ep, 40320, sp, 24, 10, 0, 0);
    const tableBytes = [co, eo, sl, cp, ep, sp, coSl, eoSl, cpSp, epSp].reduce((n, a) => n + a.byteLength, 0);
    return { model, phase2, slice, sliceGoal, co, eo, sl, cp, ep, sp, coSl, eoSl, cpSp, epSp, tableBytes };
  }
  // Opposite face turns commute. Keep only one order, while prohibiting
  // consecutive turns of the same face (which combine into one move).
  function allowed(face, last) { return face !== last && !(last >= 0 && (face + 3) % 6 === last && face < last); }
  function solve(T, stickers, options = {}) {
    const start = T.model.decode(stickers), now = () => performance.now();
    const started = now(), deadline = started + (options.timeoutMs ?? 30000), maxNodes = options.maxNodes ?? 20000000;
    const report = options.report || (() => {}), path = [], path2 = [];
    let nodes = 0, result = null;
    function check() {
      nodes++;
      if (nodes > maxNodes) throw new Error('Search node budget reached; no solution is being claimed.');
      if ((nodes & 2047) === 0) {
        if (now() >= deadline) throw new Error('Search time budget reached; no solution is being claimed.');
        if ((nodes & 65535) === 0) report({ nodes, elapsedMs: now() - started });
      }
    }
    const h1 = (c, e, s) => Math.max(T.coSl[c * 495 + s], T.eoSl[e * 495 + s]);
    const h2 = (c, e, s) => Math.max(T.cpSp[c * 24 + s], T.epSp[e * 24 + s]);
    let endpointNodes = 0;
    function dfs2(c, e, s, left, last) {
      check();
      if (++endpointNodes > 250000) return false;
      if (h2(c, e, s) > left) return false;
      if (!left) return c === 0 && e === 0 && s === 0;
      for (let j = 0; j < 10; j++) {
        const mi = T.phase2[j], face = Math.floor(mi / 3);
        if (!allowed(face, last)) continue;
        path2.push(mi);
        if (dfs2(T.cp[c * 10 + j], T.ep[e * 10 + j], T.sp[s * 10 + j], left - 1, face)) return true;
        path2.pop();
        if (endpointNodes > 250000) return false;
      }
      return false;
    }
    function finish() {
      let state = start;
      for (const mi of path) state = T.model.turn(state, mi);
      const c = rank(state.cp), e = rank(state.ep.slice(0, 8)), s = rank(state.ep.slice(8).map(i => i - 8));
      endpointNodes = 0;
      for (let depth = h2(c, e, s); depth <= 18; depth++) {
        path2.length = 0;
        if (dfs2(c, e, s, depth, -1)) { result = { moves: path.concat(path2), split: path.length }; return true; }
        if (endpointNodes > 250000) break;
      }
      return false;
    }
    function dfs1(c, e, s, left, last) {
      check();
      if (h1(c, e, s) > left) return false;
      if (!left) return c === 0 && e === 0 && s === T.sliceGoal && finish();
      for (let mi = 0; mi < 18; mi++) {
        const face = Math.floor(mi / 3);
        if (!allowed(face, last)) continue;
        path.push(mi);
        if (dfs1(T.co[c * 18 + mi], T.eo[e * 18 + mi], T.sl[s * 18 + mi], left - 1, face)) return true;
        path.pop();
      }
      return false;
    }
    const c = orientation(start.co, 3), e = orientation(start.eo, 2), s = T.slice(start.ep);
    for (let depth = h1(c, e, s); depth <= 12; depth++) {
      report({ phase1Depth: depth, nodes, elapsedMs: now() - started });
      if (dfs1(c, e, s, depth, -1)) break;
    }
    if (!result) throw new Error('Bounded search exhausted its candidates; no solution is being claimed.');
    let verified = start;
    for (const mi of result.moves) verified = T.model.turn(verified, mi);
    if (rank(verified.cp) || verified.ep.some((p, i) => p !== i) || verified.co.some(Boolean) || verified.eo.some(Boolean)) throw new Error('Internal solution verification failed.');
    return { ...result, nodes, elapsedMs: now() - started, tableBytes: T.tableBytes, optimal: false };
  }
  const api = { createModel, build, solve, rank, unrank, orientation };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CompactSolver = api;
})(globalThis);
