# 꿈(REM) 시스템

대화를 기억 노드로 쌓고, 잠들면(REM) AI가 기억을 다시 읽어 인격 수정 제안을 만드는 전시용 프로젝트.
기획서: [docs/plan.md](docs/plan.md) · 디자인 참고(따라 하지 말 것): [docs/design-reference/](docs/design-reference/)

## 지금 단계: 로드맵 1단계 (가짜 데이터 화면)

- 데이터 모양: [src/lib/types.ts](src/lib/types.ts) — 노드 · 통찰 · 인격 버전
- 저장소: [data/store.json](data/store.json) — `node scripts/make-fake-store.mjs` 로 가짜 노드 20개를 다시 만든다
- 전시 화면 `/` — 왼쪽 대화, 오른쪽 시간축 노드. 보이는 대화를 해당 노드가 빛줄기로 비추고, 노드를 누르면 그 대화로 스크롤
- 디버그 화면 `/debug` — 노드 목록, 통찰, 인격 버전

## 실행

```bash
npm install
npm run dev          # http://localhost:3000 , /debug
npm run build && npx playwright test   # 1단계 끝 기준 검사 + screenshots/ 에 스크린샷
```

## 규칙

- API 키는 `.env.local`에만 둔다 (`.gitignore`에 `.env*` 포함, 저장소에 올리지 않음).
- 애니메이션은 노드 등장 · REM 진행 · 통찰 등장 세 군데만.
