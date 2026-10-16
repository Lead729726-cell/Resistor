# Edu / Industry 다운로드 분리

공개 사이트의 다운로드 첫 영역에서 두 에디션을 선택합니다.

- [Resistor Edu 다운로드](https://resistor-downloads.vercel.app/download/edu/): 교육·실습용 소스 ZIP과 `npm run dev:edu` 실행 안내.
- [Resistor Industry 다운로드](https://resistor-downloads.vercel.app/download/industry/): 전문 설계용 소스 ZIP과 `npm run dev:indust` 실행 안내. 앱의 제품 이름은 Resistor Indust입니다.

각 ZIP은 공개 브랜치의 `product-edition.json`을 실제 확인한 commit SHA로 고정합니다.
브랜치가 나중에 바뀌어도 표시한 source revision과 다운로드 파일이 달라지지 않습니다.
소스 ZIP은 Node.js 24와 최초 공개 엔진 준비가 필요합니다. 두 에디션의 사용자 폴더·엔진·키 분리는 유지합니다.

Windows x64, Apple Silicon Mac, Intel Mac, Linux x64 전용 설치 파일은 아직 공개되지 않았으므로
준비 상태로 표시합니다. 기존 v0.27.0 공통 설치 파일 네 개는 홈의 별도 영역에서 기존 URL·크기·SHA-256을 유지합니다.
공통판을 Edu 또는 Industry 전용 설치 파일로 바꿔 표시하지 않습니다.
새 네이티브 설치 파일 발행·서명·Apple 공증·제조 검증은 이 사이트 변경으로 완료되지 않습니다.

## 갱신과 배포

```sh
# 공개 브랜치의 edition과 SHA를 확인하고 소스 다운로드 정보를 갱신
npm run download:editions
# 기존 안내·파일 해시·영상은 보존하면서 에디션 페이지와 홈을 다시 생성
node scripts/download-workbench.mjs
npm run test:download-editions
npm run test:download-site
npm run test:learning
npx vercel deploy --dry --prod --yes --project resistor-downloads --scope seokhyeongs-projects --cwd platform/download-site > .runtime/edition-download-deploy-dry.json
node scripts/verify-static-deployment.mjs
npx vercel deploy --prod --yes --project resistor-downloads --scope seokhyeongs-projects --cwd platform/download-site
```

`edition-downloads.json`은 에디션별 source identity·SHA·ZIP URL·전용 설치 파일 미공개 상태를 기록합니다.
임의 다운로드 호스트, 다른 edition, common installer 재분류는 validator에서 거절합니다.
`/download/indust/`는 `/download/industry/`로 연결합니다.
기존 `/download/windows`, `/download/macos`, `/download/macos-intel`, `/download/linux`는 그대로 유지합니다.

최종 배포 목록에서 새 페이지뿐 아니라 112개 실습·원본 영상 3개·기존 설계 자료가 포함되는지 확인합니다.
Vercel ignore 목록은 공개 디렉터리의 부모와 하위 파일을 모두 허용하고 `.env*`·`.vercel`·`.runtime`을 제외합니다.
이 프로젝트는 정적 다운로드 안내만 배포하며 EDA worker·설계 데이터·키는 배포하지 않습니다.

## 확인 범위

[로컬 검사](evidence/edition-downloads/local/verification.json)와
[공개 검사](evidence/edition-downloads/public/verification.json)는
에디션 선택·개별 페이지·다른 에디션 이동·테마·320/390/1440px 화면·실제 source ZIP redirect와
공개 소스의 product identity, 기존 OS 다운로드 URL을 확인합니다.
소스 ZIP은 공개 HEAD 응답과 commit identity를 확인하며 전체 ZIP bytes/checksum 검증과 구분합니다.
기존 튜토리얼 영상·설계 ZIP은 `tutorial-library-media.mjs`로 원본 크기·SHA-256을 확인합니다.
