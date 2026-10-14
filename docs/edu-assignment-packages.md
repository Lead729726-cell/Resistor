# Resistor Edu · 교수자 과제 패키지와 학생 레퍼런스

`edu-coursepack-20261014-v1`은 72개 과제, 40개 레퍼런스, 10개 수업 경로를 제공합니다. **38개 ZIP**은 전체/분야/경로를 각각 교수자와 학생 역할로 묶은 배포 자료입니다. 38개의 서로 다른 회로 엔진을 뜻하지 않습니다. 기존 공통 계산 모듈·회로 IR·KLayout·ngspice·Magic·Netgen을 재사용합니다.

## 자료와 실행

앱의 **교육 실습 → 과제·레퍼런스**에서 검색·영역·수준·수업 경로를 선택합니다. 첫 화면의 연결형 CMOS 실습에서는 **다른 과정**으로 들어갑니다. 기존 8개 과정과 연결형 CMOS 기록은 보존됩니다.

```sh
npm run dev:edu
npm run edu:packages
```

개발 서버 기본 주소는 `http://127.0.0.1:5177/eda`이며 다른 서버가 이미 사용 중이면 `REGISTER_DEV_PORT`로 별도 포트를 지정합니다. 이번 확인용 Edu 서버는 `http://127.0.0.1:5187/eda`, 자료 모음은 `http://127.0.0.1:5187/edu-packages/index.html`입니다.

전체 다운로드:

- [교수자 ZIP](../public/edu-packages/Resistor-Edu-instructor-all.zip)
- [학생 ZIP](../public/edu-packages/Resistor-Edu-student-all.zip)
- [자료 목록·SHA-256](../public/edu-packages/catalog.json)

ZIP을 풀면 `README.md`, 과제별 Markdown, 레퍼런스별 Markdown, 추상 기하 SVG/좌표 JSON 4종, `catalog.json`, `manifest.json`, 외부 원본 링크, 빈 제출 JSON와 평가 CSV 양식을 읽을 수 있습니다. 교수자 ZIP에만 해설·공통 수식 기준값·standalone fixture 기준값이 들어갑니다. 학생용 설명에도 목표·입력 조건·관찰 질문·평가 기준은 공개합니다. 이 자료는 공개 학습용이며 시험 보안/LMS 권한 시스템이 아닙니다.

기본 회로의 `.cir` 파일 8개는 외부 PDK 없이 실제 ngspice로 실행할 수 있습니다.

```sh
ngspice -b fixtures/divider.cir
ngspice -b fixtures/rc-discharge.cir
```

RC 방전의 UIC deck은 standalone 과제입니다. 앱의 flat OP 소자에 존재하지 않는 transient 자극/초기조건 기능을 주장하지 않습니다. 앱의 RC 충전/AC 과제는 기존 `rc_lowpass` template와 명시적 조건을 씁니다.

## 과제 구성

| 영역 | 과제 수 | 대표 내용 |
|---|---:|---|
| 기초 계산 | 18 | 색띠, E-series, 저항망, LED, 전력, RC/RL/RLC, ADC/DAC, op-amp, dB, SI |
| 기초 회로 | 8 | 분배기/부하, 직렬·병렬, 테브난, RC 충전·방전·AC |
| MOS·바이어스 | 7 | I–V, 공통 소스, 바이어스, 전류 미러, 차동 쌍, 캐스코드, 연결형 CMOS |
| 디지털·계층 | 8 | 기존 NAND/NOR/XOR/MUX, 전가산기, 4bit carry, 표준 셀/P&R 역할 |
| 아날로그·전원 | 8 | OTA/Miller/PGA, 2차 필터, TIA, 비교기, LDO, SC DC-DC |
| 데이터 변환 | 7 | ΣΔ 적분기/modulator/CIC/FFT, SAR switch/CDAC/bit trial |
| 레이아웃·공정 | 10 | DBU, 직접 그리기, 회전·미러, 대칭, centroid, dummy, 배선, 면적, 적층, topography |
| 검증·재현 | 6 | DRC, LVS, PEX/post, PVT, freshness, 미설치/불합격/오류 구분 |

수업 경로는 첫 실습 4회, 회로 이론 8회, MOS 6회, 디지털 8회, AFE 6회, 전원/응답 4회, 데이터 변환 9회, 레이아웃 10회, 검증 6회, 한 학기 15회입니다. 여러 경로에서 같은 과제를 재사용합니다. 교수자는 검색 결과나 체크한 과제만 선택하고 수업 이름을 바꿔 맞춤 ZIP을 받습니다.

## 학생 기록과 증거

