# 꿈(REM) 시스템 — 백엔드 다음 작업 계획 (2026-11-11)

상위 문서: [plan.md](plan.md)(기획) · [backend-plan.md](backend-plan.md)(계약·API 표) · [persona-architecture.md](persona-architecture.md)(3층 인격) · [prompts.md](prompts.md) · [my-ai.md](my-ai.md)

## 0. 이 문서를 쓰는 법

- **팀원(백엔드)** 이 이 문서를 받아, **6절의 티켓 하나를 서브에이전트 하나에게** 넘긴다. 티켓 하나 = 브랜치 하나.
- **이쪽(프론트)** 은 올라온 브랜치를 받아 **검수(8절) → 화면과 결합 → master에 합치기**를 한다.
- 두 사람 모두 상대의 진행 상황을 실시간으로 모른다. 그래서 **티켓마다 "끝 기준"과 "테스트"를 적어 두고, 브랜치에 올릴 때 그 기준을 통과했는지를 커밋 메시지에 적는다.**
- 응답 모양(계약)이 바뀌면 코드보다 **이 문서와 `backend-plan.md` 5절을 먼저** 고친다.
- 서브에이전트에게 줄 공통 지시문은 9절에 있다. 티켓 본문과 함께 그대로 붙여 넣는다.

## 1. 지금 있는 것 / 없는 것 (master `8590b78` 기준, 코드로 확인함)

**있다 (2단계 + 내 AI)**
- 저장소: `src/lib/store.ts` (런타임 저장소 `data/runtime/store.json`, 원자적 쓰기 + `updateStore` 대기열, `addNode`, `addModelCall`, `getActivePersona`, `getActiveRun`, `resetStore`)
- 모델: `src/lib/model/client.ts` (`callModel`, `callModelJson` 구조화 출력, `networkCause` 네트워크 원인), `mock.ts` (`MODEL_MOCK=1`)
- 채팅 `POST /api/chat` (REM 중 409 검사 코드는 이미 있음, 같은 세션 최근 대화 history), 이야기·의미 `POST /api/story`, 검색·삭제 API들
- 내 AI: `/api/profiles/**` (프로필·비교·메일), 기록 관리 `/api/admin/**`, 예시 기억 `POST /api/demo`
- 타입: `Insight`, `RemRun`, `PersonaProposal`(통글 방식), `ModelCall`은 `types.ts`에 **모양만** 있다

**없다 (이번 계획의 대상)**
- `src/lib/rem/**` 전체 (REM 실행 틀, 모드 1·2), `/api/rem/*`
- 3층 인격 (`src/lib/persona/**`), 제안 생성·검증, 항목별 승인·되돌리기, `/api/proposals/**`, `/api/persona/**`, `/api/session/reset`
- 인격이 **세션별**이 아님 (지금은 `activePersona` 하나를 모두가 같이 씀)
- `/api/debug/calls`, `/api/debug/metrics` (`reset-all`만 있음)
- 관리자 잠금, 오프라인 대비, 학교 AI

## 2. 이번에 정한 것 (팀원과 질문으로 확정)

| 항목 | 결정 |
| --- | --- |
| 인격 구조 | `persona-architecture.md`의 **3층 그대로** (고정층 · 말투 수치 4개 · 지침 노트) |
| REM 재료 | **그 관람객 세션만** (노드 + 의미) |
| REM 시작 | **잠들기 버튼** + 대화가 **5번** 쌓이면 화면이 "잠들어 볼까요?" 권유 |
| 진행 전달 | **0.5초 폴링** `GET /api/rem/status` (스트리밍 안 함) |
| 모드 1 '정리'(깊은 잠) | 노드를 섞어 하나씩 읽고, 앞 통찰을 다음 노드의 맥락으로 넘김 → 반복 패턴은 **지침 노트**로 |
| 모드 2 '꿈'(REM) | **의미(별) 두 개씩 짝지어** 높은 온도로 뜻밖의 연결 찾기 → 주로 **말투 수치**를 조금. 별자리 화면에서 두 별 사이에 선이 생기는 연출과 이어짐 |
| 개인 AI 승인 | **관람객이 카드에서 항목마다** 적용/취소 |
| 인격 범위 | **둘 다**: ① 관람객마다 따로 자라는 **개인 AI**, ② 여러 관람객의 이야기로 자라는 공용 **학교 AI** (3절) |
| 학교 AI 재료 | 모든 세션의 의미를 **개인정보를 지운 뒤** 받는다. 전시가 끝나면 통째로 지운다 |
| 학교 AI 승인 | **자동 적용(범위 제한)**. 자동 적용 금지 원칙의 **유일한 예외** |
| 추가 기능 | 전후 비교 자동 기록, 관리자 로그인(아이디 admin + 비밀번호, 비밀번호는 해시로 서버 .env.local에만), 오프라인 대비(녹화 재생) |
| 작업 단위 | 티켓마다 브랜치 1개 |
| 마감 | 약 1달 (7절 주차표) |

