#!/usr/bin/env bash
# Tune Shifter para Safari (macOS + iOS/iPadOS), de uma ponta à outra:
#   build da extensão (dist-safari/) -> safari/Shared (Extension)/Resources
#   -> xcodebuild archive -> export assinado -> envio para o App Store Connect.
#
# Uso:
#   npm run safari                 macOS e iOS: archive, export e envio
#   npm run safari:dev             só a app de macOS em Debug, e abre-a (testar no Safari)
#   PLATFORMS=mac npm run safari   só uma plataforma (mac | ios)
#   UPLOAD=0 npm run safari        só faz o .pkg/.ipa em build/export-<plataforma>
#
# Versão = "version" do package.json (a mesma do Chrome/Firefox);
# build = data e hora (AAAAMMDDHHMM).
#
# Assinatura (a mesma conta do omelhorsite, team 6FYT6632J8):
#   - archive: assinatura automática de desenvolvimento, com a chave da API (não precisa de
#     conta no Xcode; não há App Groups, por isso a chave App Manager chega);
#   - export: perfis App Store feitos pela API (scripts/asc.ts profile) e os certificados
#     "Apple Distribution" + "3rd Party Mac Developer Installer" do porta-chaves oms-ci.
#   Chave da API em ~/.appstoreconnect/oms-ci.env (nunca é escrita em lado nenhum).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
MODE="${1:-release}"
PROJECT="safari/Tune Shifter.xcodeproj"
BUNDLE_ID="pt.omelhorsite.tuneshifter"
EXT_ID="$BUNDLE_ID.Extension"
VERSION="$(node -p 'require("./package.json").version')"
BUILD_NUMBER="${BUILD_NUMBER:-$(date +%Y%m%d%H%M)}"
OUT="$ROOT/build"
LOGS="$OUT/logs"
mkdir -p "$LOGS"

echo "» extensão (dist-safari)"
npm run --silent build:safari > "$LOGS/vite.log" 2>&1 || { tail -20 "$LOGS/vite.log"; exit 1; }
rsync -a --delete dist-safari/ "safari/Shared (Extension)/Resources/"

if [ "$MODE" = "dev" ]; then
  echo "» xcodebuild (macOS, Debug)"
  xcodebuild -project "$PROJECT" -scheme "Tune Shifter (macOS)" -configuration Debug \
    -derivedDataPath "$OUT/DerivedData" -allowProvisioningUpdates \
    MARKETING_VERSION="$VERSION" CURRENT_PROJECT_VERSION="$BUILD_NUMBER" build \
    > "$LOGS/mac-debug.log" 2>&1 || { grep -E "error:" "$LOGS/mac-debug.log" | head -20; exit 1; }
  APP="$OUT/DerivedData/Build/Products/Debug/Tune Shifter.app"
  pkill -x "Tune Shifter" 2>/dev/null || true
  open "$APP"
  echo "» aberta: $APP"
  echo "  Liga a extensão em Safari > Definições > Extensões (o botão da app abre lá)."
  exit 0
fi

