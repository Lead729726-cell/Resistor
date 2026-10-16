// Bridge to the shared native circuit engine. No solver or synthetic trace lives here.
import {createHash} from 'node:crypto';
import {assessPuzzle} from '../packages/education/src/circuit-puzzles.ts';
import {validateWaveform} from '../packages/analysis/src/waveform.ts';
import {workerRpc} from './runtime.mjs';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function puzzleRecipe(p,s){
 const assessment=assessPuzzle(p,s.placements,s.connections);
 if(!['rc','nmos'].includes(p.kind)||!assessment.topology_complete)throw Error('부품을 꽂고 모든 핀 연결을 완료하세요.');
 const pulse={kind:'pulse',low:0,high:1.8,delay_s:p.kind==='rc'?1e-6:10e-9,rise_s:p.kind==='rc'?1e-7:1e-9,fall_s:p.kind==='rc'?1e-7:1e-9,width_s:p.kind==='rc'?20e-6:80e-9,period_s:p.kind==='rc'?40e-6:160e-9};
 const settings={analysis:'tran',corner:'tt',temperature_C:27,supply_V:1.8,duration_s:p.kind==='rc'?40e-6:200e-9,step_s:p.kind==='rc'?20e-9:100e-12,post_layout:false};
 const devices=[{id:'input',name:'INPUT',kind:'voltage',pins:{'+':'IN','-':'0'},parameters:{dc:0},stimulus:pulse,x:100,y:100}];
 if(p.kind==='nmos')devices.push({id:'supply',name:'SUPPLY',kind:'voltage',pins:{'+':'VCC','-':'0'},parameters:{dc:1.8},x:100,y:300});
 for(const slot of p.slots){
  const part=p.parts.find(x=>x.id===s.placements[slot.id]),kind=part.kind||'resistor';
  devices.push({id:slot.id,name:slot.id,kind,pins:Object.fromEntries(Object.entries(s.connections[slot.id]).map(([k,v])=>[k,v==='GND'?'0':v])),parameters:kind==='nmos'?{w_um:part.w_um,l_um:part.l_um,nf:1,m:1}:{value:kind==='capacitor'?part.farads:part.ohms},...(kind==='nmos'?{model:'sky130_fd_pr__nfet_01v8'}:{}),x:400,y:100+devices.length*160});
 }
 return {devices,settings,input_signature:hash({devices,settings}),model:p.kind==='nmos'?'sky130_fd_pr__nfet_01v8:tt':'ideal-R-C',process:p.kind==='nmos'?'sky130A':null};
}
function checkRun(run,trial){if(run.id!==trial.run_id||run.project_id!==trial.project_id||run.revision!==trial.project_revision)throw Error('해석 결과의 프로젝트·revision·run 식별자가 일치하지 않습니다.');}
function traces(run){
 const waves=run.waveforms||[],flow=run.current_flow;
 const all=[...waves.map(w=>({name:w.name,unit:w.unit,x:w.x,y:w.y})),...(flow?.branches||[]).filter(b=>['R1','C1','M1'].includes(b.device_id)).map(b=>({name:'I('+b.device_id+')',unit:'A',x:flow.x,y:b.values_A,reference:b.from_net+' → '+b.to_net,device_id:b.device_id}))];
 if(!all.length||!all.some(w=>w.unit==='A'))throw Error('실제 전압·단자 전류 데이터가 없습니다. 원본 run과 로그를 확인하세요.');
 for(const w of all){if(!Array.isArray(w.x)||!Array.isArray(w.y)||w.x.length>20000)throw Error('엔진 파형의 크기·축을 검증할 수 없습니다.');validateWaveform(w);if(w.unit!=='V'&&w.unit!=='A')throw Error('지원하지 않는 파형 단위입니다.');}
 if(flow?.source!=='ngspice'||flow.x_unit!=='s'||flow.revision!==run.revision)throw Error('단자 전류의 엔진·단위·revision 출처가 일치하지 않습니다.');
 for(const w of all)if(w.x.length!==all[0].x.length||w.x.some((t,i)=>t!==all[0].x[i]))throw Error('전압과 전류 파형의 실제 시간축이 일치하지 않습니다.');
 return all;
}
export async function simulatePuzzle(config,p,s,command,invoke=workerRpc){
 const recipe=puzzleRecipe(p,s),trial={id:command,board_revision:s.board_revision,placements:structuredClone(s.placements),connections:structuredClone(s.connections),created_at:new Date().toISOString(),status:'not_run',recipe,verification:{drc:'not_run',lvs:'not_run',pex:'not_run'},waveforms:[]};
 let engineReady=false;
 const api=async(method,params={})=>{const r=await invoke(config,method,params);if(!r.ok)throw Object.assign(Error(r.error.message),{code:r.error.code});return r.result;};
 try{
  const doctor=await api('toolchain.doctor');trial.engine={id:'ngspice',version:doctor.tools.find(t=>t.name==='ngspice')?.version||null};trial.process={id:recipe.process,version:recipe.process?doctor.pdk?.version||null:null};
  if(!doctor.tools.some(t=>t.name==='ngspice'&&t.available)){trial.status='unavailable';trial.message='ngspice가 설치되거나 연결되지 않았습니다. 설계 엔진 연결을 확인하세요.';return trial;}
  if(recipe.process&&!doctor.pdk?.available){trial.status='unavailable';trial.message='공개 SKY130A 모델이 연결되지 않았습니다. PDK 준비 후 다시 실행하세요.';return trial;}
  engineReady=true;
  let project=await api('project.create',{example:'schematic',name:`[Edu ${s.purpose}] ${p.title} · board r${s.board_revision}`,command_id:command+':project'});trial.project_id=project.id;
  for(const [i,device] of recipe.devices.entries())project=await api('schematic.apply_command',{project_id:project.id,expected_revision:project.revision,command_id:command+':device:'+i,command:{type:'add_device',device}});
  trial.project_revision=project.revision;
  const run=await api('simulation.run',{project_id:project.id,expected_revision:project.revision,command_id:command+':run',...recipe.settings});
  trial.run_id=run.id;trial.status=run.execution_status;trial.manifest_path=run.manifest_path;trial.message=run.message;
  if(run.execution_status==='completed'){checkRun(run,trial);trial.waveforms=traces(run);trial.analysis_result=run.analysis_result;}
 }catch(e){trial.status=e.code==='WORKER_UNAVAILABLE'||!engineReady?'unavailable':'error';trial.message=e.message;}
 return trial;
}
export async function refreshPuzzle(config,trial,invoke=workerRpc){
 if(trial.status==='submitting'){trial.status='error';trial.message='이전 요청이 완료 확인 전에 중단되었습니다. 자동 재실행하지 않았습니다. 별도 생성된 프로젝트의 실행 목록을 확인한 후 새 요청을 시작하세요.';return true;}
 if(!trial.run_id||!['queued','running'].includes(trial.status))return false;
 const r=await invoke(config,'job.status',{run_id:trial.run_id});if(!r.ok)throw Error(r.error.message);
 const run=r.result;checkRun(run,trial);trial.status=run.execution_status;trial.message=run.message;trial.manifest_path=run.manifest_path;trial.analysis_result=run.analysis_result;
 if(run.execution_status==='completed')try{trial.waveforms=traces(run);}catch(e){trial.status='error';trial.message=e.message;}
 return true;
}