## 3. 큰 그림: 개인 AI와 학교 AI

```
관람객 A ─ 대화/이야기 ─▶ 노드·의미(세션 A) ─ REM ─▶ 제안 ─ 관람객이 승인 ─▶ 개인 AI(세션 A) 새 버전
                                │
                                └─ 개인정보 제거 ─▶ 학교 의미 풀(익명) ─ 학교 REM ─▶ 범위 안 자동 적용 ─▶ 학교 AI 새 버전
시간 없는 관람객 B ─ "바로 대화" ─▶ 학교 AI (학교 의미 풀에서 이번 말과 맞는 것 몇 개를 참고)
```

### 3-1. 개인 AI (세션별)
- 모든 세션은 **학교 AI가 아니라 시드 v1**에서 시작한다. 승인한 변화는 그 세션에만 남고, 세션을 지우거나 초기화하면 사라진다.
- 저장: 인격 버전에 `scope`를 붙인다 (4절). 세션의 활성 버전은 `activePersonas["session:<id>"]`.

### 3-2. 학교 AI (공용, "학교 평균")
**화면과 프롬프트 둘 다에 이렇게 명시한다**:
> 이 AI는 우리 학교 학생들이 들려준 이야기(이름 등은 지운 것)로 자랐어요. 친구들 이야기를 많이 들은 사람이 처음 만난 친구를 대강 짐작하는 것처럼, 당신에 대해 짐작해서 말할 수 있어요. 틀리면 알려 주세요.

- **쓰는 사람**: 시간이 없어 이야기를 쌓지 못한 관람객. 대화 화면에서 "바로 대화(학교 AI)"를 고르면 그 세션의 채팅이 학교 AI 인격을 쓴다.
- **재료**: 모든 세션의 의미(별)를 **익명화**해서 학교 의미 풀(`schoolMeanings`)에 복사한다. 원문 이야기·대화는 넣지 않는다. 세션 번호도 남기지 않는다(어느 관람객 것인지 거꾸로 못 찾게).
- **익명화** (`src/lib/school/anonymize.ts`, 순수 함수 + 단위 테스트): 전화번호·이메일·URL·숫자 6자리 이상·"N학년 N반 N번"·주소 모양을 지우고, 사람 이름으로 보이는 2~4글자 + 호칭("~야", "~이가", "~쌤", "~선생님")은 "친구"/"선생님"으로 바꾼다. 지운 뒤 8자 미만이 되면 버린다. 완벽하지 않으므로 **풀에 들어가는 것은 제목·핵심 한두 문장·키워드뿐**이다.
- **대화 때 넣는 것**: 고정층 + 학교 AI의 말투·노트 + **이번 말과 맞는 학교 의미 최대 4개**(내 AI의 `searchWiki` 2글자 묶음 검색을 재사용). 프롬프트에는 "이건 이 학교 학생들에게서 자주 들은 이야기야. 상대가 그렇다고 단정하지 말고 짐작으로만 말해" 를 붙인다.
- **학교 REM**: 운영자가 `/admin`에서 누르거나, 학교 의미가 새로 **10개** 쌓일 때마다 서버가 한 번 돌린다(동시에 하나만). 모드 1·2 그대로, 재료만 학교 의미 풀.
- **자동 적용 범위 제한** (이게 지켜지지 않으면 적용하지 않고 `pending`으로 남김):
  - 한 번에 항목 최대 2개, 말투 수치는 ±0.05까지(개인 AI의 절반), 범위 0.3~0.7
  - 노트는 `persona/validate.ts`의 모든 검증 + **근거 의미가 서로 다른 출처 3개 이상**일 때만
  - 노트 상한 10개, 넘으면 `addNote`는 적용하지 않음
  - 적용할 때마다 새 버전으로 남기고, `/admin`에서 **되돌리기·학교 AI 전체 지우기** 버튼
