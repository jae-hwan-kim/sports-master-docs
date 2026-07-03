# Fail 로그 자율 분석 AI — 기획 문서

> 작성일: 2026-06-25  
> 작성자: (AI 보조 기획)  
> 대상 독자: 개발팀 전원

---

## 1. 왜 만드는가 (Why)

### 현재 상황

NVMe SSD 검증 테스트(Run)를 돌리면 수십~수백 개의 TC(Test Case) 중 일부가 Fail로 끝난다. 엔지니어는 Fail 원인을 파악하기 위해 다음 과정을 **매번 수작업**으로 반복한다.

```
1. tms-web에서 Fail TC 목록 확인
2. 로그 파일 경로 찾기 (S3 or 로컬)
3. test.log, stderr.log, command_log.log 열기
4. 에러 메시지 파악 (어떤 예외? 어느 줄?)
5. 환경 정보 확인 (어떤 테스터? 어떤 슬롯? NVMe 펌웨어 버전?)
6. 유사 사례 기억 떠올리기 or 동료에게 물어보기
7. 원인 판정 및 문서 작성
```

이 과정은 **30분~수 시간**이 소요되며, 동일한 원인의 Fail이 반복되어도 경험이 팀 내에 체계적으로 공유되지 않는다.

### 기존 접근의 한계

유사 기능이 구현된 사례가 있으나:

- 로그 수집, 분석 트리거를 사람이 수동으로 호출해야 함
- 분석 결과가 DB에만 저장되고 **축적 지식으로 연결되지 않음**
- 새로운 에러 패턴이 나와도 시스템이 스스로 학습하지 못함

### 우리가 만들 것

> **"Run이 끝나면 AI가 자동으로 Fail 로그를 분석하고, 분석할수록 점점 더 잘하게 되는 시스템"**

---

## 2. 무엇을 만드는가 (What)

### 핵심 기능 3가지

#### ① 자율 분석 (Autonomous Analysis)

- Run 완료 이벤트를 감지하면 자동으로 Fail TC 수집
- 로그 파일(test.log, stderr.log, command_log 등)을 AI가 직접 파싱
- 테스터 환경(TesterType, 슬롯, NVMe 펌웨어, Ghost 버전 등) 자동 수집
- 분석 결과를 **구조화된 리포트**로 사용자에게 전달

#### ② 자가 학습 (Self-Learning)

- 분석이 완료될 때마다 결과를 **MD 파일**에 기록
- 에러 패턴, 원인 분류, 해결 힌트를 누적
- 다음 분석 시 기존 지식 베이스를 컨텍스트로 주입

#### ③ 자가 진화 (Self-Evolution)

- 케이스가 쌓이면 **분류 체계 자동 정교화** (새 카테고리 생성, 기존 카테고리 병합)
- 분석 프로세스 자체를 주기적으로 리뷰하고 개선
- 반복 패턴 감지 시 **분석 템플릿 자동 생성**

---

## 3. 어떻게 만드는가 (How) — LangGraph 아키텍처

### 3.1 핵심 설계 철학

LangGraph는 **상태(State)를 공유하는 노드들의 그래프**다. 각 노드는 독립적인 역할을 가지며, 엣지(조건부/일반)로 연결된다. 이 구조가 우리 문제에 딱 맞는 이유:

- **역할 분리**: 로그 파싱, 환경 분석, 원인 추론, 지식 저장을 각각 독립 노드로 분리 → 교체/개선 용이
- **상태 공유**: 모든 노드가 같은 State를 읽고 쓰므로 중간 결과가 자연스럽게 다음 노드로 전달
- **조건부 흐름**: 에러 타입에 따라 분기, 추가 조사가 필요하면 루프, 신뢰도 낮으면 재시도
- **비동기 병렬**: 독립적인 분석 작업(로그 파싱 + 환경 수집)을 동시에 실행

### 3.2 LangGraph 패턴 채택 현황

