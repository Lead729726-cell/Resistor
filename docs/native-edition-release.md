# Resistor Edu / Indust 설치 파일 검증

대상은 Windows x64·Windows 11 ARM64·macOS Apple Silicon·macOS Intel·Linux x64,
에디션마다 5종입니다. 제품별 소스 commit은 독립적으로 고정하고 공유 빌드 도구의 commit과
적용 파일 SHA-256을 별도로 기록합니다. Edu 기능을 Indust 소스로 대체하지 않습니다.

## 빌드와 검증

1. `edition-installers.yml`에서 정확한 에디션 소스를 checkout합니다.
2. `edition-build-overlay.mjs`는 edition을 검증하고 공유 빌드 도구와 버전 변경만 기록합니다.
3. 각 대상의 네이티브 runner에서 앱과 내장 Python·KLayout·ngspice를 준비합니다.
4. 실제 앱을 격리한 사용자 폴더에서 실행합니다. Edu는 첫 실습을 실제 UI로 생성합니다.
5. 원래 도구가 PATH에 없는 상태로 실제 1.8V·10kΩ/10kΩ 회로를 해석해 0.9V를 확인하고,
   GDS를 내보내며 프로젝트·run의 재열기 결과를 확인합니다.
6. `edition-installation-qa.yml`은 파일 hash를 다시 확인하고 EXE 또는 포함 설치 도우미로
   설치합니다. 설치한 앱에서 같은 실제 엔진 검증을 다시 실행합니다.
7. 통과한 artifact와 receipt만 `import-edition-installers.mjs`로 모읍니다.
8. 공개 GitHub Release에 게시한 뒤 `--published`로 원격 크기·receipt hash를 대조합니다.
   이 단계가 통과해야 사이트 JSON이 공개 상태로 변경됩니다.

`analysis_result: unknown`인 실제 실행은 임의의 PASS로 바꾸지 않습니다.
학습 기록·결정적 자율학습 catalog 검사에는 유료 AI 호출을 사용하지 않습니다.
CI의 제품 기능 검증 기록을 실제 학습자의 교육 효과나 고객 검증으로 해석하지 않습니다.

## 설치 파일과 공개 사이트

파일 공개 여부는 [공개 metadata](https://resistor.kr/edition-downloads.json)가 기준입니다.
기존 v0.27.0 공통판과 전용 에디션 설치 파일은 구분합니다. 각 파일에는 실제 설치·실행 receipt,
버전·원본 소스·공유 빌드 도구·SHA-256을 연결합니다.

OS 감지는 브라우저가 제공한 Client Hints를 우선 사용합니다. Windows의 축약된 x64 UA나
Safari의 Intel Mac 문자열로 실제 CPU를 단정하지 않습니다. 정보가 없거나 Linux ARM·모바일이면
지원하지 않는 설치 파일을 자동 추천하지 않습니다. 사용자가 모든 대상을 직접 선택할 수 있으며,
직접 고른 설치 대상만 해당 브라우저 세션에서 유지합니다. 감지 결과를 추가 전송하지 않습니다.

Windows ARM의 앱은 ARM64, 내장 엔진은 x64 에뮬레이션이며 설치기는 Inno Setup입니다.
Mac 내장 ngspice의 실제 Mach-O 최소 버전은 15.0입니다. [4개 바이너리 검사](evidence/edition-installers/macos-minimum-os.json)에 근거해 macOS 15 이상을 요구하며 13·14 호환을 주장하지 않습니다. Mac 자체 서명과 실제 실행 확인은
Apple Developer ID·공증을 뜻하지 않으며 Windows Authenticode 서명도 별도입니다.
Linux는 Ubuntu 24.04 runner 기준이며 모든 배포판·사용자 실기기에서의 실행을 보장하지 않습니다.
DRC/LVS/PEX 추가 도구·해당 공정 deck·제조 signoff는 설치 검증 범위 밖입니다.

## 도메인

정식 사이트는 [resistor.kr](https://resistor.kr/)이며 www는 경로·query를 유지한 308 이동을 사용합니다.
가비아 이름서버를 유지하고 Vercel이 안내한 A/CNAME만 설정했습니다.
[실제 DNS·HTTPS 검증](evidence/domain-resistor-kr/verification.json)은 별도로 저장합니다.
기존 Vercel 주소도 호환 주소로 유지합니다. EDA 서버·사용자 설계·API 키는 인터넷에 배포하지 않습니다.

참고: [Client Hints API](https://developer.mozilla.org/en-US/docs/Web/API/NavigatorUAData/getHighEntropyValues),
[Windows ARM x64 에뮬레이션](https://learn.microsoft.com/en-us/windows/arm/apps-on-arm-x86-emulation).
