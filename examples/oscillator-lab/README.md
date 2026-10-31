# Resistor Indust · Oscillator & Sensor Lab

네 가지 실제 SKY130 MOS 회로와 ngspice 해석 결과입니다. 기존 VCO·PLL과 함께 다른 발진 구조와 센서 응용을 비교합니다.

- [5단 CMOS 링](osc_ring5/README.md): 부하와 코너에 따른 클록 변화.
- [정전용량 → 주파수 센서](osc_rc_sensor/README.md): 실제 CAP 충·방전과 전환 전압.
- [두 발진기의 비트 검출](osc_beat/README.md): CMOS XOR·RC로 주파수 차 읽기.
- [이벤트 구동 버스트 클록](osc_burst/README.md): EN에 따른 시작·정지·재시작.

[앱에서 열기와 비교 과제](../../docs/oscillator-lab.md) · [실제 실행·source hash 기록](../../docs/evidence/oscillator-lab/native-verification.json) · [온라인 튜토리얼](https://resistor.kr/tutorial/oscillators/).

최신 소스 엔진에서 프로젝트 ZIP을 가져오거나 내 반도체의 **발진기·센서 프로젝트**를 선택합니다. 공개 0.28 설치 파일에는 새 adapter가 포함되지 않았습니다. 원본 `waveform.dat`는 ngspice 출력의 전체 표본이고 SVG는 그 표본의 일부를 보여줍니다. `executed-testbench.spice`와 manifest는 실제 실행 기록이므로 실행 당시의 로컬 모델 경로를 담습니다. 다른 PC에서는 앱 엔진이 설치된 공개 PDK 경로로 testbench를 다시 만듭니다.

초기 조건과 이상적 외부 R/C를 명시한 회로도 참조입니다. 센서 실물 보정, 확률적 지터·위상 잡음·공정 수율, 물리 레이아웃·DRC/LVS/PEX·제조 signoff는 미검증입니다. 가져온 프로젝트는 다른 PC의 과거 성공 run을 상속하지 않고 새로 해석합니다.

공통 엔진 변경 후에는 `node scripts/oscillator-lab.mjs --regression`으로 19회 실제 해석과 회로 ZIP 왕복·변경 이력 검사를 다시 수행합니다. [현재 소스 회귀 검증](../../docs/evidence/oscillator-lab/current-source-regression.json)은 원래 실행 기록과 별도로 보관하며, 공개된 네 DUT의 SPICE가 현재 생성 회로와 바이트 단위로 같은지도 검사합니다. 이 명령은 공개 ZIP·파형·원래 실행 기록을 덮어쓰지 않습니다.
