# 원본 DB 읽기와 설계 검토

**원본 DB 읽기**는 native reader를 통해 실제 library / cell / view를 조회하는 화면입니다. 화면을 여는 것만으로 worker 호출, 로그인, 파일 업로드를 시작하지 않습니다. **설치 도구 / 등록 소스 확인**을 누르면 실제 reader 상태와 operator가 등록한 소스를 조회합니다.

로컬 operator는 source ID, 이름, reader, library, view, 설치된 실행 파일과 원본 DB 디렉터리를 입력합니다. 기존 worker 환경변수는 이름만 참조하며 값을 입력하지 않습니다. 포함된 고정 read-only query로 reader profile을 등록하므로 코드, SKILL / Tcl script 또는 shell argument를 작성할 필요가 없습니다. 이미 등록된 operator reader profile을 고급 참조로 사용할 수도 있습니다. 원본 Cadence / Synopsys DB 접근에는 해당 도구와 SDK / 라이선스 환경이 필요합니다. 라이선스 값 또는 토큰을 화면에 입력하지 않습니다. 원본 DB를 읽을 수 없는 환경에서는 unavailable 상태와 실제 진단을 표시합니다. 공유 프로젝트는 operator가 해당 project ID에 바인딩한 source만 사용할 수 있습니다.

KLayout file reader는 공개 GDS/OAS를 읽는 별도 검사 경로입니다. 이 경로의 성공은 OA / NDM 또는 상용 vendor 실행 검증을 의미하지 않습니다. source의 실제 파일과 hash, reader 상태를 확인하고 library / cell / view 목록을 조회한 다음 **선택한 view 읽기**를 누릅니다. 읽기 receipt와 graph는 원본을 수정하지 않는 snapshot입니다. receipt JSON을 저장하고 checks / diagnostics를 확인할 수 있습니다.

프로젝트 적용은 실제 geometry graph가 있는 읽기 receipt에 한해 명시적으로 실행합니다. 기존 프로젝트에는 새 revision으로 적용하고, 로컬 뷰어에서는 별도 프로젝트를 만듭니다. 바뀐 source / cell / view 또는 source hash로 이전 receipt를 그대로 적용하지 않습니다. native validator는 적용 시점에도 receipt와 입력을 다시 검사합니다. 가져온 geometry가 전기적 해석 조건이나 signoff 결과를 자동으로 만들지는 않습니다.

**설계 검토**는 현재 로드한 scene에서 검색, 정수 DBU 거리 측정, 위치 bookmark, snapshot 비교 및 실제 결과 CSV 내보내기를 제공합니다. 부분 표시된 scene의 비교는 전체 설계 비교로 표시하지 않습니다. bookmark와 기준 snapshot은 project / revision / 표시 범위를 유지하며, 다른 설계 또는 stale 결과는 명시적으로 구분합니다.

검증 기록은 focused browser 검사가 완료된 뒤 `docs/evidence/native-database-ui.json`에 저장합니다. 공개 GDS를 사용하는 검사는 open-source reader 검사로 표시하며, 상용 tool 검증 여부를 별도로 기록합니다. 로컬 설계 검토 검사는 공개 wire GDS의 3개 형상을 사용하여 RPC 0회, 도형 선택 연결, 큰 정수 좌표에서 500 DBU / 0.5 µm 거리, 북마크 재개방과 잘못된 revision 거부, 부분 scene의 실제 정수 윤곽 차이 1건, stale 외부 전류 CSV의 -0.001 / 0 / +0.001 A 보존을 확인했습니다.

Focused UI 검사는 3/3, 11.8초에 통과했습니다. 실제 미설치 Virtuoso source는 unavailable / 0개 cell로 반환됐고, 허용되지 않은 `/etc/forbidden.gds` 등록은 거부됐습니다. 공개 KLayout 0.30.5 reader는 wire의 5개 source object를 포함한 graph를 반환했으며, 다운로드한 artifact의 SHA256과 receipt가 일치했습니다. 명시적 확인 후 별도 프로젝트 r2에 3개 polygon을 가져왔고 원본 로컬 GDS를 뷰어 파일에 따로 보존했습니다. 이 결과는 상용 OA / NDM 실행 검증을 의미하지 않습니다. 등록 오류를 고정 영역에 표시한 뒤 해당 진단 검사를 1/1, 3.0초에 재검증했고 TypeScript도 통과했습니다.
