import {useEffect,useRef,useState} from 'react';
import {rpc,type Project,type Run,type Scene} from '@mos/contracts';

interface Props {project:Project|null;transport?:typeof rpc;readOnly?:boolean;onProject:(p:Project,s:Scene)=>void|Promise<void>;onRun?:(r:Run)=>void|Promise<void>}
const done=(r:Run)=>!['queued','running'].includes(r.execution_status);
const labels:Record<string,[string,string]>={output_noise_rms_V:['출력 잡음 RMS','V'],input_noise_rms_V:['입력 환산 잡음 RMS','V'],numerical_output_noise_rms_V:['독립 적분 교차 확인','V'],offset_mean_V:['오프셋 평균','V'],offset_sample_std_V:['표본 표준편차','V'],offset_min_V:['최소 오프셋','V'],offset_max_V:['최대 오프셋','V'],offset_abs_max_V:['최대 절대 오프셋','V'],within_limit_samples:['기준 이내 표본','개'],samples:['실제 표본','개']};
export default function OtaCharacterization({project,transport=rpc,readOnly=false,onProject,onRun}:Props){
 const [mode,setMode]=useState<'noise'|'mismatch'>('noise'),[samples,setSamples]=useState('16'),[seed,setSeed]=useState('729726'),[limit,setLimit]=useState('0.0001'),[post,setPost]=useState(false);
 const [run,setRun]=useState<Run|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[logs,setLogs]=useState('');
 const epoch=useRef(0),live=useRef(true);useEffect(()=>{live.current=true;return()=>{live.current=false;epoch.current++;};},[]);
 useEffect(()=>{epoch.current++;setRun(null);setLogs('');setError('');setBusy(false);},[project?.id]);
 const active=(e:number)=>live.current&&epoch.current===e;
 const running=!!run&&!done(run),supported=project?.design_template?.id==='soc_miller_ota';
 const stale=!!run&&(run.freshness==='stale'||run.revision!==project?.revision);
 useEffect(()=>{if(!run||done(run))return;let closed=false;const e=epoch.current;const timer=setTimeout(()=>{void(async()=>{try{const next=await transport<Run>('job.status',{run_id:run.id});if(closed||!active(e))return;setRun(next);if(done(next)){await onRun?.(next);const p=await transport<Project>('project.open',{project_id:next.project_id});const scene=await transport<Scene>('view.get_scene',{project_id:p.id,max_shapes:2000});if(!closed&&active(e))await onProject(p,scene);}}catch(c){if(!closed&&active(e))setError(c instanceof Error?c.message:String(c));}})();},1000);return()=>{closed=true;clearTimeout(timer);};},[run,transport,onProject,onRun]);
 const request=async(work:()=>Promise<void>)=>{const e=epoch.current;setBusy(true);setError('');try{await work();}catch(c){if(active(e))setError(c instanceof Error?c.message:String(c));}finally{if(active(e))setBusy(false);}};
 const save=()=>{if(!run)return;const u=URL.createObjectURL(new Blob([JSON.stringify(run,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download=`OTA-${run.measurements?.analysis||mode}-${run.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
 return <section className="it-panel" data-testid="ota-characterization"><h4>OTA · 실제 잡음 및 소자 편차</h4>
 <p>SoC Miller OTA를 전압 follower로 연결하여 ngspice에서 실행합니다. 외부 부하 1pF, BIAS 0.9V, 기본 TT / 27°C / 1.8V. 잡음은 10Hz~10MHz 적분이며, 편차는 설치된 SKY130 공개 모델의 AGAUSS와 기록된 seed를 사용합니다.</p>
 {!supported&&<p className="it-warning">회로 · 연결 탐색에서 SoC Miller OTA를 생성하거나 여세요. 현재 회로를 이 측정 fixture에 임의로 연결하지 않습니다.</p>}
 <fieldset disabled={readOnly||busy||running||!supported}><legend>실행 조건 · 원본 회로는 편집하지 않습니다</legend><div className="it-grid four">
 <label>해석<select aria-label="OTA 특성 해석" value={mode} onChange={e=>{const m=e.target.value as typeof mode;setMode(m);setLimit(m==='noise'?'0.0001':'0.01');}}><option value="noise">소신호 잡음</option><option value="mismatch">소자 편차 Monte Carlo</option></select></label>
 {mode==='mismatch'&&<><label>표본 수 (4~64)<input aria-label="편차 표본 수" type="number" min="4" max="64" value={samples} onChange={e=>setSamples(e.target.value)}/></label><label>기준 seed<input aria-label="편차 seed" type="number" min="1" max="1000000000" value={seed} onChange={e=>setSeed(e.target.value)}/></label></>}
 <label>{mode==='noise'?'출력 잡음 RMS 상한 (V)':'절대 오프셋 상한 (V)'}<input aria-label="OTA 특성 상한 V" type="number" step="any" value={limit} onChange={e=>setLimit(e.target.value)}/></label></div>
 <label className="it-check"><input aria-label="OTA 실제 PEX 포함" type="checkbox" checked={post} onChange={e=>setPost(e.target.checked)}/>현재 물리 도형에서 실제 PEX 후 해석 · 물리 프로젝트 필요</label>
 <button className="primary" data-testid="ota-characterization-start" onClick={()=>void request(async()=>{if(!project)return;const e=epoch.current;const bound=Number(limit);if(!limit.trim()||!Number.isFinite(bound)||bound<=0)throw Error('양의 유한한 상한을 V 단위로 입력하세요.');const c=mode==='noise'?{mode,noise_limit_V:bound}:{mode,samples:Number(samples),seed:Number(seed),offset_limit_V:bound};const next=await transport<Run>('simulation.run',{project_id:project.id,expected_revision:project.revision,command_id:crypto.randomUUID(),analysis:'op',corner:'tt',temperature_C:27,supply_V:1.8,post_layout:post,characterization:c});if(active(e))setRun(next);})}>실제 {mode==='noise'?'잡음':'편차'} 해석 실행</button></fieldset>
 {error&&<p role="alert" className="it-error">{error}</p>}
 {!run&&<p className="it-muted">아직 실행하지 않았습니다. 조건 입력만으로 PASS를 표시하지 않습니다.</p>}
 {run&&<><div className="it-actions"><strong>실행: {run.execution_status} · 판정: {run.analysis_result} · {stale?'STALE':run.freshness}</strong><span>r{run.revision} · {run.analysis_stage} · {run.id}</span>
 {running&&<button disabled={busy||readOnly} onClick={()=>void request(async()=>{const e=epoch.current;const r=await transport<Run>('job.cancel',{run_id:run.id});if(active(e))setRun(r);})}>해석 취소</button>}
 <button onClick={save}>실제 결과 JSON</button><button disabled={busy} onClick={()=>void request(async()=>{const e=epoch.current;const r=await transport<{text:string}>('job.logs',{run_id:run.id});if(active(e))setLogs(r.text);})}>엔진 로그 읽기</button></div><p>{run.message}</p>
 <div className="it-table-wrap"><table><thead><tr><th>측정</th><th>실제 값</th><th>단위</th></tr></thead><tbody>{Object.entries(labels).filter(([k])=>typeof run.measurements?.[k]==='number').map(([k,[label,unit]])=><tr key={k}><td>{label}</td><td>{Number(run.measurements![k]).toPrecision(7)}</td><td>{unit}</td></tr>)}</tbody></table></div>
 {run.reference_verification?.checks.map(c=><p className={c.pass?'it-muted':'it-warning'} key={c.name}>{c.pass?'PASS':'FAIL'} · {c.name} · 실제 {String(c.observed)}</p>)}
 {!!run.waveforms?.length&&<ActualPlot run={run}/>}
 {logs&&<pre className="it-log">{logs}</pre>}<p className="it-muted">결과 위치: {run.artifacts?.characterization||'완료 후 characterization.json 생성'}</p></>}
 <p className="it-muted">유한한 공개 모델 표본이며 파운드리에서 보증한 수율이 아닙니다. global process Monte Carlo, full-chip EM/IR/ESD는 아직 검증하지 않았습니다. 실패·취소·이전 revision 결과를 성공으로 바꾸지 않습니다.</p>
 </section>;
}
function ActualPlot({run}:{run:Run}){const w=run.waveforms![0],noise=run.measurements?.analysis==='noise';if(w.x.length<2||w.x.length!==w.y.length)return null;const xs=w.x.map(x=>noise?Math.log10(x):x),ys=w.y.map(y=>noise?Math.log10(y):y*1000);if([...xs,...ys].some(v=>!Number.isFinite(v)))return null;const a=Math.min(...xs),b=Math.max(...xs),c=Math.min(...ys),d=Math.max(...ys),points=xs.map((x,i)=>`${35+(x-a)/(b-a||1)*480},${155-(ys[i]-c)/(d-c||1)*125}`).join(' ');return <svg viewBox="0 0 550 190" role="img" aria-label={noise?'실제 출력 잡음 밀도, 양축 로그':'실제 Monte Carlo 오프셋, mV'} style={{width:'100%',maxWidth:750}}><polyline points={points} stroke="var(--accent)" fill="none" strokeWidth="2"/><text x="35" y="182" fill="currentColor" fontSize="11">{noise?'10Hz~10MHz · log(f) / log(V/√Hz)':'표본 번호 / 오프셋 mV'} · 실제 {w.x.length}개</text></svg>;}
