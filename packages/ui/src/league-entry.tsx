import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import StudyLeague from './StudyLeague';
import {leagueEndpoint} from './league-device';
import OnlineAccessBoundary from './OnlineAccessBoundary';
import {configureOnlineAccess,requireOnlineAccessFor} from '../../contracts/src/online-access';

function LeagueBootstrap(){
 const [config,setConfig]=useState<{endpoint?:string;identityNamespace?:string;temporaryOrigin:boolean}|null>(null);
 useEffect(()=>{let current=true;void(async()=>{
  let endpoint:string|undefined,identityNamespace:string|undefined,temporaryOrigin=false;
  try{await requireOnlineAccessFor('edu',{prompt:false});const r=await fetch(new URL('./league-config.json',location.href),{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(3000)});if(r.ok){const config=await r.json();if(config.schema_version!==1||config.edition!=='edu'||typeof config.identity_namespace!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(config.identity_namespace))throw Error('Invalid publisher configuration');endpoint=leagueEndpoint(config.endpoint);identityNamespace=config.identity_namespace;temporaryOrigin=config.availability==='operator-pc-and-tunnel-required';}}catch{/* An acknowledged local standalone server can use its own /api/league. */}
  if(current)setConfig({endpoint,identityNamespace,temporaryOrigin});
 })();return()=>{current=false;};},[]);
 return config?<StudyLeague initialEndpoint={config.endpoint} identityNamespace={config.identityNamespace} temporaryOrigin={config.temporaryOrigin}/>:<p style={{fontFamily:'system-ui',padding:24}}>Resistor Edu · 리그 서버를 연결하는 중…</p>;
}
configureOnlineAccess({edition:'edu',host:'browser'});
createRoot(document.getElementById('root')!).render(<OnlineAccessBoundary><LeagueBootstrap/></OnlineAccessBoundary>);
