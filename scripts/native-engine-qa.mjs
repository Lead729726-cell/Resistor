// Real host-process QA. No Docker executable, API or container is used here.
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {startWorker} from './worker.mjs';
import {stopNativeWorker,runtimeIdentity} from './native-worker.mjs';
import {runtimeConfig,workerRpc} from './runtime.mjs';

const root=process.cwd(),resources=path.resolve(process.env.REGISTER_QA_RESOURCES||root);
await mkdir(path.join(root,'.runtime/native-qa'),{recursive:true});
const workspace=await mkdtemp(path.join(root,'.runtime/native-qa','design 공간-'));
const config=await runtimeConfig(workspace);
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
config.url='http://127.0.0.1:'+port;await writeFile(config.file,JSON.stringify({url:config.url,token:config.token}));
const emptyPdk=path.join(workspace,'empty-pdks');await mkdir(emptyPdk);await writeFile(path.join(workspace,'.runtime/engine.json'),JSON.stringify({mode:'native',pdk_root:emptyPdk}));
const report={schema_version:1,version:JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version,checked_at:new Date().toISOString(),platform:process.platform,arch:process.arch,docker_used:false,cases:[],physical_signoff:false};
const check=(name,details={})=>{report.cases.push({name,passed:true,...details});console.log('PASS '+name);};
const api=async(method,params={})=>{const body=await workerRpc(config,method,params);assert(body.ok,`${method}: ${body.error?.code}: ${body.error?.message}`);return body.result;};
const wait=async job=>{const deadline=Date.now()+120000;while(['queued','running'].includes(job.execution_status)&&Date.now()<deadline){await new Promise(r=>setTimeout(r,100));job=await api('job.status',{run_id:job.id});}return job;};
const localFile=value=>path.join(workspace,value.replace(/^\/workspace\//,''));
let started=false;
try{
  await startWorker(workspace,{resourcesRoot:resources,mode:'native',prepare:false});started=true;
  const identity=await runtimeIdentity(config);assert.equal(identity.runtime_kind,'native-'+process.platform);check('authenticated native host process',{runtime_kind:identity.runtime_kind});
  const doctor=await api('toolchain.doctor');assert.equal(doctor.runtime_image,null);assert.equal(doctor.pdk.available,false);assert(doctor.tools.find(t=>t.name==='KLayout')?.available);assert(doctor.tools.find(t=>t.name==='ngspice')?.available);report.tools=doctor.tools.map(({name,available,version})=>({name,available,version}));check('KLayout and ngspice without a PDK or Docker');
  const bad=await fetch(config.url+'/rpc',{method:'POST',headers:{'Content-Type':'application/json','X-MOS-Token':'untrusted'},body:JSON.stringify({method:'project.list',params:{}})});assert.equal(bad.status,401);check('unauthenticated requests rejected');
  let circuit=await api('project.create',{example:'schematic',name:'Native 1.8V divider'});
  for(const device of [
    {id:'vdd',name:'SUPPLY',kind:'voltage',pins:{'+':'VDD','-':'0'},parameters:{dc:1.8},x:100,y:100},
    {id:'r1',name:'TOP',kind:'resistor',pins:{'+':'VDD','-':'OUT'},parameters:{value:10000},x:240,y:100},
    {id:'r2',name:'BOTTOM',kind:'resistor',pins:{'+':'OUT','-':'0'},parameters:{value:10000},x:240,y:240}
  ])circuit=await api('schematic.apply_command',{project_id:circuit.id,expected_revision:circuit.revision,command_id:randomUUID(),command:{type:'add_device',device}});
  const netlist=await api('schematic.export_spice',{project_id:circuit.id});assert.match(netlist.text,/10000/);assert.match(netlist.path,/^\/workspace\//);await readFile(localFile(netlist.path));check('circuit edits, exact SPICE and virtual artifact paths');
  const before=circuit.revision,job=await wait(await api('simulation.run',{project_id:circuit.id,analysis:'op',post_layout:false}));
  assert.equal(job.execution_status,'completed',job.message);assert.equal(job.analysis_result,'unknown');
  const voltage=job.waveforms.find(w=>w.name==='OUT');assert(voltage&&Math.abs(voltage.y[0]-.9)<1e-8);assert(job.current_flow.branches.some(b=>b.values_A?.some(v=>Math.abs(Math.abs(v)-90e-6)<1e-10)));check('actual ideal-circuit OP: 0.9 V and 90 uA; functional verdict UNKNOWN',{run_id:job.id,voltage_V:voltage.y[0]});
  const long=await api('simulation.run',{project_id:circuit.id,analysis:'tran',duration_s:1e-3,step_s:5e-9});
  await assert.rejects(stopNativeWorker(workspace),/실행 중/);await api('job.cancel',{run_id:long.id});const canceled=await wait(await api('job.status',{run_id:long.id}));assert.equal(canceled.execution_status,'canceled');check('busy engine refuses shutdown and actual host job cancels');
  const wrong=await fetch(config.url+'/rpc',{method:'POST',headers:{'Content-Type':'application/json','X-MOS-Token':config.token},body:JSON.stringify({method:'runtime.stop',params:{instance_id:'wrong-owner'}})});assert.equal((await wrong.json()).error.code,'NOT_OWNER');check('foreign runtime owner cannot stop the engine');
  let layout=await api('project.create',{example:'layout',name:'Native geometry'});
  layout=await api('layout.apply_command',{project_id:layout.id,expected_revision:layout.revision,command:{type:'add_box',layer_id:'68/20',box:['0','0','1000','500']}});
  const scene=await api('view.get_scene',{project_id:layout.id});assert(scene.shapes.length>0);check('native rectangle editing without a PDK');
  for(const format of ['gds','oas']){const exported=await api('layout.export',{project_id:layout.id,format});assert.match(exported.path,/^\/workspace\//);await readFile(localFile(exported.path));const target=await api('project.create',{example:'layout',name:'Native roundtrip '+format});const imported=await api('layout.import',{project_id:target.id,path:exported.path});const geometry=await api('view.get_scene',{project_id:imported.id});assert.equal(geometry.shapes.length,scene.shapes.length);}
  check('GDSII and OASIS actual engine round trips');
  const unsafe=await workerRpc(config,'layout.import',{path:'/workspace/../outside.gds'});assert.equal(unsafe.error.code,'UNTRUSTED_PATH');check('workspace traversal rejected');
  await stopNativeWorker(workspace);started=false;
  await writeFile(path.join(workspace,'.runtime/engine.json'),JSON.stringify({mode:'native'}));
  await startWorker(workspace,{resourcesRoot:resources,mode:'native',prepare:false});started=true;
  const reopened=await api('project.open',{project_id:circuit.id});assert.equal(reopened.revision,before);assert.equal(reopened.schematic.devices.length,3);assert(reopened.runs.some(r=>r.id===job.id));check('restart preserves designs and actual result history');
  const pdkDoctor=await api('toolchain.doctor');assert(pdkDoctor.pdk.available,'Release runtime must contain the declared public PDK.');
  const inverter=await api('project.create',{example:'inverter',name:'Native SKY130 inverter'});const actual=await wait(await api('simulation.run',{project_id:inverter.id,analysis:'tran',duration_s:30e-9,step_s:20e-12}));assert.equal(actual.execution_status,'completed',actual.message);assert(actual.waveforms.length>=2);assert(actual.current_flow.branches.length>0);check('actual SKY130 inverter model transient with signed currents',{run_id:actual.id,analysis_result:actual.analysis_result});
  report.public_pdk_available=true;
  if(process.env.REGISTER_NATIVE_PHYSICAL_QA==='1'){
    assert(pdkDoctor.tools.find(t=>t.name==='Magic')?.available);assert(pdkDoctor.tools.find(t=>t.name==='Netgen')?.available);
    for(const method of ['verification.run_drc','verification.run_lvs','extraction.run_pex']){const result=await wait(await api(method,{project_id:inverter.id}));assert.equal(result.execution_status,'completed',result.message);assert.equal(result.analysis_result,'pass',result.message);check('actual native '+method,{run_id:result.id});}
    const post=await wait(await api('simulation.run',{project_id:inverter.id,analysis:'tran',duration_s:30e-9,step_s:20e-12,post_layout:true}));assert.equal(post.execution_status,'completed',post.message);assert.equal(post.analysis_result,'pass',post.message);check('actual native post-layout RC transient',{run_id:post.id});report.native_physical_tools_verified=true;
  }
  report.source_sha256=Object.fromEntries(await Promise.all(['workers/eda/server.py','workers/eda/native_entry.py','scripts/native-worker.mjs','scripts/native-engine-qa.mjs'].map(async f=>[f,createHash('sha256').update(await readFile(path.join(resources,f))).digest('hex')])));
}finally{
  if(started)await stopNativeWorker(workspace);
  await mkdir('docs/evidence/native-runtime',{recursive:true});await writeFile(`docs/evidence/native-runtime/${process.platform}-${process.arch}.json`,JSON.stringify(report,null,2)+'\n');
}
