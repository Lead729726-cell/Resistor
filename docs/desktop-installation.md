# Resistor 설치와 실행

[다운로드 사이트](https://resistor.kr/)에서 현재 설치 파일과 SHA-256을 확인하세요.
기본 설치는 Docker 없이 회로·레이아웃·GDS/OASIS·ngspice를 실행합니다.
Python·KLayout·공개 SKY130 자료를 포함하며 사용자 설계 폴더는 앱과 분리합니다.

- Windows x64: EXE 설치 파일. 사용자 계정에 설치하며 제거 시 설계 폴더를 삭제하지 않습니다.
- M1 이후 Mac: arm64 ZIP. 전용 0.28.0의 내장 해석기는 macOS 15 이상이 필요합니다.
- Intel Mac: x64 ZIP. 전용 0.28.0의 내장 해석기는 macOS 15 이상이 필요합니다.
- Linux x64: tar.gz 전체를 풀고 `./install.sh`. GTK 3·NSS·Chromium sandbox가 필요합니다.

## Edu / Industry 전용판

[Edu](https://resistor.kr/download/edu/)와 [Industry](https://resistor.kr/download/industry/)에서
각 에디션의 파일 공개 상태·정확한 버전·SHA-256·실제 실행 검증 기록을 확인하세요.
전용 설치 파일은 source ZIP과 구분합니다. ZIP 소스를 내려받은 것만으로 앱이 설치되지는 않습니다.

Windows ARM64는 Windows 11용 네이티브 ARM64 앱이며, 포함된 Python·KLayout·ngspice는
Windows의 x64 에뮬레이션으로 실행합니다. 전용 ARM 설치기는 Inno Setup을 사용하며
앱은 사용자 Programs 폴더의 `Resistor ARM64` 또는 `Resistor Edu ARM64`에 설치합니다. x64 엔진을 ARM64 네이티브 엔진으로 표시하지 않습니다.
다른 모든 대상은 각 OS와 CPU에서 내장 엔진을 빌드합니다.

Mac 전용판은 압축을 모두 풀고 `Install Resistor Edu.command` 또는
`Install Resistor Indust.command`를 실행합니다. 도우미는 포함된 런타임을 사용하므로
별도 Node.js가 필요하지 않습니다. Edu는 `~/Applications/Resistor Edu.app`,
Indust는 기존 호환 경로 `~/Applications/Resistor.app`에 설치합니다.
기존 앱을 백업하고 복사한 앱의 자체 서명을 확인한 뒤 해당 앱에만 quarantine 해제를 적용합니다.
Apple Developer ID 서명·공증은 제공하지 않으므로 최초 다운로드 경고는 나타날 수 있습니다.

Linux 전용판은 tar.gz 전체를 풀고 그 폴더의 `./install.sh`를 실행합니다.
사용자 계정의 `~/.local/opt/resistor-edu/버전` 또는 `resistor-indust/버전`과
서로 다른 데스크톱 실행기를 사용합니다. sudo나 Docker를 요구하지 않습니다.
기존 Indust 설계 폴더는 유지하고 Edu에 프로젝트·키를 복사하지 않습니다.

전용판의 현재 업데이트는 다운로드 사이트에서 같은 에디션의 새 설치 파일을 받는 방식입니다.
앱의 기존 공통판 업데이트 기능을 Edu 전용 자동 업데이트로 안내하지 않습니다.

## Mac 설치와 Apple 경고

ZIP 전체를 Mac에서 풀고 `Install Resistor.command`를 실행합니다. 도우미는
파일 해시·앱 식별자·리소스 서명을 확인하고 설치 대상을 보여줍니다. 설치하면
`~/Applications/Resistor.app`에 복사하며 기존 사용자 앱은 백업하고 설계 데이터를 유지합니다.
설치 도우미가 차단되면 출처·다운로드 SHA-256을 확인한 뒤 터미널의 `/bin/zsh ` 뒤에
도우미 파일을 끌어 넣어 실행합니다. 시스템 전체 Gatekeeper를 해제하지 않습니다.

앱은 자체 서명되며 Apple Developer ID 서명·공증은 완료하지 않았습니다.
“개발자를 확인할 수 없음”과 공증 경고는 이 상태에서 나타날 수 있습니다.
진단은 `Diagnose Resistor.command`, 로그는 `~/Library/Logs/Register`에 있습니다.
설치 도우미가 OS에 실행을 요청한 사실과 앱 내부 실행 검증을 구분합니다.

## 엔진과 물리 검증

첫 설계 요청 또는 **설계 엔진 다시 연결**에서 포함된 네이티브 엔진을 시작합니다.
로그인·Docker·별도 Python은 필요하지 않습니다. 전류·전압은 실제 해석 결과가 있어야 표시합니다.
독립 GDS 뷰어는 `Open Viewer.command` 또는 `--viewer`로 열며 서버를 시작하지 않습니다.

DRC/LVS/PEX·PCell·GDS 역추출은 실제 Magic/Netgen 도구를 추가로 준비합니다.
Mac/Linux는 호스트에 설치하고 Windows는 Docker와 독립된 WSL을 선택합니다.
[네이티브 엔진 준비·전환 가이드](native-runtime.md)의 절차를 사용하세요.
도구가 없거나 미실행이면 PASS로 표시하지 않습니다.

환경 진단에서 로컬·WSL·선택 Docker를 지정합니다. 기존 Docker가 실행 중이면
실행 중인 해석을 먼저 완료·취소하고 **기존 Docker 엔진에서 전환**을 누릅니다.
현재 폴더·인증·소유권과 유휴 상태를 확인하며 컨테이너와 볼륨을 삭제하지 않습니다.
이전 `/workspace/workers/eda/server.py` 누락 오류는 새 기본 실행 경로에서 사용하지 않습니다.

## 데이터 보존과 결과 상태

Mac 사용자 설계는 `~/Library/Application Support/레지스터/workspace`, Windows/Linux도
기존 Electron 사용자 데이터 경로에 둡니다. 기존 제품명의 저장 위치를 유지합니다.
앱 리소스는 실행 코드, 사용자 폴더는 설계·이력·로그 저장소로 사용합니다.
앱 교체와 삭제가 자동 설계 삭제로 이어지지 않습니다. **워크스페이스 → ZIP 내보내기**로 백업할 수 있습니다.

다른 폴더의 엔진이 포트를 사용하면 연결 충돌을 표시합니다. 실행 중인 job·PVT·실험은
엔진 전환 전에 완료·취소해야 합니다. 변경된 엔진·모델의 파일 해시는 기존 결과를 stale로
만들며 원본 PASS/FAIL 보고서를 보존합니다. 재실행 없이 새 환경의 PASS로 바꾸지 않습니다.

## 소스·패키지 검증

Node.js 24에서 `npm ci`, `npm run native:prepare`, `npm run doctor`, `npm run dev` 순서로 시작합니다.
Mac/Linux 네이티브 ngspice 빌드에는 컴파일러와 make가 필요합니다.
패키지는 해당 운영체제·CPU에서 생성하며 다른 CPU의 엔진을 재사용하지 않습니다.
Mac 자체 서명 검사는 포함된 Mach-O 실행 파일·모듈과 최종 `.app`을 검사합니다.

현재 실행 근거는 [플랫폼별 네이티브 검증 기록](evidence/native-runtime/)에 있습니다.
CI의 실제 호스트 실행, 설치 파일 구조, Apple 공증, 제조 승인은 각각 별도 상태입니다.
