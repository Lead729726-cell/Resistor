import {useEffect,useState} from 'react';
import StudyLeague from './StudyLeague';
import {PUBLIC_LEAGUE_CONFIG,validateLeagueConfiguration,type LeagueConfiguration} from './league-connection';
export default function ConnectedStudyLeague(){
 const [config,setConfig]=useState<LeagueConfiguration|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[manual,setManual]=useState(false);
 useEffect(()=>{if(manual)return;let active=true;const abort=new AbortController();setError('');void(async()=>{try{
  const res=await fetch(PUBLIC_LEAGUE_CONFIG,{credentials:'omit',cache:'no-store',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(10000)])});
  if(!res.ok)throw Error('공용 리그 설정 서버 응답: '+res.status);
  const text=await res.text();if(text.length>16000)throw Error('리그 설정 크기가 잘못되었습니다.');const next=validateLeagueConfiguration(JSON.parse(text));
  if(active)setConfig(next);
 }catch(e){if(active)setError(e instanceof Error?e.message:String(e));}})();return()=>{active=false;abort.abort();};},[attempt,manual]);
 return <section className="edu-league-connection"><nav aria-label="리그 연결 방식"><button className="button small" aria-pressed={!manual} onClick={()=>setManual(false)}>공식 공용 리그</button><button className="button small" aria-pressed={manual} onClick={()=>setManual(true)}>내 서버에 직접 연결</button>{!manual&&config&&<button className="button small" onClick={()=>setAttempt(x=>x+1)}>공용 서버 주소 새로고침</button>}</nav>{config&&error&&<p role="alert">주소 갱신 실패 · 기존 연결 주소 유지: {error}</p>}{manual?<StudyLeague/>:config?<StudyLeague key={config.endpoint} initialEndpoint={config.endpoint} preferInitialEndpoint identityNamespace={config.identity_namespace} temporaryOrigin={config.availability==='operator-pc-and-tunnel-required'}/>:<div className="self-study"><h2>오늘의 공부 리그</h2>{error?<><p role="alert">{error} 인터넷 연결을 확인하세요. 로컬 리그로 임의 전환하거나 등록 키를 바꾸지 않았습니다.</p><button className="button" onClick={()=>setAttempt(x=>x+1)}>공용 연결 다시 확인</button></>:<p role="status">공용 리그 서버 주소를 확인하는 중…</p>}</div>}</section>;
}
