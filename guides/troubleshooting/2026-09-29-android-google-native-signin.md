# Android 구글 로그인 실패 → 네이티브 SDK 전환 트러블슈팅

## 목표

iOS에서는 정상 동작하는 구글 소셜 로그인이 Android에서만 실패하는 원인을 찾아 해결한다.

결론부터: 코드 버그가 아니라 **Google의 정책 변경**이었다. `expo-auth-session`의 브라우저 리다이렉트 방식이 Android 유형 OAuth 클라이언트에서 차단되어, 네이티브 SDK(`@react-native-google-signin/google-signin`)로 전환했다. 결정 배경은 [ADR 005](../../adr/005-android-google-native-signin.md) 참고.

---

## 이슈 1 (근본 원인): Android 클라이언트의 custom URI scheme 차단

**증상**
Android에서 구글 로그인을 누르면 브라우저가 열렸다가 "액세스 차단됨" 화면으로 끝남. 앱에는 "구글 로그인 설정이 완료되지 않았습니다"만 표시되고 실제 원인을 알 수 없었음.

**원인 분석**
앱 로그로는 원인이 안 보여서 authorization endpoint를 직접 호출해 비교했다. 같은 파라미터로 client ID만 바꿔 요청하니 iOS 클라이언트는 계정 선택 화면까지 진입하고 Android 클라이언트만 400으로 떨어졌다. 에러 페이지의 "오류 세부정보"를 펼치면 실제 사유가 나온다.

```
400 오류: invalid_request
Custom URI scheme is not enabled for your Android client.
```

Google은 신규 Android 유형 OAuth 클라이언트의 custom URI scheme 리다이렉트를 기본 차단한다. `expo-auth-session`은 브라우저를 열고 custom scheme으로 앱에 복귀하는 구조이므로, 리다이렉트 스킴을 역방향 client ID로 쓰든 패키지명(`sports.master:/oauthredirect`)으로 쓰든 Android에서는 모두 400이다. 콘솔의 "고급 설정"에서 예외적으로 켤 수 있지만 Google이 deprecated로 명시한 경로라 채택하지 않았다.

**해결**
`expo-auth-session` 제거 후 `@react-native-google-signin/google-signin` 도입. Android는 Web 유형 클라이언트 ID로 idToken을 발급받고(`aud` = Web client ID), 백엔드 `validAudiences`도 같이 교체.

---

## 이슈 2: 에러가 전부 삼켜져 진단이 불가능했음

**증상**
플랫폼·원인과 무관하게 항상 같은 안내 문구만 표시. Sentry에도 아무것도 올라오지 않음.

**원인**
`promptGoogle()`이 성공 외 모든 결과를 `null`로 반환해 사용자 취소와 설정 오류가 구분되지 않았고, 호출부의 `catch {}`가 예외 객체를 받지도 않고 버렸다.

**해결**
취소(`cancel`/`dismiss`)만 `null`로 조용히 종료하고, 그 외 실패는 원인을 담아 throw. `LoginScreen`의 `catch`에서 `Sentry.captureException(error, { tags: { flow: 'google-auth', platform: Platform.OS } })`로 전송.

> 이번 문제의 실제 원인 규명에 가장 오래 걸린 이유가 이 부분이었다. 소셜 로그인처럼 외부 요인이 많은 플로우에서 예외를 뭉개면 안 된다.

---

## 이슈 3: 콘솔 프로젝트를 잘못 선택해 클라이언트 생성 실패

**증상**
Android 유형 클라이언트를 만들려 하면:
```
Android 패키지 이름과 디지털 지문이 이미 사용 중이므로 요청이 실패했습니다.
```

**원인**
Google AI Studio가 Gemini API 키 발급용으로 자동 생성한 프로젝트(`gen-lang-client-...`)에서 작업하고 있었다. sports-master의 OAuth 클라이언트는 다른 프로젝트에 있다. Google은 `패키지명 + SHA-1` 조합을 **프로젝트 간 전역으로** 유일하게 관리하므로, 다른 프로젝트에 이미 같은 조합이 등록돼 있으면 중복으로 거부된다.

**해결**
프로젝트 선택기에서 기존 iOS/Android 클라이언트가 있는 프로젝트(프로젝트 번호로 확인)로 전환한 뒤 Web 클라이언트를 생성.

