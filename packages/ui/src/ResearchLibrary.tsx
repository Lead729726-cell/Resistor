import {useEffect,useRef,useState} from 'react';
import {rpc,type DesignCatalog,type Project,type ResearchInventory,type Run} from '@mos/contracts';
import './research-library.css';

export default function ResearchLibrary({project,transport=rpc,active,onDesign}:{project:Project|null;transport?:typeof rpc;active:boolean;onDesign:()=>void}) {
  const [inventory,setInventory]=useState<ResearchInventory|null>(null),[selected,setSelected]=useState(''),[filter,setFilter]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const generation=useRef(0),mounted=useRef(true);
  const [verifiedRun,setVerifiedRun]=useState<Run|null>(null),[runError,setRunError]=useState(''),[runLoading,setRunLoading]=useState(false),[runEpoch,setRunEpoch]=useState(0);
  const latestRunId=(project?.runs||[]).filter(r=>r.kind==='simulation').at(-1)?.id;
  useEffect(()=>{let alive=true;setVerifiedRun(null);setRunError('');if(!active||!latestRunId){setRunLoading(false);return;}setRunLoading(true);void transport<Run>('job.status',{run_id:latestRunId}).then(r=>{if(alive)setVerifiedRun(r);}).catch(e=>{if(alive)setRunError(e instanceof Error?e.message:String(e));}).finally(()=>{if(alive)setRunLoading(false);});return()=>{alive=false;};},[active,latestRunId,project?.id,project?.revision,transport,runEpoch]);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;};},[]);
  const load=async()=>{const token=++generation.current;setBusy(true);setError('');try{const result=await transport<DesignCatalog>('design.catalog');if(!mounted.current||token!==generation.current)return;if(!result.literature)throw Error('현재 엔진에는 논문 참고 목록이 없습니다. 설계 엔진을 최신 소스로 다시 연결하세요.');setInventory(result.literature);setSelected(current=>current||result.literature!.coverage[0]?.id||'');}catch(e){if(mounted.current&&token===generation.current)setError(e instanceof Error?e.message:String(e));}finally{if(mounted.current&&token===generation.current)setBusy(false);}};
  useEffect(()=>{if(active&&!inventory&&!busy&&!error)void load();},[active,inventory,busy,error]);
  const rows=inventory?.coverage.filter(v=>`${v.id} ${v.name}`.toLowerCase().includes(filter.toLowerCase()))||[];
  const entry=inventory?.coverage.find(v=>v.id===selected);
  const run=verifiedRun&&verifiedRun.id===latestRunId&&verifiedRun.project_id===project?.id?verifiedRun:null;
  const metric=run?.measurements as Record<string,unknown>|undefined;
  const selectedMetrics=Object.fromEntries(['timing_characterization','source_energy','analog_supply_energy','cic_response','research_metrics','open_loop_gain_dB','phase_margin_deg','unity_gain_Hz','bandwidth_3dB_Hz','low_frequency_gain','SINAD_dB','ENOB_bits','ENOB_status','max_code_error','psrr_rejection_at_10Hz_dB','psrr_min_rejection_dB','psrr_convention','period_variation_s','unwrapped_phase_span_deg'].filter(k=>metric&&k in metric).map(k=>[k,metric![k]]));
  const download=()=>{if(!inventory)return;const url=URL.createObjectURL(new Blob([JSON.stringify(inventory,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='Resistor-literature-review-20261013.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  return <section className="research-library it-panel" data-testid="research-library">
    <div className="it-intro"><h4>논문 참고 · 셀과 블록의 적용 범위</h4><p>새 구조의 성능은 현재 공정·부하에서 다시 측정합니다. 논문 참고와 실제 엔진 검증은 별개의 기록입니다.</p></div>
    <div className="it-toolbar"><button disabled={busy} onClick={()=>{setRunEpoch(v=>v+1);void load();}}>참고 목록 새로 읽기</button><button disabled={!inventory} onClick={download}>논문·블록 대응표 JSON</button><button onClick={onDesign}>회로 생성·설정 열기</button></div>
    {error&&<p className="it-error" role="alert">{error}</p>}{busy&&<p role="status">현재 엔진의 참고 목록을 읽고 있습니다…</p>}
    {inventory&&<><p className="it-notice">검토일 {inventory.reviewed_at} · {inventory.coverage.length}개 회로·블록 · {inventory.papers.length}개 문헌. 2024 배치 논문은 기초 자료, ISSCC 자료는 공식 동향 요약입니다. 선택적으로 접근 가능한 문헌을 검토했으며 전체 연구 분야를 망라하지 않습니다.</p>
      <div className="research-grid"><aside><label>셀·블록 검색<input aria-label="논문 셀 블록 검색" value={filter} onChange={e=>setFilter(e.target.value)}/></label><div className="research-list" aria-label="문헌 적용 블록">{rows.map(v=><button key={v.id} aria-pressed={selected===v.id} onClick={()=>setSelected(v.id)}><strong>{v.name}</strong><code>{v.id}</code></button>)}</div><small>{rows.length}개 표시</small></aside>
      <div>{entry&&<><h4>{entry.name}</h4><p className="it-muted">기존 회로는 독립적으로 구현되었습니다. 아래 문헌은 이번 개선의 방법·검사 항목을 참고한 출처이며, 해당 논문 칩의 복제 또는 성능 재현 기록이 아닙니다.</p>
        {entry.references.map(p=><article className="research-paper" key={p.id}><a href={p.url} target="_blank" rel="noreferrer">{p.title}</a><p>{p.authors} · {p.date}</p><small>{p.venue}</small><dl><dt>원문 확인 범위</dt><dd>{p.read_scope}</dd><dt>논문 공정</dt><dd>{p.technology}</dd><dt>참고한 내용</dt><dd>{p.adopted}</dd><dt>재현하지 않은 내용</dt><dd>{p.not_reproduced}</dd></dl>{p.doi&&<code>DOI {p.doi}</code>}</article>)}
        <details><summary>별도로 필요한 검증</summary>{entry.pending.map(v=><p key={v}>{v}</p>)}</details></> }</div></div></>}
    <div className="research-results" data-testid="research-results"><h4>현재 프로젝트의 실제 측정</h4><p>{project?`${project.name} · r${project.revision}`:'프로젝트를 열면 실제 측정 기록이 표시됩니다.'}</p>
      {runLoading?<p role="status">현재 엔진에서 실제 실행 상태와 유효성을 확인하고 있습니다…</p>:runError?<p className="it-error" role="alert">측정 상태 확인 실패 · {runError}</p>:run?<><p>실행 {run.execution_status} · 결과 {run.analysis_result} · {run.freshness} · r{run.revision}</p>{run.freshness==='stale'&&<p className="it-warning">이전 소스·설계의 기록입니다. 현재 엔진의 검증 결과로 사용할 수 없습니다.</p>}<p className="it-muted">{run.message}</p>{Object.keys(selectedMetrics).length?<><p className="it-muted">단위는 키의 SI 단위와 scope에 표시됩니다. 에너지의 음수는 전원으로 반환된 에너지입니다. 미측정 전원·잡음·성능을 포함한 총전력이나 수율로 해석하지 마세요.</p><pre>{JSON.stringify(selectedMetrics,null,2)}</pre></>:<p>이 실행에는 새 특성 측정이 없습니다. 최신 엔진에서 해석을 실행하세요.</p>}</>:<p>미실행 · 이 목록 자체는 DRC/LVS/PEX 또는 시뮬레이션 PASS를 만들지 않습니다.</p>}
    </div>
  </section>;
}
