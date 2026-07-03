# Harness & Loop 엔지니어링 설계

> 목적: 로그 초도 분석 AI의 각 노드 명세(Harness)와 노드 간 질의응답 루프(Loop) 설계

---

## 핵심 원칙

| 개념 | 정의 | 역할 |
|------|------|------|
| **Harness** | 노드의 지침서 | 각 노드가 무엇을 받아, 무엇을 하고, 무엇을 내보내는지 명세 |
| **Loop** | 노드 간 질의응답 | 여러 노드가 서로 결과를 주고받으며 정밀도를 높이는 과정 |

**루프 종료 조건**: 노드가 스스로 확신할 때 (`done: true`)  
**안전장치**: `MAX_ITERATIONS = 5` — 무한루프 방지 하드캡

### 아키텍처 계층

```
[MCP 계층 — 도구 연결]
  tms-mcp         → collection_agent, root_cause_analyzer 사용
  search_confluence, search_spec_docs → knowledge_retriever 사용

[A2A 계층 — 에이전트 협업]
  LangGraph State → 노드 간 정보 전달
  supervisor      → sub-agents 동적 라우팅
```

### 하네스 두께 결정

> "하네스 두께 = 모델을 얼마나 믿을지 vs 코드로 얼마나 통제할지"

| 결정 | 선택 | 이유 |
|------|------|------|
| supervisor 라우팅 | LLM 판단 (얇은 하네스) | 분기 경우의 수가 많아 코드로 통제 어려움 |
| loop 종료 | LLM 판단 (얇은 하네스) | confidence는 맥락 의존적 |
| tool 권한 | 코드 제어 (두꺼운 하네스) | 파괴적 명령 차단은 반드시 시스템으로 |
| progress_log 기록 | 코드 훅 (두꺼운 하네스) | 매번 일어나야 하므로 훅으로 강제 |

---

## 1. Harness: 노드 지침서

> 모든 노드는 State에서 읽고, State에 쓴다.  
> 각 노드는 분석 완료 여부를 `done` 필드로 표현한다.

---

### 1-1. Supervisor

| 항목 | 내용 |
|------|------|
| **역할** | 전체 분석 흐름 조율. 각 노드의 결과를 보고 다음 노드를 결정 |
| **읽는 State** | 모든 필드 (전체 맥락 파악) |
| **쓰는 State** | `next` (다음 노드 이름 또는 `FINISH`) |
| **Tool** | 없음 (LLM 판단만) |
| **확신 조건** | 해당 없음 — supervisor는 루프 조율자, 직접 분석하지 않음 |
| **라우팅 기준** | `confidence < 70` → 데이터 보완 요청 / `done: false` → 재시도 / `done: true` → 다음 단계 |

**프롬프트 핵심 지침**:
```
지금까지 진행 상황: {progress_log}

현재 분석 상태를 보고 다음 중 하나를 결정하라:
- "collection_agent"    : 로그/컨텍스트 데이터가 부족함
- "knowledge_retriever" : 유사 케이스 검색이 필요함
- "root_cause_analyzer" : 원인 분석 또는 재분석이 필요함
- "human_review"        : 신뢰도 부족, 사람 검토 필요
- "report_generator"    : 분석이 완료되어 리포트 생성 가능
- "FINISH"              : 리포트 생성 완료

반드시 위 단어 중 하나만 출력하라.
```

**progress_log 기록 방식** (각 노드가 완료 시 한 줄 추가):
```python
# collection_agent 완료 시
"[1] collection_agent 완료 — exit_code=13, test.log/stderr.log 수집"

# knowledge_retriever 완료 시
"[2] knowledge_retriever 완료 — Confluence 2건, 스펙문서 1건 발견"

# root_cause_analyzer 완료 시
"[3] root_cause_analyzer 완료 — confidence=45, missing_info=SSH 조회 필요"

# verdict_evaluator 완료 시
"[4] verdict_evaluator 완료 — eval_passed=false, 슬롯 근거 불충분"
```

---

### 1-2. Collection Agent

