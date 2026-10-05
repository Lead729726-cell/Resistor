import {startWorker} from './worker.mjs';
import {workerRpc} from './runtime.mjs';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

if(process.platform!=='darwin')throw Error('Native Mac EDA QA must run on a real Mac with a Linux Docker engine.');
const workspace=path.resolve(process.env.MOS_WORKSPACE??process.cwd()),config=await startWorker(workspace);
const rpc=async(method,params={})=>{const r=await workerRpc(config,method,params);if(!r.ok)throw Error(`${method}: ${r.error?.message}`);return r.result;};
const report={schema_version:1,platform:process.platform,arch:process.arch,checked_at:new Date().toISOString(),workspace,engine_platform:'linux/amd64',project_id:null,cases:[],native_execution_verified:false,commercial_tools_verified:false};
const folder=path.resolve('docs/evidence');await mkdir(folder,{recursive:true});
const save=()=>writeFile(path.join(folder,`macos-native-${process.arch}.json`),JSON.stringify(report,null,2));
try{
  report.doctor=await rpc('toolchain.doctor');
  const p=await rpc('digital.create',{kind:'full_adder',physical:true,period_ns:100,command_id:randomUUID()});report.project_id=p.id;
  for(const [method,extra] of [['simulation.run',{}],['verification.run_drc',{}],['verification.run_lvs',{}],['extraction.run_pex',{}],['simulation.run',{post_layout:true}]]){
    let run=await rpc(method,{project_id:p.id,expected_revision:p.revision,...(method==='simulation.run'?p.testbench:{}),...extra});
    const deadline=Date.now()+600000;
    while(['queued','running'].includes(run.execution_status)&&Date.now()<deadline){await new Promise(r=>setTimeout(r,750));run=await rpc('job.status',{run_id:run.id});}
    const item={method,post_layout:extra.post_layout??false,run_id:run.id,execution_status:run.execution_status,analysis_result:run.analysis_result,unit_verification:run.unit_verification??null};report.cases.push(item);await save();
    if(run.execution_status!=='completed'||run.analysis_result!=='pass')throw Error(`Native Mac stage failed: ${method}; ${run.message??run.execution_status}`);
    if(method==='simulation.run'&&run.unit_verification?.passed_cases!==8)throw Error('Full adder did not pass all 8 actual waveform cases.');
    console.log(`PASS ${method}${extra.post_layout?' (actual RC)':''}`);
  }
  report.native_execution_verified=true;await save();console.log('Actual Mac full-adder pre/DRC/LVS/PEX/post passed. Commercial tools and foundry signoff remain unverified.');
}catch(e){report.failure=e.message;await save();throw e;}
