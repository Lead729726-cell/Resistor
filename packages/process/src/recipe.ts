import { PROCESS_LIMITS, cross, dot, sub, validateVolume, type ProcessMaterial, type ProcessVolume, type Vec3 } from './model';
import { inspectVolume } from './inspect';
import type { Scene } from '../../contracts/src/index';

export interface ProcessGrid { origin_um:Vec3; spacing_um:number; shape:[number,number,number] }
export interface ProcessMask { mode:'inside'|'outside'; polygons_um:[number,number][][];polygon_holes_um?:[number,number][][][];source?:{project_id:string;revision:number;layer_id:string;scope:'loaded-scene';shape_ids:string[];dbu_um:number} }
export type ProcessStep =
  | {id:string;name:string;kind:'deposit';method:'conformal'|'directional';material_id:number;rate_um_s:number;time_s:number;angular_spread_deg:number;reemit_fraction:number;mask?:ProcessMask}
  | {id:string;name:string;kind:'etch';method:'isotropic'|'directional';rates_um_s:Record<string,number>;time_s:number;angular_spread_deg:number;mask?:ProcessMask}
  | {id:string;name:string;kind:'cmp';method:'plane'|'preston';target_z_um:number;time_s:number;pressure_Pa:number;velocity_m_s:number;preston_m2_N:Record<string,number>;pad_radius_um:number;compliance_um:number;dishing_factor:number;erosion_factor:number};
