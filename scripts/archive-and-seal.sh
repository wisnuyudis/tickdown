#!/usr/bin/env bash
#
# Pengganti tombol "Archive & Seal" di AppSealing / DoveRunner Assistant.
#
# Assistant menulis ExportOptions.plist sendiri dan hanya sanggup memetakan satu
# bundle ID, sehingga app extension (widget) selalu gagal di tahap export. Script
# ini memakai ios/ExportOptions.plist yang memetakan app dan widget sekaligus.
#
# Manual signing wajib di sini: automatic signing membuat Xcode memakai Cloud
# Managed distribution certificate yang private key-nya ada di server Apple,
# sehingga generate_hash tidak bisa re-sign dan berhenti di "Certificate SHA1
# mismatch".
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
PBXPROJ="$PROJECT_ROOT/ios/Tickdown.xcodeproj/project.pbxproj"
SCHEME="Tickdown"
EXPORT_PATH="$PROJECT_ROOT/Build"
EXPORT_OPTIONS="$PROJECT_ROOT/ios/ExportOptions.plist"
ARCHIVE_PATH="$EXPORT_PATH/Tickdown.xcarchive"
LOG_FILE="$EXPORT_PATH/build.log"
SDK_DIR="$PROJECT_ROOT/ios/AppSealingSDK"
HASH_SCRIPT="$SDK_DIR/generate_hash"

# antiswizzle WAJIB disable untuk React Native. React/Base/RCTUtils.mm memakai
# method_exchangeImplementations (RCTSwapClassMethods, RCTSwapInstanceMethods,
# RCTSwapInstanceMethodWithBlock), jadi aplikasi ini melakukan swizzling secara
# sah dan deteksinya akan menyala di perangkat bersih. AppSealing sendiri
# mematikannya secara default justru karena alasan ini; nilai 'enable' berasal
# dari default Assistant, yang tidak cocok untuk React Native.
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

#-----------------------------------------------------------------------------
# generate_hash menghitung root project sebagai __dir__/../.. lalu mencari
# package.json di sana. Kalau meleset, versi React Native tidak terdeteksi dan
# penggantian engine Hermes dilewati TANPA pesan apa pun — sealing tetap
# dilaporkan sukses, IPA terbentuk, lalu aplikasi crash saat launch.
#
# Assistant tidak pernah memindahkan folder SDK; ia hanya mereferensikan lokasi
# yang kamu tunjuk. Jadi SDK yang datar (generate_hash langsung di akarnya)
# sering berakhir di root project, yang selalu salah.
#-----------------------------------------------------------------------------
sdk_sees_project_root() {
  local script="$1"
  [ -f "$script" ] || return 1
  [ "$(cd "$(dirname "$script")/../.." && pwd)" = "$PROJECT_ROOT" ]
}

relocate_sdk() {
  local from="$1"
  echo "    SDK ada di ${from#$PROJECT_ROOT/} — memindahkan ke ios/AppSealingSDK"

  if pgrep -x Xcode >/dev/null; then
    echo "    GAGAL: Xcode sedang berjalan dan bisa menimpa project file."
    echo "    Tutup Xcode lalu jalankan ulang."
    return 1
  fi

  local backup="$PBXPROJ.bak-relocate-$$"
  cp "$PBXPROJ" "$backup"

  mv "$from" "$SDK_DIR"

  # sourceTree "<group>" berarti path relatif terhadap folder ios/, jadi
  # "../AppSealingSDK/..." menjadi "AppSealingSDK/...". Run script phase yang
  # ditulis Assistant memakai path absolut; diganti ${SRCROOT} supaya tidak
  # patah lagi kalau project dipindah.
  #
  # Kutip di sekitar ${SRCROOT} harus di-escape: isi shellScript adalah string
  # ber-quote di dalam plist, jadi kutip mentah akan menutupnya lebih awal dan
  # membuat project.pbxproj tidak bisa diparse.
  python3 - "$PBXPROJ" "$PROJECT_ROOT" <<'PY'
import sys
path, root = sys.argv[1], sys.argv[2]
src = open(path).read()
src = src.replace("../AppSealingSDK/", "AppSealingSDK/")
src = src.replace(root + "/AppSealingSDK/", '\\"${SRCROOT}\\"/AppSealingSDK/')
open(path, "w").write(src)
PY

  if ! sdk_sees_project_root "$HASH_SCRIPT" \
     || ! plutil -lint "$PBXPROJ" >/dev/null 2>&1 \
     || grep -q "\.\./AppSealingSDK/" "$PBXPROJ"; then
    echo "    GAGAL memperbaiki — mengembalikan seperti semula."
    mv "$SDK_DIR" "$from"
    mv "$backup" "$PBXPROJ"
    return 1
  fi

  rm -f "$backup"
  echo "    Diperbaiki. Referensi di project.pbxproj ikut disesuaikan."
}

