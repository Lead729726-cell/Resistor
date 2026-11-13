import type {EduDesignRoute,EduRoute} from './edu-navigation';

export type EduLaunchGroup='study'|'design';
export type EduLaunchActivity='workbook'|'questions'|'puzzles'|'resume-design'|'new-design';
export type EduLearningTool='projects'|'league'|'preview';
export type EduSettingsTool='appearance'|'updates'|'legal'|'license';
export type EduWorkspacePage='closed'|'launch-goal'|'launch-activity'|'tools'|'settings'|'preview'|EduSettingsTool;
export type EduWorkspaceFlow={
 page:EduWorkspacePage;
 launchOrigin:'closed'|'tools';
 group:EduLaunchGroup;
 selections:Record<EduLaunchGroup,EduLaunchActivity>;
};
export type EduWorkspaceAction=
 |{type:'open-launcher'|'open-tools'|'open-settings'|'open-preview'|'back'|'close'}
 |{type:'open-group';group:EduLaunchGroup}
 |{type:'choose-group';group:EduLaunchGroup}
 |{type:'choose-activity';activity:EduLaunchActivity}
 |{type:'open-tool';tool:EduSettingsTool};

export const eduLaunchGroups:ReadonlyArray<{id:EduLaunchGroup;title:string;description:string}>=[
 {id:'study',title:'퀴즈·공부',description:'워크북·퀴즈·회로 퍼즐로 기초를 익힙니다.'},
 {id:'design',title:'설계·시뮬레이션',description:'회로를 바꾸고, 해석하고, 설명하는 7단계 실습입니다.'}
];
export const eduLaunchActivities:Record<EduLaunchGroup,ReadonlyArray<{id:EduLaunchActivity;title:string;description:string}>>={
 study:[
  {id:'workbook',title:'첫 회로 워크북',description:'전압·저항·RC를 수식으로 계산하고 내 설명을 남깁니다.'},
  {id:'questions',title:'퀴즈·자율학습',description:'문제를 하나씩 풀고 저장한 답안과 피드백을 다시 봅니다.'},
  {id:'puzzles',title:'회로 퍼즐',description:'소자를 꽂고 연결합니다. 파형은 실제 엔진이 연결되어야 볼 수 있습니다.'}
 ],
 design:[
  {id:'resume-design',title:'마지막 설계 이어가기',description:'마지막으로 열었던 설계 단계로 돌아갑니다.'},
  {id:'new-design',title:'1단계부터 실습 선택',description:'기존 기록을 유지한 채 실습 선택 화면을 엽니다.'}
 ]
};
export const eduLearningTools:ReadonlyArray<{id:EduLearningTool;title:string;description:string}>=[
 {id:'projects',title:'내 학습 프로젝트',description:'저장한 조건·실행 기록·내 설명을 다시 엽니다.'},
 {id:'league',title:'오늘의 리그',description:'연결과 참가는 리그 화면에서 직접 선택합니다.'},
 {id:'preview',title:'작업대 미리보기',description:'화면 조작 모형을 살펴봅니다. 실제 설계 해석은 아닙니다.'}
];
export const eduSettingsTools:ReadonlyArray<{id:EduSettingsTool;title:string;description:string}>=[
 {id:'appearance',title:'화면 스타일',description:'화면 밝기를 고르고 다음 페이지에서 스킨을 정합니다.'},
 {id:'updates',title:'버전·다운로드',description:'Resistor Edu의 현재 버전과 업데이트를 확인합니다.'},
 {id:'legal',title:'이용·개인정보 안내',description:'Edu 사용 범위와 기록·온라인 기능의 정보를 확인합니다.'},
 {id:'license',title:'시리얼·기기',description:'이 기기의 인증 상태와 연결된 사용권을 확인합니다.'}
];

export function initialEduWorkspaceFlow():EduWorkspaceFlow{
 return {page:'closed',launchOrigin:'closed',group:'study',selections:{study:'workbook',design:'resume-design'}};
}
export function eduWorkspaceFlow(state:EduWorkspaceFlow,action:EduWorkspaceAction):EduWorkspaceFlow{
 switch(action.type){
  case 'open-launcher':return {...state,page:'launch-goal',launchOrigin:state.page==='tools'?'tools':'closed'};
  case 'open-group':
   if(!eduLaunchGroups.some(group=>group.id===action.group))return state;
   return {...state,page:'launch-activity',group:action.group,launchOrigin:'closed'};
  case 'open-tools':return {...state,page:'tools'};
  case 'open-settings':return {...state,page:'settings'};
  case 'open-preview':return state.page==='tools'?{...state,page:'preview'}:state;
  case 'open-tool':return {...state,page:action.tool};
  case 'close':return {...state,page:'closed'};
  case 'choose-group':
   if(state.page!=='launch-goal'||!eduLaunchGroups.some(group=>group.id===action.group))return state;
   return {...state,page:'launch-activity',group:action.group};
  case 'choose-activity':
   if(state.page!=='launch-activity'||!eduLaunchActivities[state.group].some(option=>option.id===action.activity))return state;
   return {...state,selections:{...state.selections,[state.group]:action.activity}};
  case 'back':return {...state,page:state.page==='launch-activity'?'launch-goal':state.page==='launch-goal'?state.launchOrigin:state.page==='preview'?'tools':['appearance','updates','legal','license'].includes(state.page)?'settings':'closed'};
 }
}
export function eduWorkspaceChoice(state:EduWorkspaceFlow){
 return eduLaunchActivities[state.group].find(option=>option.id===state.selections[state.group])??eduLaunchActivities[state.group][0];
}
/** Opening a destination is explicit and carries only a route, never an execution. */
export function eduWorkspaceTarget(state:EduWorkspaceFlow,lastDesign:EduDesignRoute):EduRoute|null{
 if(state.page!=='launch-activity')return null;
 switch(eduWorkspaceChoice(state).id){
  case 'workbook':return {mode:'workbook'};
  case 'new-design':return {mode:'design',step:1};
  case 'resume-design':return {...lastDesign};
  case 'questions':return {mode:'quiz',panel:'questions'};
  case 'puzzles':return {mode:'quiz',panel:'puzzles'};
 }
}
/** Secondary destinations never register a learner or start an online league. */
export function eduWorkspaceToolTarget(state:EduWorkspaceFlow,tool:EduLearningTool):EduRoute|null{
 if(state.page!=='tools')return null;
 return tool==='projects'?{mode:'projects'}:tool==='league'?{mode:'quiz',panel:'league'}:null;
}
