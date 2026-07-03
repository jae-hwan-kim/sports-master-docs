# TMS-MCP 설계 문서

## 1. 개요

### 목적
Ghost(테스트 실행기)가 실패했을 때 **왜 실패했는지** AI 에이전트가 자율적으로 분석할 수 있는 도구들을 제공한다.

### 전체 MCP 생태계에서의 역할 분담

```
실패 분석 에이전트
      │
      ├── TMS-MCP (본 문서)
      │     - 테스트 실행 데이터, 결과, 로그
      │     - 디바이스 상태 / 텔레메트리 / Logan 변환
      │     - Jira 이슈 조회 및 연동
      │     - 펌웨어 릴리즈 노트 (Qual jira_link → Confluence 조회)
      │     - Jira 유사 이슈 조회 (QualSummaryJira.jira_links 기반)
      │     - 테스트 카테고리 설명 / 시나리오 (Confluence 검색·조회)
      │
      ├── GitLab MCP (별도)
      │     - ghost core / ghost plugin / rack_tools / test script 코드 분석
      │     - CI 파이프라인 상태, 최근 커밋
      │
      ├── NVMe Spec MCP (별도)
      │     - NVMe / PCIe 스펙, 에러 코드 레퍼런스
      │
      └── 에이전트 자체 역량
            - Known Bug 관리 (에이전트 메모리 또는 별도 KB)
            - 과거 분석 결과 누적 및 패턴 학습
```

### 로그 처리 원칙
1. **점진적 로딩**: 작은 데이터(exit_code, 예외 JSON, 에러 라인)부터 시작 → 필요 시 확장
2. **컨텍스트 누적**: 앞 단계 결과(BDF 주소, 에러 패턴, 실패 시점)를 다음 tool 인자로 재활용
3. **시간 윈도우 우선**: 실패 시점(`finished_at`) 기준 ±N분으로 범위 제한
4. **grep 우선**: 전체 읽기 전 에러 패턴 추출
5. **full read 최후**: 위 방법으로 파악 안 될 때만

### TMS 도메인
```
Project
  └── Plan
        └── Qual  ← Attachments (텔레메트리 파일), Jira 연동
              └── Run
                    ├── TestSuite
                    │     └── TestCase  ← log_path, started_at, finished_at
                    ├── Tester / Slot   ← ip_address, host_id, access_code
                    ├── NVMe / PMU (Device)
                    └── Chamber
```

---

## 2. TMS-API 분석

### 기술 스택
| 항목 | 내용 |
|------|------|
| Framework | NestJS v11 |
| Database | PostgreSQL (TypeORM v0.3) |
| Auth | Okta OAuth2 + JWT |
| SSH | `node-ssh@^13.2.0` |
| Cloud | AWS (S3, Secrets Manager, SES) |

### SSH 접속 정보
| 항목 | 값 |
|------|-----|
| Username | `host_id` (Tester entity의 `host_id` 필드) |
| Password | `access_code` (`GET /tester/general` 응답 필드) |
| Port | `TMS_SSH_PORT` (기본 22) |

---

## 3. 인증 설계: Pre-shared Secret Key

`JwtGuard`에 `x-mcp-secret` 우회 로직 추가.

```typescript
// libs/middleware/src/guards/jwt.guard.ts
const mcpSecret = req.headers['x-mcp-secret'];
if (mcpSecret) {
  if (mcpSecret !== process.env.TMS_MCP_SECRET) throw new UnauthorizedException();
  return true;
}
// 기존 JWT 검증 유지...
```

```bash
# tms-api/.env
TMS_MCP_SECRET=<32자 이상 랜덤 문자열>

# tms-mcp/.env
TMS_API_URL=http://<tms-api-server>/api
TMS_MCP_SECRET=<동일한 시크릿 키>
TMS_SSH_PORT=22
TMS_SSH_TIMEOUT_MS=10000
TMS_LOGAN_PATH=/usr/local/bin/logan
CONFLUENCE_BASE_URL=https://atlassian.confluence.fadutec.dev
CONFLUENCE_API_TOKEN=<api-token>
CONFLUENCE_USER_EMAIL=<email>
JIRA_BASE_URL=https://<jira-server>
JIRA_API_TOKEN=<api-token>
JIRA_USER_EMAIL=<email>
```

---

## 4. 펌웨어 릴리즈 노트: Qual Jira Link 기반 Confluence 조회

TMS-API에 별도 entity를 추가하지 않는다.
Qual entity에 이미 `jira_link?: string` 필드가 있으며, `QualCategoryJira.jira_links?: string[]`도 존재한다.
이 링크가 Confluence 릴리즈 노트 페이지 또는 Jira 이슈를 가리킬 수 있으므로,
MCP가 해당 페이지 내용을 직접 읽고 AI 에이전트가 FW 릴리즈 노트 여부를 판단한다.

### 4.1 URL 유형별 처리 방식

```
Qual.jira_link 또는 QualCategoryJira.jira_links[]
  │
  ├─ Confluence URL  (/wiki/spaces/.../pages/{pageId}/...)
  │     → Confluence REST API: GET /wiki/rest/api/content/{pageId}?expand=body.view
  │     → 페이지 본문(HTML) → plain text 변환 후 반환
  │
  └─ Jira URL  (/browse/{ISSUE-KEY})
        → Jira REST API: GET /rest/api/3/issue/{ISSUE-KEY}
        → description + remotelinks 조회
        → 연결된 Confluence 페이지 링크가 있으면 추가 fetch
```

