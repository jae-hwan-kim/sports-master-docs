# tms-log-analyze 설계 문서

> 작성일: 2026-07-01
> 목적: 로그 초도 분석 AI 기획 과정에서 도출된 결정사항 및 설계 기록

---

## 1단계: 문제 정의

### 페인 포인트

- **대상**: 검증 엔지니어 (Qual 담당, 매주 수십 건의 Run 완료 처리)
- **상황**: Run에서 Fail TC 발생 시 — 특히 초도 실패 (처음 보는 에러)
- **문제**:
  - 로그 파일(수천 줄)을 직접 열어 분석해야 함
  - 환경 정보(TesterType, FW 버전, Ghost 버전)를 별도로 확인해야 함
  - 이전 동일 에러 경험이 기록되지 않아 매번 처음부터 분석
  - 분석 결과 문서화 누락 잦음

### 현재 프로세스 비용

| 항목 | 현재 |
|------|------|
| 케이스당 분석 시간 | 30분~수 시간 |
| 지식 재활용 | 거의 없음 (개인 기억 의존) |
| 동일 실패 재분석 | 매번 처음부터 |
| 문서화 | 누락 잦음 |

### 성공 기준

1. 엔지니어가 로그를 열지 않아도 된다
2. 분석 결과에 근거(어떤 로그, 어떤 패턴)가 명시된다
3. 동일 에러 2번째 분석은 1번째보다 빠르고 정확하다
4. 사용자 피드백 또는 자가 검증으로 분석 정확도가 점진적으로 향상된다

### 분석 범위

**v1 포함**
- Ghost 로그 기반 Fail TC 분석
- TC 단위 분석
- 텍스트 리포트 출력

**v2 이후**
- SMART 이상 징후 자동 감지
- PMU 전력 이상 분석
- Run 단위 전체 패턴 분석
- 리포트 전달 채널 (Slack 등) — 노드 추가로 확장

---

## 2단계: 입출력 명세

### Input

#### 트리거 이벤트
```
TC 상태가 FAIL로 전환될 때
  payload: { tc_id, run_id, tester_id, slot_id }
```

- TC가 Fail 되는 즉시 분석 시작 (Run 완료 대기 X)
- 여러 TC가 동시에 Fail되면 병렬 분석

#### 로그 파일 (per TC)

| 파일 | 필수 | 활용 |
|------|------|------|
| `exit_code` | 필수 | 1차 분류 키 |
| `exit_type` | 필수 | 종료 원인 |
| `test.log` | 필수 | 이벤트 시퀀스, 타임라인 |
| `stderr.log` | 필수 | 에러 메시지, traceback |
| `exception` | 선택 | 예외 상세 구조 |
| `command_log.log` | 선택 | NVMe 명령 실패 지점 |

#### 컨텍스트 메타데이터

```
TesterType        (S2 / S8 / OAKGATE / SANBLAZE / PC)
slot_id, phy_no
NVMe 모델, FW 버전, PCIe Gen/Width
Ghost Core 버전, Rack Tools 버전
Ghost 실행 파라미터 (script, plugins, config)
Run 시작 시각, TC 실행 시간
```

#### 데이터 소스 및 접근 방식

| Input | 출처 | 접근 방식 |
|-------|------|---------|
| Fail TC 이벤트 | tms-api | polling (MVP) → webhook (이후) |
| 로그 파일 | S3 | tms-api `TestCaseLog.presigned_url` → HTTP GET |
| TesterType, 슬롯 정보 | tms-api | `GET /tester/{id}`, `GET /slot/{id}` |
| NVMe 모델/FW 버전 | tms-api | `GET /device/{id}` |
| Ghost 버전, 실행 파라미터 | tms-api | `GET /run/{id}/detail` |

### Output

#### 분석 리포트 (구조화)

```python
{
  "tc_id": "TC-1234",
  "verdict": "INVALID_FAIL",          # VALID_FAIL | INVALID_FAIL | UNKNOWN
  "root_cause": "SanBlaze Slot 3 PCIe 링크 불안정",
  "confidence": 87,                   # 0~100 (내부 참고용)
  "evidence": [
    "exit_code=13 (FailedWhileCreateDeviceInstance)",
    "test.log line 2341: PCIe link speed downgraded",
    "최근 7일 동일 슬롯 3회 동일 패턴"
  ],
  "suggested_action": "해당 슬롯 물리 점검",
  "error_category": "HARDWARE.NVME_LINK_DOWN",
  "analysis_id": "uuid",
  "analyzed_at": "2026-07-01T09:00:00Z"
}
```