각 패턴의 정의·언제 쓰나·코드는 → [ref-langgraph-patterns.md](ref-langgraph-patterns.md) "LangGraph 패턴 6가지" 참고. 여기서는 우리가 실제 뭘 썼는지만 정리한다.

| 패턴                  | 채택 | 최종 위치                                                                           |
| --------------------- | ---- | ----------------------------------------------------------------------------------- |
| Supervisor            | ✅   | 전체 그래프 조율 구조 (MVP부터 메인 아키텍처, [02-design.md](02-design.md) 구조③)   |
| ReAct                 | ✅   | Root Cause Analyzer ([03-harness-spec.md](03-harness-spec.md) §1-4)                 |
| Parallel (Map-Reduce) | ✅   | Knowledge Retriever 4소스 병렬 조회 ([03-harness-spec.md](03-harness-spec.md) §1-3) |
| Human-in-the-Loop     | ✅   | 저신뢰 케이스 사람 검토 ([03-harness-spec.md](03-harness-spec.md) §1-6)             |
| Sequential            | ❌   | Supervisor 구조 사용                                                                |
| Multi-Agent Network   | ❌   | 미채택 — 여러 전문가 에이전트 토론 구조는 아이디어 단계                             |

---

### 3.3 노드 설계 — 어떤 역할이 필요한가

#### 핵심 노드 (MVP 필수)

```
┌─────────────────────────────────────────────────────────────────┐
│                         LangGraph State                         │
│  run_id, tc_id, tester_info, log_files, parsed_logs,           │
│  env_context, similar_cases, analysis_result, report, ...      │
└─────────────────────────────────────────────────────────────────┘
         ↑ 모든 노드가 읽고 씀
```

**① Trigger Node (트리거)**

- 역할: Run 완료 이벤트 수신 → Fail TC 목록 추출 → 분석 시작
- 입력: `run_id`
- 출력: `tc_list` (Fail 상태인 TC ID 목록)
- 연동: tms-api `GET /run/{run_id}/test-cases?status=FAIL`
- 왜 필요: 인간 개입 제거의 핵심. 이 노드가 자동화되면 이후는 완전 자율.

**② Context Collector Node (컨텍스트 수집)**

- 역할: 분석에 필요한 모든 메타데이터를 병렬로 수집
- 수집 항목:
  - 테스터 정보 (TesterType, Ghost 버전, Rack Tools 버전)
  - 슬롯 정보 (NVMe 모델, 펌웨어, PCIe Gen/Width)
  - PMU 상태 이력
  - Ghost 실행 파라미터 (스크립트명, config, plugins)
  - Run 실행 시간대
- 왜 필요: 동일한 스크립트 실패라도 SanBlaze vs OakGate, Gen4 vs Gen5 NVMe에 따라 원인이 전혀 다를 수 있음.

**③ Log Parser Node (로그 파서)**

- 역할: 원시 로그 파일을 구조화된 데이터로 변환
- 파싱 대상:
  - `test.log` — 타임스탬프별 이벤트 시퀀스
  - `stderr.log` — 예외/에러 메시지
  - `command_log.log` — 실행된 NVMe 명령 및 결과
  - `exit_code`, `exit_type` — 종료 원인
  - `exception` JSON — Ghost 예외 구조
- 출력: `{ error_window: [...], exception_type, failed_command, exit_code }`
- 왜 필요: 수천 줄 로그에서 AI가 직접 원인을 찾기 전에 핵심 구간만 추출해야 LLM 토큰 효율이 올라감.

**④ Knowledge Retriever Node (지식 검색)**

- 역할: 기존 분석 경험 DB에서 유사 케이스 검색
- 검색 기준: exception_type, exit_code, error 키워드, 테스터 유형
- 검색 소스:
  - MD 기반 에러 카탈로그 (`/knowledge/error-catalog.md`)
  - 분석 이력 파일 (`/knowledge/cases/`)
  - NVMe 스펙 임베딩 (`embedded_spec` — tms-pdf-converter 결과)
- 출력: `similar_cases[]`, `known_patterns[]`, `relevant_spec_sections[]`
- 왜 필요: 경험이 쌓일수록 분석 정확도가 올라가는 "학습 효과"의 핵심.

