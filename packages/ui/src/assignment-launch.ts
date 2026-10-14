import type {Project,Device} from '@mos/contracts';
import type {Assignment} from '../../education/src/assignment-catalog';
import {getCircuitFixture} from '../../education/src/circuit-fixtures';
import {pinOffsets} from './schematic-drawing';
type Transport=<T>(method:string,params:Record<string,unknown>)=>Promise<T>;
// A thin caller of shared native commands. Generation alone creates no run/PASS.
export async function launchAssignment(a:Assignment,call:Transport,command_id:string,checkpoint:(p:Project)=>void=()=>{}):Promise<Project> {
 if(!/^[a-zA-Z0-9-]{8,120}$/.test(command_id))throw Error('새 프로젝트 receipt ID가 필요합니다.');
 const name='[Edu 과제] '+a.title,l=a.launch;
 let p:Project;
 if(l.kind==='example')p=await call('project.create',{name,example:l.id,command_id});
 else if(l.kind==='template') {
  const catalog=await call<{templates:{id:string;parameter_defaults:Record<string,number>}[]}>('design.catalog',{});
  if(!catalog.templates.some(t=>t.id===l.id))throw Error('현재 엔진에서 이 template을 지원하지 않습니다.');
  p=await call('design.create_template',{name,template_id:l.id,parameters:l.parameters??{},physical_core:false,command_id});
  checkpoint(p);
  if(l.testbench)p=await call('schematic.apply_command',{project_id:p.id,expected_revision:p.revision,command_id:command_id+'-bench',command:{type:'update_testbench',settings:l.testbench}});
 } else if(l.kind==='digital')p=await call('digital.create',{name,kind:l.id,physical:false,period_ns:50,corner:'tt',temperature_C:27,supply_V:1.8,command_id});
 else if(l.kind==='circuit') {
  const f=getCircuitFixture(l.id);if(!f?.devices.length)throw Error('이 과제는 standalone fixture로 진행하세요.');
  p=await call('project.create',{name,example:'schematic',command_id});checkpoint(p);
  const command=async(c:Record<string,unknown>,suffix:string)=>{p=await call('schematic.apply_command',{project_id:p.id,expected_revision:p.revision,command_id:command_id+'-'+suffix,command:c});checkpoint(p);};
  await command({type:'set_connectivity_mode',mode:'explicit'},'mode');
  for(const d of f.devices)await command({type:'add_device',device:structuredClone(d)},'device-'+d.id);
  // Reuse the editor's oriented symbol geometry; net labels remain authoritative.
  const nets=new Map<string,{d:Device;pin:string;point:[number,number]}[]>();
  for(const d of f.devices)for(const [pin,net] of Object.entries(d.pins)){
   const offset=pinOffsets(d)[pin],items=nets.get(net)??[];items.push({d,pin,point:[d.x+offset[0],d.y+offset[1]]});nets.set(net,items);
  }
  let n=0;
  for(const [net,items] of nets)for(const target of items.slice(1)){
   const start=items[0].point,end=target.point;
   const points=[start,[start[0],end[1]] as [number,number],end].filter((p,i,all)=>i===0||p[0]!==all[i-1][0]||p[1]!==all[i-1][1]);
   if(points.length>1)await command({type:'add_wire',wire:{id:'edu-wire-'+n++,net,points}},'wire-'+n);
  }
  await command({type:'update_testbench',settings:{analysis:'op'}},'op');
 }else throw Error('계산·레퍼런스 과제는 엔진 프로젝트를 자동 생성하지 않습니다.');
 checkpoint(p);return p;
}
