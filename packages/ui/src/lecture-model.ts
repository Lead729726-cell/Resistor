import type {Project, Run} from '@mos/contracts';
import {oscillatorLecturePlans} from './oscillator-lecture-plans';

export type LectureView = 'schematic'|'layout2d'|'layout3d'|'simulation';
export interface LectureStep {title:string;view:LectureView;minutes:number;action:string;notes:string;observe:string}
export type LectureExample='schematic'|'rc_lowpass'|'layout'|'inverter'|'osc_ring5'|'osc_rc_sensor'|'osc_beat'|'osc_burst';
export interface LecturePlan {id:string;title:string;requirements:string;example:LectureExample;steps:LectureStep[]}
export const lecturePlans:LecturePlan[] = [
  {id:'rc',title:'첫 강의 · RC 회로와 실제 신호',requirements:'기본 ngspice · PDK 없이 실행 가능',example:'rc_lowpass',steps:[
    {title:'회로의 목적과 연결',view:'schematic',minutes:2,action:'새 RC 데모를 만들고 IN → R1 → OUT, C1 → VGND 연결을 가리킵니다.',notes:'입력의 빠른 변화가 저항과 커패시터를 거쳐 어떻게 완만해지는지 보겠습니다. 핀과 노드 이름을 먼저 읽어 주세요. IN의 자극과 VGND 기준은 템플릿의 해석 설정으로 연결됩니다.',observe:'화면의 실제 R·C·단위와 해석 조건을 읽습니다. 아직 실행 결과는 없습니다.'},
    {title:'조건과 시간 상수',view:'schematic',minutes:2,action:'R1·C1 값을 선택해 읽고, 입력·클록 조건에서 펄스와 transient 구간을 확인합니다.',notes:'시간 상수는 τ=RC입니다. 현재 소자 값으로 직접 계산합니다. pulse 폭과 관찰 구간이 충분한지도 확인합니다.',observe:'수식의 예상값과 실제 해석의 조건을 구분합니다. 값 변경은 변경 적용 후 저장합니다.'},
    {title:'실제 해석 실행',view:'simulation',minutes:2,action:'Simulate를 누릅니다. queued/running/completed 또는 실패 원인을 실제 로그에서 확인합니다.',notes:'화면을 시뮬레이션 탭으로 바꾸는 것만으로 해석이 실행되지는 않습니다. 도구가 없으면 설치·연결 원인을 보여 줍니다.',observe:'프로젝트·revision·ngspice 출처·freshness를 확인합니다. 수치 해석 completed가 기능 PASS를 뜻하지는 않습니다.'},
    {title:'전압·전류·전압강하',view:'simulation',minutes:3,action:'파형 Lab에서 IN·OUT을 비교하고, 전류/전압강하의 단자와 부호를 읽습니다.',notes:'어느 두 노드의 전압 차인지, 전류의 기준 방향이 무엇인지 설명합니다. R이나 C를 바꾸면 이전 결과가 오래된 결과가 되는 것도 보여 주세요.',observe:'저장된 실제 파형만 읽습니다. 소자 단자 전류와 금속의 공간 전류 밀도는 다릅니다.'},
    {title:'복습과 재현 자료',view:'schematic',minutes:1,action:'조건·프로젝트·결과를 저장하고 강의 자료와 챕터 기록을 내려받습니다.',notes:'수강생은 자신의 환경에서 같은 조건으로 다시 실행합니다. τ를 두 배로 만들려면 R과 C 중 무엇을 바꿀지 과제로 남깁니다.',observe:'강의 진행 기록은 엔진 검증·제조 승인과 별도입니다.'}
  ]},
  {id:'layout',title:'레이아웃 직접 그리기 · 사각형부터 GDS',requirements:'KLayout · 실제 DRC/LVS에는 추가 도구·검증 deck 필요',example:'layout',steps:[
    {title:'레이어·좌표·격자',view:'layout2d',minutes:2,action:'새 빈 레이아웃을 만들고 레이어와 grid, DBU를 읽습니다.',notes:'우리가 그리는 것은 마스크의 XY입니다. 표시용 3D 높이는 보정된 공정 단면이 아닙니다.',observe:'프로젝트 단위·격자와 선택 레이어를 확인합니다.'},
    {title:'사각형과 배선',view:'layout2d',minutes:4,action:'R로 사각형, P로 다각형, W로 배선을 그리고 좌표·폭을 확인합니다.',notes:'드래그와 두 모서리 클릭을 번갈아 보여 주세요. Enter로 완료하고 Esc로 초안을 취소합니다.',observe:'좌표와 선폭은 정수 DBU 기반입니다. 도형 생성은 DRC PASS가 아닙니다.'},
    {title:'영역 선택·이동·복사',view:'layout2d',minutes:3,action:'A로 영역 선택합니다. 왼→오 포함, 오→왼 걸침, Shift 추가·Alt 제외, 이동·복사·Undo를 시연합니다.',notes:'작은 묶음을 먼저 선택해서 변화를 보여 주세요. 소자·계층에 연결된 도형은 보호 규칙에 따라 제한됩니다.',observe:'변경 전후 revision과 실제 도형 수·좌표를 확인합니다.'},
    {title:'2D와 3D, 결과의 한계',view:'layout3d',minutes:2,action:'3D로 전환해 쌓임을 보고 2D로 돌아갑니다. 실제 검증은 별도 실행임을 설명합니다.',notes:'표시 stack과 실제 비평탄 공정·coverage 해석을 혼동하지 않도록 범위를 말해 주세요.',observe:'미실행 DRC/LVS/PEX는 미실행 상태 그대로 설명합니다.'},
    {title:'파일 저장과 재검사',view:'layout2d',minutes:1,action:'GDS/OASIS를 내보내고 경로·프로젝트 저장 상태를 확인합니다.',notes:'수강생은 내보낸 파일을 다시 열어 좌표와 레이어를 비교합니다. 검증 도구와 승인 deck을 확인한 후 물리 검사를 수행합니다.',observe:'내보내기 성공과 제조 signoff는 별도입니다.'}
  ]},
  {id:'inverter',title:'CMOS 인버터 · 회로에서 파형까지',requirements:'공개 SKY130 PDK 모델 · ngspice',example:'inverter',steps:[
    {title:'상보 구조와 핀',view:'schematic',minutes:3,action:'새 인버터 데모를 만들고 NMOS/PMOS의 D·G·S·B와 VDD/GND를 읽습니다.',notes:'입력이 같아도 NMOS와 PMOS의 켜짐 조건은 다릅니다. W/L과 모델 이름을 함께 읽어 주세요.',observe:'PDK가 없으면 생성/해석 오류를 설명하고 RC 강의로 시작할 수 있습니다.'},
    {title:'입력·클록·부하',view:'schematic',minutes:3,action:'입력·클록 조건에서 전원·주기·rise/fall·부하와 해석 구간을 확인합니다.',notes:'조건을 바꾸면 새 revision으로 실제 해석을 다시 해야 합니다. 기존 파형을 새 결과처럼 보여 주지 않습니다.',observe:'모델·조건·revision을 말하고 저장합니다.'},
    {title:'Transient와 신호 반전',view:'simulation',minutes:4,action:'Simulate를 실제 실행하고 입력과 출력을 같은 시간축으로 비교합니다.',notes:'rail과 안정 구간, 전환 구간을 구분합니다. 실행 실패 시 로그에 나온 실제 원인을 설명합니다.',observe:'실제 저장된 waveform·current·도구 출처를 확인합니다.'},
    {title:'레이아웃과 다음 검증',view:'layout2d',minutes:3,action:'레이아웃과 핀·배선을 살펴보고 DRC/LVS/PEX의 역할을 소개합니다.',notes:'공개 예제의 구조와 현재 설계의 결과를 구분합니다. PEX 후 비교는 같은 자극과 조건으로 실행해야 합니다.',observe:'공개 모델 검사는 foundry signoff를 대신하지 않습니다.'},
    {title:'복습·수강생 과제',view:'schematic',minutes:2,action:'부하를 바꾸어 출력 전환을 비교하는 과제를 제시하고 재현 자료를 저장합니다.',notes:'지연을 예상한 뒤 실제 파형으로 비교하게 하세요. 조건과 한계를 함께 적도록 합니다.',observe:'예상값과 측정값을 별도로 기록합니다.'}
  ]}
];
lecturePlans.push(...oscillatorLecturePlans);
lecturePlans.push({id:'divider',title:'분압기 · 빈 회로에서 동작점까지',requirements:'기본 ngspice · 명시적 전원과 접지 · PDK 불필요',example:'schematic',steps:[
  {title:'빈 회로와 소자 배치',view:'schematic',minutes:3,action:'현재 준비된 회로를 읽거나 새 빈 데모에서 VDD 전압원과 저항 두 개를 배치합니다.',notes:'전압원 1.8V, 위아래 저항은 각각 10kΩ입니다. 새 데모는 빈 회로이며 직접 배치해야 합니다.',observe:'생성이나 화면 전환은 해석을 실행하지 않습니다.'},
  {title:'노드와 전압 기준',view:'schematic',minutes:3,action:'VDD+를 VDD, VDD−를 0, Rtop을 VDD→OUT, Rbottom을 OUT→0으로 연결합니다.',notes:'노드 이름이 같은 단자만 연결됩니다. Vout=Vin×Rbottom/(Rtop+Rbottom)=0.9V, I=1.8V/20kΩ=90µA를 예상합니다.',observe:'단위와 핀, 명시적 접지 0을 확인합니다.'},
  {title:'실제 OP와 비교',view:'simulation',minutes:3,action:'OP를 선택하고 실제 실행 후 OUT과 저항 양단 전압을 읽습니다.',notes:'실행 완료와 분석 판정은 다릅니다. 기준이 없는 일반 회로는 unknown일 수 있습니다. 전류는 실제 해석 항목 또는 해결된 전압과 저항으로 계산한 값을 구분해 설명합니다.',observe:'실제 OUT, 현재 revision, 로그를 읽고 미실행 물리 검증은 그대로 둡니다.'}
]});

