import type {Run,TimingRecipe,Waveform} from '../../contracts/src/index';
import {axisUnit,clipWaveform,crossings,timingMeasurements,validateWaveform} from './waveform';

export type TimingStatus='pass'|'fail'|'unavailable'|'stale';
export interface TimingRow {input_edge:'rising'|'falling';output_edge:'rising'|'falling';trigger_s:number;window_s:[number,number];target_s:number|null;delay_s:number|null;delay_bracket_s:[number,number]|null;rise_s:number|null;fall_s:number|null;slew_bracket_s:[number,number]|null;status:Exclude<TimingStatus,'stale'>;reasons:string[]}
export interface TimingReport {schema_version:1;method:'sampled-single-input-timing-v1';run_id:string;project_id:string;revision:number;current_revision:number;recipe:TimingRecipe;status:TimingStatus;reasons:string[];rows:TimingRow[];checks:{name:string;status:Exclude<TimingStatus,'stale'>;reason:string}[];summary:{tpLH_s:number|null;tpHL_s:number|null;rise_s:number|null;fall_s:number|null;input_rises:number;input_falls:number};engine_result:string;physical_signoff:false}

export function validateTimingRecipe(r:TimingRecipe){
  const numeric=['low_V','high_V','start_s','end_s','settle_s','max_delay_s','max_rise_s','max_fall_s','minimum_cycles'] as const;
  if(r.schema_version!==1||numeric.some(k=>typeof r[k]!=='number'||!Number.isFinite(r[k]))||!['same','inverting'].includes(r.polarity)||!r.input||!r.output||r.input===r.output||r.low_V>=r.high_V||r.start_s<0||r.end_s<=r.start_s||r.end_s>.001||!Number.isInteger(r.minimum_cycles)||r.minimum_cycles<1||r.minimum_cycles>64||r.low_V< -1000||r.high_V>1000||(['settle_s','max_delay_s','max_rise_s','max_fall_s'] as const).some(k=>r[k]<1e-12||r[k]>.001))throw Error('전압 범위·시간 구간·양수 지연 한도·최소 1–64주기를 확인하세요.');
  return r;
}
const bracket=(w:Waveform,t:number):[number,number]=>{
  let lo=0,hi=w.x.length-1;while(lo<hi){const m=(lo+hi)>>1;if(w.x[m]<t)lo=m+1;else hi=m;}
  return w.x[lo]===t?[t,t]:[w.x[Math.max(0,lo-1)],w.x[lo]];
};
const mean=(v:(number|null)[])=>{const n=v.filter((x):x is number=>x!==null);return n.length?n.reduce((a,b)=>a+b,0)/n.length:null;};
const limits=(b:[number,number],max:number):Exclude<TimingStatus,'stale'>=>b[0]>max?'fail':b[1]>max?'unavailable':'pass';

/** All verdicts derive from original numerical samples and an explicit recipe.
 * Input 10%/90% transitions bound edge pairing, including negative 50% delay.
 * Missing/ambiguous edges never borrow a crossing from a later input cycle. */
