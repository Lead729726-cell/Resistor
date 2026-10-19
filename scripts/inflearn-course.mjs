// Instructor kit stays local and gitignored. Never uploads a course or uses paid APIs.
import {mkdir,readFile,writeFile,access} from 'node:fs/promises';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {startWorker} from './worker.mjs';
import {stopNativeWorker,runtimeIdentity} from './native-worker.mjs';
import {runtimeConfig,workerRpc} from './runtime.mjs';
import {demoDefinitions,validateCourse,buildCourseKit,sha} from './course-kit.mjs';
import {createCourseServer} from './course-server.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const command=process.argv[2]||'prepare';
const base=path.resolve(root,process.argv.find(a=>a.startsWith('--base='))?.slice(7)||'teaching-private/inflearn-resistor');
if(!base.startsWith(path.join(root,'teaching-private')+path.sep))throw Error('Use a private directory below teaching-private/.');
const workspace=path.join(base,'workspace');
const exists=async f=>{try{await access(f);return true;}catch{return false;}};
const json=async f=>JSON.parse(await readFile(f,'utf8'));
const save=async(f,value)=>{await mkdir(path.dirname(f),{recursive:true});await writeFile(f,JSON.stringify(value,null,2)+'\n');};
const course=validateCourse(await json(path.join(base,'course.json')));
const stateFile=path.join(base,'preparation-state.json'),readyFile=path.join(base,'demo-readiness.json');
let started=false,vite,server;
await mkdir(path.join(workspace,'.runtime'),{recursive:true});
if(!await exists(path.join(workspace,'.runtime/worker.json'))){
  const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
  await save(path.join(workspace,'.runtime/worker.json'),{url:`http://127.0.0.1:${port}`,token:randomUUID()+randomUUID()});
  await save(path.join(workspace,'.runtime/engine.json'),{mode:'native'});
}
const config=await runtimeConfig(workspace);
const api=async(method,params={})=>{const r=await workerRpc(config,method,params);if(!r.ok)throw Error(`${method}: ${r.error?.code}: ${r.error?.message}`);return r.result;};
const start=async()=>{const current=await runtimeIdentity(config);await startWorker(workspace,{resourcesRoot:root,mode:'native',prepare:false});started=!current;};
const wait=async job=>{const deadline=Date.now()+150000;while(['queued','running'].includes(job.execution_status)&&Date.now()<deadline){await new Promise(r=>setTimeout(r,300));job=await api('job.status',{run_id:job.id});}if(job.execution_status!=='completed')throw Error('Demo execution failed: '+JSON.stringify({run:job.id,status:job.execution_status,message:job.message,logs:await api('job.logs',{run_id:job.id})}));return job;};
const local=file=>{if(!file?.startsWith('/workspace/'))throw Error('Invalid artifact path');const f=path.resolve(workspace,file.slice(11));if(!f.startsWith(workspace+path.sep))throw Error('Artifact escapes private workspace');return f;};
try{
  if(command==='prepare'){
    await start();
    const state=await exists(stateFile)?await json(stateFile):{schema_version:1,projects:{},commands:{}};
    // Validate all prior revisions before doing work. Never overwrite an instructor's edits.
    for(const [id,entry]of Object.entries(state.projects)){const p=await api('project.open',{project_id:entry.project_id});if(p.revision!==entry.revision)throw Error(`Demo ${id} was edited. It is preserved. Use a new --base=teaching-private/<session> with its own course.json.`);}
    const readiness={schema_version:1,edition:'Resistor Indust',prepared_at:new Date().toISOString(),engine:'native-'+process.platform,arch:process.arch,tools:(await api('toolchain.doctor')).tools,workspace:path.relative(root,workspace).replaceAll('\\','/'),demos:[],physical_signoff:false,paid_calls:0};
    await mkdir(path.join(base,'demos'),{recursive:true});
    for(const [id,def]of Object.entries(demoDefinitions)){
      let p;
      if(state.projects[id])p=await api('project.open',{project_id:state.projects[id].project_id});
      else{
        state.commands[id]??=randomUUID();await save(stateFile,state);
        p=def.template?await api('design.create_template',{template_id:def.template,name:'[촬영] '+id,command_id:state.commands[id]}):await api('project.create',{example:def.example,name:'[촬영] '+id});
        if(id==='divider'){
          // The schematic example is empty. Explicit ports and units, no hidden voltage source.
          if(p.schematic.devices.length)throw Error('Expected a blank schematic starter.');
          const devices=[{id:'VDD',kind:'voltage',name:'VDD',x:0,y:0,rotation:0,pins:{'+':'VDD','-':'0'},parameters:{dc:1.8}},{id:'Rtop',kind:'resistor',name:'Rtop',x:180,y:0,rotation:0,pins:{'+':'VDD','-':'OUT'},parameters:{value:10000}},{id:'Rbottom',kind:'resistor',name:'Rbottom',x:360,y:0,rotation:0,pins:{'+':'OUT','-':'0'},parameters:{value:10000}}];
          for(const device of devices)p=await api('schematic.apply_command',{project_id:p.id,expected_revision:p.revision,command_id:randomUUID(),command:{type:'add_device',device}});
        }
        if(id==='layout')p=await api('layout.apply_command',{project_id:p.id,expected_revision:p.revision,command_id:randomUUID(),command:{type:'add_box',layer_id:'68/20',box:['0','0','2000','1000']}});
        state.projects[id]={project_id:p.id,revision:p.revision};await save(stateFile,state);
      }
      const bundle=await api('project.export_bundle',{project_id:p.id,inline:true});
      await writeFile(path.join(base,'demos',id+'.register.zip'),Buffer.from(bundle.bundle_base64,'base64'));
      const imported=await api('project.import_bundle',{bundle_base64:bundle.bundle_base64,mode:'new',command_id:randomUUID()});
      if(imported.runs.length)throw Error('Student bundle inherited verification results.');
      const entry={id,project_id:p.id,revision:p.revision,starter_sha256:sha(Buffer.from(bundle.bundle_base64,'base64')),student_import_runs:imported.runs.length};
      if(id==='layout'){
        entry.roundtrip=[];
        for(const format of ['gds','oas']){
          const exported=await api('layout.export',{project_id:p.id,format});
          const target=await api('project.create',{example:'layout',name:'[촬영 왕복] '+format});
          const result=await api('layout.import',{project_id:target.id,path:exported.path,command_id:randomUUID(),expected_revision:target.revision});
          const scene=await api('view.get_scene',{project_id:result.id,max_shapes:100});
          if(!scene.shapes.length)throw Error('Layout roundtrip is empty.');
          entry.roundtrip.push({format,sha256:sha(await readFile(local(exported.path))),shape_count:scene.shapes.length});
        }
        entry.execution_status='not-applicable';entry.analysis_result='not-run';
      }else{
        const job=await wait(await api('simulation.run',{project_id:p.id,...p.testbench,...(id==='divider'?{analysis:'op'}:{})}));
        if(def.template?.startsWith('osc_')&&job.analysis_result!=='pass')throw Error('Oscillator reference criteria did not pass.');
        Object.assign(entry,{run_id:job.id,execution_status:job.execution_status,analysis_result:job.analysis_result,freshness:job.freshness,measurements:job.measurements,condition:{...p.testbench,...(id==='divider'?{analysis:'op'}:{})},tool:job.tool,manifest_sha256:sha(await readFile(local(job.manifest_path)))});
        if(id==='divider'){
          const out=job.waveforms?.find(w=>w.name.toUpperCase()==='OUT')?.y[0];
          if(!Number.isFinite(out)||Math.abs(out-.9)>1e-6)throw Error('Divider OP did not match its 0.9 V reference.');
          entry.reference_check={OUT_V:out,expected_V:.9,tolerance_V:1e-6,current_A:(1.8-out)/10000,current_method:'Ohm law from actual solved voltage and explicit 10k resistor'};
        }
        await save(path.join(base,'runs',id+'.json'),job);
      }
      readiness.demos.push(entry);await save(readyFile,readiness);
      console.log(JSON.stringify({demo:id,execution:entry.execution_status,verdict:entry.analysis_result,frequency_Hz:entry.measurements?.output_frequency_Hz}));
    }
    readiness.completed=true;await save(readyFile,readiness);
    const built=await buildCourseKit({root,base,course,readiness});console.log(JSON.stringify({package:built.out,lessons:course.lessons.length,planned_minutes:course.planned_total_minutes}));
  }else if(command==='build'){
    const readiness=await json(readyFile);if(!readiness.completed)throw Error('Complete course:prepare first.');
    console.log(JSON.stringify({package:(await buildCourseKit({root,base,course,readiness})).out}));
  }else if(command==='serve'){
    if(!await exists(path.join(base,'package/index.html')))throw Error('Run course:prepare first.');
    await start();
    vite=spawn(process.execPath,['node_modules/vite/bin/vite.js'],{cwd:root,env:{...process.env,RESISTOR_EDITION:'indust',MOS_WORKSPACE:workspace,REGISTER_DEV_PORT:'5188'},windowsHide:true,stdio:['ignore','pipe','pipe']});
    await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(Error('Course workbench did not start.')),30000);vite.once('error',reject);vite.once('exit',c=>{clearTimeout(timer);reject(Error('Workbench exited '+c+': '+text.slice(-1000)));});vite.stdout.on('data',b=>{text+=b;if(text.includes('Local:')){clearTimeout(timer);resolve();}});vite.stderr.on('data',b=>text+=b);});
    server=await createCourseServer(path.join(base,'package'));
    console.log('Instructor console: http://127.0.0.1:5189/\nResistor Indust workbench: http://127.0.0.1:5188/eda\nCtrl+C stops only this course session.');
    await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});
  }else throw Error('Use prepare, build or serve.');
}finally{
  if(server)await new Promise(r=>server.close(r));if(vite)vite.kill();if(started)await stopNativeWorker(workspace);
}
