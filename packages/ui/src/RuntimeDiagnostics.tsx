import {useEffect,useState} from 'react';
import {localRpc,type DesktopDiagnostics} from '@mos/contracts';
import './runtime-diagnostics.css';

export default function RuntimeDiagnostics({onRetry,onViewer,reconnecting=false}:{onRetry:()=>void;onViewer?:()=>void;reconnecting?:boolean}){
  const [report,setReport]=useState<DesktopDiagnostics|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const inspect=async()=>{setBusy(true);setError('');try{setReport(await localRpc<DesktopDiagnostics>('desktop.diagnostics'));}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
  useEffect(()=>{if(window.mos)void inspect();},[]);
  const download=()=>{if(!report)return;const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='register-environment.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  return <section className="runtime-diagnostics" data-testid="runtime-diagnostics"><header><div><h3>설계 엔진 연결과 설치 진단</h3><p>Docker와 저장 폴더를 확인한 뒤 설계 엔진을 연결합니다. 진단 파일에는 인증 키를 넣지 않습니다.</p></div>{report&&<span className={`status ${report.engine_ready?'pass':'neutral'}`}>{report.engine_ready?'연결 확인':'준비 필요'}</span>}</header>
    {!window.mos&&<p>브라우저에서는 서버의 엔진 상태를 확인합니다. 로컬 서버를 실행한 뒤 다시 연결하세요.</p>}
    {report&&<><small>{report.platform} · {report.arch}</small><code className="runtime-workspace">{report.workspace}</code><ul>{report.items.map(item=><li key={item.id} data-diagnostic={item.id} data-status={item.status}><span className={`status ${item.status==='pass'?'pass':item.status==='blocked'?'fail':'neutral'}`}>{item.status==='pass'?'확인':item.status==='blocked'?'확인 필요':item.status==='missing'?'없음':'대기'}</span><div><strong>{item.message}</strong>{item.status!=='pass'&&item.action&&<p>{item.action}</p>}</div></li>)}</ul></>}
    {error&&<p role="alert">{error}</p>}<div className="runtime-buttons">{window.mos&&<button className="button small" disabled={busy} onClick={()=>void inspect()}>{busy?'진단 중…':'환경 다시 진단'}</button>}<button className="button primary small" data-testid="runtime-reconnect" disabled={busy||reconnecting} onClick={onRetry}>{reconnecting?'설계 엔진 연결 중…':'설계 엔진 다시 연결'}</button>{onViewer&&<button className="button small" data-testid="runtime-open-viewer" onClick={onViewer}>GDS 뷰어로 열기</button>}<button className="button small" disabled={!report||busy} onClick={download}>진단 파일 저장</button></div>
  </section>;
}
