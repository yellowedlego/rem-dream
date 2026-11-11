## Task Assignment for explorer_e2e_1 (E2E Test Auditor)

Working directory: C:\Users\User\.gemini\antigravity\scratch\rem-dream
Your state folder: C:\Users\User\.gemini\antigravity\scratch\rem-dream\.agents\teamwork\explorer_e2e_1\
Parent: E2E Testing Sub-Orchestrator (Conversation ID: 9dfaba34-3f7e-4260-89ae-68eddfa275e5)

Mandatory reading:
- C:\Users\User\.gemini\antigravity\scratch\rem-dream\.agents\teamwork\ORIGINAL_REQUEST.md
- C:\Users\User\.gemini\antigravity\scratch\rem-dream\.agents\teamwork\orchestrator\PROJECT.md
- C:\Users\User\.gemini\antigravity\scratch\rem-dream\.agents\teamwork\e2e_testing_orchestrator\SCOPE.md

Objective:
1. Audit all existing tests in `tests/`:
   - `tests/api-rem.spec.ts`
   - `tests/api-proposal.spec.ts`
   - `tests/api-debug.spec.ts`
   - `tests/api-chat.spec.ts`
   and check `package.json` for test runner scripts and configuration (e.g. vitest, jest, tsx, npm test).
2. Map every single test case in the test files to the 20 features in `PROJECT.md` § Feature Inventory.
3. Categorize tests across the 4-tier E2E testing methodology:
   - Tier 1: Feature Coverage (happy path, equivalence classes)
   - Tier 2: Boundary & Corner Cases (limits, empty, error responses, zero/negative)
   - Tier 3: Cross-Feature Combinations (interactions between endpoints/features, e.g. REM running locking chat, approve proposal changing active persona, etc.)
   - Tier 4: Real-World Workload / Application Scenarios (end-to-end workflows, multi-step scenarios)
4. Verify how the tests are executed under `$env:MODEL_MOCK="1"` and check if all necessary test coverage is present or if additional tests should be written in new or existing test files.
5. Provide detailed recommendations and draft content for `TEST_INFRA.md` and `TEST_READY.md`.
6. Write your comprehensive analysis report to `C:\Users\User\.gemini\antigravity\scratch\rem-dream\.agents\teamwork\explorer_e2e_1\analysis.md` and `handoff.md`.
7. Send a message to parent when complete.
