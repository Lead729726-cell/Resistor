# Resistor Indust · HDL/아날로그·디지털 검증

2026-10-20의 실제 native/WSL 엔진 실행입니다. 상용 엔진이나 파운드리 제조 signoff 결과는 아닙니다.

## 수정한 오류

- **배선 후 포트 순서:** Magic의 실제 `.subckt` 선언과 프로젝트 포트 순서가 달랐습니다. 사용자 회로의 transient 해석도 실제 추출 선언 순서로 연결하며, 누락·중복·불일치 포트는 차단합니다. continuation도 검사합니다.
- **RC 마스크 완성 후 상태:** 실제 RC geometry와 배선을 생성·승인한 후에도 이전의 `physical_interface_complete:false`가 남던 문제를 수정했습니다. 실제 forward 변환에만 상태를 갱신하며 DRC/LVS/PEX는 별도 미실행으로 유지합니다.
- **검증 환경:** Docker 전용 simcells 경로를 실제 설치 경로로 바꿨습니다. 공식 native 준비 스크립트에 GHDL·NumPy·pycparser를 포함했습니다. unittest와 과거의 별도 integration 실행 스크립트를 구분해 실행합니다.
- **화면 조건:** 다음 실행의 corner와 선택한 실제 결과의 pre/post 단계·corner·온도를 따로 표시합니다. 값이 없는 과거 결과는 미기록으로 표시합니다.

## 실제 확인 범위

| 범위 | 결과와 제한 |
|---|---|
| Verilog/SV/VHDL/C/BLIF/RTLIL/ROM/혼합 언어 | 기본 665개 + 경계 1,552개 = 출력 assertion **2,217개**. 64-bit carry/wrap, signed shift/비교, ascending/offset bus, GCC 원본 C oracle 포함 |
| 기대값 없는 실행 | `unknown` 유지. 컴파일 오류·X·overflow·오답은 실패 기록 유지 |
| HDL inverter | 실제 DRC 0, LVS 일치, PEX 436 R / 48 C |
| 4-bit adder · 198 primitives | 실제 DRC 0, LVS 일치, PEX 14,854 R / 6,368 C |
| 4-bit counter · 178 primitives | 실제 DRC 0, LVS 일치, PEX 13,415 R / 5,454 C |
| 배선한 디지털 CMOS + 아날로그 current mirror · 8 MOS | DRC 0, LVS 일치, PEX 585 R / 67 C, 19점의 실제 post-layout DC. 기능이 완성된 상용 SoC를 뜻하지 않음 |
| 실제 RC를 포함한 MOS 회로 · 8 primitives | DRC 0, LVS 일치, PEX 621 R / 160 C. 원래의 ideal R/C는 실제 SKY130 poly resistor/MIM PCell로 변환 |
| RC 배선 전·후 | TT 27°C / SS 125°C / FF −40°C, 1.8V에서 6회 실제 해석. settled 출력 검사 48개와 midpoint 전환 42개 대조 |
| 594 primitives C ALU | 512소자 physical 한도로 거부. 합성·논리 벡터 검사와 물리 구현을 구분 |

RC PCell 크기 추정은 요청한 1kΩ/1pF와 정확히 동일하지 않습니다. 생성 보고서의 nominal sizing과 실제 PDK model을 기준으로 해석합니다. 소자 몸체·기생 효과를 임의로 삭제하거나 값을 clamp하지 않습니다. 공급 전류는 원본의 **signed (+→−)** 값으로 보존합니다.

전환 대조의 fixture 기준은 LOW ≤0.36V, HIGH ≥1.44V, 선택한 전환 지연 <40ns입니다. 전체 STA나 특성화된 라이브러리의 timing arc·최대 동작 주파수·전체 PVT closure를 뜻하지 않습니다. 기준 없는 native transient 결과는 `unknown`이며 별도 수치 대조가 이를 PASS로 바꾸지 않습니다.

![실제 배선 전후 전압과 공급 전류](../examples/hardware-validation/pre-post-waveforms.png)

## 앱에서 재현

1. [검증 프로젝트](../examples/hardware-validation/README.md)의 `.register.zip`을 **열기 → 설계 파일 가져오기**에서 새 프로젝트로 가져옵니다. 기존 PASS를 상속하지 않습니다.
2. HDL 프로젝트는 **프로젝트 도구 → HDL·Mixed SoC**에서 소스와 벡터를 실행합니다. 수정한 소스는 저장하기 전까지 실행할 수 없습니다.
3. RC bridge의 ideal 외부 회로를 실제 geometry로 만들려면 **GDS ⇄ 회로도 → 회로도 → 레이아웃**에서 칩 규격·body net·passive 대체 보고서를 검토하고 승인합니다. 원본을 복제한 프로젝트에서 작업하는 것을 권합니다.
4. 계층 조립은 먼저 실제 root Port를 선언합니다. 블록끼리 같은 net을 사용해도 외부 입출력이 자동으로 생성되지는 않습니다. 이번 통합 예제에는 VPWR/VGND/IN/DIGITAL_OUT/ANALOG_OUT을 명시했습니다.
5. DRC·LVS·PEX를 각각 실행합니다. 배선한 RC 프로젝트는 **Simulation → Post-layout**로 실제 기생 netlist를 해석합니다.
6. 결과 선택에서 실제 corner/온도를 확인합니다. 숫자 전류는 실제 단자 측정이며, 분포 PEX 전류의 정확한 polygon 대응은 미검증/부분 지원 상태입니다.

블록을 복사 배치만 한 과거 assembly는 DRC 0이어도 LVS가 실패했습니다. 그 기록과 포트 순서 수정 전 파형을 별도 historical 실행으로 보존했습니다. 배선 완료 여부와 전기적 검증은 동일하지 않습니다.

## 반복 실행

```sh
npm run test:hardware:verify
npm run test:core
npm run typecheck
npm run build
npm run check:docs
npm run audit:source
```

모든 native 작업은 별도의 `.runtime/hardware/lab` Indust 워크스페이스를 사용합니다. 실제 도구와 공개 PDK가 설치되어 있어야 합니다. 원본 로그·VCD·GDS/OASIS·SPICE·실행 manifest는 [qualification](../examples/hardware-validation/qualification.json)에 연결되어 있습니다. 대규모 P&R·CTS·STA·상용 엔진·새 OS installer·제조 signoff는 이번 검증의 대상 결과가 아닙니다.

다운로드 크기를 제한하기 위해 중복 simulator `.raw` binary는 로컬에 보존합니다. 원본 voltage/current `.dat`, run 수치, VCD와 SPICE는 제공하며 생략 파일의 hash를 기록합니다. `project-input.json.gz`는 과거 run 이력만 제외한 파생 snapshot으로 원본 파일 hash와 구분합니다.
