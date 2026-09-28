# 개발 진행 현황

> 새 세션 시작 시 이 문서를 먼저 읽어 컨텍스트를 복원하세요.
> 최종 갱신: 2026-09-29 (git + 파일 실측 기준)

---

## 현재 단계

**명인(Master) 플로우 FE/BE 구현 완료 · 고객(Customer) 플로우 착수 단계**

- BE: 7개 모듈 가동 중, 고객 전용 모듈 미구현
- FE: 명인 화면 전량 완료, 고객 탭 네비게이터 + 프로필/설정까지 작성 (홈/탐색은 스텁)

---

## 리포 구조

루트 `sports-master/`는 껍데기이고, 3개 서브 디렉터리가 **각각 독립 git 리포**다.

| 리포 | 최근 커밋 | 작업 상태 |
|------|-----------|-----------|
| `sports-master-web` | `b3181bf` chore(eas): 빌드 프로필별 environment 및 iOS 리소스 설정 추가 | 클린 (upstream 미설정 — 푸시 안 됨) |
| `sports-master-api` | `0d4e2bb` chore: dto-to-module 워크플로우 추가 | 클린 (origin/main 대비 ahead 28) |
| `sports-master-docs` | `b46346f` docs: 기술 스택 최신화 (Expo 57, 소셜 인증 SDK) | 클린 (ahead 9) |
| `sports-master` (루트) | `0fc6e4e` feat: 명인 탭 네비게이터 구성 | 서브 디렉터리 전부 untracked 상태 유지, 리모트 없음 |

> 2026-09-29에 web의 미커밋 37파일(+1858줄)을 기능 단위 14커밋으로 분리했다. `git write-tree`로 index를 스냅샷한 뒤 그룹별로 복원해 커밋하는 방식을 썼다 — index와 worktree가 서로 다른 2겹 상태(`MM`)인 파일이 5개 있었기 때문.
> **어느 레포도 아직 푸시되지 않았다.**

---

## BE (NestJS + TypeORM + PostgreSQL)

### 가동 중인 모듈 — `app.module.ts` 등록 7개

| 모듈 | 주요 엔드포인트 |
|------|-----------------|
| `auth` | `POST /auth/login` `register` `refresh` `logout`, 소셜 3종(`kakao`/`google`/`apple`), `GET /auth/kakao/callback`(리다이렉트 중계), `check-email` `check-nickname` |
| `users` | `GET/PATCH /users/me`, `PATCH /users/mode`(명인↔고객 모드 전환), `DELETE /users/withdraw` |
| `expert-profiles` | `GET/POST/PATCH /expert-profiles/me`, `POST me/images` `me/certificates`, `DELETE me/images/:index` |
| `certifications` | `GET/POST /certifications` |
| `diagnoses` | `GET /diagnoses/incoming`, `PATCH /:id/view`(열람 처리), `DELETE /:id` |
| `reviews` | 목록, `GET /reviews/me/summary`, `POST /:id/delete-request`, `POST /review-request`(리뷰 링크 요청) |
| `home` | `GET /home/diagnosis-requests/preview`, `GET /home/expert-grade` |

### 공통 인프라

- `common/interceptors/response.interceptor.ts` + `common/dto/response.dto.ts` — 응답 래핑
- `common/filters/global-exception.filter.ts`
- `common/guards/` — `jwt-auth.guard.ts`, `admin-guard.ts`
- `common/decorators/api-data-response.decorator.ts` — Swagger 응답 스키마
- `config/logger.config.ts` — Winston

### Entity/DTO만 있고 모듈 미구현 (harness 생성물, 방치 중)

`chat-rooms`, `schedules`, `favorite-experts`, `ad-campaigns`, `customer-profiles`, `ai-recommendations`

→ **고객 플로우 진행 시 `customer-profiles`, `favorite-experts`가 먼저 필요**

---

## FE (React Native + Expo)

### 완료 (커밋됨) — 명인 플로우

