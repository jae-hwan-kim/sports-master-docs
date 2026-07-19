# sports-master-web 로컬 실행 트러블슈팅 (iOS 시뮬레이터 / 안드로이드 공기계)

## 목표

개발 중인 `sports-master-web`(Expo/React Native) 앱을 배포 없이 로컬에서 즉시 확인한다.
- iOS: Xcode 시뮬레이터
- Android: 공기계(안드로이드 개발 프레임워크 미설치 환경) — dev-client APK 설치

Expo Go는 SDK 버전이 정확히 일치해야 하고 Sentry 등 커스텀 네이티브 모듈을 지원하지 않아 사용하지 않음. 대신 **EAS/로컬 dev-client** 방식을 채택.

---

## 이슈 1: Reanimated ↔ Worklets 버전 페어 불일치

**증상**
```
[Reanimated] Your installed version of Worklets (0.8.3) is not compatible with installed version of Reanimated (4.4.1~4.5.2).
```

**원인**
`react-native-reanimated`와 `react-native-worklets`는 짝을 맞춰 배포되는 페어 패키지. `package.json`에 두 패키지 버전이 서로 안 맞게 박혀 있었음.

**해결**
```
npx expo install react-native-reanimated
```
Expo가 현재 SDK 기준 호환 버전(4.3.1)으로 자동 조정. 수동으로 한쪽만 올리는 시도는 반대쪽과 다시 어긋나 실패했음 — Expo install에 맡기는 것이 정답.

---

## 이슈 2 (근본 원인): `expo-modules-jsi`의 Swift 컴파일 버그

**증상**
`pod install` / iOS 네이티브 빌드가 다음 에러로 계속 실패:
```
weak let runtime: JavaScriptRuntime?
         ^ 'weak' must be a mutable variable, because it may change at runtime
```
15개 파일에서 동일 패턴 반복.

**원인 분석**
- `weak`는 ARC가 참조 해제 시 값을 `nil`로 되돌려 써야 하므로 **`let`(불변)에는 애초에 적용 불가능한 Swift 문법** — Xcode/Swift 버전을 올려도 해결될 수 없는, `expo-modules-jsi` SDK 56 계열(56.0.7~56.0.12 확인)의 소스코드 자체 버그.
- Xcode 26.0.1(당시 최신), Swift 6.2 조합에서도 동일하게 발생 → 로컬 툴체인 문제가 아님을 확인.
- 버전을 56.0.7~56.0.9로 낮춰도 동일 → 해당 SDK 라인 전체의 문제로 결론.

**검증 방법**
별도 폴더에 `npx create-expo-app@latest`로 최신 SDK(57) 테스트 프로젝트를 생성해 동일 빌드를 시도 → `expo-modules-jsi@57.0.3`에서는 정상 컴파일됨을 확인. SDK 57에서 버그가 해결되었음이 명확해짐.

**해결**
`sports-master-web`을 **Expo SDK 56 → 57로 업그레이드**.
```
npx expo install expo@57
npx expo install --fix
rm -rf node_modules ios android pnpm-lock.yaml
pnpm install
```
(56.0.x를 겨냥해 걸어둔 `expo-modules-jsi` override는 57 업그레이드 후 제거)

---

## 이슈 3: Sentry 소스맵 업로드 실패로 빌드 중단

**증상**
```
error: sentry-cli - An organization ID or slug is required (provide with --org)
```

**원인**
Xcode Build Phase `Upload Debug Symbols to Sentry`가 로컬 개발 빌드에서도 실행되는데, 로컬에는 Sentry 조직/프로젝트 인증 정보가 없어 실패. 기본 설정은 이 실패를 빌드 전체 실패로 취급함.

**해결**
로컬 개발 빌드에서는 소스맵 자동 업로드가 필요 없으므로 비활성화.
```
# sports-master-web/.env
SENTRY_DISABLE_AUTO_UPLOAD=true
```
`.gitignore`에 `.env` 추가(기존엔 `.env*.local`만 있어 순수 `.env`는 커밋 대상이었음).

---

## 이슈 4: iOS/Android 네이티브 폴더의 URI scheme 불일치

**증상**
```
Could not find a shared URI scheme for the dev client between the local /ios and /android directories.
```
공기계에서 QR을 스캔해도 딥링크가 깨져 `localhost:8081`로만 연결 시도하다 실패.

