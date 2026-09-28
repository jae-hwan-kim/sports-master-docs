# 개발 환경 설정 가이드

**최초 작성**: 2026-06-22

---

## 사전 요구사항

- Node.js v20+
- pnpm v9+
- Xcode (iOS 빌드)
- Android Studio (Android 빌드)

소셜 로그인을 실제로 테스트하려면 콘솔 설정도 필요합니다. 자세한 절차는 [앱 로컬 실행 가이드](./local-run-quickstart.md#0-사전-준비-한-번만) 참고.

| 제공자 | 콘솔 | 필요한 것 |
|--------|------|-----------|
| Google | Google Cloud Console | iOS 유형 / Web 유형 클라이언트 ID, Android 유형 클라이언트(패키지명 `sports.master` + SHA-1) |
| Kakao | Kakao Developers | REST API 키, Redirect URI 등록 |
| Apple | Apple Developer | Sign in with Apple 활성화 (iOS 전용) |

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

소셜 로그인 관련 필수 변수:

| 변수 | 설명 |
|------|------|
| `GOOGLE_CLIENT_ID` | iOS 유형 클라이언트 ID — iOS idToken의 `aud` |
| `GOOGLE_WEB_CLIENT_ID` | Web 유형 클라이언트 ID — Android idToken의 `aud` |
| `KAKAO_REST_API_KEY` | 카카오 REST API 키 |
| `KAKAO_REDIRECT_URI` | 앱의 `EXPO_PUBLIC_KAKAO_REDIRECT_URI`와 반드시 동일 |
| `APPLE_CLIENT_ID` | 애플 Service ID |

> 구글 관련 변수가 비어 있으면 `google-auth-library`가 audience 체크를 건너뛰므로 보안상 반드시 채워야 합니다.

## 모바일 앱 실행

```bash
cd sports-master-web

# 타입 생성 (API 서버 실행 중이어야 함)
pnpm generate-types

# 앱 실행
pnpm start          # Expo 개발 서버 (이미 설치된 앱에 연결)
pnpm ios            # iOS 시뮬레이터 — 네이티브 빌드 + pod install 포함
pnpm android        # Android 에뮬레이터 — 네이티브 빌드 포함
```

앱 `.env`의 소셜 로그인 변수:

| 변수 | 설명 |
|------|------|
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | iOS 유형 클라이언트 ID |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Web 유형 클라이언트 ID (Android 네이티브 SDK가 사용) |
| `EXPO_PUBLIC_KAKAO_REST_API_KEY` | 카카오 REST API 키 |
| `EXPO_PUBLIC_KAKAO_REDIRECT_URI` | 백엔드 콜백 주소 |
| `SENTRY_DISABLE_AUTO_UPLOAD` | 로컬 빌드에서 소스맵 업로드 생략 (`true` 유지) |

> `EXPO_PUBLIC_*` 값은 번들 빌드 시점에 코드로 인라인됩니다. 값을 바꾸면 `pnpm start --clear`로 캐시를 비워야 반영됩니다.
> Android 유형 클라이언트 ID는 앱 코드에서 참조하지 않습니다 — Play services가 패키지명+SHA-1 검증에만 사용하므로 콘솔에만 등록되어 있으면 됩니다.

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
| `pnpm ios` | iOS 네이티브 빌드 + 시뮬레이터 실행 |
| `pnpm android` | Android 네이티브 빌드 + 에뮬레이터 실행 |
| `pnpm generate-types` | Swagger → TypeScript 타입 생성 |
| `pnpm typecheck` | 타입 체크 |
| `pnpm lint:fix` | lint 자동 수정 |
| `pnpm fix:style` | prettier + lint 동시 실행 |
