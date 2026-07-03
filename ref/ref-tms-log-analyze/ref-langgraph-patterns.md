# LangGraph 구현 패턴

> tms-log-analyze가 실제로 채택한 LangGraph 구현 패턴의 코드 예제 모음(Python/TypeScript).
> 이 문서는 "어떻게 코드로 짜는지"만 다룬다 — "왜 이 패턴을 골랐는지"는 각 절의 "우리 프로젝트에서" 항목에서 02/03 문서로 링크된다.
> 멀티에이전트 개념 자체나 왜 LangGraph를 프레임워크로 골랐는지는 → [ref-multi-agent-orchestration.md](ref-multi-agent-orchestration.md) 참고.

---

> LangGraph는 **Python**과 **TypeScript** 모두 지원한다.
>
> - Python: `langgraph` + `langchain-anthropic`
> - TypeScript: `@langchain/langgraph` + `@langchain/anthropic`
>
> tms-log-analyze는 Python을 사용할 예정.

---

## LangGraph 패턴 6가지

LangGraph로 짤 수 있는 흐름 유형 6가지. 하단의 "Supervisor 패턴"/"ReAct 패턴"/"Checkpointer 패턴"의 코드는 구현에 채택된 패턴이기에 내용을 추가했다.

> **주의**: 이 6개는 "같은 종류"가 아니다. 실제로 코드에 반영되는 층위가 서로 다르니, 구현할 때 헷갈리지 않도록 구분해서 본다.

| 층위                           | 뜻                                                            | 해당 패턴                                             | 코드로는                                          |
| ------------------------------ | ------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------- |
| 노드 간 상호작용 (그래프 구조) | "다음에 누가 실행되는가"를 정하는 edge 설계                   | Sequential, Parallel, Supervisor, Multi-Agent Network | `add_node` / `add_edge` / `add_conditional_edges` |
| 노드 내부 동작                 | 노드 함수 하나 "안에서" 일어나는 일 — 그래프는 이 존재를 모름 | ReAct                                                 | 노드 함수 안의 `for` 루프 (별도 노드·엣지 불필요) |
| 그래프 실행 제어               | 노드도 엣지도 아니고, 그래프 실행 자체를 멈췄다 재개하는 것   | Human-in-the-Loop                                     | `interrupt()` + Checkpointer                      |

즉 "Supervisor 패턴을 쓴다"와 "ReAct 패턴을 쓴다"는 그래프에 반영되는 방식이 전혀 다르다 — 전자는 노드/엣지를 추가하는 일이고, 후자는 이미 있는 노드 함수의 내부 구현을 그렇게 짜는 일이다.

#### 패턴 A: Sequential (순서 고정 파이프라인)

```
트리거 → 로그 수집 → 파싱 → 원인 추론 → 지식 저장 → 리포트
```

- **언제**: 분석 단계가 명확히 순서가 있을 때
- **우리 적용**: 초기 MVP — 단순하고 예측 가능한 흐름 (이후 Supervisor 구조로 대체)

#### 패턴 B: Parallel (Map-Reduce)

```
트리거 ─┬─→ 로그 파싱 노드      ─┐
        ├─→ 환경 수집 노드      ─┼─→ 종합 분석 노드 → 리포트
        └─→ 지식 베이스 조회 노드 ─┘
```

- **언제**: 독립적인 정보 수집을 동시에 할 때
- **우리 적용**: Knowledge Retriever의 내부/외부 4개 소스 병렬 조회 ([03-harness-spec.md](03-harness-spec.md) §1-3)
- **효과**: 분석 시간 단축 (직렬 대비 2~3배)

#### 패턴 C: ReAct (생각-도구-관찰 루프)

```
분석 노드
  ├─ 생각: "이 에러는 NVMe 링크 문제인 것 같다"
  ├─ 도구: get_nvme_link_history(slot_id)
  ├─ 관찰: "해당 슬롯은 최근 3회 연속 링크 다운"
  └─ 결론: "하드웨어 불안정으로 INVALID_FAIL"
```

- **언제**: 분석 중 추가 정보가 필요해 동적으로 도구를 호출할 때
- **우리 적용**: Root Cause Analyzer가 필요에 따라 SSH/tms-mcp 도구를 자유롭게 조회 ([03-harness-spec.md](03-harness-spec.md) §1-4)
- **코드**: ↓ "ReAct 패턴" 절 참고

#### 패턴 D: Supervisor (중앙 총괄)

```
Supervisor 노드
  ├─ "로그/컨텍스트 수집 필요해" → Collection Agent 위임
  ├─ "원인 분석 필요해" → Root Cause Analyzer 위임
  └─ "분석 완료" → Report Generator 위임
```

