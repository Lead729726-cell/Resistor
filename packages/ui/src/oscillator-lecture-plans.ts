import type {LecturePlan} from './lecture-model';

export const oscillatorLecturePlans:LecturePlan[]=[
  {id:'osc-ring',title:'발진기 실습 · 5단 CMOS 링',example:'osc_ring5',requirements:'최신 소스 adapter · 공개 SKY130 모델 · ngspice',steps:[
    {title:'결과와 오늘의 질문',view:'schematic',minutes:1,action:'새 링 발진기 데모를 만들고 OUT→Q0→Q1→Q2→Q3→OUT 연결을 읽습니다.',notes:'외부 입력 클록이 없습니다. 다섯 번의 반전과 실제 소자의 지연으로 신호가 계속 바뀌는지 확인하겠습니다.',observe:'초기 조건은 해석 기동을 위한 설정입니다. 실제 잡음에 의한 기동·지터 검증과 구분합니다.'},
    {title:'MOS와 단계 부하',view:'schematic',minutes:2,action:'NMOS·PMOS의 모델과 W/L, 각 2pF 부하를 확인합니다.',notes:'커패시터를 충전하고 방전하는 데 시간이 걸립니다. 단계 부하가 커지면 주파수가 어떻게 바뀔지 먼저 예상해 보세요.',observe:'C의 단위는 F입니다. 각 단계의 부하와 앱의 공통 testbench 부하를 혼동하지 않습니다.'},
    {title:'실제 발진 해석',view:'simulation',minutes:3,action:'기본 TRAN 조건으로 Simulate를 실행하고 Q0·Q1·OUT을 같은 시간축에 놓습니다.',notes:'이번 실행의 corner·전원·온도·revision을 먼저 읽습니다. 단계마다 신호가 바뀌고 한 바퀴를 도는 시간을 확인합니다.',observe:'미실행·진행·완료·실패를 실제 엔진 상태 그대로 말합니다.'},
    {title:'주파수와 전력 읽기',view:'simulation',minutes:3,action:'완전한 여러 주기의 교차점, 듀티와 공급 전류를 읽습니다. 4pF 프로젝트와 비교합니다.',notes:'주파수는 실제 주기에서 측정합니다. T/10은 다섯 단계가 같다고 가정한 평균 지연의 환산값입니다. 측정된 주기 변동을 확률적 지터라고 부르지 않습니다.',observe:'같은 조건·같은 관측 구간으로 비교합니다. 편집 전 파형은 과거 revision입니다.'},
    {title:'과제와 저장',view:'schematic',minutes:1,action:'부하 두 조건의 프로젝트와 측정표를 따로 저장합니다.',notes:'부하를 두 배로 했을 때 주파수가 정확히 절반인지 직접 판단해 보세요. 기생 성분과 실제 MOS 때문에 이상적인 비례식과 차이가 날 수 있습니다.',observe:'회로도 실습입니다. 레이아웃·DRC/LVS/PEX·위상 잡음은 별도 검사입니다.'}
  ]},
  {id:'osc-sensor',title:'센서 실습 · 정전용량을 주파수로',example:'osc_rc_sensor',requirements:'최신 소스 adapter · 공개 SKY130 모델 · ngspice',steps:[
    {title:'센서가 읽는 물리량',view:'schematic',minutes:1,action:'새 센서 데모를 만들고 C_SENSOR와 OUT·CAP·HYST·SUM 노드를 가리킵니다.',notes:'오늘 센서는 실제 손가락 모델이 아니라 정전용량 변화를 주파수로 바꾸는 회로 원형입니다. 무엇을 입력으로 바꾸고 무엇을 출력으로 읽을지 정합니다.',observe:'외부 R/C는 이상적인 부품입니다. 실물 전극·주변 환경·보정은 포함하지 않습니다.'},
    {title:'충방전과 양의 피드백',view:'schematic',minutes:2,action:'R_TIMING=100kΩ, C_SENSOR=10pF와 저항 피드백의 연결을 읽습니다.',notes:'커패시터 전압이 변하고, 피드백이 서로 다른 두 전환 전압을 만듭니다. 임계값을 전원 전압의 1/3과 2/3이라고 미리 가정하지 않겠습니다.',observe:'τ=RC는 기준 시간입니다. 실제 발진 주기는 두 전환 전압과 회로 부하에도 영향을 받습니다.'},
    {title:'CAP과 OUT의 실제 파형',view:'simulation',minutes:3,action:'TRAN을 실행해 CAP 충방전과 OUT 전환을 겹쳐 봅니다.',notes:'OUT이 바뀌는 순간의 CAP 전압을 실제 표본에서 읽습니다. 전압의 기준 노드와 시간 단위도 함께 읽어 주세요.',observe:'주파수·전환 전압·공급 전력은 현재 실행의 저장된 표본에서 계산합니다.'},
    {title:'5·10·20pF 비교',view:'simulation',minutes:3,action:'별도 프로젝트에서 센서 C 세 조건을 실행하고 주파수 표를 채웁니다.',notes:'C가 커지면 주파수가 줄어드는지 먼저 보겠습니다. 실제 MOS와 피드백 때문에 정확한 1/C 관계를 강제하지 않고 측정된 변환 특성을 보관합니다.',observe:'기존 참조 수치가 내 실행의 정답은 아닙니다. 조건·소스·revision이 같은지 확인합니다.'},
    {title:'실물 센서로 가려면',view:'schematic',minutes:1,action:'측정표에 전극·기생·잡음·보정 등 추가 검증 항목을 적습니다.',notes:'회로가 변화를 읽는다는 것과 실물 센서가 정확하다는 것은 각각 검증해야 합니다. 이번 과제는 조건과 한계를 포함한 센서 변환 표입니다.',observe:'과제 완료 표시와 실제 엔진 판정은 별개입니다.'}
  ]},
  {id:'osc-beat',title:'센서 실습 · 두 발진기의 비트 검출',example:'osc_beat',requirements:'최신 소스 adapter · 공개 SKY130 모델 · ngspice',steps:[
    {title:'빠른 두 신호의 차이',view:'schematic',minutes:1,action:'독립 링 두 개와 PHASE_DETECTOR, R/C 필터를 확인합니다.',notes:'기준 링과 센서 링의 주파수가 조금 다릅니다. XOR 출력을 평균해 더 느리게 반복되는 차이 신호를 읽겠습니다.',observe:'외부 클록이나 합성한 출력 파형을 사용하는 구조가 아닙니다.'},
    {title:'하위 셀과 연결',view:'schematic',minutes:2,action:'REFERENCE_RING·SENSOR_RING의 하위 MOS와 C를 보고 상위 포트로 돌아옵니다.',notes:'계층은 회로를 숨기는 기능이 아니라 같은 블록을 연결해서 이해하는 방법입니다. 내부 이름과 상위 REF·SENSE 포트가 어떻게 이어지는지 읽습니다.',observe:'핀 이름을 눈으로 추정하지 말고 실제 명시된 포트 연결을 확인합니다.'},
    {title:'네 신호 비교',view:'simulation',minutes:3,action:'실제 해석 후 REF·SENSE·XOR·OUT을 같은 시간축에서 확인합니다.',notes:'OUT에는 반송파 리플이 남습니다. 필터 출력의 중간값을 지나갈 때마다 세면 주기를 중복 집계할 수 있습니다.',observe:'실제 출력 범위를 이용한 히스테리시스 교차 측정 방법을 결과와 함께 설명합니다.'},
    {title:'차이 주파수 대조',view:'simulation',minutes:3,action:'측정된 fREF·fSENSE의 차이와 OUT의 비트 주파수를 대조합니다.',notes:'비교식은 |fREF−fSENSE|입니다. 필터와 관측 시간이 적절한지, 충분한 완전 주기가 있는지도 검사합니다. 실패하면 수치를 고치지 말고 조건을 다시 봅니다.',observe:'10% 이내 일치라는 명시된 참조 기준과 모든 센서 사양 충족을 구분합니다.'},
    {title:'응용 과제',view:'schematic',minutes:1,action:'센서 링 C 증가율을 바꾸고 필터 조건과 관측 구간을 기록합니다.',notes:'차이가 작아지면 더 긴 시간이 필요할 수 있습니다. 파형이 느려지는 것과 측정이 정확해지는 것이 항상 같은 뜻인지 생각해 보세요.',observe:'레이아웃 기생·잡음·실물 보정은 이번 과제의 미측정 항목입니다.'}
  ]},
  {id:'osc-burst',title:'저전력 실습 · 이벤트 버스트 클록',example:'osc_burst',requirements:'최신 소스 adapter · 공개 SKY130 모델 · ngspice',steps:[
    {title:'필요할 때만 켜는 클록',view:'schematic',minutes:1,action:'NAND와 인버터 4단, 외부 EN과 OUT을 확인합니다.',notes:'EN은 외부에서 주는 제어 입력입니다. 실제 MOS 링이 이 입력에 따라 시작하고 정지하는지 두 번 반복해서 보겠습니다.',observe:'EN의 PWL 입력을 발진기 자체가 만든 신호라고 설명하지 않습니다.'},
    {title:'허용과 정지 경로',view:'schematic',minutes:2,action:'NAND의 A0·A1 포트와 OUT 피드백을 확인합니다.',notes:'같은 기능의 게이트라도 포트 이름은 다를 수 있습니다. 이번 NAND의 실제 핀 이름으로 EN과 피드백이 연결돼 있는지 읽습니다.',observe:'회로 연결이 유효한 것만으로 발진 동작을 보장하지 않습니다.'},
    {title:'시작·정지·재시작',view:'simulation',minutes:2,action:'EN·OUT을 겹쳐 첫 실행, 중간 정지, 두 번째 실행, 최종 정지를 확인합니다.',notes:'꺼진 구간은 OUT이 HIGH에 머무르는 구조입니다. 첫 번째만 잘 켜지는 회로인지, 다시 켜져도 잘 동작하는지 나누어 봅니다.',observe:'전환 직후 안정화 시간과 실제 관측 구간을 구분합니다.'},
    {title:'구간별 전력',view:'simulation',minutes:2,action:'공급 전류와 활성·정지 구간의 평균 전력을 비교합니다.',notes:'Pavg는 VDD와 실제 공급 전류의 시간 적분으로 구합니다. 외부 EN 드라이버 전력은 이 수치에 포함하지 않습니다.',observe:'정지 구간이 짧거나 부하가 다르면 절감 비율을 그대로 비교하지 않습니다.'},
    {title:'완성 과제와 한계',view:'schematic',minutes:1,action:'시작·정지 검사와 전력 비교를 최종 보고서에 정리합니다.',notes:'이번 결과는 정해진 EN 입력의 동작입니다. 임의 시점의 enable에 대한 최소 펄스 폭이나 완전한 glitch-free clock-gating timing 검증은 남아 있습니다.',observe:'실습 결과와 실무 클록 셀·제조 승인 범위를 구분해 제출합니다.'}
  ]}
];
