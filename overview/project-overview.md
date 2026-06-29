# 프로젝트 개요

**최초 작성**: 2026-06-22  
**최종 수정**: 2026-06-29

---

## 프로젝트 목적

Sports Master — 스포츠 관련 모바일 앱 + REST API 서버

---

## 전체 아키텍처

```
sports-master/
├── sports-master-web/   # 모바일 앱 (React Native + Expo)
├── sports-master-api/   # REST API 서버 (NestJS)
└── sports-master-docs/  # 개발 문서 (현재 레포)
```

프론트와 백엔드를 별도 레포로 분리하여 독립적으로 배포.  
타입은 Swagger → openapi-typescript로 자동 동기화.

---

## 기술 스택

### 모바일 (sports-master-web)

| 분류 | 기술 |
|------|------|
| 플랫폼 | React Native (Expo ~56) |
| 언어 | TypeScript |
| 스타일 | NativeWind (Tailwind CSS) |
| 상태관리 | Zustand (클라이언트), TanStack Query (서버) |
| 네트워크 | Axios |
| 타입 생성 | openapi-typescript (Swagger 자동 생성) |
| 폼 | react-hook-form + zod |
| 에러트래킹 | Sentry (@sentry/react-native) |
| 패키지매니저 | pnpm |

### API 서버 (sports-master-api)

| 분류 | 기술 |
|------|------|
| 프레임워크 | NestJS |
| 언어 | TypeScript |
| API 문서 | Swagger (@nestjs/swagger) |
| 유효성 검사 | class-validator + class-transformer |
| 환경변수 | @nestjs/config |
| 로깅 | Winston + nest-winston |
| 에러트래킹 | Sentry (@sentry/node) |
| DB | PostgreSQL 16 (Docker) |
| ORM | TypeORM |
| 패키지매니저 | pnpm |

---

## 폴더 구조

### sports-master-web

```
src/
├── api/         # axios 인스턴스, API 호출 함수
├── components/  # 공통 UI 컴포넌트
├── hooks/       # 커스텀 훅
├── screens/     # 화면 컴포넌트
├── store/       # zustand 스토어
├── types/       # schema.ts (Swagger 자동생성) + 공통 타입
└── utils/       # 유틸 함수
```

### sports-master-api

```
src/
├── common/
│   ├── filters/       # GlobalExceptionFilter
│   └── interceptors/  # ResponseInterceptor
├── config/            # 로거 설정
├── modules/           # 도메인별 모듈
└── main.ts
```

---

## GitHub 레포지토리

| 레포 | URL |
|------|-----|
| 모바일 | https://github.com/jae-hwan-kim/sports-master-web |
| API 서버 | https://github.com/jae-hwan-kim/sports-master-api |
| 문서 | https://github.com/jae-hwan-kim/sports-master-docs.git |
