# 문헌 검토와 셀·블록 특성 측정 — 2026-10-13

Resistor는 SKY130 MOS 회로, 회로도·계층 편집, GDS/OASIS 레이아웃과 ngspice/Magic/Netgen 해석을 통합한 작업대입니다. 54개 회로 템플릿과 가산기·CPU 5종을 대상으로 문헌 대응표와 특성 측정을 업데이트했습니다. 기존 사용자 프로젝트는 덮어쓰지 않습니다. 기존 기본 셀 ×1 크기와 OTA 5kΩ 보상 저항도 기본값으로 유지합니다.

이번 검토는 접근 가능한 2025–2026년 1차 자료를 선정한 검토입니다. 전체 연구 분야를 망라하는 체계적 문헌 리뷰는 아닙니다. 2024 배치 자료는 기초 자료로 표시했고, ISSCC 공식 자료는 전체 논문 대신 공개된 동향·발표 요약을 읽었습니다. ZlibBoost는 출판사 검색에 노출된 본문 부분과 저자 저장소를 읽었으며 전체 출판사 페이지 접근은 실패했습니다.

논문을 참고한 검사 방법과 그 논문 칩을 재현한 결과는 다릅니다. 레지스터 회로의 측정값은 자체 엔진 기록에만 근거합니다. IHP·40nm·SCL·BCD·32nm 공정 결과를 SKY130 성능으로 표시하지 않습니다.

## 참고 문헌과 반영