- **인증**: `Onboarding` → `Login`(446줄, 소셜 3종 포함) → `SignUp`(511줄, 닉네임/이메일 중복검증) → `SignUpRoleSelect` → `MasterVerification`(259줄) → `MasterWelcome`
- **명인 탭** (`MasterTabNavigator`): `MasterHome`(413줄) / `MasterDiagnosis` / `MasterProfile`
- **명인 프로필 스택** (`MasterProfileStackNavigator`): `MasterDetailProfile`(348줄), `MasterDetailProfileEdit`(473줄), `MasterProfileEdit`, `MasterReview`(372줄), `MasterSettings`, `MasterMessageGuide`
- **공용 컴포넌트**: `Button` `TextField` `Checkbox` `Chip` `StarRating` `RoleCard` `ScreenHeader` `ConfirmDialog` `DiagnosisRequestCard/Modal`
  - `components/profile/` — `ProfileCard` `KeywordChipInput` `ImageUploadGrid` `RegionSelector`
  - `components/review/` — `RatingsSummary` `ReviewFilterTabs` `ReviewItem` `ReviewInfoModal` `DeleteRequestDialog`
- **훅 25개** (`src/hooks/`) — 인증/프로필/리뷰/진단 전 영역 TanStack Query 연동
- **디자인 시스템 정착**: `tailwind.config.js`에 컬러 토큰(`black` `white` `gray1~3` `primary` `secondary` `dialog*`), `fontSize`(`title` `main` `small1~3` `popup-*`), `boxShadow.card` 등록 완료. Pretendard 3 weight `App.tsx`에서 `useFonts`로 로드 중

### 완료 (커밋됨) — 고객 플로우 착수분

- `navigation/CustomerTabNavigator.tsx` — 홈/명인탐색/프로필 3탭, 커스텀 탭바
- `screens/CustomerProfile/`(186줄), `screens/CustomerSettings/`(441줄) — 구현됨
- `screens/CustomerExplore/`(11줄) — **스텁, 내용 없음**
- `screens/MasterPhoneChange/`(118줄)
- `components/profile/RegionSelector.tsx`(+383줄), `KeywordChipInput.tsx` — 프리셋 기반 최대 3개 선택으로 개편
- `screens/MasterDetailProfileEdit`(+239줄), `MasterDetailProfile` — 센터연락처 추가, 이미지 5 → 3개

`RootNavigator`에 `CustomerHome`(= CustomerTabNavigator), `CustomerSettings`, `MasterPhoneChange` 등록 완료.

> `screens/CustomerHome/CustomerHomeScreen.tsx`는 `CustomerTabNavigator`로 교체되면서 **참조가 끊긴 상태**로 남아 있다.

### 소셜 로그인 구현 방식

| 제공자 | 앱 구현 | 서버로 넘기는 값 |
|--------|---------|------------------|
| 구글 | `@react-native-google-signin/google-signin` (네이티브 SDK) | `idToken` |
| 애플 | `expo-apple-authentication` (iOS 전용) | `identityToken` |
| 카카오 | `expo-web-browser`로 웹 OAuth 직접 구성 | `code` + `redirectUri` |

구글은 2026-09-29에 브라우저 OAuth(`expo-auth-session`)에서 네이티브 SDK로 전환했다 — Google이 Android 유형 클라이언트의 custom URI scheme을 차단하기 때문. [ADR 005](../adr/005-android-google-native-signin.md) 참고.

훅: `hooks/useGoogleAuth.ts` `useKakaoAuth.ts` `useAppleAuth.ts`(SDK 호출) + `useGoogleLogin.ts` `useKakaoLogin.ts` `useAppleLogin.ts`(서버 전송).

---

## Claude Code Workflow (Harness)