- **끝나면 삭제**: `DELETE /api/admin/school` (관리자 로그인 필요)로 학교 의미 풀과 학교 AI 버전을 전부 지우고 v1로.
- `persona-architecture.md` 11절의 "관람객 간 기억 공유는 하지 않는다"는 **이 조건(익명 의미만·명시·전시 후 삭제)으로 바뀐다**. 그 문서도 같이 고친다(티켓 B-09).

## 4. 데이터 모양 변경 (`types.ts`) — 티켓 B-00에서 한 번에

`persona-architecture.md` 3절의 `PersonaStyle`, `PersonaNote`, `PersonaChange`, `PersonaChangeItem`, 항목 방식 `PersonaProposal`을 **그대로** 넣고, 아래를 더한다.

```ts
/** 인격이 누구 것인가: 학교 AI 또는 세션 하나 */
export type PersonaScope = "school" | `session:${string}`;

export interface PersonaVersion {
  scope: PersonaScope;          // 추가. 시드 v1은 "school"과 같은 내용을 세션들이 복사해 시작
  version: number;              // scope 안에서 1부터
  systemPrompt: string;         // ① + ② 한 줄 (비교·디버그용)
  style: PersonaStyle;
  notes: PersonaNote[];
  sourceInsightIds: number[];
  sourceMeaningIds?: number[];
  approvedAt: string;
  parentVersion: number | null;
  /** 학교 AI 자동 적용이면 "auto", 사람이 승인했으면 "human" */
  appliedBy: "human" | "auto";
}

export interface RemRun {
  // 기존 필드 +
  scope: PersonaScope;
  /** 실제 모델로 돌았나, 녹화 재생인가 (B-11) */
  source: "model" | "replay";
  /** 진행 막대용: 전체 단계 수와 끝낸 단계 수 */
  steps: { total: number; done: number };
  /** 모드 2에서 지금 짝지은 의미 두 개 (별자리 선 연출용) */
  currentMeaningIds: number[];
}

/** 익명 학교 의미 (세션 번호 없음) */
export interface SchoolMeaning {
  id: number;
  title: string;
  essence: string;
  keywords: string[];
  /** 같은 내용이 몇 번 들어왔나 (비슷하면 합쳐서 센다) */
  count: number;
  /** 출처 구분용 무작위 표식 (세션 번호 아님, 서버만 앎). 근거 3개 조건 계산용 */
  sourceTags: string[];
  createdAt: string;
}

/** 잠들기 전후 같은 질문의 답 (B-07) */
export interface Comparison {
  id: number;
  runId: string;
  scope: PersonaScope;
  question: string;             // 기본 "나에 대해 어떻게 생각해?"
  before: { version: number; answer: string; at: string };
  after: { version: number; answer: string; at: string } | null;  // 승인 뒤 채움
}

// Store에 추가
//   activePersonas: Record<PersonaScope, number>   (기존 activePersona는 school의 값으로 옮기고 지움)
//   schoolMeanings: SchoolMeaning[]
//   comparisons: Comparison[]
//   sessionModes?: Record<string, "personal" | "school">  세션이 어느 AI와 대화하나 (기본 personal)
// ModelCall에 추가: usedNoteIds?: number[]; scope?: PersonaScope
// ModelPurpose에 추가: "rem-compare" | "school-chat"
```

시드 이전: `scripts/make-fake-store.mjs`를 고쳐 기존 인격을 `scope: "school"`, `style` 모두 0.5, `notes: []`, `appliedBy: "human"`으로 옮긴다. `store.ts`는 **예전 모양의 런타임 저장소를 읽으면 새 모양으로 바꿔 주는 함수**(`migrate`)를 둔다. 그래야 각자 컴퓨터의 `data/runtime/`을 지우지 않아도 된다.

## 5. API 추가·변경 (끝나면 `backend-plan.md` 5절 표에 옮겨 적기)