#### 지식 베이스 업데이트

```
/knowledge/cases/2026-07/{tc_id}.md   개별 케이스 기록
/knowledge/error-catalog.md           패턴 빈도/신뢰도 갱신
```

### Edge Case

| 상황 | 처리 방식 |
|------|---------|
| 로그 파일 미업로드 | N분 대기 후 재시도, 실패 시 `UNKNOWN` + 사유 기록 |
| 로그 파싱 실패 | Retry Loop — 다른 파싱 전략 시도 |
| 완전히 새로운 에러 패턴 | `UNKNOWN` 판정 + knowledge에 미분류로 저장 |
| 동일 슬롯 다수 TC 동시 Fail | TC별 독립 병렬 분석 |
| 사용자 피드백 수신 | Self-Reviewer 트리거 → 재분석 + 지식 보완 |

---

## 트리거 아키텍처

### 결정: Harness + Trigger Node 분리 구조

```
[Harness - LangGraph 외부, 상시 실행]
  polling loop: tms-api에서 새 Fail TC 감지
      ↓ 감지 시
  graph.invoke({ tc_id, run_id })

[Trigger Node - LangGraph 내부, 일회성, ❌ AI 아님]
  tms-mcp 호출:
  - get_recent_fail_events(since)       → 새 Fail TC 감지
  - list_run_test_cases(run_id, FAIL)   → Fail TC 목록 확정
  → tc_id/run_id를 State에 적재 → Collection Agent로 전달
```

**핵심 분리 원칙**:
- Harness: "언제 그래프를 실행할지" 결정 (상시 실행)
- Trigger Node: "Fail TC가 있는지" 감지만 함 (판단 없음, 일회성)
- Collection Agent: "무엇을 가져올지" 스스로 결정 (✅ AI, ReAct — §5 "Collection Agent" 참고)

### MVP → 이후 트리거 전환 계획

| 단계 | 방식 | 비고 |
|------|------|------|
| MVP | Polling | tms-api 수정 불필요, 구현 빠름 |
| v2 | Webhook | 실시간성 확보, tms-api webhook 엔드포인트 추가 필요 |

---

## 정확도 향상 전략

신뢰도 % 기준선 없이, 다음 두 가지 루프로 정확도를 점진적으로 향상:

### 피드백 루프
```
사용자 피드백 → Self-Reviewer Node 트리거
  → 해당 케이스 재분석
  → 지식 베이스 보완
  → 다음 분석 정확도 향상
```
> Self-Reviewer 노드 스펙: [03-harness-spec.md](03-harness-spec.md) §1-10 (`reviewer_graph` 소속)

### 자가 검증 루프 (하네스 + 루프 엔지니어링)
```
에러 케이스 재현 가능 여부 판단
  → 가상환경에서 동일 조건 재테스트
  → 재현 성공 → 원인 확정 (VALID_FAIL 신뢰도 상승)
  → 재현 실패 → 환경 문제 가능성 상승 (INVALID_FAIL)
```

> 가상환경 재테스트는 v2 이후 구현. 아키텍처에 이 역할(Self-Reviewer Node, [03-harness-spec.md](03-harness-spec.md) §1-10)의 확장 자리를 미리 확보.

---

## 3단계: 지식 베이스 설계

### 폴더 구조

```
/knowledge/
├── error-catalog.md          # 에러 유형 카탈로그 (핵심 레퍼런스)
├── taxonomy.md               # 에러 분류 체계
├── patterns/
│   ├── hardware-patterns.md
│   ├── firmware-patterns.md
│   └── env-patterns.md
└── cases/
    ├── index.md              # 케이스 인덱스 (검색용)
    └── 2026-07/
        └── {tc_id}-{date}.md
```

### error-catalog.md 스키마

```markdown
## HARDWARE.NVME_LINK_DOWN
- Exit Code: 13
- GhostExceptionType: FailedWhileCreateDeviceInstance
- 발생 환경: SanBlaze, OakGate
- TesterType 제한: 없음 (전 환경 발생)
- 선행 신호: PCIe 링크 속도 다운그레이드, CSTS.CFS=1
- 확인 방법: test.log에서 "link speed" 키워드, exit_code=13
- 판정: INVALID_FAIL
- 권장 조치: 슬롯 물리 점검, PCIe 케이블 확인
- 발생 빈도: 47회
- 관련 케이스: [TC-1234](cases/2026-07/TC-1234.md)
- 마지막 업데이트: 2026-07-01
```

### cases/{tc_id}.md 스키마