| 항목 | 내용 |
|------|------|
| **역할** | TC 관련 로그 파일, 환경 메타데이터 수집 |
| **읽는 State** | `tc_id`, `run_id`, `tester_id` |
| **쓰는 State** | `raw_logs`, `tester_context`, `done` |
| **Tool** | `get_ghost_exit_info`, `get_ghost_exception`, `get_ghost_log_errors`, `get_tester_general`, `get_tester_env` 등 (tms-mcp) — 전체 목록은 [ref-tms-mcp-design.md](ref-tms-mcp-design.md) §7.3, [02-design.md](02-design.md) §5 "Collection Agent" 참고 |
| **확신 조건** | 필수 로그(exit_code, test.log, stderr.log) 모두 수집 완료 시 `done: true` |
| **실패 처리** | 로그 미업로드 → N분 대기 후 재시도 (최대 3회) → 실패 시 `done: true` + `missing_logs` 기록 |

**확신 신호 출력 예시**:
```python
{
  "raw_logs": { "exit_code": 13, "test_log": "...", "stderr_log": "..." },
  "tester_context": { "tester_type": "SANBLAZE", "fw_version": "1.2.3" },
  "done": True   # 필수 파일 모두 수집 완료
}
```

---

### 1-3. Knowledge Retriever

| 항목 | 내용 |
|------|------|
| **역할** | 여러 소스를 **병렬 조회**하여 (자체 축적) 유사 케이스 + (외부) Confluence·스펙 문서를 수집 |
| **읽는 State** | `exit_code`, `raw_logs`, `error_category` (있으면) |
| **쓰는 State** | `similar_cases`, `done` |
| **Tool** | 내부 지식베이스: `search_by_keyword`(exit_code+exception_type), `search_by_vector`(error_text 임베딩) — [02-design.md](02-design.md) §3 "검색 방식: Hybrid" <br> 외부: `search_confluence` (Confluence API), `search_spec_docs` (NVMe 스펙 Vector DB) |
| **확신 조건** | 내부+외부 소스 모두 조회 완료 시 `done: true` (결과 없어도 완료 처리) |
| **출력** | 소스별 결과 병합 목록 (없으면 빈 배열) |

> "경험 재활용"(신규 Fail 분석 시 기존 축적 지식을 컨텍스트로 주입, [CLAUDE.md](../CLAUDE.md) 핵심 설계 원칙)의 실제 구현이 내부 지식베이스 검색이다. Confluence/스펙 문서는 보조 근거이지 자가학습의 핵심이 아니므로, 내부 검색이 먼저이고 외부 검색은 보강 용도.

**병렬 조회 구조**:
```
knowledge_retriever
  ├── search_by_keyword(exit_code, exception_type)   → 내부 error-catalog/cases 1차 필터
  ├── search_by_vector(error_text)                    → 내부 error-catalog/cases 의미 기반 탐색
  ├── search_confluence(exit_code, keywords)          → 과거 Fail 분석 케이스(외부 위키)
  └── search_spec_docs(exit_code, keywords)           → NVMe/PCIe 스펙 문서
          ↓ asyncio.gather() 로 동시 실행
  결과 합산 → similar_cases
```

**출력 예시**:
```python
{
  "similar_cases": [
    { "source": "internal_case", "title": "TC-1098 동일 exit_code=13", "content": "..." },
    { "source": "confluence", "title": "PCIe Link Down 분석", "content": "..." },
    { "source": "confluence", "title": "exit_code=13 재현 케이스", "content": "..." },
    { "source": "spec_docs",  "title": "NVMe 1.4 Spec §8.1", "content": "..." },
  ],
  "done": True
}
```

---

### 1-4. Root Cause Analyzer ← Loop의 핵심 노드

| 항목 | 내용 |
|------|------|
| **역할** | 로그 + 유사 케이스 기반으로 실패 원인 분석. 필요하면 SSH로 추가 데이터 조회 |
| **읽는 State** | `raw_logs`, `tester_context`, `similar_cases` |
| **쓰는 State** | `verdict`, `confidence`, `root_cause`, `evidence`, `done` |
| **Tool** | `get_pcie_link_status`, `get_nvme_smart_log`, `get_dmesg_at_failure`, `get_nvme_error_log`, `grep_ghost_log` 등 (SSH 기반, [ref-tms-mcp-design.md](ref-tms-mcp-design.md) §7.3) — Triage 단계별 노출 범위는 §8 참고 |
| **확신 조건** | LLM이 스스로 `confidence >= 70` 이라고 판단할 때 `done: true` |
| **불확신 처리** | `confidence < 70` → `done: false` + `missing_info` 명시 → supervisor가 재루프 결정 |
| **내부 루프** | ReAct 패턴 — Tool 조회 → 결과 반영 → 재추론 (최대 10회) |