> 이 중복 에러는 오히려 **debug SHA-1이 이미 등록돼 있다는 확인**이 된다. Play services는 패키지명+SHA-1로 앱을 검증하므로, 어느 클라이언트에든 등록만 돼 있으면 로그인이 동작한다.
>
> 주의: Android 로그인은 `webClientId`가 Android 클라이언트와 **같은 프로젝트**에 속해야 한다. 프로젝트가 다르면 `DEVELOPER_ERROR`로 떨어진다.

---

## 이슈 4: iOS에서 `RNGoogleSignin could not be found`

**증상**
```
ERROR [runtime not ready]: Invariant Violation: TurboModuleRegistry.getEnforcing(...):
'RNGoogleSignin' could not be found. Verify that a module by this name is registered
in the native binary.
```

**원인**
시뮬레이터에 설치된 앱이 pod 추가 이전 바이너리였다. 네이티브 모듈은 JS 번들 갱신만으로는 들어가지 않는다.

**해결**
`npx expo run:ios` 재실행. Android는 `installDebug`로 새로 설치했기 때문에 정상이었다.

---

## 이슈 5: `pod install`이 `Encoding::CompatibilityError`로 죽음

**증상**
```
unicode_normalize/normalize.rb:153:in 'UnicodeNormalize.normalize':
Unicode Normalization not appropriate for ASCII-8BIT (Encoding::CompatibilityError)
```

**원인**
셸에 `LANG`이 UTF-8로 설정되지 않은 환경에서 CocoaPods가 경로를 정규화할 때 발생. Terminal.app은 로케일을 자동으로 주입하지만, VSCode 통합 터미널이나 스크립트 실행 환경에서는 비어 있을 수 있다.

**해결**
```
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx expo run:ios
```
`~/.zshrc`에 `export LANG=en_US.UTF-8`을 추가하면 영구 해결. 현재 값은 `echo $LANG`으로 확인.

---

## 이슈 6: xcodebuild error 65

**증상**
```
CommandError: Failed to build iOS project. "xcodebuild" exited with error code 65.
```

**원인**
같은 프로젝트에서 `npx expo run:ios`를 두 번 동시에 실행. 두 xcodebuild가 같은 빌드 디렉터리를 공유하며 중간 산출물을 덮어썼다.

**해결**
하나만 남기고 기다린다. 참고로 출력 마지막에 보이는 `Based on dependency analysis` 는 스크립트 페이즈 경고일 뿐 에러가 아니므로, 실제 원인은 그 위의 `error:` 줄에서 찾아야 한다.

---

## 최종 결과

- **Android**: 네이티브 계정 선택 시트로 로그인 성공. 브라우저를 거치지 않음.
- **iOS**: 재빌드 후 `RNGoogleSignin` 링크 확인, 기존 iOS 클라이언트 ID 그대로 동작.
- `expo-auth-session` 의존성 제거 (카카오는 `expo-web-browser`를 직접 사용하므로 영향 없음).

## 핵심 교훈

1. **소셜 로그인이 한 플랫폼에서만 깨지면 코드보다 콘솔·정책을 먼저 의심한다.** authorization endpoint를 직접 호출해 client ID만 바꿔 비교하면 원인을 즉시 가를 수 있다.
2. **Google 에러 페이지의 "오류 세부정보"를 반드시 펼쳐본다** — `invalid_request`만 보면 아무 정보가 없지만 세부정보에 정확한 사유가 적혀 있다.
3. **예외를 뭉개지 않는다.** `catch {}` 하나 때문에 원인 규명이 크게 지연됐다.
4. **콘솔 작업 전 프로젝트 번호를 확인한다.** Gemini API 등 자동 생성 프로젝트가 섞여 있으면 엉뚱한 곳에 클라이언트를 만들게 되고, Android 로그인은 Web/Android 클라이언트가 같은 프로젝트여야 동작한다.
5. **네이티브 의존성이 추가되면 양 플랫폼 모두 재빌드**해야 한다. 한쪽만 설치하면 반대쪽에서 `TurboModuleRegistry` 에러가 난다.
6. 빌드는 한 번에 하나만. 동시 실행은 error 65로 끝난다.
