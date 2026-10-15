import {useMemo} from 'react';
import type {Run} from '@mos/contracts';
import {checkDynamicTiming} from '../../analysis/src/dynamic-timing';
import {formatNumber} from './WavePlot';
import './dynamic-signals.css';
const labels={pass:'기준 충족',fail:'기준 불충족',unavailable:'판정 불가',stale:'이전 조건'};
export default function DynamicTimingPanel({run,revision}:{run:Run;revision:number}){
 const result=useMemo(()=>{try{return {report:run.timing_recipe?checkDynamicTiming(run,run.timing_recipe,revision):null,error:null};}catch(e){return {report:null,error:e instanceof Error?e.message:String(e)};}},[run,revision]);
 if(!run.timing_recipe)return null;const r=result.report;
 const scaled=(v:number,m:number)=>String(Number((v*m).toPrecision(15)));
 const show=(v:number|null)=>v===null?'관측 없음':`${formatNumber(v)} s`;
 const exportReport=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({...r,source_stimuli:run.source_stimuli,engine_settings:run.measurements},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`timing-${run.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);};
 return <section className="dynamic-timing-panel" aria-label="동적 신호·지연 검증 결과" data-testid="dynamic-timing-panel"><header><strong>동적 신호·지연 검증</strong><span data-testid="timing-verdict" data-status={r?.status} className={`timing-${r?.status}`}>{r?labels[r.status]:'판정 불가'}</span><code>r{run.revision} · {run.id.slice(0,8)}</code>{r&&<button onClick={exportReport}>타이밍 JSON</button>}</header>
  {result.error&&<p role="alert">{result.error}</p>}{r&&<><p>{r.recipe.input} → {r.recipe.output} · {r.recipe.polarity==='inverting'?'반전':'동상'} · 50% 지연 / 10–90% 상승 / 90–10% 하강 · 다른 제어 입력 고정 조건</p>
  <div className="timing-summary">{([['tpLH',r.summary.tpLH_s],['tpHL',r.summary.tpHL_s],['Rise',r.summary.rise_s],['Fall',r.summary.fall_s]] as const).map(([name,v])=><div key={name}><span>{name} · 관측 평균</span><strong data-testid={`timing-${name}`}>{show(v)}</strong></div>)}</div>
  <p>관측 {scaled(r.recipe.start_s,1e9)}–{scaled(r.recipe.end_s,1e9)} ns · 정착 {scaled(r.recipe.settle_s,1e9)} ns · 지연 상한 {scaled(r.recipe.max_delay_s,1e12)} ps · 상승/하강 상한 {scaled(r.recipe.max_rise_s,1e12)}/{scaled(r.recipe.max_fall_s,1e12)} ps</p>
  {r.checks.map(c=><p key={c.name}><strong>{c.name}: {labels[c.status]}</strong> · {c.reason}</p>)}{r.reasons.map((reason,i)=><p className="timing-reason" key={i}>{reason}</p>)}
  <details><summary>주기별 실제 교차·지연·판정 {r.rows.length}개</summary><div className="timing-table"><table><thead><tr><th>입력 → 출력 전이</th><th>입력 교차</th><th>출력 교차</th><th>지연</th><th>지연 표본 구간</th><th>출력 전이 시간</th><th>판정 / 근거</th></tr></thead><tbody>{r.rows.map((row,i)=><tr key={i}><td>{row.input_edge} → {row.output_edge}</td><td>{show(row.trigger_s)}</td><td>{show(row.target_s)}</td><td>{show(row.delay_s)}</td><td>{row.delay_bracket_s?.map(show).join(' … ')??'관측 없음'}</td><td>{show(row.rise_s??row.fall_s)}<br/>{row.slew_bracket_s?.map(show).join(' … ')??'구간 없음'}</td><td>{labels[row.status]} {row.reasons.join(' · ')}</td></tr>)}</tbody></table></div></details>
  <p>원본 ngspice 표본을 공통 수치 모듈로 계산했습니다. 누락·글리치·불충분한 구간은 충족으로 간주하지 않습니다. 이 판정은 저장된 단일 입력 기준에 한하며 STA·DRC/LVS/PEX·제조 signoff를 의미하지 않습니다.</p></>}
 </section>;
}
