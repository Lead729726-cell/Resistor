import type {StudyQuestion} from './self-study.ts';
const units:Record<string,[string,number]>={'': ['ratio',1],'Ω':['ohm',1],ohm:['ohm',1],V:['V',1],A:['A',1],W:['W',1],s:['s',1],Hz:['Hz',1],H:['H',1],F:['F',1],C:['C',1],J:['J',1],dB:['dB',1],'V/code':['V/code',1],'V/V':['ratio',1],bits:['bits',1],bit:['bits',1]};
const prefixes:Record<string,number>={p:1e-12,n:1e-9,u:1e-6,'µ':1e-6,'μ':1e-6,m:1e-3,k:1e3,M:1e6,G:1e9};
function unit(value:string):[string,number]{const u=value.replaceAll('Ω','Ω');if(units[u])return units[u];if(u.length>1&&prefixes[u[0]]&&units[u.slice(1)])return [units[u.slice(1)][0],prefixes[u[0]]*units[u.slice(1)][1]];throw Error('표시된 단위 또는 같은 차원의 SI 접두 단위를 사용하세요.');}
export function parseStudyNumber(answer:string,expectedUnit:string){
 const m=answer.normalize('NFKC').trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*(\S*)$/);if(!m)throw Error('수치와 단위를 입력하세요. 예: 0.9 V, 900 mV, 1e-3 A.');
 const n=Number(m[1]),from=unit(m[2]||expectedUnit),to=unit(expectedUnit);if(!Number.isFinite(n)||from[0]!==to[0])throw Error('유한한 수치와 문제에 맞는 단위를 사용하세요.');const value=n*from[1]/to[1];if(!Number.isFinite(value))throw Error('수치 범위를 초과했습니다.');return value;
}
export function gradeObjective(q:StudyQuestion,answer:string){
 if(q.kind==='explanation')throw Error('서술형은 모델 피드백 또는 해설 비교가 필요합니다.');
 const actual=q.kind==='numeric'?parseStudyNumber(answer,q.unit||''):Number(answer);
 if(q.kind==='choice'&&(!/^\d+$/.test(answer)||!Number.isInteger(actual)||actual<0||actual>=q.choices!.length))throw Error('제시된 선택지 한 개를 고르세요.');
 const expected=q.kind==='numeric'?q.expected!:q.correct_index!,tolerance=q.kind==='numeric'?Math.max(Math.abs(expected)*.001,Number.EPSILON*Math.max(Math.abs(expected),Number.MIN_VALUE)*8):0;
 const correct=Math.abs(actual-expected)<=tolerance;
 return {status:'graded',score:correct?100:0,correct,method:'deterministic',feedback:correct?'저장된 기준과 일치합니다.':'저장된 기준과 다릅니다. 수식·입력 조건·단위를 다시 확인하세요.',actual,expected,tolerance,unit:q.unit||'',solution:q.solution,formula:q.formula||null,advisory_only:true,engine_verification:false};
}
