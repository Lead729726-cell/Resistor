// Own disposable projects; truth-table comparisons are QA, not app signoff.
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile,mkdir,writeFile,cp} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import {runtimeConfig,workerRpc} from './runtime.mjs';
import {startWorker} from './worker.mjs';
import {getProductEdition} from './edition-workspace.mjs';
import {configureEngine} from './engine-settings.mjs';
const edition=getProductEdition(),workspace=process.env.MOS_WORKSPACE||path.resolve('.runtime/logic-qa/workspace');
const args=process.argv.slice(2);assert(args.length<=1&&args.every(a=>a.startsWith('--wsl=')),'Use only --wsl=<installed distribution>.');
if(!process.env.MOS_WORKSPACE){
 await mkdir(path.join(workspace,'.runtime'),{recursive:true});
 const marker=path.join(workspace,'.runtime/product-context.json');
 try{assert.equal(JSON.parse(await readFile(marker,'utf8')).product_id,edition.id,'QA workspace belongs to another edition.');}catch(e){if(e.code!=='ENOENT')throw e;}
 await writeFile(marker,JSON.stringify({schema_version:1,product_id:edition.id,edition:edition.edition,workspace}));
 for(const dir of ['adapters','examples/sky130','platform/commercial'])await cp(path.resolve(dir),path.join(workspace,dir),{recursive:true,force:false,filter:f=>!f.split(/[\\/]/).some(p=>['.runtime','.secrets','__pycache__'].includes(p))&&!path.basename(f).startsWith('.env')&&!/\.(pem|key|p12|pfx|sqlite3?)$/i.test(f)});
 try{await writeFile(path.join(workspace,'.runtime/worker.json'),JSON.stringify({url:'http://127.0.0.1:18985',token:randomBytes(32).toString('hex')}),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}
}
if(args[0])await configureEngine(workspace,{mode:'wsl',distribution:args[0].slice(6)});
const config=await runtimeConfig(workspace);
await startWorker(workspace,{resourcesRoot:process.cwd()});
const call=async(method,params={})=>{const r=await workerRpc(config,method,params);assert.equal(r.ok,true,method+': '+JSON.stringify(r.error));return r.result;};
const doctor=await call('toolchain.doctor');assert(doctor.tools.some(t=>t.name==='ngspice'&&t.available),'Actual ngspice is required for native QA.');
const report={schema_version:1,edition:edition.edition,checked_at:new Date().toISOString(),purpose:'qa',not_student_submission:true,tools:doctor.tools.map(({name,version,available})=>({name,version,available})),pdk:{id:doctor.pdk.id,version:doctor.pdk.version},rows:[],checks:{},source_sha256:{},foundry_signoff:false};
for(const kind of ['nand-chain','half-adder','mux-chain']){
 let p=await call('project.create',{example:'schematic',name:'[Logic QA] '+kind});
 const edit=async command=>{await call('schematic.apply_command',{project_id:p.id,expected_revision:p.revision,command});p=await call('project.open',{project_id:p.id});};
 await edit({type:'initialize_logic_demo',kind});assert((await call('schematic.validate',{project_id:p.id})).valid);
 for(let n=0;n<(kind==='mux-chain'?8:4);n++){
  const a=n&1,b=(n>>1)&1,s=(n>>2)&1;
  for(const [pin,value]of [['a',a],['b',b],...(kind==='mux-chain'?[['sel',s]]:[])])await edit({type:'update_device',id:'source_'+pin,parameters:{dc:value*1.8}});
  const schematic=JSON.stringify(p.schematic),revision=p.revision;
  let r=await call('simulation.run',{project_id:p.id,analysis:'op',netlister:'native',post_layout:false});
  const deadline=Date.now()+60000;
  while(['queued','running'].includes(r.execution_status)){assert(Date.now()<deadline,'Actual OP run timed out');await new Promise(resolve=>setTimeout(resolve,150));r=await call('job.status',{run_id:r.id});}
  assert.equal(r.execution_status,'completed',JSON.stringify(r));assert.equal(r.analysis_result,'unknown','Numerical OP is not functional/manufacturing PASS.');
  const expected=kind==='nand-chain'?{Y:1-(a&b)}:kind==='half-adder'?{SUM:a^b,COUT:a&b}:{Y:s?(a&b):a};
  const actual={};for(const [net,bit]of Object.entries(expected)){
   const wave=r.waveforms.find(w=>w.name.toLowerCase()===net.toLowerCase()||w.name.toLowerCase()==='v('+net.toLowerCase()+')');assert(wave,'Missing measured '+net+' '+r.waveforms.map(w=>w.name));
   assert.equal(wave.unit,'V');const value=wave.y.at(-1);assert(Number.isFinite(value));assert(bit?value>1.26:value<.54,kind+'/'+n+'/'+net+' '+value);actual[net]=value;
  }
  p=await call('project.open',{project_id:p.id});assert.equal(JSON.stringify(p.schematic),schematic);assert.equal(p.revision,revision);
  report.rows.push({kind,project_id:p.id,revision,run_id:r.id,inputs:{A:a,B:b,...(kind==='mux-chain'?{SEL:s}:{})},expected,measured_V:actual,execution_status:r.execution_status,analysis_result:r.analysis_result,tool:r.tool});
  console.log('Actual OP '+kind+' '+n+' '+JSON.stringify(actual));
 }
 await call('project.save',{project_id:p.id});const reopened=await call('project.open',{project_id:p.id});assert.equal(JSON.stringify(reopened.schematic),JSON.stringify(p.schematic));
 const clone=await call('project.clone',{project_id:p.id,name:'[Logic QA] preserved clone'});assert.notEqual(clone.id,p.id);assert.equal(JSON.stringify(clone.schematic),JSON.stringify(p.schematic));
 const stale=await workerRpc(config,'schematic.apply_command',{project_id:p.id,expected_revision:p.revision-1,command:{type:'update_device',id:'source_a',parameters:{dc:0}}});assert.equal(stale.error.code,'REVISION_CONFLICT');
 const nonempty=await workerRpc(config,'schematic.apply_command',{project_id:p.id,expected_revision:p.revision,command:{type:'initialize_logic_demo',kind}});assert.equal(nonempty.error.code,'NONEMPTY_PROJECT');
 const before=p.revision;await edit({type:'update_device',id:'source_a',parameters:{dc:.9}});assert.equal(p.revision,before+1);assert(p.runs.some(r=>r.freshness==='stale'));
}
report.checks={actual_16_operating_points:true,source_hierarchy_preserved:true,save_reopen_clone:true,revision_conflict_rejected:true,nonempty_project_preserved:true,prior_result_stale_after_edit:true,numerical_result_not_functional_pass:true};
for(const file of ['workers/eda/logic_composition.py','workers/eda/custom_circuit.py','workers/eda/digital_units.py','workers/eda/native.py','workers/eda/server.py'])report.source_sha256[file]=createHash('sha256').update(await readFile(file)).digest('hex');
await mkdir('docs/evidence/logic-composition',{recursive:true});await writeFile('docs/evidence/logic-composition/native.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({actual_runs:report.rows.length,checks:report.checks}));
