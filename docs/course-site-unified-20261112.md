# Resistor Edu 공개 사이트 공용 디자인 범위

2026-11-12. Paper · graphite · forest 방향을 홈·강의 소개에 이어 기존 자료 페이지에도 적용했다. 이 문서는 로컬 후보의 구현과 검증 기록이며 배포 완료를 뜻하지 않는다.

## 페이지 조사

- 운영 배포 `dpl_5roH9MogfydVr58L4kUoJVuxi4ns`의 원본 294개 파일을 SHA-1과 크기로 확인한 사본에서 후보를 만들었다.
- 해당 운영 배포에는 HTML 138개가 있다. 로컬 소스에만 존재하는 `engine-verification-20261024.html`을 운영 후보에 추가하지 않았다.
- 기존 HTML 138개와 신규 `/terms/`, `/privacy/` 2개를 포함해 후보 140개 전부 공용 머리말·테마·하단 안내를 사용한다. 본문까지 동일 디자인을 적용하지 못한 페이지는 없다.
- 범위: 홈/강의 소개 2, 다운로드 4, 무료 실습/구매 안내 2, Edu 안내 1, 일반 튜토리얼 12, 학습 문서 112, 자료/PDK 2, 연구 1, 메일 안내 2, 법적 안내 2.
- 임베드된 워크북의 계산·실행 코드와 강의 미디어는 이번 웹 문서 스타일 변경 대상이 아니다.

## 구현

`scripts/course-site-design.mjs`가 모든 공개 HTML을 순회한다. `scripts/site/course-document-design.mjs`는 기존 본문, 입력 필드, 링크, 스크립트를 보존하고 공용 화면 구조를 적용한다. `scripts/site/course-documents.css`가 문서의 제목·행간·표·폼·이미지·모바일 간격을 담당한다.

자료 원본 링크나 검증 범위를 포함한 기존 footer는 삭제하지 않고 제자리에 ‘이 문서의 추가 안내’로 남긴다. 인쇄에서는 이 안내 내용을 보존한다. 사이트 하단의 이용약관·개인정보 링크는 접지 않고 노출한다.

법적 페이지의 내용과 준비 상태는 별도 `scripts/product-legal-site.mjs`가 담당한다. 현재 운영 확인 항목이 남아 있는 검토본이며 `noindex`와 시행일 미확정을 표시한다. 준비 상태 진단 JSON은 공개 후보에 넣지 않는다. 두 페이지는 디렉터리의 `index.html`로 생성하고 기존 Vercel 설정을 바꾸지 않는다. Vercel의 [디렉터리 문서](https://vercel.com/docs/directory-listing)는 디렉터리에 index 파일이 있으면 해당 파일을 제공하는 동작을 설명한다. 실제 호스팅 동작은 배포 후보에서 별도 확인해야 한다.

## 로컬 재생성

운영 배포에는 저장소 출력과 다른 최신 설치 파일 메타데이터가 있을 수 있다. `platform/download-site` 전체를 그대로 덮어 배포하지 않는다. 현재 운영 파일을 모두 검증한 새 후보에 아래 두 생성기를 적용한다.

```powershell
$env:RESISTOR_SITE_OUTPUT = '.runtime/course-site-unified-20261112/candidate'
node scripts/course-site-design.mjs
node scripts/product-legal-site.mjs
node scripts/course-site-inventory.mjs --output docs/evidence/course-site-unified-20261112/route-inventory-after.json
$env:PORT = '18957'
node scripts/course-site-preview.mjs
```

현재 미리보기는 `http://127.0.0.1:18957/`이다. 미리보기는 구매·인증 서버 요청을 전달하지 않으며 공개 상품 목록 확인만 제공한다.

## 확인한 범위

- 기존 294개 파일의 복사 전 SHA-1·크기 일치.
- 기존 main 본문 138개와 native release 링크 19개 보존. 원래 footer가 main 안에 있는 경우 안내용 요소로 감싸는 마크업만 변경한다.
- API, package, 다운로드·업데이트 메타데이터, Vercel 설정, 예제 및 미디어 원본 바이트 동일. 변경 가능한 기존 비-HTML 파일은 학습 HTML 해시를 갱신하는 `learning-assets.json`과 공용 디자인 자산으로 한정한다.
- 후보 HTML 정적 경로·별칭 417개와 공용 자산 4개가 로컬 HTTP 200.
- 공용 변환·수식/UI 계약·법적 생성기 테스트 16개 통과. CSS 파싱과 반복 재생성의 바이트 안정성 확인.
- 브라우저 화면·모바일 조작 검수와 호스팅 후 검수는 별도 증거로 남긴다. 이 로컬 검사로 설치 파일 발행이나 공정 검증을 주장하지 않는다.

증거는 `docs/evidence/course-site-unified-20261112/`의 인벤토리·보존·HTTP 기록에 있다. 이후 native release로 운영 파일이 바뀌면 그 배포를 새 기준으로 복원해 동일 검사를 다시 수행해야 한다.
