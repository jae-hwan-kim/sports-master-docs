# 개발 환경 설정 가이드

**최초 작성**: 2026-06-22

---

## 사전 요구사항

- Node.js v20+
- pnpm v9+
- Xcode (iOS 빌드)
- Android Studio (Android 빌드)

## 설치

```bash
# 1. 레포 클론
git clone https://github.com/jae-hwan-kim/sports-master-web.git
git clone https://github.com/jae-hwan-kim/sports-master-api.git

# 2. 의존성 설치
cd sports-master-api && pnpm install
cd ../sports-master-web && pnpm install
```

## API 서버 실행

```bash
cd sports-master-api

# 환경변수 설정
cp .env.example .env
# .env 파일 열어서 값 입력

pnpm start
# → http://localhost:3000
# → http://localhost:3000/swagger  (Swagger UI)
```

## 모바일 앱 실행

```bash
cd sports-master-web

# 타입 생성 (API 서버 실행 중이어야 함)
pnpm generate-types

# 앱 실행
pnpm start          # Expo 개발 서버
pnpm ios            # iOS 시뮬레이터
pnpm android        # Android 에뮬레이터
```

## 주요 스크립트

### sports-master-api

| 명령어 | 설명 |
|--------|------|
| `pnpm start` | 개발 서버 실행 |
| `pnpm build` | 빌드 |
| `pnpm lint` | lint 검사 |
| `pnpm test` | 테스트 실행 |

### sports-master-web

| 명령어 | 설명 |
|--------|------|
| `pnpm start` | Expo 개발 서버 |
| `pnpm generate-types` | Swagger → TypeScript 타입 생성 |
| `pnpm typecheck` | 타입 체크 |
| `pnpm lint:fix` | lint 자동 수정 |
| `pnpm fix:style` | prettier + lint 동시 실행 |
