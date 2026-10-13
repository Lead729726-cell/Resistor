# Docker 없이 Resistor 실행하기 · v0.26

기본 실행 방식은 **로컬 네이티브 엔진**입니다. 설치 파일에 Python 3.13.16,
KLayout 0.30.5, ngspice 47과 공개 SKY130A 모델·기술 자료를 포함합니다.
회로·레이아웃 편집, GDSII/OASIS 입출력, 이상 소자 회로 해석과 지원 SKY130
회로의 SPICE 해석은 Docker·별도 Python·로그인 없이 실행합니다.

| 작업 | 기본 설치 | 추가 준비 |
| --- | --- | --- |
| 계산기·GDS 독립 뷰어 | 오프라인 실행 | 없음 |
| 회로·레이아웃 편집, 계층, 저장·취소 | 로컬 KLayout/Python | 없음 |
| GDSII/OASIS 입출력 | 로컬 KLayout | 없음 |
| 전압·전류·전압강하, OP/과도 해석 | 실제 ngspice | 유효한 회로·바이어스·필요한 모델 |
| SKY130 MOS PCell·레이아웃 변환·DRC·PEX·GDS 역추출 | 기존 실제 엔진 API 유지 | Magic |
| LVS | 기존 실제 비교 결과 유지 | Magic + OpenCircuitDesign Netgen |
| RTL 합성·검증 | 기존 RTL/IR 보존 | Yosys + Icarus Verilog/VVP |
| Xschem·상용 도구 | 기존 연결 절차 유지 | 실제 도구·필요한 라이선스 |

도구 누락을 PASS로 표시하지 않습니다. 기본 Windows 네이티브 패키지에는
Magic/Netgen을 포함하지 않습니다. Windows의 물리 검증에는 **Docker와 독립된
WSL Ubuntu**를 사용합니다. Mac/Linux에는 해당 도구를 호스트에 설치합니다.
공개 deck 검사는 파운드리 제조 승인이나 TCAD 검증을 의미하지 않습니다.

## 설치 파일