**⑤ Root Cause Analyzer Node (원인 분석, 핵심)**

- 역할: 수집된 모든 컨텍스트를 종합해 Fail 원인 추론
- LLM 역할: ReAct 패턴으로 필요 시 추가 도구 호출
  - `lookup_nvme_spec(section)` — NVMe 스펙 조회
  - `get_smart_log(tc_id)` — SMART 데이터 조회
  - `compare_with_similar(case_id)` — 유사 케이스 비교
- 판정 구조:
  ```
  {
    label: VALID_FAIL | INVALID_FAIL | ENVIRONMENT_FAIL | UNKNOWN,
    root_cause: "string",
    confidence: 0~100,
    evidence: ["로그 line 123: ...", "exit_code=1"],
    suggested_action: "string"
  }
  ```
- 왜 필요: 이 노드가 시스템의 두뇌. 판정 품질이 전체 가치를 결정.

**⑥ Classifier Node (에러 분류)**

- 역할: 분석 결과를 기존 에러 분류 체계와 대조, 분류 태그 부여
- 분류 체계 예시 (초기):
  ```
  HARDWARE: {NVME_LINK_DOWN, PMU_POWER_FAIL, SLOT_UNSTABLE}
  FIRMWARE: {FW_BUG, FW_VERSION_MISMATCH}
  TEST_ENV: {GHOST_VERSION_MISMATCH, RACK_TOOLS_ERROR, PLUGIN_CONFLICT}
  SCRIPT: {TEST_SCRIPT_BUG, CONFIG_ERROR, TIMEOUT}
  UNKNOWN: {}
  ```
- 출력: `error_category`, `error_tags[]`
- 왜 필요: 분류가 있어야 통계 집계, 패턴 발견, 자가 진화가 가능.

**⑦ Report Generator Node (리포트 생성)**

- 역할: 분석 결과를 사람이 읽기 좋은 형식으로 변환
- 출력 채널:
  - tms-web UI에 인라인 표시
  - Slack/이메일 알림 (선택)
  - MD 파일 저장 (`/knowledge/cases/{date}/{tc_id}.md`)
- 리포트 구조:
  ```markdown
  ## TC-1234 Fail 분석 결과

  **판정**: INVALID_FAIL (환경 문제)
  **신뢰도**: 87%
  **원인**: SanBlaze Slot 3 PCIe 링크 불안정
  **근거**:

  - exit_code=13 (FailedWhileCreateDeviceInstance)
  - 최근 7일간 동일 슬롯에서 3회 동일 패턴
    **권장 조치**: 해당 슬롯 하드웨어 점검
  ```

**⑧ Knowledge Updater Node (지식 업데이트)**

- 역할: 분석 결과를 지식 베이스에 저장 + 기존 지식 갱신
- 저장 항목:
  - 개별 케이스 파일 (`/knowledge/cases/`)
  - 에러 카탈로그 업데이트 (`/knowledge/error-catalog.md`)
  - 분류 체계 업데이트 (`/knowledge/taxonomy.md`)
- 판단 로직:
  - 신규 패턴 감지 → 새 항목 추가
  - 기존 패턴과 유사 → 해당 항목의 빈도/신뢰도 갱신
  - 분류 체계에 없는 태그 → 임시 태그로 기록 후 진화 노드에 위임
- 왜 필요: 이 노드 없이는 "경험 축적"이 없음. 자가 학습의 핵심.

#### 고급 노드 (v2 이후)

**⑨ Knowledge Curator Node (메모리 정리 · 드림 통합)**

- 역할: 지식 베이스(`error-catalog.md`, `cases/`)를 정기 점검해 중복·모순·낡은 항목을 정리
- 트리거: 케이스 N건 누적 or 주 1회 스케줄 — Pattern Miner보다 먼저 실행
- 하는 일:
  - 동일 exit_code+exception_type+root_cause 패턴 중복 → 항목 병합, 빈도만 합산
  - 동일 신호에 verdict가 다른 모순 케이스 발견 → 사람 검토로 플래그 (자동 정리 안 함)
  - 원인이 이미 해결된(FW 패치 등) 노후 항목 → `archived: true` (삭제 아님)