export function lectureProjectRequest(plan:LecturePlan,commandId:string){
  const templates=new Set<LectureExample>(['rc_lowpass','osc_ring5','osc_rc_sensor','osc_beat','osc_burst']);
  return templates.has(plan.example)
    ? {method:'design.create_template' as const,params:{template_id:plan.example,name:'[강의] '+plan.title,command_id:commandId}}
    : {method:'project.create' as const,params:{example:plan.example,name:'[강의] '+plan.title}};
}

export function requestedLectureProject(search:string):string|null{
  const id=new URLSearchParams(search).get('project');
  return id&&/^[a-f0-9]{32}$/i.test(id)?id:null;
}

export interface LectureMarker {seconds:number;title:string;project_id:string|null;revision:number|null;view:LectureView}
export const lectureTime=(seconds:number)=>{const n=Math.max(0,Math.floor(Number.isFinite(seconds)?seconds:0));return [Math.floor(n/3600),Math.floor(n/60)%60,n%60].map(v=>v.toString().padStart(2,'0')).join(':');};
export function chapterText(markers:LectureMarker[]):string {
  return markers.map(m=>`${lectureTime(m.seconds)} ${m.title.replace(/[\r\n]/g,' ')}`).join('\n')+'\n';
}
export function lectureHandout(plan:LecturePlan,edition:string,notes:string):string {
  return `# ${plan.title}\n\n${edition} · 강사용 진행안 · 목표 ${plan.steps.reduce((n,s)=>n+s.minutes,0)}분\n\n필요한 도구: ${plan.requirements}\n\n`+
    plan.steps.map((s,i)=>`## ${i+1}. ${s.title} (${s.minutes}분)\n\n조작: ${s.action}\n\n설명: ${s.notes}\n\n관찰·한계: ${s.observe}\n`).join('\n')+
    `\n## 내 강의 메모\n\n${notes}\n\n## 녹화 설정\n\n- OBS: 캔버스/출력 1920×1080, 30fps, 창 캡처로 Resistor만 선택. 실제 소스 크기에 맞춰 화면 비율을 확인합니다.\n- 브라우저 녹화: 화면과 선택한 마이크를 권한 창에서 승인한 뒤 시작합니다. 실제 해상도와 fps는 녹화 기록에서 확인합니다.\n- 강사 메모를 별도 창에 열고, OBS/브라우저는 앱 창만 녹화합니다.\n- 짧은 샘플을 녹화·재생해 글자·목소리·노출 영역을 확인한 뒤 본 강의를 촬영합니다.\n- 녹화 파일과 챕터/세션 기록은 각각 내려받아 보관합니다. 페이지를 닫거나 새로고침하면 저장 전 영상이 사라집니다.\n\n강의 단계 이동과 학습 완료는 실제 엔진 실행, DRC/LVS/PEX PASS 또는 제조 승인이 아닙니다.\n`;
}
export function lectureEvidence(project:Project|null,runs:Run[]) {
  return {project:project?{id:project.id,name:project.name,revision:project.revision}:null,
    runs:runs.filter(r=>r.project_id===project?.id).map(r=>({id:r.id,revision:r.revision,tool:r.tool,execution_status:r.execution_status,analysis_result:r.analysis_result,freshness:r.freshness,current_revision:r.revision===project?.revision})),
    lecture_progress_is_engine_verification:false};
}
