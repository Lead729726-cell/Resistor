import {useEffect,useRef,useState} from 'react';
import {localRpc} from '@mos/contracts';
import {selectRelease,RELEASES_URL,DOWNLOAD_SITE,type AvailableUpdate} from '../../../apps/desktop/update-feed.mjs';
import metadata from '../../../package.json';
import './desktop-updates.css';
interface UpdateState {status:string;currentVersion:string;platform:string|null;packaged:boolean;settings:{automatic:boolean;channel:'preview'|'stable'};update:AvailableUpdate|null;downloadedBytes:number;totalBytes:number;message:string;checkedAt:string|null;receipt?:{status:string;version:string;message?:string;versionVerified?:boolean}}
const labels:Record<string,string>={idle:'확인 전',checking:'버전 확인 중',current:'새 버전 없음',available:'새 버전 사용 가능',downloading:'다운로드 중',ready:'검증 완료 · 설치 준비',installing:'설치 준비 중',offline:'연결 확인 필요',error:'업데이트 실패',unsupported:'지원되지 않는 운영체제'};
const size=(n:number)=>(n/1048576).toFixed(1)+' MiB';
export default function DesktopUpdates(){
  const native=!!window.mos,[open,setOpen]=useState(false),[state,setState]=useState<UpdateState|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [browserPlatform,setBrowserPlatform]=useState('windows');
  const dialogRef=useRef<HTMLElement>(null);
  useEffect(()=>{
    if(!open)return;const previous=document.activeElement as HTMLElement|null;dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const guard=(event:KeyboardEvent)=>{
      // Capture before schematic/layout shortcuts, including when focus escapes.
      event.stopPropagation();
      if(event.key==='Escape'){event.preventDefault();setOpen(false);return;}
      if(event.key==='Tab'){
        const controls=Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]')??[]);
        const first=controls[0],last=controls.at(-1);if(!first)return;
        if(!dialogRef.current?.contains(document.activeElement)||(event.shiftKey&&document.activeElement===first)||(!event.shiftKey&&document.activeElement===last)){event.preventDefault();(event.shiftKey?last:first)?.focus();}
      }
    };
    window.addEventListener('keydown',guard,true);return()=>{window.removeEventListener('keydown',guard,true);previous?.focus();};
  },[open]);
  const refresh=async()=>{if(native)try{setState(await localRpc<UpdateState>('desktop.update.status'));}catch(e){setError((e as Error).message);}};
  const action=async(method:string,params:Record<string,unknown>={})=>{setBusy(true);setError('');try{setState(await localRpc<UpdateState>('desktop.update.'+method,params));}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  const checkBrowser=async()=>{
    setBusy(true);setError('');try{const r=await fetch(RELEASES_URL,{headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('버전 서버에 연결할 수 없습니다. 다시 확인하거나 다운로드 사이트를 여세요.');const update=selectRelease(await r.json(),{currentVersion:metadata.version,platform:browserPlatform,channel:'preview'});setState({status:update?'available':'current',currentVersion:metadata.version,platform:browserPlatform,packaged:false,settings:{automatic:false,channel:'preview'},update,downloadedBytes:0,totalBytes:0,message:'',checkedAt:new Date().toISOString()});}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };
  useEffect(()=>{
    if(!native)return;void refresh();const timer=setInterval(()=>void refresh(),3000);
    const online=()=>{void localRpc('desktop.update.online').then(()=>refresh()).catch(()=>{});};window.addEventListener('online',online);
    const off=window.mos?.onMenuCommand?.(command=>{if(command==='updates'){setOpen(true);void action('check');}});
    return()=>{clearInterval(timer);window.removeEventListener('online',online);off?.();};
  },[]);
  const updating=busy||['checking','downloading','installing'].includes(state?.status??'');
  const available=['available','ready'].includes(state?.status??'');
  return <div className="desktop-updates"><button className={`button small update-toggle${available?' update-available':''}`} data-testid="app-updates" onClick={()=>{setOpen(true);if(native)void refresh();else void checkBrowser();}}>{available?'새 버전':'업데이트'}</button>
    {open&&<div className="modal-overlay update-overlay" onPointerDown={e=>{if(e.target===e.currentTarget)setOpen(false);}}><section ref={dialogRef} data-update-dialog className="modal update-dialog" role="dialog" aria-modal="true" aria-labelledby="update-title"><div className="modal-header"><h2 id="update-title">Resistor 업데이트</h2><button className="icon-button" aria-label="업데이트 창 닫기" onClick={()=>setOpen(false)}>×</button></div><div className="update-body">
      <div className="update-summary"><span>현재 <code>v{state?.currentVersion??metadata.version}</code></span><strong role="status">{busy?'확인 중…':labels[state?.status??'idle']??state?.status}</strong></div>
      {!native&&<><p>브라우저에서는 버전 확인과 설치 파일 다운로드를 제공합니다. 설치 앱에서는 다운로드·검증·설치 절차를 바로 진행할 수 있습니다.</p><label>운영체제 <select aria-label="업데이트 운영체제" value={browserPlatform} disabled={busy} onChange={e=>{setBrowserPlatform(e.target.value);setState(null);}}><option value="windows">Windows x64</option><option value="macos">Mac M1 이후</option><option value="macos-intel">Mac Intel</option><option value="linux">Linux x64</option></select></label></>}
      {native&&state&&<div className="update-settings"><label><input type="checkbox" checked={state.settings.automatic} disabled={updating} onChange={e=>void action('preferences',{...state.settings,automatic:e.target.checked})}/>시작·인터넷 재연결 시 확인 (이후 6시간 간격)</label><label><input type="checkbox" checked={state.settings.channel==='preview'} disabled={updating} onChange={e=>void action('preferences',{...state.settings,channel:e.target.checked?'preview':'stable'})}/>미리보기 릴리스 포함</label></div>}
      {state?.update&&<><h3>v{state.update.version} {state.update.preview&&<span className="tag">PREVIEW</span>}</h3><p><code>{state.update.asset.name}</code> · {size(state.update.asset.bytes)}</p><details><summary>변경 내용</summary><pre className="update-notes">{state.update.notes||'릴리스 페이지에서 변경 내용을 확인하세요.'}</pre></details><details><summary>공식 파일 SHA-256</summary><code className="update-hash">{state.update.asset.sha256}</code></details>{!native&&<a className="button primary" href={state.update.asset.url} rel="noreferrer">설치 파일 다운로드</a>}</>}
      {state?.status==='downloading'&&<div className="update-progress"><progress aria-label="업데이트 다운로드 진행률" value={state.downloadedBytes} max={state.totalBytes}/><span>{size(state.downloadedBytes)} / {size(state.totalBytes)} · {state.totalBytes?Math.floor(state.downloadedBytes/state.totalBytes*100):0}%</span></div>}
      {state?.status==='ready'&&<p className="update-verified">GitHub 릴리스의 크기·SHA-256과 다운로드 파일이 일치합니다.</p>}
      {(error||state?.message)&&<p role="alert" className="update-error">{error||state?.message}</p>}
      {state?.receipt?.status==='failed'&&<p role="alert" className="update-error">이전 설치가 완료되지 않았습니다: {state.receipt.message}</p>}
      {state?.receipt?.versionVerified&&<p className="update-verified">v{state.receipt.version} 설치 후 실행 버전까지 확인했습니다.</p>}
      {state?.checkedAt&&<small>마지막 확인: {new Date(state.checkedAt).toLocaleString()}</small>}
      <p className="update-note">설치 전에 입력 중인 설정과 뷰어 파일을 저장하세요. 설계 데이터는 앱 밖의 기존 저장 폴더에 유지됩니다. Docker 엔진은 별도로 갱신하며 실행 중인 해석을 강제로 종료하지 않습니다.</p>
      {native&&state&&!state.packaged&&<p className="update-note">소스 실행 환경입니다. 다운로드 검증은 가능하며 앱 교체는 설치 버전에서 지원합니다.</p>}
      <div className="update-actions"><button className="button small" disabled={updating} onClick={()=>native?void action('check'):void checkBrowser()}>지금 확인</button>{native&&state?.update&&['available','error','offline'].includes(state.status)&&<button className="button primary small" disabled={updating} onClick={()=>void action('download')}>업데이트 다운로드</button>}{native&&state?.status==='downloading'&&<button className="button small" onClick={()=>void action('cancel')}>다운로드 취소</button>}{native&&state?.status==='ready'&&<button className="button primary small" disabled={updating||!state.packaged} onClick={()=>void action('install')}>설치하고 다시 시작</button>}<a href={DOWNLOAD_SITE} className="button small" target="_blank" rel="noreferrer" onClick={e=>{if(native){e.preventDefault();void action('website');}}}>다운로드 사이트</a></div>
    </div></section></div>}
  </div>;
}