- **언제**: 매 단계 상황을 보고 다음에 뭘 할지 동적으로 정해야 할 때
- **우리 적용**: MVP부터 채택된 메인 아키텍처 ([02-design.md](02-design.md) 구조③) — 나중에 추가한 게 아니라 처음부터 전체 그래프를 이 패턴으로 조율
- **코드**: ↓ "Supervisor 패턴" 절 참고

#### 패턴 E: Human-in-the-Loop

```
분석 결과 → [신뢰도 < 70%?] → interrupt() → 엔지니어 검토 → 재개
```

- **언제**: AI 판정 신뢰도가 낮아 사람 확인이 필요할 때
- **우리 적용**: 완전 자율 목표이지만, 초기에는 저신뢰 케이스만 선택적 개입 허용 ([03-harness-spec.md](03-harness-spec.md) §1-6). `interrupt()`로 멈춘 상태를 보존하는 방법은 ↓ "Checkpointer" 절 참고
- **진화 방향**: 경험 축적 → 신뢰도 상승 → 개입 빈도 자연 감소

#### 패턴 F: Multi-Agent Network (P2P)

```
Log Analyst ←→ Hardware Expert
      ↕               ↕
 Spec Validator ←→ Pattern Matcher
```

- **언제**: 에러가 복합적이어서 여러 전문가가 협의해야 할 때
- **우리 적용**: 장기 목표(미채택) — 로그 분석가 + 하드웨어 전문가 + 스펙 검증가가 토론하여 최종 판정

---

## 핵심 3요소

**우리 프로젝트에서**: 아래 `AnalysisState`는 단순화 버전이다. 실제 전체 필드는 [03-harness-spec.md](03-harness-spec.md) §3 State 설계 참고.

### State — 공유 메모장

모든 노드가 읽고 쓰는 데이터 구조. 분석 1회 동안만 살아있다.

**Python**

```python
from typing import TypedDict

class AnalysisState(TypedDict):
    tc_id: str
    exit_code: int
    parsed_logs: dict
    similar_cases: list
    verdict: str
    root_cause: str
    confidence: int
    evidence: list[str]
    next: str              # Supervisor 패턴에서 다음 노드 지정
```

**TypeScript**

```typescript
import { Annotation } from "@langchain/langgraph";

const AnalysisState = Annotation.Root({
  tc_id: Annotation<string>(),
  exit_code: Annotation<number>(),
  parsed_logs: Annotation<Record<string, unknown>>(),
  similar_cases: Annotation<unknown[]>(),
  verdict: Annotation<string>(),
  root_cause: Annotation<string>(),
  confidence: Annotation<number>(),
  evidence: Annotation<string[]>(),
  next: Annotation<string>(), // Supervisor 패턴에서 다음 노드 지정
});
```

> State는 휘발성 (분석 1회용). TC 간 공유 데이터는 지식 베이스(MD 파일, pgvector)에 저장.

---

### Node — 실행 단위

State를 받아 변경된 키만 반환하는 함수. AI Agent일 수도, 일반 함수일 수도 있다.

**Python**

```python
# 일반 함수 노드 (LLM 없음)
def knowledge_retriever(state: AnalysisState) -> dict:
    results = search_by_keyword(state["exit_code"])
    return { "similar_cases": results }

# AI Agent 노드 (LLM 사용)
def root_cause_analyzer(state: AnalysisState) -> dict:
    response = llm.invoke(build_prompt(state))
    return { "verdict": response.verdict, "confidence": response.confidence }
```

**TypeScript**

```typescript
// 일반 함수 노드 (LLM 없음)
const knowledgeRetriever = async (state: typeof AnalysisState.State) => {
  const results = await searchByKeyword(state.exit_code);
  return { similar_cases: results };
};

// AI Agent 노드 (LLM 사용)
const rootCauseAnalyzer = async (state: typeof AnalysisState.State) => {
  const response = await llm.invoke(buildPrompt(state));
  return { verdict: response.verdict, confidence: response.confidence };
};
```

---

### Edge — 연결 규칙

노드 간 이동 규칙. 일반 엣지와 조건부 엣지 두 종류.

**Python**

```python
# 일반 엣지: 항상 A → B
graph.add_edge("collection_agent", "knowledge_retriever")

# 조건부 엣지: state 값에 따라 분기
def route(state: AnalysisState) -> str:
    return state["next"]

graph.add_conditional_edges("supervisor", route, {
    "collection_agent":    "collection_agent",
    "root_cause_analyzer": "root_cause_analyzer",
    END:                   END
})
```

