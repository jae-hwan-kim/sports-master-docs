# Sports Master — 문서 인덱스

개발 진행 중 생성되는 모든 문서를 관리하는 레포지토리.

## 문서 목록

| 문서 | 설명 |
|------|------|
| [프로젝트 개요](./overview/project-overview.md) | 전체 아키텍처, 기술 스택, 폴더 구조 |
| [시스템 구성](./overview/architecture.md) | 레포별 역할, 의존성, 부트스트랩 구성 |
| [데이터 흐름](./data-flow/) | 프론트-백 API 연동, 타입 생성 흐름 |
| [아키텍처 결정 기록](./adr/) | 기술 선택 이유, 주요 결정 기록 |
| [개발 환경 설정 가이드](./guides/setup.md) | 로컬 개발 환경 구성 방법 |
| [앱 로컬 실행 가이드](./guides/local-run-quickstart.md) | 시뮬레이터/에뮬레이터/공기계 실행 절차 |
| [트러블슈팅 기록](./guides/troubleshooting/) | 실제로 막혔던 문제와 해결 과정 |

## 작성 규칙

- 새 기능/결정 발생 시 해당 문서에 바로 추가
- ADR은 번호 순으로 (`adr/001-...md`, `adr/002-...md`)
- 트러블슈팅 기록은 `guides/troubleshooting/YYYY-MM-DD-주제.md`
- 날짜 형식: `YYYY-MM-DD`