| 주소 | 하는 일 | 티켓 |
| --- | --- | --- |
| `GET /api/state?sessionId=` | 기존 + `persona`(그 세션의 활성 버전), `run`(진행 중이면), `proposals`(그 세션), `comparisons`, `remSuggest: boolean`(마지막 REM 뒤 대화 5개 이상), `mode`("personal"/"school") | B-00, B-03 |
| `POST /api/session/mode` `{ sessionId, mode }` | 개인 AI ↔ 학교 AI 전환 | B-09 |
| `POST /api/rem/start` `{ sessionId, mode }` | `202 { runId }`. 이미 실행 중이면 409, 노드 2개 미만(모드 1)·의미 2개 미만(모드 2)이면 422 | B-03 |
| `GET /api/rem/status?runId=` | `RemRun` | B-03 |
| `POST /api/rem/stop` `{ runId }` | 다음 모델 호출 전에 멈춤 | B-03 |
| `POST /api/proposals/[id]/items/[itemId]/approve` · `/reject` | 항목 하나 결정. 승인된 항목이 생기면 새 버전, 모든 항목 결정되면 `done` | B-06 |
| `POST /api/proposals/[id]/decide` `{ approve: number[], reject: number[] }` | 카드의 "선택한 것 적용"을 한 번에 (화면은 이것만 써도 됨) | B-06 |
| `POST /api/persona/revert` `{ sessionId, version }` | 그 세션의 활성 버전만 바꿈 | B-06 |
| `GET /api/persona/preview?sessionId=&message=` | 지금 조립되는 시스템 프롬프트와 켜질 노트 (디버그) | B-01 |
| `POST /api/session/reset` `{ sessionId }` | 그 세션의 노드·의미·통찰·제안·비교·개인 인격 지움 (학교 풀에 이미 들어간 익명 의미는 남음) | B-06 |
| `GET /api/debug/calls?limit=&purpose=` | `ModelCall` 목록 (프롬프트·응답 원문 포함) | B-02 |
| `GET /api/debug/metrics` | 노드·의미·통찰 수, 목적별 호출 수·토큰 합·평균 ms·오류 수, 실행 중 REM | B-02 |
| `GET /api/school` | 학교 AI 활성 버전, 노트·수치, 의미 풀 수, 최근 자동 적용 기록 | B-09 |
| `POST /api/admin/school/rem` | 학교 REM 지금 돌리기 | B-10 |
| `POST /api/admin/school/revert` `{ version }` · `DELETE /api/admin/school` | 학교 AI 되돌리기 · 전부 지우기 | B-10 |
| `POST /api/admin/login` `{ username, password }` / `POST /api/admin/logout` | 맞으면 `{ ok: true }` + HttpOnly 세션 쿠키 (비밀번호·해시는 응답·로그에 절대 없음) | B-12 |

오류는 기존대로 `{ error: "문장" }` + 상태 코드. 모든 새 API는 `MODEL_MOCK=1`에서 끝까지 돌아야 한다.

## 6. 티켓

각 티켓: **브랜치 / 손대는 파일 / 할 일 / 끝 기준 / 테스트 / 먼저 끝나야 하는 티켓.**
파일 경계는 `backend-plan.md` 3절 그대로(백엔드는 `src/lib/**`, `src/app/api/**`, `scripts/**`, `tests/api-*.spec.ts`, `tests/unit/*`). 화면 파일(`src/components/**`, `page.tsx`)은 건드리지 않는다.

### B-00 계약 먼저 (작게, 가장 먼저 합친다)
- 브랜치 `backend/b00-contract`
- 파일: `src/lib/types.ts`, `scripts/make-fake-store.mjs`, `data/store.json`, `src/lib/store.ts`(`migrate`, `activePersonas` 읽기), `src/lib/model/mock.ts`(새 목적들의 가짜 응답 자리)
- 할 일: 4절 타입 전부. 시드에 데모용 제안 1개(항목 3개), 끝난 run 1개, 비교 1개, 학교 의미 5개를 넣어 **화면이 백엔드 없이도 그려지게**.
- 끝 기준: `npm run build` 통과, 기존 Playwright 전부 통과, 예전 모양 저장소를 넣어도 `readStore()`가 새 모양을 돌려줌.
- 테스트: `tests/unit/store-migrate.unit.ts`
- 선행: 없음

### B-01 3층 인격 조립
- 브랜치 `backend/b01-persona-assemble`
- 파일: `src/lib/persona/assemble.ts`, `src/lib/persona/style-lines.ts`(축 4개 × 구간 3개 = 문장 12개), `src/app/api/chat/route.ts`, `src/app/api/persona/preview/route.ts`
- 할 일: `persona-architecture.md` 4절. 세션의 활성 인격(`session:<id>`, 없으면 시드 v1)을 찾아 조립. 노트 6개 넘으면 cues 점수로 6개. `ModelCall.usedNoteIds` 기록.
- 끝 기준: **노트 없음·수치 0.5면 지금 프롬프트와 글자 하나 다르지 않음**(단위 테스트로 증명). 동작 변화 없음.
- 테스트: `tests/unit/persona-assemble.unit.ts`
- 선행: B-00

