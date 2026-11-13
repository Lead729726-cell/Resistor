import {useEffect,useState,type ReactNode} from 'react';
import {isLocalWorkbench,localRpc} from '@mos/contracts';
import {ONLINE_ACCESS_POLICY_VERSION,acknowledgeOnlineAccess,onlineAccessStatus,type OnlineAccessStatus} from '../../contracts/src/online-access';
import CalculatorHub from './CalculatorHub';
import './online-access.css';

export default function OnlineAccessBoundary({children,enabled=true}:{children:ReactNode;enabled?:boolean}){
 const [status,setStatus]=useState<OnlineAccessStatus|null>(null),[checked,setChecked]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[localOnly,setLocalOnly]=useState(false),[opened,setOpened]=useState(false);
 const [localLease,setLocalLease]=useState(false),[continuedLocally,setContinuedLocally]=useState(false);
 const refresh=async()=>{try{const next=await onlineAccessStatus();setStatus(next);setError('');if(!next.required||next.acknowledged)setOpened(true);}catch(cause){setError(cause instanceof Error?cause.message:'확인 상태를 읽지 못했습니다.');}};
 useEffect(()=>{if(!enabled)return;void refresh();if(isLocalWorkbench())void localRpc<{authorized:boolean;edition:string}>('license.status').then(value=>setLocalLease(value.edition==='edu'&&value.authorized===true)).catch(()=>setLocalLease(false));const changed=()=>void refresh();const required=()=>{setContinuedLocally(false);void refresh();};window.addEventListener('resistor:online-access-changed',changed);window.addEventListener('resistor:online-access-required',required);return()=>{window.removeEventListener('resistor:online-access-changed',changed);window.removeEventListener('resistor:online-access-required',required);};},[enabled]);
 if(!enabled)return <>{children}</>;
 const acknowledge=async()=>{if(!checked||busy)return;setBusy(true);setError('');try{const next=await acknowledgeOnlineAccess({age_14_or_over:true,policy_version:ONLINE_ACCESS_POLICY_VERSION});setStatus(next);setOpened(true);setLocalOnly(false);}catch(cause){setError(cause instanceof Error?cause.message:'확인을 저장하지 못했습니다.');}finally{setBusy(false);}};
 const allowed=!!status&&(!status.required||status.acknowledged);
 const prompt=<section className="online-access-card" aria-labelledby="online-access-title">
  <small>RESISTOR EDU · 온라인 기능 시작 전</small><h1 id="online-access-title">온라인 기능은 만 14세 이상부터</h1>
  <p>기기 인증, 리그·커뮤니티 참여, 외부 AI, 공동 설계처럼 정보를 전송하는 기능을 사용하기 전에 확인해 주세요.</p>
  <label><input type="checkbox" checked={checked} onChange={event=>setChecked(event.target.checked)} disabled={busy}/>저는 만 14세 이상입니다.</label>
  <p className="online-access-note">생년월일·신분증을 수집하지 않는 자기 확인입니다. 본인 인증이나 모든 개인정보 처리에 대한 일괄 동의가 아닙니다. AI 입력 전송·비용 등 각 기능의 별도 선택은 그대로 유지됩니다.</p>
  <button type="button" disabled={!checked||busy||!status} onClick={()=>void acknowledge()}>{busy?'기기에 확인 저장 중…':'확인하고 온라인 기능으로'}</button>
  {localLease&&<><button type="button" className="online-access-secondary" onClick={()=>{setOpened(true);setContinuedLocally(true);}}>온라인 기능 없이 기존 작업 계속</button><p className="online-access-note">기기에 남아 있는 유효한 시리얼 인증 범위에서만 로컬 작업을 계속합니다. 인증 만료 후 갱신이나 외부 연결에는 위 확인이 필요합니다.</p></>}
  {!opened&&<button type="button" className="online-access-secondary" onClick={()=>setLocalOnly(true)}>공개 자료·기기 내 계산만 사용</button>}
  <p className="online-access-note">현재 제품: Resistor Edu · 정책 {ONLINE_ACCESS_POLICY_VERSION}. 다른 에디션의 확인과 기록을 공유하지 않습니다. 기존 시리얼·설계·학습 기록은 삭제하지 않습니다.</p>
  <nav aria-label="온라인 기능 안내"><a href="https://resistor.kr/privacy/" target="_blank" rel="noreferrer">개인정보 안내</a><a href="https://resistor.kr/terms/" target="_blank" rel="noreferrer">이용 조건</a></nav>
  {error&&<><p role="alert">{error}</p><button type="button" disabled={busy} onClick={()=>void refresh()}>확인 상태 다시 읽기</button></>}
  {!status&&!error&&<p role="status">기기에 저장된 확인을 읽는 중입니다.</p>}
 </section>;
 if(localOnly&&!opened)return <div className="online-access-local"><header><strong>Resistor Edu · 기기 내 계산</strong><span>계정 등록·학습 기록 전송 없이 계산합니다.</span><button onClick={()=>setLocalOnly(false)}>온라인 기능 안내로 돌아가기</button><a href="https://resistor.kr/edu/" target="_blank" rel="noreferrer">공개 사용 안내</a></header><p>공개 웹페이지를 열면 해당 웹 호스팅에 일반 접속 정보가 전달될 수 있습니다. 이 화면은 공식 앱 시리얼 인증을 대신하지 않습니다.</p><CalculatorHub/></div>;
 return <>{!allowed&&!continuedLocally&&<div className="online-access-boundary">{prompt}</div>}{!allowed&&continuedLocally&&<aside className="online-access-local-banner"><span>온라인 기능은 잠겨 있습니다. 기존 기기 인증 범위의 로컬 작업만 사용합니다.</span><button type="button" onClick={()=>setContinuedLocally(false)}>온라인 기능 안내</button></aside>}{opened&&children}</>;
}
