#!/bin/zsh
set -u
export PATH=/usr/bin:/bin:/usr/sbin:/sbin
[[ "$(/usr/bin/uname -s)" == Darwin ]] || { print 'macOS 전용 진단입니다.'; exit 1; }
register_folder="${0:A:h}"
register_app="$HOME/Applications/Resistor.app"
[[ -d "$register_app" ]] || register_app="$register_folder/Resistor.app"
log_folder="$HOME/Library/Logs/Register"
/bin/mkdir -p "$log_folder"
log="$log_folder/diagnose-$(/bin/date +%Y%m%d-%H%M%S).log"
exec > >(/usr/bin/tee -a "$log") 2>&1
print 'Resistor Mac 진단 · 앱이나 보안 설정을 변경하지 않습니다.'
print -- "macOS: $(/usr/bin/sw_vers -productVersion)"
print -- "실행 환경 CPU: $(/usr/bin/uname -m)"
print -- "Apple Silicon: $(/usr/sbin/sysctl -n hw.optional.arm64 2>/dev/null || print 0)"
if [[ ! -d "$register_app" ]]; then
  print 'Resistor.app이 없습니다. ZIP 전체를 풀고 Install Resistor.command를 실행하세요.'
  exit 1
fi
print -- "앱: $register_app"
/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$register_app/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$register_app/Contents/Info.plist"
/usr/bin/file "$register_app/Contents/MacOS/Resistor"
if /usr/bin/codesign --verify --deep --strict --verbose=2 "$register_app"; then
  print '앱 자체 서명: 유효 · Developer ID/Apple 공증을 의미하지 않습니다.'
else
  print '앱 자체 서명: 오류 · 새 ZIP을 받아 전체를 Mac에서 압축 해제하세요.'
fi
if /usr/bin/xattr -r "$register_app" 2>/dev/null | /usr/bin/grep -q com.apple.quarantine; then
  print '다운로드 차단 표시가 있습니다. 검증된 ZIP의 Install Resistor.command를 이용하세요.'
else
  print '다운로드 차단 표시: 없음'
fi
[[ -d /Applications/Docker.app ]] && print 'Docker Desktop: 설치됨' || print 'Docker Desktop: 미발견 · 독립 뷰어는 사용할 수 있습니다.'
for resource in workers/eda/server.py workers/eda/bootstrap.py workers/eda/Dockerfile platform/commercial/runner.py platform/commercial/agent.py; do
  [[ -f "$register_app/Contents/Resources/app/$resource" ]] && print -- "앱 실행 파일: 있음 · $resource" || print -- "앱 실행 파일: 누락 · $resource · ZIP 전체를 풀고 새 앱을 설치하세요."
done
print '엔진 코드 위치: Docker 이미지 내부 /opt/register-engine · 설계 보관 폴더와 별도'
print 'Docker 실행 파일/폴더 공유 오류는 앱의 환경 진단에서 확인하고 설계 엔진 다시 연결을 누르세요.'
print -- "설계 보관 위치: $HOME/Library/Application Support/레지스터/workspace"
print -- "설치·진단 로그 폴더: $log_folder"
print -- "진단 완료: $log"
print '지원 요청에는 필요한 오류 부분만 보내세요. 로그에 사용자 폴더 경로가 포함됩니다.'
