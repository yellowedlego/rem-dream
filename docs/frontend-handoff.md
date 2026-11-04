# 프론트엔드 작업자 참고 가이드 (Handoff & Contract)

> **문서 목적**: 백엔드(사람 A)와 프론트엔드(사람 B) 간의 작업 충돌을 방지하고, 데이터 타입 및 API 인터페이스 계약을 투명하게 공유하기 위한 실시간 참고 문서입니다.  
> **최종 갱신일**: 2026-11-04 (Milestone 1B 구현 완료: 이야기 쪼개기·검색·삭제 API 전 엔드포인트 구현 및 테스트 통과)  
> **현재 브랜치**: `backend/stage-2-chat`

---

## 1. 역할 분담 및 작업 파일 경계 (충돌 방지 원칙)

두 작업자가 동일한 파일을 동시에 수정하여 발생하는 충돌(Merge Conflict)을 방지하기 위해 파일 담당 영역을 엄격히 구분합니다.

| 담당 | 작업 가능 디렉토리 및 파일 | 비고 |
| :--- | :--- | :--- |
| **프론트엔드 (사람 B)** | `src/components/**`<br>`src/app/page.tsx`<br>`src/app/debug/**`<br>`src/app/globals.css`<br>`public/**`<br>`src/app/api-mock/**` (가짜 API 개발용) | UI 컴포넌트, 인터랙션, 디자인, 스타일링 전담 |
| **백엔드 (사람 A)** | `src/lib/**`<br>`src/app/api/**`<br>`scripts/**`<br>`tests/api-*.spec.ts`<br>`.env.example`<br>`data/runtime/` (gitignore 대상) | 비즈니스 로직, API 엔드포인트, REM 엔진, 데이터 저장소 전담 |
| **공통 합의 대상** | `src/lib/types.ts`<br>`package.json` | **사전 상의 없이 임의 수정 금지**. 백엔드가 계약 변경 시 이 문서와 함께 선반영 |

> [!TIP]
> **프론트엔드 가짜 API 활용 안내 (`src/app/api-mock/`)**:  
> 백엔드 API가 배포되기 전에 화면 개발을 막힘 없이 진행할 수 있도록 프론트엔드는 `src/app/api-mock/**`에 임시 Mock API를 둘 수 있습니다. 실제 백엔드 API가 완성되면 `NEXT_PUBLIC_API_BASE`를 `/api-mock`에서 `/api`로 전환하시면 됩니다.

---

## 2. 데이터 계약 (Contract) — `src/lib/types.ts`

### (1) `Store` 구조 확장
기존 데이터 외에 `proposals`, `runs`, `calls`, `stories`가 추가되었습니다:
```typescript
export interface Store {
  nodes: MemoryNode[];
  insights: Insight[];
  personas: PersonaVersion[];
  activePersona: number;
  proposals: PersonaProposal[];
  runs: RemRun[];
  calls?: ModelCall[];
  stories: Story[]; // 신규 추가: 긴 이야기 원문 및 분할 노드 연결 정보
}
```

### (2) 긴 이야기(`Story`) 및 `MemoryNode` 확장 필드
```typescript
/** 긴 이야기 한 편 — 원문은 한 글자도 바꾸지 않고 보관 */
export interface Story {
  id: number;
  sessionId: string;
  rawText: string;             // 사용자가 입력한 원문 그대로
  nodeIds: number[];           // 쪼개져 나온 노드 번호들 (순서대로)
  createdAt: string;
}

// MemoryNode에 선택 필드 추가
export interface MemoryNode {
  // ... 기존 필수 필드 (id, sessionId, order, createdAt, user, ai)
  storyId?: number;            // 이야기에서 나왔을 경우 해당 번호
  storySpan?: [number, number];// rawText 안에서의 [시작, 끝) 글자 오프셋
  topic?: string;              // 쪼갠 조각의 한 줄 주제 (화면 말풍선/태그 표시용)
}
```

### (3) REM 및 인격 제안 인터페이스
* **`RemRun`**: 수면(REM) 1회 실행 상태(`id`, `sessionId`, `mode`, `status: "running" | "done" | "stopped" | "error"`, `currentNodeIds`, `insightIds`, `proposalId`)
* **`PersonaProposal`**: 인격 수정 제안(`id`, `runId`, `proposedPrompt`, `summary`, `status: "pending" | "approved" | "rejected"`)
* **`ModelCall`**: 디버그 화면용 LLM 호출 기록(토큰, 레이턴시, 프롬프트, 에러 등)

---

## 3. 백엔드 REST API 명세 및 구현 상태

모든 요청/응답은 `application/json` 기반입니다.