| 스크립트 | 상태 |
|----------|------|
| `sports-master/.claude/workflows/ia-to-dto.workflow.js` | 실행 완료 — Entity/DTO 전량 생성 |
| `sports-master/.claude/workflows/review-and-fix.workflow.js` | 실행 완료 (구조/코드품질/기능/IA스펙 4 리뷰어 + Fixer, Notion 리뷰어는 `syncNotion: true`일 때만) |
| `sports-master-web/.claude/workflows/figma-to-screen.workflow.js` | 1회 실행 (로그인 화면). 이후 화면은 전부 수작업 진행 |
| `sports-master-api/.claude/workflows/dto-to-module.workflow.js` | **미실행** — 7개 모듈 모두 수작업으로 구현됨 (`0d4e2bb`에서 커밋됨) |

> 알려진 이슈: `Workflow` 툴이 `args`를 파싱된 객체가 아닌 JSON 문자열로 넘김. 두 워크플로우 최상단에 `typeof args === 'string' ? JSON.parse(args) : args` 방어 코드 적용됨.

---

## 다음 할 일

1. **고객 화면 마무리** — `CustomerExploreScreen`이 11줄 스텁 상태. 고객 홈은 `CustomerTabNavigator`의 홈 탭으로 재구성 필요
2. **고객 BE 모듈 구현** — `customer-profiles`, `favorite-experts` (Entity/DTO는 이미 존재)
3. **미사용 `screens/CustomerHome/` 정리** — `CustomerTabNavigator`로 교체되어 참조가 끊김
4. **eslint 에러 4건 해결** — `RatingsSummary`(미사용 인자), `ReviewItem`/`MasterHome`(미사용 import), `MasterReviewScreen:98`(no-unused-expressions, 실제 버그 가능성). `bb5d0d2` 이전부터 존재
5. **각 레포 푸시** — web은 upstream 미설정, api ahead 28, docs ahead 9

---

## 주요 결정사항 (ADR 외)

| 항목 | 결정 |
|------|------|
| Workflow 위치 | cross-project는 `sports-master/.claude/workflows/`, 전용은 각 프로젝트 `.claude/workflows/` |
| Notion 동기화 | 기본 off, `syncNotion: true` 옵션으로 수동 실행 |
| RN 리스트 렌더링 | `map()` 전면 금지, 무조건 `FlatList`/`FlashList` (`sports-master-web/CLAUDE.md`) |
| 자동 커밋 | 금지 — 명시적 요청 시에만 커밋 |
| Prettier | `arrowParens: "avoid"`, `semi: true`, `printWidth: 120` |
| API baseURL | `EXPO_PUBLIC_API_URL`, 미설정 시 dev fallback (Android는 `10.0.2.2:3000`, iOS는 `localhost:3000`) |
| 구글 클라이언트 ID | iOS는 iOS 유형, Android는 **Web 유형**(네이티브 SDK가 사용). Android 유형 클라이언트는 패키지명+SHA-1 검증 전용으로 콘솔에만 존재 — 삭제 시 `DEVELOPER_ERROR` |
| `session/` git 추적 | 추적함 — docs 레포의 문서이고 세션 간 컨텍스트 복원이 목적 |

---

## Notion 연동 정보

- 통합 이름: `운동명인 mcp`
- 부모 페이지: `3998ff2f-ac0d-80ea-8f00-eb91bbd37aa0`
- 명인IA data_source ID: `26b8ff2f-ac0d-8362-8ea5-07cdaae25d1e`
- 고객IA data_source ID: `bb48ff2f-ac0d-8253-8756-0789ec060bf4`

---

## 기술 스택

| 영역 | 스택 |
|------|------|
| API | NestJS + TypeORM + PostgreSQL (Docker) |
| 앱 | React Native (Expo 57) + NativeWind + Zustand + TanStack Query + Axios + Zod |
| 소셜 인증 | google-signin (네이티브 SDK) + expo-apple-authentication + expo-web-browser(카카오) |
| 패키지 매니저 | pnpm |
| API 문서 | Swagger (`/swagger`) |
| 에러 트래킹 | Sentry |
| 로깅 | Winston + nest-winston |
