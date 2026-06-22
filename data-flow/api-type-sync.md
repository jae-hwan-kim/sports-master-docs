# 데이터 흐름 — API 타입 동기화

**최초 작성**: 2026-06-22

---

## 프론트-백 타입 동기화 흐름

```
[sports-master-api]
  NestJS 컨트롤러/DTO
  @ApiProperty() 데코레이터
        ↓
  /swagger-yaml 엔드포인트 (자동 생성)
        ↓
[sports-master-web]
  pnpm generate-types 실행
  (openapi-typescript)
        ↓
  src/types/schema.ts (자동 생성)
        ↓
  API 호출 코드에서 타입 사용
```

## 실행 방법

```bash
# 1. API 서버 실행
cd sports-master-api
pnpm start   # localhost:3000

# 2. 프론트에서 타입 생성
cd sports-master-web
pnpm generate-types
```

## 핵심 규칙

- API 서버의 **모든 DTO**에 `@ApiProperty()` 필수
- 타입 생성 후 `src/types/schema.ts`는 **직접 수정 금지** (덮어써짐)
- API 스펙 변경 시 반드시 `generate-types` 재실행
