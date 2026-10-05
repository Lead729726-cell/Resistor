# EDA 파일 호환 · v0.6

**EDA 파일 호환**은 다른 EDA에서 내보낸 실제 설계·PDK 표시·회로·결과 파일을
레지스터에서 읽고, 지원하는 교환 형식으로 다시 저장하는 기능입니다.
상용 실행기를 연결하는 **상용 Backend**와 별도로 사용할 수 있습니다.

## 가져오기 절차

1. 설계 화면이나 독립 뷰어에서 **EDA 파일 호환**을 열고 원본 도구를 선택합니다.
2. GDS/OAS, DEF와 필요한 LEF, stream layer map, PDK 기술·표시 파일,
   라이브러리 정의, CDL/SPICE 또는 해석 결과를 함께 선택합니다.
3. 파일별 검사 결과에서 실제 layer/datatype, cell, subcircuit port,
   라이브러리 참조 및 지원하지 않는 구문을 확인합니다.
4. 레이어 표시는 **PDK 레이어 적용**으로 뷰어에 적용합니다. GDS는 독립 뷰어에서
   즉시 열 수 있습니다. 이 로컬 작업에는 Docker나 서버 업로드가 필요하지 않습니다.
5. Native 설계 반입은 KLayout worker에서 검사한 뒤 현재 프로젝트에 적용합니다.
   LEF/DEF는 업로드한 tech/macro LEF와 명시적 GDS layer map을 사용합니다.
   실제 cell layout이 있으면 함께 제공한 GDS/OAS macro로 연결합니다.
6. GDSII/OASIS 또는 보존된 CDL/SPICE를 내보냅니다. 반입 revision과 파일 hash를
   기록하며, 같은 command ID를 재전송해도 같은 설계를 두 번 반입하지 않습니다.

## 형식별 범위

| 입력 | 레지스터가 처리하는 내용 | 확인해야 할 범위 |
|---|---|---|
| GDSII / OASIS | KLayout geometry·hierarchy·DBU 반입/내보내기; GDS는 로컬 뷰어에서도 읽기 | 공정 두께·전류는 이 파일만으로 제공되지 않음 |
| LEF / DEF | KLayout native reader의 배치·배선·via·pin과 명시적 layer map | Macro LEF는 abstract; 제조용 cell geometry는 해당 GDS/OAS가 필요 |
| Cadence stream layer map | Layer/purpose와 GDS layer/datatype의 연결, 텍스트 내보내기 | 내부 technology layer 번호를 GDS 번호로 추정하지 않음 |
| Cadence ASCII techfile / display.drf | 기술 레이어·purpose·stream mapping·표시 packet metadata | SKILL 실행, PCell 실행, rule deck 실행과 구별 |
| Synopsys ASCII technology `.tf` | 확인한 brace 형식의 Layer·Color와 표시 metadata | 내부 layerNumber는 GDS 번호가 아님; 별도 stream map으로 연결 |
| cds.lib / lib.defs | DEFINE 및 include 참조 metadata | 참조 경로·환경 변수·함수를 실행하거나 PC 파일을 자동 탐색하지 않음 |
| CDL / classic SPICE | Subcircuit·port·device/model 참조·계층 metadata, 원문과 AST 보존 | 원본 model 이름을 SKY130 model로 자동 치환하지 않음; Spectre 언어 전체와 구별 |
| 명시적 열 CSV / table | 선택한 축·단위·signed branch current와 파형 | 전류 기준 terminal과 unit을 입력; 공간 대응은 별도 |
| PSF ASCII / HSPICE LIS | 지원하는 scalar 파형/명시적 측정 항목 | Binary PSF, FSDB, TR0는 해당 도구에서 텍스트로 내보내기 필요 |
| SPEF / DSPF / SPICE RC | 지원하는 기생 R/C 결과 읽기 | 모든 extraction dialect 및 임의 shape별 대응을 의미하지 않음 |
| Calibre summary / normalized exchange | 완결된 지원 summary와 명시적 결과 데이터 | 원본 result DB 전체 해석이나 실제 signoff 실행 검증과 구별 |

Virtuoso·Custom Compiler는 공통 GDS/OAS/CDL 및 공개 ASCII 기술/표시 교환 흐름을,
Innovus·IC Compiler·ICC2·Fusion Compiler는 GDS/OAS·LEF/DEF 및 해당 추출 결과를
사용합니다. Assura·Pegasus·ICV·Calibre의 기술 deck과 raw 결과 DB는 각 도구의
원본 형식이므로, 지원하는 공개 교환 출력과 별도로 취급합니다.
도구 선택은 source metadata이며 그 프로그램의 모든 버전·모든 입력 형식의 인증이 아닙니다.

## 실제 전류 결과

외부 결과의 열과 단위, 기준 from/to terminal을 지정해서 읽습니다.
수치의 양·음 부호를 그대로 유지하며 양의 값은 지정한 from → to 기준입니다.
음의 값은 반대 방향입니다. 전자 흐름 보기에서는 기존 뷰어의 방향 표시를 반전합니다.
이 기능은 파일에 들어 있는 해석 결과를 표시합니다. GDS에서 전류를 계산하지 않습니다.

외부 결과 이력은 `workflow=imported-results`, `source=imported`로 저장합니다.
파일에 Spectre 등의 이름이 있어도 실제 vendor 실행을 검증했다고 표시하지 않습니다.
Layout과 자동으로 물리적 대응을 확인하지 못한 branch는 수치 표에서 볼 수 있으며,
사용자가 명시적으로 지정한 경로에만 벡터를 표시합니다.

## 공동 설계

공유 프로젝트의 owner/editor가 실제 파일을 반입하고 결과를 추가할 수 있습니다.
Viewer는 검사·열람·내보내기가 가능합니다. 프로젝트 전체를 바꾸는 반입은
현재 revision에 적용하며, 다른 참여자가 먼저 수정하면 기존 입력을 보존하고 충돌을 표시합니다.
다른 방의 프로젝트·실행 이력에는 접근할 수 없습니다.
Native 업로드는 파일당 16 MiB, 전체 32 MiB, 최대 32개입니다.
구조를 해석하는 전기적 문서 closure는 전체 2 MiB 이하입니다.

## Native database

OA, Milkyway, NDM, binary PSF/FSDB/TR0 자체의 임의 binary decoding은 제공하지 않습니다.
OpenAccess는 별도 SDK/API와 native library 환경을 사용합니다. 실제 설치·라이선스가
있는 서버에서는 기존 native exporter/agent를 통해 교환 파일을 만들고 이 기능으로 반입합니다.
현재 환경에는 해당 상용 프로그램이 설치되어 있지 않으며 실제 vendor 실행 검증은 남아 있습니다.

구현 근거: [KLayout LEF/DEF reader](https://www.klayout.de/doc/code/class_LEFDEFReaderConfiguration.html),
[Cadence LEF/DEF specification](https://www.ispd.cc/contests/18/lefdefref.pdf),
[Si2 OpenAccess](https://si2.org/openaccess-coalition/),
[Synopsys Custom Compiler](https://www.synopsys.com/content/dam/synopsys/implementation%26signoff/datasheets/custom-compiler-ds.pdf),
[공개 PDK 작성자의 Cadence/Synopsys 기술 파일](https://github.com/YZU-EDALAB/asap7_bb_pdk/tree/b59d47b094c5b17a9b3b1b072834c246a0b64c4f/tf).
실제 로컬 source-format 검사와 native round trip의 증거는 `docs/evidence/interchange*.json`에 기록합니다.