**원인**
`ios/`는 로컬에서 `npx expo run:ios`로, `android/`는 EAS 클라우드 빌드가 자체적으로 각각 **다른 시점**에 생성됨. 그 사이 `app.json` 설정(SDK 업그레이드 등)이 바뀌어서 두 플랫폼이 계산한 URI scheme이 서로 어긋남.

**해결**
두 네이티브 폴더를 동시에, 같은 시점의 설정 기준으로 재생성.
```
rm -rf ios android
npx expo prebuild --clean
```
이후 Android dev-client APK 재빌드.

---

## 이슈 5: Android SDK/Java 미설치로 로컬 빌드 불가

**증상**
```
CommandError: No Android connected device found, and no emulators could be started automatically.
```
및 (SDK 인식 후)
```
The operation couldn't be completed. Unable to locate a Java Runtime.
```

**원인**
Mac에 Android Studio(및 Android SDK, JDK)가 아예 설치되어 있지 않았음. `adb`, `emulator`, `java`가 모두 PATH에 없어 `npx expo run:android`가 기기/에뮬레이터를 찾지 못함.

**해결**
1. Android Studio 설치 (https://developer.android.com/studio) — Standard 옵션으로 SDK까지 함께 설치됨
2. `~/.zshrc`에 환경변수 추가
   ```
   export ANDROID_HOME=$HOME/Library/Android/sdk
   export PATH=$PATH:$ANDROID_HOME/emulator
   export PATH=$PATH:$ANDROID_HOME/platform-tools
   export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
   export PATH=$JAVA_HOME/bin:$PATH
   ```
   ```
   source ~/.zshrc
   ```
3. **VSCode 통합 터미널은 `.zshrc` 수정 전에 열려있던 세션이면 새 환경변수를 못 읽음** — 터미널 탭을 새로 열거나 VSCode를 완전히 재시작해야 반영됨
4. Android Studio → Device Manager에서 에뮬레이터 생성 (예: Pixel 9, API 36.1 "Baklava")

---

## 이슈 6: 서명 충돌로 APK 재설치 실패

**증상**
```
INSTALL_FAILED_UPDATE_INCOMPATIBLE: Existing package sports.master signatures do not match newer version; ignoring!
```

**원인**
같은 패키지명(`sports.master`)으로 이전에 **다른 서명 키**(EAS 클라우드 빌드 등)로 설치된 앱이 이미 있어서, 다른 키로 서명된 로컬 debug 빌드가 덮어쓰지 못함.

**해결**
기존 앱을 지우고 재설치.
```
adb uninstall sports.master
npx expo run:android
```

---

## 최종 결과

- **iOS**: SDK 57 업그레이드 후 `npx expo run:ios --device "iPhone 17 Pro"`로 시뮬레이터 빌드·실행 성공. Fast Refresh로 JS/스타일 수정 즉시 반영 확인.
- **Android**: Android Studio + SDK 설치, 에뮬레이터 생성, `npx expo run:android`로 로컬 빌드·설치 성공. 공기계는 EAS dev-client APK 설치 후 Metro 연결(`--tunnel`)로 확인 성공.

## 핵심 교훈

1. **버전 불일치 에러가 반복되면 수동으로 버전을 맞추기보다 `npx expo install [--fix]`로 SDK 호환 매트릭스에 맡긴다.**
2. **컴파일러가 아무리 최신이어도 안 되는 에러는 패키지 자체 버그일 수 있다** — 별도 클린 프로젝트로 최신 SDK를 검증해보는 것이 원인 파악에 가장 빠른 방법이었음.
3. 로컬 개발 빌드에는 Sentry 소스맵 업로드가 불필요 — `SENTRY_DISABLE_AUTO_UPLOAD=true`로 상시 비활성화 권장.
4. **`ios/`, `android/` 네이티브 폴더는 항상 같은 시점에 `npx expo prebuild`로 함께 재생성**해야 URI scheme 등이 어긋나지 않는다.
5. 같은 패키지명으로 여러 서명 키(EAS/로컬 debug)의 빌드를 오갈 땐 재설치 전 `adb uninstall`이 필요할 수 있다.
