# ADR 003 — PostgreSQL + TypeORM 선택

**날짜**: 2026-06-29  
**상태**: 결정됨

---

## 결정

DB로 PostgreSQL 16, ORM으로 TypeORM 선택.

## 이유

- 회원가입, OAuth 등 관계형 데이터에 적합
- 회사 서버(tms-api)와 동일한 스택 — 패턴 재사용 가능
- NestJS 공식 지원 (`@nestjs/typeorm`)
- 실시간 채팅 메시지도 초기엔 PostgreSQL로 충분

## 로컬 개발 환경

Docker로 PostgreSQL 실행 (`docker-compose.yml`)

```bash
docker compose up -d  # DB 실행
docker compose down   # DB 중지
docker compose down -v  # DB 초기화
```

## 환경별 설정

| NODE_ENV | synchronize | migrationsRun |
|----------|-------------|---------------|
| local | true (자동 테이블 생성) | false |
| production | false | true (migration 실행) |

## 나중에 추가 고려

- 채팅 트래픽이 커지면 → Redis (메시지 캐시) 또는 별도 메시지 DB 분리