> Atlassian Cloud는 Jira와 Confluence가 동일 도메인/API 토큰을 사용하므로
> `atlassian-client.ts` 하나로 통합 관리한다.

### 4.2 AI 에이전트 판단 흐름

```
get_qual_fw_release_note(qual_id)
  │
  ├─[1] TMS-API GET /qual/list → qual.jira_link 취득
  │      (없으면 GET /qual/category → QualCategoryJira.jira_links[] 탐색)
  │
  ├─[2] URL 유형 파싱 → Confluence or Jira API 호출
  │
  ├─[3] 페이지 내용 반환
  │
  └─[4] AI가 내용 분석:
         - FW 릴리즈 노트로 판단 → 변경사항 / fixed issues 등 내용 그대로 반환
         - 무관한 페이지 → 무시 또는 다음 링크 시도
```

---

## 5. MCP 서버 설계

### 기술 스택
| 항목 | 선택 |
|------|------|
| Runtime | Node.js + TypeScript |
| MCP SDK | `@modelcontextprotocol/sdk` |
| Transport | stdio |
| HTTP Client | `axios` (TMS-API + Jira API) |
| SSH Client | `node-ssh` |

### 프로젝트 구조
```
tms-mcp/
├── src/
│   ├── index.ts
│   ├── config.ts
│   ├── client/
│   │   ├── tms-client.ts         # TMS-API axios client
│   │   └── atlassian-client.ts   # Jira + Confluence 통합 client (동일 토큰)
│   ├── ssh/
│   │   └── tester-ssh.ts
│   └── tools/
│       ├── project.ts
│       ├── qual.ts               # jira_link, attachment 조회 포함
│       ├── run.ts
│       ├── tester.ts             # env, repo history 포함
│       ├── device.ts             # nvme history 포함
│       ├── summary.ts
│       ├── test-mgmt.ts          # 구조적 참조용 (TestSuite/TestCase 목록)
│       ├── chamber.ts            # event 시간 상관관계
│       ├── atlassian.ts          # Jira 이슈 + Confluence 페이지 조회/생성
│       └── tester-ssh.ts         # 로그/진단/텔레메트리/Logan/SQLite
├── docs/
│   └── design.md
├── package.json
├── tsconfig.json
└── .env.example
```

---

## 6. 실패 분석 워크플로

> **설계 원칙**: 각 단계는 다음 판단에 필요한 최소한의 데이터만 가져온다.
> 에이전트가 앞 단계에서 얻은 컨텍스트(BDF, 에러 패턴, 실패 시각 등)를 다음 tool 인자로 직접 전달한다.
> 핑퐁이 발생해도 괜찮다 — 한 번에 모두 가져오는 것보다 필요할 때 필요한 것만 요청한다.