### B-02 디버그 수치·로그
- 브랜치 `backend/b02-debug`
- 파일: `src/app/api/debug/{calls,metrics}/route.ts`, 필요하면 `store.ts`의 `addModelCall` 보관 개수(최근 200)
- 끝 기준: 채팅 1번 + 이야기 1번 뒤 `metrics`의 목적별 호출 수가 맞음. 키·`.env` 값이 응답 어디에도 없음.
- 테스트: `tests/api-debug.spec.ts`
- 선행: B-00 (B-01과 동시에 해도 됨)

### B-03 REM 실행 틀
- 브랜치 `backend/b03-rem-runner`
- 파일: `src/lib/rem/{types,registry,runner}.ts`, `src/app/api/rem/{start,status,stop}/route.ts`, `src/app/api/state/route.ts`(`run`, `remSuggest`)
- 할 일: `backend-plan.md` 6절의 `RemMode`/`RemContext` 약속. runner가 저장·중단·오류·`steps`·`currentNodeIds`/`currentMeaningIds` 갱신을 공통 처리. 노드 상한 12. 서버 재시작 때 `running`으로 남은 run은 `error`로 닫기. **모델 호출은 `updateStore` 밖에서**(대기열을 막지 않게).
- 끝 기준: 가짜 모드(테스트용 `echo` 모드)로 start → status 폴링 → done. 실행 중 `/api/chat`이 409. stop하면 `stopped`.
- 테스트: `tests/api-rem.spec.ts`
- 선행: B-00

### B-04 모드 1 '정리'
- 브랜치 `backend/b04-mode-consolidate`
- 파일: `src/lib/rem/modes/consolidate.ts`, `src/lib/prompts/rem.ts`
- 할 일: 노드 섞기(씨앗 고정 가능) → 노드마다 `ctx.markReading` → 앞 통찰들 + 이 노드 + 관련 의미 → 통찰 한 줄. 마지막에 정리 통찰. 프롬프트는 `prompts.md` 0절 원칙(자료는 `<자료>` 태그, 지시 아님).
- 끝 기준: mock에서 노드 수만큼 통찰, 실제 Gemini로 한 번 돌려 통찰 예시 3개를 커밋 메시지에 붙임.
- 테스트: `tests/api-rem.spec.ts`에 모드 1 케이스
- 선행: B-03

### B-05 제안 생성 + 검증
- 브랜치 `backend/b05-proposal`
- 파일: `src/lib/rem/proposal.ts`, `src/lib/persona/validate.ts`, `src/lib/prompts/rem.ts`
- 할 일: `persona-architecture.md` 5절. 구조화 출력(`callModelJson`), 항목별 검증, 통과한 것만 제안에. runner 마지막 단계로 연결.
- 끝 기준: 검증 규칙 표의 각 줄마다 "거부되는 입력" 단위 테스트가 있음.
- 테스트: `tests/unit/persona-validate.unit.ts`
- 선행: B-03 (B-04와 동시에 해도 됨)

### B-06 항목별 승인·되돌리기·세션 초기화
- 브랜치 `backend/b06-approve`
- 파일: `src/lib/persona/apply.ts`, `src/app/api/proposals/**`, `src/app/api/persona/revert/route.ts`, `src/app/api/session/reset/route.ts`
- 끝 기준: 승인 → **다음 채팅부터** 새 노트·수치가 프롬프트에 들어감(`/api/persona/preview`로 확인). 거절만 하면 새 버전 없음. 되돌리기 → 이전 프롬프트. 다른 세션의 인격은 그대로.
- 테스트: `tests/api-proposal.spec.ts`
- 선행: B-01, B-05

### B-07 잠들기 전후 비교 자동 기록
- 브랜치 `backend/b07-compare`
- 파일: `src/lib/rem/compare.ts`, runner·apply에 연결
- 할 일: REM 시작 직전에 그 세션 인격으로 확인 질문 1번 → `before`. 제안 항목이 하나라도 승인되면 새 인격으로 같은 질문 → `after`. 둘 다 그 세션의 최근 대화 6개를 맥락으로 같은 조건. 호출 목적 `rem-compare`.
- 끝 기준: mock에서 before/after가 다른 글(가짜 응답이 버전 번호를 포함하게).
- 테스트: `tests/api-proposal.spec.ts`에 추가
- 선행: B-06