**확신 신호 출력 예시**:
```python
# 확신하는 경우
{
  "verdict": "INVALID_FAIL",
  "root_cause": "SanBlaze Slot 3 PCIe 링크 불안정",
  "confidence": 85,
  "evidence": ["exit_code=13", "PCIe link speed downgraded at line 2341"],
  "done": True
}

# 불확신하는 경우
{
  "verdict": "UNKNOWN",
  "confidence": 45,
  "missing_info": "PCIe 링크 상태 직접 조회 필요 — SSH 접근 실패",
  "done": False
}
```

---

### 1-5. Verdict Evaluator ← Evaluator-Optimizer 패턴

| 항목 | 내용 |
|------|------|
| **역할** | `root_cause_analyzer`의 분석 결과를 **독립적으로 검증**. 근거가 충분한지, 논리적 비약은 없는지 평가 |
| **읽는 State** | `verdict`, `root_cause`, `confidence`, `evidence`, `raw_logs` |
| **쓰는 State** | `eval_passed`, `eval_feedback` |
| **Tool** | 없음 (LLM 판단만) |
| **확신 조건** | 항상 `done: true` — 단, `eval_passed` 값으로 다음 분기 결정 |
| **통과 기준** | evidence가 verdict를 실제로 뒷받침하는지, 누락된 설명은 없는지 |

**출력 예시**:
```python
# 검증 통과
{
  "eval_passed": True,
  "eval_feedback": None
}

# 검증 실패
{
  "eval_passed": False,
  "eval_feedback": "PCIe link down 로그가 있지만 슬롯 번호 특정 근거가 없음. Slot 3이라고 단정한 이유를 명시해야 함."
}
```

**supervisor 라우팅 변화**:
```
root_cause_analyzer (done=true)
  → verdict_evaluator
    → eval_passed=true  → report_generator
    → eval_passed=false → root_cause_analyzer (eval_feedback 주입해서 재분석)
```

---

### 1-6. Human-in-the-Loop ← 마지막은 사람이 확인

| 항목 | 내용 |
|------|------|
| **역할** | 불확실한 분석 결과를 엔지니어에게 전달, 승인 또는 피드백 수령 |
| **읽는 State** | `verdict`, `root_cause`, `confidence`, `evidence`, `eval_feedback` |
| **쓰는 State** | `human_approved`, `human_feedback` |
| **Tool** | `notify_engineer` (Slack/이메일 알림) |
| **트리거 조건** | `verdict == "UNKNOWN"` 또는 `confidence < 70` |
| **구현** | LangGraph `interrupt()` — 그래프 일시 정지 후 사람 응답 대기 |

**흐름**:
```
verdict_evaluator (eval_passed=true)
  → supervisor 판단:
    - confidence >= 70 AND verdict != "UNKNOWN" → report_generator (자동)
    - confidence < 70  OR  verdict == "UNKNOWN" → human_review (사람 개입)

human_review
  → 엔지니어에게 분석 결과 + 불확실 이유 알림
  → 엔지니어 응답 대기 (interrupt)
    - "승인"       → report_generator
    - "피드백 제공" → root_cause_analyzer (피드백 주입 후 재분석)
```

**알림 메시지 예시**:
```
[TMS 분석 검토 요청]
TC-1234 | exit_code=13
판정: UNKNOWN (confidence=52)
이유: PCIe 링크 로그 있으나 슬롯 특정 불가

→ 승인 또는 피드백을 입력해주세요.
```

---

### 1-7. Report Generator

| 항목 | 내용 |
|------|------|
| **역할** | 분석 결과를 엔지니어가 읽을 수 있는 리포트로 변환 |
| **읽는 State** | `verdict`, `root_cause`, `confidence`, `evidence` |
| **쓰는 State** | `report`, `done` |
| **Tool** | 없음 |
| **확신 조건** | 리포트 생성 완료 시 항상 `done: true` |

---

### 1-8. Knowledge Updater

| 항목 | 내용 |
|------|------|
| **역할** | 이번 분석 결과를 지식 베이스에 저장 |
| **읽는 State** | `tc_id`, `verdict`, `root_cause`, `confidence`, `evidence` |
| **쓰는 State** | `knowledge_updated` |
| **Tool** | `write_knowledge_case`, `update_error_catalog` |
| **확신 조건** | 저장 완료 시 `done: true` |

---

### 1-9. Knowledge Curator ← 메모리 정리(드림 통합) 패턴

