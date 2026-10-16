import {getCalculator} from '../../calculators/src/index.ts';

export const puzzleVersion='edu-circuit-puzzles-v1';
export type Part={id:string;ohms:number;watts:number;label:string};
export type Placement=Record<string,string>;
export type Puzzle={id:string;title:string;level:number;kind:'divider'|'series'|'parallel'|'led';goal:string;vin:number;target:number;unit:'V'|'A'|'ohm';slots:{id:string;label:string;nodes:[string,string]}[];parts:Part[];initial:Placement;hints:string[];conditions:string[];max_current?:number;vf?:number};
const parts:Part[]=[{id:'r1k-a',ohms:1000,watts:.25,label:'1 kΩ · A'},{id:'r1k-b',ohms:1000,watts:.25,label:'1 kΩ · B'},{id:'r2k',ohms:2000,watts:.25,label:'2 kΩ'},{id:'r5k',ohms:5000,watts:.25,label:'5 kΩ'},{id:'r10k-a',ohms:10000,watts:.25,label:'10 kΩ · A'},{id:'r10k-b',ohms:10000,watts:.25,label:'10 kΩ · B'},{id:'r100-small',ohms:100,watts:.125,label:'100 Ω · ⅛ W'},{id:'r100-power',ohms:100,watts:.5,label:'100 Ω · ½ W'}];
const slots=[{id:'R1',label:'위쪽 자리',nodes:['VCC','OUT'] as [string,string]},{id:'R2',label:'아래쪽 자리',nodes:['OUT','GND'] as [string,string]},{id:'X1',label:'열린 가지',nodes:['OUT','OPEN'] as [string,string]}];
const conditions=['가상 연결 퍼즐 · 이상 저항·이상 전압원 · 상온/공정/공차 모델 없음','수치는 기존 공통 계산기의 정적 수식 결과이며 ngspice 실행·실물 측정·DRC/LVS/PEX가 아닙니다.'];
const base={parts,slots,initial:{},conditions};
export const circuitPuzzles:Puzzle[]=[
 {...base,id:'half-voltage',title:'01 · 전압을 절반으로',level:1,kind:'divider',goal:'5 V에서 OUT을 2.5 V로 만드세요.',vin:5,target:2.5,unit:'V',hints:['VCC → OUT → GND로 닫힌 경로가 필요합니다. OPEN은 측정 입력이 연결되지 않은 열린 끝입니다.','OUT = Vin × R아래 / (R위 + R아래). 위·아래 저항의 비를 생각하세요.','위·아래에 같은 저항값을 놓으면 OUT은 전원의 절반입니다. 같은 부품을 두 자리에 동시에 쓸 수는 없습니다.']},
 {...base,id:'one-third',title:'02 · 저항의 자리를 찾아라',level:2,kind:'divider',goal:'5 V에서 OUT을 1.6667 V ±1%로 만드세요.',vin:5,target:5/3,unit:'V',hints:['자리의 위치보다 연결된 노드 VCC·OUT·GND를 읽으세요.','아래 저항이 전체 저항의 ⅓이면 됩니다.','R위 = 2 × R아래인 조합을 찾아보세요.']},
 {...base,id:'repair-divider',title:'03 · 뒤바뀐 분배기 수리',level:2,kind:'divider',goal:'현재 잘못 꽂힌 부품을 옮겨 OUT을 1.6667 V ±1%로 복구하세요.',vin:5,target:5/3,unit:'V',initial:{R1:'r5k',R2:'r10k-a'},hints:['시작 배치는 위 5 kΩ, 아래 10 kΩ입니다. 아래 저항의 비중이 큽니다.','두 저항의 전체 합을 유지하면서 아래 저항의 비중을 줄여보세요.','두 부품의 자리를 바꾸면 5 × 5k / (10k + 5k)가 됩니다.']},
 {...base,id:'series-current',title:'04 · 전류를 제한해라',level:1,kind:'series',goal:'두 저항의 직렬 경로에 2.5 mA가 흐르게 만드세요.',vin:5,target:.0025,unit:'A',hints:['두 필수 자리를 모두 채워 하나의 직렬 경로를 만드세요.','I = V / (R1 + R2). 목표 전류에서 전체 저항을 먼저 계산하세요.','전체 2 kΩ이 필요합니다. 각각 1 kΩ인 두 부품을 찾아보세요.']},
 {...base,id:'parallel-resistance',title:'05 · 병렬 길 찾기',level:2,kind:'parallel',goal:'두 병렬 가지로 500 Ω의 등가 저항을 만드세요.',vin:5,target:500,unit:'ohm',slots:slots.map(s=>s.id==='X1'?{...s,nodes:['VCC','OPEN']}:({...s,label:s.id==='R1'?'왼쪽 가지':'오른쪽 가지',nodes:['VCC','GND']})) as Puzzle['slots'],hints:['두 가지 모두 VCC와 GND 사이에 연결됩니다.','1 / Req = 1 / R1 + 1 / R2. 같은 저항 두 개의 병렬은 절반입니다.','1 kΩ 두 개의 병렬 조합을 시험해보세요.']},
 {...base,id:'led-current',title:'06 · LED 앞에 저항 꽂기',level:1,kind:'led',goal:'Vf = 2 V인 이상 LED에 3 mA를 흘리세요.',vin:5,vf:2,target:.003,unit:'A',slots:[slots[0],slots[2]],conditions:[...conditions,'LED는 일정한 순방향 전압 2 V로 가정합니다. 실제 I–V·온도·광출력·역전압 검증은 포함하지 않습니다.'],hints:['LED와 직렬인 VCC → OUT 자리에 전류 제한 저항을 놓으세요.','저항에는 5 − 2 = 3 V가 걸린다고 가정합니다. I = (Vin − Vf) / R.','3 V / 3 mA = 1 kΩ입니다.']},
 {...base,id:'power-rating',title:'07 · 값이 같아도 뜨거워진다',level:2,kind:'divider',goal:'OUT = 2.5 V를 유지하면서 전체 전류 50 mA 이하, 저항 정격 전력 조건을 만족하세요.',vin:10,target:2.5,unit:'V',max_current:.05,parts:[...parts,{id:'r300',ohms:300,watts:.5,label:'300 Ω · ½ W'},{id:'r300-power',ohms:300,watts:1,label:'300 Ω · 1 W'}],hints:['전압비뿐 아니라 전류와 각 저항의 P = I²R도 확인합니다.','전류 상한 50 mA를 넘지 않아야 하며 각 저항의 정격이 계산 전력 이상이어야 합니다.','아래 100 Ω, 위 300 Ω이면 I=25 mA입니다. 위 저항에는 0.1875 W, 아래에는 0.0625 W가 걸립니다.']},
 {...base,id:'thermal-trap',title:'08 · 작은 저항의 함정',level:3,kind:'series',goal:'전체 100 Ω, 50 mA 경로를 만들고 정격 전력도 만족하세요.',vin:5,target:.05,unit:'A',parts:[...parts,{id:'r50-small',ohms:50,watts:.0625,label:'50 Ω · ¹⁄₁₆ W'},{id:'r50-a',ohms:50,watts:.25,label:'50 Ω · ¼ W · A'},{id:'r50-b',ohms:50,watts:.25,label:'50 Ω · ¼ W · B'}],hints:['전류가 맞아도 정격 전력이 부족하면 이 퍼즐의 조건을 만족하지 않습니다.','50 mA가 50 Ω를 통과하면 P = (0.05 A)² × 50 Ω = 0.125 W입니다.','각 50 Ω 자리에는 0.125 W 이상의 정격이 필요합니다.']}
];

