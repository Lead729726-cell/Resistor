# Resistor Indust · 영역 제한 12-bit SAR ADC

12비트 출력의 차동 6+6 split-CDAC 연구용 레퍼런스입니다. 편집 가능한 전체 계층·12개 하위 블록, 합성 제어기와 실제 SKY130 아날로그 마스크를 제공합니다. **아날로그 코어**를 기존 1,000 × 1,000 µm, 가장자리 10 µm 조건 안에 배치했습니다. 제어기 전체의 물리 배치, pad/ESD와 제조용 완성 칩은 아직 포함하지 않습니다.

**배선 후 검증은 미달입니다.** 최종 RC 추출 회로의 실제 재실행은 4.55µs 부근 VDD 노드의 timestep/convergence 오류로 중단됐습니다. 배선 전 14개 지향 입력·64점 coherent 검사, DRC 0·LVS 일치·PEX 생성은 이 한계를 대체하지 않습니다. 원본 실패 결과와 로그를 함께 제공합니다.

[회로·파일 모음](../examples/sar12-lab/README.md) · [실행별 근거](../examples/sar12-lab/qualification.json) · [실제 마스크](../examples/sar12-lab/layout-and-matching.png)

## 참고한 논문과 적용 범위

Kentaro Yoshioka, [The Era of Vibe Tapeout: Dark Age or Golden Age for Analog Circuit Design?](https://arxiv.org/abs/2610.15240), arXiv:2610.15240v1, 2026-10-11. 원문의 HTML 전체에서 명세, CDAC 배선 결합, 비교기 비대칭과 PEX 검증 문제를 확인했습니다.

논문의 주요 benchmark는 **11-bit**입니다. 여기의 12-bit 회로는 새로 만든 레퍼런스이며 논문 회로나 성능의 재현이라고 주장하지 않습니다. 원문의 5.12 MS/s·256점 FFT와 이번 기본 99.50 kS/s·64점 검사는 서로 다른 조건입니다.

반영한 관점은 실제 비교기 판단과 원본 데이터의 독립 검사, bit별 동일 unit 배치, 비교기의 양쪽 출력 검사, 신호 사이 결합 C의 보존 여부 점검입니다. **같은 중심에 배치했다는 사실만으로 전기적 매칭이 입증되지는 않습니다.** R+C 추출에 결합 C가 보이더라도 별도 C-only 추출과 대조하기 전까지 완전한 결합 추출로 판정하지 않습니다.

## 명세와 계산

| 항목 | 기본값 / 범위 |
|---|---|
| 공정 / 공급 | 공개 SKY130A / 1.8 V |
| 출력 | unsigned 12-bit CODE[11:0], VALID |
| 차동 입력 | −1.2 .. +1.2 V, VINP/VINN common mode 0.9 V |
| 차동 1 LSB | 2 × 1.2 / 4096 = **585.9375 µV** |
| CDAC | 차동 6+6, 508개 nominal 200 fF unit + bridge 2개 |
| 비교기 | 자체 바이어스, 저항 부하 전치 증폭 2단 + 동적 래치 + 출력 복원 |
| 기본 변환 | 획득 4 µs + 비중첩 hold 50 ns + 12 × 0.5 µs |
| 제어 bridge 기준 속도 | 1 / 10.05 µs = **99.5025 kS/s** |
| 코어 실제 bbox | **841.205 × 718.720 µm**, 604,590.858 µm² |
| envelope | 1,000 × 1,000 µm; edge 10 µm; 배선·계층까지 검사 |

한쪽 fine bank는 128 Cu, coarse bank는 126 Cu입니다. Bridge는 `Cb = 2 Cu × 64/63`이고, fine bank와 직렬인 등가는 `Cb × 128 Cu / (Cb + 128 Cu) = 2 Cu`입니다. 따라서 coarse 쪽 총 등가는 128 Cu, fine 감쇠는 1/64이며 12개 bit 가중치는 `2^i/4096`입니다. 실제 마스크는 공정 모델의 MIM 치수로 변환되므로 이상적 C 값과 완전히 같다고 취급하지 않습니다.

코드 기준식은 `floor((VIN_diff / VREF + 1) × 2048)`를 0..4095에 제한합니다. 이 식은 **검사 oracle에만** 사용합니다. 실제 결과는 ngspice가 계산한 전하와 COMP 전압에서 12회 판단하며 입력 전압을 이상적 양자화기로 대체하지 않습니다.

## 앱에서 열고 수정하기

최신 소스를 실행한 Resistor Indust에서 **설계 도구 → 통합 설계 → 회로·연결 탐색 → 회로 template 지원 범위 읽기 → 12bit SAR ADC**를 엽니다.

1. **12개 SAR 블록 생성 · 전체 ADC 열기**로 독립 프로젝트를 만듭니다. 기존 프로젝트는 보존합니다.
2. TG, 기준 mux, bit mux, unit C, bridge, CDAC, preamp, latch, comparator, analog core, controller, 전체 ADC를 각각 열 수 있습니다.
3. **1mm² 아날로그 코어 마스크 생성**은 실제 public PCell 배치·배선을 수행합니다. 영역 초과 시 잘라내거나 축소하지 않고 거절합니다.
4. `Schematic`에서 하위 계층을 열고 `Layout 2D`에서 실제 도형을 봅니다. 처음에는 2,000개 제한 표시입니다. `정확한 표시 영역 → 전체`는 339,131개 도형을 요청하므로 로딩이 오래 걸릴 수 있습니다. 상세 편집에는 `현재 화면 영역 가져오기`를 사용하세요.
5. `Simulate`는 실제 엔진을 실행합니다. `Post-layout`은 현재 revision의 PEX가 있어야 활성화됩니다. 실패·미실행·과거 소스의 결과는 해당 상태로 유지합니다.

직접 가져오려면 `examples/sar12-lab/hierarchy/*/*.register.zip` 또는 `analog/sar12_analog.register.zip`을 엽니다. OASIS와 sidecar도 제공합니다. GDS는 원본 바이트를 gzip 압축한 파일이며 압축 해제 후 사용합니다. 52 MB GDS는 기본 브라우저 업로드 상한을 넘으므로 프로젝트 bundle, 9.5 MB OASIS 또는 worker 파일 경로 방식을 이용하세요. 가져온 프로젝트에는 과거 PASS를 복사하지 않습니다.

## 실제 실행과 검사 방식

- 아날로그 해석은 하나의 transient를 유지하며 `run` 뒤에는 `resume`을 사용합니다. 모든 실제 정지 시각과 12회 trial 순서, 비교기 양쪽 논리 레벨을 검사합니다. 잘못된 시각·수렴 오류·부족한 데이터는 결과로 통과시키지 않습니다.
- 물리 추출 회로는 시작 전에 정확한 모든 정지점을 선언합니다. ngspice 42의 동적 breakpoint와 거부된 step 문제를 피하며 원본 실패 로그도 보존합니다.
- 64/256점 모드는 coherent한 **샘플별 계단 입력**입니다. 실제 CODE를 독립 DFT로 분석합니다. 연속 정현파 입력의 track/hold 대역폭·aperture 성능을 검증한 결과가 아닙니다.
- 4,096개 전체 코드 검사는 RTL·합성 gate·편집 CMOS 논리 그래프에 대한 **디지털 oracle 검사**입니다. 4,096개 MOS ADC 변환을 측정했다는 뜻이 아닙니다. 아날로그 전체 sweep는 `test_mode=3`, `static_batch=0..15`로 분할 실행하며 모두 실행하기 전에는 INL/DNL이나 missing-code 통과를 표시하지 않습니다.
- GUI 파형은 같은 시간축에서 실제 극값을 골라 표시합니다. 전력은 화면용 축소 파형 대신 모든 원본 adaptive-step 샘플의 signed trapezoidal 적분을 사용합니다. VDD·VREF 원천만 포함하며 외부 제어기·VIN/VCM 구동·전체 디지털 전력은 미측정입니다.
- 기본 reference/VCM은 외부 구동입니다. 입력 두 단자의 구동 저항은 각각 50 Ω이며 pre/post에 동일하게 적용합니다. VREF 2 Ω + 1 nF, VCM 10 Ω + 100 pF, 디지털 제어 bridge 2 kΩ + 2 pF 가정이 testbench와 manifest에 기록됩니다. 실제 reference generator나 clock timing 회로의 검증을 대체하지 않습니다.

## 재실행

앱의 native 엔진 외에 iverilog/vvp, Yosys 및 물리 검사 시 Magic·Netgen·KLayout, 공개 SKY130 모델이 필요합니다. 이번 실행 환경은 Windows의 별도 ResistorEDA WSL 엔진입니다. Docker와 유료 API를 사용하지 않았습니다. 이 작업의 새 macOS 설치 파일을 발행했다는 뜻은 아닙니다.

```powershell
# 별도 .runtime/sar12/lab 작업 공간에서 실행
npm run test:sar12
node scripts/sar12-lab.mjs --mode=0
node scripts/sar12-lab.mjs --mode=1
node scripts/sar12-lab.mjs --physical --checks --post --mode=4

# mode=2: experimental coherent 256점, mode=3: experimental static batch
# mode=4: 한 입력. 이 환경에서 완료한 모드는 0/1/4입니다.
# 실제 대규모 추출 해석은 오래 걸리며 시간 초과도 실패로 보존됩니다.
```

`scripts/sar12-controller-qa.py`는 Icarus 세 구현에서 각각 159,751개 assertion을 실행합니다. `workers/eda/test_sar12.py`에는 분할 가중치, 단위, 입력 제한, 잘못된 판단/데이터 주입, FFT 및 원본 전력 적분 fixture가 있습니다. 합성은 `scripts/sar-adc-synthesize.py --bits 12`로 재현하며, 기존 8-bit 기본 동작은 유지합니다.

256점·전체 static sweep는 이 환경에서 완료하지 않았습니다. 현재 한 native 해석의 시간 한도는 900초이며 큰 실험은 이 한도나 2GiB raw trace 한도에 도달할 수 있습니다. 디지털 QA는 4상태 논리의 X/Z도 실패로 처리하며, 비교기에 X를 주입했을 때 실제로 실패하는 검사도 포함합니다.

## 아직 입증하지 않은 것

배선 후 전체 입력 범위 정확도·256점 스펙트럼, 열잡음·flicker·지터·편차 Monte Carlo, 전이점 기반 INL/DNL, 모든 PVT·RC corner, 비교기 offset yield, 독립 C-only 대비 결합 추출 완전성, 입력 소자 전압 stress 전수 검사, 전체 디지털 소자 타이밍/STA와 물리 구현, reference/VCM 생성기, pad/ESD·antenna·density·EM/IR·파운드리 승인입니다. **DRC 0·LVS 일치·PEX 생성은 제조 signoff나 12-bit 실물 ENOB를 의미하지 않습니다.**
