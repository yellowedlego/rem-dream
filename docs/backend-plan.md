# 꿈(REM) 시스템 — 백엔드 구현 계획 (사람 A용)

파일: `docs/backend-plan.md` · 상위 문서: [plan.md](plan.md) (기획서) · 작성일 2026-11-04

이 문서는 `plan.md`의 개발 로드맵 **2~5단계 중 서버·REM 쪽**을 파일 단위로 쪼갠 것이다.
화면(`src/components/`, 화면용 `src/app/**/page.tsx`)은 사람 B가 맡는다. 이 문서는 B와 겹치지 않도록 **경계와 약속(계약)** 을 먼저 못 박는다.

> 이 저장소의 Next.js(16.4.5)는 예전 버전과 다르다(`AGENTS.md`). 서버 코드를 쓰기 전에
> `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`를 읽을 것.
> `next.config.ts`에 `cacheComponents: true`가 켜져 있어서, 파일을 읽거나 DB를 건드리는 GET 핸들러는
> 요청 시점에 실행되도록 `await connection()`을 먼저 부른다 (`src/app/page.tsx`가 같은 방식).

## 1. 지금 상태 (1단계 완료)

| 파일 | 역할 |
| --- | --- |
| `src/lib/types.ts` | `MemoryNode` · `Insight` · `PersonaVersion` · `Store` 데이터 모양 |
| `src/lib/store.ts` | `readStore()` — `data/store.json`을 읽기만 함. 쓰기 없음 |
| `data/store.json` | 가짜 노드 20개 + 첫 인격 (git에 올라가 있음) |
| `scripts/make-fake-store.mjs` | 위 가짜 저장소를 다시 만드는 스크립트 |
| `src/app/page.tsx`, `src/app/debug/page.tsx` | 저장소를 읽어 화면에 넘김 (B 영역) |

아직 없는 것: 쓰기, 모델 호출, REM, 제안/버전 변경, API 주소(`src/app/api/`), 환경 변수.

## 2. 먼저 정할 규칙 (코딩 전에 A·B가 합의)

1. **런타임 저장소는 git 밖에 둔다.** 지금 `data/store.json`은 git에 올라가 있어서, 서버가 거기에 쓰기 시작하면 두 사람의 실행 결과가 계속 충돌한다.
   - `data/store.json` = **시드(가짜 데이터, git 추적, 읽기 전용)**
   - `data/runtime/store.json` = **실행 중 저장소(git 무시)**. 없으면 시드를 복사해서 시작한다.
   - `.gitignore`에 `/data/runtime/` 추가. `store.ts`가 이 로직을 담당한다.
2. **쓰기는 한 곳으로만.** 모든 쓰기는 `src/lib/store.ts`의 함수를 지나간다. 임시 파일에 쓴 뒤 이름을 바꾸는 방식(원자적 저장)에 프로세스 안 순서 대기열을 붙여, 동시에 두 요청이 와도 파일이 깨지지 않게 한다.
3. **화면은 읽기만, 변경은 API로만.** 화면 코드가 `store.ts`의 쓰기 함수를 직접 부르지 않는다.
4. **API 키는 서버만.** `.env.local`에만 두고 `NEXT_PUBLIC_` 접두사를 쓰지 않는다. `.gitignore`의 `.env*`가 이미 막고 있다. 대신 키 이름을 적은 `.env.example`을 올린다.
5. **자동 적용 금지.** 인격(시스템 프롬프트)은 사람이 승인한 제안만 새 버전이 된다.
6. **모델 가짜 모드.** `MODEL_MOCK=1`이면 모델을 부르지 않고 정해진 가짜 응답을 준다. B가 API 한도 없이 화면을 만들고, 테스트가 돌아가게 한다.

## 3. 파일 담당 경계

| 담당 | 파일/폴더 |
| --- | --- |
| **A (이 문서)** | `src/lib/**`, `src/app/api/**`, `scripts/**`, `tests/api-*.spec.ts`, `.env.example`, `data/runtime/`(무시됨) |
| **B** | `src/components/**`, `src/app/page.tsx`, `src/app/debug/**`, `src/app/globals.css`, `public/**` |
| **합의 후 한 명만 수정** | `src/lib/types.ts` (바꿀 때 상대에게 알리고, 작은 커밋으로 먼저 `master`에 합친다), `package.json` |

## 4. 계약 — `types.ts`에 추가할 모양 (초안)

B가 가짜 데이터로 화면을 만들 수 있게, 1번 커밋으로 아래 타입과 가짜 예시를 먼저 올린다.

