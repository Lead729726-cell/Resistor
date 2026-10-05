# 레지스터 외부 다운로드

현재 다운로드 페이지: https://month-barn-convention-traveling.trycloudflare.com

레지스터 0.14.0의 Windows x64 설치 파일과 Apple Silicon·Intel Mac ZIP을 제공합니다. Mac은 macOS 13 이상을 대상으로 한 개발 미리보기이며 실기기 실행, Developer ID 서명, Apple 공증은 미검증 상태입니다.

M1 이후 Apple Silicon 다운로드는 **Register-0.14.0-mac-arm64-r2.zip** 실행 차단 대응 수정본입니다. 앱·프레임워크·하위 실행 앱의 자체 서명, JIT entitlement, 전체 파일·링크 검증 목록과 `Install Register.command`를 포함합니다. 도우미는 사용자 승인 후 `~/Applications/Register.app`에 복사하고 이 앱의 다운로드 차단 표시만 처리합니다. 기존 사용자 설치 앱은 백업하고 설계를 보존합니다. 자체 서명은 Developer ID·Apple 공증과 별도이며 Mac 실기기 실행을 확인한 것으로 표시하지 않습니다. 기존 Windows·Intel 파일은 유지합니다.

수정본의 실제 ZIP 코드 페이지·리소스 서명·CRC·manifest 검증은 `docs/evidence/mac-arm64-repair-archive.json`, 손상 거부 검증은 `docs/evidence/mac-signature-integrity.json`에 기록합니다. 설치·취소·앱 백업·손상·잘못된 CPU·OS 등에 대한 9개 설치 로직 검사는 macOS 명령을 대체한 별도 Linux 컨테이너 검사이며 `docs/evidence/mac-installer-logic.json`에 그 범위를 명시했습니다.

`register-voltage-references.zip`에는 볼테지용 GDS·층 정보 5종, 작성 가정 공정 레시피 4종, 레지스터 뷰어 파일 4종과 저항 모양 로고 SVG/PNG를 포함합니다. 사용법은 ZIP의 `README.md`에 있습니다. 로컬 볼테지에서 업로드·계산·3축 단면·보고서 저장을 확인했으며 공개 ZIP도 전체 다운로드와 SHA-256을 확인했습니다. 설치 파일은 기존 0.14.0 파일을 유지하고, 새 로고는 작업 소스와 아이콘 자산에 반영했습니다.

다운로드 첫 화면의 **오픈소스 PDK 모음집**에서 `/pdk-links.html`로 이동할 수 있습니다. 2026-10-04 기준 SKY130, GF180MCU, IHP SG13G2, ASAP7, FreePDK45/Nangate45, SiEPIC EBeam과 관련 설치·설계 도구 13개 항목을 정리했습니다. 33개 링크(고유 주소 32개)를 제조 공정 기반 PDK·예측 PDK·포토닉스·설치 도구·설계 흐름으로 구분하고 개별 사용 조건과 레지스터 검증 범위를 표시합니다. 외부 문서와 저장소는 새 탭으로 열립니다. 링크 목록은 `/open-pdk-links.md`, `/open-pdk-links.json`으로 저장할 수 있습니다.

원본 목록은 `docs/open-pdk-links.json`, 페이지 생성기는 `scripts/download-pdk-catalog.mjs`입니다. 목록을 수정한 뒤 다운로드 스냅샷을 다시 준비하고 다운로드 서버만 재시작하면 터널 주소를 유지하면서 반영할 수 있습니다. 외부 링크와 공개 페이지를 확인하는 명령은 다음과 같습니다.

```powershell
npm run download:check-pdk-links
npm run download:verify-pdk
```

외부 주소의 HTTP 응답 확인 결과는 `docs/evidence/open-pdk-external-links.json`, 공개 페이지의 데스크톱·모바일 탐색, 목록 파일 해시와 비공개 경로 차단 확인 결과는 `docs/evidence/open-pdk-public-page.json`에 기록합니다. 링크 접근 성공은 해당 PDK의 레지스터 실행 검증과 별도입니다.

세 파일을 공개 HTTPS 주소로 전부 내려받아 릴리스 파일의 크기와 SHA-256 일치를 확인했습니다. 각 파일의 HTTP 206 이어받기도 확인했습니다. 결과는 `docs/evidence/public-download-0.14.0.json`에 기록합니다.

이 주소는 계정·도메인 없이 만든 Cloudflare Quick Tunnel 임시 주소입니다. PC가 켜져 있고 Docker Desktop과 다운로드 컨테이너가 실행 중이어야 접근할 수 있습니다. 터널을 재시작하면 주소가 바뀔 수 있습니다. 현재 주소는 `.runtime/download-link.json`에서 확인합니다.

작업 폴더에서 실행합니다.

```powershell
npm run download:start
node scripts/download-verify.mjs
```

M1 파일만 전체 다운로드·해시·이어받기를 다시 확인하려면 `node scripts/download-verify.mjs --mac-arm64`를 실행합니다. 다운로드 스냅샷은 `docs/evidence/mac-arm64-repair.json`이 검증 완료 상태일 때 Apple Silicon 기본 링크를 r2 수정본으로 교체합니다. 새 파일명으로 이전 ZIP 캐시와 구분합니다.

현재 실행 중인 컨테이너는 재사용합니다. 검증 명령은 세 설치 파일 전체를 공개 URL에서 받아 확인하므로 약 365 MB의 다운로드 트래픽이 발생합니다. 다운로드 공유를 중지하려면 다음 명령을 실행합니다.

```powershell
npm run download:stop
```

공유 서버는 `.runtime/public-download/0.14.0`의 승인된 릴리스 파일 목록만 제공합니다. EDA 웹 앱, 작업 폴더, RPC, worker 인증 정보는 공개하지 않습니다. 호스트의 다운로드 원본 포트도 `127.0.0.1:18767`에만 연결합니다.

Cloudflare 안내: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/
