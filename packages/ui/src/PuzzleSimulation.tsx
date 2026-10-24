import React, {memo,useMemo,useState} from 'react';
import {preparePuzzlePlot,puzzleCursorValue,puzzleTimeLabel,type PuzzleTrace,type PuzzleChart} from './puzzle-waveform';
export type {PuzzleTrace} from './puzzle-waveform';
export type PuzzleTrial={id:string;board_revision:number;status:string;message?:string;project_id?:string;project_revision?:number;run_id?:string;manifest_path?:string;engine?:{version:string};recipe?:{model:string};waveforms:PuzzleTrace[]};
const colors=['#61c8d1','#f6b85a','#b19af4','#ec8aab','#6fd1a2'];
const empty:PuzzleTrace[]=[];
const number=(n:number)=>n!==0&&Math.abs(n)<1e-4?n.toExponential(4):Number(n.toPrecision(5)).toLocaleString(undefined,{maximumSignificantDigits:5});
const TracePaths=memo(function TracePaths({chart}:{chart:PuzzleChart}){
 return <>{chart.prior.map(w=><path key={w.wave.name} d={w.path} fill="none" stroke={colors[w.colorIndex%colors.length]} strokeWidth="1.5" strokeDasharray="5 4" opacity=".55"/>)}{chart.traces.map(w=><g key={w.wave.name}><path d={w.path} fill="none" stroke={colors[w.colorIndex%colors.length]} strokeWidth="2"/>{w.point&&<circle cx={w.point[0]} cy={w.point[1]} r="3" fill={colors[w.colorIndex%colors.length]}/>}</g>)}</>;
});
function Chart({chart,t,start,end}:{chart:PuzzleChart&{unit:string};t:number;start:number;end:number}){
 const factor=chart.unit==='A'?1000:1,unit=chart.unit==='A'?'mA':'V';
 const x=end===start?395:110+(t-start)/(end-start)*570;
 return <div className="puzzle-chart"><svg viewBox="0 0 720 230" role="img" aria-label={chart.unit==='A'?'실제 단자 전류 파형 mA':'실제 노드 전압 파형 V'}>
  <path d="M110 25V190H680" fill="none" stroke="currentColor" opacity=".4"/>
  {chart.ticks.map(tick=><g key={tick.value}><path d={`M110 ${tick.y}H680`} stroke="currentColor" opacity=".12"/><text x="3" y={tick.y+4}>{number(tick.value*factor)}</text></g>)}
  <text x="5" y="25">{unit}</text><text x="110" y="216">{puzzleTimeLabel(start)}</text><text x="560" y="216">{puzzleTimeLabel(end)}</text>
  <TracePaths chart={chart}/><path d={`M${x} 25V190`} stroke="currentColor" strokeDasharray="3 3"/>
 </svg><div className="puzzle-trace-values">{chart.traces.map(w=>{
  const value=puzzleCursorValue(w.wave,t);
  return <span key={w.wave.name} style={{borderLeftColor:colors[w.colorIndex%colors.length]}}><b>{w.wave.name}</b> {value===null?'표본 범위 밖':`${number(value*factor)} ${unit}`}{w.wave.reference&&<small>正 기준 {w.wave.reference}</small>}</span>;
 })}</div></div>;
}
export default function PuzzleSimulation({trials,revision,busy,ready,onRun,onRefresh}:{trials:PuzzleTrial[];revision:number;busy:boolean;ready:boolean;onRun:()=>void;onRefresh:()=>void}){
 // A manual selection remains stable during status polling; new records default to the latest.
 const [selection,setSelection]=useState({id:'',latest:''}),[cursor,setCursor]=useState(.5),[overlay,setOverlay]=useState(true);
 const latest=trials.at(-1)?.id||'',selected=selection.latest===latest?selection.id:latest;
 const trial=trials.find(t=>t.id===selected)||trials.at(-1),index=trials.findIndex(t=>t.id===trial?.id);
 const before=useMemo(()=>trials.slice(0,index).reverse().find(t=>t.status==='completed'&&t.waveforms.length),[trials,index]);
 const waves=trial?.status==='completed'?trial.waveforms:empty;
 const plot=useMemo(()=>preparePuzzlePlot(waves,overlay?before?.waveforms||empty:empty),[waves,before?.waveforms,overlay]);
 const t=plot.start+(plot.end-plot.start)*cursor;
 const pending=trials.some(t=>['queued','running','submitting'].includes(t.status));
 const labels:Record<string,string>={not_run:'미실행',submitting:'엔진 요청 중',queued:'대기',running:'실행 중',completed:'해석 완료',unavailable:'사용 불가',error:'데이터/실행 오류',failed:'엔진 실패',canceled:'취소됨'};
 return <section className="puzzle-simulation" aria-label="실제 전압 전류 시뮬레이션"><h4>실제 전압·전류 실험</h4><p>공통 ngspice 엔진으로 별도 회로 사본을 실행합니다. 배치·핀 연결·모델·조건을 기록하며 이전 파형은 보존합니다.</p>
  <div className="education-actions"><button className="button primary" disabled={busy||!ready||pending} onClick={onRun}>ngspice 실제 실행</button><button className="button" disabled={busy||!pending} onClick={onRefresh}>실행 상태 새로 확인</button></div>
  {!trial?<p>미실행 · 연결을 완성한 후 실행하세요. DRC / LVS / PEX: 각각 미실행</p>:<>
   <label>해석 기록<select value={trial.id} onChange={e=>setSelection({id:e.target.value,latest})}>{trials.map((r,i)=><option key={r.id} value={r.id}>{i+1} · 보드 r{r.board_revision} · {labels[r.status]||r.status}</option>)}</select></label>
   <p role="status" className={trial.board_revision!==revision?'puzzle-history-note':''}><b>{labels[trial.status]||trial.status}</b> · {trial.board_revision===revision?'현재 배치의 실행 기록':'이전 배치 기록 · 현재 배치는 다시 실행 필요'} · 보드 r{trial.board_revision}</p>
   {trial.message&&<p>{trial.message}</p>}<small className="puzzle-provenance">{trial.engine?.version} · {trial.recipe?.model}<br/>프로젝트 {trial.project_id||'생성되지 않음'} / r{trial.project_revision??'—'} · run {trial.run_id||'없음'}<br/>DRC / LVS / PEX: 각각 미실행 · 제조 검증 아님</small>
   {plot.errors.map((message,i)=><p role="alert" key={i}>파형 데이터 오류 · {message}</p>)}
   {trial.status==='completed'&&!plot.charts.length&&<p role="status">표시할 파형 데이터 없음 · 엔진 로그와 결과 파일을 확인하세요.</p>}
   {plot.charts.length>0&&<>
    <label>시간 커서 · {puzzleTimeLabel(t)}<input aria-label="파형 시간 커서" type="range" min="0" max="1" step=".001" value={cursor} onChange={e=>setCursor(Number(e.target.value))}/></label>
    {before&&<label className="puzzle-consent"><input type="checkbox" checked={overlay} onChange={e=>setOverlay(e.target.checked)}/>직전 완료 실험 보드 r{before.board_revision}와 겹쳐 보기 · 점선</label>}
    {plot.charts.map(chart=><Chart key={chart.unit} chart={chart} t={t} start={plot.start} end={plot.end}/>)}
    <p>실선: 선택한 실행 · 점선: 직전 완료 실행. 표시는 극값을 보존해 축약하며 커서 값은 원본 표본으로 보간합니다. 표본 범위 밖은 추정하지 않습니다. 전류는 부품 첫 핀으로 들어가는 관습적 전류이며 음수면 기준 반대입니다. MOS는 드레인 단자 전류입니다.</p>
   </>}
  </>}
 </section>;
}