```markdown
## TC-1234 분석 결과
- 날짜: 2026-07-01
- Run ID: RUN-567
- TesterType: SANBLAZE
- NVMe: Model-X, FW v1.2.3
- Ghost: v2.1.0

**판정**: INVALID_FAIL
**원인**: Slot 3 PCIe 링크 불안정
**근거**:
  - exit_code=13
  - test.log line 2341: link speed downgraded
**조치**: 슬롯 점검
**에러 카탈로그**: HARDWARE.NVME_LINK_DOWN
```

### 검색 방식: Hybrid

| 방식 | 적용 상황 |
|------|---------|
| 키워드 검색 (exit_code, exception_type) | 1차 필터 — 정확한 매칭 |
| 벡터 임베딩 (pgvector) | 2차 — 의미 기반 유사 케이스 탐색 |

임베딩 인프라는 tms-pdf-converter와 공유 (Gemini text-embedding-004, pgvector).

### 갱신 방식: 케이스별 즉시 갱신

- Knowledge Updater Node가 분석 직후 즉시 MD 파일 갱신
- Pattern Miner Node (v2)가 주기적으로 정제

---

## 지식 시드 에이전트

초기 지식 베이스를 자동 구축하는 별도 에이전트. tms-mcp의 Atlassian 도구(Confluence + Jira) 활용.

### 범위 설정 구조

사람이 탐색 범위를 초기 1회 지정 → AI가 범위 내에서 자율 선별 + 정제 → 이후 주기적 증분 수집.

```yaml
# seed-config.yaml
confluence:
  spaces:
    - key: "QUAL"        # Qual 팀 스페이스
    - key: "FWTEST"      # FW 테스트 스페이스
  labels:
    - "nvme-fail"
    - "ghost-error"

jira:
  projects:
    - key: "QA"
    - key: "FW"
  issue_types:
    - "Bug"
    - "Incident"
  labels:
    - "nvme-fail"
    - "tester-issue"
```

### 역할 분리

| 주체 | 역할 |
|------|------|
| 사람 | 스페이스/프로젝트/라벨 범위 초기 지정 (1회) |
| AI 에이전트 | 범위 내 페이지/이슈 순회 → 관련성 판단 → error-catalog 항목으로 정제 |

### 출력

```
/knowledge/error-catalog.md   에러 카탈로그 초기 시드
/knowledge/taxonomy.md        분류 체계 초안
```

---

## 4단계: 워크플로우 설계

### 노드 목록 및 AI Agent 여부

| 노드 | AI Agent | 이유 |
|------|---------|------|
| Trigger | ❌ | tms-api polling + 이벤트 전달만. 판단 없음 |
| Collection Agent | ✅ | 뭘 수집할지 스스로 추론. ReAct 패턴 |
| Knowledge Retriever | ❌ | exit_code + exception_type으로 검색 실행만 |
| Root Cause Analyzer | ✅ | 핵심 추론. 원인 판정, 근거 도출. ReAct 패턴 |
| Classifier | ❌ → △ | 초기 규칙 기반. 분류 체계 복잡해지면 AI 전환 |
| Report Generator | ✅ | 구조화된 결과 → 자연어 리포트 생성 |
| Knowledge Updater | ✅ | 새 패턴 여부 판단 + MD 갱신 내용 생성 |
| Supervisor | ✅ | 매 단계 다음 노드 및 모델 결정 (구조 ③에만 존재) |

---

### 후보 구조 3가지

#### 구조 ①: 고정 순서 + 병렬

```
Trigger
  ↓
  ┌─────────────────────────┐
  Collection Agent (❌)    Knowledge Retriever (❌)    ← 병렬
  └─────────────────────────┘
  ↓
Root Cause Analyzer (✅ ReAct)
  ↓
Classifier (❌)
  ↓
  ┌─────────────────────────┐
  Report Generator (✅)    Knowledge Updater (✅)      ← 병렬
  └─────────────────────────┘
```

- 흐름이 코드로 고정
- AI는 Root Cause Analyzer에만 집중
- 빠르고 예측 가능, 인간 개입 필요 (수집 항목 사전 정의)

---

#### 구조 ②: 고정 흐름 + 내부 ReAct

```
Trigger (❌)
  ↓
Collection Agent (✅ ReAct)   ← 뭘 수집할지 스스로 결정
  ↓
Knowledge Retriever (❌)
  ↓
Root Cause Analyzer (✅ ReAct)
  ↓
Classifier (❌)
  ↓
Report Generator (✅)
  ↓
Knowledge Updater (✅)
```