> `analysis_graph`가 아니라 `miner_graph` 소속 (TC 발생 시가 아니라 주기적으로 실행).

| 항목 | 내용 |
|------|------|
| **역할** | 누적된 지식 베이스(`error-catalog.md`, `cases/`, `taxonomy.md`)를 정기 점검해 중복·모순·낡은 항목을 정리 |
| **트리거 조건** | 케이스 N건(예: 50건) 누적 또는 주 1회 스케줄 |
| **읽는 데이터** | `error-catalog.md` 전체, `cases/index.md` |
| **쓰는 데이터** | 정리된 `error-catalog.md`, 병합/보관 처리된 케이스 목록 |
| **Tool** | `read_error_catalog`, `write_error_catalog`, `list_cases` |
| **판단 로직** | ① 중복 — 동일 `exit_code` + `exception_type` + `root_cause` 패턴 → 항목 병합, 발생 빈도만 합산 <br> ② 모순 — 동일 신호에 `verdict`가 다른 케이스 2건 이상 → 자동 정리하지 않고 `human_review`로 플래그만 남김 <br> ③ 노후화 — 마지막 발생일이 N개월 이상 지났고 원인이 "FW 버그(수정 완료)"인 항목 → `archived: true` 표시 |
| **안전장치** | "잊기"가 아니라 "정돈"이 목적 — 삭제 대신 `archived` 플래그만 세우고 원본 케이스 파일은 `cases/`에 그대로 보존 |
| **사람 개입** | 모순 발견 시에만 에스컬레이션. 병합·보관은 자동 처리 |

**Pattern Miner / Taxonomy Evolver와의 관계** (둘 다 [01-planning.md](01-planning.md) §3.3 고급 노드): Curator는 "정리"(중복 병합·모순 플래그·노후 보관), Miner는 "발굴"(신규 패턴 클러스터링), Evolver는 "재분류"(카테고리 신설/병합) — 역할이 다르다. Curator가 먼저 정리해야 Miner가 노이즈 없는 데이터에서 패턴을 찾는다.

```
miner_graph (주기 실행)
  → Knowledge Curator  (중복/모순/노후 정리)
  → Pattern Miner      (신규 패턴 발굴)
  → Taxonomy Evolver   (분류 체계 개편 제안)
```

---

### 1-10. Self-Reviewer ← 자가 검토, `reviewer_graph` 소속

> `analysis_graph`도 `miner_graph`도 아닌 **세 번째 그래프** ([ref-langgraph-patterns.md](ref-langgraph-patterns.md) §"여러 Graph 운영 구조" 참고). `miner_graph`가 지식베이스 전체를 정기 정비하는 반면, `reviewer_graph`는 사람이 뒤집은 판정 하나를 계기로 즉시 실행된다.

| 항목 | 내용 |
|------|------|
| **역할** | 엔지니어가 과거 분석 결과를 뒤집었을 때(수동 보정) 그 케이스를 재검토하고, 같은 실수가 반복되지 않도록 피드백을 반영 |
| **트리거 조건** | 엔지니어의 수동 보정 발생 시(이벤트 기반) 또는 주기적(저신뢰 케이스 일괄 재검토) |
| **읽는 데이터** | 뒤집힌 케이스의 `cases/{tc_id}.md`, 해당 케이스의 `verdict`/`root_cause`/`evidence`, 사람이 남긴 정정 사유 |
| **쓰는 데이터** | 갱신된 `cases/{tc_id}.md`, (필요 시) `error-catalog.md`의 해당 항목 정정 |
| **Tool** | `read_case`, `write_case`, `update_error_catalog` |
| **판단 로직** | ① 사람이 뒤집은 케이스를 재분석해 원래 근거의 어느 지점에서 판단이 갈렸는지 기록 <br> ② 동일 오류 패턴이 `error-catalog.md`에 이미 있으면 판정 기준 자체를 정정 <br> ③ 개별 케이스의 우연한 오판이면 해당 케이스만 정정, 카탈로그는 유지 |
| **출력** | 분석 프롬프트 개선 제안(사람이 검토 후 반영, 자동 적용 아님) |

**02-design.md와의 관계**: [02-design.md](02-design.md) "피드백 루프"·"자가 검증 루프" 절에서 "Self-Reviewer Node"·"Self-Verifier Node"로 언급되던 개념이 이 노드다 (이름은 Self-Reviewer로 통일). "자가 검증 루프"(가상환경 재현 테스트)는 v2 이후 별도 구현이며 이 노드의 범위 밖.

