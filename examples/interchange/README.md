# 레지스터 EDA 파일 호환 예제

모든 파일은 직접 작성한 **synthetic 예제**입니다. 상용 EDA 실행 결과, foundry PDK, 실제 시뮬레이션 전류, signoff 검증 자료가 아닙니다. 전류 CSV의 -1/0/1 mA는 파서와 부호 표시를 확인하기 위한 숫자입니다.

호환 탭에서 fixture.tf, display.drf, fixture.layermap을 함께 열면 명시적 LPP → GDS 연결과 RGB 표시를 확인할 수 있습니다. techLayers 내부 번호 100/200과 실제 스트림 번호 17/8은 의도적으로 다릅니다. stream.layermap은 지원되는 단일 맵 레코드의 정규화 내보내기입니다. display-pdk.json은 표시 profile이며, compatibility-bundle.json에는 원본과 미지원 규칙/레코드가 함께 보존됩니다. 높이와 두께는 표시용이며 물리 공정 stack을 의미하지 않습니다.

synopsys.tf는 공개 PDK 제작자가 배포한 ICC2 Technology/Color/Layer 형태에서 확인한 데이터 구문을 사용한 직접 작성 예제입니다. units·레이어 표시 정보만 읽고, minSpacing/unitNomThickness 등 규칙/물리 값은 원문 메타데이터로 보존합니다. 내부 layerNumber를 GDS로 추정하지 않습니다.

cds.lib / lib.defs는 경로 문자열과 라이브러리 참조의 메타데이터 예제입니다. 외부 파일이나 환경 변수는 자동으로 읽거나 확장하지 않습니다. fixture.cdl에는 미지원 control/include 예제가 남아 있으므로 로컬 메타데이터 검사 용도입니다. demo.cdl은 이러한 구문을 제거한 독립적인 소자 모델/회로 문서 예제로 native 가져오기에 사용할 수 있습니다. 포트 순서는 OUT, IN, VDD, VSS를 그대로 유지합니다.

currents.csv는 example-schema.json의 명시적 column/unit/from/to/conventional 설정으로 가져오세요. SI 단위로 변환되며 전류는 source=imported, input_origin=imported-file, geometry_linkage=unverified, mapping=unmapped입니다. imported-current.json도 같은 직접 작성 데이터를 담습니다. 경로를 사용자가 지정하기 전에는 GDS 전류 화살표가 생기지 않습니다.

tiny.lef / tiny.def / layer-map.json은 실제 KLayout regression에서 읽기와 GDS/OAS roundtrip을 검증한 synthetic LEF/DEF 예제입니다. CHIP top, INV macro 두 instance, A/Y/IN/OUT pin, in/mid/out net이 있습니다. Native 프로젝트 적용에서 tiny.lef와 tiny.def를 선택하고 layer-map.json 내용을 명시적 layer map으로 지정하세요. 상용 도구에서 생성된 파일이라는 뜻은 아닙니다.

지원 범위: 명시적 4열 Cadence stream map, Cadence ASCII tech/DRF 데이터, 제한된 Synopsys ASCII scalar block, 라이브러리 참조, CDL/SPICE metadata, 명시적 SI 전류/파형 표, native GDS/OAS/LEF/DEF 교환. OA/NDM/Milkyway/binary PSF/암호화 DB는 이 예제로 직접 해석되는 형식이 아닙니다. 소유 도구에서 지원 형식으로 내보내야 합니다.

원본 public source와 별도 실제 파서 증거:

- https://github.com/YZU-EDALAB/asap7_bb_pdk (BSD-3-Clause; 원본 전체 파일은 이 묶음에 복사하지 않았습니다.)
- tests/commercial/interchange/primary-evidence.json (실제 공개 source 파일 SHA-256와 레이어 수)
- workers/eda/test_interchange.py (실제 KLayout 문서 검증; vendor execution은 별도)

`node --import tsx tests/commercial/interchange-example.ts`로 묶음을 재생성할 수 있습니다.