ASC_ENV="${ASC_ENV:-$HOME/.appstoreconnect/oms-ci.env}"
[ -f "$ASC_ENV" ] || { echo "falta $ASC_ENV (chave da App Store Connect API)" >&2; exit 1; }
set -a; . "$ASC_ENV"; set +a
TEAM="${APPLE_TEAM_ID:-6FYT6632J8}"
CI_KC="$HOME/Library/Keychains/oms-ci.keychain-db"
[ -f "$CI_KC" ] && security unlock-keychain -p "$(cat "$HOME/.appstoreconnect/dist/keychain.pass")" "$CI_KC"
AUTH=(-allowProvisioningUpdates -authenticationKeyPath "$ASC_KEY_PATH"
      -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")

bun scripts/asc.ts ensure "$BUNDLE_ID" "Tune Shifter" >/dev/null
bun scripts/asc.ts ensure "$EXT_ID" "Tune Shifter Extension" >/dev/null
DEST=upload
if [ "${UPLOAD:-1}" = "0" ]; then
  DEST=export
elif ! bun scripts/asc.ts app "$BUNDLE_ID"; then
  echo "a app $BUNDLE_ID ainda não existe no App Store Connect: cria-a primeiro (README, Safari)" >&2
  exit 1
fi

for PLATFORM in ${PLATFORMS:-mac ios}; do
  case "$PLATFORM" in
    mac) SCHEME="Tune Shifter (macOS)"; DESTINATION="generic/platform=macOS"; export ASC_PLATFORM=mac ;;
    ios) SCHEME="Tune Shifter (iOS)"; DESTINATION="generic/platform=iOS"; export ASC_PLATFORM=ios ;;
    *) echo "plataforma desconhecida: $PLATFORM" >&2; exit 2 ;;
  esac
  ARCHIVE="$OUT/TuneShifter-$PLATFORM.xcarchive"
  EXPORT="$OUT/export-$PLATFORM"
  rm -rf "$ARCHIVE" "$EXPORT"

  echo "» archive $PLATFORM ($VERSION, build $BUILD_NUMBER)"
  xcodebuild -project "$PROJECT" -scheme "$SCHEME" -configuration Release \
    -destination "$DESTINATION" -derivedDataPath "$OUT/DerivedData" -archivePath "$ARCHIVE" \
    "${AUTH[@]}" DEVELOPMENT_TEAM="$TEAM" CODE_SIGN_STYLE=Automatic \
    MARKETING_VERSION="$VERSION" CURRENT_PROJECT_VERSION="$BUILD_NUMBER" archive \
    > "$LOGS/archive-$PLATFORM.log" 2>&1 \
    || { grep -E "error:" "$LOGS/archive-$PLATFORM.log" | head -20; echo "o archive falhou ($LOGS/archive-$PLATFORM.log)" >&2; exit 1; }

  APP_PROFILE="$(bun scripts/asc.ts profile "$BUNDLE_ID")"
  EXT_PROFILE="$(bun scripts/asc.ts profile "$EXT_ID")"
  INSTALLER=""
  [ "$PLATFORM" = "mac" ] && INSTALLER="<key>installerSigningCertificate</key><string>3rd Party Mac Developer Installer</string>"
  OPTS="$OUT/ExportOptions-$PLATFORM.plist"
  cat > "$OPTS" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>$DEST</string>
  <key>teamID</key><string>$TEAM</string>
  <key>signingStyle</key><string>manual</string>
  <key>signingCertificate</key><string>Apple Distribution</string>
  $INSTALLER
  <key>provisioningProfiles</key><dict>
    <key>$BUNDLE_ID</key><string>$APP_PROFILE</string>
    <key>$EXT_ID</key><string>$EXT_PROFILE</string>
  </dict>
  <key>manageAppVersionAndBuildNumber</key><false/>
  <key>uploadSymbols</key><true/>
</dict></plist>
PLIST
  echo "» export $PLATFORM ($DEST)"
  xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportPath "$EXPORT" \
    -exportOptionsPlist "$OPTS" "${AUTH[@]}" > "$LOGS/export-$PLATFORM.log" 2>&1 \
    || { grep -iE "error" "$LOGS/export-$PLATFORM.log" | head -20; echo "o export/envio falhou ($LOGS/export-$PLATFORM.log)" >&2; exit 1; }
  if [ "$DEST" = "upload" ]; then
    echo "  enviada ($PLATFORM, build $BUILD_NUMBER)"
  else
    echo "  feito: $(ls "$EXPORT" | grep -E '\.(pkg|ipa)$' | sed "s|^|$EXPORT/|")"
  fi
done

[ "$DEST" = "upload" ] && echo "» o App Store Connect leva uns minutos a processar (bun scripts/asc.ts builds $BUNDLE_ID)"
exit 0
