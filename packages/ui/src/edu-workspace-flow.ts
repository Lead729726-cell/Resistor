import type {EduDesignRoute,EduRoute} from './edu-navigation';

export type EduLaunchGroup='study'|'design'|'records';
export type EduLaunchActivity='workbook'|'questions'|'puzzles'|'resume-design'|'new-design'|'projects'|'league';
export type EduSettingsTool='appearance'|'updates'|'legal'|'license';
export type EduWorkspacePage='closed'|'launch-goal'|'launch-activity'|'launch-ready'|'settings'|'preview'|EduSettingsTool;
export type EduWorkspaceFlow={
 page:EduWorkspacePage;
 group:EduLaunchGroup;
 selections:Record<EduLaunchGroup,EduLaunchActivity>;
};
export type EduWorkspaceAction=
 |{type:'open-launcher'|'open-settings'|'open-preview'|'back'|'close'}
 |{type:'choose-group';group:EduLaunchGroup}
 |{type:'choose-activity';activity:EduLaunchActivity}
 |{type:'open-tool';tool:EduSettingsTool};

export const eduLaunchGroups:ReadonlyArray<{id:EduLaunchGroup;title:string;description:string}>=[
 {id:'study',title:'기초부터 익히기',description:'수식·퀴즈·회로 퍼즐로 작은 실험을 시작합니다.'},
 {id:'design',title:'설계로 이해하기',description:'회로·레이아웃·실제 해석을 7단계로 살펴봅니다.'},
 {id:'records',title:'기록·리그 열기',description:'저장한 실습을 열거나 오늘의 문제에 참여합니다.'}
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
 ],
 records:[
  {id:'projects',title:'내 학습 프로젝트',description:'프로젝트별 조건·실행 기록·학생 설명을 다시 엽니다.'},
  {id:'league',title:'오늘의 리그',description:'공용 서버의 연결 상태를 확인합니다. 참가는 다음 화면에서 선택합니다.'}
 ]
};
export const eduSettingsTools:ReadonlyArray<{id:EduSettingsTool;title:string;description:string}>=[
 {id:'appearance',title:'화면 스타일',description:'화면 밝기를 고르고 다음 페이지에서 스킨을 정합니다.'},
 {id:'updates',title:'버전·다운로드',description:'Resistor Edu의 현재 버전과 업데이트를 확인합니다.'},
 {id:'legal',title:'이용·개인정보 안내',description:'Edu 사용 범위와 기록·온라인 기능의 정보를 확인합니다.'},
 {id:'license',title:'시리얼·기기',description:'이 기기의 인증 상태와 연결된 사용권을 확인합니다.'}
];

export function initialEduWorkspaceFlow():EduWorkspaceFlow{
 return {page:'closed',group:'study',selections:{study:'workbook',design:'resume-design',records:'projects'}};
}
export function eduWorkspaceFlow(state:EduWorkspaceFlow,action:EduWorkspaceAction):EduWorkspaceFlow{
 switch(action.type){
  case 'open-launcher':return {...state,page:'launch-goal'};
  case 'open-settings':return {...state,page:'settings'};
  case 'open-preview':return {...state,page:'preview'};
  case 'open-tool':return {...state,page:action.tool};
  case 'close':return {...state,page:'closed'};
  case 'choose-group':
   if(state.page!=='launch-goal'||!eduLaunchGroups.some(group=>group.id===action.group))return state;
   return {...state,page:'launch-activity',group:action.group};
  case 'choose-activity':
   if(state.page!=='launch-activity'||!eduLaunchActivities[state.group].some(option=>option.id===action.activity))return state;
   return {...state,page:'launch-ready',selections:{...state.selections,[state.group]:action.activity}};
  case 'back':return {...state,page:state.page==='launch-ready'?'launch-activity':state.page==='launch-activity'?'launch-goal':['appearance','updates','legal','license'].includes(state.page)?'settings':'closed'};
 }
}
export function eduWorkspaceChoice(state:EduWorkspaceFlow){
 return eduLaunchActivities[state.group].find(option=>option.id===state.selections[state.group])??eduLaunchActivities[state.group][0];
}
/** Opening a destination is explicit and carries only a route, never an execution. */
export function eduWorkspaceTarget(state:EduWorkspaceFlow,lastDesign:EduDesignRoute):EduRoute|null{
 if(state.page!=='launch-ready')return null;
 switch(eduWorkspaceChoice(state).id){
  case 'workbook':return {mode:'workbook'};
  case 'projects':return {mode:'projects'};
  case 'new-design':return {mode:'design',step:1};
  case 'resume-design':return {...lastDesign};
  case 'questions':return {mode:'quiz',panel:'questions'};
  case 'puzzles':return {mode:'quiz',panel:'puzzles'};
  case 'league':return {mode:'quiz',panel:'league'};
 }
}
