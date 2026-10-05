# 실제 회로·물리 검증 흐름 · 0.13

`통합 설계 → 회로 → 물리 검증`에서 현재 revision 전체 검증을 실행합니다.
실제 회로 해석, Magic DRC, Netgen LVS, Magic RC 추출, 추출한 RC를 포함한
ngspice 해석을 순서대로 실행합니다. 설계별 모델·코너·온도·전압·부하는 프로젝트의
testbench를 사용합니다. 서로 다른 설계를 합쳐 PASS로 만들지 않습니다.

실패, 미지원, 취소, 오래된 결과 또는 revision 변경이 있으면 다음 단계를 멈춥니다.
실행 중인 작업이 있으면 새로운 일괄 흐름을 시작하지 않습니다. 검증 취소는 현재
native job도 취소합니다. 창을 닫는 동작은 다음 단계만 중단하며, 이미 시작한 job과
결과는 프로젝트에 남습니다. 작업 패널에서 해당 job을 확인하거나 취소할 수 있습니다.

`검증 기록 저장`은 원본 run ID, revision, 조건, solver, R/C 개수, 판정과 manifest
경로를 JSON으로 저장합니다. 원본 로그와 파형은 작업 결과에서 별도로 확인합니다.
같은 revision의 현재 결과만 PASS 개수에 들어갑니다. 외부에서 가져온 결과는 자동
검증의 실행 증거로 사용하지 않습니다. 공유 프로젝트와 상용·외부 GDS 해석은 기존의
전용 설정/개별 실행 화면을 사용합니다.

공개 엔진과 선택한 deck에서의 통과입니다. 전체 PVT, STA, 타이밍 closure, 칩 전원망,
EM/IR, foundry signoff를 이 5단계로 완료 처리하지 않습니다.

## 첫 실행과 설치 진단

설계 엔진 연결에 실패하면 설치 진단이 나타납니다. `설치 진단 새로 고침`은 Docker
명령, Linux engine, 현재 workspace의 mount, 기존 세션의 인증 연결과 설치 리소스를
확인합니다. 진단 자체는 컨테이너나 세션을 생성하지 않습니다. 진단 JSON에는 인증
token을 넣지 않습니다. Docker가 없는 환경에서도 `GDS 뷰어 열기`를 사용할 수 있습니다.

Docker Desktop을 준비한 뒤 `설계 엔진 다시 연결`을 누릅니다. 다른 workspace가 같은
worker를 사용 중이면 그 작업을 먼저 저장하고 종료해야 합니다. 설계 폴더의
`.runtime/eda`와 프로젝트 bundle을 보존하세요. 재연결은 설계를 초기화하지 않습니다.

워크스페이스의 `설계 파일 가져오기`에서 `.register-project.zip`을 선택합니다.
새 프로젝트로 복원하고 기존 설계를 덮어쓰지 않습니다. 각 프로젝트의 `설계 파일 저장`은
회로·원본 OASIS·PDK lock·조건을 ZIP으로 저장합니다. 화면 업로드는 24 MiB까지 지원하며,
서버가 ZIP 구성·해시·native geometry를 검사합니다. 해석 작업은 복사하지 않습니다.

## 개발 검증 명령

```powershell
npm run test:validation
npm run test:desktop-diagnostics
npm run test:digital-hierarchy
npm run test:cpu-physical
npx playwright test tests/ui/validation-flow.spec.ts
npm run package:installer
powershell -NoProfile -File scripts/windows-installation-qa.ps1
```

CPU 물리 검사는 큰 RC 회로를 실제로 계산합니다. 실패와 시간 제한을 포함한 native
결과를 `docs/evidence/cpu-physical-native.json`에 저장합니다. 결과가 실패이면 개발
검증 명령도 실패합니다. 재실행 전에 이전 receipt와 state를 보존하세요.
기본 qualification은 400ns이며, 실제 DRC/LVS/PEX와 RC 동작 16/16을 통과했습니다.
더 빠른 50ns·200ns의 실패도 별도로 보존합니다. 클럭별 판정을 섞지 않습니다.

ngspice의 KLU와 CPU의 transient operating point는 설치된 native 엔진에서 실행합니다.
기생 R/C를 없애거나 전압을 보정하지 않고, 저장할 trace만 필요한 입출력과 실제
전류 probe로 제한합니다. [공식 ngspice 설정 설명](https://ngspice.sourceforge.io/applic.html).

## macOS 준비 범위

macOS에서 `npm run package:mac:preview`는 현재 Mac의 arm64/x64 `.app`를 만든 뒤,
실제 GDS 뷰어와 Docker 누락 시 진단·재연결 smoke test를 통과한 경우에 DMG/ZIP을
만듭니다. `.github/workflows/macos-preview.yml`도 같은 절차를 사용합니다.
현재 Windows에서 macOS 실행·설치·서명·공증을 검증한 것은 아닙니다. Apple Silicon의
설계 엔진은 고정된 Linux amd64 Docker 이미지를 명시적으로 에뮬레이션합니다.
인터넷 서비스 배포는 진행하지 않습니다.