| 문헌 | 확인 범위 | 이번 반영 | 재현하지 않은 내용 |
|---|---|---|---|
| [Castañeda et al., EZ130, 2026-09-24](https://arxiv.org/abs/2609.29965) | 본문 II-C, III-A–D | 기본 셀의 구동 크기 탐색과 기능·지연·에너지·물리 검증 분리 | IHP 셀 자체와 논문의 PPA·실리콘 결과 |
| [Chen et al., ZlibBoost, 2026-03-19](https://doi.org/10.1145/3747182) | 공개 검색 본문 NLDM 설명·[저자 저장소](https://github.com/skycrapers/ZlibBoost) | 단일 입력을 바꾸는 sensitized arc와 slew/load 조건별 측정 | ML 추정, 완전한 Liberty/NLDM, 숨은 전력·순차 셀 모델 |
| [Huang & Wu, SAR ADC, 2025-01-10](https://www.jstage.jst.go.jp/article/elex/22/1/22_21.20240528/_article) | PDF 2.2–2.4, 3 | VDD·VREF의 acquisition/reset·conversion 에너지 분리 | 논문의 차동 CDAC·double-tail 구조와 성능 수치 |
| [Sharma et al., ΣΔ ADC, 2025](https://www.nature.com/articles/s41598-025-19272-4) | PDF 디지털 필터·CIC 설계 | 기존 CIC2의 DC gain·droop·group delay를 독립 수식으로 제공 | 논문의 14-bit 회로·전력 절감·ENOB. 논문 SNR 식을 측정 대신 사용하지 않음 |
| [Zhang et al., LDO, 2025-07-28](https://arxiv.org/abs/2507.20522) | PDF 보상·PSRR·부하 과도 응답 | LDO 공급 리플 AC 응답, OTA 보상 저항 설정·재해석 | 고전압 BCD 소자·active ripple cancellation·논문의 수치. 미심사 preprint |
| [Huang et al., clock gating, 2026-08-31](https://arxiv.org/abs/2608.30954) | 본문 IV-B–D, V-G | CPU·ADC의 RTL/gate/CMOS replay와 트랜지스터 타이밍 증거 구분 | ICG·MSP430·SDF/STA closure·논문의 PPA 절감 |
| [Grus & Hanzálek, placement, 2024-11-13 v2](https://arxiv.org/abs/2411.02406) | 본문 3, 4.1.4 | 기존 matched-unit centroid·1mm² 영역 검사를 재사용·검토 | GA·ILP·DQN 및 배치 벤치마크. 최신 논문으로 분류하지 않음 |
| [ISSCC 2026 공식 자료](https://www.isscc.org/s/ISSCC2026PressKit.pdf) | PDF 페이지 97–98, 113–122 (0부터 시작) | ADC·전원·클록의 PVT, buffer, noise, timing 검증 공백 표시 | 논문 전체 회로·동적 ΔΣ·보정·phase-noise 성능 재현 |

정확한 DOI, 저자, 읽은 범위, 공정과 제외 항목은 [공통 문헌 데이터](../workers/eda/literature.json)에 저장합니다. `design.catalog`가 문헌별·블록별 대응표를 반환하며, 앱의 **설계 도구 → 통합 설계 → 논문 · 특성 측정**에서 검색·원문 링크·JSON 저장을 사용할 수 있습니다.

## 실제 변경

- **기본 셀 8종:** INV/NAND2/NOR2/AND2/OR2/XOR2/XNOR2/MUX2. 기존 MOS 연결과 길이를 보존하면서 너비를 ×1/×2/×4로 선택합니다. 입력 전이시간은 전체 전압 범위 기준 0.02–5ns입니다. 출력 load는 testbench의 F 단위입니다.
- **타이밍:** 전체 진리표를 먼저 실행한 뒤, 출력 논리가 달라지는 모든 단일 입력 전이를 실행합니다. 전파 지연은 실제 입력/출력 50% crossing 차이, 출력 전이는 실제 10–90%/90–10%입니다. glitch·누락 crossing·미정착은 가려지지 않습니다. 음의 지연을 임의로 0으로 만들지 않습니다. setup/hold/STA/Liberty 완료를 주장하지 않습니다.
- **SoC 보상:** 바이어스 버퍼·Miller OTA·PGA·filter·TIA·AFE의 재사용 OTA에서 `nulling_Ohm`을 500–50000Ω로 조절합니다. 기본 5000Ω와 기존 회로 topology는 유지됩니다. R을 바꾸면 기존 레이아웃의 검증을 재사용할 수 없으며 새 물리 변환·DRC/LVS/PEX·AC 해석이 필요합니다.
- **LDO:** AC 해석에서 VDD에만 AC=1V를 가하고, 외부 VREF/BIAS는 AC=0입니다. `PSRR_rejection_dB = −20 log10(|VOUT/VDD|)`이므로 좋은 rejection은 양수입니다. light-load 저항·이상적인 외부 출력 C 조건입니다. 출력 gain 0을 무한 PSRR로 표시하지 않습니다. PSRR 곡선만으로 LDO 안정성 또는 전체 설계 PASS를 만들지 않습니다.
- **VCO·PLL:** 실제 crossing의 주기 변화를 기록하고 PLL 위상 drift를 부호·wrap에 의해 숨기지 않도록 누적 위상 범위 검사를 추가합니다. deterministic transient의 주기 변화는 랜덤 jitter/phase-noise 측정이 아닙니다. Type-I XOR PLL의 기존 구조는 유지됩니다.
- **SAR:** 실제 VDD·VREF 전류를 사용해 acquisition/reset과 8bit conversion을 분리합니다. 음수는 전원에 반환된 에너지입니다. VIN/VCM/BIAS/외부 드라이버/컨트롤러 전력은 제외되므로 총 에너지나 Walden FoM으로 표시하지 않습니다. 기존 400fF 동일 단위 CDAC와 실제 비교기 판정은 유지됩니다.
- **ΣΔ:** 이미 구현된 CIC2를 유지합니다. 정규화 응답은 `|sin(πfR/Fs)/(R sin(πf/Fs))|²`, DC gain은 R², delay는 `(R−1)/Fs`입니다. 기존 Fs=1MHz, R=256에서 수학적 group delay는 255µs입니다. 정착·리셋 제어 latency나 실제 ENOB는 이 값으로 대체하지 않습니다. 공급 에너지는 표시용 thinning 이전의 모든 raw analog samples에서 계산합니다.
- **전체 59종:** 문헌·공정 차이·미검증 항목을 연결하고, 실제 transient에서 공급 에너지·출력 tail 통계를 제공합니다. 구간 경계를 보간하고 실제 시간 간격으로 가중합니다. 전원이 없는 디지털 replay에서 가상의 전력 수치를 만들지 않습니다. 이전 소스의 실행은 현재 엔진에서 `job.status`를 다시 읽어 stale을 표시합니다.

## 재현

실행 가능한 설치·Docker 엔진에서 아래 검증 스크립트를 사용합니다. 각각 새 프로젝트와 기록을 만들며 기존 프로젝트를 보존합니다.

```sh
node scripts/research-qualification.mjs --smoke
node scripts/research-qualification.mjs
node scripts/research-qualification.mjs --matrix
```

기본 실행은 59종, 보상 저항 3조건, 8개 셀 SS/FF 조건, ×4 물리 인버터를 다룹니다. matrix는 8개 셀 × 2 drive × 2 slew × 2 load의 64조건입니다. 실제 요청과 결과는 소스 hash별 [레퍼런스 폴더](../examples/research-20261013/latest.json)에 저장합니다. DRC/LVS/PEX, pre/post 결과와 측정-only unknown, 실패 로그는 별도로 보존합니다. 단일 입력·단일 TT 기준 PASS는 전체 PVT, RC corner, 잡음·수율 또는 제조 승인이 아닙니다.

이 새 소스는 기존 v0.23.0 설치 파일과 구분합니다. 최신 바이너리의 native platform 검증·릴리스는 실제 수행 기록이 있을 때만 해당 버전에 연결합니다.
