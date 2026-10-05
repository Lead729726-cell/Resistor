# 공정 시퀀스 계산 · 증착 / 식각 / CMP

레지스터 v0.11은 기존 XYZ 공정 검사에 **실행 가능한 3D 형상 계산 엔진**을 연결합니다.
공정 3D → 공정 시퀀스 계산에서 초기 구조, 격자, 재료와 공정 순서를 설정하고
계산합니다. 독립 뷰어와 설계 화면에서 사용할 수 있으며 인터넷 배포는 보류 상태입니다.

## 지원하는 계산

| 공정 | 실행 모델 | 입력과 경계 |
|---|---|---|
| Conformal 증착 | 접근 가능한 gas cell에서 26-neighbor 거리 가중 front 성장 | 막 재료, 속도 µm/s, 시간 s; top gas 경계, 측면/바닥 sealed |
| 방향성 증착 | 3D grid DDA ray의 첫 고체 충돌·가림과 가중 dose | 수직 ray + 입사각의 8개 방위 ray; 명시적 한 번의 국부 diffuse 재방출 |
| Isotropic 식각 | 접근 가능한 gas와 고체의 6-face front 제거 | 재료별 식각 µm/s, 시간; 0 속도 재료의 stop 및 mask 아래 접근/undercut |
| 방향성 식각 | 첫 ray 충돌 고체의 재료별 제거 속도 | 동일 ray 가림, 재료별 선택비와 XY mask |
| Preston CMP | removal rate = k × pressure × velocity | k(m²/N), pressure(Pa), velocity(m/s), 재료별 계수, pad 반경/compliance, stop Z |
| Plane CMP | 격자 기반 이상적 높이 제거 | 기하학적 clipping 모델; 별도 시간/장비 물리 예측으로 해석하지 않음 |

CMP에서 compliance는 이웃 높이 차이에 따른 접촉 가중치입니다. 재료별 local density에
`1 + dishing_factor × (1-density) + erosion_factor × density`를 적용합니다.
이는 사용자가 입력하는 현상론적 항이며 실제 장비의 dishing/erosion calibration이
기본 제공되는 것은 아닙니다. 방향성 ray는 결정론적 제한 각도 표본이며 plasma chemistry,
장거리 multiple scattering, 흡착/탈착 및 반응 수송을 푼 Monte Carlo 모델이 아닙니다.

## 설정과 실행

1. **홀·단차 공정 예제 불러오기** 또는 **Recipe JSON**에서 시작합니다.
2. Grid 원점/µm 간격/XYZ voxel 수와 재료·초기 3D box를 설정합니다. Box는 순서대로
   덮으므로 void box로 실제 3D 홀과 챔버를 정의할 수 있습니다.
3. 증착·식각·CMP를 추가하고 순서를 바꿉니다. 재료·속도·시간·입사각·선택비·CMP
   조건을 설정합니다. 고정된 Foundry 값을 임의로 채우지 않습니다.
4. 실제 로드한 GDS/설계 layer를 선택해 해당 단계의 **XY mask**로 사용할 수 있습니다.
   Hole ring과 DBU→µm 변환, shape ID·revision을 보존합니다. 현재 로드된 scene 범위만
   사용하며 자동 3D 높이/재료/장비 조건을 추정하지 않습니다. Grid와 GDS의 XY 원점은
   사용자가 맞춰야 합니다. Mask는 step-start 최고 높이의 이상적 평면으로 모델링합니다.
5. **공정 순서 계산**으로 실행합니다. 취소와 오류는 기존 완료 결과를 유지합니다.
6. 단계 버튼에서 초기/각 공정의 실제 tetra mesh, 국부 chord 두께, 위험 위치와 폐쇄
   공극을 확인합니다. 증가/제거 체적과 표면 높이 범위도 단계별로 표시합니다.
7. **해상도 비교 h·2h**는 같은 domain에서 두 계산을 실제 실행하고 재료별 체적 차이,
   voxel 분류 차이와 폐쇄 공극 수를 출력합니다. 한 번의 비교를 수렴 PASS로 표시하지
   않습니다. 축별 4 이상 짝수 격자가 필요합니다.

**현재 체적에서 후속 공정 시작**은 기존 tetra mesh의 voxel 중심을 실제 3D 체적에서
찾아 재료를 반입합니다. 원본 mesh/입력 두께/출처를 recipe에 보존합니다. 미제출
영역은 거부하고, ROI 안에 있는 폐쇄 공극이 격자에서 완전히 사라지면 거부합니다.
Grid 중심 resampling과 공정 계산의 계면은 원본 mesh에 대한 근사입니다.
원본 두께 field가 grid 간격보다 작으면 미해결 경고가 발생합니다.

## 수치 및 물리 범위

계산은 categorical cubic voxel의 재료 점유를 시간에 따라 변경합니다. Front dose는
누적하며 한 substep의 최대 dose를 반 voxel 이하로 제한합니다. 완성 voxel로 재료를
전환하므로 수직 변화/두께에는 최소 한 격자 크기의 분해능이 있습니다. Conformal
26-neighbor 성장과 isotropic 6-face 제거에는 격자 방향 오차가 있습니다.

계산 단계의 국부 두께는 **같은 재료의 최소 XYZ 연속 chord 길이**입니다.
이는 실제 계면의 법선 두께, corner minimum 또는 TEM 측정과 동일하다고 주장하지
않습니다. Sub-voxel 막과 결함을 살피려면 격자를 줄이고 명시적인 소자/홀 ROI를
사용해야 합니다. 상단 경계에 고체가 닿거나 dose가 한 voxel보다 작으면 경고합니다.

