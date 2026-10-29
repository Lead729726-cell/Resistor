import {calculators,type CalculatorResult} from '../../calculators/src/index';
export const courseRevision='edu-first-circuits-2026-10-27.1';
export type Mission={id:string;title:string;goal:string;calculator:string|null;inputs:{id:string;label:string;unit:string;initial:number;changed?:number}[];question:string;diagnosis:string;app:string};
export const courseMissions:Mission[]=[
 {id:'divider',title:'01 · 같은 저항 두 개',goal:'IN → R1 → OUT → R2 → GND를 연결하고 OUT 전압을 예측합니다.',calculator:'voltage-divider',inputs:[{id:'vin',label:'입력 전압',unit:'V',initial:1.8},{id:'r1',label:'위쪽 R1',unit:'Ω',initial:10000},{id:'r2',label:'아래쪽 R2',unit:'Ω',initial:10000,changed:20000}],question:'R2만 커지면 OUT은 어느 쪽으로 움직일까요? 전류는 어떻게 바뀔까요?',diagnosis:'OUT은 접지 기준입니다. R1·R2의 위치와 kΩ→Ω 변환을 먼저 확인하세요. 출력에 부하가 없는 이상 저항 모델입니다.',app:'/edu/#design/1'},
 {id:'divider-ratio',title:'02 · 비율은 같고 전류는 다르게',goal:'R1만 바꾼 결과와, 두 저항을 함께 늘리는 별도 실험을 구분합니다.',calculator:'voltage-divider',inputs:[{id:'vin',label:'입력 전압',unit:'V',initial:1.8},{id:'r1',label:'위쪽 R1',unit:'Ω',initial:10000,changed:20000},{id:'r2',label:'아래쪽 R2',unit:'Ω',initial:10000}],question:'R1만 2배인 경우와 두 저항 모두 2배인 경우는 왜 다를까요?',diagnosis:'한 번에 한 변수만 바꿔 비교하세요. 부하가 연결되면 무부하 분압식만으로 출력 전압을 확정할 수 없습니다.',app:'/edu/#design/4'},
 {id:'series',title:'03 · 전압강하의 합',goal:'직렬 저항의 합을 계산하고 앱에서 각 저항 양단 전압을 읽습니다.',calculator:'series-resistor',inputs:[{id:'r1',label:'R1',unit:'Ω',initial:1000},{id:'r2',label:'R2',unit:'Ω',initial:2000,changed:3000},{id:'r3',label:'R3 · 미사용은 0',unit:'Ω',initial:0},{id:'r4',label:'R4 · 미사용은 0',unit:'Ω',initial:0}],question:'저항 하나의 전압강하와 노드의 접지 기준 전압은 어떻게 다를까요?',diagnosis:'이 계산은 등가 저항만 제공합니다. 노드 전압·전류는 전원과 연결을 지정한 후 앱에서 해석하세요.',app:'/edu/#design/5'},
 {id:'rc-c',title:'04 · 전하를 저장하는 C',goal:'C만 바꾸고 RC 시간 상수의 변화를 예측합니다.',calculator:'rc-time-constant',inputs:[{id:'resistance',label:'R',unit:'Ω',initial:10000},{id:'capacitance',label:'C',unit:'F',initial:1e-9,changed:5e-9}],question:'C가 5배면 τ는 몇 배인가요? 입력 상승 시간과 τ는 같은가요?',diagnosis:'1 nF = 1e−9 F입니다. τ는 파형 샘플이 아니라 이상 R·C 모델의 계산 결과입니다. 파형 비교는 앱의 실제 ngspice 실행으로 확인하세요.',app:'/edu/#quiz'},
 {id:'rc-r',title:'05 · 같은 C, 다른 R',goal:'R만 바꾸고 τ와 차단 주파수를 함께 읽습니다.',calculator:'rc-time-constant',inputs:[{id:'resistance',label:'R',unit:'Ω',initial:10000,changed:20000},{id:'capacitance',label:'C',unit:'F',initial:1e-9}],question:'R이 커질 때 τ와 차단 주파수는 각각 어느 방향으로 변하나요?',diagnosis:'이상 1차 RC의 시정수와 주파수 응답입니다. 소스 저항·부하·기생 성분이 추가되면 회로 모델부터 확인하세요.',app:'/edu/#quiz'},
 {id:'fault',title:'06 · 일부러 틀려보기',goal:'출력 노드·접지·단위를 한 항목씩 점검해 원인을 설명합니다.',calculator:'voltage-divider',inputs:[{id:'vin',label:'입력 전압',unit:'V',initial:1.8},{id:'r1',label:'R1',unit:'Ω',initial:10000},{id:'r2',label:'R2',unit:'Ω',initial:10,changed:10000}],question:'10 Ω와 10 kΩ를 혼동하면 어떤 결과가 나올까요? 연결 오류와 계산 오류를 어떻게 구분할까요?',diagnosis:'실제 배선 오류를 웹 계산이 검출한 것은 아닙니다. 이 실험은 단위 오입력 사례입니다. 연결 검사는 앱의 넷·핀과 실제 로그를 확인하세요.',app:'/edu/#design/6'},
 {id:'nmos',title:'07 · 트랜지스터 스위치',goal:'Edu 앱 퍼즐에서 D=OUT, G=IN, S=B=GND를 연결하고 대조 실험합니다.',calculator:null,inputs:[],question:'게이트를 GND로 연결했을 때와 IN으로 연결했을 때 OUT·드레인 전류가 어떻게 다르나요?',diagnosis:'실제 ngspice와 SKY130A nfet_01v8 TT 모델이 필요합니다. 이 웹 워크북은 MOS 전류·파형을 계산하지 않습니다. 앱 실행 ID·공정 모델·revision을 설명에 기록하세요.',app:'/edu/#quiz'},
 {id:'report',title:'08 · 나의 첫 실험 보고서',goal:'조건 → 예측 → 결과 → 근거 → 다음 실험 순서로 설명합니다.',calculator:null,inputs:[],question:'계산으로 확인한 것, 실제 해석한 것, 아직 확인하지 못한 것을 각각 적어보세요.',diagnosis:'메모 완료는 엔진 PASS나 정답 인증이 아닙니다. 수식 결과·실행 로그·자신의 설명을 구분해 제출하세요. 보고서는 JSON과 인쇄/PDF로 보관할 수 있습니다.',app:'/edu/#design/7'}
];
export type WorkbookRun={revision:number;inputs:Record<string,number>;result:CalculatorResult|null;engine:{id:string;status:'calculated'|'unavailable';process_id:string;scope:string};created_at:string};
export type MissionDraft={revision:number;inputs:Record<string,string>;prediction:string;explanation:string;complete:boolean;runs:WorkbookRun[]};
export type CourseWorkbook={schema_version:1;edition:'edu';project_id:string;course_revision:string;created_at:string;drafts:Record<string,MissionDraft>};
export function newCourseWorkbook(id:string):CourseWorkbook{return {schema_version:1,edition:'edu',project_id:id,course_revision:courseRevision,created_at:new Date().toISOString(),drafts:{}};}
export function missionDraft(m:Mission):MissionDraft{return {revision:1,inputs:Object.fromEntries(m.inputs.map(i=>[i.id,String(i.initial)])),prediction:'',explanation:'',complete:false,runs:[]};}
export function calculateMission(m:Mission,d:MissionDraft):WorkbookRun{
 const inputs=Object.fromEntries(m.inputs.map(i=>{const raw=d.inputs[i.id];if(typeof raw!=='string'||!raw.trim()||!Number.isFinite(Number(raw)))throw Error(i.label+'에 유효한 수치를 입력하세요.');return [i.id,Number(raw)];}));
 const calculator=calculators.find(c=>c.id===m.calculator);
 const result=calculator?.calculate(inputs)??null;
 if(result){const values=[result.primaryValue,...(result.secondary??[]).map(s=>s.value)];if(values.some(v=>typeof v==='number'&&!Number.isFinite(v)))throw Error('계산 가능한 수치 범위를 벗어났습니다. 입력의 크기와 단위를 확인하세요.');
  if((m.calculator==='rc-time-constant'&&result.primaryValue===0)||(m.calculator==='voltage-divider'&&inputs.vin!==0&&result.primaryValue===0))throw Error('현재 공통 계산기의 표시 정밀도 범위보다 작습니다. 입력 크기·단위를 확인하세요.');
 }
 return {revision:d.revision,inputs,result,engine:{id:calculator?'resistor.shared-calculators':'ngspice',status:calculator?'calculated':'unavailable',process_id:'educational-ideal-circuit',scope:calculator?'이상 소자 수식 계산 · DRC/LVS/PEX/시뮬레이션 미실행':'웹 워크북은 외부 엔진을 실행하지 않음 · Edu 앱에서 실제 엔진/모델 연결 필요'},created_at:new Date().toISOString()};
}
export function readCourseWorkbook(text:string):CourseWorkbook{
 const p=JSON.parse(text) as CourseWorkbook;
 if(p?.schema_version!==1||p.edition!=='edu'||p.course_revision!==courseRevision||typeof p.project_id!=='string'||!p.project_id||typeof p.created_at!=='string'||!p.drafts||typeof p.drafts!=='object'||Array.isArray(p.drafts))throw Error('이 Edu 워크북과 호환되는 학습 기록이 아닙니다. 원본을 보관하고 버전을 확인하세요.');
 for(const [id,d]of Object.entries(p.drafts)){
  const m=courseMissions.find(m=>m.id===id);
  if(!m||!d||!Number.isSafeInteger(d.revision)||d.revision<1||typeof d.prediction!=='string'||typeof d.explanation!=='string'||typeof d.complete!=='boolean'||!Array.isArray(d.runs)||!d.inputs||Array.isArray(d.inputs))throw Error('학습 기록 구조를 확인하세요.');
  if(m.inputs.some(i=>typeof d.inputs[i.id]!=='string')||Object.keys(d.inputs).some(k=>!m.inputs.some(i=>i.id===k)))throw Error('실습 입력이 맞지 않습니다.');
  for(const r of d.runs){if(!Number.isSafeInteger(r.revision)||r.revision>d.revision||r.revision<1||typeof r.created_at!=='string'||!r.inputs||!r.engine)throw Error('계산 기록을 확인하세요.');
   const expected=calculateMission(m,{...d,revision:r.revision,inputs:Object.fromEntries(Object.entries(r.inputs).map(([k,v])=>[k,String(v)]))});
   const canonical=(v:unknown):string=>JSON.stringify(v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,value])=>[k,JSON.parse(canonical(value))])):Array.isArray(v)?v.map(item=>JSON.parse(canonical(item))):v);
   if(canonical(expected.result)!==canonical(r.result)||canonical(expected.engine)!==canonical(r.engine)||canonical(expected.inputs)!==canonical(r.inputs))throw Error('결과와 입력이 일치하지 않습니다. 원본 기록을 보관하세요.');
  }
 }
 return p;
}
