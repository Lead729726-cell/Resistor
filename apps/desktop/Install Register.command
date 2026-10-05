#!/bin/zsh
set -euo pipefail
export PATH=/usr/bin:/bin:/usr/sbin:/sbin
register_folder="${0:A:h}"
source_app="$register_folder/Register.app"
applications="$HOME/Applications"
target="$applications/Register.app"
log_folder="$HOME/Library/Logs/Register"
/bin/mkdir -p "$log_folder"
log="$log_folder/install-$(/bin/date +%Y%m%d-%H%M%S).log"
exec > >(/usr/bin/tee -a "$log") 2>&1
trap 'result=$?; if (( result != 0 )); then print "설치를 완료하지 못했습니다. 로그: $log"; fi' EXIT
fail(){ print -u2 -- "$1"; exit 1; }
[[ "$(/usr/bin/uname -s)" == Darwin ]] || fail '이 설치 도우미는 macOS 전용입니다.'
mac_version="$(/usr/bin/sw_vers -productVersion)"
(( ${mac_version%%.*} >= 13 )) || fail 'macOS 13 Ventura 이상이 필요합니다.'
if [[ '@ARCH@' == arm64 ]]; then
  [[ "$(/usr/sbin/sysctl -n hw.optional.arm64 2>/dev/null || true)" == 1 ]] || fail 'M1 이후 Apple Silicon용 파일입니다. Intel Mac용 파일을 사용하세요.'
fi
[[ -d "$source_app" && ! -L "$source_app" ]] || fail '같은 폴더의 Register.app이 필요합니다. ZIP 전체를 Mac에서 다시 압축 해제하세요.'
[[ -f "$register_folder/BUNDLE-SHA256SUMS.txt" && -f "$register_folder/BUNDLE-SYMLINKS.tsv" ]] || fail '설치 파일 목록이 없습니다. 수정본 ZIP을 다시 받아주세요.'
print -- "Register @VERSION@ · @ARCH@ · macOS $mac_version"
print '1/4 앱 구성과 SHA-256 확인'
typeset -A expected_links
while IFS=$'\t' read -r link_name link_target; do
  [[ "$link_name" == Register.app/* && "/$link_name/" != */../* && "$link_target" != /* ]] || fail '잘못된 앱 링크 목록입니다.'
  expected_links[$link_name]="$link_target"
done < "$register_folder/BUNDLE-SYMLINKS.tsv"
while IFS= read -r -d '' actual_link; do
  relative="${actual_link#$register_folder/}"
  [[ -n "${expected_links[$relative]-}" ]] || fail "목록에 없는 앱 링크: $relative"
  [[ "$(/usr/bin/readlink "$actual_link")" == "${expected_links[$relative]}" ]] || fail "앱 링크가 변경되었습니다: $relative"
  [[ -e "$actual_link" && "${actual_link:A}" == "$source_app"/* ]] || fail "앱 외부를 가리키거나 끊어진 링크: $relative"
done < <(/usr/bin/find "$source_app" -type l -print0)
for relative in ${(k)expected_links}; do
  [[ -L "$register_folder/$relative" ]] || fail "앱 링크가 누락되었습니다: $relative"
done
while IFS= read -r manifest_line; do
  checksum="${manifest_line%% *}"
  manifest_path="${manifest_line#*  }"
  [[ ${#checksum} == 64 && "$checksum" != *[^0-9a-f]* ]] || fail '잘못된 SHA-256 목록입니다.'
  [[ "$manifest_path" == Register.app/* || "$manifest_path" == 'Install Register.command' || "$manifest_path" == 'Open Viewer.command' || "$manifest_path" == 'Mac 설치 안내.txt' || "$manifest_path" == BUNDLE-SYMLINKS.tsv ]] || fail '목록의 파일 경로가 허용 범위를 벗어났습니다.'
  [[ "/$manifest_path/" != */../* && -f "$register_folder/$manifest_path" ]] || fail '앱 파일이 누락되었거나 경로가 잘못되었습니다.'
done < "$register_folder/BUNDLE-SHA256SUMS.txt"
(cd "$register_folder" && /usr/bin/shasum -a 256 -c BUNDLE-SHA256SUMS.txt)
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$source_app/Contents/Info.plist")" == org.register.eda ]] || fail '레지스터 앱 식별자가 다릅니다.'
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$source_app/Contents/Info.plist")" == '@VERSION@' ]] || fail '앱 버전이 다릅니다.'
print '2/4 앱과 하위 구성요소의 자체 서명 확인'
/usr/bin/codesign --verify --deep --strict --verbose=2 "$source_app"
print 'Developer ID 서명·Apple 공증은 완료되지 않은 개발 배포본입니다.'
answer="$(/usr/bin/osascript -e 'try' -e 'return button returned of (display dialog "레지스터 수정본을 사용자 Applications 폴더에 설치합니다.\n\n파일 해시와 자체 서명을 확인했습니다. Apple 공증은 완료되지 않았습니다. 이 앱의 다운로드 차단 표시만 해제합니다.\n\n기존 사용자 설치 앱은 백업하고 설계 데이터는 보존합니다. 계속하려면 설치를 선택하세요." with title "레지스터 Mac 설치" buttons {"취소", "설치"} default button "설치" cancel button "취소")' -e 'on error number -128' -e 'return "취소"' -e 'end try')"
[[ "$answer" == 설치 ]] || exit 0
[[ ! -L "$applications" && ! -L "$target" ]] || fail '사용자 Applications 또는 기존 앱이 심볼릭 링크입니다. 일반 폴더에 설치해주세요.'
/bin/mkdir -p "$applications"
staging="$applications/.register-install-$(/usr/bin/uuidgen)"
/bin/mkdir "$staging"
print '3/4 사용자 Applications에 복사하고 앱 한정 다운로드 표시 처리'
/usr/bin/ditto --noqtn "$source_app" "$staging/Register.app"
/usr/bin/xattr -dr com.apple.quarantine "$staging/Register.app" 2>/dev/null || true
attributes="$(/usr/bin/xattr -r "$staging/Register.app")"
[[ "$attributes" != *com.apple.quarantine* ]] || fail '이 앱의 다운로드 표시를 처리하지 못했습니다.'
/usr/bin/codesign --verify --deep --strict --verbose=2 "$staging/Register.app"
if [[ -e "$target" ]]; then
  backup="$applications/Register.previous-$(/bin/date +%Y%m%d-%H%M%S)-$(/usr/bin/uuidgen).app"
  /bin/mv "$target" "$backup"
  print -- "기존 사용자 앱 백업: $backup"
fi
/bin/mv "$staging/Register.app" "$target"
/bin/rmdir "$staging"
print '4/4 레지스터 실행'
/usr/bin/open "$target"
print -- "설치 완료: $target"
print -- "설치 로그: $log"
print '뷰어는 Docker 없이 사용할 수 있습니다. 설계·해석에는 Docker Linux 엔진이 필요합니다.'
