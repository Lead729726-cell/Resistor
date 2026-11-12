import {useEffect,useRef,useState,type ReactNode} from 'react';
import {localRpc,isLocalWorkbench} from '@mos/contracts';
import {productEdition} from './product-edition';
import EduLegalGuide from './EduLegalGuide';
import './license.css';
type Status={course_access_policy?:{notice:string};edition:'edu'|'indust';authorized:boolean;state:string;message:string;expires_at?:number;device_limit:number;server_configured:boolean};
export function licenseGateVisibility({local,authorized,manage,edu,guideOpen}:{local:boolean;authorized:boolean;manage:boolean;edu:boolean;guideOpen:boolean}){
 const gate=local&&(!authorized||manage);
 return {gate,modal:gate&&edu&&!guideOpen,floating:local&&authorized&&!manage&&!edu,canReturn:local&&authorized};
}
export default function LicenseGate({children}:{children:ReactNode}){
 const [status,setStatus]=useState<Status|null>(null),[error,setError]=useState(''),[serial,setSerial]=useState(''),[busy,setBusy]=useState(false),[manage,setManage]=useState(false);
 const [guideOpen,setGuideOpen]=useState(false);
 const local=isLocalWorkbench();
 const dialog=useRef<HTMLDialogElement>(null),guideButton=useRef<HTMLButtonElement>(null),wasGuideOpen=useRef(false),openedFromSettings=useRef(false);
 const opened=useRef(false);if(status?.authorized)opened.current=true;
 const edition=status?.edition??productEdition.edition,edu=edition==='edu';
 const view=licenseGateVisibility({local,authorized:!!status?.authorized,manage,edu,guideOpen});
 const closeManagement=()=>{if(!status?.authorized||(edu&&busy))return;dialog.current?.close();setManage(false);if(openedFromSettings.current){openedFromSettings.current=false;window.dispatchEvent(new Event('resistor:license-closed'));}};
 const read=async()=>{try{const v=await localRpc<Status>('license.status');setStatus(v);setError('');}catch(e){setError(e instanceof Error?e.message:String(e));}};
 useEffect(()=>{if(!local)return;void read();const t=setInterval(()=>void read(),60000);return()=>clearInterval(t);},[local]);
 useEffect(()=>{
  if(!local||!edu)return;
  const open=()=>{openedFromSettings.current=true;setGuideOpen(false);setManage(true);};
  window.addEventListener('resistor:license-open',open);
  return()=>window.removeEventListener('resistor:license-open',open);
 },[local,edu]);
 useEffect(()=>{
  const element=dialog.current;if(!element)return;
  if(view.modal&&!element.open){element.showModal();if(wasGuideOpen.current)guideButton.current?.focus();}
  else if(!view.modal&&element.open)element.close();
  wasGuideOpen.current=guideOpen;
 },[view.modal,guideOpen]);
 if(!local)return <>{children}</>;
 const run=async(method:string,params:Record<string,unknown>={})=>{setBusy(true);setError('');try{const v=await localRpc<Status>(method,params);setStatus(v);if(method==='license.activate')setSerial('');}catch(e){await read();setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
 const name=edition==='edu'?'Resistor Edu':'Resistor Industry';
 const card=<section className={'license-card'+(edu?' edu-license-card':'')} aria-label="제품 시리얼 인증">
    <small>{edu?'RESISTOR EDU / 시작하기':'RESISTOR / OFFICIAL DISTRIBUTION'}</small>
    <h1>{name} 시리얼 인증</h1>
    <p>{status?.message||'인증 정보를 확인하고 있습니다.'}</p>
    {!edu&&<p>Edu와 Industry는 별도 구매 코드입니다. 개인 기기 {status?.device_limit??2}대에서 등록할 수 있습니다.</p>}
    <p className="license-note" data-testid="course-access-policy">{status?.course_access_policy?.notice||'인프런 강의에는 Resistor Edu 사용권만 포함됩니다. 개인 기기 2대까지 등록할 수 있으며, Resistor Industry는 별도 구매 제품입니다.'}</p>
    {status?.expires_at&&<p>현재 오프라인 인증 만료: <time>{new Date(status.expires_at).toLocaleString()}</time></p>}
    <form onSubmit={e=>{e.preventDefault();void run('license.activate',{serial});}}>
     <label htmlFor="license-serial">구매 시 받은 시리얼 코드</label>
     <input id="license-serial" autoComplete="off" spellCheck={false} type="password" value={serial} onChange={e=>setSerial(e.target.value)} placeholder="RS1-…" maxLength={100}/>
     <button disabled={busy||!serial.trim()||!status?.server_configured} type="submit">{busy?'확인 중…':'이 기기 인증'}</button>
    </form>
    <div className="license-actions">
     {window.mos&&<button onClick={()=>void localRpc('license.workspace').catch(e=>setError(String(e.message||e)))}>설계 저장 폴더 열기</button>}
     <button disabled={busy} onClick={()=>void run('license.refresh')}>연결·인증 다시 확인</button>
     {view.canReturn&&<>
      <button disabled={busy} onClick={()=>{if(window.confirm('이 기기의 인증을 해제할까요? 설계 파일은 보존되며 인터넷 연결이 필요합니다.'))void run('license.deactivate');}}>이 기기 인증 해제</button>
      <button disabled={edu&&busy} onClick={closeManagement}>작업으로 돌아가기</button>
     </>}
    </div>
    {error&&<p role="alert" className="license-error">{error}</p>}
    {edu?<>
     <p className="license-note">첫 인증에는 인터넷이 필요합니다. 인증 오류는 설계 데이터를 삭제하지 않습니다.</p>
     <button ref={guideButton} type="button" className="edu-license-help" onClick={()=>{dialog.current?.close();setGuideOpen(true);}}>이용·데이터 안내 <span>기기 변경, 기록 보관, 선택 온라인 기능, 시리얼 문의 →</span></button>
    </>:<>
     <p className="license-note">첫 인증에는 인터넷이 필요합니다. 통신이 실패해도 기존 인증의 유효기간 안에서는 사용할 수 있습니다. 시리얼을 공개하거나 다른 사람과 공유하지 마세요.</p>
     <p className="license-note">인증 오류는 설계 데이터를 삭제하지 않습니다. 앱 소스의 MIT 라이선스와 새 공식 배포본의 인증·강의 이용 조건은 별도입니다.</p>
    </>}
   </section>;
 return <>{opened.current&&children}
  {view.floating&&<button className="license-manage" onClick={()=>setManage(true)}>시리얼 · {status?.state==='offline_valid'?'오프라인 인증':'인증됨'}</button>}
  {edu?<dialog ref={dialog} className="license-shell license-overlay" aria-label="Resistor Edu 시리얼 인증" aria-modal="true"
   style={{display:view.modal?'grid':'none',width:'100%',maxWidth:'none',maxHeight:'none',margin:0,border:0}}
   onCancel={event=>{event.preventDefault();event.stopPropagation();closeManagement();}}
  >{card}</dialog>:view.gate&&<div className={'license-shell'+(opened.current?' license-overlay':'')}>{card}</div>}
  {edu&&<EduLegalGuide open={guideOpen} onClose={()=>setGuideOpen(false)}/>}
 </>;
}
