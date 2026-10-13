import {test,expect,_electron as electron} from '@playwright/test';
import {readFile,mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {randomBytes} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
const version=JSON.parse(await readFile('package.json','utf8')).version;
const resources=path.resolve(process.platform==='darwin'?`release/${version}/Resistor-darwin-${process.arch}/Resistor.app/Contents/Resources/app`:`release/${version}/Resistor-${process.platform}-x64/resources/app`);
const executable=path.resolve(process.platform==='darwin'?`release/${version}/Resistor-darwin-${process.arch}/Resistor.app/Contents/MacOS/Resistor`:`release/${version}/Resistor-${process.platform}-x64/Resistor${process.platform==='win32'?'.exe':''}`);
test('Bundled native desktop edits and simulates without Docker, system Python or pip',async()=>{
  const workspace=await mkdtemp(path.join(os.tmpdir(),'resistor-native-desktop-'));await mkdir(path.join(workspace,'.runtime'));const server=createServer();await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const port=(server.address() as {port:number}).port;await new Promise<void>(r=>server.close(()=>r()));
  await writeFile(path.join(workspace,'.runtime/worker.json'),JSON.stringify({url:'http://127.0.0.1:'+port,token:randomBytes(32).toString('hex')}));
  const app=await electron.launch({executablePath:executable,env:{...process.env,MOS_WORKSPACE:workspace,REGISTER_ENGINE_MODE:'native',REGISTER_USER_DATA:path.resolve('.runtime/native-desktop-'+process.platform+'-'+process.arch),PATH:path.dirname(process.execPath),REGISTER_DOCKER_PATH:path.join(workspace,'absent-docker')},timeout:60000});
  try{
    const window=await app.firstWindow();await expect(window.getByTestId('app-ready')).toBeVisible({timeout:60000});
    const session=JSON.parse(await readFile(path.join(workspace,'.runtime/worker.json'),'utf8'));const identity=await fetch(session.url+'/rpc',{method:'POST',headers:{'Content-Type':'application/json','X-MOS-Token':session.token},body:JSON.stringify({method:'runtime.identity',params:{}})}).then(r=>r.json());
    expect(identity.ok).toBe(true);expect(path.relative(path.join(resources,'native-runtime'),identity.result.python_executable).startsWith('..')).toBe(false);
    const doctor=await window.evaluate(()=>window.mos!.rpc('toolchain.doctor',{}));expect(doctor.ok).toBe(true);expect(doctor.result.runner).toBe('native-'+process.platform);expect(doctor.result.runtime_image).toBe(null);expect(doctor.result.tools.find((t:any)=>t.name==='ngspice').available).toBe(true);
    const rpc=async(method:string,params:any={})=>{const r=await window.evaluate(({method,params})=>window.mos!.rpc(method,params),{method,params});expect(r.ok,r.error?.message).toBe(true);return r.result;};
    let project=await rpc('project.create',{example:'schematic',name:'Docker-free desktop divider'});
    for(const device of [{id:'v1',name:'SUPPLY',kind:'voltage',pins:{'+':'VDD','-':'0'},parameters:{dc:1.8},x:100,y:100},{id:'r1',name:'TOP',kind:'resistor',pins:{'+':'VDD','-':'OUT'},parameters:{value:10000},x:240,y:100},{id:'r2',name:'BOTTOM',kind:'resistor',pins:{'+':'OUT','-':'0'},parameters:{value:10000},x:240,y:240}])project=await rpc('schematic.apply_command',{project_id:project.id,expected_revision:project.revision,command:{type:'add_device',device}});
    let run=await rpc('simulation.run',{project_id:project.id,analysis:'op'});const deadline=Date.now()+60000;while(['queued','running'].includes(run.execution_status)&&Date.now()<deadline){await new Promise(r=>setTimeout(r,100));run=await rpc('job.status',{run_id:run.id});}
    expect(run.execution_status,run.message).toBe('completed');expect(run.analysis_result).toBe('unknown');expect(run.waveforms.find((w:any)=>w.name==='OUT').y[0]).toBeCloseTo(.9,8);
    await mkdir('docs/evidence/native-runtime',{recursive:true});await window.screenshot({path:`docs/evidence/native-runtime/desktop-${process.platform}-${process.arch}.png`});await writeFile(`docs/evidence/native-runtime/desktop-${process.platform}-${process.arch}.json`,JSON.stringify({version,platform:process.platform,arch:process.arch,docker_used:false,system_python_used:false,package_resources:resources.split(path.sep).slice(-4).join('/'),voltage_V:.9,analysis_result:run.analysis_result},null,2)+'\n');
  }finally{await app.close();const {stopNativeWorker}=await import('../../scripts/native-worker.mjs');await stopNativeWorker(workspace);}
});
