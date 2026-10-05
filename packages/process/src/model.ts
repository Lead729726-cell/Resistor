export type Vec3 = [number, number, number];
export type Tet = [number, number, number, number];
export interface ProcessMaterial { id:number; name:string; color:string; role:'film'|'bulk'|'void'; family?:'semiconductor'|'metal'|'dielectric'|'other'; nominal_thickness_um?:number }
export interface ProcessCell { id:string; material_id:number; vertices:Tet; thickness_um:number|null;region?:string }
export interface ProcessVolume {
  schema_version:1; kind:'register-process-volume'; name:string; stage:string; unit:'um';
  provenance:{kind:'measurement'|'simulation'|'user'|'demo';label:string;tool?:string;reference?:string};
  scope:{kind:'device'|'roi';domain_um:[Vec3,Vec3]};
  materials:ProcessMaterial[]; points_um:Vec3[]; cells:ProcessCell[];
  association?:{project_id:string;revision:number};
}
export const PROCESS_LIMITS = { bytes:32*1024*1024, points:100000, cells:30000, overlap_pairs:1500000 };
export const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
export const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const tetVolume=(p:Vec3[])=>Math.abs(dot(sub(p[1],p[0]),cross(sub(p[2],p[0]),sub(p[3],p[0]))))/6;
export const centre=(volume:ProcessVolume,index:number):Vec3=>[0,1,2].map(axis=>volume.cells[index].vertices.reduce((sum,id)=>sum+volume.points_um[id][axis],0)/4) as Vec3;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const label=(v:unknown)=>typeof v==='string'&&v.trim().length>0&&v.length<=256;
const number=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e9;
const point=(v:unknown):v is Vec3=>Array.isArray(v)&&v.length===3&&v.every(number);
/** No layer extrusion or inferred thickness is introduced by the process importer. */
export function validateVolume(value:unknown):ProcessVolume {
  if(!object(value)||value.schema_version!==1||value.kind!=='register-process-volume'||value.unit!=='um'||!label(value.name)||!label(value.stage)) throw new Error('공정 체적 schema_version=1, kind, 이름·단계 및 unit=um이 필요합니다.');
  const source=value.provenance,scope=value.scope;
  if(!object(source)||!['measurement','simulation','user','demo'].includes(String(source.kind))||!label(source.label))throw new Error('실측/해석/사용자/교육용 출처와 설명이 필요합니다.');
  if(!object(scope)||!['device','roi'].includes(String(scope.kind))||!Array.isArray(scope.domain_um)||scope.domain_um.length!==2||!scope.domain_um.every(point))throw new Error('검토 범위와 XYZ domain_um 두 점이 필요합니다.');
  const domain=scope.domain_um as [Vec3,Vec3];if([0,1,2].some(axis=>domain[0][axis]>=domain[1][axis]))throw new Error('검토 domain의 각 XYZ 범위가 증가해야 합니다.');
  if(!Array.isArray(value.materials)||!value.materials.length||value.materials.length>256)throw new Error('재료 정의가 필요합니다 (최대 256).');
  const materials=new Set<number>();
  for(const material of value.materials){
    if(!object(material)||!Number.isSafeInteger(material.id)||materials.has(Number(material.id))||!label(material.name)||!/^#[0-9a-f]{6}$/i.test(String(material.color))||!['film','bulk','void'].includes(String(material.role)))throw new Error('재료 ID·이름·색·film/bulk/void 구분이 잘못됐습니다.');
    if(material.nominal_thickness_um!==undefined&&(!number(material.nominal_thickness_um)||material.nominal_thickness_um<=0))throw new Error('기준 막 두께는 양의 µm 값이어야 합니다.');
    if(material.family!==undefined&&!['semiconductor','metal','dielectric','other'].includes(String(material.family)))throw new Error('재료 계열이 잘못됐습니다.');
    materials.add(Number(material.id));
  }
  if(!Array.isArray(value.points_um)||value.points_um.length<4||value.points_um.length>PROCESS_LIMITS.points||!value.points_um.every(point))throw new Error('유한한 XYZ 점 4~100,000개가 필요합니다.');
  const vertices=value.points_um as Vec3[];
  const coordinates=new Set<string>();for(const p of vertices){const key=p.join(':');if(coordinates.has(key))throw new Error('같은 XYZ에 중복 node가 있습니다. 접합 면의 공극 검사를 위해 conforming/welded mesh로 export하세요.');coordinates.add(key);}
  for(const p of vertices)if(p.some((coordinate,axis)=>coordinate<domain[0][axis]-1e-9||coordinate>domain[1][axis]+1e-9))throw new Error('검토 domain을 벗어난 점이 있습니다. 범위를 잘라 통과 처리하지 않습니다.');
  if(!Array.isArray(value.cells)||!value.cells.length||value.cells.length>PROCESS_LIMITS.cells)throw new Error('사면체 cell 1~30,000개가 필요합니다. 초과 시 조용히 일부만 검사하지 않습니다.');
  const ids=new Set<string>(),tets=new Set<string>(),used=new Set<number>();
  for(const cell of value.cells){
    if(!object(cell)||!label(cell.id)||ids.has(String(cell.id))||!materials.has(Number(cell.material_id))||!Number.isSafeInteger(cell.material_id)||!Array.isArray(cell.vertices)||cell.vertices.length!==4||new Set(cell.vertices).size!==4||!cell.vertices.every(i=>Number.isSafeInteger(i)&&Number(i)>=0&&Number(i)<vertices.length))throw new Error('cell ID·재료·사면체 연결 인덱스가 잘못됐거나 중복입니다.');
    if(cell.thickness_um!==null&&(!number(cell.thickness_um)||cell.thickness_um<0))throw new Error('국부 두께는 0 이상의 µm 또는 null(미평가)이어야 합니다.');
    if(cell.region!==undefined&&!label(cell.region))throw new Error('관심 영역 이름이 잘못됐습니다.');
    const key=[...cell.vertices].sort((a,b)=>Number(a)-Number(b)).join(':');if(tets.has(key))throw new Error('동일한 사면체가 중복되었습니다.');
    const p=cell.vertices.map(i=>vertices[Number(i)]),size=Math.max(...p.slice(1).map(v=>Math.hypot(...sub(v,p[0]))));
    if(tetVolume(p)<=1e-12*size**3)throw new Error('부피가 0이거나 수치적으로 퇴화한 사면체입니다.');
    ids.add(String(cell.id));tets.add(key);cell.vertices.forEach(i=>used.add(Number(i)));
  }
  if(used.size!==vertices.length)throw new Error('참조되지 않는 mesh 점이 있습니다. 전체 범위 검토를 위해 정리된 mesh를 입력하세요.');
  if(value.association!==undefined&&(!object(value.association)||!label(value.association.project_id)||!Number.isSafeInteger(value.association.revision)||Number(value.association.revision)<0))throw new Error('공정 데이터의 설계/revision 연결이 잘못됐습니다.');
  return value as unknown as ProcessVolume;
}
export function parseVolumeJSON(text:string):ProcessVolume {
  if(new TextEncoder().encode(text).length>PROCESS_LIMITS.bytes)throw new Error('공정 데이터 크기 제한은 32 MiB입니다.');
  return validateVolume(JSON.parse(text));
}