```
[Pre-flight] 에이전트 보유 컨텍스트 확인
  ─────────────────────────────────────────────────────────────────────
  tms-agent 트리거 이벤트에 아래 필드가 포함된 경우 해당 단계를 스킵한다:
    tc_id, run_id, qual_id, tester_id   → [0단계] 스킵 가능
    log_path, finished_at               → [0단계] 스킵 가능
    exit_code, exit_type                → [1단계] 스킵 가능

  에이전트가 다른 MCP 또는 Confluence에서 이미 취득한 정보:
    카테고리 설명 (cat1/cat2/cat3 목적·범위)  → [2단계] Confluence 조회 스킵 가능
    시나리오 (단계별 기대 동작 및 판정 기준)   → [4단계] Script 진단의 기준 동작으로 활용
    관련 스펙 (NVMe/PCIe 에러 코드 등)        → [4단계] Device / Environment 해석에 활용

  에이전트 메모리의 known_bug_patterns []
    → [3단계] get_ghost_log_errors의 exclude_patterns 인자로 전달

  ── known_bug_patterns 상세 ──────────────────────────────────────────
  에이전트는 과거 분석을 통해 "이미 알려진 버그·노이즈 패턴"을 메모리에
  누적한다. 새 분석 시 이 목록을 exclude_patterns로 전달하면, MCP가 grep
  단계에서 해당 패턴을 제외하고 반환한다.
  → 에이전트는 진짜 새로운 에러에만 집중할 수 있다.

  패턴 예시:
    "nvme0n1: I/O Errors.*err hwsts.*0x08"   // TMS-123, FW bug, v2.1에서 수정됨
    "warning: unable to reset PHY"             // TMS-456, HW 특성, benign
    "TimeoutError.*establish_connection.*30s"  // TMS-789, 알려진 race condition

  MCP 내부 동작:
    grep -n -E "ERROR|FAIL|Exception|Traceback|timeout" test.log \
      | grep -vE "<exclude_patterns를 | 로 결합>"
    → 알려진 패턴과 일치하는 라인을 제외한 결과만 반환

  역할 분리:
    known_bug_patterns 관리 (누적·갱신)  → 에이전트 책임
                                            (TMS-MCP는 패턴의 의미를 모름)
    패턴 필터링 (grep -v 적용)           → TMS-MCP가 기계적으로 실행

  효과:
    필터 없음 → 수십 줄 반환, 에이전트가 노이즈 직접 분류 (컨텍스트·토큰 낭비)
    필터 있음 → 신규 에러만 반환, 분석 집중도 향상
  ─────────────────────────────────────────────────────────────────────

[0단계] 실패 컨텍스트 취득  ← Pre-flight에서 미확보 시만
  query_sqlite_test_case_by_id(tc_id)
    → log_path, started_at, finished_at  (이후 모든 시간 기반 tool의 기준값)

[1단계] 실패 유형 파악  ← "Start here." (미확보 시만)
  get_ghost_exit_info(tester_id, log_path)
    → exit_code + exit_type  (2개 파일, 수 바이트)
    → 에이전트가 exit_type을 보고 [4단계] 분기 경로 결정

[2단계] 실행 컨텍스트 파악  ← 각 tool은 독립적으로 필요 시만 호출
  get_ghost_config(tester_id, log_path)       → 어떤 설정으로 실행됐는지
  get_ghost_target_info(tester_id, log_path)  → target_bdf, target_module
    ※ target_bdf는 이후 get_pcie_link_status 인자로 재활용
  get_ghost_loaded_plugins(tester_id, log_path) → 로드된 plugin 목록

  ── 테스트 카테고리 / 시나리오 파악 (에이전트 미보유 시) ──
  search_confluence(
    cql='space="FTS" AND ancestor="5500141569" AND title~"{cat2} {cat3}"'
  )
    → FTS 스페이스의 "FADU Test Scenario" 루트 하위에서 카테고리 페이지 탐색
    → 결과가 여럿이면 get_confluence_children으로 계층 탐색
  get_confluence_page(pageId)
    → 카테고리 설명 + 시나리오 (단계별 기대 동작 및 판정 기준)
    → 이후 분석에서 "기준 동작"으로 활용

  ── 유사 이슈 링크 초기 확인 (링크 존재 여부만; 내용은 [6단계]) ──
  get_result_summary(qual_id, cat1, cat2, cat3, tester_type)
    → QualSummaryJira.jira_links[]  (링크 URL 목록만)
  get_qual_detail(qual_id)
    → qual.jira_link  (FW 릴리즈 노트 링크 존재 여부 확인)

[3단계] Triage — 원인 카테고리 가설 수립
  exit_type은 Ghost의 종료 방식이지 근본 원인이 아니다.
  아래 경량 신호 6개를 먼저 수집해 카테고리 가설 우선순위를 결정한다.

  ① get_ghost_exception(tester_id, log_path)
       → traceback 파일 경로로 Script vs Ghost-core 구분
         "ghost_core/" 경로 → Ghost-core,  "plugins/" or "scripts/" → Script
  ② get_ghost_log_errors(tester_id, log_path, finished_at,
                          exclude_patterns=[...known_bug_patterns])
       → 새로운 에러 패턴만 (known bug 제외)
  ③ get_nvme_error_log(tester_id, device)
       → 카운터 > 0 이면 Device 가능성 선순위
  ④ query_sqlite_tc_failure_history(tc_name)
       → 반복 실패 → Script or Device 의심
         처음 실패 → Ghost-core / Environment / tms-agent 포함 검토
  ⑤ query_sqlite_tester_recent_fails(tester_id)
       → 동일 tester에서 다른 TC도 실패 → Environment or tms-agent 의심
  ⑥ get_tms_agent_log_at_failure(tester_id, finished_at)
       → Ghost spawn 전 에러 있으면 → tms-agent 의심

  ── 신호 → 카테고리 참조 ─────────────────────────────────────────────
  카테고리         결정적 신호
  ──────────────────────────────────────────────────────────────────────
  Device           NVMe error count > 0 / dmesg I/O error / PCIe link down
  Script           traceback → script·plugin 파일 / 다른 device에서도 동일 TC 실패
  tms-agent        Ghost 실행 전 agent 에러 / spawn 실패 로그
  Ghost-core       traceback → Ghost core 모듈 / 여러 plugin에서 동일 crash
  Environment      tester 다발 실패 / dmesg OOM·network / 온도 이벤트
  ──────────────────────────────────────────────────────────────────────
  exit_type 보조 참조 (하나의 신호로만 활용):
    SCRIPT_ERROR → Script 강한 신호
    EXCEPTION    → Device · Script · Ghost-core 모두 가능
    TIMEOUT      → Device · Environment · Script(무한루프) 가능
    UNKNOWN      → tms-agent · Environment 우선 검토
  ──────────────────────────────────────────────────────────────────────

  에이전트가 위 신호를 종합해 카테고리 우선순위 결정 → [4단계] 진입
  확증이 없으면 1순위 카테고리 심층 진단 후 불일치 시 2순위로 이동

[4단계] 카테고리별 심층 진단
  ┌─ Device ──────────────────────────────────────────────────────────┐
  │  ① get_dmesg_at_failure(tester_id, finished_at, window_min=5)     │
  │       → "I/O error" / "reset" / "namespace" 키워드 확인            │
  │  ② get_pcie_link_status(tester_id, bdf=<[2단계] target_bdf>)      │
  │       → 링크 다운그레이드 여부 (Gen3 → Gen1 등)                    │
  │  ③ get_nvme_smart_log(device_id)                                   │
  │       → 온도 / 수명 / 에러 통계                                    │
  │  ④ query_sqlite_device_failure_rate(serial)                        │
  │       → 불량 디바이스 판정 (반복 실패 이력)                        │
  │  ⑤ (심층 필요 시) get_nvme_telemetry + run_logan → 내부 에러 상세  │
  └───────────────────────────────────────────────────────────────────┘
  ┌─ Script (Ghost plugin / test script) ─────────────────────────────┐
  │  ※ 에이전트가 시나리오 컨텍스트 보유 시:                           │
  │     기대 동작(시나리오)과 실제 로그를 대조                         │
  │     → "어느 단계에서 기대 동작을 이탈했는지" 특정 후 진단 집중     │
  │                                                                    │
  │  ① get_ghost_log_around(tester_id, log_path, error_line, ctx=30)  │
  │       → [3단계] 에러 라인 전후 문맥                                │
  │  ② get_ghost_loaded_plugins(tester_id, log_path)                  │
  │       → 문제 plugin 특정                                           │
  │  ③ get_ghost_command_log(tester_id, log_path)                     │
  │       → 어떤 명령 시퀀스에서 실패했는지                            │
  │  ④ get_tester_repo_history(tester_id)                             │
  │       → 최근 script 변경이 실패 시점과 겹치는지                    │
  │  ⑤ query_sqlite_tc_failure_history(tc_name, limit=20)             │
  │       → 언제부터 실패 시작 (commit 시점과 교차 확인)               │
  │  → GitLab MCP 연계: 해당 plugin · script 코드 분석                │
  └───────────────────────────────────────────────────────────────────┘
  ┌─ tms-agent ────────────────────────────────────────────────────────┐
  │  ① get_ghost_unexpected_errors(tester_id, log_path)               │
  │       → tms-agent 레벨 미분류 오류                                 │
  │  ② get_tester_system_status(tester_id, svc="tms-agent")           │
  │       → 서비스 재시작 이력                                         │
  │  ③ get_tms_agent_error_log(tester_id, lines=100)                  │
  │       → spawn 실패 / 연결 오류 패턴                                │
  └───────────────────────────────────────────────────────────────────┘
  ┌─ Ghost-core ───────────────────────────────────────────────────────┐
  │  ① get_ghost_stderr_log(tester_id, log_path)                      │
  │       → core 레벨 crash 메시지                                     │
  │  ② get_tester_env(tester_id)                                      │
  │       → Ghost-core 버전 확인                                       │
  │  ③ get_tester_repo_history(tester_id)                             │
  │       → 최근 Ghost-core 업데이트 여부                              │
  │  → GitLab MCP 연계: 해당 core 모듈 코드 분석                      │
  └───────────────────────────────────────────────────────────────────┘
  ┌─ Environment (시스템 / 네트워크 / 온도) ──────────────────────────┐
  │  ① get_tester_resource_usage(tester_id)                           │
  │       → 메모리 부족 / 디스크 풀 / 부하                             │
  │  ② get_dmesg_at_failure(tester_id, finished_at, window_min=10)    │
  │       → OOM killer / network error / kernel 이상                  │
  │  ③ get_journal_at_failure(tester_id, svc="*", finished_at)        │
  │       → 시스템 전반 서비스 이상                                    │
  │  ④ get_chamber_events(chamber_id, finished_at, window_min=10)     │
  │       → chamber 운용 중인 경우 온도 이벤트                         │
  │  ⑤ get_ghost_initial_env(tester_id, log_path)                     │
  │       → 환경변수 이상 여부                                         │
  └───────────────────────────────────────────────────────────────────┘

[5단계] 패턴 분석  ← 단발성 실패인지 구조적 문제인지 판단
  query_sqlite_tc_failure_history(tc_name)    → flaky vs. 새 버그
  query_sqlite_tester_recent_fails(tester_id) → tester 장비 이상
  query_sqlite_device_failure_rate(serial)    → 불량 디바이스
  get_nvme_history(device_id)                 → device 전체 이력
  ※ 위 결과를 보고 에이전트가 추가 쿼리 필요 여부 결정

[6단계] 유사 이슈 심층 확인  ← [2단계]에서 링크 확인된 경우
  get_jira_issue(key) × N          → 상태 / 원인 / 해결방법
  get_jira_issue_comments(key)     → 해결 경위 (이슈별 필요 시)
  → 매칭 없음: search_jira_issues(키워드) 폴백

[7단계] FW 릴리즈 노트 심층 확인  ← [2단계]에서 링크 확인된 경우
  get_confluence_page(pageId)      → 릴리즈 노트 본문 조회
  get_jira_issue(key)              → Jira 이슈에서 추가 Confluence 링크 탐색
  에이전트가 내용 분석: 현재 실패와 관련된 변경사항 / fixed issues 추출

[8단계] 디바이스 텔레메트리  ← 심층 분석이 필요하다고 판단된 경우만
  [옵션 A] get_nvme_telemetry(tester_id, device) → run_logan(tester_id, path)
  [옵션 B] get_qual_attachments(qual_id) → run_logan_on_attachment(tester_id, s3_url)
  ※ 텔레메트리는 대용량이므로 반드시 앞 단계에서 근거 확보 후 호출

[9단계] 결과 처리
  create_jira_issue     → 신규 버그 리포트 생성
  link_jira_to_qual     → Qual에 Jira 이슈 연결
```