전체 5,000 voxels / 30,000 tetra cells, 16단계, 전체 2,000 substeps,
단계별 1,800,000 incident rays, 32MiB 입력 상한입니다. 한도를 넘는 계산을
일부만 성공으로 표시하지 않습니다. 모든 단계와 입력 recipe의 SHA-256을 보존합니다.
저장된 history는 점유 형상/순서를 검증하고 기하 요약을 다시 계산합니다. 공정 시간의
물리적 검증 및 원본 대응은 재실행과 실제 측정/reference 비교가 필요합니다.

초기·후속 공정의 체적은 동일 grid에서 보존되며 고체 증가/제거와 void를 기록합니다.
Gas 수송 경계의 top-only 접근성과 공극 검사의 전체 제출 domain 외부 연결성은
서로 다른 정의입니다. 후자는 기존 [공정 3D 검사](process-topography.md)를 사용합니다.

## 시작 표면의 단계별 피복 진단

증착 전 gas에 접근 가능한 고체 voxel의 모든 face를 기준으로 새 막의 축 법선
방향 연속 길이를 계산합니다. 이미 생성된 film cell만 검사해서 미성막 위치를
누락하지 않습니다. 전체 평가면/완성막 voxel 없는 면/최소 축 두께를 단계별로
기록하고, 미해결 위치 선택·XYZ 단면·위험 색상과 **전체 표면 피복 CSV**를 제공합니다.
목록은 첫 200면이며 CSV에는 모두 포함합니다.

완성막 voxel이 없을 때 수치 0은 실제 두께 0이 아닙니다. h보다 얇은 막도 같은
점유값으로 보이므로 0~h 범위가 미해결입니다. 계산한 표면 face의 축 법선과
원래 임의 mesh의 법선도 구분합니다. 박막/미피복 판정에는 ROI 미세화, 수렴 확인과
실제 입력/보정이 필요합니다.

## 보정과 해석 결과

평면 측정값 `(time_s, thickness_nm)`으로 원점을 지나는 최소제곱 속도 fit 및 실제
RMSE를 계산하고 첫 증착에 적용할 수 있습니다. 이것은 **평면 속도 보정**입니다.
홀/단차/측벽/장비별 3D calibration을 완료한 것으로 표시하지 않습니다.

예제 `examples/process/hole-flow.recipe.json`의 초기 구조와 속도·CMP 계수는 교육용
입력입니다. 실제 실행된 결과에서 neck pinch-off/폐쇄 공극, cap shadowing,
선택적 제거 및 CMP 변화가 발생합니다. 예제 숫자를 실측 또는 상용 TCAD 비교 결과로
표시하지 않습니다. `kinematic_prediction=true`, `calibrated_physical_prediction=false`,
`foundry_signoff=false`를 결과/CLI 영수증에 명시합니다.

소자 전하·이동도·도핑·전기/열/탄성 응력의 coupled PDE는 이번 형상 엔진이 계산하지
않습니다. 기존 회로 ngspice 결과와 형상 결과를 구분합니다. 장비별 화학 반응,
diffusion, plasma, 공정 PDK 및 실측 보정이 확보돼야 제조 예측 정확도를 확인할 수
있습니다. 상용 도구/SDK/라이선스가 없는 환경의 연결 코드도 실제 vendor 실행 검증과
구분합니다.

## 저장과 서버용 실행

Recipe JSON, 전 단계 Run JSON, 선택 체적/검토/CSV/PNG 및 **표준 ASCII tetra VTU와
설정 sidecar**를 저장합니다. 선택 단계와 전체 history가 독립 뷰어 bundle에 포함됩니다.
VTU/sidecar는 기존 반입 경로로 다시 읽어 형상·두께·재료·출처를 검토할 수 있습니다.

개발 환경의 실행:

```powershell
npm run process:run -- --recipe examples/process/hole-flow.recipe.json --out .runtime/process-runs --compare
```

빌드된 독립 Node 서버 엔진:

```powershell
node dist/process-engine.mjs --recipe examples/process/hole-flow.recipe.json --out .runtime/process-runs
```

Windows 배포에는 `resources/app/scripts/process-engine.mjs`도 포함됩니다. 각 실행은
새 출력 디렉터리를 생성하고 모든 단계의 JSON/VTU/검토와 입력·출력 hash 영수증을
기록합니다. 파일명은 단계 번호이며 기존 파일을 덮어쓰지 않습니다. 파일을 자동으로
외부에 업로드하지 않습니다. 설치된 Node 또는 패키지의 Electron Node runtime에서
실행할 수 있습니다. Linux 로컬 서버 image에도 동일 Node 엔진을 포함합니다.

수치 회귀: `npm run test:process-recipe`. UI 회귀:
`npx playwright test tests/ui/process-recipe.spec.ts`. 현재 검증은 rate law/기하 경계,
실제 UI/패키지/로컬 Linux 실행이며 측정 wafer와의 predictive calibration이 아닙니다.

공식 참고: [TU Wien의 surface evolution 연구](https://www.iue.tuwien.ac.at/phd/klemenschits/)
및 [ViennaPS](https://www.iue.tuwien.ac.at/viennacl0)는 geometric evolution과 물리 수송
모델의 역할을 설명합니다. 이번 엔진은 Register의 TypeScript voxel kernel입니다.
[Synopsys Sentaurus Process](https://www.synopsys.com/manufacturing/tcad/process-simulation/sentaurus-process.html)는
장비 데이터로 보정된 물리 공정 모델을 설명합니다. [VTK XML 형식](https://docs.vtk.org/en/v9.5.2/design_documents/VTKFileFormats.html)은
상호 교환 형식의 기준입니다.
