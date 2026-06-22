# ADR 002 — NestJS 백엔드 프레임워크 선택

**날짜**: 2026-06-22  
**상태**: 결정됨

---

## 결정

백엔드 프레임워크로 NestJS 선택.

## 이유

- 회사 서버(tms-api)가 NestJS 기반 — 동일한 패턴과 컨벤션 재사용 가능
- TypeScript 네이티브 지원
- `@nestjs/swagger`로 Swagger 자동 생성 — 프론트 타입 자동 동기화 연결 고리
- `class-validator` + `class-transformer` DTO 검증이 Swagger 문서화와 동시에 처리

## 회사 tms-api 대비 간소화한 부분

| 회사 구조 | sports-master-api | 이유 |
|-----------|-------------------|------|
| libs/ 멀티 라이브러리 | 제거 | 초기 단계 불필요 |
| AWS SDK | 미설치 | 필요 시 추가 |
| TypeORM + pg | 미설치 | DB 설계 확정 후 추가 |
| Redis (ioredis) | 미설치 | 캐시 필요 시 추가 |
| Okta 인증 | 미설치 | 인증 방식 결정 후 추가 |