---

## 7. MCP Tools 목록

> **미반영 제안 Tool**: [02-design.md](02-design.md) §5 "tms-mcp 추가 제안"의 `list_run_test_cases`, `get_recent_fail_events`, `get_slot_fail_history`, `get_nvme_smart_live`는 아직 아래 목록에 없다. 구현 착수 전 이 목록에 편입할지 결정 필요 — 그 전까지 "전체 Tool 개수"는 확정값이 아니다.

### 7.1 TMS-API 기반 Tools

#### Project / Plan
| Tool | Endpoint | 설명 |
|------|----------|------|
| `list_projects` | `GET /project` | 프로젝트 목록 |
| `list_plans` | `GET /project/plan/list` | 플랜 목록 |
| `get_plan_overview` | `GET /project/plan/overview` | 플랜 개요 |

#### Qualification
| Tool | Endpoint | 설명 |
|------|----------|------|
| `list_quals` | `GET /qual/list` | Qual 목록 |
| `get_qual_overview` | `GET /qual/overview` | Qual 현황 |
| `get_qual_attachments` | `GET /qual/attachment` | Qual 첨부파일 (텔레메트리 탐색) |

#### Run
| Tool | Endpoint | 설명 |
|------|----------|------|
| `list_runs` | `GET /run/list` | Run 목록 |
| `get_run_detail` | `GET /run/detail` | Run 상세 |
| `get_run_tc_log` | `GET /run/tc-log` | TC 로그 (log_path 포함) |
| `get_run_test_suites` | `GET /run/test-suite` | TestSuite 목록 |
| `get_run_configuration` | `GET /run/configuration` | Run 설정 |

