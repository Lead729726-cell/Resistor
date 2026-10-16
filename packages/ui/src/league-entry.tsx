import {createRoot} from 'react-dom/client';
import StudyLeague from './StudyLeague';
import {leagueEndpoint} from './league-device';
const root=createRoot(document.getElementById('root')!);
root.render(<p style={{color:'#cbd7e0',fontFamily:'system-ui',padding:24}}>Resistor Edu · 리그 서버를 연결하는 중…</p>);
let endpoint:string|undefined,identityNamespace:string|undefined,temporaryOrigin=false;
try{const r=await fetch(new URL('./league-config.json',location.href),{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(3000)});if(r.ok){const config=await r.json();if(config.schema_version!==1||config.edition!=='edu'||typeof config.identity_namespace!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(config.identity_namespace))throw Error('Invalid publisher configuration');endpoint=leagueEndpoint(config.endpoint);identityNamespace=config.identity_namespace;temporaryOrigin=config.availability==='operator-pc-and-tunnel-required';}}catch{/* Local standalone server uses its own /api/league by default. */}
root.render(<StudyLeague initialEndpoint={endpoint} identityNamespace={identityNamespace} temporaryOrigin={temporaryOrigin}/>);
