# Resistor 전체 튜토리얼 · v0.27

[공개 학습 라이브러리](https://resistor-downloads.vercel.app/tutorial/library/) ·
[전체 안내 다운로드](https://resistor-downloads.vercel.app/learning-handbook.md)

35개 작업 흐름, 59개 설계 블록, 18개 계산 실습으로 총 112개 개별 페이지를 제공합니다.
현재 catalog 54개와 가산기/CPU 5종을 전부 포함하며, ΣΔ 19개와 SAR 8개 블록도 개별 실습입니다.
실제 회로 JSON에서 root 포트와 모든 하위 셀·포트·직접 소자 수·내부 block 참조를 읽습니다.
검색·분야/종류 필터·6개 학습 순서, 관련 실습, 인쇄/PDF 저장과 전체 Markdown 안내를 제공합니다.

학습 체크는 이 브라우저의 localStorage에 저장합니다. 로그인과 외부 전송이 없으며
엔진 PASS, 실행 완료, 기능 검증 또는 제조 승인으로 취급하지 않습니다.
계산 실습은 `packages/calculators/src/index.ts`의 원본 함수를 번들하므로 별도 수식을 복제하지 않습니다.
ADC/DAC 계산기의 endpoint `2^N−1` 정의와 SAR/ΣΔ의 bin-width `2^N` 정의를 안내에 구분합니다.

## 포함한 작업

- 설치·Docker 없는 엔진·추가 도구·전환·Mac 경고·온라인 업데이트·내 반도체·테마/단축키.
- 새 빈 회로·프로젝트 검색·다음 실행·소자 값/단위·핀 연결·계층 복사/승인·layout 직접 그리기.
- 배선 후보·칩 영역 제한·회로→규격 layout·GDS 역추출·PDK/모델/포트 설정.
- OP/DC/AC/transient·전압강하/전류·파형 Lab·이력/freshness·DRC/LVS/PEX·pre/post·PVT.
- MOS 수치 최적화·논문 특성 실험·제조 인계에서 남은 범위.
- 독립 뷰어·도형 검토·비평탄 step/hole/coverage·증착/식각/CMP.
- 파일 교환·상용 backend·원본 DB API·공동 설계·선택적 AI 근거/예산·MCP/Xschem subset.
- RC/MOS, 논리 셀 8종, MUX, 가산기와 CPU4/CPU16, 전원/클록/아날로그 6종, SoC 7종, ΣΔ 19종, SAR 8종.

## 결과와 영상 범위

59개 설계 페이지는 generation의 source hash, case, project/run IDs, revision, 조건과
실제 단계별 completed/failed 및 pass/fail/unknown을 보존합니다. 원본 physical PLL 잠금 실패와
연구 OTA 실패 실험도 표시합니다. 과거 실행 기록은 사용자 현재 프로젝트의 결과가 아닙니다.
ZIP 가져오기는 PASS를 상속하지 않으므로 실제 엔진에서 다시 실행합니다.
공개 deck 물리 검사, 선택 PVT/특성, 출력 8bit는 제조 승인·전체 수율·ENOB8을 의미하지 않습니다.

기존 v0.16 첫 회로, v0.17 기본 셀, v0.17 물리 칩 영상 3편의 원본 bytes·한국어 음성·CC·챕터와
촬영 버전 안내를 유지합니다. 이번 갱신은 새 연속 영상 제작이 아닙니다.
v0.27 설명에 사용하는 화면은 별도 실제 UI/엔진 검증의 원본 screenshot입니다.
영상 전체 사람 청취 검수, Apple 공증, 실제 vendor 라이선스 환경 실행·foundry signoff는 미완료입니다.
다운로드 사이트는 정적 자료이며 EDA worker나 외부 공동 작업 서버를 배포하지 않습니다.

## 생성과 검증

```sh
npm run download:learning
npm run test:learning
npm run test:formulas
npm run check:docs
```

`scripts/tutorial-library-content.mjs`의 직접 작성 절차/관찰점과 원본 catalog·schematic·evidence를
`scripts/download-learning.mjs`에서 결합합니다. template 변경 시 누락된 실습은 생성 오류로 차단합니다.
`npm run download:site`도 마지막에 학습 라이브러리를 재생성하여 기존 generator가 링크를 제거하지 않습니다.
`learning-assets.json`은 배포 파일의 크기·SHA-256을, `learning-catalog.json`은 source hash와 전체 coverage를 기록합니다.
새 체크아웃은 `node scripts/tutorial-library-media.mjs`로 공개된 원본 영상 3편과
Git에서 제외한 대형 예제 ZIP 4개를 받아 크기·SHA-256을 검증합니다.
새 영상/음성 생성이나 유료 호출을 하지 않으며 기존 파일이
원본과 다르면 덮어쓰지 않습니다. GitHub Source validation의 별도 tutorials job도 이 검사를 실행합니다.

검사는 모든 실습/관련 링크·source 파일/해시·기록 판정 보존·18개 실제 브라우저 계산·잘못된 입력,
검색/필터/URL 복원·학습 체크·키보드·320/390/768/1440px·테마와 원본 영상 3편의 1080p 디코딩을 포함합니다.
로컬/공개 결과와 화면은 [실제 검사 기록](evidence/tutorial-library/local-verification.json)에 기록합니다.
검사 수는 실행 기록을 기준으로 읽고 엔진 검증 개수와 혼합하지 않습니다.