#### Tester / 환경
| Tool | Endpoint | 설명 |
|------|----------|------|
| `list_testers` | `GET /tester` | Tester 목록 |
| `get_tester_general` | `GET /tester/general` | Tester 정보 + SSH credential |
| `get_tester_env` | `GET /tester/env` | Ghost/tms-agent 버전 |
| `get_tester_repo_history` | `GET /tester/repo/history` | Ghost 스크립트 버전 이력 |
| `get_tester_stats` | `GET /tester/stats` | Tester 통계 |

#### Device
| Tool | Endpoint | 설명 |
|------|----------|------|
| `list_nvme_devices` | `GET /device/nvme/list` | NVMe 목록 |
| `get_nvme_detail` | `GET /device/nvme/detail` | NVMe 상세 |
| `get_nvme_history` | `GET /device/nvme/history` | device 전체 이력 → 불량 판별 |
| `get_nvme_smart_log` | `GET /device/nvme/smart-log` | SMART 로그 |
| `get_nvme_identify` | `GET /device/nvme/identify` | NVMe Identify |

#### Summary
| Tool | Endpoint | 설명 |
|------|----------|------|
| `get_execution_summary` | `GET /summary/execution` | 실행 통계 |
| `get_result_summary` | `GET /summary/result` | 결과 통계 |
| `get_result_detail` | `GET /summary/detail` | 결과 상세 |

#### Test Management _(구조적 참조용; 내용은 Category MCP)_
| Tool | Endpoint | 설명 |
|------|----------|------|
| `list_test_suites` | `GET /test-mgmt/test-suite` | TestSuite 목록 |
| `list_test_cases` | `GET /test-mgmt/test-case` | TestCase 목록 |

#### Chamber
| Tool | Endpoint | 설명 |
|------|----------|------|
| `get_chamber_events` | `GET /chamber/event` | 실패 시점 전후 온도 이벤트 |
| `get_chamber_monitoring` | `GET /chamber/monitoring` | Chamber 실시간 상태 |
| `get_running_recipe` | `GET /chamber/recipe/running` | 실행 중인 레시피 |

#### Qual / Summary Jira Links

TMS-API에는 용도별로 세 종류의 Jira 링크 구조가 있다:

| Entity | 인덱스 키 | `jira_links` 용도 | 취득 방법 |
|--------|----------|-----------------|----------|
| `Qual` | qual | FW 릴리즈 노트 페이지 링크 | `GET /qual/list` → `jira_link` |
| `QualSummaryJira` | qual + cat1 + cat2 + cat3 + tester_type | **카테고리별 유사 이슈 링크** | `GET /summary/result` 응답에 이미 포함 |
| `QualCategoryJira` | qual + category + capacity + hw_revision | 디바이스 스펙별 Jira 링크 | `GET /qual/category` |

| Tool | Endpoint | 설명 |
|------|----------|------|
| `get_qual_detail` | `GET /qual/list` | `qual.jira_link` (FW 릴리즈 노트 페이지) |
| `get_result_summary` | `GET /summary/result` | 결과 통계 + **`QualSummaryJira.jira_links[]` 포함** (유사 이슈) |
| `get_qual_category_jira` | `GET /qual/category` | `QualCategoryJira.jira_links[]` (디바이스 스펙별) |

---

### 7.2 Atlassian Tools _(Jira + Confluence, 동일 client)_