export function checkDynamicTiming(run:Run,recipe:TimingRecipe,currentRevision:number):TimingReport{
  const r=validateTimingRecipe(recipe),out:TimingReport={schema_version:1,method:'sampled-single-input-timing-v1',run_id:run.id,project_id:run.project_id,revision:run.revision,current_revision:currentRevision,recipe:{...r},status:'unavailable',reasons:[],rows:[],checks:[],summary:{tpLH_s:null,tpHL_s:null,rise_s:null,fall_s:null,input_rises:0,input_falls:0},engine_result:run.analysis_result,physical_signoff:false};
  const unavailable=(message:string)=>{out.reasons.push(message);if(run.freshness==='stale'||run.revision!==currentRevision)out.status='stale';return out;};
  if(run.execution_status!=='completed'||run.native_execution===false||run.workflow==='imported-results'||run.tool!=='ngspice')return unavailable('완료된 실제 ngspice 실행이 필요합니다. 반입 파일·미실행 결과로 현재 검증을 통과시키지 않습니다.');
  const input=run.waveforms?.find(w=>w.name===r.input),output=run.waveforms?.find(w=>w.name===r.output);
  if(!input||!output)return unavailable('선택한 입력·출력의 실제 전압 파형이 없습니다.');
  if(input.unit!=='V'||output.unit!=='V'||axisUnit(run,input)!=='s'||axisUnit(run,output)!=='s'||run.measurements?.analysis!=='tran')return unavailable('같은 transient 실행의 전압(V)·시간(s) 파형이 필요합니다.');
  try{validateWaveform(input);validateWaveform(output);}catch(e){return unavailable(e instanceof Error?e.message:String(e));}
  if(input.x[0]>r.start_s||output.x[0]>r.start_s||input.x.at(-1)!<r.end_s*(1-1e-12)||output.x.at(-1)!<r.end_s*(1-1e-12))return unavailable('측정 구간을 실제 파형이 모두 포함하지 않습니다. 외삽하지 않습니다.');
  const end=Math.min(r.end_s,input.x.at(-1)!,output.x.at(-1)!);
  const iw=clipWaveform(input,r.start_s,end),ow=clipWaveform(output,r.start_s,end),span=r.high_V-r.low_V,mid=r.low_V+.5*span;
  const events=[...crossings(iw,mid,'rising').map(t=>({t,edge:'rising' as const})),...crossings(iw,mid,'falling').map(t=>({t,edge:'falling' as const}))].sort((a,b)=>a.t-b.t);
  if(events.length>2048)return unavailable('주기별 검사는 최대 2048개 입력 전이를 지원합니다. 측정 구간을 줄이세요.');
  const thresholds={rising:{begin:crossings(iw,r.low_V+.1*span,'rising'),finish:crossings(iw,r.low_V+.9*span,'rising')},falling:{begin:crossings(iw,r.low_V+.9*span,'falling'),finish:crossings(iw,r.low_V+.1*span,'falling')}};
  const crossingsOut={rising:crossings(ow,mid,'rising'),falling:crossings(ow,mid,'falling')};
  const full=events.map((e,i)=>{const prev=events[i-1]?.t??r.start_s,next=events[i+1]?.t??end;return {...e,begin:thresholds[e.edge].begin.filter(t=>t<=e.t&&t>=prev).at(-1),finish:thresholds[e.edge].finish.find(t=>t>=e.t&&t<=next)};});
  let stableWindows=0,unstable=0;
  for(let i=0;i<full.length;i++){
    const e=full[i],targetEdge=r.polarity==='same'?e.edge:e.edge==='rising'?'falling':'rising',next=full[i+1]?.begin??full[i+1]?.t??end;
    const row:TimingRow={input_edge:e.edge,output_edge:targetEdge,trigger_s:e.t,window_s:[e.begin??e.t,next],target_s:null,delay_s:null,delay_bracket_s:null,rise_s:null,fall_s:null,slew_bracket_s:null,status:'unavailable',reasons:[]};out.rows.push(row);
    if(e.begin===undefined||e.finish===undefined){row.reasons.push('입력의 완전한 10–90%/90–10% 전이가 없습니다.');continue;}
    const matches=crossingsOut[targetEdge].filter(t=>t>=e.begin!&&t<next),other=crossingsOut[targetEdge==='rising'?'falling':'rising'].filter(t=>t>=e.begin!&&t<next);
    if(matches.length!==1||other.length){row.status=matches.length===0&&next-e.t<r.max_delay_s?'unavailable':'fail';row.reasons.push(matches.length===0?'해당 입력 전이의 출력 교차가 없습니다.':'같은 입력 구간에서 추가 출력 전이/글리치가 관찰됐습니다.');}
    else{
      row.target_s=matches[0];row.delay_s=matches[0]-e.t;
      const a=bracket(input,e.t),b=bracket(output,matches[0]);row.delay_bracket_s=[b[0]-a[1],b[1]-a[0]];
      row.status=limits(row.delay_bracket_s,r.max_delay_s);
      if(row.status!=='pass')row.reasons.push(row.status==='fail'?'전파 지연이 한도를 초과했습니다.':'지연 한도가 표본 교차 구간 안에 있어 더 작은 시간 간격이 필요합니다.');
      const t=timingMeasurements(output,e.begin,next,r.low_V,r.high_V);row.rise_s=targetEdge==='rising'?t.rise:null;row.fall_s=targetEdge==='falling'?t.fall:null;
      const slew=targetEdge==='rising'?row.rise_s:row.fall_s,max=targetEdge==='rising'?r.max_rise_s:r.max_fall_s;
      if(slew===null){if(row.status!=='fail')row.status='unavailable';row.reasons.push('출력의 완전한 10–90%/90–10% 전이가 없습니다.');}
      else {
        const window=clipWaveform(output,e.begin,next),from=targetEdge==='rising'?.1:.9,to=targetEdge==='rising'?.9:.1;
        const start=crossings(window,r.low_V+from*span,targetEdge).filter(t=>t<=matches[0]).at(-1),finish=crossings(window,r.low_V+to*span,targetEdge).find(t=>t>=matches[0]);
        if(start===undefined||finish===undefined||Math.abs(finish-start-slew)>1e-18){if(row.status!=='fail')row.status='unavailable';row.reasons.push('출력 전이 구간을 하나로 확정할 수 없습니다.');}
        else {
          const a=bracket(output,start),b=bracket(output,finish);row.slew_bracket_s=[Math.max(0,b[0]-a[1]),b[1]-a[0]];
          const verdict=limits(row.slew_bracket_s,max);
          if(verdict==='fail'){row.status='fail';row.reasons.push('출력 상승/하강 시간이 한도를 초과했습니다.');}
          else if(verdict==='unavailable'){if(row.status!=='fail')row.status='unavailable';row.reasons.push('전이 시간 한도가 표본 구간 안에 있어 더 작은 시간 간격이 필요합니다.');}
        }
      }
    }
    const from=e.finish+r.settle_s;
    if(from<next){
      stableWindows++;const stable=clipWaveform(output,from,next),expectedHigh=(e.edge==='rising')===(r.polarity==='same');
      const wrong=expectedHigh?stable.y.some(v=>v<r.low_V+.7*span):stable.y.some(v=>v>r.low_V+.3*span);
      if(wrong){unstable++;row.status='fail';row.reasons.push('정착 시간 후 기대한 출력 논리 레벨이 유지되지 않았습니다.');}
    }else{if(row.status!=='fail')row.status='unavailable';row.reasons.push('이 입력 구간에는 정착 후 관찰 시간이 부족합니다.');}
  }
  const rises=full.filter(e=>e.edge==='rising').length,falls=full.filter(e=>e.edge==='falling').length;
  out.summary={tpLH_s:mean(out.rows.filter(e=>e.output_edge==='rising').map(e=>e.delay_s)),tpHL_s:mean(out.rows.filter(e=>e.output_edge==='falling').map(e=>e.delay_s)),rise_s:mean(out.rows.map(e=>e.rise_s)),fall_s:mean(out.rows.map(e=>e.fall_s)),input_rises:rises,input_falls:falls};
  out.checks.push({name:'주기/양방향 전이 범위',status:rises>=r.minimum_cycles&&falls>=r.minimum_cycles?'pass':'unavailable',reason:`입력 상승 ${rises}, 하강 ${falls} · 각 ${r.minimum_cycles}개 이상 필요`});
  out.checks.push({name:'정착 후 논리 관계',status:unstable?'fail':stableWindows===full.length&&stableWindows>0?'pass':'unavailable',reason:`관찰 가능한 정착 구간 ${stableWindows}개 · 논리 불일치 ${unstable}개`});
  out.checks.push({name:'주기별 지연·전이 시간',status:out.rows.some(r=>r.status==='fail')?'fail':out.rows.length&&out.rows.every(r=>r.status==='pass')?'pass':'unavailable',reason:'50% 전파 지연, 출력 10–90%/90–10%, 입력 전이 구간 안에서만 짝지음'});
  out.status=out.checks.some(c=>c.status==='fail')?'fail':out.checks.every(c=>c.status==='pass')?'pass':'unavailable';
  out.reasons=out.checks.filter(c=>c.status!=='pass').map(c=>c.reason);
  if(run.freshness==='stale'||run.revision!==currentRevision){out.status='stale';out.reasons.unshift('이전 revision 또는 변경된 엔진/모델의 기록입니다. 현재 설계의 합격 판정으로 사용하지 않습니다.');}
  return out;
}
