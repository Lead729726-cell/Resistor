// Isolated native worker + browser, never restarts the user's design engine.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import path from 'node:path';
import {startWorker} from '../../scripts/worker.mjs';
import {runtimeConfig,workerRpc} from '../../scripts/runtime.mjs';
import {dockerExecutable,dockerEnvironment} from '../../scripts/docker-cli.mjs';
const root=process.cwd(),id=randomUUID().slice(0,8),container=`register-drawing-qa-${id}`,image=`register-drawing-qa:${id}`;
const docker=await dockerExecutable();
const run=(cmd,args,env=process.env,allowFail=false)=>new Promise((resolve,reject)=>{
  const child=spawn(cmd,args,{env,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';
  child.stdout.on('data',b=>{output+=b;if(cmd===process.execPath)process.stdout.write(b);});child.stderr.on('data',b=>{output+=b;if(cmd===process.execPath)process.stderr.write(b);});child.once('error',reject);child.once('exit',code=>code===0||allowFail?resolve({code,output}):reject(Error(output.slice(-8000))));
});
const freePort=()=>new Promise(resolve=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
await mkdir('.runtime/editor-drawing-qa',{recursive:true});await mkdir('docs/evidence/editor-drawing',{recursive:true});
const workspace=await mkdtemp(path.join(root,'.runtime/editor-drawing-qa','design-')),config=await runtimeConfig(workspace);
config.url=`http://127.0.0.1:${await freePort()}`;await writeFile(config.file,JSON.stringify({url:config.url,token:config.token}),{mode:0o600});
const port=await freePort(),baseURL=`http://127.0.0.1:${port}`,env={...process.env,MOS_WORKSPACE:workspace,REGISTER_DEV_PORT:String(port),REGISTER_UI_BASE_URL:baseURL};
const report={checked_at:new Date().toISOString(),host:process.platform,native_worker:'Linux KLayout + ngspice',native_mac_execution:false,cases:[]};
let vite;
try{
  await startWorker(workspace,{resourcesRoot:root,containerName:container,image});
  const probe=await run(docker,['exec',container,'/bin/bash','-lc','python3 /opt/register-engine/workers/eda/test_drawing.py'],dockerEnvironment());
  assert.match(probe.output,/Ran 6 tests[\s\S]*OK/);console.log(probe.output.trim());report.cases.push({name:'native oriented symbol geometry, connectivity, SPICE invariance, invalid transform atomicity, copy',passed:true,count:6});
  const api=async(method,params={})=>{const r=await workerRpc(config,method,params);assert(r.ok,`${method}: ${r.error?.message}`);return r.result;};
  const p=await api('project.create',{name:'Oriented editor simulation QA',example:'mosfet'});
  const d=p.schematic.devices[0];await api('schematic.apply_command',{project_id:p.id,expected_revision:p.revision,command:{type:'transform_device',id:d.id,rotation:90,mirror:true}});
  const conflict=await workerRpc(config,'schematic.apply_command',{project_id:p.id,expected_revision:p.revision,command:{type:'transform_device',id:d.id,rotation:180}});assert.equal(conflict.error?.code,'REVISION_CONFLICT');report.cases.push({name:'stale revision rejected without overwriting another edit',passed:true});
  let job=await api('simulation.run',{project_id:p.id,analysis:'op',post_layout:false});const deadline=Date.now()+120000;
  while(['queued','running'].includes(job.execution_status)&&Date.now()<deadline){await new Promise(r=>setTimeout(r,200));job=await api('job.status',{run_id:job.id});}
  assert.equal(job.execution_status,'completed',job.message);assert.equal(job.analysis_result,'pass',job.message);assert.equal(job.current_flow.source,'ngspice');assert(job.current_flow.branches.length>0);
  report.cases.push({name:'actual ngspice operating point after MOS mirror and rotation',passed:true,run_id:job.id});console.log('PASS actual ngspice after orientation');
  vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});let logs='';vite.stdout.on('data',b=>logs+=b);vite.stderr.on('data',b=>logs+=b);
  let ready=false;for(let i=0;i<100;i++){try{const r=await fetch(baseURL);if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}
  assert(ready,'Isolated dev server did not start: '+logs.slice(-1500));
  const browser=await run(process.execPath,['node_modules/@playwright/test/cli.js','test','editor-drawing.spec.ts','--max-failures=1'],env);assert.match(browser.output,/2 passed/);
  report.cases.push({name:'actual browser drawing with isolated native persistence',passed:true});
  report.source_sha256=Object.fromEntries(await Promise.all(['packages/viewer/src/drawing.ts','packages/viewer/src/LayoutViewer.tsx','packages/ui/src/SchematicEditor.tsx','packages/ui/src/schematic-drawing.ts','workers/eda/native.py','workers/eda/test_drawing.py','tests/ui/editor-drawing.spec.ts'].map(async f=>[f,createHash('sha256').update(await readFile(f)).digest('hex')])));
}finally{
  if(vite){vite.kill();await new Promise(r=>vite.exitCode!==null?r():vite.once('exit',r));}
  const inspect=await run(docker,['inspect','--format','{{index .Config.Labels "com.mos-studio.owner"}}',container],dockerEnvironment(),true);
  if(inspect.code===0){assert.equal(inspect.output.trim(),'mos-studio-3d');await run(docker,['stop',container],dockerEnvironment(),true);await run(docker,['rm',container],dockerEnvironment());}
  await run(docker,['image','rm',image],dockerEnvironment(),true);
  await writeFile('docs/evidence/editor-drawing/native.json',JSON.stringify(report,null,2)+'\n');
}