- 흐름은 고정, 각 노드 내부가 동적
- 수집 항목을 AI가 결정 → 인간 개입 감소
- 구조 ①보다 유연, 구조 ③보다 예측 가능

---

#### 구조 ③: Supervisor 패턴

```
         [Supervisor (✅)]
              ↕ 매 단계 지시 + 보고
  ┌───────────────────────────────┐
  Collection Agent (✅)           │
  Knowledge Retriever (❌)        │
  Root Cause Analyzer (✅)        │  ← Supervisor가 동적으로 호출
  Classifier (❌)                 │
  Report Generator (✅)           │
  Knowledge Updater (✅)          │
  └───────────────────────────────┘
```

- 흐름 자체가 동적. Supervisor가 매 단계 다음 노드 + 모델(Opus/Sonnet) 결정
- 불필요한 노드 건너뜀 가능 (잘 알려진 패턴은 빠른 처리)
- 인간 개입 최소화에 가장 적합
- Supervisor LLM 호출 추가로 비용/속도 증가

---

### 모델 라우팅 전략 (공통)

| 노드 | 모델 |
|------|------|
| Supervisor | Sonnet |
| Collection Agent | Sonnet |
| Root Cause Analyzer | Opus (복잡) / Sonnet (유사 케이스 있음) |
| Report Generator | Haiku |
| Knowledge Updater | Sonnet |

> 케이스가 쌓일수록 유사 케이스 히트율 증가 → Opus 호출 빈도 자연 감소

---

## 5단계: Tool 명세

### Classifier 역할

Root Cause Analyzer가 "왜 실패했는지" 알아내면, Classifier는 "우리 분류 체계에서 어디에 속하는지" 태그를 부여.

```
Root Cause Analyzer 출력:
  verdict    = INVALID_FAIL
  root_cause = "SanBlaze Slot 3 PCIe 링크 불안정"

Classifier 출력:
  error_category = HARDWARE.NVME_LINK_DOWN
  error_tags     = [PCIE, LINK_DOWN, SANBLAZE]
```

이 태그가 있어야 Knowledge Updater가 카탈로그 어디를 갱신할지 알고, 통계/패턴 발굴도 가능해짐.

---

### tms-mcp 기존 Tool 현황

| 카테고리 | 주요 Tool | 상태 |
|---------|---------|------|
| Ghost 로그 | `get_ghost_exit_info`, `get_ghost_exception`, `get_ghost_log_errors`, `get_ghost_log_at_failure`, `get_ghost_command_log`, `get_ghost_stderr_log`, `get_ghost_config`, `get_ghost_loaded_plugins`, `get_ghost_initial_env` 외 다수 | ✅ |
| 시스템 진단 | `get_dmesg_at_failure`, `get_pcie_link_status`, `get_nvme_error_log`, `get_tms_agent_log_at_failure` | ✅ |
| NVMe | `get_nvme_smart_log`, `get_nvme_detail`, `get_nvme_history`, `get_nvme_telemetry_and_parse` | ✅ |
| Tester | `get_tester_general`, `get_tester_env`, `get_tester_repo_history` | ✅ |
| Run | `list_runs`, `get_run_detail`, `get_run_tc_log`, `get_run_configuration` | ✅ |
| Atlassian | `search_jira_issues`, `search_confluence`, `get_confluence_page` | ✅ |

---

### tms-mcp 추가 제안

| 제안 Tool | 필요 이유 | 우선순위 |
|---------|---------|---------|
| `list_run_test_cases(run_id, status?)` | Trigger Node 핵심. Run의 Fail TC 목록 조회. 현재 run.ts에 없음 | 🔴 필수 |
| `get_recent_fail_events(since?)` | Harness polling용. 특정 시각 이후 새 Fail TC 감지 | 🔴 필수 |
| `get_slot_fail_history(slot_id, days?)` | 슬롯 반복 실패 패턴 감지. Collection Agent 활용 | 🟡 중요 |
| `get_nvme_smart_live(tester_id, device)` | 실시간 SMART 조회. 현재 TMS DB 저장본만 있음 | 🟡 중요 |

> `list_run_test_cases`와 `get_recent_fail_events`는 Trigger Node 동작의 전제조건.

---

### 노드별 Tool 매핑

#### Trigger (❌)
```
tms-mcp:
  - get_recent_fail_events(since)       → 새 Fail TC 감지 [신규]
  - list_run_test_cases(run_id, FAIL)   → Fail TC 목록 [신규]
```