### B-08 모드 2 '꿈' (의미 짝짓기)
- 브랜치 `backend/b08-mode-dream`
- 파일: `src/lib/rem/modes/dream.ts`, `registry.ts`에 **한 줄**
- 할 일: 그 세션 의미 중 **서로 다른 이야기에서 나온 것끼리** 우선 짝 3쌍(의미가 2개뿐이면 1쌍), 온도 1.2. 짝마다 `currentMeaningIds` 갱신 → "둘의 연결" 통찰. 제안은 B-05 공통 단계.
- 끝 기준: 새 모드 파일 + registry 한 줄만으로 동작. 의미 1개 이하면 422.
- 선행: B-05

### B-09 학교 AI: 익명 풀 + 대화
- 브랜치 `backend/b09-school`
- 파일: `src/lib/school/{anonymize,pool,chat}.ts`, `src/app/api/school/route.ts`, `src/app/api/session/mode/route.ts`, `src/app/api/chat/route.ts`(모드 분기), `docs/persona-architecture.md` 11절 수정
- 할 일: 3-2절. 의미가 만들어질 때(`/api/story`, `/api/demo`) 익명화해 풀에 추가(비슷한 제목·키워드 겹침 60% 이상이면 `count`만 올림). 학교 모드 세션의 채팅은 학교 인격 + 맞는 학교 의미 4개 + "짐작" 문구.
- 끝 기준: 전화번호·이메일·"2학년 3반 15번"·"민수야" 가 들어간 의미가 풀에서는 지워져 있음. 풀에 세션 번호 없음.
- 테스트: `tests/unit/anonymize.unit.ts`, `tests/api-school.spec.ts`
- 선행: B-01

### B-10 학교 REM 자동 적용
- 브랜치 `backend/b10-school-rem`
- 파일: `src/lib/school/rem.ts`, `src/lib/persona/validate.ts`(학교용 더 좁은 범위), `src/app/api/admin/school/**`
- 할 일: 3-2절 자동 적용 범위. 새 학교 의미 10개마다 한 번(동시에 하나), 또는 관리자 버튼. 범위를 벗어난 항목은 `pending`으로 남겨 `/admin`에서 볼 수 있게.
- 끝 기준: ±0.05·근거 3개·노트 상한이 단위 테스트로 지켜짐. 되돌리기·전부 지우기 동작.
- 선행: B-08, B-09

### B-11 오프라인 대비 (녹화 재생)
- 브랜치 `backend/b11-replay`
- 파일: `src/lib/rem/replay.ts`, `scripts/record-replay.mjs`, `data/replays/*.json`(git 추적)
- 할 일: 실제 모델로 돈 REM(통찰·제안·비교 답)을 파일로 녹화하는 스크립트. REM 시작 때 모델이 안 닿으면(`networkCause`가 있으면) **예시 기억 세션과 같은 내용이면** 녹화를 같은 속도로 재생, `source: "replay"`. 다른 내용이면 오류 대신 "인터넷이 안 돼서 예시로 보여 줄게요" 안내와 함께 예시 녹화.
- 끝 기준: 인터넷을 끊은(또는 `GEMINI_API_KEY`를 틀린 값으로 둔) 상태에서 예시 기억 → 잠들기 → 제안 카드까지 화면이 끝까지 감.
- 선행: B-07

