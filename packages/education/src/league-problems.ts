import {getCalculator} from '../../calculators/src/index.ts';
import type {StudyQuestion} from './self-study.ts';
import {gradeObjective} from './study-grading.ts';
import {difficultyLevel,type DifficultyLevel} from './difficulty.ts';
export const leagueProblemVersion='edu-league-math-v2';
export const leagueKinds=['voltage-divider','parallel-resistor','ohms-law','rc-time-constant','power-dissipation','frequency-period'] as const;
export type LeagueRecipe={kind:typeof leagueKinds[number];variants:number[]};
const resistances=[1000,2200,4700,10000,22000,47000],voltages=[1.8,2.5,3.3,5,9,12];
export function leagueQuestion(recipe:LeagueRecipe,index:number,level:DifficultyLevel=1):StudyQuestion{
 difficultyLevel(level);
 if(!leagueKinds.includes(recipe.kind)||recipe.variants.length!==3||recipe.variants.some(v=>!Number.isInteger(v)||v<0||v>15))throw Error('지원하지 않는 출제 조건입니다.');
 const [a,b,c]=recipe.variants,R=resistances[a%6],R2=resistances[b%6],V=voltages[c%6];let inputs:Record<string,number>,prompt:string,conditions:string[]=['이상 소자·정적 수식의 연습 문제입니다. 실물 측정·제조 검증이 아닙니다.'];
 switch(recipe.kind){
  case 'voltage-divider':inputs={vin:V,r1:R,r2:R2};prompt=`입력 ${V} V, 위쪽 R1=${R} Ω, 아래쪽 R2=${R2} Ω인 분압기의 OUT 전압을 구하세요.`;conditions.push('R1: IN→OUT, R2: OUT→GND. 출력 부하 전류는 0입니다.');break;
  case 'parallel-resistor':inputs={r1:R,r2:R2,r3:0,r4:0};prompt=`${R} Ω와 ${R2} Ω 저항 두 개를 병렬 연결했습니다. 등가 저항을 구하세요.`;conditions.push('두 저항의 양 끝은 각각 같은 두 노드에 연결됩니다.');break;
  case 'ohms-law':inputs={current:[.001,.002,.005,.01][b%4],resistance:R};prompt=`${inputs.current*1000} mA가 ${R} Ω 저항의 +핀으로 들어갑니다. +핀에서 −핀까지 전압강하를 구하세요.`;break;
  case 'rc-time-constant':inputs={resistance:R,capacitance:[10e-9,22e-9,47e-9,100e-9,220e-9,1e-6][b%6]};prompt=`R=${R} Ω, C=${inputs.capacitance} F인 1차 RC 회로의 시정수 τ를 구하세요.`;conditions.push('시정수 τ 자체를 구합니다. rise time이나 5τ 정착 시간과 구분하세요.');break;
  case 'power-dissipation':inputs={voltage:V,resistance:R};prompt=`${R} Ω 저항 양단에 ${V} V가 걸립니다. 저항이 소비하는 전력을 구하세요.`;conditions.push('저항값은 일정합니다. 계산 전력은 온도 상승이나 안전 정격 판정이 아닙니다.');break;
  default:inputs={frequency:[100,200,500,1000,2000,5000][a%6]};prompt=`주파수 ${inputs.frequency} Hz인 주기 신호의 한 주기 시간을 구하세요.`;
 }
  if(level!==1)return composedQuestion(recipe,index,level);
 const calculator=getCalculator(recipe.kind)!;const result=calculator.calculate(inputs);if(typeof result.primaryValue!=='number'||!Number.isFinite(result.primaryValue)||result.primaryValue<=0)throw Error('공통 계산 엔진이 유한한 기준값을 만들지 못했습니다.');
 return {schema_version:1,id:'q'+(index+1),version:leagueProblemVersion,kind:'numeric',title:calculator.title,topic:calculator.category,level:1,prompt,conditions,unit:result.primaryUnit,expected:result.primaryValue,formula:calculator.formula,solution:result.explanation,hints:[],rubric:[],source_ids:['shared-math'],origin:'ai',calculator_id:recipe.kind,inputs,provenance:{authoring:'AI-assisted bounded template',numerical_authority:'shared-calculator',engine_verification:false}};
}
export function buildLeagueQuestions(recipes:LeagueRecipe[],level:DifficultyLevel=1){if(recipes.length!==5||new Set(recipes.map(r=>r.kind)).size!==5)throw Error('서로 다른 영역의 문제 5개가 필요합니다.');return recipes.map((recipe,index)=>leagueQuestion(recipe,index,level));}
export function publicLeagueQuestion(q:StudyQuestion){const {expected,solution,formula,inputs,provenance,...visible}=q;return visible;}
export function gradeLeague(questions:StudyQuestion[],answers:Record<string,string>){
 if(Object.keys(answers).length!==questions.length||questions.some(q=>!(q.id in answers)))throw Error('모든 문항에 수치와 단위를 입력하세요.');
 const details=questions.map((q,i)=>{try{return {id:q.id,...gradeObjective(q,answers[q.id])};}catch(e){throw Object.assign(Error(`${i+1}번 답안: ${e instanceof Error?e.message:String(e)}`),{code:'INVALID_ANSWER'});}});return {score:details.filter(d=>d.correct).length*20,correct:details.filter(d=>d.correct).length,total:questions.length,details};
}

