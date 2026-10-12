# SoC · 바이어스·공통모드 기준

실제 SKY130 MOS/poly/MIM 회로입니다. 계층 프로젝트와 flat 물리 프로젝트를 따로 제공합니다.

[계층 프로젝트](soc_bias.hierarchy.register.zip) · [물리 프로젝트](soc_bias.register.zip) · [GDS](soc_bias.gds) · [OASIS](soc_bias.oas) · [계층 SPICE](hierarchy.spice) · [배선 보고서](routing-report.json)

| 단계 | 실행 | 판정 |
|---|---|---|
| drc | completed | pass |
| lvs | completed | pass |
| pex | completed | pass |
| pre | completed | pass |
| post | completed | pass |

실제 job ID·revision·파형·모델 조건은 각 result JSON에 있습니다. AFE/bias는 자체 VDD/2 및 MOS 바이어스입니다. 나머지 블록의 VCM/BIAS, 공급·신호·클록·출력 부하와 cascode IREF는 외부 testbench입니다. OTA의 1G/1F DC servo·1pF 부하도 외부입니다. Magic PEX 원본과 정확한 RC 축약 기록을 보존합니다.

nominal TT/27°C/1.8V와 typical RC 범위입니다. [18조건 기능 검사](../pvt.json)에는 저이득 오차 실패도 있습니다. 넓은 1행 배선은 matching/common-centroid, full-chip density/antenna, ESD/EM/IR 또는 foundry signoff가 아닙니다.
