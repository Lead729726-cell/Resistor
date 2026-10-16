# Resistor 웹 안내 정리

다운로드 사이트의 129개 안내 페이지를 같은 Precision Workbench 메뉴·색상·글자 체계로 연결했습니다. 이 변경은 웹 안내의 사용성을 개선하며 엔진·계산식·단위·설계·실행 기록을 변경하지 않습니다.

## 사용자 흐름

- 홈에서 Edu / Industry를 먼저 선택해 에디션별 소스 ZIP·실행 안내로 이동합니다. 미공개 전용 설치 파일 상태와 기존 v0.27.0 공통판 Windows, Apple Silicon Mac, Intel Mac, Linux 설치 파일을 구분합니다. 기존 파일·크기·SHA-256·전달 주소를 유지합니다. [다운로드 분리와 검증](download-editions.md).
- 상세 파일 해시와 검증 범위는 다운로드 카드에서 펼칩니다. Edu/Industry 소스 구성과 현재 공통 설치 파일을 구분합니다.
- 튜토리얼 검색을 앞에 배치하고 112개 실습을 24개씩 탐색합니다. 검색·분야·종류는 함께 적용하며 URL로 검색 조건·페이지 번호를 다시 열 수 있습니다.
- PDK 자료실에서 13개 자료를 검색하거나 분야로 좁힙니다. 공식 원문 링크 33개, 자료 확인 날짜와 기존 지원·검증 범위를 보존합니다.
- 모바일에서는 메뉴 버튼으로 이동·테마 선택을 펼칩니다. Esc로 닫고 키보드 초점을 복원합니다. 본문 건너뛰기와 실습 목차도 제공합니다.
- 문서의 넓은 표는 표 영역에서 좌우로 읽으며, 긴 회로 이름은 작은 화면 안에서 줄을 바꿉니다. 원본 수치·단위·수식과 복사할 문자열을 변경하지 않습니다.

## 갱신

```sh
npm run download:learning
npm run test:learning
npm run test:download-site
npm run check:docs
npm run audit:source
```

`scripts/download-workbench.mjs`가 기존 안내 생성의 마지막 단계에서 공통 헤더·테마·PDK 자료실·목록 구성을 적용합니다. 공통 스타일과 테마/메뉴 동작은 `scripts/site/`에서 관리합니다. `scripts/tutorial-library/learning.js`가 검색·페이지·학습 체크를 처리합니다.

공통 테마 코드는 문서 head에서 이전 선택을 읽고 DOM 준비 후 버튼을 연결합니다. PDK 페이지를 포함해 페이지당 한 번만 로드합니다. 테마와 학습 체크를 외부로 전송하지 않습니다. 학습 체크는 실제 엔진 PASS로 변환하지 않습니다.

## 검증 범위

129개 페이지의 메뉴·본문 접근·테마 구성, 전체 112개 실습의 페이지 이동, 검색·새로고침·초기화, PDK 필터와 33개 공식 원문 보존, 모바일 메뉴·Esc, 두 테마의 설명 글 대비, 320–1440px 화면과 18개 원본 계산 실습을 검사합니다. 기존 한국어 영상 3편의 재생·1080p·자막도 확인합니다.

[공개 홈](https://resistor-downloads.vercel.app/) · [학습 라이브러리](https://resistor-downloads.vercel.app/tutorial/library/) · [PDK 자료실](https://resistor-downloads.vercel.app/pdk-links.html) · [튜토리얼의 실제 기록과 범위](tutorial-library.md)

새 연속 영상, 새 설치 파일, 새로운 엔진 실행이나 제조 검증을 이번 화면 정리의 결과로 표시하지 않습니다.
