export type EduRoute={mode:'home'}|{mode:'projects'}|{mode:'workbook'}|{mode:'quiz';panel:'questions'|'puzzles'|'league'}|{mode:'design';step:number;lessonId?:string};
const lessonIdPattern='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
export const eduDesignSteps=['실습 시작','연결 관찰','적층 확인','기준 해석','조건 변경','재해석·비교','설명·저장'] as const;
export const eduResumeKey='resistor.edu.navigation.resume.v1';
export const eduDesignResumeKey='resistor.edu.navigation.design.v1';
export type EduResume={schema_version:1;edition:'edu';hash:string;updated_at:string};
export type EduDesignRoute=Extract<EduRoute,{mode:'design'}>;
export function readEduRoute(hash:string):EduRoute{
 if(hash==='#workbook')return {mode:'workbook'};
 if(hash==='#projects')return {mode:'projects'};
 const step=new RegExp('^#design/([1-7])(?:/lesson/('+lessonIdPattern+'))?$').exec(hash);
 if(step)return {mode:'design',step:Number(step[1]),...(step[2]?{lessonId:step[2]}:{})};
 const quiz=/^#quiz(?:\/(questions|puzzles|league))?$/.exec(hash);
 if(quiz)return {mode:'quiz',panel:(quiz[1]||'questions') as 'questions'|'puzzles'|'league'};
 return {mode:'home'};
}
export function eduHash(route:EduRoute){return route.mode==='home'?'#home':route.mode==='projects'?'#projects':route.mode==='workbook'?'#workbook':route.mode==='quiz'?'#quiz/'+route.panel:'#design/'+Math.max(1,Math.min(7,Number.isInteger(route.step)?route.step:1))+(route.lessonId&&new RegExp('^'+lessonIdPattern+'$').test(route.lessonId)?'/lesson/'+route.lessonId:'');}
export function readEduResume(value:unknown):EduResume|null{
 const v=value as EduResume;
 if(!v||v.schema_version!==1||v.edition!=='edu'||typeof v.hash!=='string'||typeof v.updated_at!=='string'||!Number.isFinite(Date.parse(v.updated_at)))return null;
 const route=readEduRoute(v.hash);if(route.mode==='home'||eduHash(route)!==v.hash)return null;
 return {schema_version:1,edition:'edu',hash:v.hash,updated_at:v.updated_at};
}
// Explicit deep links win. Mode switching keeps a separate design pointer so a
// visit to the workbook or quiz cannot erase the learner's last design page.
export function initialEduDesignRoute(current:EduRoute,savedDesign:unknown,lastScreen:unknown):EduDesignRoute{
 if(current.mode==='design')return current;
 for(const value of [savedDesign,lastScreen]){
  const saved=readEduResume(value);
  if(saved){const route=readEduRoute(saved.hash);if(route.mode==='design')return route;}
 }
 return {mode:'design',step:1};
}
export function eduRouteLabel(route:EduRoute){return route.mode==='design'?`설계 ${route.step}/7 · ${eduDesignSteps[route.step-1]}`:route.mode==='quiz'?({questions:'문제 은행·AI 자율학습',puzzles:'회로 퍼즐·대화 코치',league:'오늘의 리그·커뮤니티'})[route.panel]:route.mode==='projects'?'내 학습 프로젝트':route.mode==='workbook'?'첫 회로 실험 워크북':'메인';}
