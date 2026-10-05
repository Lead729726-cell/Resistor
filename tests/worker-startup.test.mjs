import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,writeFile,cp} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {startWorker,validateEngineResources,workspaceMount} from '../scripts/worker.mjs';
import {runtimeConfig} from '../scripts/runtime.mjs';

const resourcesRoot=process.cwd();
async function fixture({existing=false,running=false,owner=true,foreign=false,mountFail=false,inspectFail=false,runFail=false}={}){
  const workspace=await mkdtemp(path.join(os.tmpdir(),'Register 설계, space-'));
  let state=existing?{state:{Running:running},labels:owner?{'com.mos-studio.owner':'mos-studio-3d'}:{},mounts:[{Type:'bind',Destination:'/workspace',Source:foreign?path.join(workspace,'foreign'):workspace}]}:null;
  let ready=false,config;const calls=[];
  const run=async(command,args,options={})=>{
    calls.push({command,args,options});
    if(args[0]==='info')return 'linux';
    if(args[0]==='inspect'){if(inspectFail)throw Error('permission denied');if(!state)throw Error('No such object');return [state.state,state.labels,state.mounts].map(v=>JSON.stringify(v)).join('\n');}
    if(args[0]==='build')return '';
    if(args[0]==='run'&&args.includes('--rm')){
      assert(args.includes(workspaceMount(workspace,{readonly:true})));
      const relative=args.at(-2),marker=args.at(-1);assert.equal(await readFile(path.join(workspace,relative),'utf8'),marker);
      if(mountFail)throw Error('mount unavailable');return 'REGISTER_MOUNT_OK';
    }
    if(args[0]==='rename'){state=null;return '';}
    if(args[0]==='run'){if(runFail)throw Error('port conflict');ready=true;state={state:{Running:true},labels:{},mounts:[]};return 'container-id';}
    if(args[0]==='logs')return 'engine failed '+(config??await runtimeConfig(workspace)).token;
    throw Error('unexpected Docker call '+args[0]);
  };
  const fetchImpl=async url=>url.endsWith('/health')?{ok:ready,json:async()=>({protocol_version:1})}:{ok:true,json:async()=>({ok:true})};
  config=await runtimeConfig(workspace);
  return {workspace,run,fetchImpl,calls,config};
}
test('installed engine builds from app resources and validates the actual mounted design path before launch',async()=>{
  const f=await fixture();await writeFile(path.join(f.workspace,'saved.design'),'user circuit');
  await startWorker(f.workspace,{resourcesRoot,run:f.run,fetchImpl:f.fetchImpl});
  assert.equal(f.calls.find(c=>c.args[0]==='build').options.cwd,resourcesRoot);
  const runs=f.calls.filter(c=>c.args[0]==='run');assert.equal(runs.length,2);assert(runs[0].args.includes('--rm'));assert(runs[1].args.includes('--env'));assert(!runs[1].args.includes(f.config.token));
  assert.equal(await readFile(path.join(f.workspace,'saved.design'),'utf8'),'user circuit');
  assert(!(await readdir(path.join(f.workspace,'.runtime'))).some(f=>f.startsWith('mount-probe-')));
});
test('missing application server is rejected before Docker or a container can be changed',async()=>{
  const f=await fixture();await assert.rejects(startWorker(f.workspace,{resourcesRoot:f.workspace,run:f.run,fetchImpl:f.fetchImpl}),/엔진 실행 파일/);assert.equal(f.calls.length,0);
});
test('only stopped app-owned containers are upgraded, by preservation as a backup',async()=>{
  const f=await fixture({existing:true});await startWorker(f.workspace,{resourcesRoot,run:f.run,fetchImpl:f.fetchImpl});
  const rename=f.calls.find(c=>c.args[0]==='rename');assert.match(rename.args[2],/^mos-studio-eda-backup-/);assert(!f.calls.some(c=>['rm','stop','kill'].includes(c.args[0])));
});
test('a running unhealthy worker is never renamed, rebuilt or stopped',async()=>{
  const f=await fixture({existing:true,running:true});
  await assert.rejects(startWorker(f.workspace,{resourcesRoot,run:f.run,fetchImpl:f.fetchImpl,readinessMs:0}),/시작되지/);
  assert(f.calls.every(c=>['info','inspect','logs'].includes(c.args[0])));
});
test('foreign workspaces and unowned containers are never modified',async()=>{
  for(const options of [{existing:true,foreign:true},{existing:true,owner:false}]){
    const f=await fixture(options);await assert.rejects(startWorker(f.workspace,{resourcesRoot,run:f.run,fetchImpl:f.fetchImpl}),/컨테이너/);
    assert(f.calls.every(c=>['info','inspect'].includes(c.args[0])));
  }
});
test('Docker inspection permission errors never trigger container creation',async()=>{
  const f=await fixture({inspectFail:true});await assert.rejects(startWorker(f.workspace,{resourcesRoot,run:f.run,fetchImpl:f.fetchImpl}),/permission denied/);
  assert(f.calls.every(c=>['info','inspect'].includes(c.args[0])));
});
test('mount failure prevents replacement and launch and removes only its own probe file',async()=>{
  const f=await fixture({existing:true,mountFail:true});await writeFile(path.join(f.workspace,'.runtime/user-file'),'preserve');
  await assert.rejects(startWorker(f.workspace,{resourcesRoot,run:f.run,fetchImpl:f.fetchImpl}),/파일 공유 권한/);
  assert(!f.calls.some(c=>c.args[0]==='rename'||c.args.includes('-d')));
  assert(!(await readdir(path.join(f.workspace,'.runtime'))).some(f=>f.startsWith('mount-probe-')));
  assert.equal(await readFile(path.join(f.workspace,'.runtime/user-file'),'utf8'),'preserve');
});
test('failed replacement launch restores the backed up container name',async()=>{
  const f=await fixture({existing:true,runFail:true});await assert.rejects(startWorker(f.workspace,{resourcesRoot,run:f.run,fetchImpl:f.fetchImpl}),/port conflict/);
  const renames=f.calls.filter(c=>c.args[0]==='rename');assert.equal(renames.length,2);assert.equal(renames[1].args[1],renames[0].args[2]);assert.equal(renames[1].args[2],'mos-studio-eda');
});
test('healthy endpoint must authenticate before reuse; private session is absent from error text',async()=>{
  const f=await fixture();await assert.rejects(startWorker(f.workspace,{resourcesRoot,run:f.run,fetchImpl:async url=>url.endsWith('/health')?{ok:true,json:async()=>({protocol_version:1})}:{ok:false}}),/token differs/);assert.equal(f.calls.length,0);
  await assert.rejects(startWorker(f.workspace,{resourcesRoot,run:f.run,fetchImpl:f.fetchImpl,readinessMs:0}),error=>!error.message.includes(f.config.token)&&error.message.includes('[redacted]'));
});
test('mount CSV handles spaces, Unicode, commas, and literal quotes without shell interpolation',()=>{
  assert.equal(workspaceMount('/Users/설계, test/a"b'), 'type=bind,"source=/Users/설계, test/a""b",target=/workspace');
});
test('changes to imported engine modules invalidate a stopped image fingerprint',async()=>{
  const target=await mkdtemp(path.join(os.tmpdir(),'Register image-fingerprint-'));
  for(const folder of ['workers/eda','platform/commercial','adapters','examples/sky130'])await cp(path.join(resourcesRoot,folder),path.join(target,folder),{recursive:true,filter:file=>!file.includes('__pycache__')});
  const before=await validateEngineResources(target);await writeFile(path.join(target,'workers/eda/current_flow.py'),'modified engine module');assert.notEqual(await validateEngineResources(target),before);
});
