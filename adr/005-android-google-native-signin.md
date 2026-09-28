# ADR 005 — Android 구글 로그인 네이티브 SDK 채택

**날짜**: 2026-09-29  
**상태**: 결정됨

---

## 결정

구글 로그인을 브라우저 기반 OAuth(`expo-auth-session`)에서 네이티브 SDK(`@react-native-google-signin/google-signin`)로 전환.

## 배경

iOS는 정상 동작하는데 Android만 구글 로그인이 실패. authorization endpoint를 직접 호출해 확인한 결과 Google이 다음 에러로 요청을 거부하고 있었다.

```
400 오류: invalid_request
Custom URI scheme is not enabled for your Android client.
```

Google은 신규 Android 유형 OAuth 클라이언트의 custom URI scheme 리다이렉트를 기본 차단한다. `expo-auth-session`은 브라우저를 열고 custom scheme으로 앱에 되돌아오는 방식이라, 스킴을 역방향 client ID로 쓰든 패키지명으로 쓰든 Android에서는 전부 400으로 막힌다. iOS 유형 클라이언트는 이 제한을 받지 않아 같은 코드가 iOS에서만 동작했다.

## 선택지

| 방식 | 장점 | 단점 |
|------|------|------|
| 콘솔에서 custom URI scheme 활성화 | 코드 변경 최소 (리다이렉트 스킴만 교체), 30분 내 작업 | Google이 deprecated로 명시한 경로 — 정책이 다시 바뀌면 재발. 신규 클라이언트는 기본 비활성이라 팀원이 클라이언트를 새로 만들면 또 막힘 |
| 네이티브 SDK 전환 | Google 권장 경로, 브라우저를 거치지 않아 UX 개선(네이티브 계정 선택 시트) | Web 유형 클라이언트 신규 발급 + SHA-1 등록 + 네이티브 재빌드 필요, Expo Go 사용 불가 |

## 이유

- 콘솔 토글은 Google이 스스로 걷어내려는 기능이라 같은 문제가 재발할 여지를 남긴다
- 브라우저 왕복이 사라져 Android 로그인 UX가 개선된다
- 이 프로젝트는 이미 dev-client 방식(Sentry 등 커스텀 네이티브 모듈)이라 Expo Go 제약이 새로운 비용이 아니다
- `expo-auth-session` 의존성을 제거할 수 있다 (카카오는 `expo-web-browser`를 직접 사용)

## 클라이언트 ID 역할 분리

전환 후 플랫폼별로 idToken의 `aud`가 달라진다. 백엔드는 두 값을 모두 유효한 audience로 허용해야 한다.

| 클라이언트 유형 | 역할 | 앱 코드 참조 |
|----------------|------|-------------|
| iOS | iOS idToken의 `aud` | `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` |
| Web | Android idToken의 `aud` (네이티브 SDK가 사용) | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` |
| Android | Play services가 패키지명 + SHA-1로 앱 정품 여부 검증 | **없음** — 콘솔에만 존재 |

> **Android 유형 클라이언트를 삭제하면 안 된다.** 앱 코드가 ID를 참조하지 않으니 불필요해 보이지만, 지우면 즉시 `DEVELOPER_ERROR`로 로그인이 실패한다. 반대로 audience 목록에는 넣지 않는다 — `aud`로 등장하지 않기 때문.

Google은 `패키지명 + SHA-1` 조합을 프로젝트 간 전역으로 유일하게 관리하고, 클라이언트 1개당 SHA-1 1개만 허용한다. 따라서 로컬 debug 빌드와 EAS 빌드는 **각각 별도의 Android 유형 클라이언트**가 필요하다(패키지명은 동일).

## 백엔드 영향

`AuthService.googleLogin()`의 `validAudiences`가 `GOOGLE_ANDROID_CLIENT_ID` → `GOOGLE_WEB_CLIENT_ID`로 변경. 값이 비어 있으면 `google-auth-library`가 `undefined`를 "검증 안 함"으로 처리해 audience 체크가 사실상 스킵되므로, 두 변수 모두 반드시 채워야 한다.

## 나중에 추가 고려

- iOS도 같은 네이티브 SDK로 통일 (현재 iOS는 전환 후에도 iOS 클라이언트 ID로 동작 중이라 급하지 않음)
- Play Store 배포 시 Play App Signing이 앱을 재서명하므로, 앱 서명 키 인증서의 SHA-1로 Android 클라이언트를 하나 더 등록해야 함
