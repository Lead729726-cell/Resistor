# Resistor 물리 라이브러리 · 14개 실습

8개 CMOS 로직 셀과 6개 전원·클록·아날로그 코어입니다. 공개 PCell 실제 마스크, Magic DRC/PEX, Netgen LVS, ngspice 전후 해석을 실행했습니다. **제조 승인 완료 파일은 아닙니다.**

[설계 파일 전체 다운로드](https://github.com/Lead729726-cell/Resistor/releases/download/v0.17.0/Resistor-Physical-Library.zip) · [영상 가이드](https://resistor-downloads.vercel.app/tutorial/physical-logic) · [칩 실습 영상](https://resistor-downloads.vercel.app/tutorial/physical-chips)

| 레퍼런스 | DRC | LVS | PEX | 기생 후 기준 |
|---|---|---|---|---|
| LDO | PASS | PASS | 12955 R / 2030 C | PASS |
| DC-DC | PASS | PASS | 4234 R / 1143 C | PASS |
| VCO | PASS | PASS | 3309 R / 1241 C | PASS |
| PLL | PASS | PASS | 29477 R / 1748 C | **FAIL** |
| OTA | PASS | PASS | 1884 R / 617 C | PASS |
| 비교기 | PASS | PASS | 2294 R / 763 C | PASS |
| INV | PASS | PASS | 144 R / 6 C | PASS |
| NAND2 | PASS | PASS | 289 R / 15 C | PASS |
| NOR2 | PASS | PASS | 289 R / 15 C | PASS |
| AND2 | PASS | PASS | 435 R / 47 C | PASS |
| OR2 | PASS | PASS | 435 R / 21 C | PASS |
| XOR2 | PASS | PASS | 1165 R / 120 C | PASS |
| XNOR2 | PASS | PASS | 1311 R / 140 C | PASS |
| MUX2 | PASS | PASS | 437 R / 77 C | PASS |

PLL은 실행 완료지만 주파수/위상 잠금 기준 FAIL입니다. 실패 보고서와 파형을 유지합니다. 14개 실제 물리 검사 / 13개 기생 후 기능 기준 통과는 foundry signoff와 다릅니다.

- [LDO · 1.8V → 1.2V PMOS 레귤레이터](chip_ldo/README.md)
- [DC-DC · 2:1 스위치드 커패시터 코어](chip_sc_dcdc/README.md)
- [VCO · 전류 제한 3단 링 발진기](chip_vco/README.md)
- [PLL · XOR 위상 검출 1:1 루프](chip_pll/README.md)
- [OTA · 5-MOS 전류 미러 부하 증폭기](chip_ota/README.md)
- [비교기 · 차동 입력 + CMOS 출력](chip_comparator/README.md)
- [INV · 직접 만든 CMOS 기본 셀](cell_inv/README.md)
- [NAND2 · 직접 만든 CMOS 기본 셀](cell_nand2/README.md)
- [NOR2 · 직접 만든 CMOS 기본 셀](cell_nor2/README.md)
- [AND2 · 직접 만든 CMOS 기본 셀](cell_and2/README.md)
- [OR2 · 직접 만든 CMOS 기본 셀](cell_or2/README.md)
- [XOR2 · 직접 만든 CMOS 기본 셀](cell_xor2/README.md)
- [XNOR2 · 직접 만든 CMOS 기본 셀](cell_xnor2/README.md)
- [MUX2 · 직접 만든 CMOS 기본 셀](cell_mux2/README.md)

파일: `*.register.zip`은 회로·조건·계층을 편집할 프로젝트, GDS/OASIS는 마스크, `.mos.json`은 회로와 표시 metadata, core SPICE와 pre/post 폴더는 원본 실행 입력·보고서, CSV/PNG는 실제 관측 데이터입니다. 가져온 프로젝트는 runs=0에서 시작합니다. 모든 binary와 sidecar는 다운로드 ZIP에 포함되며 모델과 deck은 설치된 pinned 공개 PDK를 사용합니다.

재현: `node scripts/physical-library.mjs` → `node scripts/physical-import-check.mjs` → `python scripts/physical-deliverables.py`. native tool/model/deck hash는 각 manifest.json, 구현 hash는 evidence.json에 있습니다.
