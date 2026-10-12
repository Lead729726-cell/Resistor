# 물리 설계에서 제조 인계까지

현재 산출물은 공개 SKY130A PCell 기반 코어와 교육·재사용용 기본 셀이다. 칩 전체 제조 승인을 뜻하지 않는다. 결과는 TT/27°C/1.8V와 typical RC에서 실행한 각각의 이름 있는 기준에 한정된다.

| 단계 | 현재 증거 | 다음 인계 항목 |
|---|---|---|
| 소자·포트 | 실제 MOS / xhigh poly R / MIM C, 명시적 body | 허용 전압·신뢰성·ESD·bias·외부 부품 사양 |
| 마스크 | integer DBU GDS/OASIS, 교환 roundtrip 검사 | floorplan, matching, guard ring, pad/seal ring, 최종 routing |
| DRC | Magic 선택 공개 deck, 14개 native 검사 | 최종 foundry deck, density/fill/antenna/full-chip 규칙 |
| LVS | Netgen 고유 회로 일치, 14개 native 검사 | full-chip hierarchy, pad/ESD/package pin 연결 |
| PEX | Magic 원본 R/C와 감사 가능한 해석용 축약 | 승인 추출 도구, RC corners, coupling·기판 모델 |
| 회로 동작 | ngspice 전후 파형, 이름 있는 범위 기준 | PVT, Monte Carlo, startup, noise/offset, 안정성·PLL jitter |
| 디지털 사용 | 8셀 모든 입력 조합 | LEF/Liberty, delay/slew/load characterization, STA, 행·tap/endcap |
| 전원·제조 | 아직 최종 승인 없음 | EM/IR, thermal, package, foundry intake/waivers, fab DFM |

제작 순서: 사양과 시험 → 회로/소자 크기 → PCell과 배치 → 실제 핀·body·contact 배선 → DRC → LVS → PEX → 기생 후 시험 → 실패 수정과 반복 → 상기 full-chip/공정 사양 → 최종 제조 인계 승인. 회로 변경 후 기존 마스크·PASS는 유효한 것으로 가정하지 않는다.

인계 묶음에는 제품/버전, 포트 순서와 전원 도메인, GDS/OASIS와 해시, 회로 SPICE, PDK/deck/tool hash, DRC violation 및 waiver, LVS 원문, 원본 PEX와 해석용 축약 감사, 동일 revision 시험 입력과 원본 관측값, 외부 부품과 미완료 항목, 담당자의 최종 검토를 포함한다. 이 라이브러리에는 PLL 잠금 FAIL이 포함된다. 실패를 제거하거나 PASS 문구로 덮지 않는다.

층의 Z와 높이 변화는 별도 공정 데이터/측정 입력이 필요하다. 뷰어의 표시 높이로 step coverage, 두께 감소, TCAD 또는 defect/yield가 검증되었다고 주장하지 않는다. 단자 전류 화살표도 금속의 공간 전류 밀도·electromigration 검사와 구분한다.

공식 자료: [SKY130 소자](https://skywater-pdk.readthedocs.io/en/main/rules/device-details.html), [RC 추출 규칙](https://skywater-pdk.readthedocs.io/en/main/rules/rcx.html), [공개 설계 규칙](https://skywater-pdk.readthedocs.io/en/main/rules.html).
