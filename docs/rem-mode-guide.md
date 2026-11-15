# REM 모드 작성 가이드 (모둠원용)

이 문서는 모둠원이 새로운 REM 수면 학습 모드를 제안하고 코드로 옮길 때 작성하는 표준 설계 양식입니다.
모든 REM 모드는 `src/lib/rem/types.ts`의 `RemMode` 인터페이스를 만족해야 하며, `src/lib/rem/registry.ts`에 등록되어 실행됩니다.

---

## 1. 모드 설계 양식 (작성 예시)

```markdown
### [모드 이름]
- **식별자(id)**: `mode-creative`
- **화면 표시 이름(label)**: `모드 3: 상상 (새로운 연결)`
- **기본 온도(defaultTemperature)**: `1.0`

#### 1) 무엇을 고르나 (재료 선정)
- 관람객 세션의 기억 노드 중 주제(topic)가 가장 다른 두 노드 또는 최근 감정 단어가 포함된 노드 2개를 선택.

#### 2) 모델에게 뭐라고 시키나 (프롬프트 지시)
- "서로 다른 두 기억을 하나의 은유적 장면으로 엮어 보고, 그 속에서 사용자가 소중하게 여기는 가치를 한 줄 통찰로 도출해 줘."
- 원문 자료는 반드시 `<자료>` 태그로 감싸 지시가 아닌 데이터로 전달.

#### 3) 무엇을 바꾸고 싶나 (인격 수정 목표)
- 주로 호기심(curiosity) 축을 +0.05 이동하고, 사용자의 창의적 취향을 반영하는 지침 노트(addNote) 제안.
```

---

## 2. 코드 구현 구조

새로운 모드를 추가할 때는 `src/lib/rem/modes/<모드이름>.ts` 파일을 생성하고 `RemMode` 인터페이스를 구현합니다.

```ts
import type { RemContext, RemMode } from "../types";
import type { Insight } from "../../types";

export const creativeMode: RemMode = {
  id: "creative",
  label: "상상 (새로운 연결)",
  defaultTemperature: 1.0,
  async run(ctx: RemContext): Promise<Insight[]> {
    // 1. 노드 선택 및 ctx.markReading 호출
    // 2. ctx.ask(prompt)를 통해 모델 호출 (updateStore 외부)
    // 3. 통찰(Insight) 목록 반환
    return [];
  },
};
```

그리고 `src/lib/rem/registry.ts`의 목록에 등록합니다:

```ts
import { creativeMode } from "./modes/creative";
// registry 배열에 추가
```