```typescript
// src/client/atlassian-client.ts
// Confluence와 Jira가 별도 서버에 있으므로 client를 분리한다.
const confluenceClient = axios.create({
  baseURL: process.env.CONFLUENCE_BASE_URL,  // https://atlassian.confluence.fadutec.dev
  auth: { username: process.env.CONFLUENCE_USER_EMAIL, password: process.env.CONFLUENCE_API_TOKEN },
  headers: { 'Accept': 'application/json' },
});

const jiraClient = axios.create({
  baseURL: process.env.JIRA_BASE_URL,  // https://atlassian.jira.fadutec.dev
  auth: { username: process.env.JIRA_USER_EMAIL, password: process.env.JIRA_API_TOKEN },
  headers: { 'Accept': 'application/json' },
});

// URL 유형 파싱 유틸리티
function parseAtlassianUrl(url: string): { type: 'confluence' | 'jira'; id: string }
```

**Confluence 테스트 시나리오 Space 정보:**
| 항목 | 값 |
|------|-----|
| Base URL | `https://atlassian.confluence.fadutec.dev` |
| Space Key | `FTS` |
| 루트 페이지 ID | `5500141569` ("FADU Test Scenario") |
| 시나리오 탐색 CQL | `space="FTS" AND ancestor="5500141569" AND title~"{cat}"` |

#### Jira
| Tool | API | 설명 |
|------|-----|------|
| `get_jira_issue` | `GET /rest/api/3/issue/{key}` | **유사 이슈 상세** (QualSummaryJira.jira_links[] 각 링크에 적용) |
| `get_jira_issue_comments` | `GET /rest/api/3/issue/{key}/comment` | 이슈 댓글 (해결 경위 파악) |
| `search_jira_issues` | `GET /rest/api/3/search?jql=...` | 키워드/증상으로 이슈 검색 (유사 이슈 미등록 시 폴백) |
| `link_jira_to_qual` | `PATCH /run/qual-jira` (TMS-API) | Qual에 Jira 이슈 연결 |

**유사 이슈 조회 흐름:**
```
get_result_summary(qual_id, cat, tester_type)
  └─ 응답의 jira_links[] → get_jira_issue(key) × N
        └─ 이슈 상태/해결방법/댓글 확인
              └─ 미해결 or 링크 없음 → search_jira_issues(키워드) 폴백
```

#### Confluence
| Tool | API | 설명 |
|------|-----|------|
| `search_confluence` | `GET /wiki/rest/api/content/search?cql=...` | CQL로 페이지 탐색. 시나리오 검색 시 `space="FTS" AND ancestor="5500141569" AND title~"{cat}"` 사용 |
| `get_confluence_children` | `GET /wiki/rest/api/content/{pageId}/child/page` | 페이지 하위 목록 조회 (계층 탐색용) |
| `get_confluence_page` | `GET /wiki/rest/api/content/{pageId}?expand=body.view` | 페이지 본문 조회 |
| `get_qual_fw_release_note` | qual.jira_link 파싱 → Confluence/Jira fetch | **FW 릴리즈 노트 전용 복합 tool** |

**`get_qual_fw_release_note` 동작:**
1. `GET /qual/list` → `qual.jira_link` 취득 (없으면 `QualCategoryJira.jira_links[]` 탐색)
2. URL이 Confluence → `get_confluence_page`로 본문 fetch
3. URL이 Jira → `get_jira_issue`로 이슈 조회 → remotelinks에서 Confluence URL 추출 → `get_confluence_page`
4. 내용 반환 — AI 에이전트가 FW 릴리즈 노트 여부 판단 후 분석에 활용

---

### 7.3 SSH 기반 Tools

#### 실패 시점 기반 추출
| Tool | SSH 명령 | 설명 |
|------|----------|------|
| `get_dmesg_at_failure` | `dmesg --since "{t-Nm}" --until "{t+Nm}"` | 실패 시점 ±N분 커널 로그 (window_min 인자) |
| `get_journal_at_failure` | `journalctl -u {svc} --since "..." --until "..."` | 실패 시점 ±N분 저널 (서비스 지정) |
| `get_ghost_log_at_failure` | `awk -v from=... -v to=... '$0>=from&&$0<=to'` on `{log_path}/test.log` | test.log 시간 구간 추출 (before_min, after_min 인자). 타임스탬프 포맷: `[YYYY-MM-DD\|HH:MM:SS.mmm TZ]` |
| `get_tms_agent_log_at_failure` | `grep` on `/opt/tms-agent/logs/YYYY-MM-DD.*.log` | tms-agent 로그 실패 시점 전후만 추출 (시간 필터) |

#### Ghost 로그 — grep 우선
| Tool | SSH 명령 | 설명 |
|------|----------|------|
| `get_ghost_exit_info` | `cat {log_path}/exit_code; cat {log_path}/exit_type` | **가장 먼저. 실패 유형 분류** |
| `get_ghost_exception` | `cat {log_path}/tms_agent_exception.json` | 구조화 예외 JSON |
| `get_ghost_log_errors` | `grep -n -E "ERROR\|FAIL\|..." {log_path}/test.log` | 에러 라인만 추출. `exclude_patterns?: string[]` 인자로 known bug 패턴 제외 가능 |
| `grep_ghost_log` | `grep -n -E "{pattern}" {log_path}/test.log` | 패턴 검색 |
| `get_ghost_log_around` | `sed -n '{line-N},{line+N}p' {log_path}/test.log` | 에러 전후 문맥 (ctx 줄 수 인자) |
| `get_ghost_command_log` | `cat {log_path}/command_log.log` | 명령별 실행 결과 |
| `get_ghost_stderr_log` | `cat {log_path}/stderr.log` | Ghost 에러 스트림 |
| `get_ghost_unexpected_errors` | `cat {log_path}/tms_agent_unexpected_errors.log` | 미분류 오류 |

