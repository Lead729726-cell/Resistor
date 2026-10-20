import {useEffect,useRef,useState} from 'react';
import {rpc,type DesignCatalog,type Project,type Scene} from '@mos/contracts';
import {defaultChipLimits} from './ChipEnvelope';

const architectures={
 sar:{title:'SAR',root:'sar_adc16',summary:'차동 4+4+4+4 분할 CDAC · 동일 1pF 단위 C 244개 · bridge 6개 · 실제 MOS 비교 16회',spec:'±1.2V · 36.621µV/LSB · 획득 8µs + 비중첩 0.5µs + 16µs 판단'},
 sigma_delta:{title:'ΣΔ',root:'sigma_delta16',summary:'2차 RC/MOS 루프 · 1-bit 피드백 · 25-bit CIC3 · ×256 decimation · 포화 출력',spec:'1.8V 범위 · 27.466µV/LSB · 변조 1MHz → 출력 3.90625kS/s · 첫 두 프레임 제외'},
 pipeline:{title:'Pipeline',root:'pipeline_adc16',summary:'차동 1.5-bit SC MDAC 14단 + 2-bit flash · 실제 thermometer 코드와 지연 정렬',spec:'±1.2V · 36.621µV/LSB · 기본 100kS/s · 전체 지연 15 half cycles · 무보정'}
} as const;
type Family=keyof typeof architectures;
interface Props{catalog:DesignCatalog;transport:typeof rpc;readOnly:boolean;shared:boolean;onProject:(p:Project,s:Scene)=>void|Promise<void>}

export default function Adc16Library({catalog,transport,readOnly,shared,onProject}:Props){
 const [family,setFamily]=useState<Family>('sar'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[created,setCreated]=useState<Record<string,string>>({});
 const alive=useRef(true),commands=useRef<Record<string,string>>({});
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const all=catalog.templates.filter(b=>typeof b.adc_family==='string'&&b.id.includes('16'));
 const blocks=all.filter(b=>b.adc_family===family||b.adc_family==='common');
 const spec=architectures[family];
 const work=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');try{await fn();}catch(e){if(alive.current)setError(e instanceof Error?e.message:String(e));}finally{if(alive.current)setBusy(false);}};
 const open=async(id:string)=>{const p=await transport<Project>('project.open',{project_id:id});const s=await transport<Scene>('view.get_scene',{project_id:id,max_shapes:2000});if(alive.current)await onProject(p,s);};
 const create=async(id:string,physical=false)=>{
  const block=all.find(b=>b.id===id);if(!block)throw Error('현재 엔진에 이 블록이 없습니다. 엔진 버전을 확인하세요.');
  const key=id+(physical?':physical':'');let projectId=created[key];
  if(!projectId){commands.current[key]??=crypto.randomUUID();const p=await transport<Project>('design.create_template',{template_id:id,name:`ADC16 v1 · ${block.name}${physical?' · 물리 코어':''}`,parameters:block.parameter_defaults,physical_core:physical,chip_limits:defaultChipLimits,command_id:commands.current[key]});projectId=p.id;if(alive.current)setCreated(v=>({...v,[key]:p.id}));}
  return projectId;
 };
 if(!all.length)return null;
 return <section className="it-adc-library" data-testid="adc16-library">
  <h4>16-bit ADC 작업대</h4>
  <div className="it-toolbar" role="group" aria-label="16bit ADC 구조">{(Object.keys(architectures)as Family[]).map(f=><button key={f} aria-pressed={family===f} disabled={busy} onClick={()=>setFamily(f)}>{architectures[f].title}</button>)}</div>
  <p>{spec.summary}</p><p className="mono">{spec.spec}</p>
  {family==='sigma_delta'&&<p className="it-muted">기준전압 부하를 견디는 100Ω 저항 분압기를 사용하며 약 16.2mW를 소비합니다. 저전력 기준회로와 외부 anti-alias 필터, gain/offset 보정은 추가 설계 항목입니다.</p>}
  <p className="it-warning">16-bit는 출력 코드 폭입니다. 실물 16-bit ENOB·잡음·편차·지터·제조 signoff는 별도 검증입니다. 회로 생성은 해석 실행이나 PASS 판정이 아닙니다.</p>
  <div className="it-toolbar"><button className="button primary" disabled={busy||readOnly||shared} onClick={()=>void work(async()=>open(await create(spec.root)))}>전체 {spec.title} ADC {created[spec.root]?'열기':'생성'}</button>
   <button disabled={busy||readOnly||shared} onClick={()=>void work(async()=>{for(const b of blocks){if(!alive.current)return;await create(b.id);}if(alive.current)await open(await create(spec.root));})}>{busy?'회로 처리 중…':`${blocks.length}개 계층 블록 준비`}</button>
   <button disabled={busy} onClick={()=>void work(async()=>{const projects=await transport<Project[]>('project.list',{metadata_only:true});const found:Record<string,string>={};for(const b of all)for(const physical of[false,true]){const p=projects.filter(p=>p.cell===b.id&&p.name===`ADC16 v1 · ${b.name}${physical?' · 물리 코어':''}`).at(-1);if(p)found[b.id+(physical?':physical':'')]=p.id;}if(alive.current)setCreated(v=>({...v,...found}));})}>기존 프로젝트 읽기</button></div>
  <details><summary>하위 블록 · {blocks.length}개 / 공통 블록 포함</summary><div className="it-table-wrap"><table><thead><tr><th>편집 가능한 블록</th><th>실제 포트</th><th>작업</th></tr></thead><tbody>{blocks.map(b=><tr key={b.id}><td>{b.name}</td><td><code>{b.ports.join(', ')}</code></td><td><button disabled={busy||((readOnly||shared)&&!created[b.id])} onClick={()=>void work(async()=>open(await create(b.id)))}>{created[b.id]?'열기':'회로 생성'}</button>{b.physical_supported===true&&<button disabled={busy||((readOnly||shared)&&!created[b.id+':physical'])} onClick={()=>void work(async()=>open(await create(b.id,true)))}>물리 {created[b.id+':physical']?'열기':'생성'}</button>}</td></tr>)}</tbody></table></div></details>
  <p className="it-muted">생성 후 ‘테스트벤치 → 시뮬레이션’에서 실행하고 파형·칩 레퍼런스 결과를 확인하세요. 지원 물리 블록은 1,000×1,000µm 한도에서 생성합니다. DRC/LVS/PEX는 검증 패널에서 각각 실행해야 합니다.</p>
  {error&&<p className="it-error" role="alert">{error} · 완료된 블록은 유지됩니다. 다시 누르면 동일 명령으로 이어집니다.</p>}
 </section>;
}
