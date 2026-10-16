# Edu / Indust 전용 자동 업데이트

두 제품은 공통 업데이트 엔진을 사용한다. `DesktopUpdater`의 실행 edition은
앱 시작 시 결정하며 renderer 요청으로 변경할 수 없다.

- `editions-vX.Y.Z` 공동 릴리스 또는 `edu-vX.Y.Z` / `indust-vX.Y.Z` 전용 릴리스에서
  현재 edition과 OS/CPU에 맞는 설치 파일만 선택한다. 과거 `vX.Y.Z` 공통판으로 대체하지 않는다.
- 공식 GitHub 파일명·주소·크기·SHA-256, 짝을 이루는 JSON 빌드 영수증의 해시,
  제품 ID·소스 revision·native QA 완료를 확인한다. 검증 실패 시 설치 후보를 제거한다.
- 자동 설정을 켜면 시작·인터넷 재연결·6시간 주기에서 확인하고 파일을 자동 다운로드한다.
  설치와 재시작은 앱의 확인 절차를 거친다. 미리보기/안정 채널과 자동 설정도 제품별로 저장한다.
- 캐시는 `userData/updates/edu` / `userData/updates/indust`로 분리한다.
  기존 Indust 업데이트 설정은 읽어서 이어 쓰며 기존 폴더를 변경하거나 Edu로 복사하지 않는다.
- Mac은 `~/Applications/Resistor Edu.app` / `~/Applications/Resistor.app`, Linux는
  `~/.local/opt/resistor-edu/버전` / `~/.local/opt/resistor-indust/버전`을 사용한다.
  desktop launcher의 bundle ID도 구분한다. 설치 실패 시 해당 앱의 백업을 복원한다.
- Windows는 검증한 전용 EXE를 실행한다. 설치 파일 자체의 제품별 앱 ID와 설치 폴더를 사용한다.
  Windows ARM64는 native shell과 x64 엔진 에뮬레이션의 기존 공개 배포 범위를 유지한다.

실행:

```sh
node --test tests/desktop-updates.test.mjs tests/edition-updates.test.mjs tests/product-editions.test.mjs
node scripts/edition-update-feed-qa.mjs
```

[공개 릴리스 확인 기록](evidence/edition-updates/live-feed.json)은 Edu·Indust × 5 OS/CPU의
공식 파일과 영수증 확인 10건을 보존한다. 이 검사는 대형 설치 파일을 다운로드하거나
실제 Mac·Windows 앱을 교체한 결과가 아니다. 파일 무결성·취소·설치 경로·백업 복원은
별도 deterministic 테스트에서 확인한다.

이미 배포된 구버전 updater의 실행 코드를 원격으로 변경할 수는 없다.
특히 Edu 업데이트가 차단된 기존 앱은 이 변경이 포함된 설치 파일로 한 번 교체해야 한다.
소스 빌드의 성공을 새 설치 파일 공개로 표시하지 않는다. 공개 Mac 앱의 Developer ID와
Apple 공증, Windows Authenticode 서명 상태도 빌드 영수증에서 별도로 확인한다.