1. [다운로드 사이트](https://resistor-downloads.vercel.app/)에서 운영체제별 파일을 받습니다.
2. Windows는 EXE, Mac은 ZIP 전체 압축 해제 후 `Install Resistor.command`,
   Linux는 tar.gz 전체 압축 해제 후 `./install.sh`를 실행합니다.
3. 앱의 **설계 엔진 다시 연결**을 누릅니다. 첫 로컬 설계 요청에서 포함된
   엔진을 시작합니다. 설치 후 기본 엔진을 시작할 때 인터넷은 필요하지 않습니다.
4. **환경 진단 → 실행 방식**에서 로컬·WSL·선택 Docker를 지정할 수 있습니다.
   실행 중인 해석이 있으면 전환을 거부합니다.

M1 이후 Mac은 arm64, Intel Mac은 x64 파일을 사용하며 macOS 13 이상이 필요합니다.
자체 서명과 Apple Developer ID/공증은 서로 다른 상태입니다. Apple 공증은
완료하지 않았으며 설치 경고 처리 절차는 [설치 가이드](desktop-installation.md)에 있습니다.

## Windows에서 전체 물리 도구 준비

독립된 Ubuntu WSL이 이미 설치되어 있다면 Ubuntu 터미널에서 실행합니다.
아직 없다면 Microsoft의 [WSL 설치 안내](https://learn.microsoft.com/windows/wsl/install)에
따라 준비하세요. 앱은 WSL 설치·Windows 기능 변경·재부팅을 자동으로 수행하지 않습니다.
`docker-desktop` 내부 배포판은 연결 목록에서 제외합니다.

```sh
# 앱 resources/app/scripts 또는 소스 체크아웃의 스크립트 경로를 사용합니다.
sh scripts/native-tools-setup.sh
```

이 스크립트는 Linux 패키지 관리자가 필요한 빌드 도구·ngspice·Yosys·Icarus·Xschem을
설치하고, Magic 8.3.582·Netgen 1.5.313의 고정된 공개 소스를 사용자 폴더에서 빌드합니다.
Python/KLayout 환경은 `~/.local/share/resistor/engine`, 물리 도구는
`~/.local/share/resistor/tools`에 둡니다. `netgen` 3D mesher를 LVS 도구로 사용하지 않습니다.
패키지 설치가 필요한 경우 해당 운영체제의 관리자 확인이 표시됩니다.

이후 앱의 환경 진단에서 **WSL · 물리 검증 도구 → Ubuntu → 실행 방식 적용**을
선택합니다. 같은 사용자 설계 폴더를 WSL 경로로 변환하며 SQLite·파일 형식을
교체하지 않습니다. 토큰은 실행 인수가 아닌 표준 입력으로 전달합니다.

## Mac/Linux에서 전체 물리 도구 준비

동일한 `native-tools-setup.sh`를 호스트 터미널에서 실행합니다. Mac은 Homebrew와
Xcode Command Line Tools, Linux는 Debian/Ubuntu 패키지 관리자를 사용합니다.
준비가 끝나면 **로컬 → 실행 방식 적용 → 설계 엔진 다시 연결**을 선택하세요.
구동 버전 확인은 실행 가능 여부이며 실제 DRC/LVS/PEX 결과는 개별 실행 후 표시합니다.

## 소스에서 시작

Node.js 24가 필요합니다. 최초 엔진 준비에는 공개 파일 다운로드가 필요하며,
Mac/Linux의 ngspice 빌드에는 컴파일러와 make가 필요합니다.

```sh
npm ci
npm run native:prepare
npm run doctor
npm run dev:web
# 또는 npm run dev
```

`npm run test:native`는 사용자 DB와 다른 폴더·포트에서 실제 로컬 편집, 파일 변환,
0.9V/90µA 분압 해석, 재시작 보존과 SKY130 인버터 해석을 검사합니다.
전체 물리 도구가 준비된 Mac/Linux에서는 `REGISTER_NATIVE_PHYSICAL_QA=1`로
동일 검사에 실제 DRC/LVS/PEX·추출 후 RC 해석을 추가합니다.

## 기존 Docker 작업에서 전환

먼저 실행 중인 해석·PVT·실험을 완료하거나 취소합니다. 환경 진단의
**기존 Docker 엔진에서 전환**은 현재 폴더와 인증이 일치하는 Resistor 소유
컨테이너만 확인·종료합니다. 컨테이너·볼륨·설계 파일은 삭제하지 않습니다.
다른 폴더의 엔진은 전환하지 않습니다. 선택적으로 Docker를 계속 사용하려면
**Docker · 선택 설치**를 지정하세요.

플랫폼이나 엔진 파일이 달라지면 이전 결과는 stale로 표시합니다. 원본 PASS/FAIL,
보고서와 이력은 보존하며 재실행 없이 새로운 엔진의 PASS로 바꾸지 않습니다.

## 별도 로컬 도구 경로

고급 운영자는 설계 폴더의 `.runtime/engine.json`에 다음 항목을 지정할 수 있습니다.
앱 화면은 임의 명령·실행 파일 경로를 받지 않습니다.

```json
{"mode":"native","tool_paths":["/opt/eda/bin"],"pdk_root":"/opt/public-pdks"}
```

`python`, `wsl_distribution`도 운영자 설정으로 지원합니다. 기본 설치에서는 별도
설정이 필요하지 않습니다. API는 인증된 IPv4 localhost에만 열고, 기존 `/workspace/…`
아티팩트 경로는 실제 사용자 폴더에 한정하여 변환합니다.

## 공개 구성요소 출처

- [CPython 3.13.16](https://www.python.org/downloads/release/python-31316/)
- [Mac/Linux relocatable CPython](https://github.com/astral-sh/python-build-standalone/releases/tag/20261009)
- [KLayout Python module](https://github.com/KLayout/klayout/wiki/KLayout-Python-Module)
- [ngspice 47 원본 바이너리·소스](https://sourceforge.net/projects/ngspice/files/ng-spice-rework/47/)
- [공개 SKY130 native 데이터와 변환 기록](https://github.com/Lead729726-cell/Resistor/releases/tag/native-pdk-v1)
- [Magic](https://github.com/RTimothyEdwards/magic) · [Netgen LVS](https://github.com/RTimothyEdwards/netgen)

배포 입력 파일의 URL·SHA-256은 `scripts/native-runtime-lock.json`과
`scripts/native-pdk-lock.json`에 고정합니다. PDK의 유일한 RC 변경은 이미지에만 있던
선택 키보드 파일 연결을 제거한 것이며 원본/변경 해시를 `provenance.json`에 기록합니다.
소자 모델과 기술 규칙은 유지합니다. [외부 구성요소 고지](THIRD-PARTY-NOTICES.md).