**TypeScript**

```typescript
// 일반 엣지
graph.addEdge("collection_agent", "knowledge_retriever");

// 조건부 엣지
const route = (state: typeof AnalysisState.State) => state.next;

graph.addConditionalEdges("supervisor", route, {
  collection_agent: "collection_agent",
  root_cause_analyzer: "root_cause_analyzer",
  FINISH: END,
});
```

---

## Graph 생성 및 실행

**Python**

```python
from langgraph.graph import StateGraph, END

graph = StateGraph(AnalysisState)
graph.add_node("supervisor",          supervisor)
graph.add_node("collection_agent",    collection_agent)
graph.add_node("root_cause_analyzer", root_cause_analyzer)
graph.add_node("report_generator",    report_generator)
graph.add_node("knowledge_updater",   knowledge_updater)

graph.set_entry_point("supervisor")
graph.add_conditional_edges("supervisor", route, {...})
graph.add_edge("collection_agent",    "supervisor")
graph.add_edge("root_cause_analyzer", "supervisor")
graph.add_edge("report_generator",    "supervisor")
graph.add_edge("knowledge_updater",   "supervisor")

app = graph.compile()
result = await app.invoke({ "tc_id": "TC-1234", "exit_code": 13 })
```

**TypeScript**

```typescript
import { StateGraph, END } from "@langchain/langgraph";

const graph = new StateGraph(AnalysisState)
    .addNode("supervisor",          supervisor)
    .addNode("collection_agent",    collectionAgent)
    .addNode("root_cause_analyzer", rootCauseAnalyzer)
    .addNode("report_generator",    reportGenerator)
    .addNode("knowledge_updater",   knowledgeUpdater);

graph.setEntryPoint("supervisor");
graph.addConditionalEdges("supervisor", route, {...});
graph.addEdge("collection_agent",    "supervisor");
graph.addEdge("root_cause_analyzer", "supervisor");
graph.addEdge("report_generator",    "supervisor");
graph.addEdge("knowledge_updater",   "supervisor");

const app = graph.compile();
const result = await app.invoke({ tc_id: "TC-1234", exit_code: 13 });
```

---

## Supervisor 패턴

Supervisor만 Graph 전체 흐름을 알고, Worker는 자기 일만 한다.

**우리 프로젝트에서**: [02-design.md](02-design.md) "후보 구조 3가지" 중 구조③(Supervisor 패턴)을 채택.

**Python**

```python
from langchain_anthropic import ChatAnthropic

llm = ChatAnthropic(model="claude-sonnet-4-6")

def supervisor(state: AnalysisState) -> dict:
    prompt = f"""
    현재 분석 상태:
    - 데이터 수집 완료: {state.get('parsed_logs') is not None}
    - 유사 케이스 검색 완료: {state.get('similar_cases') is not None}
    - 원인 분석 완료: {state.get('verdict') is not None}

    다음 중 실행할 작업을 선택해:
    - collection_agent / root_cause_analyzer / report_generator / knowledge_updater / FINISH
    """
    response = llm.invoke(prompt)
    return { "next": response.content.strip() }
```

**TypeScript**

```typescript
import { ChatAnthropic } from "@langchain/anthropic";

const llm = new ChatAnthropic({ model: "claude-sonnet-4-6" });

const supervisor = async (state: typeof AnalysisState.State) => {
  const prompt = `
    현재 분석 상태:
    - 데이터 수집 완료: ${state.parsed_logs != null}
    - 유사 케이스 검색 완료: ${state.similar_cases != null}
    - 원인 분석 완료: ${state.verdict != null}

    다음 중 실행할 작업을 선택해:
    - collection_agent / root_cause_analyzer / report_generator / knowledge_updater / FINISH
    `;
  const response = await llm.invoke(prompt);
  return { next: (response.content as string).trim() };
};
```

---

## ReAct 패턴

필요한 만큼 도구를 반복 호출하며 추론.

**우리 프로젝트에서**: [03-harness-spec.md](03-harness-spec.md) §1-4 Root Cause Analyzer의 "내부 루프"가 이 패턴.

**Python**

