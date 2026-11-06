# 가계부탁 안드로이드 앱 (TWA)

웹사이트(https://woorijip-iota.vercel.app)를 그대로 띄우는 Trusted Web Activity 앱입니다. 웹을 배포하면 앱에도 바로 반영되므로 기능이 바뀔 때마다 앱을 다시 올릴 필요는 없습니다.

- 패키지: `app.gagyebutak.twa`
- 설정: `twa-manifest.json` → 바꾼 뒤 `npx @bubblewrap/cli update --skipVersionUpgrade --manifest=./twa-manifest.json`로 Android 프로젝트를 다시 만든다.
- 빌드·서명: `bash twa/build.sh` → `app-release-bundle.aab`(Play Console), `app-release-signed.apk`(직접 설치)
- 새 버전을 올릴 때는 `twa-manifest.json`의 `appVersionCode`(+1)와 `appVersionName`을 올린 뒤 update → build.

## 서명 키 (중요)
- `android.keystore`, `keystore-password.txt`는 git에 없다. 잃어버리면 같은 앱으로 업데이트할 수 없으니 안전한 곳에 백업한다.
- 업로드 키 SHA-256: `E3:C2:B3:99:19:C2:53:B7:7C:12:BB:29:18:25:B1:19:02:47:DD:E7:4F:12:D6:A1:16:91:FC:2C:17:D7:B6:5A`
- Play 앱 서명을 쓰면 Play Console → 앱 무결성 → "앱 서명 키 인증서"의 SHA-256을 `public/.well-known/assetlinks.json`에 추가해야 앱 상단 주소창이 사라진다.
