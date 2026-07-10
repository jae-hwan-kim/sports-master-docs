# Sports Master — 아키텍처 개요

> 최종 정리: 2026-07-06 · 현재 상태 기준

![Sports Master 시스템 아키텍처](../../architecture.svg)

## 1. 시스템 구성

Monorepo(단일 저장소, 프로젝트별 독립 패키지) 구조. 3개 프로젝트 + 로컬 DB 컨테이너.

| 계층 | 프로젝트 | 스택 | 상태 |
|------|----------|------|------|
| Client | `sports-master-web` | React Native, Expo, NativeWind, Zustand, TanStack Query, Axios, Zod | 스캐폴딩 (App.tsx 스텁, src 디렉터리만 존재) |
| Server | `sports-master-api` | NestJS, TypeORM, Swagger, Winston, Helmet, Sentry | Entity + DTO 정의 단계 (Controller/Service 미구현) |
| Data | PostgreSQL 16 | Docker Compose, TypeORM | 로컬 컨테이너 |
| Docs | `sports-master-docs` | Markdown (ADR, ERD, API 목록, 가이드) | 문서 전용 |

## 2. Web (Client)

- **프레임워크**: React Native + Expo (관리형 워크플로).
- **스타일링**: NativeWind (Tailwind CSS 문법을 RN에 적용).
- **상태 관리**: Zustand (클라이언트 상태) + TanStack Query (서버 상태/캐싱).
- **통신**: Axios → REST API.
- **검증/폼**: Zod + react-hook-form (`@hookform/resolvers`).
- **인증**: `jwt-decode` (JWT 파싱).
- **모니터링**: Sentry (`@sentry/react-native`).
- **디렉터리**: `src/{api, store, screens, components, hooks, types, utils}` — 골격만 존재.

## 3. API (Server)

- **프레임워크**: NestJS (모듈 기반 아키텍처).
- **부트스트랩** (`main.ts`): Helmet(보안 헤더) · CORS · 전역 `ValidationPipe`(transform + whitelist) · 전역 예외 필터 · Swagger(`/swagger`) · Sentry · Winston 로거.
- **응답 규격**: 전역 `ResponseInterceptor` + `response.dto` 로 표준 응답 래핑.
- **ORM**: TypeORM. `synchronize`는 비프로덕션에서만 ON, 프로덕션은 마이그레이션(`migrationsRun`) 적용.
- **모듈 (도메인 11개)**: `users`, `auth`, `expert-profiles`, `customer-profiles`, `certifications`, `reviews`, `chat-rooms`, `diagnoses`, `schedules`, `favorite-experts`, `ad-campaigns`, `ai-recommendations`.
  - 각 모듈: `*.entity.ts` + `dto/` 로 구성. Controller/Service/Module 파일은 아직 미구현.
  - `auth`, `ai-recommendations`: DTO만 존재 (Entity 없음).

### 공통 계층 (`common/`)
- `filters/` — 전역 예외 필터
- `interceptors/` — 응답 표준화
- `decorators/` — Swagger 응답 데코레이터
- `dto/` — 공통 응답 DTO
- `pipes/`

## 4. Database

- **엔진**: PostgreSQL 16 (Docker, 컨테이너명 `sports-master-db`, 포트 `5432`).
- **볼륨**: `postgres_data` (영속화).
- **스키마 소스**: TypeORM Entity (`src/modules/**/*.entity.ts`).

### 핵심 관계 (ERD 요약)

- `User` ↔ `ExpertProfile` : 1:1
- `User` ↔ `CustomerProfile` : 1:1
- `User` → `Review`, `FavoriteExpert`, `Schedule`, `DiagnosisRequest` : 1:N
- `ExpertProfile` → `Certification`, `Review`, `DiagnosisRequest`, `ChatRoom`, `FavoriteExpert`, `AdCampaign` : 1:N
- `ChatRoom` ↔ `Review` : 1:1
- `ChatRoom` → `ExpertProfile`(N:1), `User`(N:1)

## 5. Docker

- 현재 `docker-compose.yml`은 **DB 컨테이너만** 정의 (API/Web은 로컬 dev 실행).
- 서비스: `db` (postgres:16) — 환경변수로 DB명/계정/비밀번호 주입.

```
docker-compose.yml
└── db (postgres:16)
    ├── ports: 5432:5432
    └── volume: postgres_data
```

## 6. 데이터 흐름

```
[RN/Expo 앱] --Axios(REST)--> [NestJS API] --TypeORM--> [PostgreSQL]
    │  Zustand / TanStack Query 캐싱          │  ValidationPipe → Interceptor 표준 응답
    └─ Sentry                                 └─ Winston 로그 · Sentry
```

## 7. 요약: 현재 진행 단계

- **완료**: 프로젝트 스캐폴딩, DB 스키마(Entity) 설계, API DTO 정의, Docker DB 환경, 문서 체계.
- **미구현**: API 비즈니스 로직(Controller/Service), 앱 화면/기능, API-앱 타입 동기화, 인증 로직.
