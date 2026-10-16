import path from 'node:path';
import {getProductEdition,defaultEditionWorkspace} from './edition-workspace.mjs';
import {startLeagueServer} from '../platform/league/http.mjs';
import {createLeague} from '../platform/league/service.mjs';
import {generateLeaguePack} from '../platform/league/generate.mjs';

const args=process.argv.slice(2),command=args[0]||'start';
const option=name=>{const i=args.indexOf('--'+name);return i<0?undefined:args[i+1];};
const root=process.cwd(),edition=getProductEdition();if(edition.edition!=='edu')throw Error('Use RESISTOR_EDITION=edu and a separate league directory.');
const workspace=process.env.MOS_WORKSPACE||defaultEditionWorkspace(root,edition),directory=path.resolve(option('data')||path.join(workspace,'.runtime/study-league'));
if(command==='start'){
 const port=Number(option('port')||18786),host=option('host')||'127.0.0.1';if(!Number.isInteger(port)||port<0||port>65535||!['127.0.0.1','0.0.0.0'].includes(host))throw Error('Invalid listen configuration.');
 const app=await startLeagueServer({directory,port,host,staticDirectory:path.resolve(option('static')||'dist'),mode:option('mode')||'local',trustCloudflare:args.includes('--trust-cloudflare')});console.log(JSON.stringify({service:'resistor-edu-league',url:app.url,edition:'edu',eda_api_exposed:false,automatic_ai_calls:false}));for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void app.close().then(()=>process.exit()));
}else if(command==='generate'){
 const league=await createLeague({directory});try{console.log(JSON.stringify(await generateLeaguePack({league,workspace,day:option('day'),level:Number(option('level')||1),cap:Number(option('max-usd')),approved:args.includes('--approved')})));}finally{league.close();}
}else if(command==='moderate'){
 const league=await createLeague({directory});try{league.moderate({device_id:option('device'),post_id:option('post')?Number(option('post')):undefined,blocked:!args.includes('--restore'),reason:option('reason')});console.log(JSON.stringify({updated:true,edition:'edu'}));}finally{league.close();}
}else throw Error('Use start, generate or moderate.');
