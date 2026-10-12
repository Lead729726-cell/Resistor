import {useEffect,useRef,useState} from 'react';
import {type DesignCatalog,type Project,type Scene,rpc} from '@mos/contracts';

interface Props {catalog:DesignCatalog;transport:typeof rpc;readOnly:boolean;shared:boolean;onProject:(project:Project,scene:Scene)=>void|Promise<void>}
export default function AdcBlockLibrary({catalog,transport,readOnly,shared,onProject}:Props){
  const blocks=catalog.templates.filter(t=>t.id==='sigma_delta8'||t.id.startsWith('sdm8_'));
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[created,setCreated]=useState<Record<string,string>>({});
  const commands=useRef<Record<string,string>>({}),alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  if(!blocks.length)return null;
  const open=async(id:string)=>{setBusy(true);setError('');try{const p=await transport<Project>('project.open',{project_id:id});const s=await transport<Scene>('view.get_scene',{project_id:id,max_shapes:2000});if(alive.current)await onProject(p,s);}catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:String(cause));}finally{if(alive.current)setBusy(false);}};
  const read=async()=>{setBusy(true);setError('');try{const projects=await transport<Project[]>('project.list',{metadata_only:true});const found:Record<string,string>={};for(const b of blocks){const p=projects.filter(p=>p.cell===b.id&&p.name===`ΣΔ8 · ${b.name.replace(/^ΣΔ · /,'')}`).at(-1);if(p)found[b.id]=p.id;}if(alive.current)setCreated(found);}catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:String(cause));}finally{if(alive.current)setBusy(false);}};
  const build=async()=>{
    setBusy(true);setError('');
    try{
      let root:Project|undefined;
      for(const block of blocks){
        if(!alive.current)return;
        commands.current[block.id]??=crypto.randomUUID();
        const next=await transport<Project>('design.create_template',{template_id:block.id,name:`ΣΔ8 · ${block.name.replace(/^ΣΔ · /,'')}`,parameters:block.parameter_defaults,physical_core:false,command_id:commands.current[block.id]});
        if(!alive.current)return;
        setCreated(current=>({...current,[block.id]:next.id}));
        if(block.id==='sigma_delta8')root=next;
      }
      if(root&&alive.current){const scene=await transport<Scene>('view.get_scene',{project_id:root.id,max_shapes:2000});if(alive.current)await onProject(root,scene);}
    }catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:String(cause));}
    finally{if(alive.current)setBusy(false);}
  };
  return <section className="it-adc-library" data-testid="adc-block-library">
    <h4>8비트 시그마델타 · 전체 블록 라이브러리</h4>
    <p>VIN → RC → 적분기 → 비교기 → 샘플 래치 → CIC2 → CODE[7:0] + VALID. 1비트 DAC가 적분기로 되먹임합니다.</p>
    <p className="it-muted">SKY130 1.8V · 모듈레이터 1MHz · 필터 ×256 · 출력 3.90625kS/s · 1 LSB=7.03125mV. 출력 비트 수와 측정 ENOB를 별도로 표시합니다. 마스크·제조 검증은 미실행입니다.</p>
    <button className="button" disabled={busy} onClick={()=>void read()}>기존 ADC 블록 프로젝트 읽기</button>
    <div className="it-table-wrap"><table><thead><tr><th>재사용 블록</th><th>회로 ID</th><th>프로젝트</th></tr></thead><tbody>{blocks.map(block=><tr key={block.id}><td>{block.name.replace(/^ΣΔ · /,'')}</td><td><code>{block.id}</code></td><td>{created[block.id]?<button disabled={busy} onClick={()=>void open(created[block.id])}>블록 열기</button>:'이 목록에서 미생성 · 기존 블록 읽기로 확인'}</td></tr>)}</tbody></table></div>
    {error&&<p role="alert" className="it-error">{error} · 다시 누르면 같은 생성 요청을 이어서 처리합니다.</p>}
    <button className="button primary" disabled={busy||readOnly||shared||Object.keys(created).length===blocks.length} onClick={()=>void build()}>{busy?`${Object.keys(created).length}/${blocks.length} 생성 중…`:`${blocks.length}개 실제 회로 프로젝트 생성 · 전체 ADC 열기`}</button>
    <p className="it-muted">각 블록은 Project 열기에서 선택합니다. 전체 ADC의 Schematic 계층 탐색에서도 내부 MOS·게이트를 열 수 있습니다.</p>
  </section>;
}
