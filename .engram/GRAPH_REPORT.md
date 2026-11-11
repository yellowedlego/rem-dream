# Graph Report - .  (2026-11-11)

## Corpus Check
- 171 files · ~232,845 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1223 nodes · 2566 edges · 60 communities detected
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 26 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output
- Edge kinds: contains: 757 · calls: 525 · MODIFIES: 384 · imports: 283 · method: 220 · imports_from: 152 · ON_BRANCH: 92 · rationale_for: 74 · PARENT_OF: 53 · uses: 26


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 171 · Candidates: 259
- Excluded: 0 untracked · 38574 ignored · 0 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `8590b78`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `DesignSystemGenerator` - 34 edges
2. `getOne()` - 31 edges
3. `search()` - 20 edges
4. `getVideo()` - 19 edges
5. `MemoryNode` - 18 edges
6. `BM25` - 16 edges
7. `CatalogRefreshTest` - 15 edges
8. `TestSearchDomains` - 15 edges
9. `TestDomainDetection` - 15 edges
10. `read_rows()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `The exact reproduction from issue #428.` --uses--> `DesignSystemGenerator`  [INFERRED]
  .claude/skills/ui-ux-pro-max/scripts/tests/test_design_system_mode.py → .claude/skills/ui-ux-pro-max/scripts/design_system.py
- `A light result that avoids dark mode must not also call dark "supported".` --uses--> `DesignSystemGenerator`  [INFERRED]
  .claude/skills/ui-ux-pro-max/scripts/tests/test_design_system_mode.py → .claude/skills/ui-ux-pro-max/scripts/design_system.py
- `TestBm25CoreBehavior` --uses--> `BM25`  [INFERRED]
  .claude/skills/ui-ux-pro-max/scripts/tests/test_core.py → .claude/skills/ui-ux-pro-max/scripts/core.py
- `TestBm25CoreBehavior` --uses--> `DesignSystemGenerator`  [INFERRED]
  .claude/skills/ui-ux-pro-max/scripts/tests/test_core.py → .claude/skills/ui-ux-pro-max/scripts/design_system.py
- `TestDiagnosticsContracts` --uses--> `BM25`  [INFERRED]
  .claude/skills/ui-ux-pro-max/scripts/tests/test_core.py → .claude/skills/ui-ux-pro-max/scripts/core.py

