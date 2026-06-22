# ADR 001 — 멀티레포 구조 선택

**날짜**: 2026-06-22  
**상태**: 결정됨

---

## 결정

`sports-master-web`과 `sports-master-api`를 별도 레포로 분리.

## 배경

모바일 앱과 API 서버를 하나의 레포(monorepo)에 둘지, 별도 레포(multirepo)로 분리할지 결정 필요.

## 선택지

| 방식 | 장점 | 단점 |
|------|------|------|
| Monorepo | 공통 타입 직접 공유, 한 번에 관리 | 초기 설정 복잡 (pnpm workspace, turborepo) |
| Multirepo | 단순, 독립적 배포, 레포별 권한 분리 가능 | 타입 동기화 별도 작업 필요 |

## 이유

- 혼자 개발하는 초기 단계 — 복잡한 monorepo 설정 불필요
- 타입 동기화는 Swagger → openapi-typescript로 해결 가능
- 추후 팀이 생기면 레포별 권한 분리 용이

## 타입 동기화 방식

```
API 서버 실행 → /swagger-yaml 엔드포인트
→ sports-master-web에서 pnpm generate-types 실행
→ src/types/schema.ts 자동 생성
```