> **미정 항목**: [02-design.md](02-design.md) "지식 시드 에이전트" 절의 초기 지식베이스 구축 에이전트는 이 문서에 아직 Harness 스펙이 없다. `analysis_graph`/`miner_graph`/`reviewer_graph` 중 어디에도 속하지 않는 별도의 1회성 `seed_graph`로 보이나, 노드 I/O·State는 미정 — 구현 착수 전 결정 필요.

---

## 2. Loop: 노드 간 질의응답 설계

### 루프 구조

```
[분석 루프]                              [검증 루프]
supervisor
  → root_cause_analyzer (분석)
    → done: false (불확신)
  → supervisor (재평가)                  root_cause_analyzer (done=true)
    → collection_agent (데이터 보완)       → verdict_evaluator
    → root_cause_analyzer (재분석)          → eval_passed=false
  → root_cause_analyzer (재분석)              → root_cause_analyzer (피드백 재분석)
    → done: true (확신)                   → eval_passed=true
  → verdict_evaluator                      → report_generator
```

### 루프 시나리오

#### 시나리오 A — 1회 분석 + 검증 통과
```
supervisor
  → collection_agent    [로그 수집 완료]
  → knowledge_retriever [유사 케이스 3건 발견]
  → root_cause_analyzer [confidence=85, done=true]
  → verdict_evaluator   [eval_passed=true]
  → report_generator
  → FINISH
```

#### 시나리오 B — 데이터 부족으로 재루프
```
supervisor
  → collection_agent    [로그 수집 완료]
  → knowledge_retriever [유사 케이스 없음]
  → root_cause_analyzer [confidence=45, done=false]
  → supervisor          [재평가 → SSH 조회 지시]
  → root_cause_analyzer [SSH 직접 조회 후 confidence=80, done=true]
  → verdict_evaluator   [eval_passed=true]
  → report_generator
  → FINISH
```

#### 시나리오 C — 검증 실패로 재분석
```
supervisor
  → root_cause_analyzer [confidence=75, done=true]
  → verdict_evaluator   [eval_passed=false, eval_feedback="슬롯 번호 근거 없음"]
  → supervisor          [재분석 지시 + eval_feedback 주입]
  → root_cause_analyzer [피드백 반영해 재분석, confidence=88, done=true]
  → verdict_evaluator   [eval_passed=true]
  → report_generator
  → FINISH
```

#### 시나리오 D — MAX_ITERATIONS 도달 (안전장치)
```
supervisor
  → root_cause_analyzer [done=false] × 5회
  → 강제 종료
  → report_generator [verdict="UNKNOWN"]
  → FINISH
```

---

## 3. State 설계

```python
from langgraph.graph import StateGraph, END
from typing import TypedDict, Optional

class AnalysisState(TypedDict):
    # 입력
    tc_id:          str
    run_id:         str
    tester_id:      int

    # 수집
    raw_logs:       dict         # exit_code, test_log, stderr_log 등
    tester_context: dict         # TesterType, FW버전, PCIe Gen 등
    missing_logs:   list[str]    # 수집 실패한 파일 목록

    # 분석
    similar_cases:  list[dict]   # 유사 케이스 목록
    verdict:        str          # VALID_FAIL | INVALID_FAIL | UNKNOWN
    root_cause:     str
    confidence:     int          # 0~100
    evidence:       list[str]
    missing_info:   str          # 불확신 시 부족한 정보 명시

    # 검증 (verdict_evaluator)
    eval_passed:    bool         # 검증 통과 여부
    eval_feedback:  str          # 실패 시 재분석 지침

    # 사람 검토 (human_review)
    human_approved:  bool        # 엔지니어 승인 여부
    human_feedback:  str         # 엔지니어 피드백 (재분석 시)

    # 출력
    report:         dict
    knowledge_updated: bool

    # 루프 제어
    next:           str          # supervisor가 결정하는 다음 노드
    iterations:     int          # 루프 횟수 (MAX_ITERATIONS 체크용)
    progress_log:   list[str]    # 각 노드 완료 시 한 줄 기록 (supervisor 맥락 유지용)
                                 # 최대 10개 유지 — 초과 시 앞 5개를 1줄 요약으로 압축
                                 # 예: ["[요약: 수집완료·유사케이스없음·1차분석 confidence=45]", "[4] ...", ...]
```