export interface ProcessRecipe {
  schema_version:1;kind:'register-process-recipe';name:string;grid:ProcessGrid;
  materials:ProcessMaterial[];
  initial:{material_id:number;box_um:[Vec3,Vec3];region?:string}[];
  initial_volume?:ProcessVolume;
  steps:ProcessStep[];
  calibration:{kind:'uncalibrated'|'user-reference';label:string;reference?:string};
}
export interface ProcessStage {
  step_id:string;name:string;time_s:number;material_ids:number[];
  material_volume_um3:Record<string,number>;changed_voxels:number;
  closed_voids:number;closed_void_volume_um3:number;surface_range_um:[number,number];
  removed_volume_um3:number;added_volume_um3:number;iterations:number;
  deposition_coverage?:{assessed_faces:number;no_resolved_coating_faces:number;min_axis_thickness_um:number|null;grid_resolution_um:number;requested_dose_um:number};
}
export interface DepositionFace {surface_voxel:number;axis:0|1|2;sign:-1|1;plane_um:number;thickness_um:number;location_um:Vec3}
export interface ProcessRun {
  schema_version:1;kind:'register-process-run';engine:'register-voxel-kinetics-1';
  recipe:ProcessRecipe;recipe_sha256:string;stages:ProcessStage[];
  kinematic_prediction:true;calibrated_physical_prediction:false;foundry_signoff:false;
  warnings:string[];checked_at:string;
  convergence?:{coarse_spacing_um:number;fine_spacing_um:number;different_volume_um3:number;different_fraction:number;material_volume_error_um3:Record<string,number>;closed_void_counts:[number,number]};
}
export const RECIPE_LIMITS={voxels:5000,steps:16,iterations:2000,rays:1800000,bytes:32*1024*1024};
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const range=(v:unknown,lo:number,hi:number)=>finite(v)&&v>=lo&&v<=hi;
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const label=(v:unknown)=>typeof v==='string'&&!!v.trim()&&v.length<=256;
const vec=(v:unknown):v is Vec3=>Array.isArray(v)&&v.length===3&&v.every(x=>range(x,-1e6,1e6));
export function validateRecipe(input:unknown):ProcessRecipe {
  if(!record(input)||input.schema_version!==1||input.kind!=='register-process-recipe'||!label(input.name))throw new Error('공정 recipe schema_version=1 / 이름이 필요합니다.');
  const g=input.grid;
  if(!record(g)||!vec(g.origin_um)||!range(g.spacing_um,1e-6,1e4)||!Array.isArray(g.shape)||g.shape.length!==3||!g.shape.every(n=>Number.isInteger(n)&&n>=2&&n<=128)||g.shape.reduce((a,b)=>a*b,1)>RECIPE_LIMITS.voxels)throw new Error('양의 격자 간격 및 축별 2~128, 전체 5,000 이하 voxel이 필요합니다.');
  const grid=g as unknown as ProcessGrid;
  if(!Array.isArray(input.materials)||input.materials.length<2||input.materials.length>32)throw new Error('공정 재료 2~32개가 필요합니다.');
  // Reuse the volume material validator, including finite nominal thickness and unique IDs.
  validateVolume({schema_version:1,kind:'register-process-volume',name:'recipe validation',stage:'validation',unit:'um',provenance:{kind:'user',label:'validation'},scope:{kind:'roi',domain_um:[[0,0,0],[1,1,1]]},materials:input.materials,points_um:[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],cells:[{id:'validator',material_id:(input.materials[0] as ProcessMaterial).id,vertices:[0,1,2,3],thickness_um:null}]});
  const materials=input.materials as ProcessMaterial[];
  if(materials.some(m=>m.id<0||m.id>65535)||materials.filter(m=>m.role==='void').length!==1)throw new Error('재료 ID는 0~65535, void 재료는 정확히 하나 필요합니다.');
  const ids=new Set(materials.map(m=>m.id));
  if(input.initial_volume!==undefined){const volume=validateVolume(input.initial_volume);if(volume.materials.some(m=>!ids.has(m.id)||materials.find(v=>v.id===m.id)?.role!==m.role))throw new Error('반입 초기 체적의 재료 ID/역할과 recipe가 일치해야 합니다.');if(gridCount(grid)*volume.cells.length>15000000)throw new Error('초기 체적 resampling 예산(15,000,000 voxel/tetra 후보)을 넘습니다. ROI 또는 격자를 조정하세요.');if([0,1,2].some(a=>grid.origin_um[a]<volume.scope.domain_um[0][a]-1e-9||grid.origin_um[a]+grid.shape[a]*grid.spacing_um>volume.scope.domain_um[1][a]+1e-9))throw new Error('Resampling grid가 초기 체적 domain 안에 있어야 합니다.');}
  if(!Array.isArray(input.initial)||!input.initial.length&&input.initial_volume===undefined||input.initial.length>128)throw new Error('초기 3D box 또는 초기 체적이 필요합니다. 나중 box가 앞 box를 덮습니다.');
  for(const b of input.initial){if(!record(b)||!ids.has(Number(b.material_id))||!Number.isInteger(b.material_id)||!Array.isArray(b.box_um)||b.box_um.length!==2||!b.box_um.every(vec)||[0,1,2].some(a=>(b.box_um as [Vec3,Vec3])[0][a]>=(b.box_um as [Vec3,Vec3])[1][a])||b.region!==undefined&&!label(b.region))throw new Error('초기 box의 XYZ·재료·관심 영역이 잘못됐습니다.');
    if(b.box_um.some((p:Vec3,i:number)=>p.some((v,a)=>v<grid.origin_um[a]-1e-9||v>grid.origin_um[a]+grid.shape[a]*grid.spacing_um+1e-9)))throw new Error('초기 box는 선언한 grid domain 안에 있어야 합니다.');}
  if(!Array.isArray(input.steps)||!input.steps.length||input.steps.length>RECIPE_LIMITS.steps)throw new Error('공정 단계 1~16개가 필요합니다.');
  const names=new Set<string>(['initial']);
  for(const s of input.steps){
    if(!record(s)||!label(s.id)||!label(s.name)||names.has(String(s.id))||!['deposit','etch','cmp'].includes(String(s.kind)))throw new Error('공정 단계 ID·이름·종류가 잘못됐습니다.');names.add(String(s.id));
    if(!range(s.time_s,0,1e6))throw new Error('공정 시간은 유한한 0~1,000,000 s이어야 합니다.');
    if(s.kind==='deposit'){
      if(!['conformal','directional'].includes(String(s.method))||!Number.isInteger(s.material_id)||!ids.has(Number(s.material_id))||materials.find(m=>m.id===s.material_id)?.role!=='film'||!range(s.rate_um_s,0,1e6)||!range(s.angular_spread_deg,0,75)||!range(s.reemit_fraction,0,1))throw new Error('증착 재료는 film, 속도는 µm/s, 입사각은 0~75°, 재방출은 0~1이어야 합니다.');
      if(s.method==='conformal'&&(s.angular_spread_deg!==0||s.reemit_fraction!==0))throw new Error('Conformal 모델은 입사각/재방출을 사용하지 않습니다. 0을 명시하세요.');
    }else if(s.kind==='etch'){
      if(!['isotropic','directional'].includes(String(s.method))||!range(s.angular_spread_deg,0,75))throw new Error('식각 method 또는 입사각이 잘못됐습니다.');
      rates(s.rates_um_s,ids,'식각 속도',1e6);
      if(s.method==='isotropic'&&s.angular_spread_deg!==0)throw new Error('Isotropic 식각의 입사각은 0이어야 합니다.');
    }else{
      if(!['plane','preston'].includes(String(s.method))||!range(s.target_z_um,grid.origin_um[2],grid.origin_um[2]+grid.shape[2]*grid.spacing_um)||!range(s.pressure_Pa,0,1e9)||!range(s.velocity_m_s,0,1e3)||!range(s.pad_radius_um,0,1e4)||!range(s.compliance_um,0,1e4)||!range(s.dishing_factor,0,10)||!range(s.erosion_factor,0,10))throw new Error('CMP 평면·압력·속도·pad·dishing/erosion 계수가 잘못됐습니다.');rates(s.preston_m2_N,ids,'Preston 계수',1);
    }
    if(s.mask!==undefined)validateMask(s.mask);
  }
  if(!record(input.calibration)||!['uncalibrated','user-reference'].includes(String(input.calibration.kind))||!label(input.calibration.label)||input.calibration.reference!==undefined&&!label(input.calibration.reference))throw new Error('속도·계수의 보정 출처를 명시하세요. 사용자 reference는 검증된 공정 calibration을 뜻하지 않습니다.');
  return structuredClone(input) as unknown as ProcessRecipe;
}
function rates(value:unknown,ids:Set<number>,name:string,max:number){
  if(!record(value)||!Object.keys(value).length||Object.entries(value).some(([id,n])=>!/^\d+$/.test(id)||!ids.has(Number(id))||!range(n,0,max)))throw new Error(`${name}은 존재하는 재료 ID별 유한한 비음수 값이어야 합니다.`);
}
export function validateMask(value:unknown):ProcessMask {
  if(!record(value)||!['inside','outside'].includes(String(value.mode))||!Array.isArray(value.polygons_um)||!value.polygons_um.length||value.polygons_um.length>64||value.polygons_um.some(p=>!Array.isArray(p)||p.length<3||p.length>512||p.some(v=>!Array.isArray(v)||v.length!==2||!v.every(x=>range(x,-1e6,1e6)))))throw new Error('Mask는 inside/outside 및 유한한 XY polygon(3~512점, 최대64개)입니다.');
  if(value.polygon_holes_um!==undefined&&(!Array.isArray(value.polygon_holes_um)||value.polygon_holes_um.length!==value.polygons_um.length||value.polygon_holes_um.some(h=>!Array.isArray(h)||h.length>32||h.some(p=>!Array.isArray(p)||p.length<3||p.length>512||p.some(v=>!Array.isArray(v)||v.length!==2||!v.every(x=>range(x,-1e6,1e6)))))))throw new Error('Mask hole은 polygon별 유한한 XY ring이어야 합니다.');
  const mask=value as unknown as ProcessMask;if(mask.polygons_um.reduce((n,p,i)=>n+p.length+(mask.polygon_holes_um?.[i]||[]).reduce((n,h)=>n+h.length,0),0)>4096)throw new Error('Mask 전체 vertex 예산은 4,096개입니다. 일부 polygon을 조용히 생략하지 않습니다.');
  const source=value.source;if(source!==undefined&&(!record(source)||!label(source.project_id)||!label(source.layer_id)||!Number.isSafeInteger(source.revision)||Number(source.revision)<0||source.scope!=='loaded-scene'||!range(source.dbu_um,1e-12,1e4)||!Array.isArray(source.shape_ids)||source.shape_ids.length>64||!source.shape_ids.every(label)))throw new Error('Mask 원본 scene·revision·단위 metadata가 잘못됐습니다.');
  return value as unknown as ProcessMask;
}
const inPolygon=(polygon:[number,number][],x:number,y:number)=>{let hit=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[i],b=polygon[j];const cross=(x-a[0])*(b[1]-a[1])-(y-a[1])*(b[0]-a[0]);
  if(Math.abs(cross)<1e-12&&x>=Math.min(a[0],b[0])-1e-12&&x<=Math.max(a[0],b[0])+1e-12&&y>=Math.min(a[1],b[1])-1e-12&&y<=Math.max(a[1],b[1])+1e-12)return true;
  if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit;
}return hit;};
export function maskContains(mask:ProcessMask|undefined,x:number,y:number){
  if(!mask)return true;let inside=false;
  mask.polygons_um.forEach((polygon,i)=>{inside ||= inPolygon(polygon,x,y)&&!(mask.polygon_holes_um?.[i]||[]).some(h=>inPolygon(h,x,y));});
  return mask.mode==='inside'?inside:!inside;
}
export function sceneMask(scene:Scene,layer_id:string,mode:'inside'|'outside'='inside'):ProcessMask {
  const shapes=scene.shapes.filter(s=>s.layer_id===layer_id);if(!shapes.length||shapes.length>64)throw new Error('선택한 로드 scene layer의 mask polygon은 1~64개여야 합니다. ROI를 명시적으로 줄이세요.');
  const point=(p:[string,string]):[number,number]=>p.map(v=>{const n=Number(BigInt(v));if(!Number.isSafeInteger(n))throw new Error('Mask 정수 좌표가 안전한 변환 범위를 넘습니다. ROI 원점을 옮겨 export하세요.');return n*scene.dbu_um;}) as [number,number];
  return validateMask({mode,polygons_um:shapes.map(s=>s.polygon.map(point)),polygon_holes_um:shapes.map(s=>(s.holes||[]).map(h=>h.map(point))),source:{project_id:scene.project_id,revision:scene.revision,layer_id,scope:'loaded-scene',shape_ids:shapes.map(s=>s.id),dbu_um:scene.dbu_um}});
}
export const gridCount=(g:ProcessGrid)=>g.shape.reduce((a,b)=>a*b,1);
export const index3=(g:ProcessGrid,x:number,y:number,z:number)=>(z*g.shape[1]+y)*g.shape[0]+x;
export function cellXYZ(g:ProcessGrid,index:number):[number,number,number]{const [nx,ny]=g.shape;return [index%nx,Math.floor(index/nx)%ny,Math.floor(index/(nx*ny))];}
export const gridCentre=(g:ProcessGrid,index:number):Vec3=>cellXYZ(g,index).map((n,a)=>g.origin_um[a]+(n+.5)*g.spacing_um) as Vec3;
function resample(volume:ProcessVolume,g:ProcessGrid,empty:number){
  const inspection=inspectVolume(volume,{min_thickness_um:0,min_coverage_ratio:0}),ids=Array(gridCount(g)).fill(empty) as number[],assigned=new Uint8Array(ids.length),hits=new Uint8Array(volume.cells.length);
  const tets=volume.cells.map(c=>{const p=c.vertices.map(i=>volume.points_um[i]),a=sub(p[1],p[0]),b=sub(p[2],p[0]),d=sub(p[3],p[0]);return {id:c.material_id,origin:p[0],co:[cross(b,d),cross(d,a),cross(a,b)],det:dot(a,cross(b,d)),lo:[0,1,2].map(i=>Math.min(...p.map(v=>v[i]))),hi:[0,1,2].map(i=>Math.max(...p.map(v=>v[i])))};});
  for(let i=0;i<ids.length;i++){const p=gridCentre(g,i);for(let j=0;j<tets.length;j++){const t=tets[j];if(p.some((v,a)=>v<t.lo[a]-1e-10||v>t.hi[a]+1e-10))continue;const q=sub(p,t.origin),b=t.co.map(v=>dot(q,v)/t.det);if(b.every(v=>v>=-1e-9)&&b.reduce((a,b)=>a+b,0)<=1+1e-9){ids[i]=t.id;assigned[i]=1;hits[j]=1;break;}}}
  if(assigned.some(v=>!v))throw new Error('초기 체적에서 미제출 voxel 중심이 있습니다. 빈 부분을 gas로 추정하지 않습니다.');
  for(const hole of inspection.voids.filter(v=>v.closed)){
    const inside=hole.cells.every(i=>volume.cells[i].vertices.every(node=>volume.points_um[node].every((v,a)=>v>=g.origin_um[a]-1e-9&&v<=g.origin_um[a]+g.shape[a]*g.spacing_um+1e-9)));
    if(inside&&!hole.cells.some(i=>hits[i]))throw new Error('초기 폐쇄 공극이 grid 해상도에서 완전히 사라집니다. 격자를 미세화하거나 공극 ROI를 설정하세요.');
  }return ids;
}
const neighbors=(g:ProcessGrid,index:number,diagonal=false)=>{
  const [x,y,z]=cellXYZ(g,index),result:{index:number;length:number}[]=[];
  for(let dz=-1;dz<=1;dz++)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    const length=Math.hypot(dx,dy,dz);if(!length||!diagonal&&length!==1||x+dx<0||y+dy<0||z+dz<0||x+dx>=g.shape[0]||y+dy>=g.shape[1]||z+dz>=g.shape[2])continue;result.push({index:index3(g,x+dx,y+dy,z+dz),length});
  }return result;
};
function highest(g:ProcessGrid,ids:ArrayLike<number>,empty:number){const tops=new Int32Array(g.shape[0]*g.shape[1]).fill(-1);for(let z=0;z<g.shape[2];z++)for(let y=0;y<g.shape[1];y++)for(let x=0;x<g.shape[0];x++)if(ids[index3(g,x,y,z)]!==empty)tops[y*g.shape[0]+x]=z;return tops;}
/** Top gas reservoir; lateral and bottom boundaries are sealed. A mask is an ideal plane at step-start highest surface. */
function gas(g:ProcessGrid,ids:ArrayLike<number>,empty:number,mask?:ProcessMask,maskPlane=Infinity,allBoundaries=false){
  const open=new Uint8Array(ids.length),queue:number[]=[];
  for(let y=0;y<g.shape[1];y++)for(let x=0;x<g.shape[0];x++){const i=index3(g,x,y,g.shape[2]-1);if(ids[i]===empty){open[i]=1;queue.push(i);}}
  if(allBoundaries)for(let i=0;i<ids.length;i++){const p=cellXYZ(g,i);if(ids[i]===empty&&!open[i]&&p.some((n,a)=>n===0||n===g.shape[a]-1)){open[i]=1;queue.push(i);}}
  for(let head=0;head<queue.length;head++){const i=queue[head],xyz=cellXYZ(g,i);for(const n of neighbors(g,i)){
    if(open[n.index]||ids[n.index]!==empty)continue;
    if(mask){const next=cellXYZ(g,n.index);if(xyz[2]!==next[2]&&Math.max(xyz[2],next[2])===maskPlane){const p=gridCentre(g,n.index);if(!maskContains(mask,p[0],p[1]))continue;}}
    open[n.index]=1;queue.push(n.index);
  }}return open;
}
/** Exact grid traversal of deterministic incident rays. The first solid occludes all deeper voxels. */
function rayFlux(g:ProcessGrid,ids:ArrayLike<number>,empty:number,spread:number,mask?:ProcessMask,maskPlane=Infinity){
  const surface=new Float64Array(ids.length),voidSurface=new Float64Array(ids.length),directions:[number,number][]=[[0,0]];
  if(spread>0){const t=Math.tan(spread*Math.PI/180);for(let a=0;a<8;a++)directions.push([t*Math.cos(a*Math.PI/4),t*Math.sin(a*Math.PI/4)]);}
  const weight=1/directions.length,[nx,ny,nz]=g.shape;
  for(const [sx,sy] of directions)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
    let px=x+.5,py=y+.5,pz=nz-1e-9,previous=-1;
    for(let iterations=0;iterations<nx+ny+nz+5;iterations++){
      const ix=Math.floor(px),iy=Math.floor(py),iz=Math.floor(pz);if(ix<0||iy<0||iz<0||ix>=nx||iy>=ny||iz>=nz)break;
      if(mask&&iz<maskPlane&&previous!==-1&&cellXYZ(g,previous)[2]>=maskPlane){const p=gridCentre(g,index3(g,ix,iy,iz));if(!maskContains(mask,p[0],p[1]))break;}
      const current=index3(g,ix,iy,iz);if(ids[current]!==empty){surface[current]+=weight;if(previous>=0)voidSurface[previous]+=weight;break;}
      previous=current;
      const tx=sx>1e-12?(ix+1-px)/sx:sx<-1e-12?(ix-px)/sx:Infinity;
      const ty=sy>1e-12?(iy+1-py)/sy:sy<-1e-12?(iy-py)/sy:Infinity;
      const tz=pz-iz;const dt=Math.min(tx,ty,tz)+1e-8;px+=sx*dt;py+=sy*dt;pz-=dt;
    }
  }return {surface,voidSurface};
}
function summarize(recipe:ProcessRecipe,ids:number[],step_id:string,name:string,time_s:number,before?:number[],iterations=0):ProcessStage {
  const g=recipe.grid,empty=recipe.materials.find(m=>m.role==='void')!.id,open=gas(g,ids,empty,undefined,Infinity,true),seen=new Uint8Array(ids.length),volumes:Record<string,number>={};
  let closed=0,closedVoxels=0,changed=0,added=0,removed=0;
  for(let i=0;i<ids.length;i++){
    volumes[ids[i]]=(volumes[ids[i]]||0)+g.spacing_um**3;
    if(before&&ids[i]!==before[i]){changed++;if(before[i]===empty)added++;if(ids[i]===empty)removed++;}
    if(ids[i]!==empty||open[i]||seen[i])continue;closed++;const queue=[i];seen[i]=1;
    for(let head=0;head<queue.length;head++){closedVoxels++;for(const n of neighbors(g,queue[head]))if(!seen[n.index]&&ids[n.index]===empty&&!open[n.index]){seen[n.index]=1;queue.push(n.index);}}
  }
  const tops=highest(g,ids,empty),heights=Array.from(tops,z=>g.origin_um[2]+(z+1)*g.spacing_um);
  const step=recipe.steps.find(s=>s.id===step_id),coating=before&&step?.kind==='deposit'?depositionCoverage(recipe,before,ids,step):undefined;
  return {step_id,name,time_s,material_ids:ids,material_volume_um3:volumes,changed_voxels:changed,closed_voids:closed,closed_void_volume_um3:closedVoxels*g.spacing_um**3,surface_range_um:[Math.min(...heights),Math.max(...heights)],added_volume_um3:added*g.spacing_um**3,removed_volume_um3:removed*g.spacing_um**3,iterations,deposition_coverage:coating?{assessed_faces:coating.faces.length,no_resolved_coating_faces:coating.faces.filter(f=>f.thickness_um===0).length,min_axis_thickness_um:coating.faces.length?Math.min(...coating.faces.map(f=>f.thickness_um)):null,grid_resolution_um:g.spacing_um,requested_dose_um:step!.kind==='deposit'?step!.rate_um_s*step!.time_s:0}:undefined};
}
/** Axis-normal coating on every initially gas-accessible voxel face, including faces with no completed film voxel. */
export function depositionCoverage(recipe:ProcessRecipe,before:ArrayLike<number>,after:ArrayLike<number>,step:Extract<ProcessStep,{kind:'deposit'}>){
  const g=recipe.grid,empty=recipe.materials.find(m=>m.role==='void')!.id,plane=Math.max(...highest(g,before,empty))+1,open=gas(g,before,empty,step.mask,plane),faces:DepositionFace[]=[];
  if(!step.time_s||!step.rate_um_s)return {faces,grid_resolution_um:g.spacing_um,requested_dose_um:0};
  for(let i=0;i<before.length;i++)if(before[i]!==empty){const p=cellXYZ(g,i);for(const axis of [0,1,2] as const)for(const sign of [-1,1] as const){
    const n=[...p];n[axis]+=sign;if(n[axis]<0||n[axis]>=g.shape[axis])continue;const neighbor=index3(g,n[0],n[1],n[2]);if(before[neighbor]!==empty||!open[neighbor])continue;
    let count=0;for(;n[axis]>=0&&n[axis]<g.shape[axis];n[axis]+=sign){const index=index3(g,n[0],n[1],n[2]);if(before[index]!==empty||after[index]!==step.material_id)break;count++;}
    const location=gridCentre(g,i),coordinate=g.origin_um[axis]+(p[axis]+(sign===1?1:0))*g.spacing_um;location[axis]=coordinate;
    faces.push({surface_voxel:i,axis,sign,plane_um:coordinate,location_um:location,thickness_um:count*g.spacing_um});
  }}return {faces,grid_resolution_um:g.spacing_um,requested_dose_um:step.rate_um_s*step.time_s};
}
export function depositionCoverageCsv(run:ProcessRun,index:number){
  const step=run.recipe.steps[index-1];if(!step||step.kind!=='deposit')throw new Error('증착 단계를 선택하세요.');const data=depositionCoverage(run.recipe,run.stages[index-1].material_ids,run.stages[index].material_ids,step);
  return ['surface_voxel,axis,normal_sign,x_um,y_um,z_um,axis_coating_um,resolution_um,no_resolved_voxel,requested_dose_um',...data.faces.map(f=>[f.surface_voxel,f.axis,f.sign,...f.location_um,f.thickness_um,data.grid_resolution_um,f.thickness_um===0,data.requested_dose_um].join(','))].join('\n');
}
export async function recipeHash(recipe:ProcessRecipe){const bytes=new TextEncoder().encode(JSON.stringify(recipe));const hash=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');}
export async function simulateRecipe(input:unknown,progress?:(step:number,total:number,name:string)=>void):Promise<ProcessRun> {
  const recipe=validateRecipe(input),g=recipe.grid,N=gridCount(g),h=g.spacing_um,empty=recipe.materials.find(m=>m.role==='void')!.id;
  let ids=recipe.initial_volume?resample(recipe.initial_volume,g,empty):Array(N).fill(empty) as number[];
  for(const b of recipe.initial)for(let i=0;i<N;i++){const p=gridCentre(g,i);if(p.every((v,a)=>v>=b.box_um[0][a]&&v<b.box_um[1][a]))ids[i]=b.material_id;}
  if(ids.every(v=>v===empty))throw new Error('초기 상태에 고체 재료가 없습니다.');
  if(ids.every(v=>v!==empty))throw new Error('상단 gas reservoir가 없습니다. domain 상단에 void 공간을 포함하세요.');
  const stages=[summarize(recipe,[...ids],'initial','초기 형상',0)],warnings=new Set<string>([
    '속도 입력 기반 3D voxel 형상 예측입니다. 장비 반응·플라즈마·확산 모델 및 foundry calibration/signoff가 아닙니다.',
    `격자 ${h} µm: 좌표는 cell 중심, 국부 두께는 최소 XYZ 재료 chord입니다. sub-voxel 결함·정확한 계면 법선 두께는 미해결입니다.`,
    '상단만 외부 gas 경계이며 측면·바닥은 sealed입니다. CMP pad/density 항과 단일 재방출 근사는 사용자 계수입니다.'
  ]);
  if(recipe.initial_volume)warnings.add('초기 tetra 체적을 voxel 중심에서 resampling했습니다. 원본 두께 field는 recipe 원본에 보존되며 계산 단계의 두께는 XYZ chord로 다시 산출합니다.');
  if(recipe.initial_volume?.cells.some(c=>c.thickness_um!==null&&c.thickness_um<h))warnings.add('초기 체적의 일부 입력 막 두께가 grid 간격보다 작습니다. 국부 박막화는 현재 격자에서 미해결이며 ROI/해상도를 조정해야 합니다.');
  let time=0,totalIterations=0;
  for(let s=0;s<recipe.steps.length;s++){
    const step=recipe.steps[s],before=[...ids],accumulator=new Float64Array(N),mask=step.kind==='cmp'?undefined:step.mask;
    const startTops=highest(g,ids,empty),maskPlane=Math.max(...startTops)+1;
    const maximumRate=step.kind==='deposit'?step.rate_um_s:step.kind==='etch'?Math.max(0,...Object.values(step.rates_um_s)):Math.max(0,...Object.values(step.preston_m2_N))*step.pressure_Pa*step.velocity_m_s*1e6*(1+step.dishing_factor+step.erosion_factor);
    const angular=step.kind==='cmp'?1:step.angular_spread_deg>0?9:1;
    const expected=step.kind==='cmp'&&step.method==='plane'?1:Math.max(1,Math.ceil(step.time_s*maximumRate/(h*.5)));
    const budgetError=()=>new Error(`단계 ${step.name}: 시간·속도·해상도가 실행 예산을 넘습니다. 전체 ${RECIPE_LIMITS.iterations} 반복 / 단계 ${RECIPE_LIMITS.rays} ray 상한입니다.`);
    if(!Number.isFinite(expected)||totalIterations+expected>RECIPE_LIMITS.iterations)throw budgetError();
    let elapsed=0,iterations=0;
    while(elapsed<step.time_s-1e-12||iterations===0){
      if(++totalIterations>RECIPE_LIMITS.iterations||++iterations*g.shape[0]*g.shape[1]*angular>RECIPE_LIMITS.rays)throw budgetError();
      if(iterations===1||iterations%50===0)progress?.(s,recipe.steps.length,`${step.name} · ${elapsed.toPrecision(3)}/${step.time_s} s`);
      let dt=Math.min(step.time_s-elapsed,maximumRate>0?h*.5/maximumRate:step.time_s||1);
      if(step.kind==='cmp'){
        if(step.method==='plane'){for(let i=0;i<N;i++)if(g.origin_um[2]+(cellXYZ(g,i)[2]+1)*h>step.target_z_um+1e-10&&g.origin_um[2]+cellXYZ(g,i)[2]*h>=step.target_z_um-1e-10)ids[i]=empty;elapsed=step.time_s;continue;}
        const tops=highest(g,ids,empty),r=Math.min(Math.max(g.shape[0],g.shape[1]),Math.ceil(step.pad_radius_um/h));
        const next=[...ids];
        for(let y=0;y<g.shape[1];y++)for(let x=0;x<g.shape[0];x++){
          const z=tops[y*g.shape[0]+x];if(z<0)continue;const i=index3(g,x,y,z),id=ids[i];if(g.origin_um[2]+z*h<step.target_z_um-1e-10)continue;
          let same=0,count=0,max=z;for(let yy=Math.max(0,y-r);yy<=Math.min(g.shape[1]-1,y+r);yy++)for(let xx=Math.max(0,x-r);xx<=Math.min(g.shape[0]-1,x+r);xx++){
            const zz=tops[yy*g.shape[0]+xx];max=Math.max(max,zz);count++;if(zz>=0&&ids[index3(g,xx,yy,zz)]===id)same++;
          }
          const density=same/count,contact=step.compliance_um>0?Math.max(0,1-(max-z)*h/step.compliance_um):z===max?1:0;
          const rate=(step.preston_m2_N[id]||0)*step.pressure_Pa*step.velocity_m_s*1e6*contact*(1+step.dishing_factor*(1-density)+step.erosion_factor*density);
          accumulator[i]+=rate*dt;if(accumulator[i]>=h-1e-10)next[i]=empty;
        }ids=next;elapsed+=dt;continue;
      }
      const open=gas(g,ids,empty,mask,maskPlane),next=[...ids];
      const directional=step.method==='directional',flux=directional?rayFlux(g,ids,empty,step.angular_spread_deg,mask,maskPlane):null;
      const reemission=new Float64Array(N);
      if(step.kind==='deposit'&&flux&&step.reemit_fraction>0){for(let i=0;i<N;i++)if(flux.voidSurface[i]){const nearby=neighbors(g,i).filter(n=>ids[n.index]===empty&&open[n.index]&&neighbors(g,n.index).some(p=>ids[p.index]!==empty));for(const n of nearby)reemission[n.index]+=flux.voidSurface[i]*step.reemit_fraction/nearby.length;}}
      if(flux){let max=1;for(let i=0;i<N;i++)max=Math.max(max,step.kind==='deposit'?(1-step.reemit_fraction)*flux.voidSurface[i]+reemission[i]:flux.surface[i]);if(maximumRate>0)dt=Math.min(dt,h*.5/(maximumRate*max));}
      for(let i=0;i<N;i++){
        if(step.kind==='deposit'){
          if(ids[i]!==empty||!open[i])continue;
          let factor=flux?(1-step.reemit_fraction)*flux.voidSurface[i]+reemission[i]:Math.max(0,...neighbors(g,i,true).filter(n=>ids[n.index]!==empty).map(n=>1/n.length));
          // A zero-sticking beam contributes no direct growth; a single local diffuse bounce is explicit.
          accumulator[i]+=step.rate_um_s*factor*dt;
          if(accumulator[i]>=h-1e-10)next[i]=step.material_id;
        }else{
          if(ids[i]===empty)continue;const rate=step.rates_um_s[ids[i]]||0;if(!rate)continue;
          const factor=flux?flux.surface[i]:neighbors(g,i).some(n=>open[n.index])?1:0;
          accumulator[i]+=rate*factor*dt;if(accumulator[i]>=h-1e-10)next[i]=empty;
        }
      }ids=next;elapsed+=dt;
    }
    time+=step.time_s;
    const stage=summarize(recipe,[...ids],step.id,step.name,time,before,iterations);stages.push(stage);
    if(step.time_s*maximumRate<h&&!(step.kind==='cmp'&&step.method==='plane'))warnings.add(`${step.name}: 기준 변화량이 한 voxel보다 작습니다. 무변화는 공정 효과 0을 뜻하지 않습니다.`);
    if(Array.from(highest(g,ids,empty)).some(z=>z===g.shape[2]-1))warnings.add(`${step.name}: 고체가 domain 상단에 닿았습니다. 외부 경계의 성장/수송은 잘려 있어 domain을 늘려야 합니다.`);
    if(!stage.changed_voxels&&step.time_s>0)warnings.add(`${step.name}: 해상도·가림·선택비·stop 조건에 의해 완성 voxel 변화가 없습니다.`);
  }
  return {schema_version:1,kind:'register-process-run',engine:'register-voxel-kinetics-1',recipe,recipe_sha256:await recipeHash(recipe),stages,kinematic_prediction:true,calibrated_physical_prediction:false,foundry_signoff:false,warnings:[...warnings],checked_at:new Date().toISOString()};
}
/** Compare the same domain at h and 2h; report actual differences, never a guessed convergence PASS. */
export async function compareResolution(input:unknown,progress?:(step:number,total:number,name:string)=>void){
  const recipe=validateRecipe(input);if(recipe.grid.shape.some(n=>n%2!==0||n<4))throw new Error('h·2h 비교는 각 축이 4 이상의 짝수인 격자가 필요합니다. 동일 domain을 유지합니다.');
  const fine=await simulateRecipe(recipe,progress),coarseRecipe=structuredClone(recipe);coarseRecipe.grid.spacing_um*=2;coarseRecipe.grid.shape=recipe.grid.shape.map(n=>n/2) as [number,number,number];
  const coarse=await simulateRecipe(coarseRecipe,progress),a=fine.stages.at(-1)!,b=coarse.stages.at(-1)!;let changed=0;
  for(let i=0;i<a.material_ids.length;i++){const p=cellXYZ(recipe.grid,i);if(a.material_ids[i]!==b.material_ids[index3(coarseRecipe.grid,Math.floor(p[0]/2),Math.floor(p[1]/2),Math.floor(p[2]/2))])changed++;}
  fine.convergence={coarse_spacing_um:coarseRecipe.grid.spacing_um,fine_spacing_um:recipe.grid.spacing_um,different_volume_um3:changed*recipe.grid.spacing_um**3,different_fraction:changed/a.material_ids.length,material_volume_error_um3:Object.fromEntries(recipe.materials.map(m=>[m.id,(a.material_volume_um3[m.id]||0)-(b.material_volume_um3[m.id]||0)])),closed_void_counts:[b.closed_voids,a.closed_voids]};return fine;
}
export function validateRun(input:unknown):ProcessRun {
  if(!record(input)||input.schema_version!==1||input.kind!=='register-process-run'||input.engine!=='register-voxel-kinetics-1'||input.kinematic_prediction!==true||input.calibrated_physical_prediction!==false||input.foundry_signoff!==false||typeof input.recipe_sha256!=='string'||!/^[a-f0-9]{64}$/.test(input.recipe_sha256)||!Array.isArray(input.stages)||!Array.isArray(input.warnings)||!input.warnings.every(s=>typeof s==='string'))throw new Error('유효한 Resistor 공정 계산 결과가 필요합니다.');
  const recipe=validateRecipe(input.recipe),ids=new Set(recipe.materials.map(m=>m.id));
  if(input.stages.length!==recipe.steps.length+1||input.stages.some((s,i)=>!record(s)||s.step_id!==(i?recipe.steps[i-1].id:'initial')||!label(s.name)||!finite(s.time_s)||!Array.isArray(s.material_ids)||s.material_ids.length!==gridCount(recipe.grid)||s.material_ids.some(m=>!Number.isInteger(m)||!ids.has(m))))throw new Error('단계별 grid·재료·순서가 잘못됐습니다.');
  // Recompute geometric summaries from saved occupancy; an imported receipt is not a trusted verification claim.
  const saved=input.stages as ProcessStage[];
  const stages=saved.map((s,i)=>summarize(recipe,[...s.material_ids],s.step_id,s.name,s.time_s,i?saved[i-1].material_ids:undefined,s.iterations||0));
  return {...input,recipe,stages} as unknown as ProcessRun;
}
export function stageVolume(run:ProcessRun,index:number):ProcessVolume {
  const stage=run.stages[index];if(!stage)throw new Error('없는 공정 단계입니다.');const recipe=run.recipe,g=recipe.grid,[nx,ny,nz]=g.shape,h=g.spacing_um;
  if(stage.material_ids.length*6>PROCESS_LIMITS.cells)throw new Error('체적 mesh 상한을 초과합니다.');
  const points:Vec3[]=[],node=(x:number,y:number,z:number)=>(z*(ny+1)+y)*(nx+1)+x;
  for(let z=0;z<=nz;z++)for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++)points.push([g.origin_um[0]+x*h,g.origin_um[1]+y*h,g.origin_um[2]+z*h]);
  const empty=recipe.materials.find(m=>m.role==='void')!.id,open=gas(g,stage.material_ids,empty,undefined,Infinity,true),materials=new Map(recipe.materials.map(m=>[m.id,m]));
  const split=[[0,1,3,7],[0,3,2,7],[0,2,6,7],[0,6,4,7],[0,4,5,7],[0,5,1,7]];
  const cells:ProcessVolume['cells']=[];
  for(let i=0;i<stage.material_ids.length;i++){
    const [x,y,z]=cellXYZ(g,i),id=stage.material_ids[i],corners=[node(x,y,z),node(x+1,y,z),node(x,y+1,z),node(x+1,y+1,z),node(x,y,z+1),node(x+1,y,z+1),node(x,y+1,z+1),node(x+1,y+1,z+1)];
    let thickness:number|null=null;
    if(materials.get(id)!.role==='film'){
      const spans=[0,1,2].map(a=>{let count=1;for(const sign of [-1,1]){const p=[x,y,z];for(p[a]+=sign;p[a]>=0&&p[a]<g.shape[a];p[a]+=sign){if(stage.material_ids[index3(g,p[0],p[1],p[2])]!==id)break;count++;}}return count*h;});thickness=Math.min(...spans);
    }
    for(let t=0;t<6;t++)cells.push({id:`voxel-${i}-tet-${t}`,material_id:id,vertices:split[t].map(c=>corners[c]) as [number,number,number,number],thickness_um:thickness,region:id===empty?(open[i]?'exterior gas':'closed void'):`${stage.name} · ${materials.get(id)!.name}`});
  }
  return validateVolume({schema_version:1,kind:'register-process-volume',name:recipe.name,stage:stage.name,unit:'um',provenance:{kind:'simulation',tool:run.engine,reference:run.recipe_sha256,label:`속도 기반 voxel 형상 계산 · 미보정 · h=${h}µm · 두께=최소 XYZ chord · recipe ${run.recipe_sha256.slice(0,12)}`},scope:{kind:'roi',domain_um:[g.origin_um,g.origin_um.map((v,a)=>v+g.shape[a]*h) as Vec3]},materials:recipe.materials,points_um:points,cells});
}
export function fitPlanarRate(points:{time_s:number;thickness_um:number}[]){
  if(!points.length||points.length>1000||points.some(p=>!range(p.time_s,1e-9,1e6)||!range(p.thickness_um,0,1e6)))throw new Error('양의 시간과 비음수 측정 두께가 필요합니다.');
  const rate=points.reduce((s,p)=>s+p.time_s*p.thickness_um,0)/points.reduce((s,p)=>s+p.time_s**2,0);
  return {rate_um_s:rate,rmse_um:Math.sqrt(points.reduce((s,p)=>s+(p.thickness_um-rate*p.time_s)**2,0)/points.length),samples:points.length,model:'planar thickness = rate × time; zero intercept',three_dimensional_calibration:false};
}
