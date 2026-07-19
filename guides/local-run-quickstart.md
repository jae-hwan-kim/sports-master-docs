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
