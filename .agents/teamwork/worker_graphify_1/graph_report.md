# Codebase Graph Report: Tooling & Structure Analysis

## 1. Tool Identification & Packaging History
- **User Query**: `"graphifyy 툴 깔아서 그래프 형태로 코드 베이스 변환시켜서 앞으로 서브에이전트들 작업할때 전부 돌아보지 않도록 하자."`
- **Tool Identification**:
  - The exact npm package is `graphifyy` (version 0.10.0), which points to `@sentropic/graphify`, which has evolved into `@sentropic/engram` (version 0.26.0).
  - Both `graphify` and `engram` executables are packaged within `@sentropic/engram`.
  - The package is an agent memory substrate that transforms codebases into typed knowledge graphs using tree-sitter AST, Graphology, and Louvain community detection.
- **Installation**:
  - Installed as devDependencies in `rem-dream`:
    - `graphifyy` (wrapper/re-export shim)
    - `@sentropic/engram` (engine binary)
  - Successfully added to `package.json` without conflicting with existing React 19 / Next.js 16 dependencies.

## 2. Codebase Conversion & Graph Generation
- **Execution Command**:
  `npx graphify update . --no-description --no-label`
  `npx graphify flows build`
  `npx graphify studio export docs/studio`
- **Graph Topology & Statistics**:
  - **Total Nodes**: 1,223 nodes (source files, functions, classes, interfaces, commits, concepts)
  - **Total Edges**: 2,566 edges (`contains`: 757, `calls`: 525, `MODIFIES`: 384, `imports`: 283, `method`: 220, `imports_from`: 152, etc.)
  - **Communities**: 60 Louvain communities detected
  - **Execution Flows**: 81 execution flows tracked
- **Output Artifacts**:
  1. `docs/codebase-graph.json`: Complete 1.77 MB raw graph JSON containing all nodes and links.
  2. `docs/codebase-graph-summary.json`: 37.6 KB high-efficiency index summarizing routes, hubs, and modules for subagents to consume directly in context.
  3. `docs/codebase-graph.md`: Human & agent reference documenting API routes, libraries, top hubs, and fast CLI lookup commands.
  4. `docs/studio/studio.html`: Interactive single-file visualization UI openable in any browser.
  5. `.engram/`: Tool state cache and AST index for fast incremental rebuilds.

## 3. Subagent Navigation & Relationship Querying
Subagents no longer need to scan dozens of files to understand relations. They can use:
1. **Direct CLI Traversal**:
   - `npx engram explain "<symbol>"`: Instant lookup of any node's definition, file, line number, incoming imports, and outgoing calls.
   - `npx engram path "<source>" "<target>"`: Shortest path between any two components or routes.
   - `npx engram tree "<file>"`: Full dependency tree.
   - `npx engram affected-flows "<file>"`: Immediate blast-radius check before altering a module.
2. **In-Context Reference**:
   - Subagents can view `docs/codebase-graph.md` (section 2) for the complete table of 24 API routes and their dependencies.
   - Subagents can inspect `docs/codebase-graph-summary.json` for lightweight machine-readable routing data.