echo "==> [1/7] Memeriksa dependency"
# Fortify ScanCentral pernah mengosongkan node_modules dan membuat script phase
# Hermes gagal ("with-environment.sh: No such file or directory").
if [ ! -f "$PROJECT_ROOT/node_modules/react-native/scripts/xcode/with-environment.sh" ]; then
  echo "    react-native tidak lengkap di node_modules. Menjalankan npm install..."
  ( cd "$PROJECT_ROOT" && npm install )
fi
echo "    OK"

echo "==> [2/7] Memeriksa letak SDK"
if ! sdk_sees_project_root "$HASH_SCRIPT"; then
  found=""
  for candidate in "$PROJECT_ROOT/AppSealingSDK" "$PROJECT_ROOT/ios/AppSealingSDK"; do
    [ -f "$candidate/generate_hash" ] && { found="$candidate"; break; }
  done

  if [ -z "$found" ]; then
    echo "    GAGAL: generate_hash tidak ditemukan."
    echo "    Unduh SDK dari ADC lalu extract ke ios/AppSealingSDK/"
    exit 1
  fi

  relocate_sdk "$found" || exit 1

  # Periksa ulang setelah perbaikan — jangan percaya begitu saja.
  sdk_sees_project_root "$HASH_SCRIPT" || {
    echo "    GAGAL: letak SDK masih salah setelah perbaikan."
    exit 1
  }
fi
echo "    OK: generate_hash melihat root project di $PROJECT_ROOT"

