# 8비트 시그마델타 ADC와 전체 하위 블록

SKY130 1.8V · 1차 연속시간 1비트 모듈레이터 · 1MHz 외부 클록 · CIC2 ×256 · 3.90625kS/s · CODE[7:0] + VALID.

앱에서 **통합 설계 → 회로 · 연결 탐색 → 회로 template 지원 범위 읽기 → 19개 실제 회로 프로젝트 생성**을 누릅니다. 생성된 전체 ADC의 Schematic 계층 탐색에서 각 블록과 내부 MOS를 열 수 있습니다. 개별 블록은 Project 열기에서 선택합니다. 기존 설계는 보존됩니다.

| 회로 ID | 역할 | 전체 하위 소자 수 |
|---|---|---|
| sdm8_input_filter | 입력 RC anti-alias 필터 | 1 resistor, 1 capacitor |
| sdm8_reference | VDD/2 기준전압 · 디커플링 | 2 resistor, 1 capacitor |
| sdm8_bias | 저항·다이오드 MOS 바이어스 | 1 resistor, 1 nmos |
| sdm8_ota | 7-MOS 2단 Miller OTA | 4 nmos, 3 pmos, 1 capacitor, 1 resistor |
| sdm8_integrator | 합산 저항 · 피드백 적분기 | 6 nmos, 5 pmos, 2 capacitor, 3 resistor |
| sdm8_comparator | 7-MOS 1비트 비교기 | 4 nmos, 3 pmos |
| sdm8_sample_latch | 샘플 DFF · reset MUX | 12 pmos, 12 nmos |
| sdm8_dac | 1비트 NRZ 피드백 DAC | 1 pmos, 1 nmos |
| sdm8_clock_buffer | 2단 클록 버퍼 | 2 pmos, 2 nmos |
| sdm8_reset_switch | 적분기 초기화 전송 게이트 | 2 nmos, 2 pmos |
| sdm8_modulator | 1차 아날로그 시그마델타 모듈레이터 | 7 resistor, 4 capacitor, 27 nmos, 24 pmos |
| sdm8_reset_sync | 리셋 해제 2FF 동기화 | 23 pmos, 23 nmos |
| sdm8_frame_counter | 256 샘플 프레임 카운터 | 189 pmos, 189 nmos |
| sdm8_cic_integrators | 17비트 CIC 적분기 2단 | 1038 pmos, 1038 nmos |
| sdm8_cic_combs | 17비트 CIC comb 2단 | 1515 pmos, 1515 nmos |
| sdm8_scale_saturate | 8비트 스케일 · 포화 처리 | 24 pmos, 24 nmos |
| sdm8_output_register | 8비트 출력 레지스터 · VALID | 142 pmos, 142 nmos |
| sdm8_filter | CIC2 ×256 디지털 필터 전체 | 2931 pmos, 2931 nmos |
| sigma_delta8 | 8비트 시그마델타 ADC · 전체 하위 블록 | 7 resistor, 4 capacitor, 2958 nmos, 2955 pmos |

INV, NAND2, NOR2, AND2, OR2, XOR2, MUX2, DFF, DFF_N과 OTA 입력단도 실제 소자 계층에 포함됩니다. `.json`은 편집 가능한 native IR, `.spice`는 실제 하위회로 netlist, `rtl/`은 원본과 실제 합성 게이트 Verilog입니다. `projects/`의 register ZIP은 앱의 프로젝트 가져오기로 엽니다. [전체 부품·의존성 JSON](blocks.json) · [실제 측정 결과](evidence.json).

1비트 DAC는 VDD와 접지를 이용하며 DACB=VDD×(1−BITSTREAM)입니다. VCM은 VDD/2 저항 분압과 20pF 디커플링, 바이어스는 저항과 다이오드 NMOS입니다. 기준전압 정확도가 VDD에 의존하는 ratiometric 설계이며 precision bandgap을 주장하지 않습니다. 적분기는 입력·피드백 각 500kΩ, 피드백 4pF, 7-MOS 2단 OTA, 0.5pF Miller 보상을 사용합니다. 입력 RC는 10kΩ·100pF입니다. 클록·전원·입력·리셋은 명시된 외부 testbench입니다.

아날로그 양의 클록 에지에 비교 결과를 저장하고, 디지털 필터는 다음 음의 에지에 처리합니다. CIC의 17비트 적분·comb 연산은 modulo 2^17이며 DC gain=256²=65536입니다. 정규화는 floor(CIC/256), 256은 255로 포화합니다. 전압 환산은 CODE×VDD/256입니다. 첫 두 출력 프레임은 settling 구간입니다. 따라서 1.8V에서 1 LSB=7.03125mV입니다.

Simulation의 Transient를 실행하면 실제 SKY130 MOS ngspice 파형에서 비트열을 샘플하고, Icarus Verilog로 원본 RTL와 합성 게이트를 각각 실행합니다. 모든 클록의 CODE·VALID를 독립 정수 reference와 대조합니다. 단독 아날로그 블록은 모듈레이터 환경에 연결하고, 단독 디지털 블록은 필터 환경에서 입력 밀도·리셋·포화를 검사합니다. 디지털 MOS 전체를 동시에 푸는 SPICE 타이밍 해석은 수행하지 않습니다. 디지털 회로를 편집하면 이전 RTL를 조용히 쓰지 않고 재합성 필요 오류를 냅니다.

DC 기본 조건: 입력 0.9V, 2.06ms, step 125ns, TT·27°C·1.8V. 입력·사인 진폭·주파수는 생성 시 설정합니다. coherent SINAD 조건 예: 0.9V 중심·0.6V 진폭·183.10546875Hz·16.908ms·125ns, 66 출력 프레임 중 처음 두 프레임 제외. 출력 전체 Nyquist 구간의 잡음과 고조파를 포함해 SINAD와 ENOB=(SINAD−1.76)/6.02를 계산합니다. 8비트 출력은 ENOB8 보장이 아닙니다.

아날로그 RC는 이상적이며 디지털 게이트 지연·열잡음·flicker·jitter·Monte Carlo·PVT 범위·정확한 bandgap·ESD/패드·전력망·전체 ADC 마스크·DRC/LVS/PEX·제조 승인은 미검증입니다. 빈 레이아웃의 물리 검증은 backend가 거절합니다. DC 오차 ≤2 LSB는 이 레퍼런스의 기능 기준이며 8비트 INL/DNL·ENOB 사양 인증을 뜻하지 않습니다.

공식 원리: [ADI MT-022](https://www.analog.com/media/en/training-seminars/tutorials/MT-022.pdf), [TI SBAA230A](https://www.ti.com/lit/an/sbaa230a/sbaa230a.pdf).

재현: Docker EDA 환경에서 `python3 scripts/sigma-delta-synthesize.py`, `python3 -m unittest discover -s workers/eda -p test_sigma_delta.py`, `python3 scripts/sigma-delta-native.py --frames=66 --amplitude=.6 --frequency=183.10546875 --output=.runtime/sigma-delta8/native-sine`을 실행합니다. 서버 배포나 유료 API를 사용하지 않습니다.
