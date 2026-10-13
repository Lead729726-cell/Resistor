import {useEffect,useRef,useState} from 'react';
import {rpc,type DesignCatalog,type Project,type Scene} from '@mos/contracts';
import {defaultChipLimits} from './ChipEnvelope';
interface Props{catalog:DesignCatalog;transport:typeof rpc;readOnly:boolean;shared:boolean;onProject:(p:Project,s:Scene)=>void|Promise<void>}
const name=(label:string)=>`SAR8 v0.22 · ${label.replace(/^SAR · /,'')}`;
export default function SarAdcLibrary({catalog,transport,readOnly,shared,onProject}:Props){
 const blocks=catalog.templates.filter(t=>t.id.startsWith('sar8_')||t.id==='sar_adc8');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[created,setCreated]=useState<Record<string,string>>({});
 const commands=useRef<Record<string,string>>({}),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const open=async(id:string)=>{const p=await transport<Project>('project.open',{project_id:id});const s=await transport<Scene>('view.get_scene',{project_id:id,max_shapes:2000});if(alive.current)await onProject(p,s);};
 const work=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');try{await fn();}catch(c){if(alive.current)setError(c instanceof Error?c.message:String(c));}finally{if(alive.current)setBusy(false);}};
 const read=()=>work(async()=>{const projects=await transport<Project[]>('project.list',{metadata_only:true});const found:Record<string,string>={};for(const b of blocks){const p=projects.filter(p=>p.cell===b.id&&p.name===name(b.name)).at(-1);if(p)found[b.id]=p.id;}if(alive.current)setCreated(found);});
 const build=()=>work(async()=>{let root='';for(const b of blocks){if(!alive.current)return;
   let id=created[b.id];if(!id){commands.current[b.id]??=crypto.randomUUID();const p=await transport<Project>('design.create_template',{template_id:b.id,name:name(b.name),parameters:b.parameter_defaults,physical_core:false,chip_limits:defaultChipLimits,command_id:commands.current[b.id]});id=p.id;if(alive.current)setCreated(v=>({...v,[b.id]:id}));}if(b.id==='sar_adc8')root=id;
 }if(root&&alive.current)await open(root);});
 if(!blocks.length)return null;
 return <section className="it-adc-library" data-testid="sar-adc-library"><h4>8비트 SAR ADC · 샘플링부터 CODE/VALID까지</h4><p>256개 동일 단위 C · 128:64:32:16:8:4:2:1 + dummy. 실제 MOS 비교기의 MSB→LSB 판단을 RTL·합성 gate·CMOS 연결 회로와 대조합니다.</p><p className="it-muted">기본 VREF 1.2V · 1 LSB = 4.6875mV · 획득 2µs + 비트당 2µs. 8비트 출력과 ENOB는 별도입니다. analog core만 실제 물리 배치/PEX를 지원하며 전체 제어기 타이밍·칩 제작 검증은 별도입니다.</p>
 <button disabled={busy} onClick={()=>void read()}>기존 SAR 프로젝트 읽기</button><div className="it-table-wrap"><table><thead><tr><th>하위 블록</th><th>포트</th><th>프로젝트</th></tr></thead><tbody>{blocks.map(b=><tr key={b.id}><td>{b.name.replace(/^SAR · /,'')}</td><td><code>{b.ports.join(', ')}</code></td><td>{created[b.id]?<button disabled={busy} onClick={()=>void work(()=>open(created[b.id]))}>SAR 블록 열기</button>:'미생성'}</td></tr>)}</tbody></table></div>
 {error&&<p className="it-error" role="alert">{error}</p>}<button className="button primary" disabled={busy||readOnly||shared||Object.keys(created).length===blocks.length} onClick={()=>void build()}>{busy?'실제 회로 생성 중…':`${blocks.length}개 SAR 블록 생성 · 전체 ADC 열기`}</button></section>;
}
