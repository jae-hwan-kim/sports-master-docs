# sports-master-web 로컬 실행 가이드 (처음 시작하는 사람용)

이 문서는 `sports-master-web`을 처음 받은 사람이 iOS 시뮬레이터, 안드로이드 에뮬레이터, 실물 기기(공기계)에서 앱을 띄우기까지 필요한 명령어를 순서대로 정리한 것입니다. 문제가 생기면 [troubleshooting/](troubleshooting/) 폴더의 기록을 참고하세요.

---

## 0. 사전 준비 (한 번만)

### 공통
```
cd sports-master-web
pnpm install
```

### iOS (Mac + Xcode 필요)
- App Store에서 **Xcode** 설치
- Xcode → Settings → Platforms 탭에서 iOS 시뮬레이터 런타임 다운로드 확인

### Android
1. [Android Studio](https://developer.android.com/studio) 설치 (Standard 옵션 — SDK 자동 포함)
2. `~/.zshrc`에 아래 내용 추가:
   ```
   export ANDROID_HOME=$HOME/Library/Android/sdk
   export PATH=$PATH:$ANDROID_HOME/emulator
   export PATH=$PATH:$ANDROID_HOME/platform-tools
   export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
   export PATH=$JAVA_HOME/bin:$PATH
   ```
3. 적용 및 확인:
   ```
   source ~/.zshrc
   adb --version
   java -version
   ```
   > VSCode 통합 터미널을 쓰고 있다면, `.zshrc` 수정 후 **새 터미널 탭을 열거나 VSCode를 재시작**해야 환경변수가 반영됩니다.
4. Android Studio → **Tools → Device Manager**(또는 시작 화면 More Actions → Virtual Device Manager) → **Create Device**에서 에뮬레이터 생성 (예: Pixel 9, API 36.1 "Baklava")
   > 에뮬레이터는 **Play Store가 포함된 이미지**로 만드세요. 구글 로그인이 Play services를 요구하므로, 없는 이미지에서는 로그인이 실패합니다.

### 구글 로그인 (소셜 로그인 테스트가 필요할 때만)

Google Cloud Console에서 클라이언트 3종이 필요합니다. 전환 배경은 [ADR 005](../adr/005-android-google-native-signin.md).

| 유형 | 용도 | 앱에서 참조 |
|------|------|------------|
| iOS | iOS idToken의 `aud` | `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` |
| Web | Android idToken의 `aud` | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` |
| Android | Play services의 패키지명+SHA-1 검증 | 없음 (콘솔에만 등록) |

1. **Web 유형 클라이언트 생성** — 리다이렉트 URI / 자바스크립트 원본은 비워둡니다(리다이렉트에 쓰지 않고 `aud` 값으로만 사용). 발급된 ID를 앱 `.env`의 `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`와 API `.env`의 `GOOGLE_WEB_CLIENT_ID`에 **같은 값으로** 넣습니다.
2. **Android 유형 클라이언트에 SHA-1 등록** — 로컬 debug 빌드의 지문을 확인해 등록합니다.
   ```
   keytool -list -v -keystore sports-master-web/android/app/debug.keystore      -storepass android -alias androiddebugkey | grep SHA1
   ```
   EAS 빌드용 지문은 `npx eas-cli credentials -p android`에서 확인합니다. Google은 클라이언트 1개당 SHA-1 1개만 허용하므로 **debug와 EAS는 별도 클라이언트 2개**로 만듭니다(패키지명은 `sports.master` 동일).

> **모든 클라이언트는 같은 프로젝트에 있어야 합니다.** 프로젝트 번호로 확인하세요. Google AI Studio가 만든 `gen-lang-client-...` 프로젝트에 섞어 만들면 Android 로그인이 `DEVELOPER_ERROR`로 실패합니다.
>
> `패키지명 + SHA-1` 조합은 프로젝트 간 전역으로 유일합니다. 생성 시 "이미 사용 중" 에러가 나면 다른 클라이언트에 이미 등록돼 있다는 뜻이고, 그 상태로도 로그인은 동작합니다.

---

## 1. iOS 시뮬레이터에서 실행

```
npx expo run:ios
```
- 특정 시뮬레이터를 지정하려면:
  ```
  npx expo run:ios --device "iPhone 17 Pro"
  ```
- 이후 코드 수정은 Metro가 자동으로 감지해 Fast Refresh로 반영됩니다.

---

## 2. Android 에뮬레이터에서 실행

에뮬레이터를 먼저 켜두거나, 그냥 아래 명령을 실행하면 자동으로 켜집니다.
```
npx expo run:android
```
- 이전에 다른 서명(예: EAS 빌드)으로 설치된 적이 있다면 아래 에러가 날 수 있습니다:
  ```
  INSTALL_FAILED_UPDATE_INCOMPATIBLE
  ```
  이 경우 기존 앱을 지우고 재시도:
  ```
  adb uninstall sports.master
  npx expo run:android
  ```

---

## 3. 공기계(실물 기기)에서 확인

Android Studio/Xcode 로컬 툴체인 없이도, EAS 클라우드 빌드로 만든 dev-client를 설치해서 확인할 수 있습니다.

### 3-1. dev-client APK 빌드 (최초 1회, 또는 네이티브 의존성이 바뀌었을 때)
```
npx eas build --platform android --profile development
```
빌드 완료 후 터미널에 나오는 QR/링크로 공기계에 APK 다운로드 → 설치 ("출처를 알 수 없는 앱" 설치 허용 필요)

### 3-2. Metro 서버 실행
```
npx expo start --dev-client
```
- 공기계와 Mac이 같은 Wi-Fi면 QR 스캔으로 바로 연결
- 네트워크가 다르거나 연결이 안 되면 터널 모드 사용:
  ```
  npx expo start --dev-client --tunnel
  ```

### 3-3. 앱에서 서버 연결
dev-client 앱을 열면 나오는 **"Development servers"** 화면에서:
- **Fetch development servers** 버튼으로 자동 탐색, 또는
- `http://<Mac IP>:8081` 을 직접 입력 후 **Connect**

---

## 4. 코드 수정 후 반영 방식

| 변경 종류 | 반영 방법 |
|---|---|
| JS/TS 코드, 스타일(NativeWind) | 저장 시 Fast Refresh로 즉시 반영 (재실행 불필요) |
| 네이티브 의존성 추가/변경, `app.json` plugins 변경 | `npx expo run:ios` / `npx expo run:android` 재실행 필요 |
| 공기계 dev-client 사용 중 네이티브 변경 | EAS dev-client APK 재빌드 + 재설치 필요 |

---

## 5. 리뷰어에게 앱 전달하기 (배포용 빌드)

dev-client는 개발자 전용이므로, 리뷰를 위해 다른 사람에게 전달할 땐 독립 실행형 빌드를 만듭니다.

### Android
```
npx eas build --platform android --profile preview
```
빌드 완료 시 나오는 링크/QR을 그대로 전달 (리뷰어가 직접 다운로드·설치, 개발자 계정 불필요)

### iOS
- **TestFlight** 사용을 권장 (Apple Developer 유료 계정 필요). `eas submit`으로 TestFlight에 업로드 후 리뷰어 이메일 등록
- Apple Developer 계정이 없다면 Ad-hoc 배포(리뷰어 기기 UDID 사전 등록 필요)로 우회 가능하나 번거로움

---

## 자주 겹치는 실수

- **Expo Go는 쓰지 않습니다** — 이 프로젝트는 Sentry 등 커스텀 네이티브 모듈이 있어 dev-client 방식을 사용합니다.
- **`.env`의 `SENTRY_DISABLE_AUTO_UPLOAD=true`는 지우지 마세요** — 없으면 로컬 빌드 시 Sentry 업로드 단계에서 실패합니다.
- **`ios/`, `android/` 폴더는 손으로 하나씩 만들지 말고 항상 같이 재생성**하세요 (`npx expo prebuild --clean`) — 따로 생성하면 딥링크 scheme이 어긋날 수 있습니다.
- **네이티브 의존성이나 `app.json` plugins를 건드렸으면 양쪽 플랫폼을 모두 재빌드**하세요. 한쪽만 설치하면 반대쪽에서 `TurboModuleRegistry.getEnforcing('...') could not be found`가 납니다.
- **`pod install`이 `Encoding::CompatibilityError`로 죽으면 로케일 문제**입니다. `echo $LANG`이 비어 있으면 `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx expo run:ios`로 실행하거나 `~/.zshrc`에 `export LANG=en_US.UTF-8`을 추가하세요. Terminal.app은 자동으로 넣어주지만 VSCode 통합 터미널은 그렇지 않습니다.
- **`npx expo run:ios`를 동시에 두 번 실행하지 마세요** — 같은 빌드 디렉터리를 공유해 `xcodebuild error 65`로 실패합니다.
