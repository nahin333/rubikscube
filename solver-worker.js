'use strict';
importScripts('compact-solver.js');
let tables;
onmessage = ({ data }) => {
  try {
    if (!tables) tables = CompactSolver.build(data.puzzle, stage => postMessage({ type: 'progress', stage }));
    const result = CompactSolver.solve(tables, data.state, {
      timeoutMs: data.timeoutMs,
      report: progress => postMessage({ type: 'progress', ...progress }),
    });
    postMessage({ type: 'result', result });
  } catch (error) { postMessage({ type: 'error', message: error.message }); }
};