#### Collection Agent (✅ ReAct)
```
tms-mcp:
  - get_ghost_exit_info(tester_id, log_path)
  - get_ghost_exception(tester_id, log_path)
  - get_ghost_log_errors(tester_id, log_path, finished_at)
  - get_ghost_log_at_failure(tester_id, log_path, finished_at)
  - get_ghost_command_log(tester_id, log_path)
  - get_ghost_stderr_log(tester_id, log_path)
  - get_ghost_config(tester_id, log_path)
  - get_ghost_loaded_plugins(tester_id, log_path)
  - get_ghost_initial_env(tester_id, log_path)
  - get_ghost_target_info(tester_id, log_path)
  - get_tester_general(tester_id)
  - get_tester_env(tester_id)
  - get_tester_repo_history(tester_id)
  - get_nvme_detail(id)
  - get_nvme_history(nvme_id)
  - get_slot_fail_history(slot_id, days)   [신규]
```

#### Knowledge Retriever (❌)
```
직접 구현 (내부 지식베이스 — §3 "검색 방식: Hybrid"):
  - search_by_keyword(exit_code, exception_type)
  - search_by_vector(error_text)

tms-mcp (외부 소스, 병렬 조회):
  - search_confluence(exit_code, keywords)
  - search_spec_docs(exit_code, keywords)
```
> 4개 소스 병렬 조회 구조 상세: [03-harness-spec.md](03-harness-spec.md) §1-3

#### Root Cause Analyzer (✅ ReAct)
```
tms-mcp:
  - get_nvme_smart_log(slot_id)
  - get_nvme_smart_live(tester_id, device)   [신규]
  - get_pcie_link_status(tester_id, bdf)
  - get_nvme_error_log(tester_id, device)
  - get_dmesg_at_failure(tester_id, finished_at)
  - get_nvme_telemetry_and_parse(tester_id, device, tc_id)
  - grep_ghost_log(tester_id, log_path, pattern)
  - get_ghost_log_around(tester_id, log_path, line)

직접 구현:
  - lookup_nvme_spec(query)          → embedded_spec pgvector 검색
  - compare_similar_case(case_id)    → 특정 케이스 상세 조회
```

#### Classifier (❌)
```
직접 구현:
  - get_taxonomy()                                          → taxonomy.md 읽기
  - map_to_category(exit_code, exception_type, verdict)    → 분류 매핑
```

#### Report Generator (✅)
```
직접 구현:
  - save_report_md(tc_id, report)   → cases/{date}/{tc_id}.md 저장
```

#### Knowledge Updater (✅)
```
직접 구현:
  - read_error_catalog()
  - write_error_catalog(updated)
  - append_case_index(tc_id)
```

#### Supervisor (✅, 구조 ③만)
```
Tool 없음. State만 읽고 다음 노드 + 모델 결정.
```

---

## 하네스 패턴 적용 현황

> 참고: [03-harness-spec.md](03-harness-spec.md)

| 패턴 | 우리 설계에서 | 적용 위치 |
|------|-------------|-----------|
| 영구 지침 파일 | ✅ | `CLAUDE.md` |
| 범위별 문맥 조립 | ✅ | 각 노드가 State 일부 필드만 읽음 |
| 계층형 메모리 | ✅ | State(단기) + knowledge base MD(장기) |
| 탐색-계획-실행 루프 | ✅ | `root_cause_analyzer` ReAct 패턴 |
| 포크-조인 병렬성 | ✅ | `knowledge_retriever` 병렬 조회 |
| 문맥 격리 하위 에이전트 | ✅ | 노드별 독립 State 읽기/쓰기 |
| 명령 위험 분류 | ✅ | SSH Tool ALLOW/ASK/DENY 분류 |
| 수명 주기 훅 | ✅ | `node_wrapper` — 완료 시 progress_log 자동 기록 |
| 점진적 문맥 압축 | ✅ | `progress_log` 10개 초과 시 앞 5개 요약 |
| MCP 계층 | ✅ | tms-mcp → 도구 연결 |
| A2A 계층 | ✅ | LangGraph State → 노드 간 협업 |
| 단일 목적 도구 설계 | ✅ | `get_pcie_link_status`, `get_nvme_smart_log` 등 전용 Tool |
| Human-in-the-loop | ✅ | `human_review` 노드 + LangGraph `interrupt()` |
| 메모리 정리(드림 통합) | ✅ | `Knowledge Curator` 노드(`miner_graph`, 주기 실행) — 중복 병합/모순 플래그/노후 archive |
| 점진적 도구 확장 | ✅ | `root_cause_analyzer`가 Triage 단계 6개 → 카테고리 확정 후 전용 도구 추가 바인딩 |
