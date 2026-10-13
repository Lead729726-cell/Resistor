# GDS ⇄ 회로도 · 규격 배치

앱에서 **설계 도구 → 통합 설계 → GDS ⇄ 회로도 · 규격 배치**를 엽니다. 실제 엔진이 별도 미리보기를 만들고, 연결·치환값·배치를 확인한 뒤 새 revision으로 적용합니다. 기존 설계는 history와 Undo에 남습니다. 설정·원본·PDK·revision이 바뀐 미리보기는 적용되지 않습니다.

## GDS/OASIS에서 편집 회로도로

1. 파일·PDK 메뉴에서 원본 GDS/OASIS를 가져옵니다. sidecar 없이 가져온 파일도 지원합니다.
2. 변환 탭에서 **GDS → 회로도**, 추출 PDK와 실제 top cell을 선택합니다.
3. 미리보기 생성은 실제 마스크 도형을 Magic의 PDK 소자 인식·연결 추출 규칙으로 읽습니다. 저장된 회로도나 도형의 net/device 속성으로 복원 결과를 만들지 않습니다.
4. 추출된 SPICE와 편집 가능한 심볼 graph를 실제 Netgen으로 비교합니다. 지원 밖 소자·식·포트 또는 비교 실패가 있으면 적용이 차단되고 원문·로그를 유지합니다.
5. 편집 회로도와 도형 미리보기를 확인하고 적용합니다. 이후 원래 설계에 대한 DRC/LVS/PEX는 각각 실행합니다. 전류·전압 해석에는 해석 설정에서 입력·전원·바이어스를 지정해야 합니다.

SKY130A의 검증된 `nfet_01v8`, `pfet_01v8_hvt`, `res_xhigh_po_1p41`, `cap_mim_m3_1`을 편집 심볼로 복원합니다. compatible Magic deck를 가진 다른 등록 PDK도 원문 추출을 시도할 수 있지만 검증되지 않은 모델은 편집 적용을 차단합니다. high-poly 0.35µm 모델의 nominal R 보정, 다른 소자 모델, `nf/m≠1`, 버스 포트 이름 등은 원문에 남기고 미지원으로 보고합니다. 모델을 다른 소자로 치환하거나 임의의 ground/body 연결을 만들지 않습니다.

원래 심볼 배치·설계 의도·원본 전기 계층은 GDS에 없습니다. 복원은 flat transistor/passive graph이며, 정확한 device-terminal-to-polygon 대응은 제공하지 않습니다. Junction 면적·둘레 등 추가 추출 파라미터는 원문 SPICE에 남습니다. 편집 심볼의 W/L 연결 비교는 전체 시뮬레이션 동등성을 뜻하지 않습니다. 모델 R/C의 표시 value는 공칭 기하 크기 추정이며 실제 PDK 모델이 권위 있는 계산입니다.

## 회로도에서 규격 레이아웃으로

1. 회로도를 작성하거나 template를 엽니다. 기하 배선으로 그린 회로는 실제 연결을 먼저 검증합니다.
2. **회로도 → 레이아웃**에서 가로·세로(µm), 최대 면적(µm²), 여백(µm)을 입력합니다. 정사각형·가로형·세로형 preset도 있습니다.
3. 왼쪽/오른쪽 핀 채널은 수평 행, 위/아래 핀 채널은 수직 행입니다. 원본 순서·회로도 좌표·소자 종류 순서 중 선택합니다. 매칭 그룹의 내부 순서는 유지합니다.
4. 실제 SKY130 MOS/poly/MIM PCell과 배선을 생성합니다. 원래 W/L을 유지하며 축소·자르기로 면적을 맞추지 않습니다. 영역이 부족하면 원본을 그대로 두고 실제 오류를 표시합니다.
5. 이상 저항·커패시터의 기하 치환과 외부 전압원·전류원 목록을 확인합니다. 저항 body 연결은 실제 회로의 net으로 명시합니다. 승인·적용 후 DRC/LVS/PEX를 각각 실행합니다.

현재 지원은 1–512개 primitive의 rectangular envelope와 bounded M3/M4 routing입니다. 전압·전류원은 칩 내부 PCell이 아닌 외부 테스트벤치 대상으로 표시합니다. 개별 핀의 임의 위치, 비사각형 die, 임의 고밀도 placement, pad ring, full timing closure·yield·제조 승인은 포함하지 않습니다. 원본 계층은 history에 남고, 적용된 실제 물리 graph는 펼친 형태입니다.

## 엔진과 도구 인터페이스

- `conversion.catalog`: PDK·모델·지원 범위
- `conversion.reverse` / `conversion.forward`: revision-bound 실제 작업 생성
- `job.status` / `job.logs` / `job.cancel`: 상태·원본 로그·취소
- `conversion.result`: 실제 미리보기·소자·포트·치환 기록
- `conversion.apply`: 정확한 preview hash를 새 revision으로 적용

MCP에도 `register_recover_schematic`, `register_generate_layout`, `register_conversion_result`, `register_conversion_apply`를 제공합니다. conversion job의 `analysis_result=unknown`은 물리 검증 미실행을 뜻합니다. `parser_equivalence=pass`는 추출 graph를 편집 graph로 옮긴 비교이며 원래 설계의 LVS PASS로 표시하지 않습니다.

공식 엔진 문서: [Magic ext2spice](https://github.com/RTimothyEdwards/magic/blob/master/doc/html/ext2spice.html), [KLayout 정수 변환](https://www.klayout.de/doc/code/class_Trans.html). 배포 인증과 foundry signoff는 별도입니다.
