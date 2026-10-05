import type { CurrentFlow, Scene } from '@mos/contracts';
import { branchCurrent,currentDirection,flowStatus,formatCurrent,sampleIndex } from './current';

export function CurrentFlowPanel({flow,scene,index,playing,visible,scale,branchId,onIndex,onPlaying,onVisible,onScale,onBranch,onFocus}: {
  flow:CurrentFlow;scene:Scene|null;index:number;playing:boolean;visible:boolean;scale:number;branchId:string|null;
  onIndex:(value:number)=>void;onPlaying:(value:boolean)=>void;onVisible:(value:boolean)=>void;onScale:(value:number)=>void;
  onBranch:(id:string|null)=>void;onFocus:(id:string)=>void;
}) {
  const isAc=flow.analysis.trim().toLowerCase()==='ac',status=flowStatus(flow,scene),sample=sampleIndex(flow,index),axis=flow.x[sample],rows=branchId?flow.branches.filter(branch=>branch.id===branchId):flow.branches;
  return <div className="mos-current-panel" aria-label="가지 전류">
    <small>결과 출처: {flow.source}{flow.tool?` · ${flow.tool}`:''}{flow.backend_profile_id?` · Backend ${flow.backend_profile_id}`:''}</small>
    {(flow.geometry_linkage==='unverified'||flow.geometry_linkage===undefined&&(!!flow.backend_profile_id||['spectre','hspice','primesim','commercial'].includes(flow.source)))&&<small className="mos-current-stale">GDS/OAS와 전류의 물리적 대응 미검증 · 사용자 경로도 명시적 표시 경로입니다.{flow.input_origin?` 입력: ${flow.input_origin}`:''}</small>}
    <div className="mos-current-controls"><strong>전류 · Conventional current</strong><span className={status.active?'':'mos-current-stale'}>{status.reason}</span>
      <label><input type="checkbox" aria-label="전류 화살표 표시" checked={visible} disabled={!status.active} onChange={event=>onVisible(event.target.checked)}/>화살표</label>
      <button disabled={flow.x.length<2} onClick={()=>onPlaying(!playing)}>{playing?'전류 재생 정지':'전류 재생'}</button>
      <input aria-label="전류 샘플" type="range" min="0" max={Math.max(0,flow.x.length-1)} step="1" value={sample} disabled={!flow.x.length} onChange={event=>{onPlaying(false);onIndex(Number(event.target.value));}}/>
      <output data-testid="current-axis">{flow.analysis==='op'?'OP':Number.isFinite(axis)?Number(axis.toPrecision(6)):'자료 없음'} {flow.analysis==='op'?'':flow.x_unit} · {sample+1}/{flow.x.length}</output>
      <label>화살표 배율<input aria-label="전류 화살표 배율" type="range" min="0.1" max="4" step="0.1" value={scale} onChange={event=>onScale(Number(event.target.value))}/><span>{scale.toFixed(1)}×</span></label>
      <select aria-label="전류 가지 선택" value={branchId??''} onChange={event=>onBranch(event.target.value||null)}><option value="">전체 가지 · {flow.branches.length}</option>{flow.branches.map(branch=><option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
    </div>
    <div className="mos-current-table-wrap"><table><thead><tr><th>가지 / 실제 source vector</th><th>전류</th><th>방향</th><th>레이아웃 경로</th></tr></thead><tbody>{rows.map(branch=>{
      const value=branchCurrent(branch,sample),direction=currentDirection(value),mapped=branch.mapping!=='unmapped'&&!!branch.path_dbu&&branch.path_dbu.length>=2&&(!branch.layer_id||!!scene?.layers.some(layer=>layer.id===branch.layer_id));
      return <tr key={branch.id} data-current-branch={branch.id} className={branchId===branch.id?'selected':''}><td><button onClick={()=>onBranch(branch.id)}>{branch.name}</button><small>{branch.source_vector}</small></td><td data-testid={`current-value-${branch.id}`} title={value===null?'자료 없음':`${value} A`}>{formatCurrent(value)}</td><td>{isAc?'복소수 위상 결과 · 방향 미지원':direction==='forward'?`${branch.from_net} → ${branch.to_net}`:direction==='reverse'?`${branch.to_net} → ${branch.from_net}`:direction==='zero'?'0 A · 방향 없음':'자료 없음'}</td><td>{!mapped?'공간 연결 경로 없음 · 수치만':branch.mapping==='user_path'?'사용자 제공 경로':'명시적 단자 연결'}{mapped&&<button disabled={!status.active} onClick={()=>onFocus(branch.id)}>전류 경로 맞춤</button>}</td></tr>;
    })}</tbody></table></div>
    {!!flow.notes?.length&&<small>{flow.notes.join(' · ')}</small>}
    <small>전류는 입력된 샘플 A 값입니다. 화살표 길이는 표시된 가지의 샘플 내 최대 |I|를 기준으로 정규화하고 경로 길이에 제한합니다. 공간 전류밀도(J)와 구분되는 가지 전류 표시입니다.</small>
  </div>;
}
