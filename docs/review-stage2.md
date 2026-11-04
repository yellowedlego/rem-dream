# 2단계 백엔드 점검 결과 (`backend/stage-2-chat` @ 727411c)

파일: `docs/review-stage2.md` · 점검일 2026-11-04 · 점검자: 프론트(사람 B) 쪽 · **고치지 않고 기록만 함** (수정은 합의 후)

## 확인한 것

| 항목 | 결과 |
| --- | --- |
| `npm run build` | 통과 |
| 2단계 테스트 (`api-chat`, `api-story`, `challenger-m1-2`) | **42개 모두 통과** (`MODEL_MOCK=1`) |
| 3~6단계 테스트 (`api-rem`, `api-proposal`, `api-debug`) | 40개 실패 — 아직 만들지 않은 API를 미리 시험하는 것이라 예상된 결과(404) |
| 실제 Gemini 호출 (`.env.local` 키, `/api/chat` 1회) | 200, `gemini-3.8-flash`, 5.3초, 입력 54 / 출력 40 토큰 |
| `frontend/screens`와 합치기 (시험 병합) | 충돌 2곳: `.gitignore`, `src/lib/types.ts` |

**잘 된 점:** 저장소(`src/lib/store.ts`)가 계획대로 시드/런타임 분리, 원자적 쓰기 + 대기열, 서버 재시작 시 `running` 정리, 깨진 파일 자동 복구까지 되어 있다. 모든 API가 입력 검사(400/409/413)를 하고, 2단계 테스트가 꼼꼼하다.

## 문제 (중요한 순)

### 1. 이야기 전처리에 AI가 없다 — 구조 문제
- `src/lib/story/split.ts`는 문단 → 문장 → 글자 수 규칙으로만 자른다. `askModel` 옵션은 있지만 쓰이지 않고 결과는 항상 `fallback: true`.
- 그래서 뒤섞인 이야기(A→B→A)를 주제별로 묶지 못하고, 이야기 노드의 `ai`는 모두 고정 문장 `"이야기 잘 들었어요."`.
- **방향:** `docs/prompts.md` 2·3절대로 모델 호출 1(문장 번호로 주제 묶기) + 2(의미 파일 뽑기)를 붙이고, 지금 규칙 분리는 모델이 실패했을 때의 대체 경로로 남긴다. 응답에 `method: "ai" | "rule"`.

### 2. 계약이 예전 문서 기준이다 — 문서가 둘로 갈라짐
- 브랜치가 `0eec077`(초기 백엔드 계획)에서 갈라져서, 그 뒤에 정한 것이 빠져 있다: `storySpans`(구간 여러 개), `Meaning`(의미 파일, 이야기당 1개 이상), `meanings`·`method` 응답, `PersonaVersion.sourceMeaningIds`.
- `docs/frontend-handoff.md`가 계약을 따로 적고 있어서 `docs/backend-plan.md`와 계약 문서가 두 개가 됐다.
- **방향:** 계약은 `docs/backend-plan.md` 한 곳에만 두고, `frontend-handoff.md`는 지우거나 그 문서를 가리키게 한다.

### 3. 대화가 앞의 대화를 기억하지 못한다
- `/api/chat`이 모델에 **이번 메시지 하나만** 보낸다(이전 노드를 기록으로 넣지 않음). 그래서 매 답이 처음 만난 사람처럼 나온다.
- **방향:** 같은 세션의 최근 노드 N개(기본 10)를 user/model 차례로 넣는다 (`docs/prompts.md` 1절).

### 4. 안전 장치가 빠져 있다
- 고정 안전 규칙(인격이 바뀌어도 맨 앞에 붙는 줄)이 없다 (`docs/prompts.md` 8절).
- 채팅 입력 길이 제한이 없다 (계획: 2,000자).
- 모델 오류 원문을 그대로 화면에 돌려준다 (`/api/chat` 500 응답의 `error`). 관람객 화면에는 짧은 문장, 원문은 `ModelCall.error`에만.

### 5. API 키가 URL에 들어간다
- `src/lib/model/client.ts`가 `...:generateContent?key=키` 형식으로 부른다. 주소는 서버 로그·프록시에 남기 쉽다.
- **방향:** `x-goog-api-key` 헤더로 보낸다.

### 6. 구조화 출력(JSON 스키마)을 받을 수 없다
- 모델 호출이 글자만 받는다. 이야기 전처리, REM, 인격 제안은 모두 JSON이 필요하다.
- **방향:** `callModel`에 `responseSchema`(또는 `responseMimeType: "application/json"`) 옵션과, 여러 차례 대화(`contents` 배열)를 받는 옵션을 더한다.

### 7. 시드 데이터가 바뀌었다
- `data/store.json` 15번 노드에 오타가 들어갔다: "다 젖었어" → "다젖었어".
- 시드에 `proposals`(승인 1, **대기 1**)와 `runs`가 더해졌다. 전시 화면을 처음 켜면 대기 중인 제안이 있는 상태로 시작한다.
- **방향:** 오타는 되돌린다. 데모용 제안·실행 기록을 시드에 둘지 정한다(아래 질문).

### 8. 응답 모양이 화면(가짜 API)과 다른 곳
| 주소 | 백엔드 | 화면이 기대한 것 | 어느 쪽을 맞출지 |
| --- | --- | --- | --- |
| `GET /api/sessions` | 배열 `[…]` | `{ sessions: […] }` | 문서가 배열이라 **화면이 맞춘다** |
| `GET /api/state` | `{ nodes, insights, personas, proposals, activePersona, activeRun }` | 디버그 화면은 `stories`와 개수도 씀 | 정할 것 (질문) |
| `GET /api/nodes` | 기본 50개 | 디버그 검색은 전체를 기대 | 화면이 `limit=500`을 붙인다 |
| `POST /api/story` | `{ story, nodes }` | `{ story, nodes, meanings, method }` | 1번과 함께 **백엔드가 맞춘다** |

### 9. 정리할 것
- 기본 모델이 `gemini-2.5-flash`(`env.ts`, `.env.example`). 실제로는 `.env.local`의 값(지금 `gemini-3.8-flash`)이 쓰인다. 예시 값을 맞춘다.
- `TEST_READY.md`, `TEST_INFRA.md`에 다른 컴퓨터 경로(`C:\Users\User\.gemini\antigravity\…`)가 적혀 있고, `.gitignore`에 `/.agents/`가 있다. 에이전트 작업 흔적이라 저장소에는 필요 없다.
- 3~6단계 테스트가 미리 들어 있어 전체 테스트가 빨간색(40 실패)이다. 만들기 전까지는 `test.fixme`로 표시해 두면 2단계까지의 결과가 초록색으로 보인다.
- `playwright.config.ts`에서 `viewport: 1440×900`이 빠졌다. 전시 화면 스크린샷 테스트(`stage1.spec.ts`)의 크기가 바뀐다.

## 합치는 순서 (제안)

1. PR #1 (`docs/backend-plan`) → `master`
2. 백엔드 PR (`backend/stage-2-chat`) → `master` — 위 문제 중 1~7을 고친 뒤, 또는 고칠 것을 이슈로 남기고 먼저
3. PR #2 (`frontend/screens`) → `master` — 충돌 2곳(`.gitignore`는 둘 다 살림, `types.ts`는 `storySpans`·`Meaning`을 넣어 합침)
4. 화면을 `/api`로 바꾸고 `src/app/api-mock/` 삭제