- 학생은 예측·사전/사후 문항·결과 해석·한계를 직접 작성합니다. 자동 학생 답안·자동 점수는 생성하지 않습니다.
- 계산 과제의 **현재 계산 입력·결과 기록**은 공통 수식의 실제 입력/결과를 최대 16개 보존합니다. 가져온 결과는 같은 공통 수식으로 다시 확인합니다. 물리 엔진 검증이 아닙니다.
- **현재 프로젝트·결과 연결**은 학생이 명시적으로 선택한 프로젝트/데이터 revision, testbench, 실제 도구 버전, 공정 ID/version, 각 run의 ID/revision/상태를 저장합니다. 과거 run 상태를 현재 PASS로 재인증하지 않습니다.
- 학생 기록은 `resistor.edu.assignment-records.v1`에 보관하고 이 탭의 임시 입력은 별도 sessionStorage에 보관합니다. 회로/결과 화면에 갔다 돌아와도 임시 설명을 유지합니다. 수정 후에는 저장을 다시 눌러 확정합니다.
- JSON 가져오기는 Edu/schema/catalog 형식과 길이를 확인합니다. 같은 ID를 자동 덮어쓰지 않으며 다른 창의 동일 기록 변경, 잘못된 기존 저장 형식도 보존하고 저장을 차단합니다. **학생 첨부 run snapshot은 신뢰된 실시간 엔진 응답이 아닙니다.**
- `purpose=qa` 선택은 기능 QA를 학생 제출과 구분합니다. 빈 package 양식은 `artifact_kind=blank_student_template`, 실제 앱 저장은 `student_authored_record`입니다. 빈 양식의 임의 편집본을 앱 저장 기록처럼 인증하지 않습니다.
- 형식 v1에서 계산 snapshot이 없던 기록은 빈 배열로 명시적으로 읽습니다. 기존 연결형 CMOS schema와 학습 체크 key는 변경하지 않습니다. 교수자 점수는 항상 `null`, 효과는 `education_effect_proven=false`입니다.

CSV는 교수자가 완료 선언·사전/사후 설명·시간·설명 정확도·점수를 수동 기록할 양식입니다. 경과 시간은 집중 학습 시간이 아니며 교육 효과는 사용자 평가 전 미입증입니다. 교수자 인증, 다중 학생 LMS, cloud 제출/채점, 성적 동기화는 제공하지 않습니다.

## 정확성·라이선스·범위

ADC 공통 계산기는 endpoint `Vref/(2^N−1)` 정의를 유지합니다. SAR 레퍼런스의 bin 폭 `Vref/2^N`과 혼합하지 않습니다. 8bit CODE와 실측 ENOB도 구분합니다. 공통 수식·단위·정밀도·파일 형식·엔진 API를 복제하거나 변경하지 않았습니다.

기하 대칭/centroid를 mismatch 수율로, GDS extrusion을 실제 적층/공정 simulation으로, reference routing을 산업용 P&R closure로 표현하지 않습니다. 원본 device/net 정보가 없으면 대응 불명/후보입니다. P&R은 배치와 배선을 포함하며 timing 등 추가 최적화가 있을 수 있습니다. 제조 승인·full PVT/noise/MC/EMIR/ESD·전체 ADC controller mask/timing은 이 모음의 완료 범위가 아닙니다.

직접 작성한 과제/가이드/fixture 코드는 저장소 MIT 라이선스입니다. 외부 문서 내용·PDK·모델·도구 binary·private 자료·키·사용자 프로젝트는 ZIP에 넣지 않았습니다. 각 외부 원본 링크의 라이선스·모델·룰 제공 범위를 별도로 확인합니다. `sources.json`에 출처와 적용 범위를 넣었습니다.

## 검증과 소스 구조

```sh
npm run test:education
npm run test:core
npm run test:edu:packages:native
npm run typecheck
npm run build
npm run check:docs
```

실제 엔진 확인은 [native.json](evidence/edu-packages/native.json)에 남겼습니다. 8개 이상 회로 deck의 알려진 수치, 실제 카탈로그의 template/parameter 연결, 37개 서로 다른 시작 설계, 대표 13회 해석, 분배기 변경 전후 0.9V→0.6V, revision 충돌 거부·과거 run 보존·기록 roundtrip을 확인했습니다. 생성만 한 다른 시작 설계의 시뮬레이션 완료를 주장하지 않습니다. 기존 물리 검사 실행 증거는 [공통 도구 검증](physical-tools.md)에 있으며 이 모음의 새 학생 프로젝트에 복사된 PASS가 아닙니다.

브라우저 확인은 [ui.json](evidence/edu-packages/ui.json)에 분리합니다. 데스크톱/390px 모바일 화면, 과제 검색·맞춤 ZIP, 실제 OP와 설명 저장/재열기, 공통 계산 전후 snapshot을 확인했습니다. 모든 72개 과제를 학생이 수행했다거나 교육 효과를 검증했다는 의미가 아닙니다.

MCP에서도 `register_edu_assignments`와 `register_edu_references`로 과제/버전/출처를 읽습니다. Edu에만 제공하며 실행·학생 답안·자동 점수를 생성하지 않습니다.

주요 파일:

- `packages/education/src/assignment-catalog.ts`: 원본 과제·레퍼런스·수업 경로
- `circuit-fixtures.ts`: 공개 이상 회로 입력과 알려진 값
- `course-package.ts`: 교수자/학생 자료 경계와 순수 export
- `assignment-record.ts`: 원본 학생 기록·증거·schema validation
- `packages/ui/src/assignment-launch.ts`: 기존 native API의 얇은 caller
- `AssignmentLibrary.tsx`: 검색·실제 사본·계산·기록·내보내기
- `scripts/education-packages.ts`: 고정 ZIP timestamp, 재현 가능한 공개 자료 생성
- `scripts/education-packages-qa.ts`: QA만 생성하는 실제 ngspice/worker 검증

빌드 때 자료를 다시 만들고 테스트가 ZIP 내용·SHA-256·원본 카탈로그 일치를 확인합니다. 새 과제는 원본 카탈로그와 해당 source/model 범위부터 추가합니다. Edu 흐름 수정은 Edu 브랜치에 두고, 수식·기하·파일·실행 엔진 변경은 기존 공통 브랜치 전달 방식으로 공유합니다. 이 작업은 새 Edu 설치 파일 발행이나 공개 다운로드 사이트의 배포를 의미하지 않습니다.
