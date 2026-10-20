# Resistor Indust · SAR12 수렴 수정과 배선 후 해석

실제 RC 추출 회로에서 낮은 입력·중앙·높은 입력의 세 변환을 완료했습니다. 36회 MOS 비교기 판단, 매 변환의 실제 정지 시각 26개, RTL·합성 게이트·편집 CMOS 제어기의 재생 일치를 검사했습니다. **세 입력의 smoke 검사이며, 전체 범위 정확도나 배선 후 ENOB·제조 승인 결과는 아닙니다.**

[회로·실행 기록](../examples/sar12-lab/qualification.json) · [동일 추출 회로의 대조 실험](../examples/sar12-lab/convergence/comparison.json) · [회로와 마스크 사용법](sar12.md)

## 실제 배선 후 결과

조건은 공개 SKY130 TT, 1.8 V, 27°C, VREF 1.2 V, 입력 common mode 0.9 V입니다. 각 실행은 독립적으로 시작하며, 한 변환 안에서는 transient를 재시작하지 않습니다.

| 차동 입력 V | 기준 코드 | 실제 코드 | 오차 LSB | 원본 실행 |
|---|---:|---:|---:|---|
| -1.16220703125 | 64 | 65 | +1 | [9f7f0dd5](../examples/sar12-lab/runs/9f7f0dd5c8c74fa08bcf3317e6eebe59/result.json) |
| 0.00029296875 | 2048 | 2047 | -1 | [594bb26d](../examples/sar12-lab/runs/594bb26dadbc4cfa888cf32a36f18d15/result.json) |
| 1.16220703125 | 4031 | 4031 | 0 | [ca3f51db](../examples/sar12-lab/runs/ca3f51dbaac34d999e7156cee495d2fd/result.json) |

모호한 판단은 세 실행 모두 0개입니다. 원본 표본은 각각 13,610 / 13,268 / 13,198개입니다. 코드는 입력식에서 생성하지 않고 실제 COMP/COMPN 전압의 12회 판단으로 만듭니다. 획득 4µs, hold 50ns, bit당 0.5µs이며, 변환 완료는 10.05µs입니다.

![실제 배선 후 파형과 전원 강하](../examples/sar12-lab/post-layout-waveforms.png)

## 원인과 수정

기존 회로는 정지된 transient의 DC 전압원을 즉시 `alter`한 뒤 `resume`했습니다. 추출된 분산 RC 회로에서는 이 불연속 구동 시점에 적분 시간 간격이 1.25×10⁻²⁰초까지 줄어들며 해석이 중단됐습니다.

동일한 추출 netlist와 허용 오차로 대조했습니다. 기존 설정의 4.55µs 실패를 재현했고, 외부 전원 구동 저항 0.1Ω만 추가하면 중앙 입력은 완료됐습니다. 그러나 낮은 입력은 4.05µs, 높은 입력은 6.05µs에서 다시 실패했습니다. 고립된 타이밍 신호만 제거한 대조도 8.375µs에서 실패했습니다. 이 중간 결과들은 로그와 함께 보존합니다.

최종 구동은 이전 전압을 유지한 뒤, 실제 정지 시각에서 1ns 후 시작해 2ns 동안 변하는 연속 PWL입니다. VINP/VINN, SAMPLE/EVAL, B0..B11에 동일하게 적용합니다. 다음 trial은 실제 비교기 출력으로 결정합니다. 전하·적분 이력을 초기화하거나 이상적 ADC로 바꾸지 않습니다. Pre/post 모두 정확한 정지점을 해석 시작 전에 선언하며 중복 타이밍 신호는 제거했습니다.

긴 배선 전 회귀에서는 동적으로 추가한 `time ge` 정지가 47번째 입력의 요청 시각보다 약 10ns 늦은 표본을 반환하는 경우도 발견했습니다. 엄격한 시각 검사가 이를 실패로 처리했으며, 시각 허용 오차를 늘리지 않고 두 해석의 정지 방식을 정확한 equality breakpoint로 통일했습니다.

