# 전압·전류 흐름과 입력→출력 신호 시험

`/eda` → **시뮬레이션 / Simulation** → 완료된 실행을 선택합니다.
**전압·전류 흐름 / Signal flow**에서 같은 ngspice 실행의 넷 전압, 단자 전류,
양 끝 전압차를 시간에 따라 확인합니다. 기존 결과에 넷 전압이 없다면 다시 해석합니다.

## 흐름 탐색

1. Transient 해석을 실행하고 시간 슬라이더를 움직이거나 **흐름 재생**을 누릅니다.
2. 넷 버튼에서 순간 전압을 확인합니다. 버튼을 선택하면 연결된 전류 branch만 표시합니다.
3. 소자를 선택하면 참조 양 끝의 전압, signed 전류와 전압강하 도식이 표시됩니다.
   실제 device ID가 있는 현재 설계 결과는 Inspector의 소자 선택과 연결됩니다.
4. 흐름 위치는 Waveform lab의 A 커서와 공유합니다. 정확한 시각은 A 입력란에 지정합니다.
5. **현재 흐름 JSON**으로 시각, 넷 전압, branch 값, 참조 방향, 데이터 출처를 저장합니다.

전압강하의 정의는 `ΔV = V(from) − V(to)`입니다. 음의 전류는 화살표 방향을 뒤집지만
이 참조 전압차의 부호는 유지합니다. 전압원 전류는 +단자로 들어가는 방향이 양수입니다.
MOS의 D→S는 drain 단자 전류의 참조입니다. transient의 다른 단자 전류와 변위 전류가
있으므로 drain 전류 전부가 source로만 흐른다고 해석하지 않습니다.

DC는 sweep 전압 위치, OP는 저장된 단일 점에서 확인합니다. 복소 AC phasor를
순간 signed 전류의 화살표로 표시하지 않습니다. 재생은 저장된 해석을 탐색하며
새 시뮬레이션을 실행하지 않습니다.

## 입력→출력 시험

- 입력과 출력의 시간축 전압을 선택합니다.
- 기대 동작을 **반전(NOT)**, **Buffer**, **수동 0/1**, **아날로그 출력 범위**에서 선택합니다.
- 입력 평가 시간을 `2ns, 7ns, 12ns, 17ns`처럼 지정합니다. s/ms/us/µs/ns/ps와 지수 표기를 지원합니다.
- 안정화 지연과 출력 검사 구간 폭을 초(s)로 입력합니다.
- LOW 최대 / HIGH 최소 전압을 회로 전원과 수신기의 허용 기준에 맞게 지정합니다.
  기본값은 실행의 공급 전압에 대한 30% / 70%이며 해당 소자의 보장된 규격을 의미하지 않습니다.
- **저장된 결과로 신호 시험**을 누르면 각 행의 Vin, 기대 논리, Vout min/max와 판정이 나옵니다.
- 행의 시각을 누르면 흐름 위치와 A 커서가 이동합니다. **신호 시험 JSON**에 조건과 결과를 저장합니다.

입력은 평가 시각 `t`에서 판정합니다. 출력은 `[t + 안정화 지연, t + 안정화 지연 + 검사 폭]`
전체를 검사합니다. 출력 최대가 LOW 이하이면 0, 출력 최소가 HIGH 이상이면 1,
그 외는 X입니다. 모호한 입력 X, 전이 또는 저장된 구간의 글리치를 정상 논리로 통과시키지 않습니다.
아날로그 모드는 구간 전체가 지정한 최소·최대 범위 안에 있어야 통과합니다.
시간 범위 밖의 행은 `UNAVAILABLE`이며 전체 PASS가 될 수 없습니다.
조건을 바꾸면 기존 판정이 지워집니다. 설계 revision이나 출처가 STALE이면 새 시험을 차단합니다.

## 직접 실행할 예

**CMOS inverter** 예제를 생성하고 기본 1.8 V Transient를 실행합니다.
입력 A / 출력 Y, 평가 시간 `2ns, 7ns, 12ns, 17ns`, 안정화 `50e-12 s`, 검사 폭 `100e-12 s`
조건에서 반전 시험은 PASS, Buffer 시험은 FAIL입니다. 수동 기대값은 `0, 1, 0, 1`입니다.
입력 A가 높을 때 Y는 낮고, A가 낮아질 때 Y가 높아지는 순간의 전류와 ΔV를 확인합니다.

