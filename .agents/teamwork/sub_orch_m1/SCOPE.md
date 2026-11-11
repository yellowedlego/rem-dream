# Scope: Milestone 1 — Persona & Proposal Lifecycle (Stage 4)

## Architecture & Boundaries
Milestone 1 implements persona proposal management, persona versioning, reversion, and session resets.
Exclusive write ownership:
- `src/lib/persona.ts`
- `src/app/api/proposals/[id]/approve/route.ts`
- `src/app/api/proposals/[id]/reject/route.ts`
- `src/app/api/persona/revert/route.ts`
- `src/app/api/session/reset/route.ts`

Do NOT touch files outside these boundaries.

## Feature Inventory
| # | Feature | Description | Milestone | Status |
|---|---------|-------------|-----------|--------|
| 1 | Persona Proposal Approval | `POST /api/proposals/[id]/approve` promotes proposal to `PersonaVersion`, updates `activePersona`, sets `decidedAt` | M1 | DONE |
| 2 | Persona Proposal Rejection | `POST /api/proposals/[id]/reject` marks proposal as rejected without updating `activePersona` | M1 | DONE |
| 3 | Persona Reversion | `POST /api/persona/revert` sets `activePersona` to specified version number | M1 | DONE |
| 4 | Session Reset | `POST /api/session/reset` removes session nodes, insights, proposals, runs, resets `activePersona = 1` | M1 | DONE |
| 5 | Persona Helper Library | `src/lib/persona.ts` exporting `getActivePersona`, `approveProposal`, `rejectProposal`, `revertPersona`, `resetSession` | M1 | DONE |

## Milestones
| # | Name | Scope | Dependencies | Status | Key Outputs |
|---|------|-------|-------------|--------|-------------|
| 1 | Persona & Proposal Lifecycle | `src/lib/persona.ts`, `src/app/api/proposals/[id]/approve/route.ts`, `src/app/api/proposals/[id]/reject/route.ts`, `src/app/api/persona/revert/route.ts`, `src/app/api/session/reset/route.ts` | None | DONE | 5 files implemented; build passes; type check passes; 104/104 Challenger 1 tests pass; 11/11 Challenger 2 tests pass; 27/27 regression tests pass; Audit CLEAN |

## Interface Contracts
### `src/lib/persona.ts` ↔ API Handlers & Chat
- `getActivePersona(store?: Store): PersonaVersion`
- `approveProposal(proposalId: number | string): Promise<{ ok: boolean; activePersona: number }>`
- `rejectProposal(proposalId: number | string): Promise<{ ok: boolean }>`
- `revertPersona(version: number): Promise<{ ok: boolean; activePersona: number }>`
- `resetSession(sessionId: string): Promise<{ ok: boolean }>`

## Automated Test Verification
- `tests/api-proposal.spec.ts` lifecycle tests pass 100% under `MODEL_MOCK=1`.
- `tests/challenger-m1-1.spec.ts` passes 104/104 tests (100%).
- `tests/challenger-m1-2-stress.spec.ts` passes 11/11 tests (100%).
- `tests/challenger-m1-2.spec.ts` and `tests/api-chat.spec.ts` pass 27/27 tests (100%).
- Production build `npm run build` succeeds with exit code 0.
