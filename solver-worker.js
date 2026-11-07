'use strict';
importScripts('compact-solver.js?v=hbew-v3');
let tables, holoTables, compareSuite;
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

    if (data.action === 'compareSolvers') {
      if (!tables || tables.expansion === 'scalar') {
        postMessage({ type: 'progress', stage: 'Building Dual-Horizon tables…' });
        const raw = tables || CompactSolver.build(data.puzzle, () => {}, { expansion: 'scalar' });
        tables = CompactSolver.compileTables(raw, () => {}, { expansion: 'dual' });
        postMessage({ type: 'compiled', tableBytes: tables.tableBytes, signatures: tables.h2Dict ? tables.h2Dict.length : 0 });
      }
      if (!holoTables) {
        holoTables = CompactSolver.compileHolonomy(tables, stage => postMessage({ type: 'progress', stage }));
        postMessage({
          type: 'holonomyCompiled',
          tableBytes: holoTables.tableBytes,
          holonomyBytes: holoTables.holonomyBytes,
          holonomyTotalBytes: holoTables.holonomyTotalBytes,
        });
      }
      const specs = [
        ['COVE-3 Dual-Horizon', () => CompactSolver.solve(tables, data.state, { timeoutMs: data.timeoutMs }), false],
        ['HBEW Fast (δ=1)', () => CompactSolver.solveHolonomy(holoTables, data.state, { timeoutMs: data.timeoutMs, maxDeltaD1: 1, targetBound: 20 }), true],
        ['HBEW Default (δ=2, ≤20)', () => CompactSolver.solveHolonomy(holoTables, data.state, { timeoutMs: data.timeoutMs, maxDeltaD1: 2, targetBound: 20, collectSampleFibers: true }), true],
        ['HBEW Exact Bounded-Shell', () => CompactSolver.solveHolonomy(holoTables, data.state, { timeoutMs: data.timeoutMs, maxDeltaD1: 2, targetBound: 0 }), true],
      ];
      const solvers = specs.map(([label, fn, isHolo]) => {
        const times = [];
        let last;
        for (let r = 0; r < 3; r++) {
          const t0 = performance.now();
          last = fn();
          times.push(performance.now() - t0);
        }
        times.sort((a, b) => a - b);
        return {
          label,
          isHolonomy: isHolo,
          ms: times[1],
          moves: last.moves,
          split: last.split,
          nodes: isHolo ? last.nodes : last.generatedNodes,
          p1Nodes: last.p1Nodes || 0,
          p2Nodes: last.p2Nodes || 0,
          harvestedLifts: isHolo ? last.harvestedLifts : undefined,
          sisterLifts: last.sisterLifts || 0,
          psiPruned: last.psiPruned || 0,
          zeroSlackHits: last.zeroSlackHits || 0,
          searchedMaxD1: last.searchedMaxD1 ?? last.split,
          optimalInShells: Boolean(last.optimalInShells),
          sampleFibers: last.sampleFibers || null,
        };
      });
      postMessage({ type: 'solverComparison', solvers });
      return;
    }

    if (data.action === 'holonomy') {
      if (!tables) tables = CompactSolver.build(data.puzzle, stage => postMessage({ type: 'progress', stage }), { expansion: 'dual' });
      else if (tables.expansion === 'scalar') {
        tables = CompactSolver.compileTables(tables, stage => postMessage({ type: 'progress', stage }), { expansion: 'dual' });
      }
      if (!holoTables) {
        holoTables = CompactSolver.compileHolonomy(tables, stage => postMessage({ type: 'progress', stage }));
        postMessage({
          type: 'holonomyCompiled',
          tableBytes: holoTables.tableBytes,
          holonomyBytes: holoTables.holonomyBytes,
          holonomyTotalBytes: holoTables.holonomyTotalBytes,
        });
      }
      const result = CompactSolver.solveHolonomy(holoTables, data.state, {
        timeoutMs: data.timeoutMs,
        collectSampleFibers: true,
        report: progress => postMessage({ type: 'progress', ...progress }),
      });
      postMessage({ type: 'result', result });
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
