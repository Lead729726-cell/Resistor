import {calculateMission,type Mission,type MissionDraft} from './course-workbook';
import {compareMissionRuns} from './course-experiments';

export type GuidanceStepId='predict'|'calculate'|'compare'|'explain';
export type GuidanceStepStatus='pending'|'done'|'stale'|'unavailable';
export type GuidanceAction='predict'|'calculate'|'change'|'compare'|'explain'|'app'|'review';
export type GuidanceStep={id:GuidanceStepId;label:string;status:GuidanceStepStatus;detail:string};
export type MissionInputValidation={valid:boolean;message:string|null;fieldId:string|null};

/** Validation uses the same calculation path as a saved run, without changing the draft. */
export function validateMissionInputs(m:Mission,d:MissionDraft):MissionInputValidation{
 try{calculateMission(m,d);return {valid:true,message:null,fieldId:null};}
 catch(error){
  const raw=error instanceof Error?error.message:String(error);
  const input=m.inputs.find(input=>raw===input.label+'에 유효한 수치를 입력하세요.'||raw.startsWith(input.id+' must '));
  let message=raw;
  if(input){
   if(raw.endsWith('must be greater than zero.'))message=`${input.label}에는 0보다 큰 값을 ${input.unit} 단위로 입력하세요.`;
   else if(raw.endsWith('must be zero or greater.'))message=`${input.label}에는 0 이상을 ${input.unit} 단위로 입력하세요.`;
   else if(raw.endsWith('must be a finite number.'))message=`${input.label}에 유효한 수치를 입력하세요.`;
  }
  if(raw==='At least one resistor must be greater than zero.')message='저항 중 하나 이상에는 0보다 큰 값을 입력하세요. 미사용 저항만 0으로 둡니다.';
  return {valid:false,message,fieldId:input?.id??null};
 }
}

/**
 * A guide to the artifacts in a learner's draft, not a score or engine verdict.
 * A comparison being ready only means recorded conditions/results can be read;
 * it does not prove that the learner read them or understood their meaning.
 */
