# 멀티 에이전트 오케스트레이션

> 작성일: 2026-07-01
> 목적: tms-log-analyze 개발팀을 위한 멀티 에이전트 오케스트레이션 개념 및 LangGraph 가이드

---

## 1. 멀티 에이전트 오케스트레이션이란

### AI Agent

스스로 생각하고 도구를 사용해 목표를 달성하는 AI 단위.

```
일반 LLM 호출: 질문 → 답변 (1회성)
AI Agent:      목표 → 생각 → 도구 사용 → 관찰 → 다시 생각 → ... → 목표 달성
```

### 멀티 에이전트

서로 다른 역할을 가진 여러 AI Agent가 함께 일하는 구조.

```
로그 분석 회사 비유:

수집 담당 Agent  → 로그와 환경 정보 수집
분석 담당 Agent  → 원인 추론 및 판정
지식 담당 Agent  → 분석 결과를 지식 베이스에 저장
```

각 Agent는 자신의 역할만 수행하고, 결과를 공유 State에 기록한다.

### 오케스트레이션

여러 Agent가 언제, 어떤 순서로, 어떤 조건에서 실행될지 조율하는 것.

```
오케스트레이션 없음: Agent들이 각자 따로 동작
오케스트레이션 있음: Agent들이 하나의 목표를 향해 협력
```

### 관련 개념 정리

| 개념                             | 설명                                                              |
| -------------------------------- | ----------------------------------------------------------------- |
| **Agent**                        | LLM이 추론하는 자율 실행 단위                                     |
| **멀티 에이전트**                | 역할이 다른 여러 Agent의 집합                                     |
| **오케스트레이션**               | Agent들의 실행 흐름을 조율하는 방식                               |
| **Graph**                        | State + Node + Edge로 구성된 하나의 업무 프로세스 설계도          |
| **MCP (Model Context Protocol)** | Agent가 외부 도구를 호출하는 표준 인터페이스 (도구 창고)          |
| **Harness**                      | AI 시스템을 신뢰할 수 있게 만드는 외부 구조 (흐름/에러/품질 제어) |
| **Loop Engineering**             | 반복을 통해 품질을 높이는 설계 (단기 루프 + 장기 루프)            |

### 개념 관계도

![멀티 에이전트 오케스트레이션 개념 관계도](multi-agent-concept-diagram.png)

---

## 2. 주요 프레임워크

| 프레임워크    | 핵심 철학                                      | 언어        | 제어권 |
| ------------- | ---------------------------------------------- | ----------- | ------ |
| **LangGraph** | State Machine. 개발자가 흐름을 명시적으로 설계 | Python / JS | 개발자 |
| **CrewAI**    | 역할 기반 팀. Agent에게 역할과 목표만 부여     | Python      | Agent  |
| **AutoGen**   | 대화 기반. Agent끼리 채팅으로 협력             | Python      | Agent  |
| **Mastra**    | LangGraph와 유사한 철학, TypeScript 네이티브   | TypeScript  | 개발자 |

### 코드 스타일 비교

같은 워크플로우 (수집 → 분석 → 리포트) 를 구현할 때:

**LangGraph** — 흐름을 개발자가 명시적으로 설계

```python
graph.add_node("collection", collection_fn)
graph.add_node("analysis", analysis_fn)
graph.add_edge("collection", "analysis")
graph.add_edge("analysis", "report")
```

**CrewAI** — 역할만 정의하면 흐름은 AI가 결정

```python
collector = Agent(role="Data Collector", goal="로그 수집")
analyzer  = Agent(role="Analyst", goal="원인 분석")
crew = Crew(agents=[collector, analyzer], tasks=[...])
crew.kickoff()
```

**AutoGen** — Agent끼리 대화로 해결

```python
collector = AssistantAgent("collector")
analyzer  = AssistantAgent("analyzer")
collector.initiate_chat(analyzer, message="이 로그 분석해줘")
```

---

## 3. LangGraph 선정 이유

### 핵심 요구사항

tms-log-analyze는 NVMe SSD 테스트 Fail 로그를 분석하는 시스템으로, 다음이 필수다.

- 분석 흐름이 추적 가능해야 한다 (어느 노드에서 무슨 일이 있었는지)
- 특정 노드 실패 시 정확히 그 지점에서 재시도할 수 있어야 한다
- Harness 엔지니어링을 적용해 시스템을 신뢰할 수 있어야 한다
- 분석할수록 더 잘하게 되는 루프 구조가 필요하다

### 프레임워크별 적합성

| 요구사항       | LangGraph                   | CrewAI              | AutoGen             |
| -------------- | --------------------------- | ------------------- | ------------------- |
| 흐름 추적 가능 | ✅ State + Node 명확히 분리 | ❌ 내부 동작 불투명 | ❌ 대화 흐름 불투명 |
| 재시도 제어    | ✅ Checkpointer로 지점 저장 | ❌ 어려움           | ❌ 어려움           |
| Harness 적용   | ✅ 구조가 명확해 적용 용이  | △ 제한적            | △ 제한적            |
| 루프 설계      | ✅ 조건부 엣지로 자유롭게   | △ 제한적            | △ 제한적            |

### 결론

CrewAI/AutoGen은 빠르게 프로토타입을 만들기에 좋지만, 흐름이 불투명해 Harness 적용이 어렵다.  
LangGraph는 개발자가 흐름을 완전히 제어할 수 있어 신뢰할 수 있는 프로덕션 시스템에 적합하다.

---

실제 구현 코드 패턴(State/Node/Edge, Supervisor/ReAct/Checkpointer, 여러 Graph 운영 구조, 설치)은 → **[ref-langgraph-patterns.md](ref-langgraph-patterns.md)**