### B-12 관리자 로그인 (아이디 + 비밀번호)
- 브랜치 `backend/b12-admin-login`
- 파일: `src/proxy.ts`(Next 16에서는 middleware가 proxy로 바뀜. 먼저 `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`를 읽을 것), `src/lib/admin-auth.ts`(`import "server-only"`), `src/app/api/admin/{login,logout}/route.ts`, `.env.example`(`ADMIN_USER=`, `ADMIN_PASSWORD_HASH=`, `ADMIN_SESSION_SECRET=` 이름만)
- 아이디는 `admin`. 비밀번호는 **문서·코드·채팅 어디에도 적지 않는다.** 각자 `node scripts/hash-password.mjs`로 해시를 만들어 자기 `.env.local`에만 넣는다 (비밀번호는 팀 안에서 말로 전달).
- **비밀번호가 웹사이트 안에 드러나지 않게 하는 규칙** (바이브 코딩에서 자주 새는 곳들):
  1. 비밀번호·해시·비밀 값을 소스 코드에 문자열로 쓰지 않는다. 기본값(`?? "1234"` 같은 것)도 두지 않는다.
  2. `NEXT_PUBLIC_` 접두사 금지. 비밀 값을 읽는 파일은 `import "server-only"`로 막아 화면 코드가 import하면 빌드가 실패하게 한다.
  3. 비교는 서버에서만: 입력을 같은 scrypt 설정으로 계산해 `crypto.timingSafeEqual`로 비교. 화면(클라이언트)에서 비교하지 않는다.
  4. 로그인 성공 시 응답에는 `{ ok: true }`만. 쿠키는 무작위 세션 토큰(`HttpOnly; Secure(https일 때); SameSite=Strict; Path=/`, 12시간). 토큰에 비밀번호·해시를 담지 않는다.
  5. 오류 메시지는 아이디·비밀번호 중 무엇이 틀렸는지 말하지 않는다("아이디나 비밀번호가 맞지 않아요"). 10분에 5번 틀리면 그 IP를 10분 잠금.
  6. 로그·`ModelCall`·디버그 API·오류 스택에 요청 본문을 그대로 남기지 않는다(로그인 본문은 절대).
  7. 로그인 화면(프론트)의 입력값을 `localStorage`·URL 쿼리에 두지 않는다.
- 잠그는 것: `/admin`, `/debug` 화면, `/api/admin/**`(login 제외), `/api/debug/**`, 남의 세션을 지우는 삭제 API, `/api/demo`. **관람객이 자기 세션을 지우는 "나 잊기"는 잠그지 않는다.**
- 끝 기준: 로그인 없이 잠긴 API가 401·화면은 로그인으로 이동, 로그인 뒤 200. `ADMIN_PASSWORD_HASH`가 비어 있으면 잠금 없음(개발용) + 서버 시작 때 경고 한 줄. **`npm run build` 뒤 `.next/static` 전체를 비밀번호·해시 문자열로 검색해 0건**(검수 때 이쪽에서도 다시 한다).
- 테스트: `tests/api-admin-login.spec.ts` (테스트용 비밀번호는 테스트 안에서 해시를 만들어 환경 변수로 넘김 — 진짜 비밀번호를 테스트에 쓰지 않음)
- 선행: 없음 (언제든)

### B-13 모드 가이드와 검증 스크립트
- 브랜치 `backend/b13-mode-guide`
- 파일: `docs/rem-mode-guide.md`(모둠원이 모드를 글로 쓰는 양식: 무엇을 고르나 / 뭐라고 시키나 / 온도 / 무엇을 바꾸고 싶나), `scripts/verify-rem.mjs`(비교 기록을 `docs/rem-verification.md`로 모음)
- 끝 기준: 모둠원 설계 1개를 파일 하나로 옮겨 실제로 돌려 본 기록이 `rem-verification.md`에 있음.
- 선행: B-08

### 의존 그림
```
B-00 ─┬─ B-01 ─────────────┬─ B-06 ─ B-07 ─ B-11
      ├─ B-02              │
      └─ B-03 ─┬─ B-04     │
               └─ B-05 ────┴─ B-08 ─┬─ B-10
                       B-01 ─ B-09 ─┘
B-12 (아무 때나)    B-13 (B-08 뒤)
```

## 7. 1달 순서

| 주 | 백엔드 (팀원) | 프론트 (이쪽, 받아서 결합) |
| --- | --- | --- |
| 1주 | B-00, B-01, B-02, B-12 | 시드 데이터로 제안 카드·REM 진행 화면 먼저, 별 공전 3D 구 |
| 2주 | B-03, B-04, B-05 | 잠들기 버튼·권유·진행 폴링 결합, 디버그 화면에 calls/metrics |
| 3주 | B-06, B-07, B-08, B-09 | 항목 승인 카드, 전후 비교 화면, 모드 2 별 짝 선 연출, "바로 대화(학교 AI)" |
| 4주 | B-10, B-11, B-13 + 실제 Gemini로 전체 리허설 | 학교 AI 관리, 오프라인 재생 확인, 전시 화면 크기 점검 |

