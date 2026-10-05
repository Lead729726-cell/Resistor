# GDS / PDK 독립 뷰어와 전류 표시

레지스터 0.3은 설계 작업공간의 **GDS 뷰어** 버튼 또는 Windows 실행 파일의
`--viewer` 옵션으로 독립 뷰어를 엽니다. 웹 주소 뒤에 `?mode=viewer`를 붙여도
같은 모드로 열립니다. 독립 뷰어는 Docker, ngspice, 로그인 없이 파일을 기기에서
읽습니다. 파일을 클라우드에 업로드하지 않습니다.

**PDK·해석 설정**을 명시적으로 열면 별도 native 프로젝트로 GDS를 가져와
모델·추출 technology·포트·바이어스를 연결하고 실제 해석을 실행할 수 있습니다.
이 선택적 해석에는 Docker/native worker가 필요합니다.
[PDK 등록 및 설정 절차](pdk-setup.md)를 확인하세요.

Windows에서는 루트의 **Start-Viewer.cmd** 또는 배포 폴더의 **Open-Viewer.cmd**를
실행합니다. **뷰어 파일 열기**에서 `examples/sky130/current-viewer.register-view.json`을
열면 저장된 실제 MOS OP 결과 약 **36.24 µA**와 단자 경로를 바로 확인할 수 있습니다.
이 예제는 실제 해석 결과를 담은 파일이며, 열 때 새 시뮬레이션을 실행하지 않습니다.

```powershell
& 'D:\Coldbrew\Resistor\release\Register-win32-x64\Register.exe' --viewer
```

## 파일과 PDK

1. **GDS 열기**에서 실제 `.gds` / `.gdsii`를 선택합니다.
2. **SKY130 레이어 적용** 또는 **PDK 레이어 열기**로 `.lyp` / `.json`을 적용합니다.
3. 2D/3D, 레이어 숨김·색·투명도, 분해·단면, 계층 cell, 정확한 DBU 영역을 탐색합니다.
4. **뷰어 파일 저장**으로 `.register-view.json`을 만듭니다. 원본 GDS 포함 옵션을
   켜면 재개방 후 top cell과 표시 범위를 다시 바꿀 수 있습니다.

공개 SKY130A의 원본 LYP와 레이어 429개를 포함합니다. 다른 PDK의 layer/datatype,
이름, 색을 적용할 수 있으며 JSON은 표시 높이·두께도 지정할 수 있습니다.
PDK 전체 모델·PCell·검증 deck을 자동으로 실행하는 등록과 구분됩니다. 실제
시뮬레이션·DRC/LVS/PEX는 기존에 검증한 SKY130A native profile을 사용합니다.

```json
{
  "id": "my-process",
  "name": "사용자 PDK 레이어",
  "layers": [
    {"gds": [68, 20], "name": "metal1", "color": "#62a9ef", "opacity": 0.65,
     "z_display_um": 1.5, "thickness_display_um": 0.12}
  ]
}
```

높이가 없는 LYP는 현재 GDS에서 사용된 레이어 번호만으로 간격을 정합니다.
이 간격과 기본 SKY130 표시 두께는 illustrative 값이며 공정 단면의 실측값이
아닙니다. XML 외부 entity·DOCTYPE·실행 스크립트는 처리하지 않습니다.

독립 GDS reader는 정수 DBU boundary/box, contour bridge의 hole, 지원 PATH
종류 0/2/4, text, SREF/AREF, 회전·반사·확대와 계층을 읽습니다. 파일은 최대
64 MiB, 표시 도형은 최대 100,000개입니다. 순환/비정상 hierarchy는 거부합니다.
round PATH, absolute MAG/ANGLE, negative absolute PATH width, 다중 island
boundary 등 지원하지 않는 표현은 명시적으로 오류를 표시합니다. 비정수
변환 좌표는 표시할 때 가까운 DBU로 반올림하며 원본 bytes는 유지합니다.
OASIS 및 native 편집·교환은 기존 KLayout worker에서 처리합니다.

