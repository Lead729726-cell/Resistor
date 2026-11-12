import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {nativeSettings,nativeEnvironment,workspaceId,startNativeWorker,runtimeIdentity,nativeResourcesHash} from '../scripts/native-worker.mjs';
import {startWorker} from '../scripts/worker.mjs';
import {runtimeConfig} from '../scripts/runtime.mjs';
import {configureEngine} from '../scripts/engine-settings.mjs';
import {wslDistributions} from '../scripts/wsl-worker.mjs';
import {nativePreparationLimit,runPreparationPhase} from '../scripts/native-preparation.mjs';

const folder=async()=>{const p=await mkdtemp(path.join(os.tmpdir(),'resistor-native-test-'));await mkdir(path.join(p,'.runtime'));return p;};
const response=result=>({ok:true,status:200,json:async()=>({ok:true,result})});
test('default dispatcher reuses the authenticated native process without Docker or tool execution',async()=>{
  const workspace=await folder();let calls=0;const code=await nativeResourcesHash(process.cwd());const result=await startWorker(workspace,{resourcesRoot:process.cwd(),fetchImpl:async(_url,options)=>{calls++;assert.equal(JSON.parse(options.body).method,'runtime.identity');return response({workspace_id:workspaceId(workspace),runtime_kind:'native-'+process.platform,engine_code_sha256:code});},run:async()=>{throw Error('No executable should run');}});assert.equal(result.engine_mode,'native');assert.equal(calls,1);
});
test('an authenticated foreign workspace never starts or replaces a process',async()=>{
  const workspace=await folder();await assert.rejects(startNativeWorker(workspace,{fetchImpl:async()=>response({workspace_id:'other',runtime_kind:'native-'+process.platform}),run:async()=>{throw Error('must not run');}}),/다른 경로/);
});
test('an authenticated WSL process cannot silently be reused as native',async()=>{
  const workspace=await folder();await assert.rejects(startNativeWorker(workspace,{fetchImpl:async()=>response({workspace_id:workspaceId(workspace),runtime_kind:'wsl-linux'})}),/실행 방식/);
});
test('legacy healthy Docker endpoint is preserved and must be explicitly migrated',async()=>{
  const workspace=await folder();await assert.rejects(startNativeWorker(workspace,{fetchImpl:async url=>url.endsWith('/health')?{ok:true}:{ok:true,status:200,json:async()=>({ok:false})},run:async()=>{throw Error('must not run');}}),/different engine/);
});
test('foreign authentication is rejected without exposing credentials',async()=>{
  const workspace=await folder(),config=await runtimeConfig(workspace);let message='';try{await runtimeIdentity(config,async()=>({status:401}));}catch(e){message=e.message;}assert.match(message,/another authenticated/);assert(!message.includes(config.token));
});
test('operator settings reject unknown commands, modes and nonabsolute tool paths',async()=>{
  const workspace=await folder();for(const value of [{mode:'unknown'},{command:'exec'},{tool_paths:['relative']},{python:'a\ncommand'}]){await writeFile(path.join(workspace,'.runtime/engine.json'),JSON.stringify(value));await assert.rejects(nativeSettings(workspace));}
});
test('renderer engine settings accept only mode and an installed WSL distribution',async()=>{
  const workspace=await folder();await assert.rejects(configureEngine(workspace,{mode:'native',python:'/injected'}),/사용자 명령/);await assert.rejects(configureEngine(workspace,{mode:'wsl',distribution:'docker-desktop'}),/독립된/);
});
test('bundled CPU/OS mismatch is rejected before executing tools',async()=>{
  const workspace=await folder();await mkdir(path.join(workspace,'native-runtime'));await writeFile(path.join(workspace,'native-runtime/manifest.json'),JSON.stringify({platform:'other',arch:process.arch}));await assert.rejects(nativeEnvironment(workspace,{run:async()=>{throw Error('must not run');}}),/CPU\/OS/);
});
test('bundled traversal paths are rejected before interpreter execution',async()=>{
  const workspace=await folder();await mkdir(path.join(workspace,'native-runtime'));await writeFile(path.join(workspace,'native-runtime/manifest.json'),JSON.stringify({platform:process.platform,arch:process.arch,python:'../python'}));await assert.rejects(nativeEnvironment(workspace,{run:async()=>{throw Error('must not run');}}),/resource path/);
});
test('Docker Desktop internal WSL distributions are excluded from user choices',async()=>{
  if(process.platform!=='win32'){assert.deepEqual(await wslDistributions(),[]);return;}
  const found=await wslDistributions(async(exe,args,options)=>{assert.equal(exe,'wsl.exe');assert.deepEqual(args,['--list','--quiet']);assert.equal(options.encoding,'utf16le');return 'Ubuntu\r\ndocker-desktop\r\ndocker-desktop-data\r\nDebian\r\n';});assert.deepEqual(found,['Ubuntu','Debian']);
});
test('read-only source diagnosis probes KLayout without pip installation or Docker',async()=>{
  const workspace=await folder();await writeFile(path.join(workspace,'.runtime/engine.json'),JSON.stringify({python:'/operator/python'}));const commands=[];await assert.rejects(nativeEnvironment(workspace,{prepare:false,run:async(exe,args)=>{commands.push([exe,args]);throw Error('missing KLayout');}}),/KLayout/);assert.equal(commands.length,1);assert(!JSON.stringify(commands).includes('pip'));assert(!JSON.stringify(commands).includes('docker'));
});

