import type {Project,Run} from '@mos/contracts';
export const validationStages=[['pre','회로 해석','simulation.run'],['drc','DRC','verification.run_drc'],['lvs','LVS','verification.run_lvs'],['pex','PEX','extraction.run_pex'],['post','RC 포함 해석','simulation.run']] as const;
export type ValidationStage=typeof validationStages[number][0];
export function stageOf(run:Run):ValidationStage|null{
  if(run.workflow==='imported-results'||run.native_execution===false)return null;
  if(['drc','lvs','pex'].includes(run.kind))return run.kind as ValidationStage;
  if(run.kind!=='simulation')return null;
  const post=run.analysis_stage??(run.measurements?.post_layout==='true'?'post-layout':run.measurements?.post_layout==='false'?'pre-layout':null);
  return post==='pre-layout'?'pre':post==='post-layout'?'post':null;
}
export function validationRows(project:Project){
  return validationStages.map(([id,label])=>{const candidates=project.runs.filter(r=>r.project_id===project.id&&stageOf(r)===id),run=[...candidates].reverse().find(r=>r.revision===project.revision&&r.freshness==='current')??candidates.at(-1);const stale=!!run&&(run.revision!==project.revision||run.freshness!=='current');return {id,label,run,stale,passed:!!run&&!stale&&run.execution_status==='completed'&&run.analysis_result==='pass'};});
}
type Transport=<T>(method:string,params?:Record<string,unknown>)=>Promise<T>;
export async function executeValidation(project:Project,transport:Transport,signal:AbortSignal,onRun:(run:Run)=>void|Promise<void>,pause=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms)),commandId=()=>crypto.randomUUID()){
  for(const [stage,,method] of validationStages){
    if(signal.aborted)return;
    const source=await transport<Project>('project.snapshot',{project_id:project.id});
    if(source.revision!==project.revision)throw Error('설계가 변경되어 다음 검증을 중단했습니다. 현재 revision에서 다시 시작하세요.');
    if(source.runs.some(r=>['queued','running'].includes(r.execution_status)))throw Error('이 설계의 기존 작업이 실행 중입니다. 완료하거나 취소한 뒤 검증을 시작하세요.');
    if(signal.aborted)return;
    let run=await transport<Run>(method,{project_id:project.id,expected_revision:project.revision,command_id:commandId(),...(method==='simulation.run'?{...project.testbench,post_layout:stage==='post'}:{})});
    if(run.project_id!==project.id||run.revision!==project.revision)throw Error('요청한 설계 snapshot과 실행 결과가 다릅니다.');
    await onRun(run);const deadline=Date.now()+900000;
    while(['queued','running'].includes(run.execution_status)){
      if(signal.aborted)return;
      if(Date.now()>deadline){await transport('job.cancel',{run_id:run.id});throw Error('검증 단계의 대기 시간을 초과해 취소했습니다.');}
      await pause(1200);if(signal.aborted)return;
      run=await transport<Run>('job.status',{run_id:run.id});await onRun(run);
    }
    if(signal.aborted)return;
    if(run.freshness!=='current'||run.execution_status!=='completed'||run.analysis_result!=='pass')throw Error(`${stage.toUpperCase()} 결과로 다음 단계를 중단했습니다: ${run.message??run.analysis_result}`);
  }
}
