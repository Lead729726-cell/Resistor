# Edu / Indust 공통 물리 검증 도구

2026-10-14 이 Windows PC에 Docker와 독립된 **ResistorEDA / Ubuntu 24.04.5 WSL2**를 설치했습니다. Magic 8.3.582, OpenCircuitDesign Netgen 1.5.313, KLayout 0.30.5, Ubuntu ngspice 42를 실제 실행합니다. Edu(18775)와 Industry/Indust(18765)는 같은 설치와 공개 PDK 캐시를 읽으며 프로젝트·학습 기록·인증 파일·엔진 프로세스는 각각 유지합니다.

| 제품 | 엔진 | DRC 도구 | LVS 도구 | PEX 도구 |
| --- | --- | --- | --- | --- |
| Resistor Edu | wsl-linux / 18775 | available | available | available |
| Resistor Industry / Indust | wsl-linux / 18765 | available | available | available |

`available`은 실제 도구와 공정 자료가 실행 가능한 상태입니다. 설계의 PASS를 뜻하지 않으며, 각 실행 결과와 revision을 따로 확인합니다.

## 소스에서 준비·연결

```sh
npm run tools:prepare
npm run tools:connect
npm run tools:status
npm run tools:verify
```

현재 Codex Edu 작업 공간에는 두 checkout의 registry가 있으므로 다음 명령으로 양쪽 엔진을 연결할 수 있습니다.

```sh
npm run tools:connect -- --both
npm run tools:status -- --both
```

일반 checkout에는 그 registry가 없으므로 선택한 버전의 작업 공간에서 각각 실행합니다. `RESISTOR_EDITION`을 명시하면 브랜치 기본값보다 우선합니다. CLI의 연결 작업은 기존 엔진에 인증하고, 실행 중인 해석·조건표·요청이 있으면 전환을 거절합니다. 프로젝트 DB와 파일을 옮기거나 키를 다른 제품에 복사하지 않습니다.

Windows 준비는 이미 활성화된 WSL2가 필요합니다. 고정 Ubuntu rootfs의 SHA-256을 확인하고 사용자 소유 `%LOCALAPPDATA%/Resistor/wsl/ResistorEDA`에 import합니다. 같은 이름의 미준비 배포판이나 기존 저장 디렉터리는 덮어쓰지 않습니다. Windows 기능 변경·관리자 권한 획득·전체 WSL 종료·Docker 내부 배포판 변경·재부팅은 수행하지 않습니다. WSL2가 없는 PC는 [Microsoft 설치 안내](https://learn.microsoft.com/windows/wsl/install)를 먼저 따릅니다.

새로 만든 배포판의 시스템 패키지는 Linux root로 설치하고, 도구 빌드와 엔진은 `resistor` 일반 사용자로 실행합니다. 그 계정에 sudo 권한이나 비밀번호를 부여하지 않습니다. 설치 완료 시 새 배포판만 한 번 종료하여 기본 사용자를 적용합니다. 이미 준비된 배포판과 실행 중인 엔진을 다시 설치하거나 종료하지 않습니다.

Mac/Linux의 `tools:prepare`는 기존 공통 `native-tools-setup.sh`를 재사용하고 `tools:connect`는 native를 선택합니다. 이 변경에서 Mac/Linux의 실제 설치·물리 실행을 새로 검증한 것은 아닙니다.

## 공용 자원과 경로 보존

Linux 도구는 `~/.local/share/resistor/tools`, Python/KLayout은 `~/.local/share/resistor/engine`, 공개 PDK는 `~/.local/share/resistor/pdks`에 둡니다. PDK 캐시는 번들의 공개 `installed-public-SKY130A` 자료만 복사합니다. 기존 캐시는 덮어쓰지 않습니다. 사용자 프로젝트·사설 PDK·provider key를 가져오지 않습니다.

공개 cache의 provenance와 필요한 모델·룰 파일이 확인되면 WSL 실행기가 사용합니다. 명시적인 운영자 `pdk_root` 설정은 계속 우선하며, 캐시가 없으면 기존 Windows PDK 경로를 사용합니다. NTFS 경유 PDK의 느린 파일 탐색을 줄이기 위한 캐시이며 모델과 규칙의 내용을 수정하지 않습니다.

Windows의 detached `wsl.exe` 실행이 시작되지 않는 문제를 수정했습니다. WSL 실행기 자체는 일반 Windows 자식 프로세스로 시작하고, 기존 `native_entry.py`가 Linux 엔진을 분리합니다. 앱/CLI가 끝나도 실제 엔진은 살아 있으며 인증된 소유자만 종료합니다.

과거 Windows 절대 경로의 로그는 같은 WSL workspace에 해당할 때만 읽기 시점에 변환합니다. 반대 전환도 지원합니다. 외부 경로와 `..`/symlink 이탈은 허용하지 않으며 과거 DB나 파일 경로를 다시 저장하지 않습니다. 엔진·모델·도구가 달라진 과거 결과는 stale로 유지합니다.

## 실제 확인 결과

별도로 만든 공개 CMOS inverter QA 프로젝트에서 각 제품마다 다음을 실행했습니다.

- pre-layout ngspice transient: completed / pass, 실제 표본 1544개
- Magic 공개 `drc(full)`: completed / pass, 위반 사각형 0개
- Netgen LVS: completed / pass, circuits match uniquely
- Magic PEX: completed / pass, 저항 45개·커패시터 6개
- 추출 후 ngspice transient: completed / pass, 실제 표본 1544개

또한 QA 사본의 매우 작은 metal 도형과 잘못 연결한 MOS gate에서 DRC/LVS를 실행하여 각각 **completed / fail**을 확인했습니다. 실패 시험은 원본 QA 설계를 변경하지 않으며, 설치 확인이나 다른 검증 성공으로 이 실패를 PASS로 바꾸지 않습니다.

[Edu 원본 실행·도구·모델 지문](evidence/physical-tools/edu.json) · [Indust 원본 실행·도구·모델 지문](evidence/physical-tools/indust.json). 이 결과는 해당 공개 모델·룰·예제의 실행 범위이며 제조 signoff나 실제 공정 단면/TCAD 검증이 아닙니다.

기존 Edu 설명과 이전 run 로그의 재열기를 확인했고, 그 실습에 아직 실행하지 않은 DRC/LVS/PEX는 `not_run`으로 표시됩니다. 원래 Windows 결과는 보존하며 새 WSL 실행으로 자동 재인증하지 않습니다.

## 출처와 공유 코드

- [Microsoft WSL import](https://learn.microsoft.com/windows/wsl/use-custom-distro)
- [Canonical Ubuntu rootfs와 checksum](https://cdimage.ubuntu.com/ubuntu-base/releases/24.04/release/)
- [Magic 소스](https://github.com/RTimothyEdwards/magic) · [Netgen LVS 소스](https://github.com/RTimothyEdwards/netgen)
- [고정 설치 입력](../scripts/physical-tools-lock.json) · [공개 PDK 입력](../scripts/native-pdk-lock.json) · [구성요소 라이선스](THIRD-PARTY-NOTICES.md)

공통 실행기·설치 스크립트·경로 보존 모듈을 두 버전에 동일하게 적용합니다. 제품 기본값, 학습 기능, Industry 검토 기능이나 다른 작업의 변경은 공통 수정 커밋에 섞지 않습니다. 기존 설치 파일에 Magic/Netgen Windows 실행 파일을 추가했다고 주장하지 않습니다. 이 환경은 준비된 독립 WSL을 사용합니다.
