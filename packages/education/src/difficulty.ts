export type DifficultyLevel=1|2|3;
export const difficultyPolicy='edu-difficulty-v1';
export const difficultyLevels=[
 {level:1 as const,label:'기초',description:'한 공식의 순방향 계산과 기본 단위 읽기',steps:'1단계'},
 {level:2 as const,label:'응용',description:'두 계산 연결, 단위 변환과 중간값 해석',steps:'2단계'},
 {level:3 as const,label:'심화',description:'부하·등가회로 조건을 해석하는 다단계 계산',steps:'3단계 이상'}
];
export function difficultyLevel(value:unknown):DifficultyLevel{if(value!==1&&value!==2&&value!==3)throw Error('난이도는 1·2·3 중에서 선택하세요.');return value;}
export function classifyDifficulty(q:{level:number;kind:string;origin?:string;provenance?:Record<string,unknown>}){
 const level=difficultyLevel(q.level),definition=difficultyLevels[level-1],steps=q.provenance?.difficulty_steps;
 const source=q.provenance?.numerical_trace?'bounded-calculator-composition':q.origin==='ai'?'requested-ai-level':'authored-level';
 return {level,label:definition.label,description:definition.description,source,policy_version:difficultyPolicy,
  reason:typeof steps==='number'?`공통 계산 엔진 ${steps}단계 연결 · ${definition.description}`:q.kind==='explanation'?'저장된 출제 수준 · 원리·조건·한계의 설명 요구':definition.description,
  empirical_calibration:false};
}
export type DifficultyEvidence={key:string;level:number;score:number;eligible?:boolean};
export function recommendDifficulty(records:DifficultyEvidence[]){
 // Caller supplies chronological records. One independent result per key;
 // assisted, QA, invalid and non-objective records are rejected by callers.
 const seen=new Set<string>(),eligible=records.filter(r=>{if(r.eligible===false||![1,2,3].includes(r.level)||!Number.isFinite(r.score)||r.score<0||r.score>100||seen.has(r.key))return false;seen.add(r.key);return true;});
 const current=difficultyLevel(eligible.at(-1)?.level??1),window:DifficultyEvidence[]=[];
 for(let i=eligible.length-1;i>=0&&window.length<3;i--){if(eligible[i].level!==current)break;window.unshift(eligible[i]);}
 const average=window.length?window.reduce((n,r)=>n+r.score,0)/window.length:null;
 const next=difficultyLevel(window.length===3&&average!==null?(average>=80?Math.min(3,current+1):average<=40?Math.max(1,current-1):current):current);
 const action=next>current?'raise':next<current?'lower':'hold';
 const reason=!window.length?'독립 풀이 기록이 없어 기초부터 시작합니다.':window.length<3?`${difficultyLevels[current-1].label} 독립 풀이 ${window.length}/3개 · 기록이 더 쌓일 때까지 유지합니다.`:`${difficultyLevels[current-1].label} 최근 독립 풀이 3개 평균 ${average!.toFixed(1)}점 · ${action==='raise'?'80점 이상으로 한 단계 올립니다.':action==='lower'?'40점 이하로 한 단계 낮춥니다.':'현재 수준을 유지합니다.'}`;
 return {level:next,current_level:current,label:difficultyLevels[next-1].label,action,reason,sample_count:window.length,evidence_count:eligible.length,average,method:'deterministic-performance-rule',policy_version:difficultyPolicy,empirical_calibration:false};
}