function composedQuestion(recipe:LeagueRecipe,index:number,level:2|3):StudyQuestion{
 const [a,b,c]=recipe.variants,r1=resistances[a%6],r2=resistances[b%6],r3=resistances[c%6],r4=resistances[(a+b+1)%6],vin=voltages[c%6],capacitance=[10e-9,22e-9,47e-9,100e-9,220e-9,1e-6][b%6],current=[.001,.002,.005,.01][b%4];
 const trace:{calculator_id:string;inputs:Record<string,number>;value:number;unit:string}[]=[],formulas:string[]=[];
 function calculate(id:string,inputs:Record<string,number>,secondary?:string){const def=getCalculator(id)!,result=def.calculate(inputs),part=secondary?result.secondary?.find(x=>x.label===secondary):null,value=part?part.value:result.primaryValue,unit=part?part.unit:result.primaryUnit;if(typeof value!=='number'||!Number.isFinite(value)||value<=0)throw Error('공통 계산 결과 범위를 확인하세요.');trace.push({calculator_id:id,inputs,value,unit:unit||''});formulas.push(def.formula);return value;}
 const series=(x:number,y:number)=>calculate('series-resistor',{r1:x,r2:y,r3:0,r4:0}),parallel=(x:number,y:number)=>calculate('parallel-resistor',{r1:x,r2:y,r3:0,r4:0});
 const divider=(top:number,bottom:number)=>calculate('voltage-divider',{vin,r1:top,r2:bottom});
 let expected:number,prompt:string,title:string,unit:string,conditions=['이상 소자·정적 수식의 연습 문제입니다. 실물 측정·공정 검증이 아닙니다.'];
 switch(recipe.kind){
  case 'voltage-divider':{title='부하와 분압기의 출력';unit='V';if(level===2){const bottom=parallel(r2,r3);expected=divider(r1,bottom);prompt=`입력 ${vin} V. IN→OUT에 R1=${r1} Ω, OUT→GND에 R2=${r2} Ω와 부하 RL=${r3} Ω가 각각 연결됩니다. OUT 전압을 구하세요.`;}else{const top=series(r1,r2),bottom=parallel(r3,r4);expected=divider(top,bottom);prompt=`입력 ${vin} V. IN→OUT의 위쪽 가지는 ${r1} Ω와 ${r2} Ω의 직렬입니다. OUT→GND의 아래쪽 가지는 ${r3} Ω와 ${r4} Ω의 병렬입니다. OUT 전압을 구하세요.`;}conditions.push('이상 전압원, 전압계 입력 전류 0. 병렬 부하는 실제로 전류를 소모합니다.');break;}
  case 'parallel-resistor':{title='직렬·병렬 등가 저항';unit='ohm';const branch=series(r1,r2);if(level===2){expected=parallel(branch,r3);prompt=`A→B 사이 가지 1은 ${r1} Ω와 ${r2} Ω의 직렬이고, 가지 2는 ${r3} Ω 하나입니다. 두 가지 전체의 A–B 등가 저항을 구하세요.`;}else{const second=parallel(r3,r4);expected=parallel(branch,second);prompt=`A→B의 가지 1은 ${r1} Ω+${r2} Ω 직렬, 가지 2는 ${r3} Ω와 ${r4} Ω의 병렬입니다. 가지 1과 2도 서로 병렬일 때 전체 A–B 등가 저항을 구하세요.`;}break;}
  case 'ohms-law':{title='등가회로와 전체 전압강하';unit='V';let total:number;if(level===2){total=series(r1,r2);prompt=`${r1} Ω와 ${r2} Ω를 직렬 연결하고 ${current*1000} mA를 흘립니다. 전체 직렬 경로의 전압강하를 구하세요.`;}else{const branch=parallel(r2,r3);total=series(r1,branch);prompt=`${r1} Ω 저항 다음에 ${r2} Ω와 ${r3} Ω의 병렬 묶음을 직렬 연결했습니다. 전체 입력 전류가 ${current*1000} mA일 때 전체 경로의 전압강하를 구하세요.`;}expected=calculate('ohms-law',{current,resistance:total});conditions.push('수동 부호 규약: 전류가 +단자로 들어가며 전체 +→− 전압강하를 구합니다.');break;}
  case 'rc-time-constant':{title='충전 경로와 RC 시정수';unit='s';let resistance:number;if(level===2){resistance=series(r1,r2);prompt=`이상 step 전압원→${r1} Ω→${r2} Ω→C 순서이며 C=${capacitance} F의 반대 단자는 GND입니다. 충전 시정수 τ를 구하세요.`;}else{const source=parallel(r1,r2);resistance=series(source,r3);prompt=`이상 전압원의 분압기 R1=${r1} Ω(IN→OUT), R2=${r2} Ω(OUT→GND)에 OUT→R3=${r3} Ω→C=${capacitance} F→GND 가지를 연결했습니다. 전압원을 0 V로 둔 테브난 저항을 사용해 C의 시정수 τ를 구하세요.`;}expected=calculate('rc-time-constant',{resistance,capacitance});conditions.push('C 하나, 이상 전압원 출력 저항 0 Ω. τ 자체이며 5τ 정착 시간과 구분합니다.');break;}
  case 'power-dissipation':{title='분압 결과와 부하 소비 전력';unit='W';if(level===2){const vout=divider(r1,r2);expected=calculate('power-dissipation',{voltage:vout,resistance:r2});prompt=`입력 ${vin} V. R1=${r1} Ω(IN→OUT), R2=${r2} Ω(OUT→GND)의 무부하 분압기에서 R2가 소비하는 전력을 구하세요.`;}else{const bottom=parallel(r2,r3),vout=divider(r1,bottom);expected=calculate('power-dissipation',{voltage:vout,resistance:r3});prompt=`입력 ${vin} V. R1=${r1} Ω(IN→OUT), R2=${r2} Ω와 RL=${r3} Ω(둘 다 OUT→GND)입니다. 전체 회로나 R2가 아닌 부하 RL 한 개의 소비 전력을 구하세요.`;}conditions.push('고정 저항의 전기적 소비 전력이며 열 상승·안전 정격 판정은 포함하지 않습니다.');break;}
  default:{title='RC 차단주파수와 주기';unit='s';const resistance=level===3?parallel(r1,r2):r1,fc=calculate('rc-time-constant',{resistance,capacitance},'Cutoff frequency');expected=calculate('frequency-period',{frequency:fc});prompt=level===3?`저항 ${r1} Ω와 ${r2} Ω를 병렬로 묶어 이상 전압원과 C=${capacitance} F 사이에 연결했습니다. 이 단일극 RC의 −3 dB 차단주파수 fc와 같은 주파수를 갖는 정현파의 주기 T를 구하세요.`:`이상 전압원→R=${r1} Ω→OUT, C=${capacitance} F(OUT→GND)의 단일극 RC에서 −3 dB 차단주파수 fc와 같은 주파수를 갖는 정현파의 주기 T를 구하세요.`;conditions.push('무부하 단일극 RC이며 τ와 주기 T를 구분합니다. 실제 발진·잡음·지터 해석이 아닙니다.');}
 }
 return {schema_version:1,id:'q'+(index+1),version:leagueProblemVersion,kind:'numeric',title,topic:getCalculator(recipe.kind)!.category,level,prompt,conditions,unit,expected,formula:[...new Set(formulas)].join(' → '),solution:trace.map((t,i)=>`${i+1}. ${t.calculator_id}: ${t.value} ${t.unit}`).join('\n'),hints:['연결 조건에 맞는 등가회로와 단위를 먼저 정리하세요.'],rubric:[],source_ids:['shared-math'],origin:'ai',calculator_id:recipe.kind,provenance:{authoring:'AI-assisted bounded template',numerical_authority:'shared-calculator',difficulty_steps:trace.length,numerical_trace:trace,engine_verification:false}};
}
