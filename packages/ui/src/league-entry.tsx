import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import StudyLeague from './StudyLeague';
import {leagueEndpoint} from './league-device';
import OnlineAccessBoundary from './OnlineAccessBoundary';
import {configureOnlineAccess,requireOnlineAccessFor} from '../../contracts/src/online-access';

function LeagueBootstrap(){
 const [config,setConfig]=useState<{endpoint?:string;identityNamespace?:string;temporaryOrigin:boolean}|null>(null),[waiting,setWaiting]=useState(false),[attempt,setAttempt]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const connect=async()=>{if(busy)return;setBusy(true);setError('');try{await requireOnlineAccessFor('edu');setAttempt(value=>value+1);}catch(cause){if((cause as {code?:string}).code!=='ONLINE_ACCESS_CANCELLED')setError(cause instanceof Error?cause.message:String(cause));}finally{setBusy(false);}};
 useEffect(()=>{let current=true;void(async()=>{
  let endpoint:string|undefined,identityNamespace:string|undefined,temporaryOrigin=false;
  try{await requireOnlineAccessFor('edu',{prompt:false});}catch(cause){if(current){setWaiting(true);if((cause as {code?:string}).code!=='ONLINE_AGE_CONFIRMATION_REQUIRED')setError(cause instanceof Error?cause.message:String(cause));}return;}
  try{const r=await fetch(new URL('./league-config.json',location.href),{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(3000)});if(r.ok){const config=await r.json();if(config.schema_version!==1||config.edition!=='edu'||typeof config.identity_namespace!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(config.identity_namespace))throw Error('Invalid publisher configuration');endpoint=leagueEndpoint(config.endpoint);identityNamespace=config.identity_namespace;temporaryOrigin=config.availability==='operator-pc-and-tunnel-required';}}catch{/* An acknowledged local standalone server can use its own /api/league. */}
  if(current)setConfig({endpoint,identityNamespace,temporaryOrigin});
 })();return()=>{current=false;};},[attempt]);
 return config?<StudyLeague initialEndpoint={config.endpoint} identityNamespace={config.identityNamespace} temporaryOrigin={config.temporaryOrigin}/>:<main style={{fontFamily:'system-ui',padding:24,maxWidth:640,margin:'auto'}}><h1>Resistor Edu · 오늘의 리그</h1>{waiting?<><p>연결하면 오늘의 문제와 순위를 확인합니다. 기기 등록과 참가 시작은 다음 화면에서 선택합니다.</p><button type="button" onClick={()=>void connect()} disabled={busy} style={{minHeight:44,padding:'8px 16px'}}>{busy?'확인 중…':'리그 연결'}</button></>:<p>리그 서버를 연결하는 중…</p>}{error&&<p role="alert">{error}</p>}</main>;
}
configureOnlineAccess({edition:'edu',host:'browser'});
createRoot(document.getElementById('root')!).render(<OnlineAccessBoundary><LeagueBootstrap/></OnlineAccessBoundary>);
