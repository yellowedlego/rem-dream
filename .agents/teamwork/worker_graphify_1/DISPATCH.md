## 2026-11-11T06:07:22Z
You are a specialized tooling worker.
Original request file: C:\Users\User\.gemini\antigravity\scratch\rem-dream\.agents\teamwork\ORIGINAL_REQUEST.md
Your state folder: C:\Users\User\.gemini\antigravity\scratch\rem-dream\.agents\teamwork\worker_graphify_1\
Working directory: C:\Users\User\.gemini\antigravity\scratch\rem-dream

Toolchain execution environment in PowerShell:
$env:PATH = "C:\Users\User\AppData\Local\Temp\node_extract\node-v22.20.0-win-x64;C:\Program Files\Git\cmd;" + $env:PATH;

Objective:
The user requested: "graphifyy 툴 깔아서 그래프 형태로 코드 베이스 변환시켜서 앞으로 서브에이전트들 작업할때 전부 돌아보지 않도록 하자."
1. Identify the tool requested ("graphifyy" or "graphify" - check npm, pip, or github).
   - Check if `graphifyy` or `graphify` exists in npm (`npm view graphifyy`, `npm view graphify`), pip (`pip show graphifyy` or `pip show graphify`), or if there is a known tool for converting codebases into graph structures (such as dependency graphs, call graphs, or knowledge graphs).
2. Install the tool (as a dev dependency or global/local CLI). If `graphifyy` has a typo and refers to `graphify` (or a specific package), identify the exact package and install it.
3. Run the tool to parse/convert the codebase into a structured graph format (nodes, edges, modules, dependencies, exports/imports).
4. Save the generated graph output and documentation in an easily accessible location (e.g., `docs/codebase-graph.json`, `docs/codebase-graph.md`, or in your state folder).
5. Ensure the graph clearly maps out files, dependencies, functions, and API routes so subagents can quickly query relationships without scanning every file.
6. Write a comprehensive report `graph_report.md` and `handoff.md` in your state folder, explaining how the graph is structured and how subagents can reference it.
7. Report completion back to the orchestrator via send_message.

Mandatory Integrity Warning:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