설계 작업공간의 **Import layout**에도 로컬 GDS/OAS file picker가 추가되었습니다.
이 기능은 실제 KLayout worker에 파일을 전달합니다. 독립 뷰어와 구분하여 최대
16 MiB, 선택적 hash-matched `.mos.json` sidecar는 2 MiB입니다.

## 실제 전류

설계에서 OP/DC/transient를 실행한 뒤 Layout 2D/3D의 **전류 결과**를 선택합니다.
가지 전류 표, 시간/DC sweep 슬라이더, 재생, 화살표 표시·배율·가지 선택과 경로
맞춤을 사용할 수 있습니다. **전류 JSON 저장** 또는 **뷰어 파일 저장**으로 실제
해석을 독립 뷰어에 가져갈 수 있습니다.

전류는 ngspice의 실제 0 V 직렬 sense-source 결과와 전압원 branch `i(V)`에서
읽습니다. 기존 전압 파형과 원본 PEX netlist를 보존하고 별도 probe 사본을
해석합니다. 양수는 conventional reference 방향, 음수는 역방향, 0은 방향
없음입니다. 전압원 `i(V)`는 + 단자에서 − 단자로 들어가는 부호를 그대로
사용합니다. MOS는 D→S를 drain-terminal reference로 사용하며 transient의
변위전류를 포함하므로 모든 drain 전류가 source로만 흘렀다는 뜻은 아닙니다.
근거: [ngspice 공식 manual](https://ngspice.sourceforge.io/docs/ngspice-manual.pdf).

실제 단자 label과 접점 drawing으로 확인한 single-MOS 경로에만 자동 화살표를
표시합니다. 추출된 MOS의 D/S 교환은 실제 resistor 연결 graph가 대응을 증명할
때 logical drain sense source를 선택합니다. 다른 회로나 임의 GDS의 위치를
추측하지 않으며 대응 없는 branch는 실제 수치만 표시합니다. 화살표는 단자
연결의 표시이며 도체 내부의 streamlines, 전류밀도 J, TCAD field가 아닙니다.
전류 벡터 Iₓ/Iᵧ는 지정된 표시 경로 첫 구간에 대한 branch 전류의 투영입니다.

결과와 scene의 project/revision이 다르면 화살표와 벡터 투영을 숨깁니다.
외부 전류 JSON의 경로는 사용자가 명시적으로 현재 GDS에 연결해야 하며
원본 대응을 자동 검증한 것으로 표시하지 않습니다. 추출 후 distributed R/C의 모든 가지 전류는 현재 생략하며 partial 상태를 표시합니다. 파일의 원래 provenance는
notes에 보존합니다. GDS 자체에는 전류가 들어 있지 않으므로 GDS만 열었을
때 전류를 생성하지 않습니다. AC는 복소 위상 결과이므로 현재 스칼라 방향
표시는 미지원으로 명시합니다.

## 검증

- 실제 SKY130 GDS 예제 5개: 도형 수, 단위, bounds 보존.
- importer 8건: hierarchy/array 변환, PATH, hole, ROI, malformed 입력과 PDK/XML 검증.
- viewer 17건: signed 방향, 0/missing, 미매핑, stale/project mismatch, AC guard 포함.
- 실제 native 전류 20건: MOS/inverter OP/DC/transient, pre/post PEX, 역방향
  전류원, 저항, 기존 파형 비교, 실행 중인 worker API 포함.
- 동시 해석 3건: 작업당 model-evaluation1 thread로 제한하며, 전압·전류
  값과 시간 간격을 유지합니다. 스레드8개의 중첩으로 느려졌던 원본 로그를
  보존했고 같은 W=1.3 인버터가 수정 후1.494초에 통과했습니다.
- 독립 브라우저 검증: RPC/auth/events 요청 없이 실제 GDS/LYP 열기, 2D/3D,
  읽기 전용, 명시적 경로 연결, 원본을 포함한 bundle 재개방.

추가 실행 파일 및 클라우드 검증 증거는 `docs/evidence`에 기록합니다.