export function getPuzzle(id:string){const p=circuitPuzzles.find(p=>p.id===id);if(!p)throw Error('지원하지 않는 회로 퍼즐입니다.');return p;}
export function placePuzzlePart(p:Puzzle,current:Placement,slot:string,part:string):Placement{
 if(!p.slots.some(s=>s.id===slot)||!p.parts.some(x=>x.id===part))throw Error('이 문제에 있는 부품과 자리만 선택하세요.');
 const next={...current};for(const [key,id] of Object.entries(next))if(id===part)delete next[key];next[slot]=part;return next;
}
export function validatePlacement(p:Puzzle,placement:Placement){
 if(!placement||Array.isArray(placement)||Object.keys(placement).length>p.slots.length)throw Error('배치 형식이 올바르지 않습니다.');
 const seen=new Set();for(const [slot,part] of Object.entries(placement)){if(!p.slots.some(s=>s.id===slot)||!p.parts.some(x=>x.id===part)||seen.has(part))throw Error('알 수 없거나 중복된 부품·자리입니다.');seen.add(part);}
}
function calculate(id:string,inputs:Record<string,number|string>){const calculator=getCalculator(id);if(!calculator)throw Error('공통 계산기를 찾을 수 없습니다: '+id);return calculator.calculate(inputs);}
export type PuzzleAssessment={status:'incomplete'|'needs-change'|'goal-met';scope:'ideal-static-calculation';engine_verification:false;formula:string;observations:string[];missing:string[];value:number|null;unit:string;current_A:number|null;output_V:number|null;powers:{slot:string;watts:number;rating:number;within_rating:boolean}[];target_met:boolean;power_met:boolean;topology_complete:boolean};
export function assessPuzzle(p:Puzzle,placement:Placement):PuzzleAssessment{
 validatePlacement(p,placement);
 const required=p.kind==='led'?['R1']:['R1','R2'],missing=required.filter(s=>!placement[s]);
 const a:PuzzleAssessment={status:'incomplete',scope:'ideal-static-calculation',engine_verification:false,formula:'',observations:[],missing,value:null,unit:p.unit,current_A:null,output_V:null,powers:[],target_met:false,power_met:false,topology_complete:false};
 if(placement.X1)a.observations.push('X1은 OPEN으로 끝나는 열린 가지입니다. 필수 경로의 저항 자리를 대신할 수 없습니다.');
 if(missing.length){a.observations.push('필수 경로에서 비어 있는 자리: '+missing.join(', '));return a;}
 const r1=p.parts.find(x=>x.id===placement.R1)!,r2=p.parts.find(x=>x.id===placement.R2);
 // Only the declared template is reduced; unsupported extra branches are never silently ignored.
 if(placement.X1){a.status='needs-change';a.observations.push('이 퍼즐은 표시한 기본 경로만 계산합니다. 열린 가지 부품을 트레이로 되돌린 뒤 확인하세요.');return a;}
 a.topology_complete=true;let i=0,vout=0,value=0;
 if(p.kind==='led'){
  const expected=calculate('led-resistor',{supply:p.vin,forward:p.vf!,current_ma:p.target*1000});
  // This shared calculator uses mA input; the observed current follows Ohm's law at the assumed constant Vf.
  i=(p.vin-p.vf!)/r1.ohms;vout=p.vf!;value=i;a.formula=`I = (Vin − Vf) / R; R목표 = ${expected.primaryValue} Ω`;
 }else if(p.kind==='parallel'){
  const eq=calculate('parallel-resistor',{r1:r1.ohms,r2:r2!.ohms,r3:0,r4:0});value=Number(eq.primaryValue);i=p.vin/value;vout=p.vin;a.formula='1 / Req = 1 / R1 + 1 / R2';
 }else{
  const divider=calculate('voltage-divider',{vin:p.vin,r1:r1.ohms,r2:r2!.ohms});vout=Number(divider.primaryValue);i=p.vin/(r1.ohms+r2!.ohms);value=p.kind==='series'?i:vout;a.formula=p.kind==='series'?'I = Vin / (R1 + R2)':'Vout = Vin × R2 / (R1 + R2)';
 }
 a.value=value;a.current_A=i;a.output_V=vout;
 a.powers=required.map(slot=>{const r=p.parts.find(x=>x.id===placement[slot])!,power=p.kind==='parallel'?p.vin*p.vin/r.ohms:i*i*r.ohms;return {slot,watts:power,rating:r.watts,within_rating:power<=r.watts+Number.EPSILON};});
 a.target_met=Math.abs(value-p.target)<=Math.abs(p.target)*.01;
 a.power_met=a.powers.every(x=>x.within_rating)&&(p.max_current===undefined||i<=p.max_current);
 a.status=a.target_met&&a.power_met?'goal-met':'needs-change';
 a.observations.push(a.target_met?'목표 수치의 ±1% 범위입니다.':'계산값이 목표의 ±1% 범위를 벗어납니다.');
 if(!a.power_met)a.observations.push('전력 정격 또는 전류 상한 조건을 벗어납니다.');
 return a;
}
export function puzzleCoach(p:Puzzle,placement:Placement,question:string,hintLevel=0){
 const a=assessPuzzle(p,placement),normalized=question.toLowerCase();
 const hint=p.hints[Math.min(Math.max(hintLevel,0),p.hints.length-1)];
 let rule=/공식|수식|formula|왜|전압|출력/.test(normalized)?(a.formula||'닫힌 연결 경로를 먼저 확인한 뒤 '+(p.kind==='parallel'?'1/Req = 1/R1 + 1/R2':p.kind==='led'?'I = (Vin − Vf)/R':'Vout = Vin × R2/(R1+R2), I = Vin/(R1+R2)')):hint;
 if(/전력|뜨거|정격/.test(normalized))rule='P = I²R. 각 저항의 계산 전력이 표시된 정격 이하인지 각각 비교합니다. 열 방출·실물 안전은 별도 모델·측정이 필요합니다.';
 else if(/전류|mA/.test(normalized))rule=p.kind==='parallel'?'전체 I = Vin / Req. 각 가지 전류는 Vin / R가지입니다.':p.kind==='led'?'I = (Vin − Vf) / R. Vf 일정 가정입니다.':'I = Vin / (R1 + R2). 직렬 경로의 전류는 같습니다.';
 const followup=!a.topology_complete?'R1은 어느 두 노드 사이에 있어야 할까요?':!a.power_met?'어느 부품의 계산 전력이 정격을 넘는지 찾아볼까요?':p.kind==='parallel'?'같은 값의 병렬 가지가 하나 늘면 등가 저항은 어떻게 바뀔까요?':p.kind==='led'?'저항을 두 배로 키우면 전류는 어떻게 달라질까요?':'아래쪽 저항을 키우면 OUT 전압은 어느 방향으로 변할까요?';
 return {observed_facts:a.observations.join(' ')||'아직 이 배치로 확인한 결과가 없습니다.',applied_model:rule,reasoning:a.topology_complete?`표시한 이상 모델의 계산값은 ${a.value?.toPrecision(5)} ${a.unit}, 전원 전류는 ${(a.current_A!*1000).toPrecision(5)} mA입니다. 공차·공정·실물 동작의 증거는 없습니다.`:'배치 정보만으로 누락된 연결의 전류를 계산했다고 주장하지 않습니다.',next_experiment:a.status==='goal-met'?'저항 하나를 다른 값으로 바꾼 뒤 변화 방향을 예측하고 다시 계산해보세요.':hint,question:followup,source:'curated-coach',engine_verification:false};
}
