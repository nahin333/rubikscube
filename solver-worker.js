'use strict';
importScripts('compact-solver.js?v=dual-v2');
let tables, compareSuite;
onmessage = ({ data }) => {
  try {
    if (data.action === 'compare') {
      if (!compareSuite) {
        postMessage({ type: 'progress', stage: 'Building 4-stage ablation tables (Scalar, Contour, H2-only, Dual)…' });
        const scalar = CompactSolver.build(data.puzzle, () => {}, { expansion: 'scalar' });
        const contour = CompactSolver.compileTables(scalar, () => {}, { expansion: 'contour' });
        if (!tables || tables.expansion === 'scalar') {
          tables = CompactSolver.compileTables(tables || scalar, () => {}, { expansion: 'dual' });
          postMessage({ type: 'compiled', tableBytes: tables.tableBytes, signatures: tables.h2Dict ? tables.h2Dict.length : 0 });
        }
        const h2Bytes = scalar.tableBytes - scalar.cpSp.byteLength - scalar.epSp.byteLength
          + tables.cpSp.byteLength + tables.epSp.byteLength + tables.h2Dict.byteLength + tables.extraDead2.byteLength;
        const h2only = { ...tables, expansion: 'h2only', coSl: scalar.coSl, eoSl: scalar.eoSl, co24: null, eo24: null, tableBytes: h2Bytes };
        compareSuite = [
          ['Scalar (5.55 MiB)', scalar],
          ['1-Step Contour (7.55 MiB)', contour],
          ['Coboundary H2 (7.49 MiB)', h2only],
          ['Potential-Free Dual (11.49 MiB)', tables],
        ];
      }
      const stages = compareSuite.map(([label, tbl]) => {
        const times = [];
        let last;
        for (let r = 0; r < 3; r++) {
          const t0 = performance.now();
          last = CompactSolver.solve(tbl, data.state, { timeoutMs: data.timeoutMs });
          times.push(performance.now() - t0);
        }
        times.sort((a, b) => a - b);
        return {
          label,
          ms: times[1],
          nodes: last.nodes,
          generatedNodes: last.generatedNodes,
          skippedNodes: last.skippedNodes,
          moves: last.moves,
          split: last.split,
          tableBytes: last.tableBytes,
        };
      });
      postMessage({ type: 'comparison', stages });
      return;
    }
    // Return the first result without waiting for dual-horizon compilation. After
    // posting it, compile inside this worker for subsequent interactive solves.
    if (!tables) tables = CompactSolver.build(data.puzzle, stage => postMessage({ type: 'progress', stage }), { expansion: 'scalar' });
    const result = CompactSolver.solve(tables, data.state, {
      timeoutMs: data.timeoutMs,
      report: progress => postMessage({ type: 'progress', ...progress }),
    });
    postMessage({ type: 'result', result });
    if (tables.expansion === 'scalar') {
      try {
        tables = CompactSolver.compileTables(tables);
        postMessage({ type: 'compiled', tableBytes: tables.tableBytes, signatures: tables.h2Dict ? tables.h2Dict.length : 0 });
      } catch (_) { /* Keep the working scalar tables if optional compilation fails. */ }
    }
  } catch (error) { postMessage({ type: 'error', message: error.message }); }
};