**꼭 필요한 것**(시간이 모자라면 여기까지): B-00~B-07, B-11, B-12. 학교 AI(B-09·10)와 모드 2(B-08)는 그 다음.

## 8. 이쪽에서 검수하는 기준 (브랜치를 받을 때)

1. `git fetch && git switch <브랜치>` → `npm install` → `npm run build` → `npx playwright test` → `node --test tests/unit/*.unit.ts` 전부 통과
2. 티켓의 **끝 기준**을 직접 한 번 해 봄 (mock, 가능하면 실제 Gemini 1번)
3. 계약: 응답 모양이 5절·`backend-plan.md`와 같은가. 다르면 문서가 먼저 고쳐졌는가
4. 안전: 키·`.env*`·`data/runtime/`가 커밋에 없음. 모델 호출이 `updateStore` 안에 없음. 사용자 글이 프롬프트에서 `<자료>` 안에만 있음. 비밀 값(키·비밀번호·해시)이 소스·`NEXT_PUBLIC_`·응답·로그에 없고, 빌드 뒤 `.next/static`을 검색해 0건
5. 범위: 티켓에 적힌 파일 밖을 건드렸으면 이유가 커밋에 있음. 화면 파일은 안 건드림
6. 통과하면 이쪽에서 화면을 붙여 같은 브랜치(또는 `integration/...`)에서 다시 테스트 → master에 합침

## 9. 서브에이전트에게 줄 공통 지시문 (티켓 본문 앞에 붙임)

```
너는 rem-dream 저장소(Next.js 16)의 백엔드 담당이다. 아래 티켓 하나만 한다.
- 먼저 AGENTS.md, docs/backend-roadmap.md(이 계획), docs/backend-plan.md, 티켓이 가리키는 문서를 읽는다.
- Next.js는 예전과 다르다. 라우트 핸들러·proxy를 쓰기 전에 node_modules/next/dist/docs/의 해당 문서를 읽는다.
  파일·저장소를 읽는 GET 핸들러는 먼저 await connection()을 부른다.
- 새 브랜치에서만 작업한다(티켓의 브랜치 이름). master에 직접 커밋·푸시하지 않는다.
- 티켓에 적힌 파일만 바꾼다. src/components/**, page.tsx 같은 화면 파일은 건드리지 않는다.
- 모든 쓰기는 src/lib/store.ts의 updateStore를 지난다. 모델 호출은 updateStore 밖에서 한다.
- 모델은 src/lib/model/client.ts(callModel, callModelJson)로만 부르고, MODEL_MOCK=1에서 끝까지 돌도록 mock.ts에 가짜 응답을 더한다.
- 사용자 글은 프롬프트에서 <자료> 태그 안에 넣고, 지시가 아니라 데이터로 다룬다(docs/prompts.md 0절).
- API 키·.env*·data/runtime/은 절대 커밋하지 않는다. 키를 출력·로그에 남기지 않는다.
- 비밀번호·키 같은 비밀 값을 소스 코드에 문자열로 쓰지 않는다(기본값 포함). NEXT_PUBLIC_ 금지, 비밀을 읽는 파일은 import "server-only".
- 끝나면: npm run build, npx playwright test, node --test tests/unit/*.unit.ts 를 돌리고,
  티켓의 "끝 기준"을 어떻게 확인했는지 커밋 메시지에 적은 뒤 브랜치를 푸시한다.
- 계약(응답 모양)을 바꿔야 하면 코드보다 docs/backend-roadmap.md 5절을 먼저 고치고 커밋 메시지에 밝힌다.
- 커밋은 한국어로 한 가지 일씩.
```

## 10. 아직 남은 질문 (작업하면서 정해도 됨)

- [ ] 확인 질문을 "나에 대해 어떻게 생각해?" 하나로 할지, 관람객이 고르게 할지 (B-07)
- [ ] 학교 REM 주기: 의미 10개마다가 적당한지, 전시 중 시간 단위로 할지 (B-10)
- [ ] 익명화에서 이름 판별을 규칙으로만 할지, 모델에게 한 번 더 시킬지 (B-09, 기본은 규칙만)
- [ ] 모드 2 온도 1.2가 Gemini에서 너무 엉뚱하지 않은지 (B-08, 실제로 돌려 보고 조정)
- [ ] 권유 기준 "대화 5번"이 전시 체류 시간에 맞는지 (화면 쪽에서 조정 가능하게 `remSuggest` 기준을 환경 변수로)
