import {useEffect,useState} from 'react';
import StudyLeague from './StudyLeague';
import {PUBLIC_LEAGUE_CONFIG,validateLeagueConfiguration,type LeagueConfiguration} from './league-connection';
import {requireOnlineAccessFor} from '../../contracts/src/online-access';
export default function ConnectedStudyLeague({active=true}:{active?:boolean}={}){
 const [config,setConfig]=useState<LeagueConfiguration|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[manual,setManual]=useState(false),[connecting,setConnecting]=useState(false),[waiting,setWaiting]=useState(false);
 const connect=async()=>{if(connecting)return;setConnecting(true);try{await requireOnlineAccessFor('edu');setAttempt(x=>x+1);}catch(e){if((e as {code?:string}).code!=='ONLINE_ACCESS_CANCELLED')setError(e instanceof Error?e.message:String(e));}finally{setConnecting(false);}};
 useEffect(()=>{if(manual)return;let active=true;const abort=new AbortController();setError('');void(async()=>{try{
  await requireOnlineAccessFor('edu',{prompt:false});
  const res=await fetch(PUBLIC_LEAGUE_CONFIG,{credentials:'omit',cache:'no-store',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(10000)])});
  if(!res.ok)throw Error('공용 리그 설정 서버 응답: '+res.status);
  const text=await res.text();if(text.length>16000)throw Error('리그 설정 크기가 잘못되었습니다.');const next=validateLeagueConfiguration(JSON.parse(text));
  if(active){setConfig(next);setWaiting(false);}
 }catch(e){if(active){if((e as {code?:string}).code==='ONLINE_AGE_CONFIRMATION_REQUIRED')setWaiting(true);else setError(e instanceof Error?e.message:String(e));}}})();return()=>{active=false;abort.abort();};},[attempt,manual]);
 return <section className="edu-league-connection"><nav aria-label="리그 연결 방식"><button className="button small" aria-pressed={!manual} onClick={()=>setManual(false)}>공식 공용 리그</button><button className="button small" aria-pressed={manual} onClick={()=>setManual(true)}>내 서버에 직접 연결</button>{!manual&&config&&<button className="button small" onClick={()=>void connect()} disabled={connecting}>공용 서버 주소 새로고침</button>}</nav>{config&&error&&<p role="alert">주소 갱신 실패 · 기존 연결 주소 유지: {error}</p>}{manual?<StudyLeague active={active}/>:config?<StudyLeague active={active} key={config.endpoint} initialEndpoint={config.endpoint} preferInitialEndpoint identityNamespace={config.identity_namespace} temporaryOrigin={config.availability==='operator-pc-and-tunnel-required'}/>:<div className="self-study"><h2>오늘의 공부 리그</h2>{waiting?<><p>연결하면 오늘의 문제와 순위를 확인합니다. 기기 등록과 참가 시작은 다음 화면에서 따로 선택합니다.</p><button className="button" disabled={connecting} onClick={()=>void connect()}>{connecting?'확인 중…':'리그 연결'}</button>{error&&<p role="alert">{error}</p>}</>:error?<><p role="alert">{error} 인터넷 연결을 확인하세요. 로컬 리그로 임의 전환하거나 등록 키를 바꾸지 않았습니다.</p><button className="button" onClick={()=>void connect()} disabled={connecting}>공용 연결 다시 확인</button></>:<p role="status">공용 리그 서버 주소를 확인하는 중…</p>}</div>}</section>;
}
