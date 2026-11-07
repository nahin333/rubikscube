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
  // Opposite face turns commute. Keep only one order, while prohibiting
  // consecutive turns of the same face (which combine into one move).
  function allowed(face, last) { return face !== last && !(last >= 0 && (face + 3) % 6 === last && face < last); }
  const popcount = v => { v -= (v >>> 1) & 0x55555555; v = (v & 0x33333333) + ((v >>> 2) & 0x33333333); return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; };
  const allowed1Swar = Array.from({ length: 7 }, (_, i) => {
    let mask = 0;
    for (let f = 0; f < 6; f++) if (allowed(f, i - 1)) mask |= 7 << (f * 4);
    return mask;
  });
  const deadCost1 = Array.from({ length: 6 }, (_, f) => popcount(allowed1Swar[f + 1]));
  // Compile a paired abstraction into a dictionary of distance/contour signatures.
  // An undirected unit-cost move changes an exact distance by at most one.
  // At remaining depth d, successors must decrease distance; at d+1 they
  // must not increase it; at d+2 or more every move passes this abstraction.
  function compileContours(A, B, distances) {
    const ids = new Uint16Array(distances.length), dictionary = [], index = new Map();
    for (let key = 0; key < distances.length; key++) {
      const d = distances[key], a = Math.floor(key / 24) * 10, b = (key % 24) * 10;
      if (d > 15) throw new Error('Contour encoding needs a distance of at most 15.');
      let down = 0, nonIncreasing = 0;
      for (let m = 0; m < 10; m++) {
        const next = distances[A[a + m] * 24 + B[b + m]];
        if (Math.abs(next - d) > 1) throw new Error('Invalid distance-table transition.');
        if (next < d) down |= 1 << m;
        if (next <= d) nonIncreasing |= 1 << m;
      }
      const signature = (d << 20) | (nonIncreasing << 10) | down;
      let id = index.get(signature);
      if (id === undefined) {
        id = dictionary.length;
        if (id >= 65536) throw new Error('Contour dictionary exceeds its 16-bit index.');
        index.set(signature, id); dictionary.push(signature);
      }
      ids[key] = id;
    }
    return { ids, dictionary: Uint32Array.from(dictionary) };
  }
  // Phase-1 Cayley-clique syndrome compiler. The three turns of each outer face
  // form a K_4 coset clique in the half-turn Cayley graph, so any strictly
  // decreasing turn implies all three turns of that face are non-increasing.
  // Each face therefore packs into a 4-bit syndrome (mu_f << 3) | v_f, and
  // potentialFree=true omits scalar distances altogether (24 bits / 3 bytes).
  function compileCliqueSwar(A, aSize, B, bSize, distances, potentialFree = true) {
    const out32 = potentialFree ? null : new Uint32Array(distances.length);
    const out24 = potentialFree ? new Uint8Array(distances.length * 3) : null;
    for (let ai = 0, key = 0; ai < aSize; ai++) {
      const ab = ai * 18;
      for (let bi = 0; bi < bSize; bi++, key++) {
        const d = distances[key], bb = bi * 18;
        if (d > 15) throw new Error('Clique-syndrome encoding needs a distance of at most 15.');
        let syndromes = 0;
        for (let f = 0; f < 6; f++) {
          const fb = f * 3;
          let down = 0, nonIncreasing = 0;
          for (let q = 0; q < 3; q++) {
            const m = fb + q, next = distances[A[ab + m] * bSize + B[bb + m]];
            if (Math.abs(next - d) > 1) throw new Error('Invalid distance-table transition.');
            if (next < d) down |= 1 << q;
            if (next <= d) nonIncreasing |= 1 << q;
          }
          if (down !== 0 && nonIncreasing !== 7) throw new Error('Cayley K_4 clique invariant violated.');
          syndromes |= (down ? (8 | down) : nonIncreasing) << (f * 4);
        }
        if (potentialFree) {
          const i = key * 3;
          out24[i] = syndromes & 255; out24[i + 1] = (syndromes >>> 8) & 255; out24[i + 2] = syndromes >>> 16;
        } else {
          out32[key] = (d << 24) | syndromes;
        }
      }
    }
    return potentialFree ? out24 : out32;
  }
  // Phase-2 potential-free coboundary & unary Horizon-2 shared dictionary.
  // Omitting scalar distance d quotients signatures across level sets and frees
  // 10 bits in the 32-bit word for the canonical Horizon-2 survival mask h2s0.
  function compileCoboundaryH2(cp, ep, sp, cpSp, epSp, phase2) {
    const face2 = phase2.map(mi => Math.floor(mi / 3));
    const allowed2 = Array.from({ length: 7 }, (_, i) => phase2.reduce((mask, mi, j) => allowed(Math.floor(mi / 3), i - 1) ? mask | (1 << j) : mask, 0));
    const deadCost2 = Array.from({ length: 6 }, (_, f) => popcount(allowed2[f + 1]));
    const extraDead2 = new Uint8Array(1024);
    for (let m = 1; m < 1024; m++) { const b = m & -m; extraDead2[m] = extraDead2[m ^ b] + deadCost2[face2[31 - Math.clz32(b)]]; }
    const hashKeys = new Uint32Array(65536), hashIds = new Int32Array(65536).fill(-1), dictionary = [];
    function encode(A, distances) {
      const n = distances.length, mDown = new Uint16Array(n), mStay = new Uint16Array(n), ids = new Uint16Array(n);
      for (let ai = 0, key = 0; ai < 40320; ai++) {
        const ab = ai * 10;
        for (let bi = 0; bi < 24; bi++, key++) {
          const d = distances[key], bb = bi * 10;
          if (d > 18) throw new Error('Invalid Phase-2 distance.');
          let down = 0, nonIncreasing = 0;
          for (let j = 0; j < 10; j++) {
            const next = distances[A[ab + j] * 24 + sp[bb + j]];
            if (Math.abs(next - d) > 1) throw new Error('Invalid distance-table transition.');
            if (next < d) down |= 1 << j;
            if (next <= d) nonIncreasing |= 1 << j;
          }
          if (key !== 0 && down === 0) throw new Error('Non-goal state lacks a descent edge.');
          mDown[key] = down; mStay[key] = nonIncreasing;
        }
      }
      for (let ai = 0, key = 0; ai < 40320; ai++) {
        const ab = ai * 10;
        for (let bi = 0; bi < 24; bi++, key++) {
          const bb = bi * 10, down = mDown[key];
          let h2s0 = 0;
          for (let rem = down; rem; rem &= rem - 1) {
            const bit = rem & -rem, j = 31 - Math.clz32(bit);
            if (allowed2[face2[j] + 1] & mDown[A[ab + j] * 24 + sp[bb + j]]) h2s0 |= bit;
          }
          const word = (h2s0 << 20) | (mStay[key] << 10) | down;
          let slot = (Math.imul(word ^ (word >>> 16), 0x45d9f3b) >>> 16) & 65535;
          while (hashIds[slot] >= 0 && hashKeys[slot] !== word) slot = (slot + 1) & 65535;
          let id = hashIds[slot];
          if (id < 0) {
            id = dictionary.length;
            if (id >= 65536) throw new Error('Coboundary Horizon-2 dictionary exceeds its 16-bit index.');
            hashKeys[slot] = word; hashIds[slot] = id; dictionary.push(word);
          }
          ids[key] = id;
        }
      }
      return ids;
    }
    const cpIds = encode(cp, cpSp), epIds = encode(ep, epSp);
    return { cpIds, epIds, h2Dict: Uint32Array.from(dictionary), extraDead2 };
  }
  function countTableBytes(T) {
    let total = 0;
    for (const key of ['co', 'eo', 'sl', 'cp', 'ep', 'sp', 'coSl', 'eoSl', 'coSwar', 'eoSwar', 'co24', 'eo24', 'cpSp', 'epSp', 'cpSignatures', 'epSignatures', 'h2Dict', 'extraDead2']) {
      if (T[key] && T[key].byteLength) total += T[key].byteLength;
    }
    return total;
  }
  function compileTables(T, report = () => {}, options = {}) {
    const mode = options.expansion ?? 'dual';
    if (mode === 'scalar') return T;
    if (mode === 'contour') {
      if (T.cpSignatures && T.epSignatures) return T;
      report('Compiling budget-preserving contour dictionaries');
      const corner = compileContours(T.cp, T.sp, T.cpSp), edge = compileContours(T.ep, T.sp, T.epSp);
      const next = { ...T, expansion: 'contour', cpSp: corner.ids, epSp: edge.ids, cpSignatures: corner.dictionary, epSignatures: edge.dictionary };
      next.tableBytes = countTableBytes(next);
      return next;
    }
    if (T.h2Dict && T.expansion === mode) return T;
    report('Compiling potential-free clique-syndrome & coboundary tables');
    const h2 = compileCoboundaryH2(T.cp, T.ep, T.sp, T.cpSp, T.epSp, T.phase2);
    if (mode === 'h2only') {
      const next = { ...T, expansion: 'h2only', cpSp: h2.cpIds, epSp: h2.epIds, h2Dict: h2.h2Dict, extraDead2: h2.extraDead2 };
      next.tableBytes = countTableBytes(next);
      return next;
    }
    if (mode === 'dual32') {
      const coSwar = compileCliqueSwar(T.co, 2187, T.sl, 495, T.coSl, false);
      const eoSwar = compileCliqueSwar(T.eo, 2048, T.sl, 495, T.eoSl, false);
      const next = { ...T, expansion: 'dual32', coSl: null, eoSl: null, coSwar, eoSwar, cpSp: h2.cpIds, epSp: h2.epIds, h2Dict: h2.h2Dict, extraDead2: h2.extraDead2 };
      next.tableBytes = countTableBytes(next);
      return next;
    }
    const co24 = compileCliqueSwar(T.co, 2187, T.sl, 495, T.coSl, true);
    const eo24 = compileCliqueSwar(T.eo, 2048, T.sl, 495, T.eoSl, true);
    const next = { ...T, expansion: 'dual', coSl: null, eoSl: null, co24, eo24, cpSp: h2.cpIds, epSp: h2.epIds, h2Dict: h2.h2Dict, extraDead2: h2.extraDead2 };
    next.tableBytes = countTableBytes(next);
    return next;
  }
  function build(P, report = () => {}, options = {}) {
    const model = createModel(P), moves = model.moves;
    const phase2 = P.moves.map((m, i) => m.face === 'U' || m.face === 'D' || m.q === 2 ? i : -1).filter(i => i >= 0);
    const face2 = phase2.map(mi => Math.floor(mi / 3));
    const allowed2 = Array.from({ length: 7 }, (_, i) => phase2.reduce((mask, mi, j) => allowed(Math.floor(mi / 3), i - 1) ? mask | (1 << j) : mask, 0));
    const deadCost2 = Array.from({ length: 6 }, (_, f) => popcount(allowed2[f + 1]));
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
    const tables = { expansion: 'scalar', model, phase2, face2, allowed2, deadCost2, slice, sliceGoal, co, eo, sl, cp, ep, sp, coSl, eoSl, cpSp, epSp, tableBytes: 0 };
    tables.tableBytes = countTableBytes(tables);
    return options.expansion === 'scalar' ? tables : compileTables(tables, report, options);
  }
  const read24 = (arr, k) => { const i = k * 3; return arr[i] | (arr[i + 1] << 8) | (arr[i + 2] << 16); };
  const swarMask = (w, slack) => {
    if (slack >= 2) return 0x777777;
    const mask3 = ((w >>> 3) & 0x111111) * 7;
    return slack === 1 ? ((w & 0x777777) | mask3) : (w & mask3);
  };
  function solve(T, stickers, options = {}) {
    const start = T.model.decode(stickers), now = () => performance.now();
    const started = now(), deadline = started + (options.timeoutMs ?? 30000), maxNodes = options.maxNodes ?? 20000000;
    const report = options.report || (() => {}), path = [], path2 = [];
    let nodes = 0, generatedNodes = 0, skippedNodes = 0, result = null;
    function checkpoint() {
      if (now() >= deadline) throw new Error('Search time budget reached; no solution is being claimed.');
      if ((nodes & 65535) === 0) report({ nodes, elapsedMs: now() - started });
    }
    function check() {
      nodes++; generatedNodes++;
      if (nodes > maxNodes) throw new Error('Search node budget reached; no solution is being claimed.');
      if ((nodes & 2047) === 0) checkpoint();
    }
    function dist1(A, a, s, arr) {
      let d = 0;
      while (a !== 0 || s !== T.sliceGoal) {
        const w = read24(arr, a * 495 + s), mDown = w & (((w >>> 3) & 0x111111) * 7);
        const pos = 31 - Math.clz32(mDown & -mDown), mi = pos - (pos >>> 2);
        a = A[a * 18 + mi]; s = T.sl[s * 18 + mi]; d++;
      }
      return d;
    }
    function dist2(A, a, s, ids) {
      let d = 0;
      while (a !== 0 || s !== 0) {
        const mDown = T.h2Dict[ids[a * 24 + s]] & 1023, j = 31 - Math.clz32(mDown & -mDown);
        a = A[a * 10 + j]; s = T.sp[s * 10 + j]; d++;
      }
      return d;
    }
    const h1 = T.coSwar
      ? (c, e, s) => Math.max(T.coSwar[c * 495 + s] >>> 24, T.eoSwar[e * 495 + s] >>> 24)
      : T.co24
        ? (c, e, s) => Math.max(dist1(T.co, c, s, T.co24), dist1(T.eo, e, s, T.eo24))
        : (c, e, s) => Math.max(T.coSl[c * 495 + s], T.eoSl[e * 495 + s]);
    const contourCompiled = Boolean(T.cpSignatures && T.epSignatures);
    const h2 = contourCompiled
      ? (c, e, s) => Math.max(T.cpSignatures[T.cpSp[c * 24 + s]] >>> 20, T.epSignatures[T.epSp[e * 24 + s]] >>> 20)
      : T.h2Dict
        ? (c, e, s) => Math.max(dist2(T.cp, c, s, T.cpSp), dist2(T.ep, e, s, T.epSp))
        : (c, e, s) => Math.max(T.cpSp[c * 24 + s], T.epSp[e * 24 + s]);
    let endpointNodes = 0, inPhase2 = false;
    function dfs2Scalar(c, e, s, left, last) {
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
    // Charge rejected children exactly as the scalar DFS would have visited
    // them. Stop at the same endpoint/global limits, and retain every periodic
    // timeout/progress checkpoint even when several visits are batched.
    function skip(count) {
      const next = nodes + count;
      if (((nodes & 2047) + count) < 2048 && next <= maxNodes && (!inPhase2 || endpointNodes + count <= 250000)) {
        nodes = next; skippedNodes += count;
        if (inPhase2) endpointNodes += count;
        return;
      }
      if (inPhase2) count = Math.min(count, 250001 - endpointNodes);
      while (count > 0) {
        const step = Math.min(count, 2048 - (nodes & 2047), maxNodes + 1 - nodes);
        nodes += step; skippedNodes += step;
        if (nodes > maxNodes) throw new Error('Search node budget reached; no solution is being claimed.');
        if ((nodes & 2047) === 0) checkpoint();
        if (inPhase2) endpointNodes += step;
        count -= step;
      }
    }
    const allowed2 = T.allowed2 || Array.from({ length: 7 }, (_, i) => T.phase2.reduce((mask, mi, j) => allowed(Math.floor(mi / 3), i - 1) ? mask | (1 << j) : mask, 0));
    const face2 = T.face2 || T.phase2.map(mi => Math.floor(mi / 3));
    const deadCost2 = T.deadCost2 || Array.from({ length: 6 }, (_, f) => popcount(allowed2[f + 1]));
    const contourMask = (signature, left) => {
      const slack = left - (signature >>> 20);
      return slack >= 2 ? 1023 : slack === 1 ? (signature >>> 10) & 1023 : signature & 1023;
    };
    function dfs2Contour(c, e, s, left, last) {
      check();
      if (++endpointNodes > 250000) return false;
      const corner = T.cpSignatures[T.cpSp[c * 24 + s]], edge = T.epSignatures[T.epSp[e * 24 + s]];
      if ((corner >>> 20) > left || (edge >>> 20) > left) return false;
      if (!left) return c === 0 && e === 0 && s === 0;
      let uncharged = allowed2[last + 1];
      let candidates = uncharged & contourMask(corner, left) & contourMask(edge, left);
      const cb = c * 10, eb = e * 10, sb = s * 10;
      while (candidates) {
        const bit = candidates & -candidates, rejected = uncharged & (bit - 1);
        skip(popcount(rejected));
        if (endpointNodes > 250000) return false;
        uncharged &= ~(rejected | bit); candidates &= candidates - 1;
        const j = 31 - Math.clz32(bit), mi = T.phase2[j];
        path2.push(mi);
        if (dfs2(T.cp[cb + j], T.ep[eb + j], T.sp[sb + j], left - 1, Math.floor(mi / 3))) return true;
        path2.pop();
        if (endpointNodes > 250000) return false;
      }
      skip(popcount(uncharged));
      return false;
    }
    const dfs2 = contourCompiled && options.expansion !== 'scalar' ? dfs2Contour : dfs2Scalar;
    const useH2 = Boolean(T.h2Dict) && options.expansion !== 'scalar' && options.expansion !== 'contour';
    function dfs2H2(c, e, s, left, last, dc, de, cw, ew, h1Cand, cand) {
      check();
      if (++endpointNodes > 250000) return false;
      let rem = allowed2[last + 1];
      const dead1 = h1Cand & ~cand, cb = c * 10, eb = e * 10, sb = s * 10, nl = left - 1;
      if (nl === 0) {
        while (cand) {
          const bit = cand & -cand, pre = rem & (bit - 1);
          if (pre) { skip(popcount(pre)); if (endpointNodes > 250000) return false; }
          rem &= ~(pre | bit); cand &= cand - 1;
          const j = 31 - Math.clz32(bit);
          check();
          if (++endpointNodes > 250000) return false;
          if (T.cp[cb + j] === 0 && T.ep[eb + j] === 0 && T.sp[sb + j] === 0) { path2.push(T.phase2[j]); return true; }
        }
        if (rem) skip(popcount(rem));
        return false;
      }
      const dict = T.h2Dict, cpIds = T.cpSp, epIds = T.epSp, extra = T.extraDead2;
      while (cand) {
        const bit = cand & -cand, pre = rem & (bit - 1);
        if (pre) {
          skip(popcount(pre) + extra[pre & dead1]);
          if (endpointNodes > 250000) return false;
        }
        rem &= ~(pre | bit); cand &= cand - 1;
        const j = 31 - Math.clz32(bit), f = face2[j], af = allowed2[f + 1];
        const ns = T.sp[sb + j], nc = T.cp[cb + j], ncw = dict[cpIds[nc * 24 + ns]];
        const ndc = dc - ((cw & bit) ? 1 : 0) + (((cw >>> 10) & bit) ? 0 : 1), sc = nl - ndc;
        const mc1 = af & (sc >= 2 ? 1023 : sc === 1 ? ((ncw >>> 10) & 1023) : (ncw & 1023));
        if (!mc1) { skip(1 + deadCost2[f]); if (endpointNodes > 250000) return false; continue; }
        const ne = T.ep[eb + j], new_ = dict[epIds[ne * 24 + ns]];
        const nde = de - ((ew & bit) ? 1 : 0) + (((ew >>> 10) & bit) ? 0 : 1), se = nl - nde;
        const nh1 = mc1 & (se >= 2 ? 1023 : se === 1 ? ((new_ >>> 10) & 1023) : (new_ & 1023));
        if (!nh1) { skip(1 + deadCost2[f]); if (endpointNodes > 250000) return false; continue; }
        let ncand = nh1;
        if (nl >= 2) {
          if (sc === 0) ncand &= (ncw >>> 20) & 1023;
          if (se === 0) ncand &= (new_ >>> 20) & 1023;
          if (!ncand) { skip(1 + deadCost2[f] + extra[nh1]); if (endpointNodes > 250000) return false; continue; }
        }
        path2.push(T.phase2[j]);
        if (dfs2H2(nc, ne, ns, nl, f, ndc, nde, ncw, new_, nh1, ncand)) return true;
        path2.pop();
        if (endpointNodes > 250000) return false;
      }
      if (rem) skip(popcount(rem) + extra[rem & dead1]);
      return false;
    }
    function finish() {
      let state = start;
      for (const mi of path) state = T.model.turn(state, mi);
      const c = rank(state.cp), e = rank(state.ep.slice(0, 8)), s = rank(state.ep.slice(8).map(i => i - 8));
      endpointNodes = 0; inPhase2 = true;
      if (useH2) {
        const dc0 = dist2(T.cp, c, s, T.cpSp), de0 = dist2(T.ep, e, s, T.epSp);
        const cw0 = T.h2Dict[T.cpSp[c * 24 + s]], ew0 = T.h2Dict[T.epSp[e * 24 + s]];
        for (let depth = Math.max(dc0, de0); depth <= 18; depth++) {
          path2.length = 0;
          if (depth === 0) {
            check();
            if (++endpointNodes > 250000) break;
            if (c === 0 && e === 0 && s === 0) { inPhase2 = false; result = { moves: path.slice(), split: path.length }; return true; }
            continue;
          }
          const sc = depth - dc0, se = depth - de0;
          const h1c = (sc >= 2 ? 1023 : sc === 1 ? ((cw0 >>> 10) & 1023) : (cw0 & 1023))
                    & (se >= 2 ? 1023 : se === 1 ? ((ew0 >>> 10) & 1023) : (ew0 & 1023));
          let cand = h1c;
          if (depth >= 2) {
            if (sc === 0) cand &= (cw0 >>> 20) & 1023;
            if (se === 0) cand &= (ew0 >>> 20) & 1023;
          }
          if (dfs2H2(c, e, s, depth, -1, dc0, de0, cw0, ew0, h1c, cand)) { inPhase2 = false; result = { moves: path.concat(path2), split: path.length }; return true; }
          if (endpointNodes > 250000) break;
        }
        inPhase2 = false;
        return false;
      }
      for (let depth = h2(c, e, s); depth <= 18; depth++) {
        path2.length = 0;
        if (dfs2(c, e, s, depth, -1)) { inPhase2 = false; result = { moves: path.concat(path2), split: path.length }; return true; }
        if (endpointNodes > 250000) break;
      }
      inPhase2 = false;
      return false;
    }
    function dfs1Scalar(c, e, s, left, last) {
      check();
      if (h1(c, e, s) > left) return false;
      if (!left) return c === 0 && e === 0 && s === T.sliceGoal && finish();
      for (let mi = 0; mi < 18; mi++) {
        const face = Math.floor(mi / 3);
        if (!allowed(face, last)) continue;
        path.push(mi);
        if (dfs1Scalar(T.co[c * 18 + mi], T.eo[e * 18 + mi], T.sl[s * 18 + mi], left - 1, face)) return true;
        path.pop();
      }
      return false;
    }
    function dfs1Swar(c, e, s, left, last, cand) {
      check();
      let rem = allowed1Swar[last + 1];
      const cb = c * 18, eb = e * 18, sb = s * 18, nl = left - 1;
      if (nl === 0) {
        while (cand) {
          const bit = cand & -cand, rej = rem & (bit - 1);
          if (rej) skip(popcount(rej));
          rem &= ~(rej | bit); cand &= cand - 1;
          const pos = 31 - Math.clz32(bit), f = pos >>> 2, mi = pos - f;
          path.push(mi);
          check();
          if (T.co[cb + mi] === 0 && T.eo[eb + mi] === 0 && T.sl[sb + mi] === T.sliceGoal && finish()) return true;
          path.pop();
        }
        if (rem) skip(popcount(rem));
        return false;
      }
      const coSwar = T.coSwar, eoSwar = T.eoSwar;
      while (cand) {
        const bit = cand & -cand, rej = rem & (bit - 1);
        if (rej) skip(popcount(rej));
        rem &= ~(rej | bit); cand &= cand - 1;
        const pos = 31 - Math.clz32(bit), f = pos >>> 2, mi = pos - f, af = allowed1Swar[f + 1];
        const ns = T.sl[sb + mi], nc = T.co[cb + mi], ncw = coSwar[nc * 495 + ns];
        const mc = af & swarMask(ncw, nl - (ncw >>> 24));
        if (!mc) { skip(1 + deadCost1[f]); continue; }
        const ne = T.eo[eb + mi], new_ = eoSwar[ne * 495 + ns];
        const ncand = mc & swarMask(new_, nl - (new_ >>> 24));
        if (!ncand) { skip(1 + deadCost1[f]); continue; }
        path.push(mi);
        if (dfs1Swar(nc, ne, ns, nl, f, ncand)) return true;
        path.pop();
      }
      if (rem) skip(popcount(rem));
      return false;
    }
    function dfs1Swar24(c, e, s, left, last, dc, de, cw, ew, cand) {
      check();
      let rem = allowed1Swar[last + 1];
      const cb = c * 18, eb = e * 18, sb = s * 18, nl = left - 1;
      if (nl === 0) {
        while (cand) {
          const bit = cand & -cand, rej = rem & (bit - 1);
          if (rej) skip(popcount(rej));
          rem &= ~(rej | bit); cand &= cand - 1;
          const pos = 31 - Math.clz32(bit), f = pos >>> 2, mi = pos - f;
          path.push(mi);
          check();
          if (T.co[cb + mi] === 0 && T.eo[eb + mi] === 0 && T.sl[sb + mi] === T.sliceGoal && finish()) return true;
          path.pop();
        }
        if (rem) skip(popcount(rem));
        return false;
      }
      const co24 = T.co24, eo24 = T.eo24;
      while (cand) {
        const bit = cand & -cand, rej = rem & (bit - 1);
        if (rej) skip(popcount(rej));
        rem &= ~(rej | bit); cand &= cand - 1;
        const pos = 31 - Math.clz32(bit), f = pos >>> 2, q = pos & 3, mi = pos - f, shift = f * 4, af = allowed1Swar[f + 1];
        const cnib = (cw >>> shift) & 15, ndc = dc + 1 - ((cnib >>> 3) & 1) - ((cnib >>> q) & 1);
        const ns = T.sl[sb + mi], nc = T.co[cb + mi], ncw = read24(co24, nc * 495 + ns);
        const mc = af & swarMask(ncw, nl - ndc);
        if (!mc) { skip(1 + deadCost1[f]); continue; }
        const enib = (ew >>> shift) & 15, nde = de + 1 - ((enib >>> 3) & 1) - ((enib >>> q) & 1);
        const ne = T.eo[eb + mi], new_ = read24(eo24, ne * 495 + ns);
        const ncand = mc & swarMask(new_, nl - nde);
        if (!ncand) { skip(1 + deadCost1[f]); continue; }
        path.push(mi);
        if (dfs1Swar24(nc, ne, ns, nl, f, ndc, nde, ncw, new_, ncand)) return true;
        path.pop();
      }
      if (rem) skip(popcount(rem));
      return false;
    }
    const c = orientation(start.co, 3), e = orientation(start.eo, 2), s = T.slice(start.ep);
    const useSwar32 = Boolean(T.coSwar) && options.expansion !== 'scalar' && options.expansion !== 'contour' && options.expansion !== 'h2only';
    const useSwar24 = Boolean(T.co24) && options.expansion !== 'scalar' && options.expansion !== 'contour' && options.expansion !== 'h2only';
    if (useSwar24) {
      const cw0 = read24(T.co24, c * 495 + s), ew0 = read24(T.eo24, e * 495 + s);
      const dc0 = dist1(T.co, c, s, T.co24), de0 = dist1(T.eo, e, s, T.eo24);
      for (let depth = Math.max(dc0, de0); depth <= 12; depth++) {
        report({ phase1Depth: depth, nodes, elapsedMs: now() - started });
        if (depth === 0) {
          check();
          if (c === 0 && e === 0 && s === T.sliceGoal && finish()) break;
          continue;
        }
        const cand0 = swarMask(cw0, depth - dc0) & swarMask(ew0, depth - de0);
        if (dfs1Swar24(c, e, s, depth, -1, dc0, de0, cw0, ew0, cand0)) break;
      }
    } else if (useSwar32) {
      const cw0 = T.coSwar[c * 495 + s], ew0 = T.eoSwar[e * 495 + s], dc0 = cw0 >>> 24, de0 = ew0 >>> 24;
      for (let depth = Math.max(dc0, de0); depth <= 12; depth++) {
        report({ phase1Depth: depth, nodes, elapsedMs: now() - started });
        if (depth === 0) {
          check();
          if (c === 0 && e === 0 && s === T.sliceGoal && finish()) break;
          continue;
        }
        const cand0 = swarMask(cw0, depth - dc0) & swarMask(ew0, depth - de0);
        if (dfs1Swar(c, e, s, depth, -1, cand0)) break;
      }
    } else {
      for (let depth = h1(c, e, s); depth <= 12; depth++) {
        report({ phase1Depth: depth, nodes, elapsedMs: now() - started });
        if (dfs1Scalar(c, e, s, depth, -1)) break;
      }
    }
    if (!result) throw new Error('Bounded search exhausted its candidates; no solution is being claimed.');
    let verified = start;
    for (const mi of result.moves) verified = T.model.turn(verified, mi);
    if (rank(verified.cp) || verified.ep.some((p, i) => p !== i) || verified.co.some(Boolean) || verified.eo.some(Boolean)) throw new Error('Internal solution verification failed.');
    return { ...result, nodes, generatedNodes, skippedNodes, elapsedMs: now() - started, tableBytes: T.tableBytes, optimal: false };
  }
  const readNib = (arr, idx) => (arr[idx >>> 1] >>> ((idx & 1) << 2)) & 15;
  // Stage-3 Holonomy-Guided Bifurcated Eikonal Wavefront (HBEW) compiler.
  // Builds ambient bundle transitions on Sym_8 and P(12,4), equatorial seam/funnel
  // tables, K_2 coset-lift sister maps, and nibble-packed seam-conditioned
  // two-regime Bellman phase-crossing potentials Psi_A(a, lastFace, r_1).
  function compileHolonomy(T, report = () => {}, options = {}) {
    const psiHorizon = options.psiHorizon ?? 2;
    if (!Number.isInteger(psiHorizon) || psiHorizon < 1 || psiHorizon > 4) throw new Error('Invalid psiHorizon.');
    const base = (T.co24 && T.h2Dict && T.expansion === 'dual') ? T : compileTables(T, report, { expansion: 'dual' });
    if (base.holonomy && base.holonomy.psiHorizon === psiHorizon) return base;
    report('Building ambient bundle transitions (Sym_8 & P(12,4))');
    const moves = base.model.moves, phase2 = base.phase2;
    const cpG = new Uint16Array(40320 * 18);
    for (let c = 0; c < 40320; c++) {
      const p = unrank(c, 8), cb = c * 18;
      for (let m = 0; m < 18; m++) cpG[cb + m] = rank(moves[m].cp.map(i => p[i]));
    }
    const mInv = new Uint8Array(18);
    for (let m = 0; m < 18; m++) {
      const c1 = cpG[m];
      let inv = -1;
      for (let k = 0; k < 18; k++) if (cpG[c1 * 18 + k] === 0) { inv = k; break; }
      if (inv < 0) throw new Error('Failed to invert ambient generator.');
      mInv[m] = inv;
    }
    const invEp = moves.map(mv => {
      const inv = new Uint8Array(12);
      for (let slot = 0; slot < 12; slot++) inv[mv.ep[slot]] = slot;
      return inv;
    });
    const tuple4ToIdx = new Int16Array(20736).fill(-1), idxToTuple4 = new Uint8Array(11880 * 4);
    let tCount = 0;
    for (let a = 0; a < 12; a++) for (let b = 0; b < 12; b++) if (b !== a)
      for (let c = 0; c < 12; c++) if (c !== a && c !== b)
        for (let d = 0; d < 12; d++) if (d !== a && d !== b && d !== c) {
          tuple4ToIdx[((a * 12 + b) * 12 + c) * 12 + d] = tCount;
          const o = tCount << 2;
          idxToTuple4[o] = a; idxToTuple4[o + 1] = b; idxToTuple4[o + 2] = c; idxToTuple4[o + 3] = d;
          tCount++;
        }
    const p12_4G = new Uint16Array(11880 * 18), esIdxToSp = new Int8Array(11880).fill(-1);
    for (let idx = 0; idx < 11880; idx++) {
      const o = idx << 2, a = idxToTuple4[o], b = idxToTuple4[o + 1], c = idxToTuple4[o + 2], d = idxToTuple4[o + 3], ib = idx * 18;
      for (let m = 0; m < 18; m++) {
        const inv = invEp[m];
        p12_4G[ib + m] = tuple4ToIdx[((inv[a] * 12 + inv[b]) * 12 + inv[c]) * 12 + inv[d]];
      }
      if (a >= 8 && b >= 8 && c >= 8 && d >= 8) {
        const arr = [0, 0, 0, 0];
        arr[a - 8] = 0; arr[b - 8] = 1; arr[c - 8] = 2; arr[d - 8] = 3;
        esIdxToSp[idx] = rank(arr);
      }
    }
    const inP2 = new Uint8Array(18);
    for (let j = 0; j < 10; j++) inP2[phase2[j]] = 1;
    const nonHList = [];
    for (let m = 0; m < 18; m++) if (!inP2[m]) nonHList.push(m);
    if (nonHList.length !== 8) throw new Error('Expected 8 equatorial quarter-turn generators.');
    const nonH = Uint8Array.from(nonHList);
    const faceToJHalf = new Int8Array(6).fill(-1), fQuarterPos = new Int8Array(6).fill(-1), fQuarterNeg = new Int8Array(6).fill(-1);
    const fPosBit = new Int32Array(6), fBothBits = new Int32Array(6), slEntryFace = new Int8Array(495).fill(-1);
    let posQuarterSwarMask = 0, eqQuarterSwarMask = 0;
    for (let f = 0; f < 6; f++) {
      const qs = [];
      for (let q = 0; q < 3; q++) if (!inP2[f * 3 + q]) qs.push(q);
      if (qs.length === 2) {
        const mPos = f * 3 + qs[0], mNeg = f * 3 + qs[1];
        fQuarterPos[f] = mPos; fQuarterNeg[f] = mNeg;
        fPosBit[f] = 1 << (f * 4 + qs[0]);
        fBothBits[f] = (1 << (f * 4 + qs[0])) | (1 << (f * 4 + qs[1]));
        posQuarterSwarMask |= fPosBit[f];
        eqQuarterSwarMask |= fBothBits[f];
        faceToJHalf[f] = phase2.findIndex(mi => Math.floor(mi / 3) === f);
        const s1 = base.sl[base.sliceGoal * 18 + mPos];
        if (base.sl[s1 * 18 + mPos] !== base.sliceGoal || base.sl[s1 * 18 + mNeg] !== base.sliceGoal) {
          throw new Error('Equatorial UD-slice funnel invariant violated.');
        }
        slEntryFace[s1] = f;
      }
    }
    const slDist2 = new Uint8Array(495), slDist2Mask = new Uint8Array(495);
    for (let s = 0; s < 495; s++) {
      let mask = 0;
      for (let m = 0; m < 18; m++) {
        if (slEntryFace[base.sl[s * 18 + m]] >= 0) {
          slDist2[s] = 1;
          const fm = Math.floor(m / 3);
          mask |= 1;
          for (let last = 0; last < 6; last++) if (allowed(fm, last)) mask |= 1 << (last + 1);
        }
      }
      slDist2Mask[s] = mask;
    }
    const seamAllowed2 = new Uint16Array(7);
    seamAllowed2[0] = 1023;
    for (let f = 0; f < 6; f++) {
      let mask = 0;
      for (let j = 0; j < 10; j++) if (Math.floor(phase2[j] / 3) !== f) mask |= 1 << j;
      seamAllowed2[f + 1] = mask;
    }
    const movesByFace2 = Array.from({ length: 6 }, () => []);
    for (let j = 0; j < 10; j++) movesByFace2[Math.floor(phase2[j] / 3)].push(j);
    function buildCanonicalPsi(trans18, size, goalIdx) {
      const d2Canon = new Uint8Array(size * 6).fill(255);
      const q = new Int32Array(size * 6);
      let head = 0, tail = 0;
      for (let f = 0; f < 6; f++) { d2Canon[goalIdx * 6 + f] = 0; q[tail++] = goalIdx * 6 + f; }
      while (head < tail) {
        const key = q[head++], v = Math.floor(key / 6), fv = key - v * 6, nd = d2Canon[key] + 1;
        for (const j of movesByFace2[fv]) {
          const u = trans18[v * 18 + mInv[phase2[j]]], ub = u * 6;
          for (let last = 0; last < 6; last++) {
            if (allowed(fv, last) && d2Canon[ub + last] === 255) {
              d2Canon[ub + last] = nd;
              q[tail++] = ub + last;
            }
          }
        }
      }
      const raw = new Uint8Array((psiHorizon + 1) * size * 6).fill(255);
      const fBest = new Uint8Array(6);
      for (let u = 0; u < size; u++) {
        if (d2Canon[u * 6] === 255 && d2Canon[u * 6 + 1] === 255) continue;
        if (u === goalIdx) { for (let f = 0; f < 6; f++) raw[u * 6 + f] = 0; continue; }
        fBest.fill(255);
        for (let fv = 0; fv < 6; fv++) {
          let b = 255;
          for (const j of movesByFace2[fv]) {
            const dNext = d2Canon[trans18[u * 18 + phase2[j]] * 6 + fv];
            if (dNext < 255 && dNext + 1 < b) b = dNext + 1;
          }
          fBest[fv] = b;
        }
        for (let fEntry = 0; fEntry < 6; fEntry++) {
          let b = 255;
          for (let fv = 0; fv < 6; fv++) if (fv !== fEntry && fBest[fv] < b) b = fBest[fv];
          raw[u * 6 + fEntry] = b;
        }
      }
      for (let u = 0; u < size; u++) {
        const ub = u * 18, outBase = size * 6 + u * 6;
        for (let last = 0; last < 6; last++) {
          let best = 255;
          for (let k = 0; k < 8; k++) {
            const m = nonH[k], fm = Math.floor(m / 3);
            if (!allowed(fm, last)) continue;
            const val = raw[trans18[ub + m] * 6 + fm];
            if (val < best) best = val;
          }
          raw[outBase + last] = best;
        }
      }
      const fMin = new Uint8Array(6);
      for (let r = 2; r <= psiHorizon; r++) {
        const prevOff = (r - 1) * size * 6, curOff = r * size * 6;
        for (let u = 0; u < size; u++) {
          const ub = u * 18, outBase = curOff + u * 6;
          for (let fm = 0; fm < 6; fm++) {
            const m0 = fm * 3;
            let b = raw[prevOff + trans18[ub + m0] * 6 + fm];
            const b1 = raw[prevOff + trans18[ub + m0 + 1] * 6 + fm]; if (b1 < b) b = b1;
            const b2 = raw[prevOff + trans18[ub + m0 + 2] * 6 + fm]; if (b2 < b) b = b2;
            fMin[fm] = b;
          }
          for (let last = 0; last < 6; last++) {
            let best = 255;
            for (let fm = 0; fm < 6; fm++) if (allowed(fm, last) && fMin[fm] < best) best = fMin[fm];
            raw[outBase + last] = best;
          }
        }
      }
      const packed = new Uint8Array(raw.length >>> 1);
      for (let i = 0; i < packed.length; i++) {
        const lo = raw[i * 2] < 15 ? raw[i * 2] : 15;
        const hi = raw[i * 2 + 1] < 15 ? raw[i * 2 + 1] : 15;
        packed[i] = lo | (hi << 4);
      }
      return packed;
    }
    report('Compiling two-regime phase-crossing Bellman potentials');
    const goalEU = tuple4ToIdx[((0 * 12 + 1) * 12 + 2) * 12 + 3];
    const goalED = tuple4ToIdx[((4 * 12 + 5) * 12 + 6) * 12 + 7];
    const goalES = tuple4ToIdx[((8 * 12 + 9) * 12 + 10) * 12 + 11];
    const cPsiC = buildCanonicalPsi(cpG, 40320, 0);
    const cPsiEU = buildCanonicalPsi(p12_4G, 11880, goalEU);
    const cPsiED = buildCanonicalPsi(p12_4G, 11880, goalED);
    const cPsiES = buildCanonicalPsi(p12_4G, 11880, goalES);
    const holonomy = {
      psiHorizon, cpG, p12_4G, tuple4ToIdx, idxToTuple4, esIdxToSp, mInv, nonH,
      faceToJHalf, fQuarterPos, fQuarterNeg, fPosBit, fBothBits,
      posQuarterSwarMask, eqQuarterSwarMask, slEntryFace, slDist2, slDist2Mask, seamAllowed2,
      goalEU, goalED, goalES, cPsiC, cPsiEU, cPsiED, cPsiES,
    };
    let holonomyBytes = 0;
    for (const key of Object.keys(holonomy)) {
      const val = holonomy[key];
      if (val && val.byteLength) holonomyBytes += val.byteLength;
    }
    return { ...base, holonomy, holonomyBytes, holonomyTotalBytes: base.tableBytes + holonomyBytes };
  }
  function solveHolonomy(T, stickers, options = {}) {
    if (!T.holonomy) T = compileHolonomy(T);
    const H = T.holonomy, start = T.model.decode(stickers), now = () => performance.now();
    const started = now(), deadline = started + (options.timeoutMs ?? 30000), maxNodes = options.maxNodes ?? 20000000;
    const report = options.report || (() => {});
    if (now() >= deadline) throw new Error('Search time budget reached; no solution is being claimed.');
    const maxD1Cap = options.maxD1Cap ?? 11;
    const maxDeltaD1 = options.maxDeltaD1 ?? 2;
    const targetBound = options.targetBound ?? 20;
    const fallbackBound = options.fallbackBound ?? (targetBound > 0 ? 22 : 30);
    const useFunnel = options.useFunnel !== false;
    const useSisterPairing = useFunnel && options.useSisterPairing !== false;
    const usePsi = useFunnel && options.usePsi !== false;
    const useZeroSlackSieve = options.useZeroSlackSieve !== false;
    const useStratified = options.useStratified !== false;
    const collectSampleFibers = Boolean(options.collectSampleFibers);
    const enterDepth = usePsi ? Math.min(2, H.psiHorizon) : 1;

    const cpG = H.cpG, p12_4G = H.p12_4G, idxToTuple4 = H.idxToTuple4, esIdxToSp = H.esIdxToSp;
    const slEntryFace = H.slEntryFace, slDist2 = H.slDist2, slDist2Mask = H.slDist2Mask, seamAllowed2 = H.seamAllowed2;
    const faceToJHalf = H.faceToJHalf, fQuarterPos = H.fQuarterPos, fQuarterNeg = H.fQuarterNeg;
    const fPosBit = H.fPosBit, fBothBits = H.fBothBits;
    const cPsiC = H.cPsiC, cPsiEU = H.cPsiEU, cPsiED = H.cPsiED, cPsiES = H.cPsiES;
    const allowed2 = T.allowed2, face2 = T.face2;

    let nodes = 0, p1Nodes = 0, p2Nodes = 0, harvestedLifts = 0, sisterLifts = 0, psiPruned = 0, zeroSlackHits = 0;
    let bestB = 31, bestResult = null, stoppedAtTarget = false;
    const path1 = [], path2 = [], epScratch = new Uint8Array(8), sampleFibers = [];

    function checkpoint() {
      if (now() >= deadline) throw new Error('Search time budget reached; no solution is being claimed.');
      if ((nodes & 65535) === 0) report({ nodes, bestBound: bestB < 31 ? bestB : null, elapsedMs: now() - started });
    }
    function stepP1() {
      nodes++; p1Nodes++;
      if (nodes > maxNodes) throw new Error('Search node budget reached; no solution is being claimed.');
      if ((nodes & 2047) === 0) checkpoint();
    }
    function stepP2() {
      nodes++; p2Nodes++;
      if (nodes > maxNodes) throw new Error('Search node budget reached; no solution is being claimed.');
      if ((nodes & 2047) === 0) checkpoint();
    }
    function dist1(A, a, s, arr) {
      let d = 0;
      while (a !== 0 || s !== T.sliceGoal) {
        const w = read24(arr, a * 495 + s), mDown = w & (((w >>> 3) & 0x111111) * 7);
        const pos = 31 - Math.clz32(mDown & -mDown), mi = pos - (pos >>> 2);
        a = A[a * 18 + mi]; s = T.sl[s * 18 + mi]; d++;
      }
      return d;
    }
    function dist2(A, a, s, ids) {
      let d = 0;
      while (a !== 0 || s !== 0) {
        const mDown = T.h2Dict[ids[a * 24 + s]] & 1023, j = 31 - Math.clz32(mDown & -mDown);
        a = A[a * 10 + j]; s = T.sp[s * 10 + j]; d++;
      }
      return d;
    }
    function rankEp8(uIdx, dIdx) {
      const uo = uIdx << 2, do_ = dIdx << 2;
      epScratch[idxToTuple4[uo]] = 0; epScratch[idxToTuple4[uo + 1]] = 1;
      epScratch[idxToTuple4[uo + 2]] = 2; epScratch[idxToTuple4[uo + 3]] = 3;
      epScratch[idxToTuple4[do_]] = 4; epScratch[idxToTuple4[do_ + 1]] = 5;
      epScratch[idxToTuple4[do_ + 2]] = 6; epScratch[idxToTuple4[do_ + 3]] = 7;
      let r = 0, seen = 0;
      for (let i = 7; i >= 0; i--) {
        const pi = epScratch[i];
        r += popcount(seen & ((1 << pi) - 1)) * factorial[7 - i];
        seen |= 1 << pi;
      }
      return r;
    }
    function dfs2(c, e, s, left, dc, de, cw, ew, cand) {
      stepP2();
      const cb = c * 10, eb = e * 10, sb = s * 10, nl = left - 1;
      if (nl === 0) {
        while (cand) {
          const bit = cand & -cand; cand &= cand - 1;
          const j = 31 - Math.clz32(bit);
          if (T.cp[cb + j] === 0 && T.ep[eb + j] === 0 && T.sp[sb + j] === 0) { path2.push(T.phase2[j]); return true; }
        }
        return false;
      }
      const dict = T.h2Dict, cpIds = T.cpSp, epIds = T.epSp;
      while (cand) {
        const bit = cand & -cand; cand &= cand - 1;
        const j = 31 - Math.clz32(bit), f = face2[j], af = allowed2[f + 1];
        const ns = T.sp[sb + j], nc = T.cp[cb + j], ncw = dict[cpIds[nc * 24 + ns]];
        const ndc = dc - ((cw & bit) ? 1 : 0) + (((cw >>> 10) & bit) ? 0 : 1), sc = nl - ndc;
        const mc1 = af & (sc >= 2 ? 1023 : sc === 1 ? ((ncw >>> 10) & 1023) : (ncw & 1023));
        if (!mc1) continue;
        const ne = T.ep[eb + j], new_ = dict[epIds[ne * 24 + ns]];
        const nde = de - ((ew & bit) ? 1 : 0) + (((ew >>> 10) & bit) ? 0 : 1), se = nl - nde;
        let ncand = mc1 & (se >= 2 ? 1023 : se === 1 ? ((new_ >>> 10) & 1023) : (new_ & 1023));
        if (!ncand) continue;
        if (nl >= 2) {
          if (sc === 0) ncand &= (ncw >>> 20) & 1023;
          if (se === 0) ncand &= (new_ >>> 20) & 1023;
          if (!ncand) continue;
        }
        path2.push(T.phase2[j]);
        if (dfs2(nc, ne, ns, nl, ndc, nde, ncw, new_, ncand)) return true;
        path2.pop();
      }
      return false;
    }
    function runPhase2AtDepth(cp, ep, sp, dc0, de0, cw, ew, depth, lastFace) {
      if (depth === 0) {
        stepP2();
        path2.length = 0;
        return cp === 0 && ep === 0 && sp === 0;
      }
      const sc = depth - dc0, se = depth - de0;
      const seamMask = lastFace < 0 ? 1023 : seamAllowed2[lastFace + 1];
      let cand = seamMask
        & (sc >= 2 ? 1023 : sc === 1 ? ((cw >>> 10) & 1023) : (cw & 1023))
        & (se >= 2 ? 1023 : se === 1 ? ((ew >>> 10) & 1023) : (ew & 1023));
      if (depth >= 2) {
        if (sc === 0) cand &= (cw >>> 20) & 1023;
        if (se === 0) cand &= (ew >>> 20) & 1023;
      }
      if (!cand) return false;
      path2.length = 0;
      return dfs2(cp, ep, sp, depth, dc0, de0, cw, ew, cand);
    }

    const co0 = orientation(start.co, 3), eo0 = orientation(start.eo, 2), sl0 = T.slice(start.ep);
    const cp0 = rank(start.cp);
    const pos = new Uint8Array(12);
    for (let slot = 0; slot < 12; slot++) pos[start.ep[slot]] = slot;
    const eu0 = H.tuple4ToIdx[((pos[0] * 12 + pos[1]) * 12 + pos[2]) * 12 + pos[3]];
    const ed0 = H.tuple4ToIdx[((pos[4] * 12 + pos[5]) * 12 + pos[6]) * 12 + pos[7]];
    const es0 = H.tuple4ToIdx[((pos[8] * 12 + pos[9]) * 12 + pos[10]) * 12 + pos[11]];

    const cw0 = read24(T.co24, co0 * 495 + sl0), ew0 = read24(T.eo24, eo0 * 495 + sl0);
    const dco0 = dist1(T.co, co0, sl0, T.co24), deo0 = dist1(T.eo, eo0, sl0, T.eo24);
    const h1_0 = dco0 > deo0 ? dco0 : deo0;

    const buckets = Array.from({ length: 32 }, () => Array.from({ length: 19 }, () => []));
    let foundAnyInShell = false;

    function recordSample(d1, h2, fEntry, solvedB) {
      if (!collectSampleFibers) return;
      if (solvedB > 0) {
        sampleFibers.push({ d1, h2, fEntry, solvedB, winner: true });
      } else if (sampleFibers.length < 18) {
        sampleFibers.push({ d1, h2, fEntry, solvedB: 0, winner: false });
      }
    }
    function processLift(d1, lastFace, p1Copy, cp, ep, sp, dc, de, cw, ew) {
      harvestedLifts++;
      const h2 = dc > de ? dc : de, b0 = d1 + h2;
      if (b0 >= bestB) return;
      recordSample(d1, h2, lastFace, 0);
      if (useZeroSlackSieve) {
        if (runPhase2AtDepth(cp, ep, sp, dc, de, cw, ew, h2, lastFace)) {
          bestB = b0;
          bestResult = { moves: p1Copy.concat(path2), split: d1, winnerH2: h2, winnerSlack: 0 };
          zeroSlackHits++;
          recordSample(d1, h2, lastFace, b0);
          if (bestB <= targetBound) stoppedAtTarget = true;
          return;
        }
        if (b0 + 1 < bestB && h2 + 1 <= 18) {
          buckets[b0 + 1][useStratified ? 1 : 0].push({ p1: p1Copy, cp, ep, sp, dc, de, cw, ew, d1, h2, lastFace, depth2: h2 + 1 });
        }
      } else if (h2 <= 18) {
        buckets[b0][0].push({ p1: p1Copy, cp, ep, sp, dc, de, cw, ew, d1, h2, lastFace, depth2: h2 });
      }
    }

    function harvestUpper(co, eo, sl, left, d1, last, dc, de, cw, ew, cand) {
      if (bestB <= targetBound) { stoppedAtTarget = true; return; }
      if (bestB - 1 - d1 < 0) return;
      if (left <= enterDepth) {
        const curR2Max = bestB - 1 - d1;
        let c = cp0;
        for (let i = 0; i < path1.length; i++) c = cpG[c * 18 + path1[i]];
        if (usePsi && last >= 0 && curR2Max < 15 && readNib(cPsiC, (left * 40320 + c) * 6 + last) > curR2Max) { psiPruned++; return; }
        let u = -1, d = -1, s = -1;
        if (!useSisterPairing || (usePsi && curR2Max <= 6)) {
          u = eu0; d = ed0; s = es0;
          for (let i = 0; i < path1.length; i++) {
            const m = path1[i];
            u = p12_4G[u * 18 + m]; d = p12_4G[d * 18 + m]; s = p12_4G[s * 18 + m];
          }
          if (usePsi && last >= 0 && curR2Max <= 6 && (
            readNib(cPsiEU, (left * 11880 + u) * 6 + last) > curR2Max ||
            readNib(cPsiED, (left * 11880 + d) * 6 + last) > curR2Max ||
            readNib(cPsiES, (left * 11880 + s) * 6 + last) > curR2Max
          )) { psiPruned++; return; }
        }
        harvestLower(co, eo, sl, c, u, d, s, left, d1, last, dc, de, cw, ew, cand);
        return;
      }
      stepP1();
      const nl = left - 1, co24 = T.co24, eo24 = T.eo24;
      while (cand) {
        if (bestB <= targetBound) { stoppedAtTarget = true; return; }
        if (bestB - 1 - d1 < 0) return;
        const bit = cand & -cand; cand &= cand - 1;
        const posBit = 31 - Math.clz32(bit), f = posBit >>> 2, q = posBit & 3, mi = posBit - f, shift = f * 4, af = allowed1Swar[f + 1];
        const nsl = T.sl[sl * 18 + mi];
        if (useFunnel && nl === 2 && !(slDist2Mask[nsl] & (1 << (f + 1)))) continue;
        if (useFunnel && nl === 1 && slEntryFace[nsl] < 0) continue;
        const cnib = (cw >>> shift) & 15, ndc = dc + 1 - ((cnib >>> 3) & 1) - ((cnib >>> q) & 1);
        const nco = T.co[co * 18 + mi], ncw = read24(co24, nco * 495 + nsl);
        let mc = af & swarMask(ncw, nl - ndc);
        if (nl === 1 && useFunnel) {
          const ef = slEntryFace[nsl];
          mc &= useSisterPairing ? fPosBit[ef] : fBothBits[ef];
        }
        if (!mc) continue;
        const enib = (ew >>> shift) & 15, nde = de + 1 - ((enib >>> 3) & 1) - ((enib >>> q) & 1);
        const neo = T.eo[eo * 18 + mi], new_ = read24(eo24, neo * 495 + nsl);
        const ncand = mc & swarMask(new_, nl - nde);
        if (!ncand) continue;
        path1.push(mi);
        harvestUpper(nco, neo, nsl, nl, d1, f, ndc, nde, ncw, new_, ncand);
        path1.pop();
      }
    }

    function harvestLower(co, eo, sl, cp, eu, ed, es, left, d1, last, dc, de, cw, ew, cand) {
      if (bestB <= targetBound) { stoppedAtTarget = true; return; }
      if (bestB - 1 - d1 < 0) return;
      stepP1();
      const nl = left - 1;
      if (nl === 0) {
        if (useSisterPairing) {
          const f = slEntryFace[sl];
          if (f < 0 || !(cand & fPosBit[f])) return;
          const miPos = fQuarterPos[f], miNeg = fQuarterNeg[f];
          if (T.co[co * 18 + miPos] !== 0 || T.eo[eo * 18 + miPos] !== 0) return;
          foundAnyInShell = true;
          const curR2Max = bestB - 1 - d1;
          if (curR2Max < 0) return;

          const cpP = cpG[cp * 18 + miPos], jHalf = faceToJHalf[f], bitHalf = 1 << jHalf, cpM = T.cp[cpP * 10 + jHalf];
          const pOkC = !usePsi || curR2Max >= 15 || readNib(cPsiC, cpP * 6 + f) <= curR2Max;
          const mOkC = !usePsi || curR2Max >= 15 || readNib(cPsiC, cpM * 6 + f) <= curR2Max;
          if (!pOkC && !mOkC) { psiPruned += 2; return; }

          let u = eu, d = ed, s = es;
          if (u < 0) {
            u = eu0; d = ed0; s = es0;
            for (let i = 0; i < path1.length; i++) {
              const m = path1[i];
              u = p12_4G[u * 18 + m]; d = p12_4G[d * 18 + m]; s = p12_4G[s * 18 + m];
            }
          }
          const esP = p12_4G[s * 18 + miPos], spP = esIdxToSp[esP];
          const dcP = dist2(T.cp, cpP, spP, T.cpSp);
          const cwP = T.h2Dict[T.cpSp[cpP * 24 + spP]];
          const dcM = dcP - ((cwP & bitHalf) ? 1 : 0) + (((cwP >>> 10) & bitHalf) ? 0 : 1);
          if ((!pOkC || dcP > curR2Max) && (!mOkC || dcM > curR2Max)) { psiPruned += 2; return; }

          const euP = p12_4G[u * 18 + miPos], edP = p12_4G[d * 18 + miPos];
          const epP = rankEp8(euP, edP);
          const deP = dist2(T.ep, epP, spP, T.epSp);
          const ewP = T.h2Dict[T.epSp[epP * 24 + spP]];
          const deM = deP - ((ewP & bitHalf) ? 1 : 0) + (((ewP >>> 10) & bitHalf) ? 0 : 1);
          sisterLifts++;

          const limP = bestB - 1 - d1;
          if (pOkC && dcP <= limP && deP <= limP) {
            if (!usePsi || limP > 6 || (
              readNib(cPsiEU, euP * 6 + f) <= limP &&
              readNib(cPsiED, edP * 6 + f) <= limP &&
              readNib(cPsiES, esP * 6 + f) <= limP
            )) {
              processLift(d1, f, path1.concat(miPos), cpP, epP, spP, dcP, deP, cwP, ewP);
            } else psiPruned++;
          } else if (!pOkC) psiPruned++;

          const limM = bestB - 1 - d1;
          if (mOkC && dcM <= limM && deM <= limM) {
            if (usePsi && limM < 15 && readNib(cPsiC, cpM * 6 + f) > limM) { psiPruned++; return; }
            if (usePsi && limM <= 6 && (
              readNib(cPsiEU, p12_4G[u * 18 + miNeg] * 6 + f) > limM ||
              readNib(cPsiED, p12_4G[d * 18 + miNeg] * 6 + f) > limM ||
              readNib(cPsiES, p12_4G[s * 18 + miNeg] * 6 + f) > limM
            )) { psiPruned++; return; }
            const epM = T.ep[epP * 10 + jHalf], spM = T.sp[spP * 10 + jHalf];
            const cwM = T.h2Dict[T.cpSp[cpM * 24 + spM]], ewM = T.h2Dict[T.epSp[epM * 24 + spM]];
            processLift(d1, f, path1.concat(miNeg), cpM, epM, spM, dcM, deM, cwM, ewM);
          } else if (!mOkC) psiPruned++;
          return;
        }
        while (cand) {
          if (bestB <= targetBound) { stoppedAtTarget = true; return; }
          const bit = cand & -cand; cand &= cand - 1;
          const posBit = 31 - Math.clz32(bit), f = posBit >>> 2, mi = posBit - f;
          if (T.co[co * 18 + mi] !== 0 || T.eo[eo * 18 + mi] !== 0 || T.sl[sl * 18 + mi] !== T.sliceGoal) continue;
          foundAnyInShell = true;
          const lim = bestB - 1 - d1;
          if (lim < 0) return;
          const cp1 = cpG[cp * 18 + mi], eu1 = p12_4G[eu * 18 + mi], ed1 = p12_4G[ed * 18 + mi], es1 = p12_4G[es * 18 + mi];
          if (usePsi && lim < 15 && (
            readNib(cPsiC, cp1 * 6 + f) > lim ||
            (lim <= 6 && (
              readNib(cPsiEU, eu1 * 6 + f) > lim ||
              readNib(cPsiED, ed1 * 6 + f) > lim ||
              readNib(cPsiES, es1 * 6 + f) > lim
            ))
          )) { psiPruned++; continue; }
          const sp1 = esIdxToSp[es1], dc1 = dist2(T.cp, cp1, sp1, T.cpSp);
          if (dc1 > lim) continue;
          const ep1 = rankEp8(eu1, ed1), de1 = dist2(T.ep, ep1, sp1, T.epSp);
          if (de1 > lim) continue;
          const cw1 = T.h2Dict[T.cpSp[cp1 * 24 + sp1]], ew1 = T.h2Dict[T.epSp[ep1 * 24 + sp1]];
          processLift(d1, f, path1.concat(mi), cp1, ep1, sp1, dc1, de1, cw1, ew1);
        }
        return;
      }

      const co24 = T.co24, eo24 = T.eo24, cOff = nl * 40320, eOff = nl * 11880;
      while (cand) {
        if (bestB <= targetBound) { stoppedAtTarget = true; return; }
        const curR2Max = bestB - 1 - d1;
        if (curR2Max < 0) return;
        const bit = cand & -cand; cand &= cand - 1;
        const posBit = 31 - Math.clz32(bit), f = posBit >>> 2, q = posBit & 3, mi = posBit - f, shift = f * 4, af = allowed1Swar[f + 1];
        const nsl = T.sl[sl * 18 + mi];
        if (useFunnel && nl === 2 && !(slDist2Mask[nsl] & (1 << (f + 1)))) continue;
        const ef = (useFunnel && nl === 1) ? slEntryFace[nsl] : -1;
        if (useFunnel && nl === 1 && ef < 0) continue;
        const cnib = (cw >>> shift) & 15, ndc = dc + 1 - ((cnib >>> 3) & 1) - ((cnib >>> q) & 1);
        const nco = T.co[co * 18 + mi], ncw = read24(co24, nco * 495 + nsl);
        let mc = af & swarMask(ncw, nl - ndc);
        if (useFunnel && nl === 1) mc &= useSisterPairing ? fPosBit[ef] : fBothBits[ef];
        if (!mc) continue;
        const enib = (ew >>> shift) & 15, nde = de + 1 - ((enib >>> 3) & 1) - ((enib >>> q) & 1);
        const neo = T.eo[eo * 18 + mi], new_ = read24(eo24, neo * 495 + nsl);
        const ncand = mc & swarMask(new_, nl - nde);
        if (!ncand) continue;

        const ncp = cpG[cp * 18 + mi];
        if (usePsi && curR2Max < 15 && readNib(cPsiC, (cOff + ncp) * 6 + f) > curR2Max) { psiPruned++; continue; }
        let neu = -1, ned = -1, nes = -1;
        if (eu >= 0) {
          neu = p12_4G[eu * 18 + mi]; ned = p12_4G[ed * 18 + mi]; nes = p12_4G[es * 18 + mi];
          if (usePsi && curR2Max <= 6 && (
            readNib(cPsiEU, (eOff + neu) * 6 + f) > curR2Max ||
            readNib(cPsiED, (eOff + ned) * 6 + f) > curR2Max ||
            readNib(cPsiES, (eOff + nes) * 6 + f) > curR2Max
          )) { psiPruned++; continue; }
        }

        path1.push(mi);
        harvestLower(nco, neo, nsl, ncp, neu, ned, nes, nl, d1, f, ndc, nde, ncw, new_, ncand);
        path1.pop();
      }
    }

    function drainBucketsUpTo(limitB, limitSlack) {
      const maxSlk = useStratified ? limitSlack : 0;
      for (let B = 0; B <= limitB && B < bestB; B++) {
        if (bestB <= targetBound) { stoppedAtTarget = true; return; }
        for (let slk = 0; slk <= maxSlk && B < bestB; slk++) {
          const b = buckets[B][slk];
          while (b.length > 0 && B < bestB) {
            if (bestB <= targetBound) { stoppedAtTarget = true; return; }
            const item = b.pop();
            if (runPhase2AtDepth(item.cp, item.ep, item.sp, item.dc, item.de, item.cw, item.ew, item.depth2, item.lastFace)) {
              bestB = B;
              bestResult = { moves: item.p1.concat(path2), split: item.d1, winnerH2: item.h2, winnerSlack: item.depth2 - item.h2 };
              recordSample(item.d1, item.h2, item.lastFace, B);
              if (bestB <= targetBound) stoppedAtTarget = true;
              break;
            }
            if (B + 1 < bestB && item.depth2 + 1 <= 18) {
              item.depth2++;
              buckets[B + 1][useStratified ? slk + 1 : 0].push(item);
            }
          }
        }
      }
    }

    let firstValidD1 = -1, searchedMaxD1 = 0, effectiveCap = maxD1Cap, effectiveDelta = maxDeltaD1;
    if (h1_0 === 0 && co0 === 0 && eo0 === 0 && sl0 === T.sliceGoal) {
      firstValidD1 = 0;
      const sp0 = esIdxToSp[es0], ep0 = rankEp8(eu0, ed0);
      const dc0_2 = dist2(T.cp, cp0, sp0, T.cpSp), de0_2 = dist2(T.ep, ep0, sp0, T.epSp);
      const cw0_2 = T.h2Dict[T.cpSp[cp0 * 24 + sp0]], ew0_2 = T.h2Dict[T.epSp[ep0 * 24 + sp0]];
      processLift(0, -1, [], cp0, ep0, sp0, dc0_2, de0_2, cw0_2, ew0_2);
    }

    for (let d1 = Math.max(1, h1_0); d1 <= 12; d1++) {
      if (bestB <= targetBound) { stoppedAtTarget = true; break; }
      if (firstValidD1 >= 0) {
        if (useStratified && targetBound > 0) drainBucketsUpTo(bestB - 1, 2);
        if (bestB <= targetBound) { stoppedAtTarget = true; break; }
        let maxShell = Math.max(firstValidD1, Math.min(effectiveCap, firstValidD1 + effectiveDelta));
        if (d1 > maxShell && d1 === maxShell + 1 && d1 <= 12 && d1 < bestB && fallbackBound < 30) {
          drainBucketsUpTo(Math.min(bestB - 1, fallbackBound), 18);
          if (bestB <= targetBound) { stoppedAtTarget = true; break; }
          if (bestB > fallbackBound) {
            effectiveCap = 12;
            effectiveDelta = maxDeltaD1 + 1;
            maxShell = Math.max(firstValidD1, Math.min(effectiveCap, firstValidD1 + effectiveDelta));
          }
        }
        if (d1 > maxShell || d1 >= bestB) break;
      }
      report({ phase1Depth: d1, nodes, bestBound: bestB < 31 ? bestB : null, elapsedMs: now() - started });
      searchedMaxD1 = d1;
      if (useFunnel && d1 === 2 && !(slDist2Mask[sl0] & 1)) continue;
      foundAnyInShell = false;
      path1.length = 0;
      let cand0 = swarMask(cw0, d1 - dco0) & swarMask(ew0, d1 - deo0);
      if (d1 === 1 && useFunnel) cand0 &= useSisterPairing ? H.posQuarterSwarMask : H.eqQuarterSwarMask;
      if (!cand0) continue;
      harvestUpper(co0, eo0, sl0, d1, d1, -1, dco0, deo0, cw0, ew0, cand0);
      if (firstValidD1 < 0 && (foundAnyInShell || bestResult)) firstValidD1 = d1;
    }

    if (!stoppedAtTarget) drainBucketsUpTo(bestB - 1, 18);
    if (!bestResult) throw new Error('Bounded search exhausted its candidates; no solution is being claimed.');
    let verified = start;
    for (const mi of bestResult.moves) verified = T.model.turn(verified, mi);
    if (rank(verified.cp) || verified.ep.some((p, i) => p !== i) || verified.co.some(Boolean) || verified.eo.some(Boolean)) {
      throw new Error('Internal solution verification failed.');
    }
    return {
      moves: bestResult.moves,
      split: bestResult.split,
      winnerH2: bestResult.winnerH2,
      winnerSlack: bestResult.winnerSlack,
      nodes,
      p1Nodes,
      p2Nodes,
      harvestedLifts,
      sisterLifts,
      psiPruned,
      zeroSlackHits,
      firstValidD1,
      searchedMaxD1,
      elapsedMs: now() - started,
      tableBytes: T.tableBytes,
      holonomyBytes: T.holonomyBytes,
      holonomyTotalBytes: T.holonomyTotalBytes,
      optimalInShells: !stoppedAtTarget,
      optimal: bestResult.moves.length === 0,
      ...(collectSampleFibers ? { sampleFibers } : {}),
    };
  }
  const api = { createModel, build, solve, rank, unrank, orientation, compileContours, compileCliqueSwar, compileCoboundaryH2, compileTables, compileHolonomy, solveHolonomy };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CompactSolver = api;
})(globalThis);
