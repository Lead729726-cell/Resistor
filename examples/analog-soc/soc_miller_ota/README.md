# SoC · 2단 Miller 보상 OTA

실제 SKY130 MOS/poly/MIM 회로입니다. 계층 프로젝트와 flat 물리 프로젝트를 따로 제공합니다.

[계층 프로젝트](soc_miller_ota.hierarchy.register.zip) · [물리 프로젝트](soc_miller_ota.register.zip) · [GDS](soc_miller_ota.gds) · [OASIS](soc_miller_ota.oas) · [계층 SPICE](hierarchy.spice) · [배선 보고서](routing-report.json)

| 단계 | 실행 | 판정 |
|---|---|---|
| drc | completed | pass |
| lvs | completed | pass |
| pex | completed | pass |
| pre | completed | pass |
| post | completed | pass |

실제 job ID·revision·파형·모델 조건은 각 result JSON에 있습니다. AFE/bias는 자체 VDD/2 및 MOS 바이어스입니다. 나머지 블록의 VCM/BIAS, 공급·신호·클록·출력 부하와 cascode IREF는 외부 testbench입니다. OTA의 1G/1F DC servo·1pF 부하도 외부입니다. Magic PEX 원본과 정확한 RC 축약 기록을 보존합니다.

nominal TT/27°C/1.8V와 typical RC 범위입니다. [원본 18조건](../pvt.json)과 [실제 PEX 18조건](../pvt-pex.json)을 따로 제공합니다. ABBA 입력쌍의 실제 중심 일치만 검사했으며 guard ring/dummy, substrate, full-chip density/antenna, ESD/EM/IR 또는 foundry signoff는 별도입니다.