| 엔드포인트 | 메서드 | 요청 바디/파라미터 | 성공 응답 | 상태 | 설명 |
| :--- | :---: | :--- | :--- | :---: | :--- |
| `/api/state` | `GET` | `?sessionId=demo-1` | `{ nodes, insights, proposals, activePersona, activeRun }` | **구현 완료** | 화면 초기 로드 및 세션 상태 일괄 동기화 |
| `/api/chat` | `POST` | `{ sessionId, message, model? }` | `{ node: MemoryNode }` | **구현 완료** | 대화 전송. **REM 중일 때는 409 Conflict 반환** |
| `/api/story` | `POST` | `{ sessionId, text }` | `{ story: Story, nodes: MemoryNode[] }` | **구현 완료** | 긴 이야기를 원문 훼손 없이 맥락 단위(최대 12개)로 쪼개 노드 여러 개로 저장 (8,000자 초과 시 413) |
| `/api/sessions` | `GET` | 없음 | `[{ sessionId, nodeCount, lastAt, preview }]` | **구현 완료** | 대화 사이드바 및 디버그 화면용 세션 목록 |
| `/api/nodes` | `GET` | `?sessionId=&q=&limit=` | `{ nodes: MemoryNode[] }` | **구현 완료** | 세션 ID 및 유저 입력·답변·주제 부분 일치 검색 (기본 50개) |
| `/api/nodes/[id]` | `DELETE` | URL 파라미터 `id` | `{ ok: true }` | **구현 완료** | 노드 단건 삭제 (통찰 근거 목록에서 해당 번호 제거) |
| `/api/stories/[id]` | `DELETE` | URL 파라미터 `id` | `{ ok: true }` | **구현 완료** | 이야기 및 연관 생성 노드 일괄 삭제 |
| `/api/sessions/[sessionId]` | `DELETE` | URL 파라미터 `sessionId` | `{ ok: true }` | **구현 완료** | 세션 전체 데이터(노드·이야기·통찰·제안) 영구 삭제 (디버그용) |
| `/api/insights/[id]` | `DELETE` | URL 파라미터 `id` | `{ ok: true }` | **구현 완료** | 통찰 단건 삭제 (디버그용) |
| `/api/rem/start` | `POST` | `{ sessionId, mode?, temperature? }` | `202 { runId }` | 대기 (3단계) | REM 수면 시작 |
| `/api/rem/status` | `GET` | `?runId=...` | `RemRun` 객체 | 대기 (3단계) | 수면 진행 상황 0.5초 폴링용 |
| `/api/rem/stop` | `POST` | `{ runId }` | `{ ok: true }` | 대기 (3단계) | 수면 진행 중단 |
| `/api/proposals/[id]/approve` | `POST` | URL 파라미터 `id` | `{ ok: true, activePersona: number }` | 대기 (4단계) | 제안 승인 -> 새 버전 생성 및 즉시 활성화 |
| `/api/proposals/[id]/reject` | `POST` | URL 파라미터 `id` | `{ ok: true }` | 대기 (4단계) | 제안 거절 (기록만 보존) |
| `/api/persona/revert` | `POST` | `{ version }` | `{ ok: true, activePersona: number }` | 대기 (4단계) | 특정 이전 인격 버전으로 되돌리기 |
| `/api/session/reset` | `POST` | `{ sessionId }` | `{ ok: true }` | 대기 (4단계) | 관람객 교체용 리셋 (인격 v1 복귀) |
| `/api/debug/calls` | `GET` | `?limit=50&purpose=` | `{ calls: ModelCall[] }` | 대기 (6단계) | 모델 호출 로그 조회 |
| `/api/debug/metrics` | `GET` | 없음 | 통계 지표 객체 | 대기 (6단계) | 토큰, 평균 레이턴시, 오류율 통계 |
| `/api/debug/reset-all` | `POST` | 없음 | `{ ok: true }` | 대기 (6단계) | 전체 런타임 저장소 공장 초기화 |

---

## 4. 이야기 쪼개기 규칙 (`POST /api/story`)

긴 이야기를 넣었을 때 원본 텍스트를 손실하지 않는 규칙입니다:
1. 모델은 원문을 다시 쓰거나 요약하지 않고, **구간 글자 오프셋(`[{ start, end, topic }]`)**만 추출합니다.
2. 서버는 구간들이 빈틈이나 겹침 없이 `[0, text.length]` 전체를 완전 커버하는지 검증합니다.
3. 검증 실패 시 문단/문장 단위 정규식 대체 경로(`split.ts`)로 원문 손실 없이 자동 분할됩니다.
4. 각 조각의 글자를 이어붙이면 **사용자가 입력한 원문과 100% 일치**합니다.

---

## 5. 로컬 가짜 모드 (`MODEL_MOCK=1`)

API 키 없이 개발할 때는 `.env.local`에 다음을 설정하면 모든 채팅과 REM이 즉시 가짜 응답을 반환합니다:
```bash
MODEL_MOCK=1
```
