'use strict';
importScripts('compact-solver.js?v=contour-v1');
let tables;
onmessage = ({ data }) => {
  try {
    // Return the first result without waiting for contour compilation. After
    // posting it, compile inside this worker for subsequent interactive solves.
    if (!tables) tables = CompactSolver.build(data.puzzle, stage => postMessage({ type: 'progress', stage }), { expansion: 'scalar' });
    const result = CompactSolver.solve(tables, data.state, {
      timeoutMs: data.timeoutMs,
      report: progress => postMessage({ type: 'progress', ...progress }),
    });
    postMessage({ type: 'result', result });
    if (!tables.cpSignatures) {
      try { tables = CompactSolver.compileTables(tables); }
      catch (_) { /* Keep the working scalar tables if optional compilation fails. */ }
    }
  } catch (error) { postMessage({ type: 'error', message: error.message }); }
};
