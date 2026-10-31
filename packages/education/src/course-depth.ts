import {missionDraft,type Mission,type MissionDraft} from './course-workbook';
import {validateMissionInputs} from './course-guidance';

export type CourseDepthPage={id:string;title:string;kind:'intro'|'predict'|'input'|'baseline'|'change'|'recalculate'|'compare'|'scope'|'explain'|'finish';inputId?:string};
export function courseDepthPages(m:Mission):CourseDepthPage[]{
 const intro:CourseDepthPage={id:'intro',kind:'intro',title:m.title};
 const end:CourseDepthPage[]=[{id:'explain',kind:'explain',title:'내 말로 이유 설명하기'},{id:'finish',kind:'finish',title:'이번 실험 마무리'}];
 if(m.id==='report')return [intro,...end];
 if(!m.calculator)return [intro,{id:'predict',kind:'predict',title:'연결 전에 먼저 예상하기'},{id:'scope',kind:'scope',title:'실행 가능한 범위 확인'},...end];
 return [intro,{id:'predict',kind:'predict',title:'결과를 보기 전에 예상하기'},...m.inputs.map(input=>({id:'input:'+input.id,kind:'input' as const,title:input.label+' 설정',inputId:input.id})),{id:'baseline',kind:'baseline',title:'기준 조건 계산하기'},
  ...(m.inputs.some(input=>input.changed!==undefined)?[{id:'change',kind:'change' as const,title:'한 변수만 바꾸기',inputId:m.inputs.find(i=>i.changed!==undefined)!.id},{id:'recalculate',kind:'recalculate' as const,title:'바뀐 조건 계산하기'}]:[]),
  {id:'compare',kind:'compare',title:'변경 전후 숫자 비교'},...end];
}
/** Accept valid coupled values; isolate one field only while other fields are incomplete. */
export function courseFieldValidation(m:Mission,d:MissionDraft,id:string){
 if(!m.inputs.some(i=>i.id===id))return {valid:false,message:'지원되지 않는 입력입니다.',fieldId:id};
 const combined=validateMissionInputs(m,d);if(combined.valid)return combined;
 const defaults=missionDraft(m);
 return validateMissionInputs(m,{...defaults,inputs:{...defaults.inputs,[id]:d.inputs[id]}});
}
export function courseDepthIndex(m:Mission,id:string){return Math.max(0,courseDepthPages(m).findIndex(page=>page.id===id));}
