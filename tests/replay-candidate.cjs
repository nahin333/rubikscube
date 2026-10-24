'use strict';
// Research-only variant. Keep the published solver and its archived hash intact.
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const filename = path.resolve(__dirname, '../compact-solver.js');
let source = fs.readFileSync(filename, 'utf8');
const marker = 'function dfs2Contour(c, e, s, left, last) {';
if (!source.includes(marker)) throw new Error('Published solver injection point changed.');
source = source.replace(marker, `
    const replayBits = options.replayBits ?? 16;
    const replayKeys = new Float64Array(2 ** replayBits), replayCosts = new Uint32Array(2 ** replayBits);
    let replayHits = 0, replayVisits = 0, replayStores = 0;
    ${marker}
`);
source = source.replace('let uncharged = allowed2[last + 1];', `
      const before = nodes - 1;
      let slot = -1, key = 0;
      if (left >= (options.replayMinDepth ?? 3) && left <= (options.replayMaxDepth ?? 8)) {
      // All factors are bounded; this integer is below 2^53. Include last face:
      // it controls canonical successor exclusions and therefore subtree cost.
      key = (((c * 40320 + e) * 24 + s) * 19 + left) * 7 + last + 1;
      slot = Math.imul((key >>> 0) ^ Math.floor(key / 4294967296), -1640531527) >>> (32 - replayBits);
      const cost = replayCosts[slot];
      if (cost && replayKeys[slot] === key && cost - 1 <= 250000 - endpointNodes && cost - 1 <= maxNodes - nodes) {
        skip(cost - 1); replayHits++; replayVisits += cost - 1; return false;
      }
      }
      let uncharged = allowed2[last + 1];
`);
source = source.replace('skip(popcount(uncharged));\n      return false;', `
      skip(popcount(uncharged));
      // A cutoff is not a certificate of exhaustive failure. Never store it.
      if (slot >= 0 && endpointNodes <= 250000) {
        replayKeys[slot] = key; replayCosts[slot] = nodes - before; replayStores++;
      }
      return false;
`);
source = source.replace('optimal: false };', 'optimal: false, replayHits, replayVisits, replayStores, replayBytes: replayKeys.byteLength + replayCosts.byteLength };');
const loaded = new Module(filename, module);
loaded.filename = filename; loaded.paths = module.paths; loaded._compile(source, filename);
module.exports = loaded.exports;
