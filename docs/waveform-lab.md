# EDA 파형 측정 도구

`/eda` → 시뮬레이션 → 저장된 실행 결과 → **Waveform lab**에서 사용합니다.
엔진이 반환했거나 파일에서 가져온 파형만 측정합니다. 새 시뮬레이션 결과를 생성하거나
원본 회로를 수정하지 않습니다.

## 사용 방법

1. 측정 신호를 선택하고 A/B의 X축 좌표를 입력합니다. 입력 단위는 s, V, Hz 등 원본 축입니다.
2. 차트 클릭 대상을 A 또는 B로 선택한 뒤 차트에서 위치를 찍을 수도 있습니다.
3. A–B 확대를 선택하면 해당 구간의 차트와 Y축 범위를 확인할 수 있습니다.
4. A/B 값, ΔY, ΔX, Min/Max, Peak-to-peak, Mean, RMS, Integral을 검토합니다.
5. 시간 파형은 Low/High, 입력·출력 기준과 edge를 지정해 전이와 지연을 측정합니다.
6. 연산에서 같은 축의 신호를 더하거나 빼고, V×A로 전력, V/A로 저항을 구합니다.
7. 측정 JSON 또는 구간 CSV를 저장합니다. 연산이 켜져 있으면 CSV는 연산 파형입니다.

연산에는 두 신호가 모두 있는 구간을 지정해야 합니다. 덧셈·뺄셈의 Y 단위와 모든 연산의
X 단위가 일치해야 합니다. 분모가 0이거나 표본 사이에서 0을 통과하면 나눗셈을 차단합니다.

## 공식 및 측정 정의

인접 표본 `(x₀,y₀)`, `(x₁,y₁)` 사이를 선형 보간합니다. 구간 끝점은 보간한 뒤 포함합니다.
각 구간의 `Δx=x₁−x₀`에 대해:

- 적분: `Σ Δx·(y₀+y₁)/2`
- Mean: 적분을 전체 X 구간 길이로 나눕니다.
- RMS: `sqrt(Σ Δx·(y₀²+y₀y₁+y₁²)/3 / 전체 X 구간 길이)`
- Rise/Fall: Low/High의 10%→90%, 90%→10% 첫 완전한 교차 쌍.
- 주기: 50% 기준의 첫 두 상승 교차 간격. 주파수는 그 역수.
- 전파 지연: 같은 실행의 첫 입력 기준 교차 이후에 있는 첫 출력 기준 교차까지의 시간.

Mean/RMS는 비균일 표본 간격을 반영합니다. A=B이면 커서 값과 그 절댓값 RMS를 반환하고
적분은 0입니다. A/B 순서가 바뀌면 ΔX/ΔY는 부호가 바뀌며 적분 방향은 항상 작은 X에서
큰 X입니다. 교차가 없으면 null로 기록합니다. 단위 W·s는 J, A·s는 C로 표시합니다.

곱셈·나눗셈은 두 신호의 표본 좌표 합집합에서 연산합니다. 생성한 표본 사이의 곡선과
그 적분은 근사입니다. 전류 방향·부호는 원본 시뮬레이터의 기준을 유지합니다.
소자 전력은 해당 전류의 기준 단자 간 전압차와 곱해야 합니다. 임의의 노드 전압과
다른 소자의 전류를 곱한 값은 단위가 W라도 그 소자의 소비 전력이 아닙니다.
SPICE 전압원의 공급 소비 전력을 검토할 때에는 전압원 전류 부호를 확인하세요.

## 출처와 검증 범위

JSON 및 CSV의 provenance에는 project/run ID, 결과 revision, 현재 revision, freshness,
도구, 실행 상태, 원본 해석 조건, 신호와 단위, 커서, 측정 방법을 기록합니다. 이전 revision의
파형은 `STALE`로 표시하면서 검토·내보내기를 허용합니다. 외부 파일은 외부 파일로 표시합니다.

Pre/post 비교는 동일 project/revision, 완료된 실행, 명시적 서로 다른 pre/post 단계,
같은 도구·profile·해석 조건에 한해 허용합니다. 출처가 불명확하거나 외부 파일로 가져온 결과를
native pre/post 실행 비교로 자동 선택하지 않습니다.

전류가 일반 파형 목록과 별도 `current_flow`에 저장된 결과에서는 같은 run/project/revision의
실제 signed branch를 `I: 이름 [source_vector]`로 선택할 수 있습니다. 전류 branch를 선택하면
차트에도 추가합니다. 모든 branch를 한꺼번에 렌더링하지 않으므로 큰 설계에서도 필요한
branch를 골라 검토할 수 있습니다.

측정은 표본 해석이며 STA/foundry sign-off가 아닙니다. 글리치나 여러 주기가 있으면
구간·기준·edge를 지정해 대상 전이를 확인하세요. 화면의 표본 축소는 bucket별 극값을
보존하고, 측정·내보내기에는 원본 해상도를 사용합니다.

## 개발 검증

```powershell
npm run test:waveform-analysis
npm run test:formulas
python workers/eda/test_toolchain_diagnostics.py
node node_modules/@playwright/test/cli.js test tests/ui/waveform-lab.spec.ts --workers=1 --reporter=list
npm run build
```

브라우저 검사는 로컬 Vite 서버와 실제 EDA worker/ngspice가 실행된 상태에서 수행합니다.
수치 검사는 ramp의 해석적 RMS, 비균일 좌표, 작은 단위, 교차/글리치, 단위 불일치,
구간 밖 커서, 0 분모, 극값 보존, pre/post 조건, CSV escaping을 포함합니다.
진단 캐시 검사는 일시 timeout 뒤 복구, 명시적 새 검사, 성공 캐시 만료, 실제 실행 파일
누락과 version probe 실패를 포함합니다. 진단은 실제 job 실행 검증을 대체하지 않습니다.