- 왜 필요: Pattern Miner가 노이즈 없는 데이터에서 패턴을 찾으려면 먼저 정리가 필요함. 상세: [03-harness-spec.md](03-harness-spec.md) §1-9

**⑩ Pattern Miner Node (패턴 발굴)**

- 역할: 주기적으로 축적된 케이스를 분석해 새로운 패턴 발견
- 트리거: 케이스 100건 누적 or 주 1회 스케줄
- 하는 일:
  - 동일 에러 카테고리 클러스터링
  - 공통 선행 조건 추출 ("Gen5 NVMe + SanBlaze에서만 발생")
  - 새 분류 제안 (기존 UNKNOWN → 새 카테고리)
- 출력: `/knowledge/patterns/discovered-{date}.md`
- 왜 필요: 사람이 인식 못하는 숨은 패턴을 AI가 발견.

**⑪ Taxonomy Evolver Node (분류 체계 진화)**

- 역할: 패턴 발굴 결과를 바탕으로 에러 분류 체계를 자동 정교화
- 하는 일:
  - 신규 카테고리 생성 제안 → (선택적) 사람 승인
  - 유사 카테고리 병합
  - 분류 정확도 통계 업데이트
- 왜 필요: 분류 체계가 고정이면 새로운 종류의 에러에 취약.

**⑫ Self-Reviewer Node (자가 검토)**

- 역할: 이전 분석 결과를 재검토하고 정확도 피드백
- 트리거: 엔지니어의 수동 보정 발생 시 or 주기적
- 하는 일:
  - 사람이 판정을 뒤집은 케이스 학습
  - 낮은 신뢰도 케이스 재분석
  - 분석 프롬프트 개선 제안
- 왜 필요: 잘못된 분석이 지식 베이스에 쌓이면 오히려 역효과. 자정 능력 필요.

---

### 3.4 전체 그래프 흐름 (MVP)

```
[Run 완료 이벤트]
      ↓
① Trigger Node
  - Fail TC 목록 추출
      ↓
  ┌───┴──────────────────┐
② Context Collector    ③ Log Parser
  (병렬 실행)
  └───┬──────────────────┘
      ↓
④ Knowledge Retriever
  - 유사 케이스 검색
  - 에러 카탈로그 조회
      ↓
⑤ Root Cause Analyzer   ← ReAct 루프 (필요 시 추가 조회)
  - 원인 추론
  - 판정 및 신뢰도 산출
      ↓
⑥ Classifier Node
  - 에러 태그 부여
      ↓
  ┌───┴──────────────────┐
⑦ Report Generator    ⑧ Knowledge Updater
  (병렬 실행)
  └───┬──────────────────┘
      ↓
[사용자 리포트 전달 + 지식 베이스 갱신]
```

---

## 4. 지식 베이스 설계 — MD 파일 구조

자가 학습의 핵심은 **MD 파일로 구성된 지식 베이스**다.

```
/knowledge/
├── error-catalog.md          # 에러 유형 카탈로그 (메인 레퍼런스)
├── taxonomy.md               # 에러 분류 체계 (자동 진화)
├── analysis-process.md       # 분석 프로세스 정형화 문서 (자동 갱신)
├── patterns/
│   ├── hardware-patterns.md  # 하드웨어 에러 패턴
│   ├── firmware-patterns.md  # 펌웨어 에러 패턴
│   ├── env-patterns.md       # 환경 에러 패턴
│   └── discovered-{date}.md  # 패턴 발굴 결과
└── cases/
    ├── 2026-06/
    │   ├── {tc_id}-{date}.md # 개별 케이스 분석 파일
    │   └── ...
    └── index.md              # 케이스 인덱스 (검색용)
```

### error-catalog.md 예시 구조

