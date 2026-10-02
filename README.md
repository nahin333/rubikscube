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
- **2×2 and 3×3.** The 2×2 fixes one corner and uses only U, R and F turns, so the solved state is unique.

## Run locally

It is a single static file. Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
```

## Limits

Plain BFS runs out of its 1.5-million-state memory budget at about 6 moves on the 3×3, which is the point it demonstrates. Bidirectional BFS handles 3×3 scrambles up to about 10 moves in the browser. Solving arbitrary 20-move scrambles would need Kociemba's two-phase algorithm or pattern databases.