```ts
/** REM 한 번의 실행 */
export interface RemRun {
  id: string;
  sessionId: string;
  mode: RemModeId;
  temperature: number;
  status: "running" | "done" | "stopped" | "error";
  startedAt: string;
  finishedAt: string | null;
  /** 지금 읽고 있는 노드 번호들 (화면이 빛낼 대상) */
  currentNodeIds: number[];
  /** 이 실행에서 만들어진 통찰 번호 */
  insightIds: number[];
  /** 완료 후 만들어진 수정 제안 번호 (없으면 null) */
  proposalId: number | null;
  error: string | null;
}

/** 인격 수정 제안. 승인 전에는 PersonaVersion이 아니다 */
export interface PersonaProposal {
  id: number;
  runId: string;
  /** 근거 통찰 */
  sourceInsightIds: number[];
  /** 제안하는 시스템 프롬프트 전문 */
  proposedPrompt: string;
  /** 사람에게 보여 줄 한두 줄 요약 ("자는 동안 이렇게 바뀌려 해요") */
  summary: string;
  baseVersion: number;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  decidedAt: string | null;
}

/** 모델 요청 한 건 (디버그 화면의 로그·수치용) */
export interface ModelCall {
  id: number;
  at: string;
  purpose: "chat" | "rem-step" | "rem-proposal";
  runId: string | null;
  model: string;
  temperature: number;
  prompt: string;
  response: string;
  inputTokens: number | null;
  outputTokens: number | null;
  ms: number;
  error: string | null;
}
```

`Store`에는 `proposals: PersonaProposal[]`, `runs: RemRun[]`, `calls: ModelCall[]`를 더한다.
(`runs`는 최근 N개만 보관, `calls`는 디버그용으로 최근 200건 정도만 보관해 파일이 커지지 않게 한다.)

## 5. API 명세 (`src/app/api/**/route.ts`)

모두 JSON. 오류는 `{ "error": "문장" }` + HTTP 상태. REM 중 입력 차단은 **서버가** 한다(화면만 막으면 우회된다).

| 주소 | 하는 일 | 단계 |
| --- | --- | --- |
| `POST /api/chat` `{ sessionId, message, model? }` | 활성 인격으로 모델을 불러 답을 받고 노드 1개를 저장해 `{ node }` 반환. REM 실행 중이면 `409` | 2 |
| `GET /api/state?sessionId=` | 그 세션의 `nodes`, `insights`, `proposals`, `activePersona`, 지금 `RemRun` 한 번에 반환 (화면이 불러올 때 쓰는 읽기용) | 2 |
| `POST /api/rem/start` `{ sessionId, mode, temperature? }` | REM 시작, `202 { runId }`. 이미 실행 중이면 `409`. 노드 수는 상한(기본 12개)으로 자름 | 3 |
| `GET /api/rem/status?runId=` | `RemRun` 반환. 화면은 0.5초마다 이 주소를 불러 진행을 그린다(처음엔 폴링, 실시간 스트림은 필요해지면 나중에) | 3 |
| `POST /api/rem/stop` `{ runId }` | 실행 중단 (다음 모델 호출 전에 멈춤) | 3 |
| `POST /api/proposals/[id]/approve` | 제안을 `PersonaVersion`으로 저장, `activePersona` 변경 | 4 |
| `POST /api/proposals/[id]/reject` | 기록만 남기고 닫음 | 4 |
| `POST /api/persona/revert` `{ version }` | `activePersona`만 바꿈 (새 버전 만들지 않음) | 4 |
| `POST /api/session/reset` `{ sessionId }` | 그 세션의 노드·통찰·제안을 지움 (관람객 교체용). 인격은 첫 버전으로 되돌림 | 4 |
| `GET /api/debug/calls`, `GET /api/debug/metrics` | `ModelCall` 목록, 노드·통찰 수·토큰 합계·평균 응답 시간·오류 횟수 | 6 |
| `POST /api/debug/reset-all` | 전체 초기화(시드로 되돌림) | 6 |

`sessionId`는 관람객 한 명 = 한 세션이다. `plan.md`의 미정 항목("관람객마다 기억을 따로 둘지")은 **기본값(따로)** 으로 간다.

## 6. 폴더 구조 (새로 만들 파일)