---

## 4. MAX_ITERATIONS 안전장치

```python
MAX_ITERATIONS = 5

def supervisor(state: AnalysisState) -> dict:
    if state["iterations"] >= MAX_ITERATIONS:
        return { "next": "report_generator" }  # 강제 종료
    
    # 정상 라우팅 로직
    ...
    return { "next": next_node, "iterations": state["iterations"] + 1 }
```

---

## 5. 전체 흐름 요약

```
TC Fail 감지 (Harness Polling)
        ↓
  graph.invoke() 시작
        ↓
  supervisor ──────────────────────────────┐
        ↓                                  │
  collection_agent (로그 수집)              │
        ↓                                  │ Loop
  knowledge_retriever (유사 케이스)         │ (done=false 시
        ↓                                  │  supervisor 재평가)
  root_cause_analyzer (원인 분석) ──────────┘
        ↓ done=true
  verdict_evaluator (독립 검증) ────────────┐
        ↓ eval_passed=true                  │ 검증 루프
  supervisor 판단                           │ (eval_passed=false 시
    ├─ confidence >= 70 → report_generator  │  root_cause_analyzer 재분석)
    └─ confidence < 70  → human_review ─────┘
        ↓ (interrupt — 사람 응답 대기)
        ├─ 승인      → report_generator
        └─ 피드백    → root_cause_analyzer (재분석)
        ↓
  report_generator
        ↓
  knowledge_updater
        ↓
  FINISH → 리포트 전달
```

---

## 6. Tool 권한 분류

> "파괴적 명령 차단은 반드시 시스템으로" — 두꺼운 하네스 적용 영역

`root_cause_analyzer`가 SSH로 테스터 서버에 직접 접근하므로 명령별 권한을 코드로 강제한다. [ref-tms-mcp-design.md](ref-tms-mcp-design.md) §7.3의 "단일 목적 도구 설계" 원칙에 따라 범용 `ssh_exec`이 아니라 명령마다 전용 Tool로 감싼다.

| Tool / 명령 카테고리 | 명령 예시 | 위험도 | 정책 |
|------|-----------|--------|------|
| `get_pcie_link_status`, `get_nvme_smart_log`, `get_dmesg_at_failure`, `get_nvme_error_log` 등 (현재 정의된 SSH Tool 전체) | `lspci`, `nvme smart-log`, `dmesg`, `cat`, `grep`, `journalctl` | 읽기 전용 | **ALLOW** — 자동 실행 |
| *(미정의 — 향후 필요 시 추가)* | `modprobe`, `rmmod`, `systemctl restart` | 상태 변경 | **ASK** — human_review로 전달 |
| *(미정의 — 향후 필요 시 추가)* | `rm`, `reboot`, 서비스 중지 | 파괴적 | **DENY** — 코드에서 차단 |

> 현재 [ref-tms-mcp-design.md](ref-tms-mcp-design.md) §7.3에 정의된 SSH Tool은 전부 읽기 전용(ALLOW)이다. ASK/DENY 행은 앞으로 상태 변경/파괴적 Tool이 추가될 경우를 대비한 정책이며, 아직 대응하는 실제 Tool은 없다.

**구현 원칙**:
- ALLOW 명령 → root_cause_analyzer가 자동 실행
- ASK 명령 → `missing_info`에 "ASK 필요: {명령}" 기록 후 supervisor → human_review
- DENY 명령 → LLM이 요청해도 Tool 레벨에서 실행 거부, 에러 반환

---

## 7. 수명 주기 훅

> "매번 일어나야 하는 일은 지침이 아니라 훅에 있어야 한다"

LangGraph의 `add_node` 래퍼로 각 노드를 감싸 이벤트 발생 시 자동 실행한다.

| 이벤트 | 자동 실행 |
|--------|-----------|
| 그래프 시작 | State 초기화 (`iterations=0`, `progress_log=[]`) |
| 모든 노드 완료 후 | `progress_log`에 완료 요약 한 줄 자동 추가 |
| `iterations >= MAX_ITERATIONS` | 강제 종료 + "MAX_ITERATIONS 도달" 로그 기록 |
| `human_review` 진입 | 엔지니어 Slack 알림 자동 발송 |
| 그래프 정상 종료 | `knowledge_updater` 자동 트리거 |