```markdown
# Error Catalog

## HARDWARE.NVME_LINK_DOWN

- **Exit Code**: 13
- **GhostExceptionType**: FailedWhileCreateDeviceInstance
- **발생 환경**: SanBlaze, OakGate 모두
- **선행 신호**: PCIe 링크 속도 다운그레이드, CSTS.CFS=1
- **판정**: INVALID_FAIL (테스트 환경 불안정)
- **권장 조치**: 해당 슬롯 물리 점검, PCIe 케이블 확인
- **발생 빈도**: 47회 (2025-01 ~ 2026-06)
- **마지막 업데이트**: 2026-06-20

## FIRMWARE.FW_VERSION_MISMATCH

...
```

---

## 5. 기술 스택 선택

| 구성 요소          | 선택                      | 이유                                       |
| ------------------ | ------------------------- | ------------------------------------------ |
| **오케스트레이션** | LangGraph (Python)        | State 공유 + 조건부 엣지 + 루프 지원 최적  |
| **LLM**            | Claude (Anthropic)        | 긴 로그 분석 + structured output 안정성    |
| **임베딩**         | Gemini text-embedding-004 | tms-pdf-converter와 동일 모델 (재사용)     |
| **벡터 DB**        | pgvector (PostgreSQL)     | 기존 인프라 공유                           |
| **지식 베이스**    | MD 파일 + Git             | 사람도 읽고 AI도 읽는 단일 소스, 버전 관리 |
| **로그 소스**      | tms-api REST + S3         | 기존 인프라 그대로 활용                    |

---

## 6. 개발 단계 제안

### Phase 1 — MVP (2~3주)

- Trigger Node + Log Parser + Root Cause Analyzer + Report Generator
- 수동 트리거 허용 (완전 자율화 전 검증 단계)
- 지식 베이스 스키마 확정

### Phase 2 — 자가 학습 (2~3주)

- Knowledge Retriever + Knowledge Updater 추가
- 에러 카탈로그 초기 시드 데이터 구축
- 유사 케이스 검색 정확도 튜닝

### Phase 3 — 자율 트리거 + 분류 (2주)

- Trigger Node를 tms-api webhook/polling으로 연결
- Classifier Node + taxonomy.md 자동 갱신

### Phase 4 — 자가 진화 (지속)

- Knowledge Curator + Pattern Miner + Taxonomy Evolver + Self-Reviewer
- 신뢰도 지표 대시보드

---

## 7. 아이디에이션 포인트 (팀 토론용)

다음 질문들을 가지고 팀 내 논의를 시작하면 좋다.

1. **지식 베이스 포맷**: MD 파일 vs 구조화 DB — 사람이 직접 편집 가능한 MD가 나은가, 정확한 쿼리가 가능한 DB가 나은가? 또는 둘 다?

2. **신뢰도 기준선**: 몇 % 미만이면 사람에게 넘길까? 그리고 사람의 피드백을 어떻게 다시 학습에 반영할까?

3. **분석 단위**: TC 단위로 분석할까, Run 단위(전체 Fail 패턴)로 볼까? Run 단위 분석이 더 많은 맥락을 제공하지 않을까?

4. **에러 분류 초기 시드**: 우리 팀이 지금까지 경험한 주요 Fail 패턴을 정리해서 초기 카탈로그를 함께 만들면 어떨까?

5. **Slack 연동**: 분석 결과를 Slack 채널로 자동 발송하면 가시성이 높아질 텐데, 어떤 형식이 좋을까?

6. **Self-Reviewer의 기준**: AI가 자신의 이전 분석을 "틀렸다"고 판정하는 기준을 어떻게 설계할까?

7. **Ghost 로그 외 확장**: 지금은 Ghost 로그에 집중하지만, 나중에 NVMe SMART 이상 징후, PMU 전력 이상 등도 분석 대상에 포함할 수 있을까?

---

## 8. 한 줄 요약

> "Fail TC 로그를 받아 → 자율적으로 원인을 분석하고 → 경험을 쌓아 → 점점 더 잘하게 되는 AI. 엔지니어는 결과만 본다."
