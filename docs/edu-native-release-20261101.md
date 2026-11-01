# Resistor Edu 0.32.0 네이티브 배포 기록 — 2026-11-01

[전체 앱 다운로드](https://resistor.kr/download/edu/) · [GitHub 공개 릴리스](https://github.com/Lead729726-cell/Resistor/releases/tag/edu-v0.32.0) · [기계 판독용 검증 기록](evidence/edu-native-release-20261101.json)

배포 소스는 `f83ce0d56bf2b9de247e2de32d19e1659d5e4e7b`입니다. Windows x64, macOS ARM64·Intel, Linux x64의 **CI 설치 파일 4개와 각 파일의 검증 기록**을 공개했습니다. 로컬 CUA 검사용 Windows 설치 파일은 공개 파일과 섞지 않았습니다. Vercel 배포 `dpl_5MWchGgKXUKJ184iN9KQpgDaP1nx`의 상태는 READY이며, 2026-11-01 08:26:25 UTC에 공개 사이트 검사 14/14개가 통과했습니다.

## 공개 파일

| 대상 | bytes | SHA-256 |
| --- | ---: | --- |
| linux-x64 | 272,091,316 | `8d631f2ed4c5fa8a579f3ba96b3f1bbc3bb95895431cea9fee0634e763b2166d` |
| macos-arm64 | 242,164,945 | `301a5da6e7a732f8255b8b31efb671bdd37681d758553f0701de594888a85bee` |
| macos-x64 | 250,176,646 | `4858106b3bdad7ca69fce50123769d551cab2ab58737e97dec21cb28125dcada` |
| windows-x64 | 174,732,258 | `130d9b9215eb511902b5eb3f9b7e220449580247ec948c5245d984cdf60522de` |

각 파일명은 `Resistor-Edu-0.32.0-<대상>`이며 확장자는 Windows `.exe`, macOS `.zip`, Linux `.tar.gz`입니다. 위 GitHub 릴리스에서 설치 파일과 동일 이름의 JSON 검증 기록을 함께 제공합니다. 공개 다운로드 바이트·크기·SHA-256과 기록을 대조했으며, 이후 공개 사이트 검사에서는 링크·메타데이터·업데이트 선택을 검사했습니다. 해당 검사에서 설치 파일 전체를 다시 내려받았다고 주장하지 않습니다.

## 실제 확인 범위

- [네이티브 CI](https://github.com/Lead729726-cell/Resistor/actions/runs/41287799227)의 네 대상에서 각각 실제 엔진 검사 13개 통과: 1.8 V 저항 분배기의 0.9 V·90 µA, 회로 편집/SPICE, GDS/OASIS 왕복, 취소·재시작 보존, SKY130 inverter transient 등. 이상적인 소자 모델을 사용한 OP의 기능 판정은 UNKNOWN으로 유지합니다.
- 각 패키지의 엔진 소스 6개 해시가 위 커밋의 원본 Git 바이트와 일치합니다. 내장 버전은 Python 3.13.16, KLayout 0.30.5, ngspice 47입니다. 기본 내장 실행에는 Docker가 필요하지 않습니다.
- 네 대상 모두 실제 공식 서버 인증, 인증 전 RPC 차단, Edu 창 표시, 내장 엔진 RPC, 인증 해제를 확인했습니다. Linux는 실제 `gnome_libsecret` 암호화 키링을 사용했습니다.
- 별도 Windows CUA 확인에서 실제 앱 인증·저장된 CMOS 실습 재열기·엔진 RPC·인증 해제를 수행했습니다. Chrome에서 공개 Edu 다운로드 화면의 0.32.0 네 카드와 기존 Windows ARM64 0.31.0 카드를 확인했습니다.
- 공개 사이트·리다이렉트·검증 기록·Edu 업데이트 선택 14개 검사 통과. Industry 페이지/다운로드/업데이트 바이트와 공유 GitHub Latest `editions-v0.31.0`은 유지했습니다.

## 인증과 실행 조건

처음 실행할 때 **인터넷과 유효한 Edu 시리얼**이 필요합니다. Edu 강의 사용권에 Industry는 포함되지 않습니다. 공식 인증 서버는 [https://resistor-licensing.nuev-official.workers.dev](https://resistor-licensing.nuev-official.workers.dev/health)이며 Cloudflare Durable Object SQLite 영구 저장소 및 설치 파일의 공개키 일치를 확인했습니다.

Windows 10 이상 x64, macOS 15 이상 ARM64(M1 포함)·Intel x64, Linux x64 GUI 환경을 대상으로 합니다. Linux는 OS 암호화 키링이 필요하며 평문 저장소로 우회하지 않습니다. Windows ARM64는 이번 재빌드 대상이 아니며 기존 0.31.0 및 x64 엔진 에뮬레이션 안내를 보존했습니다.

## 남은 제한과 정리

Windows Authenticode 서명은 없습니다. Mac은 ad-hoc 서명이며 Apple Developer ID 서명·공증은 없습니다. 따라서 OS 보안 경고가 나타날 수 있으며, 배포 작업에서 시스템 보호 기능을 끄지 않았습니다.

Magic/Netgen과 공정 룰을 통한 DRC/LVS/PEX는 추가 설치·설정·실행 범위입니다. 이번 네 설치 파일은 해당 물리 검증이나 제조 signoff를 통과했다고 주장하지 않습니다. 인프런 구매 웹훅과 자동 시리얼 이메일 발송은 아직 연결되지 않았습니다.

작업용 QA 권한 **13개 폐기**, GitHub 임시 QA 비밀값 **4개 삭제**, 잔여 GitHub QA 비밀값 **0개**를 확인했습니다. 기존 사용자 테마·appearance 파일과 개발 엔진 상태는 보존/복원했습니다. 이 문서는 이미 공개된 소스와 설치 파일의 증거를 기록하며 앱 재빌드나 새 설치 파일 공개를 수행하지 않습니다.
