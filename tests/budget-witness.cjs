// Negative control: why deleting pruned visits changes a capped search policy.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const S = require('../compact-solver.js');
const { root, P, E, baselineSolver, baselineRevision } = require('./cube-fixtures.cjs');
const source = fs.readFileSync(path.join(root, 'compact-solver.js'), 'utf8');
const from = source.indexOf('    function skip(count) {'), to = source.indexOf('    const allowed2', from);
assert.ok(from >= 0 && to > from);
// This intentionally incorrect budget adaptation is confined to the experiment.
// Its sole source change deletes the batched charges; masks/order stay identical.
const negativeSource = source.slice(0, from) + '    function skip(count) {}\n' + source.slice(to);
const filename = path.join(__dirname, 'uncharged-negative-control.cjs');
const loaded = new Module(filename, module); loaded.filename = filename; loaded._compile(negativeSource, filename);
const naive = loaded.exports, old = baselineSolver().solver;
const tables = S.build(P), scalar = old.build(P);
const rows = JSON.parse(fs.readFileSync(path.join(root, 'research/results/contour-ablation.json'), 'utf8')).rows;
const fixture = rows[0], stickers = Uint8Array.from(fixture.stickers);
const reference = S.solve(tables, stickers, { timeoutMs: 120000 });
const uncharged = naive.solve(tables, stickers, { timeoutMs: 120000 });
const limit = uncharged.nodes;
assert.ok(reference.nodes > limit);
const outcome = (solver, T) => {
  try {
    const r = solver.solve(T, stickers, { maxNodes: limit, timeoutMs: 120000 });
    let replay = stickers;
    for (const mi of r.moves) replay = E.applyMove(P, replay, mi);
    assert.deepEqual(Array.from(replay), Array.from(P.solved));
    return { solved: true, moves: r.moves, nodes: r.nodes };
  } catch (error) { return { solved: false, error: error.message }; }
};
const original = outcome(old, scalar), preserved = outcome(S, tables), negative = outcome(naive, tables);
assert.deepEqual(preserved, original);
assert.equal(original.solved, false); assert.match(original.error, /node budget/);
assert.equal(negative.solved, true);
const result = {
  experiment: 'Budget-policy counterexample; negative control deletes only the skip-charge function',
  baselineRevision, candidateSha256: createHash('sha256').update(source).digest('hex'),
  negativeControlSha256: createHash('sha256').update(negativeSource).digest('hex'),
  fixtureId: fixture.id, stickers: fixture.stickers, maxNodes: limit,
  referenceWithDefaultBudget: { logicalNodes: reference.nodes, moves: reference.moves },
  original, budgetPreservingContours: preserved, unchargedSelectiveGeneration: negative,
  interpretation: 'The same nominal global node cap yields failure under the scalar policy but success if rejected visits are silently removed. Preserving their logical charges restores scalar behavior. This is a constructive witness, not a frequency estimate or a claim that uncharged search is invalid under its own different policy.',
};
const i = process.argv.indexOf('--output');
if (i >= 0) fs.writeFileSync(path.resolve(root, process.argv[i + 1]), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