```
src/lib/
  types.ts                  (수정) 4절의 타입 추가
  store.ts                  (수정) readStore + 쓰기 함수(addNode 등) + 런타임 저장소 로직
  env.ts                    환경 변수 읽기·검사 (GEMINI_API_KEY, GEMINI_MODEL, MODEL_MOCK)
  model/
    client.ts               모델 호출 한 곳. 입력: 프롬프트·온도 → 출력: 텍스트·토큰·시간. ModelCall 기록까지 여기서
    mock.ts                 MODEL_MOCK=1일 때 쓰는 가짜 응답
  persona.ts                활성 인격 읽기, 제안 승인/되돌리기
  rem/
    types.ts                RemMode 인터페이스
    registry.ts             모드 목록 (새 모드는 여기에 한 줄 추가)
    runner.ts               REM 실행 틀: 노드 고르기 → 모드 실행 → 통찰 저장 → 제안 만들기, 중단·오류 처리
    proposal.ts             통찰들 → 수정 제안 하나 만드는 프롬프트
    modes/
      consolidate.ts        모드 1 (정리)
      dream.ts              모드 2 (꿈)
src/app/api/                5절의 route.ts 파일들
scripts/
  verify-rem.mjs            3단계 검증: 확인 질문 전후 답 비교 → docs/rem-verification.md에 기록
tests/
  api-chat.spec.ts, api-rem.spec.ts, api-proposal.spec.ts   MODEL_MOCK=1로 도는 API 테스트
.env.example                키 이름만 적은 예시 (값 없음)
```

**REM 모드 약속 (`src/lib/rem/types.ts`)** — 모둠원이 "글로 쓴 설계"가 파일 하나로 옮겨지도록, 모드는 이 모양만 지키면 된다.

```ts
export interface RemMode {
  id: RemModeId;            // "consolidate" | "dream" | ...
  label: string;            // 화면에 보일 이름
  defaultTemperature: number;
  /** 노드를 받아 통찰을 만든다. 진행은 ctx로 알린다 */
  run(ctx: RemContext): Promise<Insight[]>;
}
// RemContext: { nodes, ask(prompt, opts) -> 모델 호출, markReading(nodeIds), shouldStop() }
```

모드는 `ctx.ask`로만 모델을 부르고 `ctx.markReading`으로 "지금 읽는 노드"를 알린다. 저장·중단·로그는 `runner.ts`가 공통으로 처리하므로 모드 파일은 "어떻게 고르고 뭐라고 시키는가"만 쓴다.

## 7. 단계별 작업

### 2단계 — 채팅 연결
- [ ] **준비:** Context7로 최신 Gemini 호출 방법(공식 SDK 또는 REST)과 정확한 모델명을 확인하고 이 문서에 적어 둔다. (확인 전까지 `GEMINI_MODEL`은 값을 박지 않는다)
- [ ] `.env.example`, `src/lib/env.ts`, `.gitignore`에 `/data/runtime/` 추가
- [ ] `src/lib/store.ts`: 런타임 저장소, 원자적 쓰기, `addNode()`
- [ ] `src/lib/model/client.ts`, `mock.ts`
- [ ] `src/app/api/chat/route.ts`, `src/app/api/state/route.ts`
- [ ] `tests/api-chat.spec.ts` (MODEL_MOCK=1)
- **끝 기준:** 채팅을 보내면 노드가 저장되고, 서버를 껐다 켜도(새로고침 포함) 남아 있다. 키 없이 `MODEL_MOCK=1`로도 같은 흐름이 돈다.

### 3단계 — REM 모드 1 + 콘솔 검증 (핵심 가설)
- [ ] `src/lib/rem/types.ts`, `registry.ts`, `runner.ts`, `modes/consolidate.ts`
  - 모드 1: 노드 순서를 섞어 하나씩 읽고, 앞에서 뽑은 통찰을 다음 노드의 맥락으로 넘김 (C→c, (c+D)→d …). 마지막 통찰들이 정리본.
- [ ] REM 중 입력 차단(`/api/chat`이 409), 노드 상한, 중단, 오류 시 `status: "error"`
- [ ] `src/app/api/rem/{start,status,stop}/route.ts`
- [ ] `scripts/verify-rem.mjs`: 같은 확인 질문("나에 대해 어떻게 생각해?")을 REM 전후로 던져 답을 `docs/rem-verification.md`에 쌓는다
- **끝 기준:** 달라진 예시 3개를 `docs/rem-verification.md`에 기록. 달라지지 않으면 모드 설계(프롬프트)를 고친 뒤 4단계로 간다. 이 단계를 B의 화면 작업보다 **먼저** 끝내는 것이 우선이다.

