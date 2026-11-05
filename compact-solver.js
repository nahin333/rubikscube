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
  const api = { createModel, build, solve, rank, unrank, orientation, compileContours, compileCliqueSwar, compileCoboundaryH2, compileTables };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CompactSolver = api;
})(globalThis);
