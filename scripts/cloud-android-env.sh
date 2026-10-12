#!/usr/bin/env bash
# Source this file for the cloud Android toolchain; Android Studio uses its own SDK.
export MEDICINE_ANDROID_TOOLS=/workspace/.cache/medicine-alarm-android
export JAVA_HOME="$MEDICINE_ANDROID_TOOLS/jdk-21.0.12.1"
export ANDROID_HOME="$MEDICINE_ANDROID_TOOLS/sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export ANDROID_USER_HOME="$MEDICINE_ANDROID_TOOLS/user"
export GRADLE_USER_HOME="$MEDICINE_ANDROID_TOOLS/gradle"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
export MEDICINE_PROXY_HOST="$(node -e 'const value = process.env.HTTPS_PROXY || process.env.HTTP_PROXY; if (value) console.log(new URL(value).hostname)')"
export MEDICINE_PROXY_PORT="$(node -e 'const value = process.env.HTTPS_PROXY || process.env.HTTP_PROXY; if (value) { const url = new URL(value); console.log(url.port || (url.protocol === "https:" ? 443 : 80)); }')"
MEDICINE_JAVA_FLAGS="-Duser.home=$MEDICINE_ANDROID_TOOLS/user -Djavax.net.ssl.trustStore=$MEDICINE_ANDROID_TOOLS/trust/cacerts"
if [[ -n "$MEDICINE_PROXY_HOST" ]]; then
  MEDICINE_JAVA_FLAGS="$MEDICINE_JAVA_FLAGS -Dhttp.proxyHost=$MEDICINE_PROXY_HOST -Dhttp.proxyPort=$MEDICINE_PROXY_PORT -Dhttps.proxyHost=$MEDICINE_PROXY_HOST -Dhttps.proxyPort=$MEDICINE_PROXY_PORT"
fi
export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:+$JAVA_TOOL_OPTIONS }$MEDICINE_JAVA_FLAGS"
