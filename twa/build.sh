#!/usr/bin/env bash
# 가계부탁 안드로이드(TWA) 앱 빌드·서명. 사용: bash twa/build.sh
# - 프로젝트 경로에 한글이 있으면 Gradle이 실패하므로 ASCII 경로로 복사해서 빌드한다.
# - 서명 키(android.keystore)와 비밀번호(keystore-password.txt)는 git에 올리지 않는다. 잃어버리면 같은 앱으로 업데이트할 수 없으니 따로 백업할 것.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
JBR="/c/Program Files/Android/Android Studio/jbr"
BT="/c/Android/sdk/build-tools/36.1.0"
WORK="${TMPDIR:-/tmp}/gagyebutak-twa-build"
PW="$(cat "$HERE/keystore-password.txt")"

rm -rf "$WORK" && mkdir -p "$WORK"
(cd "$HERE" && tar --exclude=.gradle --exclude=build --exclude='*.apk' --exclude='*.aab' -cf - .) | (cd "$WORK" && tar -xf -)
cd "$WORK"
JAVA_HOME="$JBR" ./gradlew --no-daemon assembleRelease bundleRelease

"$BT/zipalign.exe" -f -p 4 app/build/outputs/apk/release/app-release-unsigned.apk aligned.apk
"$BT/apksigner.bat" sign --ks "$HERE/android.keystore" --ks-key-alias android --ks-pass "pass:$PW" --key-pass "pass:$PW" --out "$HERE/app-release-signed.apk" aligned.apk
cp app/build/outputs/bundle/release/app-release.aab "$HERE/app-release-bundle.aab"
"$JBR/bin/jarsigner.exe" -keystore "$HERE/android.keystore" -storepass "$PW" -keypass "$PW" "$HERE/app-release-bundle.aab" android > /dev/null
echo "완료: $HERE/app-release-bundle.aab (Play Console 업로드용), $HERE/app-release-signed.apk (폰에 직접 설치용)"