PWL vector 갱신 방식은 [ngspice 공식 개발자 설명](https://sourceforge.net/p/ngspice/mailman/message/32158826/)과 [공식 매뉴얼](https://ngspice.sourceforge.io/docs/ngspice-manual.pdf)을 확인했습니다. 최종 해법은 ngspice 42의 **SPARSE 1.3**입니다. 같은 RC netlist에서 KLU 기본 설정, 반복 제한 증가, 피벗 설정 변경은 중단됐고 SPARSE는 12회 판단을 완료했습니다. 추출을 다시 한 경우에도 동일한 해법을 명시하도록 했습니다.

추출된 MOS·저항·커패시터와 `reltol=1e-5`, `vntol=1e-6`, `abstol=1e-12`, `chgtol=1e-16`은 유지했습니다. 임의의 기생 C나 누설 저항을 DUT에 삽입하지 않았습니다. solver 대조의 원본 로그·옵션·netlist 해시는 [동일 추출 회로의 대조 실험](../examples/sar12-lab/convergence/comparison.json)에 보존합니다.

## 외부 구동 가정과 전원 파형

- 전원: 이상적 1.8 V 원천 + **외부 구동 저항 0.1Ω**. 추출된 온칩 전원 배선 저항과 구분합니다.
- 입력: 각 단자 50Ω. 제어 bridge: 각 2kΩ + 2pF.
- VREF: 2Ω + 1nF. VCM: 10Ω + 100pF. 실제 reference generator 검증은 포함하지 않습니다.
- 동일 조건을 pre/post에 적용하며 manifest의 `sar12_external_control`에 기록합니다.

실제 코어 전압 `VPWR`를 원본 파형과 앱에 추가했습니다. 세 실행의 최저 코어 전압은 각각 1.799942301 / 1.799942857 / 1.799944825 V입니다. 이번 조건에서 가장 큰 원천 대비 강하는 약 **57.70µV**입니다. 패키지·PCB·전체 칩의 EM/IR 승인을 뜻하지 않습니다.

VDD/VREF 원천 에너지는 모든 원본 adaptive-step 표본을 적분하며 외부 직렬 저항의 손실도 포함합니다. VIN/VCM·제어 구동과 전체 디지털 제어기 전력은 포함하지 않습니다.

## 앱과 재실행

최신 Resistor Indust 엔진으로 프로젝트를 열고 현재 revision에서 PEX를 실행한 뒤 Post-layout을 선택합니다. 결과 선택 메뉴의 **Post-layout**은 해당 실행의 실제 `analysis_stage`를 사용합니다. 과거 실패는 STALE/실패로 유지하며, 아직 실행 중인 해석에 PASS를 표시하지 않습니다.

`Simulation`에서 `VPWR`, `supply_current`, `reference_current`, `TOPP/TOPN`, `COMP/COMPN`, bit 신호와 CODE를 선택할 수 있습니다. 단일 변환의 CODE는 실제 표본 1개로 표시합니다. 원본 파형·판단 CSV·정지 시각·추출 netlist·로그는 실행별 폴더에 보존합니다.

**Compare pre / post**를 켠 뒤 **차동 노드**를 누르면 두 실행의 TOPP/TOPN 네 신호만 표시합니다. **출력 코드**는 실제 코드 표본만, **전류 신호**는 원천 전류만 선택합니다. 원본 데이터와 계산 결과는 바꾸지 않습니다.

```powershell
npm run test:sar12

# 새 물리 프로젝트에서 한 실제 입력의 배선 후 변환
node scripts/sar12-lab.mjs --physical --post --mode=4 --input=-1.16220703125
node scripts/sar12-lab.mjs --physical --post --mode=4 --input=0.00029296875
node scripts/sar12-lab.mjs --physical --post --mode=4 --input=1.16220703125

# 기존 프로젝트는 입력을 몰래 바꾸지 않고 저장된 조건으로 재실행
node scripts/sar12-lab.mjs --reuse=PROJECT_ID --post
```

저장된 실패 mesh의 solver 차이는 `python scripts/sar12-solver-repro.py --pdk /path/to/sky130A --solver sparse`로 재현할 수 있습니다. `--solver klu`는 원래 조건을 사용합니다. 원본 netlist·testbench와 821개 모델의 해시를 먼저 검사하며 새 DUT를 추출하지 않습니다. `--dry-run`은 파일 검사만 하고 실행을 `not-run`으로 남깁니다. 이 재현 스크립트의 dry-run을 확인했으며, 실제 solver 비교 수치는 위에 보존한 독립 native 실행에서 얻었습니다.

3개 독립 변환의 통과는 전체 입력 sweep나 연속 파형의 동적 성능 검증과 다릅니다. 배선 후 SNDR/SFDR/ENOB, INL/DNL, 잡음·편차·지터, 전체 PVT/RC corner, 결합 추출 완전성, 전압 stress, 전체 제어기의 마스크·타이밍과 제조 signoff는 별도입니다. `post_layout_smoke_passed`와 `post_layout_qualified`도 분리해 기록합니다.
