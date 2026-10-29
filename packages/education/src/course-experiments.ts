import {calculators} from '../../calculators/src/index';
import {calculateMission,type Mission,type MissionDraft,type WorkbookRun} from './course-workbook';
const labels:Record<string,string>={'Output voltage':'출력 전압','Divider current':'분압기 전류','Total resistance':'전체 저항','Equivalent resistance':'등가 저항','Active resistors':'사용한 저항 수','Time constant':'시간 상수 τ','Cutoff frequency':'차단 주파수','5 tau settling':'5τ 정착 시간'};
export const resultLabel=(label:string)=>labels[label]??label;
export function engineeringValue(value:number|string,unit='',reference?:number){
 if(typeof value!=='number')return {value,unit};
 if(!Number.isFinite(value))return {value:'지원 수치 범위 밖',unit};
 const normalized=unit==='ohm'?'Ω':unit,abs=Math.abs(value);
 const prefixes:Record<number,string>={'-15':'f','-12':'p','-9':'n','-6':'µ','-3':'m','0':'','3':'k','6':'M','9':'G','12':'T'};
 if(abs===0||!['Ω','V','A','F','s','Hz'].includes(normalized))return {value:String(value),unit:normalized};
 const scale=reference!==undefined&&Number.isFinite(reference)&&reference>0?reference:abs,exponent=3*Math.floor(Math.log10(scale)/3);
 if(exponent < -15||exponent>12)return {value:value.toExponential(5),unit:normalized};
 return {value:String(Number((value/10**exponent).toPrecision(6))),unit:prefixes[exponent]+normalized};
}
export function appendMissionRun(m:Mission,d:MissionDraft){
 const run=calculateMission(m,d),last=d.runs.at(-1);
 if(last?.revision===d.revision&&m.inputs.every(i=>Number(d.inputs[i.id])===last.inputs[i.id]))return {run:last,added:false};
 d.runs.push(run);return {run,added:true};
}
export function suggestedExperiment(m:Mission,d:MissionDraft){
 const input=m.inputs.find(i=>i.changed!==undefined);if(!input)return {changed:false,message:'이 미션은 앱의 연결·로그 관찰과 설명을 작성하세요.'};
 if(Number(d.inputs[input.id])===input.changed)return {changed:false,message:'추천 값이 이미 입력되어 있습니다. 다른 조건은 유지하고 계산 결과를 비교하세요.'};
 d.inputs[input.id]=String(input.changed);d.revision++;return {changed:true,message:input.label+'만 추천 값으로 바꿨습니다. 아직 새 결과를 계산하지 않았습니다.'};
}
export function compareMissionRuns(m:Mission,d:MissionDraft){
 const before=d.runs[0],after=d.runs.at(-1),fresh=!!after&&isCurrentRun(after,d);
 const model=calculators.find(c=>c.id===m.calculator)?.formula??'실제 엔진·공정 모델과 앱 실행 로그가 필요합니다.';
 const next=m.inputs.find(i=>i.changed!==undefined),next_experiment=next?`${next.label}만 ${next.changed} ${next.unit}로 바꾸고 다시 계산해 보세요.`:'실제 앱에서 연결·실행 조건과 revision을 확인하고 관찰한 사실을 직접 기록하세요.';
 if(!before||!after)return {kind:'not_run' as const,fresh,changes:[],observed:'아직 계산·실행 기록이 없습니다.',model,reason:'결과를 예측한 뒤 기준 조건부터 기록하세요.',next_experiment};
 if(!after.result)return {kind:'unavailable' as const,fresh,changes:[],observed:'웹에서 전기적 해석을 실행하지 않았습니다.',model,reason:m.diagnosis,next_experiment};
 const changes=m.inputs.filter(i=>before.inputs[i.id]!==after.inputs[i.id]).map(i=>({id:i.id,label:i.label,unit:i.unit,before:before.inputs[i.id],after:after.inputs[i.id]}));
 const kind=d.runs.length===1?'before_only':changes.length===0?'identical':changes.length===1?'single_variable':'multiple_variables';
 const reference=Math.max(Math.abs(Number(before.result!.primaryValue)),Math.abs(Number(after.result.primaryValue))),a=engineeringValue(before.result!.primaryValue,before.result!.primaryUnit,reference),b=engineeringValue(after.result.primaryValue,after.result.primaryUnit,reference);
 const observed=`${resultLabel(after.result.primaryLabel)}: ${a.value} ${a.unit} → ${b.value} ${b.unit} (저장한 수식 계산 결과).`;
 const reason=kind==='before_only'?'기준 조건을 기록했습니다. 입력 하나를 바꾸고 다시 계산하세요.':kind==='identical'?'기준과 비교 입력이 같습니다. 성능 변화가 있다고 판단할 수 없습니다.':kind==='single_variable'?'기록된 입력에서 변수 하나만 달라졌습니다. 이상 소자 모델의 적용 조건 안에서 차이를 설명하세요.':'입력 여러 개가 함께 바뀌었습니다. 한 변수만의 영향으로 단정하지 말고 대조 실험을 추가하세요.';
 return {kind,fresh,changes,observed,model,reason,next_experiment};
}
export const isCurrentRun=(run:WorkbookRun,draft:MissionDraft)=>run.revision===draft.revision&&Object.keys(run.inputs).length===Object.keys(draft.inputs).length&&Object.entries(run.inputs).every(([key,value])=>typeof draft.inputs[key]==='string'&&draft.inputs[key].trim()!==''&&Number(draft.inputs[key])===value);
