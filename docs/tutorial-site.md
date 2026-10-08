# Resistor 사용 가이드

[공개 튜토리얼](https://resistor-downloads.vercel.app/tutorial/) ·
[다운로드 홈](https://resistor-downloads.vercel.app/)

실제 앱을 조작해 녹화·편집한 한국어 CMOS 인버터 가이드입니다.
427.367초(7분 7초 표시), 1920×1080, 30fps, H.264/AAC이며 10개 챕터,
한국어 합성 음성과 72개 자막을 포함합니다. 기본 플레이어는 자막 없는 영상과
WebVTT를 함께 사용해 CC를 켜고 끌 수 있습니다. 자막을 영상에 넣은 MP4와
영상·음성·자막 묶음도 GitHub Releases에서 제공합니다.

촬영 당시 제품명은 Register 0.16.0입니다. 현재 Resistor 이름으로 공개하되
촬영 화면을 변경하거나 최신 버전을 녹화한 것으로 표시하지 않습니다.
실습 교환 파일은 가져온 뒤 자신의 환경에서 해석을 다시 실행해야 합니다.

## 재생·다운로드 검증

- 공개 사이트에서 1920×1080 디코딩, 427.367초 길이와 오류 없는 재생 확인.
- 전압·전류(03:29), GDS(05:54), 마지막 실습(06:35) 챕터의 실제 이동 확인.
- 영상 전체 SHA-256과 앞·뒤 HTTP 206 Range 응답을 원본 바이트와 비교.
- 자막, 실습 파일, 다운로드 ZIP과 기존 네 운영체제 경로 확인.
- 모바일 390×844 화면의 가로 넘침과 챕터 재생, 밝은·어두운 테마 확인.

[배포 기록](evidence/tutorial-site/deployment.json),
[공개 HTTP·파일 검사](evidence/tutorial-site/public-http-verification.json),
[브라우저 검사](evidence/tutorial-site/browser-verification.json).
영상 제작 시 기술 검사 270개를 통과했고 공개 전후 화면·재생을 표본 확인했습니다.
영상 전체를 사람 귀로 듣는 검수는 수행하지 않았습니다.

ngspice 해석, 신호 시험 8/8, Magic DRC와 Netgen LVS를 실제 실행했습니다.
PEX/post-layout 해석은 미실행이며 3D 높이는 표시용입니다. 전류 화살표는
소자 단자 전류이며 금속의 공간 전류 밀도 또는 보정된 공정 TCAD 결과가 아닙니다.

## 사이트 갱신

`npm run download:site`는 설치 파일과 튜토리얼 페이지·챕터 정보를 다시 만듭니다.
작은 자막·실습 파일·썸네일은 사이트 소스에 포함합니다. 영상은 Git에 넣지 않습니다.
새 체크아웃에서 배포할 영상은 다음 명령으로 공개 릴리스에서 내려받고
크기와 SHA-256을 검증합니다.

```sh
node scripts/download-tutorial.mjs --prepare-media
```

Vercel 프로젝트 `resistor-downloads`에 `platform/download-site`의 정적 파일을
배포합니다. `/tutorial`과 `/tutorial/`은 `tutorial.html`로 연결하며 모든 재생
리소스는 같은 사이트에서 제공합니다. EDA 서버와 설계 작업공간은 이 배포에
포함하지 않습니다.
