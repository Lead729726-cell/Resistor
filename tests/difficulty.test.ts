import test from 'node:test';
import assert from 'node:assert/strict';
import {difficultyLevel,classifyDifficulty,recommendDifficulty} from '../packages/education/src/difficulty';
import {leagueQuestion,leagueKinds,publicLeagueQuestion} from '../packages/education/src/league-problems';
import {gradeObjective} from '../packages/education/src/study-grading';

test('difficulty rules need three independent same-level results and never cross floor or ceiling',()=>{
 const outcomes=(level:number,scores:number[])=>scores.map((score,i)=>({key:String(i),level,score}));
 assert.equal(recommendDifficulty([]).level,1);
 assert.equal(recommendDifficulty(outcomes(1,[100,100])).level,1);
 assert.equal(recommendDifficulty(outcomes(1,[80,80,80])).level,2);
 assert.equal(recommendDifficulty(outcomes(2,[40,40,40])).level,1);
 assert.equal(recommendDifficulty(outcomes(2,[41,41,41])).level,2);
 assert.equal(recommendDifficulty(outcomes(3,[100,100,100])).level,3);
 assert.equal(recommendDifficulty(outcomes(1,[0,0,0])).level,1);
 assert.equal(recommendDifficulty([{key:'a',level:1,score:100},{key:'a',level:1,score:100},{key:'a',level:1,score:100}]).sample_count,1);
 assert.equal(recommendDifficulty([{key:'a',level:2,score:100},{key:'b',level:1,score:100},{key:'c',level:2,score:100}]).sample_count,1);
 assert.equal(recommendDifficulty([{key:'a',level:2,score:100,eligible:false},{key:'b',level:8,score:100},{key:'c',level:2,score:NaN},{key:'d',level:2,score:101}]).evidence_count,0);
 for(const value of [0,4,1.5,'2',null,NaN])assert.throws(()=>difficultyLevel(value));
 assert.equal(classifyDifficulty({level:2,kind:'numeric',provenance:{numerical_trace:[],difficulty_steps:2}}).source,'bounded-calculator-composition');
 assert.equal(classifyDifficulty({level:3,kind:'explanation',origin:'ai'}).empirical_calibration,false);
});

test('all tier compositions agree with independent circuit equations, units and immutable public boundaries',()=>{
 const rs=[1000,2200,4700,10000,22000,47000],vs=[1.8,2.5,3.3,5,9,12],cs=[10e-9,22e-9,47e-9,100e-9,220e-9,1e-6],is=[.001,.002,.005,.01];
 const par=(x:number,y:number)=>x*y/(x+y);
 for(const level of [2,3] as const)for(const kind of leagueKinds)for(let a=0;a<16;a++)for(let b=0;b<16;b++)for(let c=0;c<16;c++){
  const r1=rs[a%6],r2=rs[b%6],r3=rs[c%6],r4=rs[(a+b+1)%6],v=vs[c%6],cap=cs[b%6];
  const expected={
   'voltage-divider':level===2?v*par(r2,r3)/(r1+par(r2,r3)):v*par(r3,r4)/(r1+r2+par(r3,r4)),
   'parallel-resistor':par(r1+r2,level===2?r3:par(r3,r4)),
   'ohms-law':is[b%4]*(level===2?r1+r2:r1+par(r2,r3)),
   'rc-time-constant':(level===2?r1+r2:par(r1,r2)+r3)*cap,
   'power-dissipation':level===2?(v*r2/(r1+r2))**2/r2:(v*par(r2,r3)/(r1+par(r2,r3)))**2/r3,
   'frequency-period':2*Math.PI*(level===2?r1:par(r1,r2))*cap
  };
  const q=leagueQuestion({kind,variants:[a,b,c]},0,level),answer=q.expected!;
  assert.ok(Number.isFinite(answer)&&answer>0);
  assert.ok(Math.abs(answer-expected[kind])/expected[kind]<1e-3,kind+' L'+level+' within existing 0.1% grading tolerance');
  assert.equal(gradeObjective(q,String(expected[kind])+' '+q.unit).score,100);
  assert.equal(q.level,level);assert.ok(Number(q.provenance?.difficulty_steps)>=2);
  const publicText=JSON.stringify(publicLeagueQuestion(q));for(const hidden of ['numerical_trace','expected','solution','inputs'])assert.ok(!publicText.includes('"'+hidden+'"'));
 }
});
