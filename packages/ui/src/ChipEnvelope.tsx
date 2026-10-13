import {useEffect,useState} from 'react';
import {rpc,type Project,type Scene,type ChipLimits,type ChipEnvelope as Envelope} from '@mos/contracts';

export const defaultChipLimits:ChipLimits={width_um:1000,height_um:1000,max_area_um2:1000000,edge_um:10};
export function ChipLimitFields({value,onChange,disabled=false}:{value:ChipLimits;onChange:(v:ChipLimits)=>void;disabled?:boolean}){
 return <fieldset disabled={disabled} className="it-fields"><legend>칩 영역 제한 · 배선 포함</legend><div className="it-grid four">{([
 ['width_um','가로 (µm)'],['height_um','세로 (µm)'],['max_area_um2','최대 면적 (µm²)'],['edge_um','가장자리 여백 (µm)']
 ] as const).map(([key,label])=><label key={key}>{label}<input aria-label={label} type="number" min="0.005" step="any" value={value[key]} onChange={e=>onChange({...value,[key]:Number(e.target.value)})}/></label>)}</div><small>기본 1,000 × 1,000 µm = 1 mm². 실제 도형·계층·배선을 제한하며 패드와 패키지는 별도 설계입니다.</small></fieldset>;
}
export default function ChipEnvelope({project,transport=rpc,readOnly,shared,onProject}:{project:Project|null;transport?:typeof rpc;readOnly:boolean;shared:boolean;onProject:(p:Project,s:Scene)=>void|Promise<void>}){
 const [limits,setLimits]=useState(defaultChipLimits),[report,setReport]=useState<Envelope|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{setReport(null);setError('');setLimits((project as Project&{chip_limits?:ChipLimits})?.chip_limits??defaultChipLimits);},[project?.id,project?.revision]);
 const check=async(apply=false)=>{if(!project)return;setBusy(true);setError('');setReport(null);try{
   const result=await transport<Envelope>('design.floorplan_preview',{project_id:project.id,chip_limits:limits});setReport(result);
   if(apply&&result.fits){const p=await transport<Project>('design.floorplan_apply',{project_id:project.id,chip_limits:limits,expected_revision:project.revision,command_id:crypto.randomUUID()});const s=await transport<Scene>('view.get_scene',{project_id:p.id,max_shapes:2000});await onProject(p,s);}
 }catch(c){setError(c instanceof Error?c.message:String(c));}finally{setBusy(false);}};
 return <details data-testid="chip-envelope"><summary>칩 크기 · 현재 배치 경계 검사</summary><ChipLimitFields value={limits} onChange={v=>{setLimits(v);setReport(null);}} disabled={busy}/><button disabled={busy||!project} onClick={()=>void check()}>실제 배치 경계 확인</button> <button disabled={busy||!project||readOnly} onClick={()=>void check(true)}>현재 설계에 영역 제한 적용</button>
 {report&&<p role="status">{report.fits?'영역 안에 있음':'영역 초과 · 적용 불가'} · 실제 {report.used_width_um.toFixed(3)} × {report.used_height_um.toFixed(3)} µm · {report.used_area_um2.toFixed(1)} µm². 여백 포함 최소 {report.minimum_envelope_um.map(v=>v.toFixed(3)).join(' × ')} µm.</p>}
 {error&&<p className="it-error" role="alert">{error}</p>}<p className="it-muted">적용 후 사각형·배선·계층 붙여넣기까지 영역을 벗어나는 변경은 저장되지 않습니다. 기존 설계는 자동 이동·축소하지 않습니다. 넓은 생성 회로는 위 template에서 영역 제한을 켜고 별도 프로젝트로 다시 배치하세요.</p></details>;
}
