import {getCalculator} from '../../calculators/src/index.ts';
import {gradeObjective,type StudyQuestion} from './self-study.ts';
export const leagueProblemVersion='edu-league-math-v1';
export const leagueKinds=['voltage-divider','parallel-resistor','ohms-law','rc-time-constant','power-dissipation','frequency-period'] as const;
export type LeagueRecipe={kind:typeof leagueKinds[number];variants:number[]};
const resistances=[1000,2200,4700,10000,22000,47000],voltages=[1.8,2.5,3.3,5,9,12];
export function leagueQuestion(recipe:LeagueRecipe,index:number):StudyQuestion{
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
 const calculator=getCalculator(recipe.kind)!;const result=calculator.calculate(inputs);if(typeof result.primaryValue!=='number'||!Number.isFinite(result.primaryValue)||result.primaryValue<=0)throw Error('공통 계산 엔진이 유한한 기준값을 만들지 못했습니다.');
 return {schema_version:1,id:'q'+(index+1),version:leagueProblemVersion,kind:'numeric',title:calculator.title,topic:calculator.category,level:1,prompt,conditions,unit:result.primaryUnit,expected:result.primaryValue,formula:calculator.formula,solution:result.explanation,hints:[],rubric:[],source_ids:['shared-math'],origin:'ai',calculator_id:recipe.kind,inputs,provenance:{authoring:'AI-assisted bounded template',numerical_authority:'shared-calculator',engine_verification:false}};
}
export function buildLeagueQuestions(recipes:LeagueRecipe[]){if(recipes.length!==5||new Set(recipes.map(r=>r.kind)).size!==5)throw Error('서로 다른 영역의 문제 5개가 필요합니다.');return recipes.map(leagueQuestion);}
export function publicLeagueQuestion(q:StudyQuestion){const {expected,solution,formula,inputs,provenance,...visible}=q;return visible;}
export function gradeLeague(questions:StudyQuestion[],answers:Record<string,string>){
 if(Object.keys(answers).length!==questions.length||questions.some(q=>!(q.id in answers)))throw Error('모든 문항에 수치와 단위를 입력하세요.');
 const details=questions.map((q,i)=>{try{return {id:q.id,...gradeObjective(q,answers[q.id])};}catch(e){throw Object.assign(Error(`${i+1}번 답안: ${e instanceof Error?e.message:String(e)}`),{code:'INVALID_ANSWER'});}});return {score:details.filter(d=>d.correct).length*20,correct:details.filter(d=>d.correct).length,total:questions.length,details};
}
