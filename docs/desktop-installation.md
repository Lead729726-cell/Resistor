# 레지스터 0.14 설치와 Mac 실행

## Mac 설치

- Apple Silicon(M1 이후) 실행 차단 수정본: `release/installers/Register-0.14.0-mac-arm64-r2.zip`
- Intel: `release/installers/Register-0.14.0-mac-x64.zip`

M1 이후 Mac에서는 **r2 수정본** ZIP 전체를 Mac에서 압축 해제한 뒤 `Install Register.command`를 실행합니다. 도우미가 SHA-256, 앱 식별자, 하위 구성요소와 앱 리소스 서명을 확인하고 설치 내용을 보여줍니다. **설치**를 선택하면 `~/Applications/Register.app`에 복사하고 이 앱의 다운로드 차단 표시만 처리한 뒤 실행합니다. 관리자 암호는 필요하지 않습니다. 기존 사용자 설치 앱은 같은 폴더에 백업하고 설계 데이터는 보존합니다. 기존 `/Applications/Register.app`을 직접 실행하는 대신 도우미가 설치한 사용자 앱을 사용하세요.

도우미 자체가 차단되면 터미널을 열고 `/bin/zsh ` 뒤에 `Install Register.command` 파일을 끌어 넣은 뒤 Enter를 누릅니다. 직접 앱을 실행할 때의 “개발자를 확인할 수 없음” 경고는 Apple 공증을 완료하기 전까지 나타날 수 있습니다. 출처와 다운로드 SHA-256을 확인한 이 배포본에만 설치 도우미를 사용하세요. 설치 과정 기록은 `~/Library/Logs/Register/install-날짜.log`에 남습니다. 시스템 전체 Gatekeeper 설정은 변경하지 않습니다.

앱에 Electron 런타임이 포함되어 있어 별도 Node.js가 필요하지 않습니다. **M1 CPU도 macOS 13 Ventura 이상이 필요합니다.** OS 하한은 ZIP 안 `Info.plist`의 `LSMinimumSystemVersion`에서 확인합니다. Intel 기존 ZIP은 `Register.app`을 Applications로 복사해 사용하며 Developer ID 서명·Apple 공증을 완료하지 않았습니다.

GDS/OASIS 뷰어는 Docker·로그인 없이 열 수 있습니다. 압축 해제한 폴더의 `Open Viewer.command`로 독립 뷰어를 실행하거나 연결 진단에서 **GDS 뷰어로 열기**를 선택합니다. PDK layer 설정·전류 방향과 수치·공정 3D 표시도 기존 뷰어 경로로 사용할 수 있습니다. 전류는 입력한 실제 해석 결과가 있어야 표시됩니다.

회로 생성·ngspice·DRC·LVS·PEX에는 실행 중인 **Docker Linux 엔진**이 필요합니다. 엔진을 실행한 뒤 **설계 엔진 다시 연결**을 누릅니다. 최초 준비에는 인터넷과 큰 공개 EDA 이미지의 저장 공간이 필요합니다. 현재 고정 이미지의 압축 해제 크기는 이 Windows PC에서 약 21GB입니다. `linux/amd64`를 명시하므로 Apple Silicon에서는 엔진이 에뮬레이션으로 실행되고 앱/뷰어는 arm64로 실행됩니다. 실제 Mac 해석 속도는 아직 측정하지 않았습니다.

Finder/Dock 실행에서도 Docker Desktop 내부 CLI, 사용자 `~/.docker/bin`, `/opt/homebrew/bin`, `/usr/local/bin`을 직접 탐색합니다. 셸 초기화 파일을 실행하지 않습니다. 특수 설치 경로를 사용할 때만 터미널의 `REGISTER_DOCKER_PATH`에 절대 경로를 지정할 수 있으며 화면에서 임의 명령을 받지 않습니다.

Mac 파일/편집/창 메뉴, ⌘S 저장, ⌘Z/⌘⇧Z 설계 취소/다시 실행, ⌘C/⌘V 텍스트 복사/붙여넣기, Mac Delete 키를 지원합니다. 입력란의 Delete·Backspace는 설계 객체를 삭제하지 않습니다. 창을 닫은 후 Dock으로 돌아오면 창을 다시 열고 기존 엔진 연결을 재사용합니다.

## 데이터 보존

Mac 설치본의 설계 폴더는 `~/Library/Application Support/레지스터/workspace`, Windows는 사용자 앱 데이터 아래입니다. 실행 파일 또는 `.app` 내부에 설계를 저장하지 않습니다. 첫 실행에 필요한 엔진·샘플·adapters를 복사하고 이미 존재하는 파일을 덮어쓰지 않습니다. 직접 수정한 엔진 파일도 보존되며 앱 교체가 자동으로 해당 엔진 파일을 교체하지 않습니다. 자동 엔진 마이그레이션은 제공하지 않습니다.