#### Ghost 실행 환경 (컨텍스트 파악용)
| Tool | SSH 명령 | 설명 |
|------|----------|------|
| `get_ghost_target_info` | `cat {log_path}/target_bdf; cat {log_path}/target_module` | 테스트 대상 BDF + 모듈. **이후 get_pcie_link_status의 bdf 인자로 재활용** |
| `get_ghost_loaded_plugins` | `cat {log_path}/loaded_plugins` | 로드된 Ghost plugin 목록 |
| `get_ghost_initial_env` | `cat {log_path}/initial_env` | 테스트 시작 시 환경변수 스냅샷 |

#### 하드웨어 진단
| Tool | SSH 명령 | 설명 |
|------|----------|------|
| `get_nvme_error_log` | `nvme error-log /dev/nvme{n}` | **NVMe 에러 카운터. 직접 증거** |
| `get_pcie_link_status` | `lspci -vvv -s {bdf}` | BDF 직접 지정해서 PCIe 링크 상태 조회 (get_ghost_target_info의 bdf 활용) |
| `get_nvme_fw_log` | `nvme fw-log /dev/nvme{n}` | 펌웨어 커밋 이력 |
| `get_tester_nvme_list` | `nvme list` | 연결된 NVMe 목록 |

#### tms-agent 로그
| Tool | SSH 명령 | 설명 |
|------|----------|------|
| `get_tms_agent_error_log` | `tail -n {lines} /opt/tms-agent/logs/YYYY-MM-DD.error.log` | ERROR 로그 (최근 N줄) |
| `get_tms_agent_log` | `tail -n {lines} /opt/tms-agent/logs/YYYY-MM-DD.info.log` | INFO 로그 (최근 N줄) |

#### 전체 Ghost 로그 (필요 시)
| Tool | SSH 명령 | 설명 |
|------|----------|------|
| `get_ghost_test_log` | `cat {log_path}/test.log` | 전체 로그 (대용량 주의) |
| `get_ghost_stdout_log` | `cat {log_path}/stdout.log` | Ghost 출력 |
| `get_ghost_config` | `cat {log_path}/config` | 테스트 설정 |
| `list_ghost_script_logs` | `find {log_path}/script_logs -type f -ls` | script_logs 목록 |
| `get_ghost_script_log` | `cat {log_path}/script_logs/{filename}` | 특정 script 로그 |

#### 시스템 진단
| Tool | SSH 명령 | 설명 |
|------|----------|------|
| `get_tester_resource_usage` | `free -h && df -h && uptime` | 메모리/디스크/부하 |
| `get_tester_journal_log` | `journalctl -u {svc} -n {lines} --no-pager` | 일반 저널 |
| `get_tester_dmesg` | `dmesg \| tail -n {lines}` | 커널 메시지 |
| `get_tester_system_status` | `systemctl status {svc}` | 서비스 상태 |

---

### 7.4 SQLite Tools (`/var/lib/tms/db/data.sqlite`)

**접근 방법**: SSH로 tester 머신에 접속 후 `sqlite3` CLI 실행.
tester 머신에 `sqlite3`가 없으면 설치 필요 (`apt install sqlite3` 등).
```bash
# MCP 내부 동작 예시
ssh {host_id}@{ip} "sqlite3 /var/lib/tms/db/data.sqlite 'SELECT ...'"
```

| Tool | 설명 | 분석 역할 |
|------|------|----------|
| `query_sqlite_test_case_by_id` | TC 상세 (log_path, started_at, **finished_at**, exception) | **[0단계] 실패 시점 취득** |
| `query_sqlite_failed_test_cases` | run의 실패/예외 TC 목록 | 전체 실패 파악 |
| `query_sqlite_tc_failure_history` | 동일 TC 이름의 과거 실패 이력 | flaky vs. 새 버그 |
| `query_sqlite_tester_recent_fails` | 동일 tester 최근 N일 실패 집계 | tester 장비 이상 |
| `query_sqlite_device_failure_rate` | 동일 device serial 실패율 | 불량 디바이스 |
| `query_sqlite_test_case_logs` | TC 로그 파일 링크 (S3 URL) | 완료 TC S3 로그 |
| `list_sqlite_tables` | 전체 테이블 목록 | 스키마 탐색 |
| `get_sqlite_schema` | 특정 테이블 스키마 | 스키마 탐색 |
| `query_sqlite` | 자유 SELECT (DML 차단, 최대 200행) | 커스텀 분석 |

---

## 8. 디바이스 텔레메트리 + Logan 분석

