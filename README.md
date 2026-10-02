# Rubik's Graph Lab

An interactive visualization of solving the Rubik's cube with graph theory.

**Live demo:** https://nahin333.github.io/rubikscube/

Every cube position is a vertex and every face turn is an edge, so the cube group forms a Cayley graph. Solving the cube means finding a shortest path from the scrambled vertex to the solved one. The page shows the search exploring that graph, then animates the path it finds on a 3D cube.

## Features

- **3D cube** rendered with three.js. Drag to rotate, then play, step or jump through the solution.
- **Three shortest-path searches:**
  - **Bidirectional BFS** grows one tree from the scramble and one from the solved state until they meet.
  - **BFS** searches outward from the scramble.
  - **A\*** uses an admissible heuristic: one turn moves at most 4 corners and 4 edges, so ⌈misplaced ÷ 4⌉ is a lower bound.
- **Explored-graph view:** the search trees drawn by depth, with the solution path highlighted. Hover a node to see how it was reached; click it to load that state onto the cube.
- **Neighbourhood view:** the current vertex and its 18 neighbours (9 on the 2×2).
- **Cost chart:** states discovered per depth on a log scale, compared with the known distance distribution of the cube graph.
- **Make your own scramble:** tap turns on the move pad (with Undo and Clear) or type moves into the scramble box; the cube updates as you go.
- **Scan a real cube:** upload two photos, each showing three sides around a corner. Drag the outline onto the cube, the page reads the 54 sticker colors, lets you fix any misreads on an unfolded map, checks that the cube is physically possible (piece colors, corner twist, edge flip, permutation parity), and solves it with Kociemba's two-phase algorithm via [cubejs](https://github.com/ldez/cubejs). The route is drawn as phase 1 (reach the subgroup H = ⟨U, D, R2, L2, F2, B2⟩) and phase 2 (solve inside H). "Load sample photos" renders a random scrambled cube to try it.
- **2×2 and 3×3.** The 2×2 fixes one corner and uses only U, R and F turns, so the solved state is unique.

## Run locally

It is a single static file. Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
```

## Limits

Plain BFS runs out of its 1.5-million-state memory budget at about 6 moves on the 3×3, which is the point it demonstrates. Bidirectional BFS handles 3×3 scrambles up to about 10 moves in the browser. Arbitrary scrambles (up to 20 moves) are handled by the two-phase solver in the scan feature, which finds short solutions (about 22 turns) that are not guaranteed optimal. The solver library loads from the jsDelivr CDN, so scanning needs an internet connection.
