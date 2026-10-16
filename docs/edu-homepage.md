# Resistor Edu 홈페이지 연결

2026-10-16, `codex/resistor-edu` 작업 공간. 공개 [홈](https://resistor.kr/)과
[Edu 사용법 가이드](https://resistor.kr/edu/)에 실제 구현된 학습 흐름을 연결했다.
기존 주소 [resistor-downloads.vercel.app](https://resistor-downloads.vercel.app/)도 같은 배포를 제공한다.

## 반영 내용

- 홈의 퀴즈·자율학습 / 설계·시뮬레이션 진입 영역, 전체 페이지의 Edu 메뉴.
- 기존 문제 은행에서 가져온 76문제와 기초·응용·심화 분류, 자동 추천 조건,
  AI 문제·피드백 재사용 및 호출 승인 범위 안내.
- CMOS 연결 실습 1–7 페이지: 한 단계씩 표시, 이전·다음, 브라우저 뒤로가기,
  새로고침과 단계 직접 링크. 블록 B / 회전 R / 반전 M / Esc 안내.
- 별도 QA 사본에서 촬영한 실제 앱 화면과 공개 공부 리그 연결.
- 최신 Edu 앱 소스 `2cce7fbf4a100788ab37f2fde7c88c72354e9604` ZIP 연결.

이 사이트는 앱 사용법을 안내한다. 회로 편집·엔진 실행·학생 제출은 Edu 앱에서 수행한다.
웹 가이드의 페이지 이동을 실습 완료나 검증 PASS로 기록하지 않는다.
기존 인버터 QA의 시뮬레이션과 DRC/LVS/PEX `not_run`을 구분해서 설명한다.
공개 리그는 운영 PC·인터넷·터널이 실행 중이어야 사용할 수 있다.

## 기존 배포 보존

Edu 작업 폴더의 웹 안내가 공개 사이트보다 오래되어 `origin/main`의
`34a6b1ebbc09d0da35201c16f8a415f2144d71ff`에서 공통 웹 파일과 다운로드 생성기를
선택적으로 가져왔다. 동시 공개 갱신 `e25828bb4e988a2d34e59568b2d19796a5bf114c`의
발진기·센서 안내, 프로젝트·파형·영상 22개 자산과 최신 Industry 소스 링크도 보존했다.
이 예제의 엔진을 Edu에 복사하지 않고 기존 정적 안내를 유지한다.
앱·엔진·Industry 작업 폴더는 수정하지 않았다.
안정된 `resistor.indust` 식별자에 한해 기존 Industry / Indust 표기를 호환한다.

에디션별 v0.28 설치 파일 10종과 기존 공통 v0.27 파일 4종의 파일명·URL·크기·해시·
빌드 revision·검증 영수증을 보존했다. 최신 소스와 기존 설치 파일의 포함 기능을 구분한다.
이번 작업은 새 네이티브 설치 파일을 빌드하거나 공개하지 않았다.

공통 수정은 엔진을 복사하지 않고 기존 브랜치 정책에 따라 전달한다.
홈페이지 생성 변경만 공통 브랜치로 전달할 때에는 아래 생성기·웹 자산·테스트를
함께 가져오고 당시의 공개 다운로드 manifest와 원본 미디어를 먼저 보존해야 한다.

## 갱신과 확인

Node.js 24에서 실행한다. 기존 설치 파일 manifest를 유지하는 웹 안내 갱신 경로다.

```sh
node scripts/tutorial-library-media.mjs
node scripts/download-workbench.mjs
node --test tests/edu-site.test.mjs tests/download-editions.test.mjs tests/system-detection.test.mjs
node scripts/verify-edu-homepage.mjs
```

생성 원본은 `scripts/download-edu-guide.mjs`, `scripts/site/edu-guide.mjs`,
`scripts/site/edu-guide.css`, `scripts/download-workbench.mjs`다. 생성된 정적 파일은
`platform/download-site/`에만 배포한다. 기존 Vercel 프로젝트 `resistor-downloads`를
재사용하며, 사용자 데이터·환경 파일·키·EDA 서버를 업로드하지 않는다.

확인 결과:

- 핵심 테스트 301개, edition 격리 테스트 9개, typecheck, 소스 감사 통과.
- 공개 도메인 2개에서 HTTP/파일 무결성/다운로드 리다이렉트/기존 영상 범위 요청과 발진기 자산 보존 124개 통과.
- 실제 브라우저로 두 모드, 7단계 이동, 이전·다음 경계, 뒤로가기·새로고침,
  390px 모바일과 1280px 데스크톱, 밝은·어두운 테마를 확인.
- 배포 입력 277개, 필수 파일 누락 0개, 비공개 경로 0개. 기존 미디어 3편 보존.

[공개 확인 기록](evidence/edu-homepage/public-verification.json) ·
[기존 설치 파일 보존](evidence/edu-homepage/download-preservation.json) ·
[공개 홈페이지 화면](evidence/edu-homepage/public-home.png) ·
[모바일 밝은 테마 화면](evidence/edu-homepage/mobile-light.png)

구현 커밋 `8b1916027bf5ce778d326fd5a14bd66d2a322e36`의
[전체 소스 CI](https://github.com/Lead729726-cell/Resistor/actions/runs/38863480813)가
성공했다. 핵심 검사·두 edition 빌드와 기존 튜토리얼 전체의 UI·수식·영상 검사를
포함한다. [확인 영수증](evidence/edu-homepage/source-ci.json)은 실행한 검사 범위를 보존한다.

전체 설치 파일을 다시 다운로드하거나 새 엔진 실행·제조 signoff·교육 효과 평가를
수행한 기록은 아니다. 기존 앱 구현 및 실제 실행 근거는
[학습 흐름 검증 기록](edu-learning-workflow.md)에서 확인한다.