export function courseGuidance(m:Mission,d:MissionDraft){
 const comparison=compareMissionRuns(m,d),validation=validateMissionInputs(m,d);
 const hasPrediction=!!d.prediction.trim(),hasExplanation=!!d.explanation.trim();
 const supported=!!m.calculator,hasRuns=d.runs.length>0;
 const calculated=supported&&comparison.fresh&&d.runs.at(-1)?.engine.status==='calculated';
 const hasPair=calculated&&d.runs.length>1&&comparison.changes.length>0;
 const stale=hasRuns&&!comparison.fresh;
 const steps:GuidanceStep[]=[
  {id:'predict',label:'예측',status:hasPrediction?'done':'pending',detail:hasPrediction?'내 예측 메모가 있습니다.':hasRuns?'예측 메모가 없습니다. 다음 조건을 바꾸기 전에 먼저 예상해 보세요.':'결과를 보기 전에 예상한 방향과 이유를 한 문장으로 적어 보세요.'},
  {id:'calculate',label:supported?'계산':'실행 범위',status:!supported?'unavailable':stale?'stale':calculated?'done':'pending',detail:!supported?'이 워크북은 외부 엔진을 실행하지 않습니다. 앱의 도구·모델과 실제 실행 로그를 확인하세요.':stale?'입력 또는 revision이 바뀌었습니다. 이전 결과는 남아 있으며 새 조건의 계산이 필요합니다.':calculated?'현재 조건의 공통 수식 계산 기록이 있습니다. 실제 시뮬레이션은 아닙니다.':'현재 조건의 수식 결과를 계산하고 기록하세요.'},
  {id:'compare',label:'비교',status:!supported?'unavailable':stale?'stale':hasPair?'done':'pending',detail:!supported?'실제 앱의 실행 ID·조건·revision을 확인한 뒤 관찰한 사실을 메모하세요.':stale?'변경 전후 표에는 이전 조건의 결과가 표시됩니다. 새 조건을 먼저 계산하세요.':hasPair?comparison.kind==='multiple_variables'?'서로 다른 조건의 기록 두 개가 있습니다. 여러 변수가 바뀌어 한 변수의 영향으로 단정할 수 없습니다.':'서로 다른 조건의 기록 두 개가 있어 비교할 수 있습니다. 비교를 읽었거나 이해했다는 자동 판정은 아닙니다.':hasRuns?'기준 기록이 있습니다. 입력 하나를 바꾸고 다시 계산하면 결과를 비교할 수 있습니다.':'기준 조건부터 기록하면 변경 전후를 비교할 수 있습니다.'},
  {id:'explain',label:'내 설명',status:hasExplanation?'done':'pending',detail:hasExplanation?'설명 메모가 있습니다. 현재 조건과 근거가 맞는지 직접 확인하세요.':'관찰한 사실, 적용한 모델, 이유, 다음 실험을 내 말로 적어 보세요.'}
 ];
 type Next={step:GuidanceStepId;action:GuidanceAction;label:string;detail:string};
 let next:Next;
 if(!validation.valid)next={step:'calculate',action:'calculate',label:'입력값 확인하기',detail:validation.message!};
 else if(!supported){
  if(m.id==='report')next={step:'explain',action:hasExplanation?'review':'explain',label:hasExplanation?'보고서로 정리하기':'내 실험 설명 작성하기',detail:'확인한 계산·실제 해석·미확인 항목을 구분해 기록하세요. 자동 채점이나 엔진 검증은 하지 않습니다.'};
  else if(!hasPrediction&&!hasRuns)next={step:'predict',action:'predict',label:'먼저 예측해 보기',detail:'앱에서 회로를 연결하기 전에 예상한 동작을 메모하세요.'};
  else if(!hasRuns)next={step:'calculate',action:'calculate',label:'실행 범위 기록하기',detail:'여기서는 MOS 전류·파형을 만들지 않습니다. 실행할 수 없는 이유를 기록하고 앱으로 이동하세요.'};
  else if(!hasExplanation)next={step:'calculate',action:'app',label:'실제 앱 실습 열기',detail:m.diagnosis};
  else next={step:'explain',action:'review',label:'내 설명과 실행 근거 점검하기',detail:'학생 메모는 자동 검증되지 않았습니다. 앱의 실제 실행 ID·revision·모델을 함께 확인하세요.'};
 }
 else if(!hasRuns)next=hasPrediction?{step:'calculate',action:'calculate',label:'기준 조건 계산하기',detail:'입력값과 단위를 확인하고 첫 수식 결과를 기록하세요.'}:{step:'predict',action:'predict',label:'먼저 예측해 보기',detail:'계산 버튼을 누르기 전에 예상한 결과와 이유를 한 문장으로 적어 보세요.'};
 else if(stale)next={step:'calculate',action:'calculate',label:'바뀐 조건 다시 계산하기',detail:'저장한 이전 결과는 그대로 남습니다. 현재 revision의 결과를 새로 기록하세요.'};
 else if(!hasPair)next={step:'compare',action:'change',label:'변수 하나 바꿔 보기',detail:'다른 입력은 유지하세요. 추천 값이 이미 입력되어 있다면 한 값을 직접 바꿔 새로운 조건을 만드세요.'};
 else if(!hasExplanation)next={step:'explain',action:'explain',label:'변화의 이유 설명하기',detail:comparison.kind==='multiple_variables'?'여러 변수가 함께 바뀌었습니다. 한 변수의 영향으로 단정하지 말고 추가 대조 실험을 제안하세요.':'저장된 두 결과를 읽고 어떤 조건 때문에 달라졌는지 내 말로 설명하세요.'};
 else next={step:'explain',action:'review',label:d.complete?'보고서로 정리하기':'자기 점검하고 마무리',detail:'메모와 결과를 확인한 뒤 자기 완료를 표시하세요. 이 표시는 정답 인증이나 엔진 PASS가 아닙니다.'};
 return {steps,next,validation,fresh:comparison.fresh,comparisonKind:comparison.kind,selfCompleteWithoutExplanation:d.complete&&!hasExplanation};
}
