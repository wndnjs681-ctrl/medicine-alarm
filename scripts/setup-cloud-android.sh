#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/cloud-android-env.sh
mkdir -p "$MEDICINE_ANDROID_TOOLS/downloads" "$MEDICINE_ANDROID_TOOLS/trust" "$ANDROID_USER_HOME"
if [[ ! -x "$JAVA_HOME/bin/javac" ]]; then
  curl --fail --location --silent --show-error --output "$MEDICINE_ANDROID_TOOLS/downloads/jdk.tar.gz" https://download.oracle.com/java/21/archive/jdk-21.0.12.1_linux-x64_bin.tar.gz
  printf '%s  %s\n' 12f870b21301b42292558a3f872ce543affa2b86cb6458591c78388c41ddb111 "$MEDICINE_ANDROID_TOOLS/downloads/jdk.tar.gz" | sha256sum --check -
  tar --extract --gzip --file "$MEDICINE_ANDROID_TOOLS/downloads/jdk.tar.gz" --directory "$MEDICINE_ANDROID_TOOLS"
fi
if [[ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]]; then
  curl --fail --location --silent --show-error --output "$MEDICINE_ANDROID_TOOLS/downloads/commandlinetools.zip" https://dl.google.com/android/repository/commandlinetools-linux-16111833_latest.zip
  printf '%s  %s\n' e025545c62a8e64c7559119566a569fb1dec5f60 "$MEDICINE_ANDROID_TOOLS/downloads/commandlinetools.zip" | sha1sum --check -
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  unzip -q "$MEDICINE_ANDROID_TOOLS/downloads/commandlinetools.zip" -d "$ANDROID_HOME/cmdline-tools"
  mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
fi
cp /etc/ssl/certs/java/cacerts "$MEDICINE_ANDROID_TOOLS/trust/cacerts"
if [[ -f /usr/local/share/ca-certificates/environment-proxy-ca.crt ]]; then
  "$JAVA_HOME/bin/keytool" -importcert -noprompt -alias medicine-alarm-session-proxy -file /usr/local/share/ca-certificates/environment-proxy-ca.crt -keystore "$MEDICINE_ANDROID_TOOLS/trust/cacerts" -storepass changeit
fi
sdk_args=(--sdk_root="$ANDROID_HOME")
if [[ -n "$MEDICINE_PROXY_HOST" ]]; then
  sdk_args+=(--proxy=http --proxy_host="$MEDICINE_PROXY_HOST" --proxy_port="$MEDICINE_PROXY_PORT")
fi
# sdkmanager's exit code is preserved even when yes exits after its input closes.
(set +o pipefail; yes | sdkmanager "${sdk_args[@]}" --licenses) > /tmp/medicine-alarm-sdk-licenses.log
sdkmanager "${sdk_args[@]}" 'platform-tools' 'platforms;android-36' 'build-tools;35.0.0' 'build-tools;36.0.0'
java -version
javac -version