```
[옵션 A] Qual Attachment 활용
  get_qual_attachments → 텔레메트리 파일 탐색
  run_logan_on_attachment(tester_id, s3_url) → SSH: wget → logan → 결과

[옵션 B] 실시간 추출
  get_nvme_telemetry(tester_id, device) → SSH: nvme telemetry-log
  run_logan(tester_id, path)            → SSH: logan {path}
```

| Tool | SSH 명령 | 설명 |
|------|----------|------|
| `get_nvme_telemetry` | `nvme telemetry-log /dev/nvme{n} -o /tmp/tms_tel_{id}.bin` | 텔레메트리 추출 |
| `run_logan` | `{TMS_LOGAN_PATH} /tmp/tms_tel_{id}.bin` | Logan 변환 |
| `get_nvme_telemetry_and_parse` | 위 두 명령 파이프 | 추출 + 변환 one-shot |
| `run_logan_on_attachment` | `wget {url} -O /tmp/t.bin && {TMS_LOGAN_PATH} /tmp/t.bin` | 첨부파일 Logan 변환 |

---

## 9. Phase 2: Write Tools

| Tool | Method | Endpoint | 설명 |
|------|--------|----------|------|
| `create_run` | POST | `/run/create` | Run 생성 |
| `start_run` | POST | `/run/run-start` | Run 시작 |
| `stop_run` | PATCH | `/run/stop` | Run 중단 |
| `update_run_result` | PATCH | `/run/result` | 결과 업데이트 |
| `update_run_resolution` | PATCH | `/run/resolution` | 해결 방안 입력 |
| `create_jira_issue` | POST | `/rest/api/3/issue` (Jira) | 신규 버그 리포트 생성 (이슈 타입·필드 확정 후 구현) |

---

## 10. 구현 로드맵

### Phase 1

**TMS-API 변경 (선행):**
- [ ] `JwtGuard` 수정: `x-mcp-secret` 우회 로직

**TMS-MCP 구현:**
- [ ] `package.json`, `tsconfig.json`, `src/config.ts`
- [ ] `src/client/tms-client.ts`
- [ ] `src/client/atlassian-client.ts` — Jira + Confluence 통합 client + URL 유형 파싱
- [ ] `src/index.ts`
- [ ] `src/tools/project.ts`, `qual.ts`, `run.ts`
- [ ] `src/tools/tester.ts` — env, repo history
- [ ] `src/tools/device.ts` — nvme history
- [ ] `src/tools/summary.ts`, `test-mgmt.ts`
- [ ] `src/tools/chamber.ts` — event
- [ ] `src/tools/atlassian.ts` — Jira(search/get) + Confluence(search/children/get_page) + get_qual_fw_release_note
- [ ] `src/ssh/tester-ssh.ts`
- [ ] `src/tools/tester-ssh.ts` — 로그/진단/텔레메트리/Logan/SQLite 전체
- [ ] 통합 테스트 및 Claude Code 등록

### Phase 2
- [ ] Write tools
- [ ] `register_fw_release_note` (TMS 관리자용)

---

## 11. 환경변수 전체 목록

```bash
# TMS-API 연동
TMS_API_URL=http://<server>/api
TMS_MCP_SECRET=<32자 이상 랜덤 문자열>

# SSH (tester 접속)
TMS_SSH_PORT=22
TMS_SSH_TIMEOUT_MS=10000
# Username = Tester.host_id, Password = Tester.access_code (GET /tester/general)

# Logan (텔레메트리 파싱 도구)
TMS_LOGAN_PATH=/usr/local/bin/logan

# Confluence (self-hosted)
CONFLUENCE_BASE_URL=https://atlassian.confluence.fadutec.dev
CONFLUENCE_USER_EMAIL=<email>
CONFLUENCE_API_TOKEN=<api-token>
CONFLUENCE_TEST_SCENARIO_SPACE=FTS
CONFLUENCE_TEST_SCENARIO_ROOT_PAGE_ID=5500141569

# Jira (self-hosted)
JIRA_BASE_URL=https://atlassian.jira.fadutec.dev
JIRA_USER_EMAIL=<email>
JIRA_API_TOKEN=<api-token>
# JIRA_PROJECT_KEY는 프로젝트마다 다르므로 tool 호출 시 인자로 전달
```

---

## 12. 주요 참조 파일

### TMS-API
| 역할 | 경로 |
|------|------|
| JwtGuard (MCP 우회 추가 대상) | `libs/middleware/src/guards/jwt.guard.ts` |
| Tester entity (host_id = SSH username, access_code = SSH password) | `src/entities/tester.entity.ts`, `src/controllers/tester/dto/get-tester-general.res.dto.ts:43-45` |
| Qual attachment 엔드포인트 | `src/controllers/qual/qual.controller.ts` |
| Jira 연동 (QualCategoryJira) | `src/entities/qual-category-jira.entity.ts` |

### tms-agent
| 역할 | 경로 |
|------|------|
| Ghost 프로세스 spawn | `src/lib/ghost-manager.ts` |
| 로그 수집 (`GHOST_LOGS` 목록) | `src/lib/log-manager.ts:173-185` |
| TestCase entity (`log_path`, `finished_at`) | `src/entities/test-case.entity.ts` |
| SQLite DB | `/var/lib/tms/db/data.sqlite` |
| tms-agent 프로세스 로그 | `/opt/tms-agent/logs/YYYY-MM-DD.{info,error}.log` |