#-----------------------------------------------------------------------------
# Assistant hanya menyetel SWIFT_OBJC_BRIDGING_HEADER ke AppSealingInterfaceBridge.h.
# File .mm yang berisi RCT_EXPORT_MODULE tidak pernah ikut dikompilasi, jadi
# kelas Objective-C-nya tidak ada di binary dan NativeModules.AppSealingInterfaceBridge
# selalu undefined di JavaScript.
#
# Penyisipan bertumpu pada LEASection.mm sebagai jangkar: Assistant selalu
# menambahkannya ke target aplikasi, jadi baris-barisnya menunjukkan build phase
# dan group mana yang benar tanpa perlu menelusuri PBXNativeTarget. Path-nya pun
# diturunkan dari path LEASection, sehingga ikut benar di mana pun SDK berada.
#-----------------------------------------------------------------------------
add_bridge_to_project() {
  if pgrep -x Xcode >/dev/null; then
    echo "    Xcode sedang berjalan — penambahan dilewati. Tutup Xcode untuk mengaktifkan."
    return 0
  fi

  local backup="$PBXPROJ.bak-bridge-$$"
  cp "$PBXPROJ" "$backup"

  if python3 - "$PBXPROJ" "$PROJECT_ROOT/ios" <<'PY'
import os, re, sys

path, ios_dir = sys.argv[1], sys.argv[2]
src = open(path).read()

anchor = re.search(r'\t\t([0-9A-F]{24}) /\* LEASection\.mm \*/ = \{isa = PBXFileReference;[^\n]*path = ([^;]+);[^\n]*\n', src)
build  = re.search(r'\t\t([0-9A-F]{24}) /\* LEASection\.mm in Sources \*/ = \{isa = PBXBuildFile;[^\n]*\n', src)
if not anchor or not build:
    sys.exit("LEASection.mm tidak ditemukan sebagai jangkar")

lea_path = anchor.group(2).strip().strip('"')
base = os.path.dirname(lea_path)
mm, h = os.path.join(base, "AppSealingInterfaceBridge.mm"), os.path.join(base, "AppSealingInterfaceBridge.h")
for rel in (mm, h):
    if not os.path.exists(os.path.join(ios_dir, rel)):
        sys.exit(f"tidak ada di disk: {rel}")

ids = ["ADEF00B1C0DE00B1C0DE00B1", "ADEF00B2C0DE00B2C0DE00B2", "ADEF00B3C0DE00B3C0DE00B3"]
if any(i in src for i in ids):
    sys.exit("ID bentrok")
bf, ref_mm, ref_h = ids

src = src.replace(build.group(0), build.group(0) +
    f'\t\t{bf} /* AppSealingInterfaceBridge.mm in Sources */ = {{isa = PBXBuildFile; fileRef = {ref_mm} /* AppSealingInterfaceBridge.mm */; }};\n', 1)

src = src.replace(anchor.group(0), anchor.group(0) +
    f'\t\t{ref_mm} /* AppSealingInterfaceBridge.mm */ = {{isa = PBXFileReference; lastKnownFileType = sourcecode.cpp.objcpp; name = AppSealingInterfaceBridge.mm; path = {mm}; sourceTree = "<group>"; }};\n'
    f'\t\t{ref_h} /* AppSealingInterfaceBridge.h */ = {{isa = PBXFileReference; lastKnownFileType = sourcecode.c.h; name = AppSealingInterfaceBridge.h; path = {h}; sourceTree = "<group>"; }};\n', 1)

# Daftar anggota group dan daftar Compile Sources: dua tempat berbeda yang
# sama-sama menyebut LEASection, dibedakan oleh sufiks "in Sources".
src = re.sub(r'(\n\t\t\t\t' + build.group(1) + r' /\* LEASection\.mm in Sources \*/,\n)',
             r'\1' + f'\t\t\t\t{bf} /* AppSealingInterfaceBridge.mm in Sources */,\n', src, count=1)
src = re.sub(r'(\n\t\t\t\t' + anchor.group(1) + r' /\* LEASection\.mm \*/,\n)',
             r'\1' + f'\t\t\t\t{ref_h} /* AppSealingInterfaceBridge.h */,\n'
                     f'\t\t\t\t{ref_mm} /* AppSealingInterfaceBridge.mm */,\n', src, count=1)

open(path, "w").write(src)
PY
  then
    if plutil -lint "$PBXPROJ" >/dev/null 2>&1 \
       && grep -q "AppSealingInterfaceBridge.mm in Sources" "$PBXPROJ"; then
      rm -f "$backup"
      echo "    Ditambahkan ke Compile Sources."
      return 0
    fi
    echo "    Hasil penambahan tidak valid — dikembalikan."
  else
    echo "    Tidak bisa ditambahkan otomatis."
  fi

  mv "$backup" "$PBXPROJ"
  return 1
}

echo "==> [3/7] Memeriksa bridge & call protection"
if grep -q "AppSealingInterfaceBridge.mm in Sources" "$PBXPROJ"; then
  echo "    Bridge: OK"
elif add_bridge_to_project; then
  :
else
  echo "    PERINGATAN: NativeModules.AppSealingInterfaceBridge akan undefined —"
  echo "    aplikasi tertutup tanpa penjelasan ke user. Sealing tetap jalan."
fi

# action=callback membuat SDK hanya melapor: tidak ada alert, aplikasi tidak
# ditutup, semuanya diserahkan ke aplikasi. Tanpa CallRiskMonitor yang menerima
# laporan itu, fitur ini diam total — dan diamnya tidak terlihat di mana pun.
CP_ACTION=""
for flag in "${SEALING_FLAGS[@]}"; do
  case "$flag" in
    -call-protection=enable,action=*) CP_ACTION="${flag##*action=}" ;;
  esac
