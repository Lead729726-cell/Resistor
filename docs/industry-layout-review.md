# Resistor Indust — 설계 의도와 검증 근거

첫 제품 범위는 **기존 레이아웃을 유지하며 제약·변경·실제 검증 기록을 검토하는 로컬 작업 공간**입니다. 전체 EDA 대체, 범용 아날로그 자동 배치, 독자 P&R, 표준 셀 생성, 시장 우위는 이 제품의 검증된 성과로 주장하지 않습니다.

## 실행과 사용

```sh
npm ci
npm run native:prepare
npm run dev:indust
```

`http://127.0.0.1:5176/eda` → **설계 도구 → 설계 의도 · 변경 검토**.

1. 현재 프로젝트에서 **검토 사본 만들기**, GDS/OASIS 가져오기, 또는 **공개 도형 예제로 시작**을 선택합니다. 원래 프로젝트와 업로드 파일을 수정하지 않으며 별도 프로젝트 r1을 기준으로 고정합니다. 단일 top cell 파일이 최초 GUI 지원 범위입니다. 여러 top cell은 기존 worker import API의 명시적 `top_cell` 선택을 사용합니다.
2. 후보 화면 또는 ID/레이어/넷 검색으로 실제 도형을 고릅니다. 선택 목록에 대칭·간격·상대 위치의 두 도형을 추가하거나 고정 영역을 지정합니다.
3. 근거·작성자·우선순위·기준을 저장합니다. 좌표·간격은 **해당 파일의 정수 DBU**이며 DBU µm 값을 함께 표시합니다. 대칭축 좌표의 절반 DBU도 `axis_twice_dbu`로 정확하게 표현합니다. JSON 예시:

```json
{"axis":"x","axis_twice_dbu":"0"}
{"minimum_dbu":"2000"}
{"box":["-2500","-500","2500","1500"],"layers":["68/20"]}
{"direction":"left"}
```

4. **현재 후보 검사 · 비교**로 실제 기하 판정을 확인합니다. 제약 선택 시 관련 도형·좌표·레이어·메모·매핑·평가 수치를 봅니다. 제약을 수정/제거하면 이전 정의를 이력에 남기고 다시 평가합니다.
5. **후보 레이아웃 편집**에서 기존 사각형/폴리곤/배선 도구로 변경합니다. 원본은 보존하고 기존 revision 기반 undo/redo를 사용합니다. 다시 검토를 열면 과거 평가를 STALE로 표시합니다. 고정 영역 검사에는 기존 도형뿐 아니라 새로 추가된 마스크도 포함됩니다.
6. 실제 DRC/LVS/PEX/시뮬레이션은 기존 엔진 흐름에서 실행한 뒤 검토를 다시 실행합니다. KLayout 제약 검사와 물리 검증 상태를 합치지 않습니다. Windows 공개 번들에는 KLayout/ngspice/SKY130이 있고 Magic/Netgen이 준비되지 않았다면 UNAVAILABLE/NOT RUN을 유지합니다. 가져온 GDS는 별도 PDK·참조 넷리스트·룰·모델 설정 없이 회로라고 확정하지 않습니다.
7. 결정 근거와 작성자로 보고서를 로컬 저장하고 JSON을 내려받습니다. 저장 목록 또는 JSON 다시 열기로 checksum을 검증하고 같은 근거를 읽습니다. 필수 위반·미평가가 남아 있으면 `accepted_for_review_scope`를 거절합니다. 과거 보고서는 원문을 보존하고 현재 후보와 다르면 STALE로 표시합니다.

## 정확한 범위

