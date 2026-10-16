export type EduRoute={mode:'home'}|{mode:'quiz';panel:'questions'|'puzzles'|'league'}|{mode:'design';step:number};
export function readEduRoute(hash:string):EduRoute{
 const step=/^#design\/([1-7])$/.exec(hash);
 if(step)return {mode:'design',step:Number(step[1])};
 const quiz=/^#quiz(?:\/(questions|puzzles|league))?$/.exec(hash);
 if(quiz)return {mode:'quiz',panel:(quiz[1]||'questions') as 'questions'|'puzzles'|'league'};
 return {mode:'home'};
}
export function eduHash(route:EduRoute){return route.mode==='home'?'#home':route.mode==='quiz'?'#quiz/'+route.panel:'#design/'+Math.max(1,Math.min(7,Number.isInteger(route.step)?route.step:1));}