```python
from langchain_core.tools import tool

@tool
def get_pcie_link_status(tester_id: int, bdf: str) -> str:
    """PCIe 링크 상태 조회"""
    return execSSH(tester_id, f"lspci -vvv -s {bdf}")

tools = [get_pcie_link_status, ...]
llm_with_tools = ChatAnthropic(model="claude-opus-4-8").bind_tools(tools)

def root_cause_analyzer(state: AnalysisState) -> dict:
    messages = [
        SystemMessage("Fail 원인을 판정해. VALID_FAIL / INVALID_FAIL / UNKNOWN 중 하나로."),
        HumanMessage(f"수집된 데이터: {state['parsed_logs']}")
    ]
    MAX_ITERATIONS = 10
    for _ in range(MAX_ITERATIONS):
        response = llm_with_tools.invoke(messages)
        if not response.tool_calls:
            break
        messages.append(response)
        for tool_call in response.tool_calls:
            result = execute_tool(tool_call)
            messages.append(ToolMessage(content=result, tool_call_id=tool_call["id"]))

    return { "verdict": parse_verdict(response.content) }
```

**TypeScript**

```typescript
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const getPcieLinkStatus = tool(
  async ({ tester_id, bdf }) => execSSH(tester_id, `lspci -vvv -s ${bdf}`),
  {
    name: "get_pcie_link_status",
    schema: z.object({ tester_id: z.number(), bdf: z.string() }),
  },
);

const llmWithTools = new ChatAnthropic({ model: "claude-opus-4-8" }).bindTools([
  getPcieLinkStatus,
]);

const rootCauseAnalyzer = async (state: typeof AnalysisState.State) => {
  const messages: BaseMessage[] = [
    new SystemMessage(
      "Fail 원인을 판정해. VALID_FAIL / INVALID_FAIL / UNKNOWN 중 하나로.",
    ),
    new HumanMessage(`수집된 데이터: ${JSON.stringify(state.parsed_logs)}`),
  ];
  const MAX_ITERATIONS = 10;
  let response;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    response = await llmWithTools.invoke(messages);
    if (!response.tool_calls?.length) break;
    messages.push(response);
    for (const toolCall of response.tool_calls) {
      const result = await executeTool(toolCall);
      messages.push(
        new ToolMessage({ content: result, tool_call_id: toolCall.id }),
      );
    }
  }
  return { verdict: parseVerdict(response!.content as string) };
};
```

---

## Checkpointer — 상태 저장 및 재개

그래프 실행 중 State를 저장해 중단 후 재개 가능.

**우리 프로젝트에서**: [03-harness-spec.md](03-harness-spec.md) §1-6 Human-in-the-Loop가 LangGraph `interrupt()`로 그래프를 멈추고 사람 응답을 기다리는데, 멈춘 State를 보존하려면 Checkpointer가 필요.

**Python**

```python
from langgraph.checkpoint.sqlite import SqliteSaver

checkpointer = SqliteSaver.from_conn_string("checkpoints.db")
app = graph.compile(checkpointer=checkpointer)

config = { "configurable": { "thread_id": "TC-1234" } }
await app.invoke({ "tc_id": "TC-1234", "exit_code": 13 }, config=config)
```

**TypeScript**

```typescript
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";

const checkpointer = SqliteSaver.fromConnString("checkpoints.db");
const app = graph.compile({ checkpointer });

const config = { configurable: { thread_id: "TC-1234" } };
await app.invoke({ tc_id: "TC-1234", exit_code: 13 }, config);
```

---

## 여러 Graph 운영 구조

tms-log-analyze는 목적에 따라 3개의 Graph를 독립적으로 운영한다.

**우리 프로젝트에서**: `analysis_graph`는 [03-harness-spec.md](03-harness-spec.md) §1-1~1-8, `miner_graph`는 §1-9, `reviewer_graph`는 §1-10 참고.

```
Harness (외부 스케줄러)
  ├── analysis_graph    ← Fail TC 발생 시마다 실행
  ├── reviewer_graph    ← 사용자 피드백 수신 시 / 주기적 실행  (Phase 2)
  └── miner_graph       ← 주기적 실행 (케이스 N건 누적 시)     (Phase 2)
```

세 Graph는 서로 독립적으로 실행되며, 공유하는 것은 지식 베이스(MD 파일, pgvector)뿐이다.

---

## 설치

**Python**

```bash
pip install langgraph langchain-anthropic langchain-core
```

| 패키지                | 역할                                   |
| --------------------- | -------------------------------------- |
| `langgraph`           | Graph, State, Node, Edge, Checkpointer |
| `langchain-anthropic` | Claude API 연동                        |
| `langchain-core`      | Tool 정의, Message 타입                |

**TypeScript**

```bash
npm install @langchain/langgraph @langchain/anthropic @langchain/core
```

| 패키지                 | 역할                                   |
| ---------------------- | -------------------------------------- |
| `@langchain/langgraph` | Graph, State, Node, Edge, Checkpointer |
| `@langchain/anthropic` | Claude API 연동                        |
| `@langchain/core`      | Tool 정의, Message 타입                |