**구현 스케치**:
```python
def node_wrapper(node_fn, node_name):
    async def wrapped(state: AnalysisState) -> dict:
        result = await node_fn(state)
        # 훅: 완료 후 progress_log 자동 기록
        log_entry = f"[{len(state['progress_log'])+1}] {node_name} 완료"
        # progress_log 압축: 10개 초과 시 앞 5개 요약
        logs = state["progress_log"] + [log_entry]
        if len(logs) > 10:
            summary = f"[요약: {', '.join(logs[:5])}]"
            logs = [summary] + logs[5:]
        return {**result, "progress_log": logs}
    return wrapped
```

---

## 8. 점진적 도구 확장 (Tool 노출 전략)

**문제**: `collection_agent`와 `root_cause_analyzer`에 tms-mcp 전체 도구(다수 — 정확한 개수는 [ref-tms-mcp-design.md](ref-tms-mcp-design.md) §7 참고. 02-design.md §5에서 제안된 신규 Tool은 아직 §7에 반영 전이라 최종 개수 미확정)를 한 번에 `bind_tools()`로 노출하면, 모델이 도구 선택 단계에서부터 혼란을 겪는다. 특히 이름이 비슷한 도구(`get_ghost_log_errors` vs `grep_ghost_log`)에서 실수가 늘어난다.

**해결**: [ref-tms-mcp-design.md](ref-tms-mcp-design.md) §6 실패 분석 워크플로의 단계(Triage → 카테고리별 심층 진단)에 맞춰 노출 범위를 단계적으로 넓힌다. 카테고리가 정해지기 전엔 소수의 Triage 도구만, 카테고리가 확정된 이후에만 해당 카테고리 전용 도구를 추가로 연다.

| 단계 | 노출 도구 | 개수 |
|------|---------|------|
| [1단계] 실패 유형 파악 | `get_ghost_exit_info` | 1개 |
| [3단계] Triage | `get_ghost_exception`, `get_ghost_log_errors`, `get_nvme_error_log`, `query_sqlite_tc_failure_history`, `query_sqlite_tester_recent_fails`, `get_tms_agent_log_at_failure` | 6개 |
| [4단계] 카테고리별 심층 진단 | Triage에서 확정된 카테고리(Device / Script / tms-agent / Ghost-core / Environment) 1개의 전용 도구 세트만 추가 | 카테고리당 3~5개 |

**구현**: `root_cause_analyzer`는 `state["suspected_category"]`가 비어 있으면 Triage 도구 세트로만 `bind_tools()`하고, 카테고리가 확정되면 해당 카테고리 도구를 추가해 재바인딩한다. 즉 같은 노드 안에서도 ReAct 루프 진행 단계에 따라 tool 목록이 달라진다.

```python
TRIAGE_TOOLS = [get_ghost_exception, get_ghost_log_errors, get_nvme_error_log,
                query_sqlite_tc_failure_history, query_sqlite_tester_recent_fails,
                get_tms_agent_log_at_failure]

CATEGORY_TOOLS = {
    "Device":    [get_dmesg_at_failure, get_pcie_link_status, get_nvme_smart_log,
                  query_sqlite_device_failure_rate],
    "Script":    [get_ghost_log_around, get_ghost_loaded_plugins, get_ghost_command_log,
                  get_tester_repo_history],
    "tms-agent": [get_ghost_unexpected_errors, get_tester_system_status, get_tms_agent_error_log],
    "Ghost-core":[get_ghost_stderr_log, get_tester_env, get_tester_repo_history],
    "Environment":[get_tester_resource_usage, get_dmesg_at_failure, get_journal_at_failure,
                   get_chamber_events, get_ghost_initial_env],
}

def root_cause_analyzer(state: AnalysisState) -> dict:
    category = state.get("suspected_category")
    tools = TRIAGE_TOOLS if not category else TRIAGE_TOOLS + CATEGORY_TOOLS[category]
    llm_with_tools = llm.bind_tools(tools)
    ...
```

**주의점**: 너무 늦게 열어 주면 에이전트가 잘못된 카테고리에 갇혀 불필요한 재시도를 반복할 수 있다. [ref-tms-mcp-design.md](ref-tms-mcp-design.md) §6 [3단계]의 "확증이 없으면 1순위 카테고리 심층 진단 후 불일치 시 2순위로 이동" 규칙을 그대로 따르되, 신호가 특히 애매하면(예: 상위 두 카테고리 점수 차이가 작음) 두 카테고리 도구를 동시에 열어주는 것도 허용한다.