**통합 설계 → RC 저역통과 필터** 템플릿은 R=10 kΩ, C=1 pF이므로 `τ = RC = 10 ns`입니다.
1.8 V step 이후 한 τ에서 이상적 출력은 `1.8·(1−exp(−1)) ≈ 1.13782 V`입니다.
기본 1 ns 지연과 1 ps 상승을 반영한 `11.0005 ns` 위치에서 R 양 끝 전압차와
`I_R = (V(IN)−V(OUT))/10000`을 실제 표본으로 확인합니다. 출력 검사 폭 1 ns,
허용 범위 1.1~1.3 V는 PASS이고 최대를 1.15 V로 줄이면 FAIL입니다.

## 데이터와 적용 범위

엔진은 원본 netlist 사본의 0 V sense source로 단자 전류를 측정합니다. 해당 branch의
양 끝과 MOS gate/body의 실제 native node 이름을 저장합니다. 계층 port binding과
SPICE global 선언을 반영하며, ground 0은 명시적인 이상적 기준 전압입니다.
전압·전류 표본 수와 X 좌표가 일치하지 않거나 유한하지 않으면 실행이 실패합니다.
raw data와 `voltage-probes.json`은 실행 artifacts에 남습니다.

현재 전류 범위는 최대 64 branches, 전압 범위는 최대 256 unique nodes입니다.
추출된 모든 R/C나 임의 상용 소자의 단자를 자동 지원하는 범위가 아니며 생략된 노드를 기록합니다.
이 도식은 단자 연결과 단자 전류를 표시합니다. 도체 내부 3D 전류밀도·전기장 해석 결과는 별도입니다.

보간은 저장된 표본 사이의 선형 보간입니다. 원본 표본과 구간 끝점을 모두 검사하지만
해석 step보다 짧아 기록되지 않은 펄스까지 검출하지는 않습니다. 필요한 해상도는 testbench에서
설정하고 재해석합니다. 입력 pulse/PWL을 임의로 생성하는 새 자극 편집기가 아니라
기존 testbench의 실제 입력과 그 출력 응답을 검사하는 도구입니다.

결과 저장이나 artifact hash 읽기가 실패하면 작업을 FAILED/UNKNOWN으로 처리하고
원래 실패 원인을 유지합니다. manifest는 임시 파일이 완전히 저장된 뒤 교체합니다.
DB 자체를 쓸 수 없는 storage 장애에서는 영구 상태 저장도 복구가 필요합니다.
worker 재시작 복구는 실행 상태 인덱스로 미완료 작업을 조회합니다. 완료된 대형 파형 이력
전체를 Python 객체로 다시 로드하지 않습니다. 기존 데이터베이스는 첫 적용 시 인덱스를 생성합니다.

[ngspice 공식 문서](https://ngspice.sourceforge.io/docs.html)의 node voltage, 독립 전압원 전류,
Save/wrdata convention에 맞춰 native probe를 사용합니다. 이 환경의 실행 버전은 45.2입니다.

## 검증

```powershell
npm run test:signal-flow
npm run test:waveform-analysis
python workers/eda/test_job_evidence.py
docker exec mos-studio-eda /bin/bash -lc 'python3 /workspace/workers/eda/test_voltage_probes.py'
docker exec mos-studio-eda /bin/bash -lc 'python3 /workspace/workers/eda/test_job_lifecycle.py'
docker exec mos-studio-eda /bin/bash -lc 'python3 /workspace/workers/eda/test_current_flow.py'
node node_modules/@playwright/test/cli.js test tests/ui/signal-flow.spec.ts --workers=1 --reporter=list
npm run build
```

브라우저 검사는 로컬 web 서버와 실제 worker가 필요합니다. 알려진 값·SI 단위·비균일 시간축,
손상 데이터·다른 실행 출처·음의 전류·전압강하·구간 글리치·out-of-range·STALE 및
디지털/아날로그 기대값을 검사합니다. 증거와 녹화는 `docs/evidence/eda-signal-flow-*`에 저장합니다.