| 항목 | 현재 구현 | 판정 한계 |
| --- | --- | --- |
| 대칭 | 두 선택 마스크를 정확히 반사하고 KLayout Region XOR | 같은 layer/datatype이어야 함. 전기적 매칭 보장 아님 |
| 간격 | 교차·겹침·접촉·홀을 포함한 최소 폴리곤 간 거리 | 정수/유리수 제곱 거리로 판정; µm 소수값은 표시용 근삿값 |
| 고정 영역 | 기준/후보의 명시적 레이어 마스크를 영역으로 자르고 XOR | 자동 수정 도구 아님. 사용자의 직접 편집을 검사 |
| 상대 위치 | 두 실제 도형 경계 상자의 위/아래/좌/우 순서 | 회로/소자 배치 의도 전체 평가 아님 |
| 방향·매칭·더미·배선 길이·차폐·well/body | 근거·필요 데이터·대상·기준을 기록 | 1차 자동 평가 미구현. 데이터 필요/NOT RUN |
| 변경 비교 | 전체 펼친 마스크, 레이어별 추가·삭제 면적, 도형 ID 매핑, 계층·문자 별도 비교 | 파일 byte 차이만으로 기하 변경 판정하지 않음. 전기적 영향 NOT RUN |
| 결과 연결 | 정확한 revision의 native run, 상태·최신성·manifest hash·입력 조건·모델·룰·로그·산출물 | 부분 검증을 전체 PASS나 제조 signoff로 표시하지 않음 |

KLayout의 기존 GDSII/OASIS 입출력을 사용하며 원본 hierarchy, 배열 벡터, 회전·반사·magnification, layer/datatype, DBU를 복사 시 유지합니다. 기존 내보내기의 기하·계층 roundtrip 결과를 보존합니다. 검토는 펼친 마스크 **20,000 도형 / 200,000 꼭짓점**까지 전 영역을 검사하며 초과 시 실패합니다. 선택 도형 거리 검사도 최대 200,000 edge pair를 넘으면 오류로 표시합니다. 미지원 원소나 모호한 ID를 PASS로 처리하지 않습니다.

안정적인 ID가 유지되면 이동/변경된 도형을 명시적으로 표시합니다. ID가 바뀌면 고유한 정확한 레이어+기하 일치에 한해 연결하고, 삭제·다중 일치·이동 후 ID 소실은 유보합니다. 가까운 도형으로 주석을 자동 이동하지 않습니다. 누락된 제약 기준은 "Evaluation criteria required"로 남습니다.

## 저장·식별·호환

기존 SQLite에 `layout_reviews`, `layout_review_reports` 테이블을 추가합니다. 기존 프로젝트·실행·history를 초기화하지 않습니다. 보고서 파일은 프로젝트의 `reviews/*.review.json`에 저장합니다. 작업 사본의 design revision과 검토 문서의 `review_revision`은 별개입니다. 쓰기는 두 revision과 command receipt를 검사합니다. 보고서의 원본·후보·제약 정의·실행 입력·판정·결정은 고정됩니다. 런타임 재시작 후에도 다시 읽습니다.

제품 이름은 **Resistor Indust**, 내부 ID `resistor.indust`, edition `indust`, branch `codex/resistor-indust`입니다. 과거 Industry 이름과 `레지스터` 데이터 폴더는 마이그레이션 호환성을 유지합니다. 공통 코드가 main에 있고, Edu의 기본 설정·데이터는 별도입니다. 프로젝트 응답과 검토 문맥은 schema_version, edition, project_id, revision, process, engine 식별 정보를 포함합니다. 기존 API 필드를 제거하지 않습니다.

MCP `resistor-indust`에 `resistor_indust_review_*` 도구를 추가합니다. mutation 입력은 `edition: indust`, 정확한 두 revision과 command_id를 요구합니다. Edu MCP에는 이 제품 도구를 노출하지 않습니다. 산업용 검토의 서버도 Edu 워크스페이스를 거절합니다. 외부 모델 호출·파일 전송을 하지 않습니다. 기존 AI 보조의 별도 사용자 승인·전송 범위·예산 gate를 변경하지 않습니다.

빌드는 `dist-indust`와 `dist-edu`에 따로 생성합니다. 기존 공통 설치 파일 v0.27.0을 새 기능 설치 파일이라고 표시하지 않습니다. 기존 업데이트의 package 식별자가 `Resistor`로만 고정되어 새 Indust package를 거절하던 문제는 명시적 `product-edition.json` 확인과 과거 공통 이름 호환으로 수정했습니다. Edu archive는 Indust 업데이트로 수락하지 않습니다.

공통 수정 전달: main과 Indust에는 같은 commit을 전달하고, 진행 중인 Edu 변경을 덮어쓰지 않습니다. Edu에 전달할 때 shared commit을 cherry-pick하며 `product-edition.json`과 현재 교육용 변경을 보존합니다. 엔진을 별도 복제하지 않습니다.

## 검증과 경쟁력 가설