done
if [ "$CP_ACTION" = "callback" ] && ! grep -q "CallRiskMonitor.swift in Sources" "$PBXPROJ"; then
  echo "    PERINGATAN: action=callback tapi CallRiskMonitor tidak ada di project."
  echo "    SDK akan melapor ke ruang kosong — tidak ada peringatan, aplikasi"
  echo "    tidak tertutup. Pakai action=warning-exit kalau aplikasi belum"
  echo "    menanganinya sendiri."
elif [ -n "$CP_ACTION" ]; then
  echo "    Call protection: $CP_ACTION"
fi

echo "==> [4/7] Memeriksa signing identity"
CERT_SHA1=$(/usr/libexec/PlistBuddy -c "Print :signingCertificate" "$EXPORT_OPTIONS")
# Ditampung dulu, bukan dipipe ke grep -q: pipefail akan mengambil SIGPIPE dari
# security kalau grep keluar lebih dulu. Di sini output-nya kecil sehingga jarang
# terjadi, tapi bug-nya sama dengan yang membuat verifikasi Hermes salah lapor.
IDENTITIES=$(security find-identity -v -p codesigning)
if ! grep -qi "$CERT_SHA1" <<<"$IDENTITIES"; then
  echo "    GAGAL: certificate $CERT_SHA1 tidak ada di keychain."
  echo "    Identity yang tersedia:"
  echo "$IDENTITIES"
  exit 1
fi
echo "    OK: $CERT_SHA1"

echo "==> [5/7] Clean & Archive (log: $LOG_FILE)"
xcodebuild clean -workspace "$WORKSPACE" -scheme "$SCHEME" > "$LOG_FILE" 2>&1
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

echo "==> [6/7] Export IPA (manual signing)"
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
  echo "==> [7/7] Sealing dilewati (--no-seal)"
  echo
  echo "IPA siap di-seal: $IPA"
  exit 0
fi

echo "==> [7/7] Sealing"
[ -x "$HASH_SCRIPT" ] || chmod +x "$HASH_SCRIPT"
"$HASH_SCRIPT" "$IPA" "${SEALING_FLAGS[@]}" ${ARGS[@]+"${ARGS[@]}"}

#-----------------------------------------------------------------------------
# Verifikasi hasil, bukan pesan di log — kata-kata generate_hash bisa berubah,
# tapi engine di dalam IPA tidak bisa berbohong. Build yang bytecode-nya
# terenkripsi tapi engine-nya masih bawaan React Native akan crash 0,2 detik
# setelah launch, dan itu baru ketahuan setelah sampai ke tangan penguji.
#-----------------------------------------------------------------------------
echo
echo "==> Verifikasi engine Hermes di IPA hasil sealing"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
unzip -q "$IPA" -d "$TMP"

# Ambil executable framework-nya, yaitu file yang senama dengan framework —
# hermes.framework/hermes. Menyaring "file apa pun di dalam framework" pernah
# menjatuhkan pilihan ke _CodeSignature/CodeResources, yang jelas tidak memuat
# marker apa pun dan melaporkan build sehat sebagai gagal.
ENGINE=""
while IFS= read -r fw; do
  candidate="$fw/$(basename "$fw" .framework)"
  [ -f "$candidate" ] && { ENGINE="$candidate"; break; }
done < <(find "$TMP/Payload" -type d -name "hermes*.framework")

# grep membaca binary-nya langsung. Lewat "strings | grep -q" pemeriksaan ini
# selalu melaporkan gagal justru ketika marker ADA: grep -q keluar begitu cocok,
# strings kena SIGPIPE, dan set -o pipefail mengambil status strings (141) —
# bukan status grep yang sukses.
if [ -z "$ENGINE" ]; then
  echo "    Tidak ada engine Hermes di bundle — dilewati."
elif grep -aq "\[AppSealing\] hermes engine" "$ENGINE"; then
  echo "    OK: engine sudah diganti versi AppSealing"
else
  echo "    GAGAL: engine Hermes masih bawaan React Native."
  echo "    Bytecode sudah terenkripsi tapi tidak ada yang bisa mendekripsinya."
  echo "    Aplikasi akan crash saat launch. JANGAN diupload."
  exit 1
fi

echo
echo "Selesai. IPA hasil sealing ada di $EXPORT_PATH"
