// Actual Docker/RPC regression in unique disposable containers and a separate
// design folder. Never touches the user's mos-studio-eda container or database.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtemp,mkdir,writeFile,readFile,access} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import path from 'node:path';
import {startWorker,workspaceMount} from '../../scripts/worker.mjs';
import {runtimeConfig,workerRpc} from '../../scripts/runtime.mjs';
import {dockerExecutable,dockerEnvironment} from '../../scripts/docker-cli.mjs';

const root=process.cwd(),docker=await dockerExecutable(),id=randomUUID().slice(0,8);
const containerName=`register-worker-qa-${id}`,image=`register-worker-qa:${id}`;
await mkdir('.runtime/worker-startup-qa',{recursive:true});
const workspace=await mkdtemp(path.join(root,'.runtime/worker-startup-qa','설계, Design space-'));
const run=(args,{allowFail=false,...options}={})=>new Promise((resolve,reject)=>{
  const child=spawn(docker,args,{windowsHide:true,env:dockerEnvironment(),...options,stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.once('error',reject);child.once('exit',code=>code===0||allowFail?resolve({code,output}):reject(Error(`QA Docker ${args[0]} failed: ${output.slice(-3000)}`)));
});
const report={checked_at:new Date().toISOString(),host:process.platform,container_platform:'linux/amd64',native_mac_verified:false,cases:[]};
const record=(name,details={})=>{report.cases.push({name,passed:true,...details});console.log('PASS '+name);};
const sentinel=path.join(workspace,'existing-user-design.register.json');await writeFile(sentinel,'preserved existing design');
const config=await runtimeConfig(workspace),port=await new Promise(resolve=>{const server=createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
config.url=`http://127.0.0.1:${port}`;await writeFile(config.file,JSON.stringify({url:config.url,token:config.token}),{mode:0o600});
const call=async(method,params={})=>{const r=await workerRpc(config,method,params);assert(r.ok,`${method}: ${r.error?.message}`);return r.result;};
try{
  // The previous release image has no COPY instruction: reproduce the exact
  // reported missing-server failure without mounts or mutable user state.
  const previous=await run(['run','--rm','--entrypoint','python3','mos-studio-eda:local','/workspace/workers/eda/server.py'],{allowFail:true});
  assert.notEqual(previous.code,0);assert.match(previous.output,/can't open file.*\/workspace\/workers\/eda\/server.py/);
  record('previous image reproduces missing /workspace/workers/eda/server.py');
  await run(['create','--name',containerName,'--label','com.mos-studio.owner=mos-studio-3d','--mount',workspaceMount(workspace),'--env','MOS_TOKEN','mos-studio-eda:local'],{env:dockerEnvironment({env:{...process.env,MOS_TOKEN:config.token}})});
  await run(['start','-a',containerName],{allowFail:true});
  const legacy=await run(['logs',containerName]);assert.match(legacy.output,/can't open file/);
  record('stopped app-owned legacy container reproduces the reconnect failure');
  await startWorker(workspace,{resourcesRoot:root,containerName,image});
  const preserved=await run(['ps','-a','--filter',`name=${containerName}-backup-`,'--format','{{.Names}}']);assert(preserved.output.trim().startsWith(containerName+'-backup-'));
  record('reconnect preserves stopped legacy container as a backup');
  await assert.rejects(access(path.join(workspace,'workers/eda/server.py')));
  record('fresh mounted design folder with no engine source starts from image-owned code');
  const capabilities=await call('pdk.capabilities');assert(capabilities);
  const profiles=await call('backend.catalog');assert(Array.isArray(profiles.tools)&&profiles.tools.length>0);
  record('authenticated PDK and commercial backend catalog RPC works');
  const project=await call('project.create',{name:'Startup native engine regression',example:'mosfet'});
  const scene=await call('view.get_scene',{project_id:project.id});assert(scene.shapes.length>0);
  record('real KLayout creates and reads geometry',{shape_count:scene.shapes.length});
  let job=await call('simulation.run',{project_id:project.id,analysis:'op',post_layout:false});
  const deadline=Date.now()+120000;
  while(['queued','running'].includes(job.execution_status)&&Date.now()<deadline){await new Promise(r=>setTimeout(r,200));job=await call('job.status',{run_id:job.id});}
  assert.equal(job.execution_status,'completed',job.message);assert.equal(job.analysis_result,'pass',job.message);
  assert.equal(job.current_flow.source,'ngspice');assert(job.current_flow.node_voltages.length>0);assert(job.current_flow.branches.some(b=>b.values_A.some(n=>Math.abs(n)>1e-7)));
  record('actual ngspice operating point produces node voltages and current',{run_id:job.id,branch_count:job.current_flow.branches.length});
  await run(['stop',containerName]);
  await startWorker(workspace,{resourcesRoot:root,containerName,image});
  assert.equal((await call('project.open',{project_id:project.id})).id,project.id);
  assert.equal(await readFile(sentinel,'utf8'),'preserved existing design');
  record('engine restart reopens persisted project and preserves pre-existing design');
  const noToken=await run(['run','--rm',image],{allowFail:true});assert.notEqual(noToken.code,0);assert.match(noToken.output,/Start the design engine from Register/);assert.doesNotMatch(noToken.output,/can't open file/);
  record('direct Docker Run gives session setup guidance instead of a missing Python file');
  const probe=await run(['exec',containerName,'/bin/bash','-lc','python3 /opt/register-engine/workers/eda/test_voltage_probes.py']);assert.match(probe.output,/OK/);
  record('9 voltage parser and actual nested ngspice calibration tests pass');
  report.source_sha256=Object.fromEntries(await Promise.all(['workers/eda/Dockerfile','workers/eda/bootstrap.py','workers/eda/commercial_backend.py','scripts/worker.mjs','apps/desktop/workspace.cjs','tests/integration/worker-startup.mjs'].map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
}finally{
  // Remove only this unique QA container after checking its application owner.
  const names=await run(['ps','-a','--filter',`name=${containerName}`,'--format','{{.Names}}']);
  for(const name of names.output.trim().split('\n').filter(Boolean)){
    assert(name===containerName||name.startsWith(containerName+'-backup-')||name.startsWith(containerName+'-failed-'));
    const owned=await run(['inspect','--format','{{index .Config.Labels "com.mos-studio.owner"}}',name]);assert.equal(owned.output.trim(),'mos-studio-3d');await run(['stop',name],{allowFail:true});await run(['rm',name]);
  }
  await run(['image','rm',image],{allowFail:true});
  await mkdir('docs/evidence',{recursive:true});await writeFile('docs/evidence/worker-startup-native.json',JSON.stringify(report,null,2)+'\n');
}