## Communities

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (84): AIC_FIELDS, AIC_HEADERS, applyThumb(), ARCHIVE_LICENCE, args, argv, base(), clock() (+76 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (52): 33c4781 하늘 연출: 비교 화면 천구·유성우·점 A 빛, 의미성 별자리(북극성 공전·모이는 연출), 전시 화면 전환, 53b2f69 하늘 연출(비교 천구·의미성 별자리·모이는 연출)을 master에 합침 (feature/sky), 8590b78 예시 기억(모델 없이 별자리·내 AI 보기)을 master에 합침 (feature/demo), de79e23 예시 기억: 모델·인터넷 없이 별자리와 내 AI를 볼 수 있게, api, ApiError, call(), ChatTurn (+44 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (62): BM25, _contains_phrase(), detect_domain(), _domain_keywords(), _exact_match_diagnostic(), _exact_row_identity(), _exact_stack_identifier(), _file_signature() (+54 more)

### Community 3 - "Community 3"
Cohesion: 0.04
Nodes (7): TestBm25CoreBehavior, TestDiagnosticsContracts, TestDomainDetection, TestPersistence, TestReasoningMatch, TestSearchDomains, TestTokenizer

### Community 4 - "Community 4"
Cohesion: 0.09
Nodes (39): argv, assetQueries(), ASSETS_PATH, briefStop(), briefWords(), deal(), dealHero(), dealOptions() (+31 more)

### Community 5 - "Community 5"
Cohesion: 0.09
Nodes (28): 3105a1c 사진 첨부와 이야기 화면 별·노드 목록 분리를 master에 합침 (feature/chat-images), 912b60c 대화에 사진 첨부: 클립·Ctrl+V·끌어 놓기, 입력창 테두리가 사진까지 감싸며 늘어남, 달은 삭에서 천천히 차오름, d42c110 2단계 점검 수정 마무리: 이야기 AI 전처리·의미 파일 API·삭제 연쇄·테스트, addModelCall(), addNode(), atomicWriteStore(), doEnsureStore(), ensureStore() (+20 more)

### Community 6 - "Community 6"
Cohesion: 0.10
Nodes (41): _catalog_date(), _check_app_interface_contract(), _check_catalog_contract(), _check_catalog_summary(), _check_chart_contract(), _check_color_contract(), _check_core_data_contract(), _check_file() (+33 more)

### Community 7 - "Community 7"
Cohesion: 0.08
Nodes (24): 1a86f55 이야기 화면: 별·노드 목록을 그래프 아래 두 상자로 나눠 스크롤 분리, 눌러서 서로 포커스, StoryResult, MoonShape(), Body, COLORS, frac(), hash(), starHomeX() (+16 more)

### Community 8 - "Community 8"
Cohesion: 0.10
Nodes (28): SplitMethod, buildMeaningPrompt(), buildSplitPrompt(), MEANING_SCHEMA, SPLIT_SCHEMA, clip(), coversExactly(), GroupAnswer (+20 more)

### Community 9 - "Community 9"
Cohesion: 0.08
Nodes (12): metadata, 0051278 내 AI: 의미성으로 말이 잘 통하는 AI 만들기·비교·가져가기, 기록 관리, 마이크 입력, a439f1b 내 AI(의미성으로 말이 잘 통하는 AI)·기록 관리·마이크 입력을 master에 합침 (feature/personal-prompt), PRUNE_OPTIONS, ERRORS, Recognition, RecognitionCtor, removeSession() (+4 more)

### Community 10 - "Community 10"
Cohesion: 0.10
Nodes (7): read_rows(), split_values(), style_identities(), TestGeneratedCatalogContract, TestLandingAndStackContract, TestReasoningContract, TestStyleIdentityContract

### Community 11 - "Community 11"
Cohesion: 0.11
Nodes (22): ChatRequestBody, f7e69ef WIP: 2단계 점검 수정 중 — 모델 호출(헤더 키·대화 기록·JSON), 대화 API(기록·안전 규칙·길이 제한), 이야기 AI 전처리 모듈 (story 라우트·테스트 미완), POST(), turns(), EnvConfig, getEnv(), getLiveApiKey(), ModelPurpose (+14 more)

### Community 12 - "Community 12"
Cohesion: 0.11
Nodes (23): Relation, StyleGuess, WikiEntry, buildPrompt(), grams(), inferStyle(), isEmail(), isRelation() (+15 more)

### Community 13 - "Community 13"
Cohesion: 0.12
Nodes (13): axes(), bars(), diverging(), lane(), legendEl(), line(), matrix(), prepNotes() (+5 more)

### Community 14 - "Community 14"
Cohesion: 0.13
Nodes (17): 03c0b5c 달창·입력줄·정렬 개선을 master에 합침 (feature/moon-scroll-focus), 6584244 프론트+백엔드 통합 버전을 master에 합침, 798760d 대화 화면: 입력줄 위에 얹기, 빛줄기 구간 보정, 달이 삭으로 생겼다가 점등, 입력창 스크롤 스타일, 83d65f8 달창 스크롤 -> 대화: 거꾸로 마리오식 카메라, 포커스 스크롤 제거, 대화·달창 정렬 순서 통일, 999d571 달창을 굴리다 멈추면 가운데 달의 대화로 포커스, 선택 색을 연한 달빛으로, followCamera(), pushFocus(), View (+9 more)

### Community 15 - "Community 15"
Cohesion: 0.12
Nodes (13): 727411c 2단계 백엔드 API 및 이야기 쪼개기·검색·삭제 기능 구현, Insight, MemoryNode, ModelCall, PersonaProposal, PersonaVersion, RemModeId, RemRun (+5 more)

### Community 16 - "Community 16"
Cohesion: 0.19
Nodes (25): backend, master, 005cb15 인격 구조 설계 문서 추가 (docs/persona-architecture.md): 고정·조절·학습 3층, 항목별 승인, 제안 검증, 단계별 구현 순서, 04aae1f 2단계 백엔드 점검 결과 문서 추가 (docs/review-stage2.md), 0721415 백엔드 계획: 의미 파일은 이야기당 1개 이상(AI가 추출), 노드는 여러 의미에 속할 수 있음, 09b3ad4 인격 구조 설계 문서를 master에 합침 (docs/persona-architecture), 0eec077 백엔드 계획에 이야기 쪼개기·검색·삭제 API 추가, 17e1d44 달창: 마리오식 카메라(데드존)로 대화를 따라가기, 달 확대 제거, 대화 화면의 겹치던 안내 문구 제거, 열기·닫기 탭을 강조 색으로 (+17 more)

### Community 17 - "Community 17"
Cohesion: 0.11
Nodes (26): _button_outline_text_color(), _contrast_ratio(), _derive_dark_palette(), _detect_page_type(), format_master_md(), format_page_override_md(), _generate_intelligent_overrides(), _palette_is_dark() (+18 more)

### Community 18 - "Community 18"
Cohesion: 0.09
Nodes (18): app(), colourShare(), frame(), layout(), probe(), allow, appMode, args (+10 more)

### Community 19 - "Community 19"
Cohesion: 0.12
Nodes (22): argv, deal(), dealScreen(), dealShell(), dealStyle(), fontLink(), HERE, kebab() (+14 more)

### Community 20 - "Community 20"
Cohesion: 0.12
Nodes (7): 633063b UI UX Pro Max 스킬을 프로젝트에 포함 (다른 컴퓨터·모둠원도 바로 사용), b477b72 UI UX Pro Max, graphify 스킬 추가, format_output(), Format results for Claude consumption (token-optimized), read_rows(), TestTextLayoutDataContracts, TestTextLayoutRetrieval

### Community 21 - "Community 21"
Cohesion: 0.12
Nodes (15): metadata, Meteor, MIRROR_PROPS, PLUS_STAR, timeFmt, Attachment, blobToBase64(), canvasToBlob() (+7 more)

### Community 22 - "Community 22"
Cohesion: 0.15
Nodes (6): alive(), Browser, findChrome(), Page, sleep(), sweepProfiles()

### Community 23 - "Community 23"
Cohesion: 0.19
Nodes (5): read_rows(), TestAccessibilityGuidance, TestChartsTypographyAndIcons, TestCurrentReactGuidance, TestSemanticColors

### Community 24 - "Community 24"
Cohesion: 0.13
Nodes (8): 022d413 통합 마무리: 의미 파일 여러 개를 별 여러 개로, 대화할 때 달이 태어나는 연출, 테스트 격리, 9030495 프론트를 진짜 백엔드(/api)에 연결: 응답 모양 차이는 api.ts에서 맞추고, 가짜 API(api-mock) 삭제, /api/debug/reset-all 추가, DebugState, SessionSummary, LINKS, MODE_NAME, timeFmt, metadata

### Community 25 - "Community 25"
Cohesion: 0.16
Nodes (13): CheckedImage, checkImages(), decodeBase64(), extOf(), IMAGE_MIMES, ImageMime, ImagesCheck, IncomingImage (+5 more)

### Community 26 - "Community 26"
Cohesion: 0.16
Nodes (8): a1b56d5 프론트엔드(frontend/screens)를 백엔드 2단계 수정(backend/stage-2-fixes) 위에 합침, MoonProps, StorySample, columnAt(), WallLayout, metadata, AREAS, WALLS

### Community 27 - "Community 27"
Cohesion: 0.20
Nodes (6): DesignSystemGenerator, Generates design system recommendations from aggregated searches., Load reasoning rules from CSV., Find matching reasoning rule for a category., Apply reasoning rules to search results., Select best matching result based on priority keywords.

### Community 28 - "Community 28"
Cohesion: 0.34
Nodes (1): CatalogRefreshTest

### Community 29 - "Community 29"
Cohesion: 0.16
Nodes (2): _rows(), TestWebStackFreshness

### Community 30 - "Community 30"
Cohesion: 0.15
Nodes (14): ansi_ljust(), format_ascii_box(), format_markdown(), generate_design_system(), hex_to_ansi(), _mode_support_labels(), Light/dark support labels that agree with the product's anti-patterns.      A, Convert hex color to ANSI True Color swatch (██) with fallback. (+6 more)

### Community 31 - "Community 31"
Cohesion: 0.14
Nodes (12): APP_LEVEL, appMode, args, asJson, byId, EXT, files, findings (+4 more)

### Community 32 - "Community 32"
Cohesion: 0.17
Nodes (4): A narrow max_results must not hide the only matching row., read_rows(), RtlDataContractTest, RtlFilterTest

### Community 33 - "Community 33"
Cohesion: 0.29
Nodes (10): extractTopic(), heuristicSplit(), mergeSpansToCap(), PayloadTooLargeError, spansFromCutPoints(), splitStory(), SplitStoryOptions, SplitStoryResult (+2 more)

### Community 34 - "Community 34"
Cohesion: 0.24
Nodes (9): args, go(), only, outDir, problems, rel(), run(), sheet() (+1 more)

### Community 35 - "Community 35"
Cohesion: 0.22
Nodes (2): _rows(), TestNativeDesktopStackFreshness

### Community 36 - "Community 36"
Cohesion: 0.18
Nodes (2): read_rows(), TestStyleTaxonomy

### Community 37 - "Community 37"
Cohesion: 0.20
Nodes (3): 6165347 1단계: 데이터 모양 + 가짜 노드 20개로 전시 화면(/)과 디버그 화면(/debug), eslintConfig, nextConfig

### Community 38 - "Community 38"
Cohesion: 0.20
Nodes (7): _filter_anti_patterns_for_mode(), Drop "avoid dark mode" advice once dark mode is the resolved answer., Execute searches across multiple domains., Extract results list from search result dict., Generate complete design system recommendation.          variance/motion/densi, Bucket a 1-10 dial value into its tier config. Returns None if value is None., _resolve_dial()

### Community 39 - "Community 39"
Cohesion: 0.36
Nodes (5): esc(), mailContent(), mailStatus(), sendMail(), RELATIONS

### Community 40 - "Community 40"
Cohesion: 0.28
Nodes (8): APP_SKIP, colourFamily(), hexToHsl(), inRange(), judge(), judgeApp(), judgeLayout(), RULE_IDS

### Community 41 - "Community 41"
Cohesion: 0.25
Nodes (7): insights, nodes, pairs, personas, proposals, runs, store

### Community 42 - "Community 42"
Cohesion: 0.33
Nodes (5): apply_decision_rules(), parse_decision_rules(), Return deterministic mutations and an audit trail; never execute data., Parse the canonical condition -> action-array representation., _validate_action()

### Community 43 - "Community 43"
Cohesion: 0.29
Nodes (2): PNG, PNG_B64

### Community 44 - "Community 44"
Cohesion: 0.29
Nodes (2): The exact reproduction from issue #428., TestEndToEndCoherence

### Community 45 - "Community 45"
Cohesion: 0.29
Nodes (2): A light result that avoids dark mode must not also call dark "supported"., TestLightResultOutputCoherence

### Community 46 - "Community 46"
Cohesion: 0.29
Nodes (1): TestThresholdGate

### Community 47 - "Community 47"
Cohesion: 0.38
Nodes (5): Every script invocation in the shipped skill markdown resolves from the skill di, Return (target, None) for a skill-relative path, or (None, reason)., resolve(), shipped_invocations(), SkillScriptPathsTest

### Community 48 - "Community 48"
Cohesion: 0.33
Nodes (4): metadata, mono, sans, serif

### Community 49 - "Community 49"
Cohesion: 0.33
Nodes (6): _query_wants_dark(), True when a styles.csv row describes itself as dark-first., True when the query explicitly asks for a dark theme., Resolve the mode the rest of the output has to agree with., _resolve_color_mode(), _style_is_dark_primary()

### Community 50 - "Community 50"
Cohesion: 0.40
Nodes (3): CatalogSummaryLineEndingsTest, _load_generator(), Simulate a Windows checkout: the recorded hashes must still validate.

### Community 51 - "Community 51"
Cohesion: 0.33
Nodes (1): TestPaletteSelection

### Community 52 - "Community 52"
Cohesion: 0.40
Nodes (1): TestAntiPatternGating

### Community 53 - "Community 53"
Cohesion: 0.40
Nodes (1): TestLuminance

### Community 54 - "Community 54"
Cohesion: 0.40
Nodes (1): TestModeResolution

### Community 55 - "Community 55"
Cohesion: 0.70
Nodes (1): TestStackFlagWithDesignSystem

### Community 56 - "Community 56"
Cohesion: 0.40
Nodes (1): TestMetricMath

### Community 57 - "Community 57"
Cohesion: 0.70
Nodes (1): RtlCliTest

### Community 58 - "Community 58"
Cohesion: 0.67
Nodes (3): isInspectionScreenshot(), screenshotLabel(), viewportClass()

### Community 59 - "Community 59"
Cohesion: 0.83
Nodes (1): TestFixtureValidation

## Knowledge Gaps
- **242 isolated node(s):** `SELF`, `SOURCES`, `SOURCE_ALIAS`, `VIDEO_TYPES`, `LICENCES` (+237 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 28`** (1 nodes): `CatalogRefreshTest`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (2 nodes): `_rows()`, `TestWebStackFreshness`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (2 nodes): `_rows()`, `TestNativeDesktopStackFreshness`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (2 nodes): `read_rows()`, `TestStyleTaxonomy`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (2 nodes): `PNG`, `PNG_B64`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (2 nodes): `The exact reproduction from issue #428.`, `TestEndToEndCoherence`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (2 nodes): `A light result that avoids dark mode must not also call dark "supported".`, `TestLightResultOutputCoherence`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (1 nodes): `TestThresholdGate`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (1 nodes): `TestPaletteSelection`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (1 nodes): `TestAntiPatternGating`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (1 nodes): `TestLuminance`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (1 nodes): `TestModeResolution`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (1 nodes): `TestStackFlagWithDesignSystem`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (1 nodes): `TestMetricMath`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (1 nodes): `RtlCliTest`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 59`** (1 nodes): `TestFixtureValidation`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DesignSystemGenerator` connect `Community 27` to `Community 17`, `Community 38`, `Community 30`, `Community 3`, `Community 10`, `Community 44`, `Community 45`, `Community 52`, `Community 53`, `Community 54`, `Community 51`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Why does `CatalogRefreshTest` connect `Community 28` to `Community 20`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Why does `TestSearchDomains` connect `Community 3` to `Community 2`, `Community 27`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **What connects `SELF`, `SOURCES`, `SOURCE_ALIAS` to the rest of the system?**
  _242 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.058276333789329685 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.0578386605783866 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.061018437225636525 - nodes in this community are weakly interconnected._