### 4단계 — 수정 제안과 버전 관리 (서버 쪽)
- [ ] `src/lib/rem/proposal.ts` (통찰 → 제안), `src/lib/persona.ts`
- [ ] `/api/proposals/[id]/approve|reject`, `/api/persona/revert`, `/api/session/reset`
- [ ] 채팅이 항상 `activePersona`의 시스템 프롬프트를 쓰는지 테스트 (`tests/api-proposal.spec.ts`)
- **끝 기준:** 제안 승인 → 다음 대화부터 새 프롬프트 적용, 되돌리기 → 이전 프롬프트로 복귀, 거절한 제안은 기록만 남음.
- 제안 카드 화면은 B.

### 5단계 — REM 모드 2 + 모드 파일 구조
- [ ] `src/lib/rem/modes/dream.ts`: 무작위 노드 두 개 짝짓기, 온도 높게
- [ ] `registry.ts`에 모드 추가가 한 줄이고, 새 모드 파일이 `RemMode`만 지키면 동작함을 확인
- [ ] 같은 기억으로 모드 1·2를 각각 돌려 결과를 나란히 보여 줄 데이터 반환 (`GET /api/state`에 `runs`별 통찰)
- [ ] `docs/rem-mode-guide.md`: 모둠원이 모드 아이디어를 쓰는 양식 (기억을 어떻게 고르는가 / 모델에게 뭐라고 시키는가 / 온도)
- **끝 기준:** 모둠원이 쓴 모드 설계 1개를 파일 하나로 옮겨 실제로 돌려 본다.

### 6단계 중 서버 쪽 (B와 함께)
- [ ] `ModelCall` 기록(토큰·시간·오류), `/api/debug/calls`, `/api/debug/metrics`, `/api/debug/reset-all`
- 화면(진행 강조, 통찰 도형, 수치 표시)은 B.

## 8. A–B 이어 붙이는 순서

1. **A: 첫 커밋** — `types.ts` 타입 추가 + 가짜 `proposals`/`runs`가 든 `data/store.json` 갱신(`scripts/make-fake-store.mjs` 수정). 이게 `master`에 들어가야 B가 막힘 없이 시작한다.
2. B는 그 데이터와 `MODEL_MOCK=1` API로 화면을 만든다.
3. 새 API가 생길 때마다 이 문서 5절의 표에 "완료" 표시를 하고 B에게 알린다.
4. `types.ts`를 바꿔야 할 일이 생기면 따로 작은 커밋으로 먼저 합친다.

## 9. 브랜치·커밋 규칙

- 기본 브랜치는 `master`. 직접 올리지 않고 **브랜치 → PR → 합치기**.
- 이름: `backend/stage-2-chat`, `backend/stage-3-rem-mode1`, `backend/stage-4-proposals`, `backend/stage-5-dream-mode` / B는 `frontend/...`
- 커밋은 한국어로 한 가지 일씩 (예: `채팅 API와 노드 저장 추가`). 단계 하나에 커밋 여러 개.
- 시작할 때 `git pull`로 `master`를 받고, 올리기 전에 `npm run build`와 `npx playwright test`를 돌린다.
- 키·`.env*`·`data/runtime/`는 절대 커밋하지 않는다.

## 10. 위험과 확인할 것

| 위험 | 대응 |
| --- | --- |
| REM을 해도 답이 별로 안 달라짐 | 3단계에서 먼저 검증, 안 달라지면 프롬프트 설계부터 고침 |
| 무료 API 한도 | REM 노드 수 상한, 호출 수 기록(`ModelCall`), 시작 전에 한도 확인 |
| 파일 저장소 동시 쓰기로 깨짐 | 4절 규칙 2(원자적 쓰기 + 대기열), 깨졌을 때 시드로 되돌리는 `reset-all` |
| 관람객 장난 입력 | 입력 길이 제한과 간단한 필터를 `/api/chat`에 둠. 적용은 항상 승인 후 |
| 서버가 재시작되면 실행 중이던 REM 상태가 사라짐 | `RemRun`을 저장소에 기록하고, 시작 시 `running`으로 남은 것은 `error`로 닫음 |
| 전시장 인터넷 끊김 | 모델 호출 실패를 `ModelCall.error`로 기록하고 화면에 알림. 대비 영상은 7단계(B) |

## 11. 아직 정해지지 않은 것 (A가 시작 전에 확인)

- [ ] 정확한 Gemini 모델명과 무료 한도 (Context7와 공식 문서로 확인)
- [ ] 모드 2를 "무작위 두 기억 짝짓기 + 높은 온도"로 확정할지 (`plan.md` 미정 항목)
- [ ] 하루 이야기를 노드 하나로 만들지 문장 단위로 쪼갤지 (기본값: 노드 하나)
- [ ] REM 한 번에 읽을 노드 상한 (기본값 12)