```sh
npm run test:industry-review
npm run test:industry-ui
npm run test:core
npm run test:editions
npm run typecheck
npm run build:indust
npm run build:edu
npm run check:docs
```

[정확성·실제 엔진 기록](evidence/industry-review/native-verification.json)에는 실제 KLayout 테스트, 공개 SKY130 인버터 ngspice 실행, 보고서 재열기, 재시작, 변경 후 stale/위반 판정이 포함됩니다. 성공·위반·입력 부족·매핑 오류·DBU·배열/회전/반사/확대·GDS/OASIS·보고서 손상·revision 충돌을 검사합니다. 전체 상용 엔진 환경이 필요한 기존 MCP 종합 검사는 준비된 Magic/Netgen 환경에서 별도 실행해야 합니다.

[화면 검사](evidence/industry-review/ui-verification.json)는 실제 로컬 엔진을 연결해 제약 생성·성공·후보 변경·위반·STALE·보고서 다운로드·재열기·원본 보존·모바일 화면을 확인합니다. 미리보기는 읽기 전용이고 **두 화면 전체 맞춤**으로 크기 변경 후에도 전체를 봅니다. 초기 연결 중에는 검토 메뉴를 비활성화해 새 사본과 초기 프로젝트 로딩의 충돌을 방지합니다. [데스크톱 화면](evidence/industry-review/automated-desktop.png) · [모바일 화면](evidence/industry-review/automated-mobile.png).

공정 profile 이름과 실제 mapping 확인 상태를 구분합니다. 수동 공개 마스크나 bare GDS는 mapping `unconfirmed`로 남기며, 공정 모델·물리 적층을 도형 이름만으로 확인하지 않습니다. 실제 인스턴스 응답은 magnification과 배열의 두 전체 벡터를 추가로 반환하고, 임의 각도의 회전을 반올림하지 않습니다. 기존 dx/dy 필드를 제거하지 않습니다.

현재 공개 공통판에는 이번 미발행 소스 기능이 포함되지 않습니다. 새 이름의 archive를 구형 공통판 updater에 직접 전달하는 이행 경로는 추가 검증이 필요하며, 다음 발행 때 직접 설치를 포함한 이행 안내를 제공해야 합니다. 이번의 installer 수정은 새 updater가 공통/Indust의 식별자를 정확히 확인하는 범위이며, 새 설치 파일 발행이나 구형 앱의 자동 이행 성공을 뜻하지 않습니다.

비교 과제와 기준을 먼저 [측정 계획](evidence/industry-review/comparison-plan.json)에 고정하고 [결과](evidence/industry-review/comparison-results.json)를 기록합니다. 비교 대상에는 **KLayout Python 확장**을 포함합니다. 같은 공개 기하·단위·제약의 14개 사례를 독립적인 Region XOR / separation_check / clip 검사와 비교합니다. 이는 코드 판정 정확도·작은 도형의 evaluator 시간 측정이며 사용자 준비/검토 시간이나 고객 가치를 측정하지 않습니다. 둘 다 KLayout을 사용하므로 속도 개선율·시장 우위를 주장하지 않습니다.

다음 우선순위는 실제 설계자의 검토 과제/허용 기준 확보 → 더 큰 계층·기준 데이터로 매핑·성능 검증 → 설치된 Magic/Netgen 또는 접근 가능한 상용 검증 환경 연결 → net/device 추출과 전기적 제약 평가 → 동일 과제의 작업 시간·누락·추적성 사용자 비교입니다. 비교·매핑의 안정성 확보 전 자동 수정 범위를 확대하지 않습니다.

기술 범위 확인에 사용한 1차 자료: [OpenROAD의 배치·배선·타이밍 흐름](https://github.com/The-OpenROAD-Project/OpenROAD/blob/master/README.md), [ALIGN 제약 문서](https://align-analoglayout.github.io/ALIGN-public/notes/const.html), [KLayout 2.5D](https://www.klayout.de/doc/about/25d_view.html), [XSection](https://klayoutmatthias.github.io/xsection/). 기존 입체 표현만으로 차별화를 주장하지 않습니다. 이 첫 단계의 검토 화면은 정확한 2D 마스크를 사용하고, 공정 정보를 갖춘 기존 공정/3D 화면은 보조 기능으로 유지합니다.
