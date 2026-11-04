# 프론트엔드 작업자 참고 (Handoff)

> 계약(API·타입·규칙)은 **[docs/backend-plan.md](backend-plan.md) 하나**가 기준이다. 이 문서는 길을 알려 주는 짧은 안내만 둔다.
> 프롬프트 초안: [docs/prompts.md](prompts.md) · 2단계 점검 결과: [docs/review-stage2.md](review-stage2.md)

## 파일 담당 (충돌 방지)

| 담당 | 파일 |
| :--- | :--- |
| 프론트엔드 | `src/components/**`, `src/app/page.tsx`, `src/app/debug/**`, `src/app/globals.css`, `public/**`, `src/app/api-mock/**` |
| 백엔드 | `src/lib/**`, `src/app/api/**`, `scripts/**`, `tests/api-*.spec.ts`, `.env.example` |
| 합의 후 수정 | `src/lib/types.ts`, `package.json` |

## 2단계에서 바뀐 것 (프론트가 알아야 할 것)

- `POST /api/story` 응답: `{ story, nodes, meanings, method }` (`method`는 `"ai"` 또는 `"rule"`).
- 노드의 `storySpan` → **`storySpans`** (구간 배열). 노드 `user` = 구간 원문을 `\n`으로 이은 것.
- 새 API: `GET /api/meanings?sessionId=` → `{ meanings }`, `DELETE /api/meanings/[id]`.
- `GET /api/state`에 `stories`(원문 `rawText` 제외, `length`만)와 `meanings` 추가.
- 삭제 연쇄: 노드 삭제 → 의미의 `nodeIds`에서 제거(비면 의미 삭제), 이야기·세션 삭제 → 그 의미도 삭제.
- 대화 메시지는 2,000자까지(초과 413), 같은 세션 최근 10개를 기록으로 모델에 보낸다.

## 가짜 모드

`.env.local`에 `MODEL_MOCK=1`이면 키 없이 채팅·이야기가 가짜 응답을 낸다(이야기는 규칙 분리 + 임시 의미 1개).
화면 개발은 `NEXT_PUBLIC_API_BASE=/api-mock`(기본)로 하다가 `/api`로 전환한다.