소스 체크아웃 안의 개발 패키지는 기존 `.runtime/worker.json`이 있는 체크아웃을 재사용합니다. 앱 삭제가 설계 자동 삭제로 이어지지 않습니다. **워크스페이스 → ZIP 내보내기**로 설계를 별도 백업하세요. 다른 폴더가 고정 worker 이름/포트를 쓰고 있으면 다른 작업을 덮어쓰지 않고 연결 충돌을 표시합니다. Unix 경로는 대소문자를 구분합니다. Docker build context에서 설계 runtime과 인증 연결 파일을 제외하도록 `.dockerignore`도 준비합니다.

## Mac 빌드와 실제 실행 검증

Mac 소스 체크아웃에서 `npm ci` 후 `npm run package:mac:preview`를 실행하면 현재 Mac CPU용 `.app`를 만들고 실제 Electron으로 Docker 없는 GDS 52개 shape, 연결 진단/재시도/독립 뷰어를 검사한 뒤 DMG와 ZIP을 만듭니다. 서명되지 않은 미리보기이며 자동 업로드하지 않습니다.

다른 CPU의 앱만 만들려면 `npm run package:mac:arm64` 또는 `npm run package:mac:x64`를 사용합니다. CPU가 다른 바이너리는 해당 CPU의 Mac에서 따로 검사해야 합니다. 수동 `.github/workflows/macos-preview.yml`은 Apple Silicon `macos-15`와 Intel `macos-15-intel`에서 각각 같은 smoke 검사를 하도록 준비되어 있습니다. 현재 Git remote가 없어 workflow는 실행되지 않았습니다.

Docker가 준비된 실제 Mac에서는 `REGISTER_NATIVE_QA=1 npm run package:mac:preview`로 실제 패키지의 엔진 연결과 full adder의 pre → DRC → LVS → PEX → 실제 RC post, 각 8개 입력 조합을 추가 검사합니다. 별도로 `npm run test:mac:native`도 가능합니다. 실패한 단계/실제 run ID를 `docs/evidence/macos-native-<arch>.json`에 저장하고 합성 PASS로 대체하지 않습니다. 새 검증 프로젝트는 기존 프로젝트와 별도로 생성합니다.

`npm run package:mac:zip`은 두 CPU용 ZIP을 생성합니다. Windows에서는 별도의 Linux Docker 빌드 컨테이너를 쓰며 기존 EDA 컨테이너를 변경하지 않습니다.

이 Windows PC에서는 Linux 컨테이너의 파일 시스템에서 두 CPU용 `.app`를 만들고 Unix 실행 권한·Framework 심볼릭 링크를 보존한 ZIP을 생성합니다. `scripts/verify-mac-archive.py`가 실제 Mach-O CPU, 앱 버전, 필수 리소스, ZIP CRC, 민감 runtime 제외를 검사합니다. **이 검사는 Mac에서 앱을 실행한 증거가 아닙니다.** DMG는 실제 Mac에서 electron-builder가 만듭니다.

## 서명과 현재 한계

현재 Mac ZIP과 Windows 설치본은 개발 미리보기입니다. Developer ID 서명, Apple 공증, Gatekeeper 설치 허용, Mac 실기기의 뷰어·GPU·전체 엔진 실행은 아직 검증되지 않았습니다. 시스템 전체 보안 설정을 해제하는 설치 스크립트는 제공하지 않습니다. 상용 배포 전 Developer ID와 공증 및 양쪽 Mac의 실행 검증이 필요합니다. [Electron 공식 서명 문서](https://www.electronjs.org/docs/latest/tutorial/code-signing), [Apple의 출처 확인 앱 열기 안내](https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unknown-developer-mh40616/mac)를 참고하세요.

상용 EDA 실행 파일·SDK·라이선스는 포함하지 않습니다. 등록 가능한 backend/상용 데이터 어댑터와 실제 vendor 실행 검증은 구분합니다. 인터넷 서버 배포, 유료 서비스 생성, 인증서 구매와 자동 업데이트는 진행하지 않았습니다.

## Windows

새 설치 파일은 `release/installers/Register-0.14.0-win-x64.exe`이며 기존 확인된 0.13 설치본도 보존합니다. `npm run package:installer`로 현재 0.14 소스의 Windows 앱과 NSIS 설치 파일도 만듭니다. 현재 사용자 계정에 설치하며 설치 위치를 선택하고 삭제 시 앱 데이터를 자동 삭제하지 않습니다. 플랫폼별 설치/실행 증거는 `docs/evidence/`에서 확인합니다.
