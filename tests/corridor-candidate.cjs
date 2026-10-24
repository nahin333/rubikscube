'use strict';
// Research-only contour traversal with deferred rejected-sibling charges.
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const filename = path.resolve(__dirname, '../compact-solver.js');
let source = fs.readFileSync(filename, 'utf8');
const begin = source.indexOf('    function dfs2Contour(');
const end = source.indexOf('    const dfs2 =', begin);
if (begin < 0 || end < 0) throw new Error('Published solver injection point changed.');
source = source.slice(0, begin) + `
    let corridorSteps = 0;
    function dfs2Contour(c, e, s, left, last) {
      const base = path2.length;
      let debt = 0;
      while (true) {
        check();
        if (++endpointNodes > 250000) { skip(debt); path2.length = base; return false; }
        const corner = T.cpSignatures[T.cpSp[c * 24 + s]], edge = T.epSignatures[T.epSp[e * 24 + s]];
        if ((corner >>> 20) > left || (edge >>> 20) > left) { skip(debt); path2.length = base; return false; }
        if (!left) {
          if (c === 0 && e === 0 && s === 0) return true;
          skip(debt); path2.length = base; return false;
        }
        let uncharged = allowed2[last + 1];
        let candidates = uncharged & contourMask(corner, left) & contourMask(edge, left);
        const cb = c * 10, eb = e * 10, sb = s * 10;
        if (candidates && !(candidates & (candidates - 1))) {
          // Only one child survives. Its later rejected siblings are visited
          // only if it fails; defer their count while descending iteratively.
          const rejected = uncharged & (candidates - 1);
          skip(popcount(rejected));
          if (endpointNodes > 250000) { skip(debt); path2.length = base; return false; }
          debt += popcount(uncharged & ~(rejected | candidates));
          const j = 31 - Math.clz32(candidates), mi = T.phase2[j];
          path2.push(mi); corridorSteps++;
          c = T.cp[cb + j]; e = T.ep[eb + j]; s = T.sp[sb + j];
          left--; last = Math.floor(mi / 3);
          continue;
        }
        while (candidates) {
          const bit = candidates & -candidates, rejected = uncharged & (bit - 1);
          skip(popcount(rejected));
          if (endpointNodes > 250000) { skip(debt); path2.length = base; return false; }
          uncharged &= ~(rejected | bit); candidates &= candidates - 1;
          const j = 31 - Math.clz32(bit), mi = T.phase2[j];
          path2.push(mi);
          if (dfs2(T.cp[cb + j], T.ep[eb + j], T.sp[sb + j], left - 1, Math.floor(mi / 3))) return true;
          path2.pop();
          if (endpointNodes > 250000) { skip(debt); path2.length = base; return false; }
        }
        skip(popcount(uncharged));
        skip(debt); path2.length = base; return false;
      }
    }
` + source.slice(end);
source = source.replace('optimal: false };', 'optimal: false, corridorSteps };');
const loaded = new Module(filename, module);
loaded.filename = filename; loaded.paths = module.paths; loaded._compile(source, filename);
module.exports = loaded.exports;
