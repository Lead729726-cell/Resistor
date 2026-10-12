import {useEffect,useRef,useState} from 'react';
import {type DesignCatalog,type Project,type Scene,rpc} from '@mos/contracts';

interface Props {catalog:DesignCatalog;transport:typeof rpc;readOnly:boolean;shared:boolean;onProject:(p:Project,s:Scene)=>void|Promise<void>}
export default function AnalogSocLibrary({catalog,transport,readOnly,shared,onProject}:Props){
  const blocks=catalog.templates.filter(t=>t.id.startsWith('soc_'));
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[created,setCreated]=useState<Record<string,string>>({});
  const commands=useRef<Record<string,string>>({}),alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  if(!blocks.length)return null;
  const open=async(id:string)=>{setBusy(true);setError('');try{const p=await transport<Project>('project.open',{project_id:id});const s=await transport<Scene>('view.get_scene',{project_id:id,max_shapes:2000});if(alive.current)await onProject(p,s);}catch(c){if(alive.current)setError(c instanceof Error?c.message:String(c));}finally{if(alive.current)setBusy(false);}};
  const read=async()=>{setBusy(true);setError('');try{const projects=await transport<Project[]>('project.list',{metadata_only:true});const found:Record<string,string>={};for(const b of blocks){const p=projects.filter(p=>p.cell===b.id&&p.name===`아날로그 SoC · ${b.name.replace(/^SoC · /,'')}`).at(-1);if(p)found[b.id]=p.id;}if(alive.current)setCreated(found);}catch(c){if(alive.current)setError(c instanceof Error?c.message:String(c));}finally{if(alive.current)setBusy(false);}};
  const build=async()=>{setBusy(true);setError('');try{let root:Project|undefined;
    for(const b of blocks){if(!alive.current)return;if(created[b.id]){if(b.id==='soc_sensor_afe')root=await transport<Project>('project.open',{project_id:created[b.id]});continue;}
      commands.current[b.id]??=crypto.randomUUID();const p=await transport<Project>('design.create_template',{template_id:b.id,name:`아날로그 SoC · ${b.name.replace(/^SoC · /,'')}`,parameters:b.parameter_defaults,physical_core:false,command_id:commands.current[b.id]});
      if(!alive.current)return;setCreated(current=>({...current,[b.id]:p.id}));if(b.id==='soc_sensor_afe')root=p;
    }if(root&&alive.current){const s=await transport<Scene>('view.get_scene',{project_id:root.id,max_shapes:2000});if(alive.current)await onProject(root,s);}
  }catch(c){if(alive.current)setError(c instanceof Error?c.message:String(c));}finally{if(alive.current)setBusy(false);}};
  return <section className="it-adc-library" data-testid="analog-soc-library"><h4>아날로그 SoC · 센서 입력부와 재사용 매크로</h4>
    <p>VIN → ×2/×8 PGA → 2극 필터 → 비교기 → 1MHz 샘플 출력 DATA. 공통모드 버퍼·바이어스와 reset MUX를 포함합니다.</p>
    <p className="it-muted">편집 가능한 계층 회로를 만듭니다. 아래 회로 선택에서 실제 physical core를 요청하면 별도 flat 물리 프로젝트를 생성합니다. DRC/LVS/PEX와 pre/post 해석은 각각 실행해야 합니다. ADC·CPU·패드가 포함된 완성 SoC는 아닙니다.</p>
    <button className="button" disabled={busy} onClick={()=>void read()}>기존 SoC 블록 프로젝트 읽기</button>
    <div className="it-table-wrap"><table><thead><tr><th>재사용 매크로</th><th>포트</th><th>프로젝트</th></tr></thead><tbody>{blocks.map(b=><tr key={b.id}><td>{b.name.replace(/^SoC · /,'')}</td><td><code>{b.ports.join(', ')}</code></td><td>{created[b.id]?<button disabled={busy} onClick={()=>void open(created[b.id])}>SoC 블록 열기</button>:'아직 읽지 않음'}</td></tr>)}</tbody></table></div>
    {error&&<p className="it-error" role="alert">{error}</p>}
    <button className="button primary" disabled={busy||readOnly||shared||Object.keys(created).length===blocks.length} onClick={()=>void build()}>{busy?`${Object.keys(created).length}/${blocks.length} 생성 중…`:`${blocks.length}개 SoC 회로 생성 · 센서 AFE 열기`}</button>
  </section>;
}