test('only Intel Mac compiler preparation gets 20 minutes; probes and other platforms retain their budgets',()=>{
  for(const [platform,arch,expected]of [['darwin','x64',1200000],['darwin','arm64',600000],['linux','x64',600000],['win32','x64',600000]]){
    assert.equal(nativePreparationLimit('ngspice-compile',{platform,arch}),expected);
    assert.equal(nativePreparationLimit('ngspice-probe',{platform,arch}),20000);
    assert.equal(nativePreparationLimit('ngspice-configure',{platform,arch}),180000);
    assert.equal(nativePreparationLimit('pdk-extract',{platform,arch}),120000);
  }
  assert.throws(()=>nativePreparationLimit('private-path-or-secret'),/Unknown native preparation phase/);
});

test('preparation reports real completion and elapsed time without logging command arguments or environment',async()=>{
  const logs=[];let time=10,call;
  const result=await runPreparationPhase('ngspice-compile','compiler',['private-argument'],{cwd:'private-path',env:{TOKEN:'private-token'},timeout:Infinity},{platform:'darwin',arch:'x64',now:()=>time,log:line=>logs.push(JSON.parse(line)),run:async(executable,args,options)=>{call={executable,args,options};time=110;return 'compiled';}});
  assert.equal(result,'compiled');assert.equal(call.options.timeout,1200000);assert.equal(call.options.env.TOKEN,'private-token');
  assert.deepEqual(logs.map(({status,elapsed_ms})=>({status,elapsed_ms})),[{status:'started',elapsed_ms:0},{status:'completed',elapsed_ms:100}]);
  assert(!JSON.stringify(logs).includes('private-'));
});

test('failed preparation keeps its cause and phase but never emits completed or executes an unknown phase',async()=>{
  const logs=[];let calls=0,time=1;const cause=Error('Local tool preparation timed out.');
  const dependencies={now:()=>time,log:line=>logs.push(JSON.parse(line)),run:async()=>{calls++;time=600001;throw cause;}};
  await assert.rejects(runPreparationPhase('ngspice-compile','make',[],{},dependencies),error=>error.cause===cause&&/ngspice-compile failed after 600000 ms/.test(error.message));
  assert.deepEqual(logs.map(item=>item.status),['started','failed']);
  await assert.rejects(runPreparationPhase('unknown','make',[],{},dependencies),/Unknown native preparation phase/);
  assert.equal(calls,1);assert.equal(logs.length,2);
});
