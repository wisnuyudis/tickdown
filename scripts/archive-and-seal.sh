#!/usr/bin/env bash
#
# Pengganti tombol "Archive & Seal" di AppSealing Assistant.
#
# Assistant menulis ExportOptions.plist sendiri secara hardcode
# (AppSealingAssistant.app/Contents/Resources/Scripts/appsealing_noninteractive.sh
# baris 98-111) yang hanya berisi method/uploadBitcode/uploadSymbols. Tanpa
# signingStyle dan provisioningProfiles, export gagal dengan "requires a
# provisioning profile" pada project yang memakai manual signing.
#
# Manual signing sendiri wajib di sini: automatic signing membuat Xcode memakai
# Cloud Managed distribution certificate yang private key-nya ada di server
# Apple, sehingga generate_hash tidak bisa re-sign dan berhenti di STEP 7
# dengan "Certificate SHA1 mismatch".
#
# Flag sealing tambahan bisa dioper langsung, mis:
#   ./scripts/archive-and-seal.sh -securefile=enable -url_scheme=tickdown
#
# Pakai --no-seal untuk berhenti setelah IPA jadi (tidak memotong kuota sealing).
#
set -euo pipefail

NO_SEAL=0
ARGS=()
for arg in "$@"; do
  case "$arg" in
    --no-seal) NO_SEAL=1 ;;
    *) ARGS+=("$arg") ;;
  esac
done

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE="$PROJECT_ROOT/ios/Tickdown.xcworkspace"
SCHEME="Tickdown"
EXPORT_PATH="$PROJECT_ROOT/Build"
EXPORT_OPTIONS="$PROJECT_ROOT/ios/ExportOptions.plist"
ARCHIVE_PATH="$EXPORT_PATH/Tickdown.xcarchive"
LOG_FILE="$EXPORT_PATH/build.log"
# SDK wajib berada di ios/AppSealingSDK: generate_hash mencari package.json di
# __dir__/../.. untuk mendeteksi versi React Native. Kalau folder ini dipindah,
# deteksi gagal, penggantian engine Hermes dilewati diam-diam, dan aplikasi
# hasil sealing crash saat launch (EXC_BAD_ACCESS di interpretFunctionImpl).
HASH_SCRIPT="$PROJECT_ROOT/ios/AppSealingSDK/generate_hash"

# antiswizzle WAJIB disable untuk React Native. React/Base/RCTUtils.mm memakai
# method_exchangeImplementations (RCTSwapClassMethods, RCTSwapInstanceMethods,
# RCTSwapInstanceMethodWithBlock), jadi aplikasi ini melakukan swizzling secara
# sah dan deteksinya akan menyala di perangkat bersih. AppSealing sendiri
# mematikannya secara default justru karena alasan ini; nilai 'enable' berasal
# dari default AppSealing Assistant, yang tidak cocok untuk React Native.
#
# call-protection memakai action=callback: SDK hanya melaporkan, tidak
# menampilkan alert dan tidak menutup aplikasi. Seluruh penegakan ada di
# ios/Tickdown/CallRiskMonitor.swift dan src/state/useSecurityAlert.ts, supaya
# peringatannya memakai sheet kita sendiri dan sinyal berkepercayaan rendah
# tidak ikut menutup aplikasi. Jangan ubah ke warning/exit/warning-exit tanpa
# menyesuaikan kode itu — SDK dan aplikasi akan sama-sama bereaksi.
SEALING_FLAGS=(
  -antiswizzle=disable
  -antihook=enable
  -securefile=disable
  -prevent-screencap=disable
  -call-protection=enable,action=callback
)

mkdir -p "$EXPORT_PATH"

echo "==> [1/6] Memeriksa dependency"
# Fortify ScanCentral pernah mengosongkan node_modules dan membuat script phase
# Hermes gagal ("with-environment.sh: No such file or directory").
if [ ! -f "$PROJECT_ROOT/node_modules/react-native/scripts/xcode/with-environment.sh" ]; then
  echo "    react-native tidak lengkap di node_modules. Menjalankan npm install..."
  ( cd "$PROJECT_ROOT" && npm install )
fi
echo "    OK"

echo "==> [2/6] Memeriksa signing identity"
CERT_SHA1=$(/usr/libexec/PlistBuddy -c "Print :signingCertificate" "$EXPORT_OPTIONS")
if ! security find-identity -v -p codesigning | grep -qi "$CERT_SHA1"; then
  echo "    GAGAL: certificate $CERT_SHA1 tidak ada di keychain."
  echo "    Identity yang tersedia:"
  security find-identity -v -p codesigning
  exit 1
fi
echo "    OK: $CERT_SHA1"

echo "==> [3/6] Clean (log: $LOG_FILE)"
xcodebuild clean -workspace "$WORKSPACE" -scheme "$SCHEME" > "$LOG_FILE" 2>&1

echo "==> [4/6] Archive"
rm -rf "$ARCHIVE_PATH"
xcodebuild archive \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -archivePath "$ARCHIVE_PATH" \
  -destination "generic/platform=iOS" \
  >> "$LOG_FILE" 2>&1
[ -d "$ARCHIVE_PATH" ] || { echo "    Archive gagal. Lihat $LOG_FILE"; exit 1; }
echo "    OK: $ARCHIVE_PATH"

echo "==> [5/6] Export IPA (manual signing)"
# Assistant memakai -allowProvisioningUpdates di sini; sengaja tidak dipakai
# supaya Xcode tidak diam-diam membuat Cloud Managed certificate lagi.
rm -rf "$EXPORT_PATH/Payload" "$EXPORT_PATH"/*.ipa
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_PATH" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  >> "$LOG_FILE" 2>&1

IPA=$(find "$EXPORT_PATH" -maxdepth 1 -name "*.ipa" -type f | head -n 1)
[ -n "$IPA" ] || { echo "    Export gagal, IPA tidak ditemukan. Lihat $LOG_FILE"; exit 1; }
echo "    OK: $IPA"

if [ "$NO_SEAL" -eq 1 ]; then
  echo "==> [6/6] Sealing dilewati (--no-seal)"
  echo
  echo "IPA siap di-seal: $IPA"
  exit 0
fi

echo "==> [6/6] Sealing"
[ -x "$HASH_SCRIPT" ] || chmod +x "$HASH_SCRIPT"
"$HASH_SCRIPT" "$IPA" "${SEALING_FLAGS[@]}" ${ARGS[@]+"${ARGS[@]}"}

echo
echo "Selesai. IPA hasil sealing ada di $EXPORT_PATH"
