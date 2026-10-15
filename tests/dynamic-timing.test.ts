import test from 'node:test';
import assert from 'node:assert/strict';
import type {Run,TimingRecipe,Waveform} from '../packages/contracts/src/index';
import {checkDynamicTiming} from '../packages/analysis/src/dynamic-timing';
import {interpolate} from '../packages/analysis/src/waveform';
const recipe:TimingRecipe={schema_version:1,input:'A',output:'Y',polarity:'inverting',low_V:0,high_V:1.8,start_s:0,end_s:24e-9,settle_s:2e-9,max_delay_s:2e-9,max_rise_s:2e-9,max_fall_s:2e-9,minimum_cycles:2};
const input:Waveform={name:'A',unit:'V',x:[0,1,2,6,7,11,12,16,17,24].map(t=>t*1e-9),y:[0,0,1.8,1.8,0,0,1.8,1.8,0,0]};
function run(delay=.5e-9):Run{
 const x=[0,...input.x.slice(1,-1).map(t=>t+delay),24e-9];
 const output:Waveform={name:'Y',unit:'V',x,y:x.map(t=>1.8-interpolate(input,Math.max(0,Math.min(24e-9,t-delay))))};
 return {id:'r',project_id:'p',revision:4,kind:'simulation',tool:'ngspice',execution_status:'completed',analysis_result:'unknown',freshness:'current',measurements:{analysis:'tran',x_unit:'s'},waveforms:[input,output]};
}
test('two real-shaped fixture cycles: per-output polarity delays and slew known values use shared interpolation',()=>{
 const r=checkDynamicTiming(run(),recipe,4);assert.equal(r.status,'pass',JSON.stringify(r));assert.equal(r.rows.length,4);
 assert.ok(Math.abs(r.summary.tpLH_s!-.5e-9)<1e-21);assert.ok(Math.abs(r.summary.tpHL_s!-.5e-9)<1e-21);
 assert.ok(Math.abs(r.summary.rise_s!-.8e-9)<1e-21);assert.ok(Math.abs(r.summary.fall_s!-.8e-9)<1e-21);
 assert.equal(r.engine_result,'unknown');assert.equal(r.physical_signoff,false);
});
test('slow-input negative 50% delay is paired within the same full input transition, not a later cycle',()=>{
 const negative=run();negative.waveforms![1]={name:'Y',unit:'V',x:[0,1.2,1.4,6.2,6.4,11.2,11.4,16.2,16.4,24].map(t=>t*1e-9),y:[1.8,1.8,0,0,1.8,1.8,0,0,1.8,1.8]};
 const r=checkDynamicTiming(negative,recipe,4);assert.equal(r.status,'pass',JSON.stringify(r));assert.ok(r.rows.every(row=>Math.abs(row.delay_s!+.2e-9)<1e-21));
});
test('explicit delay limit violations, wrong logic and missing crossings cannot pass',()=>{
 const fine=run();fine.waveforms=fine.waveforms!.map(w=>{const x=[...new Set([...w.x,...Array.from({length:241},(_,i)=>i*.1e-9)])].filter(t=>t<=24e-9).sort((a,b)=>a-b);return {...w,x,y:x.map(t=>interpolate(w,t))};});
 const limited=checkDynamicTiming(fine,{...recipe,max_delay_s:1e-12},4);assert.equal(limited.status,'fail');
 const wrong=checkDynamicTiming(run(),{...recipe,polarity:'same'},4);assert.equal(wrong.status,'fail');
 const r=run();r.waveforms![1].y.fill(1.8);assert.equal(checkDynamicTiming(r,recipe,4).status,'fail');
});
test('limit inside a coarse sample crossing bracket is unavailable, not a point-estimate PASS',()=>{
 assert.equal(checkDynamicTiming(run(),{...recipe,max_delay_s:.7e-9},4).status,'unavailable');
 assert.equal(checkDynamicTiming(run(),{...recipe,max_rise_s:.9e-9,max_fall_s:.9e-9},4).status,'unavailable');
});
test('no input edges, missing cycles and truncated scope remain unavailable',()=>{
 const r=run();r.waveforms![0]={...input,y:input.y.map(()=>0)};
 assert.equal(checkDynamicTiming(r,recipe,4).status,'unavailable');
 assert.equal(checkDynamicTiming(run(),{...recipe,minimum_cycles:3},4).status,'unavailable');
 assert.equal(checkDynamicTiming(run(),{...recipe,end_s:30e-9},4).status,'unavailable');
});
test('stale results are historical; imported, incomplete, wrong units, OP and invalid recipes cannot certify timing',()=>{
 const r=run();assert.equal(checkDynamicTiming(r,recipe,5).status,'stale');
 assert.equal(checkDynamicTiming({...r,freshness:'stale'},recipe,4).status,'stale');
 for(const extra of [{workflow:'imported-results'},{execution_status:'failed'},{native_execution:false},{measurements:{analysis:'op',x_unit:'point'}}] as Partial<Run>[])assert.equal(checkDynamicTiming({...r,...extra},recipe,4).status,'unavailable');
 r.waveforms![1]={...r.waveforms![1],unit:'A'};assert.equal(checkDynamicTiming(r,recipe,4).status,'unavailable');
 for(const change of [{minimum_cycles:0},{high_V:0},{max_delay_s:NaN},{input:'Y'}])assert.throws(()=>checkDynamicTiming(run(),{...recipe,...change},4));
});
test('additional same-cycle output glitches fail rather than matching a convenient later edge',()=>{
 const r=run(),out=r.waveforms![1];const points=[...out.x.map((t,i)=>[t,out.y[i]]),[3e-9,0],[3.2e-9,1.8],[3.4e-9,0]].sort((a,b)=>a[0]-b[0]);r.waveforms![1]={...out,x:points.map(p=>p[0]),y:points.map(p=>p[1])};
 assert.equal(checkDynamicTiming(r,recipe,4).status,'fail');
});
