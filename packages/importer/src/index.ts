import type { CurrentFlow, Layer, Scene, SceneShape } from '@mos/contracts';
export * from './compat';

type Point = [number, number];
type Matrix = [number, number, number, number, number, number];
interface Element { kind:number; layer:number; datatype:number; xy:Point[]; width:number; pathType:number; begin:number; end:number; ref:string; columns:number; rows:number; angle:number; mag:number; flags:number; text:string; props:Record<number,string>; prop:number }
interface Cell { name:string; elements:Element[] }
export interface GdsScene extends Scene { top_cell:string; top_cells:string[]; import_notes:string[]; gds_fingerprint:string }
export interface PdkDisplay { id:string; name:string; layers:Layer[]; notes:string[]; compact_default_stack?:boolean }
const identity:Matrix=[1,0,0,1,0,0];
const coord=(value:number)=>{if(!Number.isSafeInteger(Math.round(value)))throw new Error('GDS 변환 좌표가 정확한 정수 범위를 초과합니다. Native KLayout을 사용하세요.');return String(Math.round(value));};
const transform=(p:Point,m:Matrix):Point=>[m[0]*p[0]+m[2]*p[1]+m[4],m[1]*p[0]+m[3]*p[1]+m[5]];
const compose=(a:Matrix,b:Matrix):Matrix=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
function real8(view:DataView,offset:number){const first=view.getUint8(offset);let mantissa=0;for(let i=1;i<8;i++)mantissa=mantissa*256+view.getUint8(offset+i);return (first&128?-1:1)*mantissa/2**56*16**((first&127)-64);}
const palette=['#75b6ff','#ffb86b','#bd8eff','#6be0ab','#ea78a4','#85d6de','#d6ca79'];
function contourRings(points:Point[]):{outer:Point[];holes:Point[][]}{
  const rings:Point[][]=[];
  const area=(ring:Point[])=>ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-q[0]*p[1];},0)/2;
  const split=(ring:Point[],depth=0)=>{if(depth>64)throw new Error('GDS contour bridge 처리 제한');const seen=new Map<string,number>();for(let i=0;i<ring.length;i++){const key=ring[i].join(','),previous=seen.get(key);if(previous!==undefined){split(ring.slice(previous,i),depth+1);split([...ring.slice(0,previous),...ring.slice(i)],depth+1);return;}seen.set(key,i);}if(ring.length>=3&&area(ring)!==0)rings.push(ring);};split(points);
  rings.sort((a,b)=>Math.abs(area(b))-Math.abs(area(a)));if(!rings.length)throw new Error('면적 없는 GDS contour');const outer=rings[0];
  const inside=(p:Point,ring:Point[])=>{let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;};
  const holes=rings.slice(1);if(holes.some(h=>!inside(h[0],outer)))throw new Error('다중 island GDS boundary는 native KLayout으로 열어 주세요.');return {outer,holes};
}
function genericLayer(layer:number,datatype:number,index:number):Layer{return {id:`${layer}/${datatype}`,name:`GDS ${layer}/${datatype}`,gds:[layer,datatype],color:palette[index%palette.length],opacity:.65,z_display_um:index*.3,thickness_display_um:.12,source:'illustrative',physical_z_um:null,physical_thickness_um:null,material:'mask'};}
function pathPolygon(e:Element):Point[]{
  if(e.width<0)throw new Error('절대 폭(negative WIDTH) GDS PATH는 native KLayout으로 열어 주세요.');
  const points=e.xy.filter((p,i,a)=>!i||p[0]!==a[i-1][0]||p[1]!==a[i-1][1]);if(points.length<2||!e.width)throw new Error('0 폭/퇴화 GDS PATH는 offline polygon으로 변환할 수 없습니다.');
  if(![0,2,4].includes(e.pathType))throw new Error(`GDS PATH type ${e.pathType}는 native KLayout으로 열어 주세요.`);
  const half=Math.abs(e.width)/2,dirs=points.slice(1).map((p,i)=>{const dx=p[0]-points[i][0],dy=p[1]-points[i][1],l=Math.hypot(dx,dy);return [dx/l,dy/l] as Point;});
  const start=e.pathType===2?half:e.pathType===4?e.begin:0,end=e.pathType===2?half:e.pathType===4?e.end:0;
  points[0]=[points[0][0]-dirs[0][0]*start,points[0][1]-dirs[0][1]*start];const last=points.length-1;points[last]=[points[last][0]+dirs[last-1][0]*end,points[last][1]+dirs[last-1][1]*end];
  const sides=(sign:number)=>points.map((p,i):Point=>{const d=dirs[Math.min(i,dirs.length-1)],n:Point=[-d[1]*sign,d[0]*sign];if(!i||i===last)return [p[0]+n[0]*half,p[1]+n[1]*half];const prev=dirs[i-1],np:Point=[-prev[1]*sign,prev[0]*sign],v:Point=[np[0]+n[0],np[1]+n[1]],den=v[0]*n[0]+v[1]*n[1];if(Math.abs(den)<1e-8)throw new Error('GDS PATH의 180도 역전은 native KLayout을 사용하세요.');return [p[0]+v[0]*half/den,p[1]+v[1]*half/den];});
  return [...sides(1),...sides(-1).reverse()];
}

/** Read-only standard GDSII subset. Native KLayout remains the editing/export authority. */
export function parseGds(buffer:ArrayBuffer,options:{topCell?:string;maxShapes?:number;bounds?:[string,string,string,string]}={}):GdsScene{
  if(buffer.byteLength>64*1024*1024)throw new Error('독립 뷰어 GDS 크기 제한은 64 MiB입니다.');
  const view=new DataView(buffer),decoder=new TextDecoder('ascii'),cells=new Map<string,Cell>(),notes=new Set<string>();let cell:Cell|undefined,element:Element|undefined,dbu=.001,library='',ended=false,header=false,hash=2166136261;
  for(const b of new Uint8Array(buffer))hash=Math.imul(hash^b,16777619)>>>0;
  const textAt=(o:number,len:number)=>decoder.decode(new Uint8Array(buffer,o,len)).replace(/\0+$/,'');
  for(let offset=0;offset<buffer.byteLength;){
    if(buffer.byteLength-offset<4)throw new Error('잘린 GDS record header');const length=view.getUint16(offset),type=view.getUint8(offset+2),dataType=view.getUint8(offset+3),o=offset+4,n=length-4;
    if(length<4||length%2||offset+length>buffer.byteLength)throw new Error(`잘못된 GDS record 길이 (${offset})`);
    const i16=()=>{if(n!==2)throw new Error('GDS INT2 크기 오류');return view.getUint16(o);};const i32=()=>{if(n!==4)throw new Error('GDS INT4 크기 오류');return view.getInt32(o);};
    if(type===0){header=true;if(dataType!==2)throw new Error('GDS header type 오류');}
    else if(type===2)library=textAt(o,n);
    else if(type===3){if(n!==16)throw new Error('GDS units 크기 오류');dbu=real8(view,o+8)*1e6;if(!Number.isFinite(dbu)||dbu<=0)throw new Error('GDS DBU 단위 오류');}
    else if(type===4){ended=true;break;}
    else if(type===5){if(cell)throw new Error('중첩 GDS cell');cell={name:'',elements:[]};}
    else if(type===6){if(!cell)throw new Error('cell 외부 STRNAME');cell.name=textAt(o,n);if(!cell.name||cells.has(cell.name))throw new Error('GDS cell 이름 중복/누락');cells.set(cell.name,cell);}
    else if(type===7){if(element)throw new Error('종료되지 않은 GDS element');cell=undefined;}
    else if([8,9,10,11,12,45].includes(type)){if(!cell||element)throw new Error('잘못된 GDS element 위치');element={kind:type,layer:0,datatype:0,xy:[],width:0,pathType:0,begin:0,end:0,ref:'',columns:1,rows:1,angle:0,mag:1,flags:0,text:'',props:{},prop:0};}
    else if(type===21)throw new Error('GDS NODE는 native KLayout으로 열어 주세요.');
    else if(type===17){if(!cell||!element)throw new Error('GDS ENDEL 오류');cell.elements.push(element);element=undefined;}
    else if(element){
      if(type===13)element.layer=i16();else if([14,22,46].includes(type))element.datatype=i16();else if(type===15)element.width=i32();
      else if(type===16){if(!n||n%8)throw new Error('GDS XY 크기 오류');element.xy=Array.from({length:n/8},(_,i)=>[view.getInt32(o+i*8),view.getInt32(o+i*8+4)]);}
      else if(type===18)element.ref=textAt(o,n);else if(type===19){if(n!==4)throw new Error('GDS COLROW 오류');element.columns=view.getUint16(o);element.rows=view.getUint16(o+2);if(!element.columns||!element.rows||element.columns*element.rows>1_000_000)throw new Error('GDS array 크기 제한 (1,000,000)');}
      else if(type===25)element.text=textAt(o,n);else if(type===26){element.flags=i16();if(element.flags&6)throw new Error('absolute MAG/ANGLE STRANS는 native KLayout으로 열어 주세요.');}
      else if(type===27||type===28){if(n!==8)throw new Error('GDS REAL8 오류');const value=real8(view,o);if(!Number.isFinite(value))throw new Error('GDS 변환 값 오류');if(type===27){if(value<=0)throw new Error('GDS MAG 오류');element.mag=value;}else element.angle=value;}
      else if(type===33)element.pathType=i16();else if(type===43)element.prop=i16();else if(type===44)element.props[element.prop]=textAt(o,n);else if(type===48)element.begin=i32();else if(type===49)element.end=i32();
    }
    offset+=length;
  }
  if(!header||!ended||cell||element||!cells.size)throw new Error('완전한 GDSII library가 아닙니다.');
  const referenced=new Set([...cells.values()].flatMap(c=>c.elements.filter(e=>e.kind===10||e.kind===11).map(e=>e.ref)));const topCells=[...cells.keys()].filter(n=>!referenced.has(n));const top=options.topCell??topCells[0];if(!top||!cells.has(top))throw new Error('GDS top cell을 선택하세요.');
  const boundsCache=new Map<string,[number,number,number,number]>();let visited=0;
  const merge=(a:[number,number,number,number]|undefined,pts:Point[])=>{for(const [x,y] of pts)a=a?[Math.min(a[0],x),Math.min(a[1],y),Math.max(a[2],x),Math.max(a[3],y)]:[x,y,x,y];return a;};
  const refs=(e:Element):Matrix[]=>{if((e.kind===11&&e.xy.length!==3)||(e.kind===10&&e.xy.length!==1))throw new Error('GDS reference XY 오류');const theta=e.angle*Math.PI/180,c=Math.cos(theta),s=Math.sin(theta),mirror=e.flags&0x8000?-1:1;const a:Matrix=[c*e.mag,s*e.mag,-s*e.mag*mirror,c*e.mag*mirror,0,0];const transforms:Matrix[]=[];for(let row=0;row<e.rows;row++)for(let col=0;col<e.columns;col++){const p=e.xy[0];transforms.push([...a.slice(0,4),p[0]+(e.kind===11?(e.xy[1][0]-p[0])*col/e.columns+(e.xy[2][0]-p[0])*row/e.rows:0),p[1]+(e.kind===11?(e.xy[1][1]-p[1])*col/e.columns+(e.xy[2][1]-p[1])*row/e.rows:0)] as Matrix);}return transforms;};
  const geometry=(e:Element)=>{if(e.kind===9)return pathPolygon(e);if(e.kind===8||e.kind===45){if(e.xy.length<4)throw new Error('GDS polygon 좌표 부족');return e.xy[0][0]===e.xy.at(-1)![0]&&e.xy[0][1]===e.xy.at(-1)![1]?e.xy.slice(0,-1):e.xy;}return e.xy;};
  const bbox=(name:string,ancestry:string[]=[]):[number,number,number,number]=>{if(ancestry.includes(name)||ancestry.length>=64)throw new Error('순환/과도한 GDS hierarchy');const cached=boundsCache.get(name);if(cached)return cached;const c=cells.get(name);if(!c)throw new Error(`참조 GDS cell 없음: ${name}`);let b:[number,number,number,number]|undefined;
    for(const e of c.elements){if(++visited>2_000_000)throw new Error('GDS hierarchy 처리 제한');if(e.kind===10||e.kind===11){const child=bbox(e.ref,[...ancestry,name]);const corners:Point[]=[[child[0],child[1]],[child[2],child[1]],[child[2],child[3]],[child[0],child[3]]];for(const t of refs(e))b=merge(b,corners.map(p=>transform(p,t)));}else b=merge(b,geometry(e));}const result=b??[0,0,0,0];boundsCache.set(name,result);return result;};
  for(const name of cells.keys())bbox(name);
  const shapes:SceneShape[]=[],labels:NonNullable<Scene['labels']>=[],instances:NonNullable<Scene['instances']>=[],layerMap=new Map<string,Layer>();let total=0;visited=0;const limit=Math.max(1,Math.min(100000,Math.floor(options.maxShapes??20000)));const roi=options.bounds?.map(Number);if(roi&&(!roi.every(Number.isSafeInteger)||roi[0]>roi[2]||roi[1]>roi[3]))throw new Error('잘못된 GDS scope bounds');
  const walk=(name:string,m:Matrix,path:string,ancestry:string[])=>{if(ancestry.length>=64||ancestry.includes(name))throw new Error('순환 GDS hierarchy');const c=cells.get(name)!;for(let j=0;j<c.elements.length;j++){const e=c.elements[j];if(++visited>2_000_000)throw new Error('GDS flattened element 처리 제한');if(e.kind===10||e.kind===11){const child=boundsCache.get(e.ref)!;const ts=refs(e);for(let k=0;k<ts.length;k++){const combined=compose(m,ts[k]),position=transform([0,0],combined),corners=([ [child[0],child[1]],[child[2],child[1]],[child[2],child[3]],[child[0],child[3]]] as Point[]).map(p=>transform(p,combined)),b=merge(undefined,corners)!;const childPath=`${path}/${e.ref}[${j}:${k}]`;if(instances.length<5000)instances.push({id:childPath,cell_name:e.ref,cell_path:childPath,parent_cell:name,position:[coord(position[0]),coord(position[1])],rotation:e.angle,mirror:Boolean(e.flags&0x8000),bbox:b.map(coord) as [string,string,string,string]});walk(e.ref,combined,childPath,[...ancestry,name]);}continue;}
      const id=`${path}:e${j}`,layerId=`${e.layer}/${e.datatype}`;if(!layerMap.has(layerId))layerMap.set(layerId,genericLayer(e.layer,e.datatype,layerMap.size));
      if(e.kind===12){if(e.xy.length!==1)throw new Error('GDS TEXT XY 오류');const p=transform(e.xy[0],m);if(labels.length<20000)labels.push({id,layer_id:layerId,cell_path:path,text:e.text,position:[coord(p[0]),coord(p[1])],net:e.text||undefined});continue;}
      total++;const points=geometry(e).map(p=>transform(p,m));const b=merge(undefined,points)!;if(roi&&(b[2]<roi[0]||b[0]>roi[2]||b[3]<roi[1]||b[1]>roi[3]))continue;if(shapes.length>=limit)continue;
      if(points.some(p=>p.some(v=>Math.abs(v-Math.round(v))>1e-7)))notes.add('비정수 변환/PATH 좌표는 가장 가까운 DBU로 반올림해 표시합니다. 원본 GDS는 유지됩니다.');
      const rings=contourRings(points),decimal=(ring:Point[])=>ring.map(p=>[coord(p[0]),coord(p[1])] as [string,string]);
      shapes.push({id,layer_id:layerId,cell_path:path,polygon:decimal(rings.outer),...(rings.holes.length?{holes:rings.holes.map(decimal)}:{}),net:e.props[2]});
    }};
  walk(top,identity,top,[]);notes.add('3D 높이는 표시용입니다. 공정 물리 두께와 전류는 GDS에서 추정하지 않습니다.');
  return {project_id:`gds-${hash.toString(16)}`,revision:0,dbu_um:dbu,grid_dbu:1,source:'imported',layers:[...layerMap.values()],shapes,labels,pins:[],devices:[],bounds:boundsCache.get(top)!.map(coord) as [string,string,string,string],bounds_filter:options.bounds??null,total_shape_count:total,returned_shape_count:shapes.length,truncated:total>shapes.length,cells:[...cells.values()].map(c=>({name:c.name,bbox:boundsCache.get(c.name)!.map(coord) as [string,string,string,string],shape_count:c.elements.filter(e=>![10,11,12].includes(e.kind)).length,instance_count:c.elements.filter(e=>e.kind===10||e.kind===11).length})),instances,top_cell:top,top_cells:topCells,import_notes:[...notes],gds_fingerprint:`fnv1a-${hash.toString(16)}-${buffer.byteLength}-${library}`};
}

const finite=(value:unknown,fallback:number,min=-1e6,max=1e6)=>{if(value===undefined||value===null)return fallback;const n=Number(value);if(!Number.isFinite(n)||n<min||n>max)throw new Error('PDK 숫자 범위 오류');return n;};
const color=(value:unknown)=>{if(typeof value!=='string'||!/^#[0-9a-f]{6}$/i.test(value))throw new Error('PDK color는 #RRGGBB 형식이어야 합니다.');return value;};
function layerFrom(value:unknown,index:number):Layer{if(!value||typeof value!=='object')throw new Error('잘못된 PDK layer');const v=value as Record<string,unknown>,gds=v.gds as unknown[];if(!Array.isArray(gds)||gds.length!==2||!gds.every(n=>typeof n==='number'&&Number.isInteger(n)&&n>=0&&n<=65535))throw new Error('PDK layer.gds는 [layer, datatype] 정수여야 합니다.');return {...genericLayer(gds[0] as number,gds[1] as number,index),name:String(v.name??`${gds[0]}/${gds[1]}`).slice(0,120),color:color(v.color??palette[index%palette.length]),opacity:finite(v.opacity,.65,0,1),z_display_um:finite(v.z_display_um,index*.3),thickness_display_um:finite(v.thickness_display_um,.12,.000001,10000),source:'user',physical_z_um:v.physical_z_um==null?null:finite(v.physical_z_um,0),physical_thickness_um:v.physical_thickness_um==null?null:finite(v.physical_thickness_um,0,.000001,10000),material:typeof v.material==='string'?v.material.slice(0,120):'mask'};}
export function parsePdkLayers(text:string,filename:string):PdkDisplay{
  if(text.length>4*1024*1024)throw new Error('PDK layer 파일 제한은 4 MiB입니다.');let id=filename.replace(/\.[^.]+$/,''),name=id,compact=filename.toLowerCase().endsWith('.lyp');let values:unknown[]=[];const notes=['레이어 표시 profile입니다. 소자 모델, DRC/LVS/PEX deck 실행은 검증된 native PDK adapter를 사용합니다.'];
  if(filename.toLowerCase().endsWith('.lyp')){
    if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('PDK XML 외부 entity/DOCTYPE는 허용하지 않습니다.');
    const stack:{tag:string;data:Record<string,string>;text:string}[]=[],entries:Record<string,string>[]=[];const decode=(s:string)=>s.replace(/&(?:amp|lt|gt|quot|apos);/g,v=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"}[v]!));
    for(const token of text.match(/<!--[\s\S]*?-->|<[^>]*>|[^<]+/g)??[]){if(token.startsWith('<!--')||token.startsWith('<?'))continue;if(token.startsWith('</')){const closed=stack.pop(),tag=token.slice(2,-1).trim();if(!closed||closed.tag!==tag)throw new Error('잘못된 PDK XML 구조');if(closed.data.source)entries.push(closed.data);if(stack.length)stack.at(-1)!.data[closed.tag]=decode(closed.text.trim());}else if(token.startsWith('<')){if(token.endsWith('/>'))continue;const tag=token.slice(1,-1).trim();if(!/^[a-zA-Z][\w-]*$/.test(tag))throw new Error('PDK XML 속성/구조 미지원');stack.push({tag,data:{},text:''});}else if(stack.length)stack.at(-1)!.text+=token;}
    if(stack.length)throw new Error('종료되지 않은 PDK XML');
    values=entries.flatMap(v=>{const source=/^(\d+)\/(\d+)(?:@\d+)?$/.exec(v.source.trim());if(!source){notes.push(`레이어 source 미지원: ${v.source}`);return [];}return [{gds:[Number(source[1]),Number(source[2])],name:v.name||source[0],color:v['fill-color']||v['frame-color']||'#8999b0',opacity:v.transparent==='true'?.35:.65}];});
    notes.push('LYP의 레이어 이름/색상만 적용합니다. stipple 패턴과 wildcard/property-filter는 적용하지 않습니다.');
  }else{const value=JSON.parse(text);if(!value||typeof value!=='object')throw new Error('PDK JSON 객체 필요');id=String(value.id??value.pdk_id??id).slice(0,120);name=String(value.name??id).slice(0,120);values=value.layers;compact=value.compact_default_stack===true||Array.isArray(values)&&values.every(v=>v&&typeof v==='object'&&!('z_display_um' in v));}
  if(!Array.isArray(values)||!values.length||values.length>4096)throw new Error('1–4096개 PDK layers가 필요합니다.');const layers=values.map(layerFrom);if(new Set(layers.map(l=>l.id)).size!==layers.length)throw new Error('중복 PDK layer/datatype');if(compact)notes.push('공정 높이가 없는 레이어는 현재 GDS에 사용된 레이어 번호만으로 간격을 정한 표시 stack입니다.');return {id,name,layers,compact_default_stack:compact,notes:[...new Set(notes)]};
}
export function applyPdk(scene:Scene,pdk:PdkDisplay):Scene{const map=new Map(pdk.layers.map(l=>[l.id,l])),used=[...new Set(scene.layers.map(l=>l.gds[0]))].sort((a,b)=>a-b);return {...scene,layers:scene.layers.map(l=>map.has(l.id)?{...l,...map.get(l.id),id:l.id,...(pdk.compact_default_stack?{z_display_um:used.indexOf(l.gds[0])*.3}:{})}:l)};}
export function parseCurrentFlow(text:string,_scene:Scene):CurrentFlow{
  if(text.length>16*1024*1024)throw new Error('전류 JSON 크기 제한은 16 MiB입니다.');const value=JSON.parse(text),v=value.current_flow??value;
  if(v.schema_version!==1||v.convention!=='conventional'||!['ngspice','imported','spectre','hspice','primesim','commercial'].includes(v.source)||!Array.isArray(v.x)||!v.x.length||v.x.length>200000||!v.x.every((x:unknown)=>typeof x==='number'&&Number.isFinite(x))||!Array.isArray(v.branches)||v.branches.length>512||!Number.isInteger(v.revision)||v.revision<0||typeof v.analysis!=='string'||typeof v.x_unit!=='string')throw new Error('유효한 CurrentFlow v1 결과가 필요합니다.');
  if(v.analysis.trim().toLowerCase()==='ac')throw new Error('AC 전류는 복소 위상 결과입니다. 현재 스칼라 전류 방향 뷰어는 OP/DC/transient 결과를 사용하세요.');
  if(v.freshness!==undefined&&!['current','stale'].includes(v.freshness))throw new Error('전류 freshness는 current 또는 stale이어야 합니다.');
  if(value!==v&&value.freshness!==undefined&&!['current','stale'].includes(value.freshness))throw new Error('전류 결과 wrapper freshness는 current 또는 stale이어야 합니다.');
  if(v.notes!==undefined&&(!Array.isArray(v.notes)||v.notes.length>256||!v.notes.every((s:unknown)=>typeof s==='string')))throw new Error('전류 notes는 문자열 배열이어야 합니다.');
  if(v.geometry_linkage!==undefined&&!['unverified','verified'].includes(v.geometry_linkage))throw new Error('전류 geometry_linkage 형식 오류');
  if(v.input_origin!==undefined&&!['project-snapshot','operator-recipe','external-native-database','imported-file'].includes(v.input_origin))throw new Error('전류 input_origin 형식 오류');
  for(const key of ['project_id','run_id','layout_sha256','backend_profile_id','tool'])if(v[key]!==undefined&&(typeof v[key]!=='string'||v[key].length>512))throw new Error('전류 provenance ID/hash 형식 오류');
  let samples=0;const ids=new Set<string>();for(const b of v.branches){if(!b||typeof b.id!=='string'||ids.has(b.id)||typeof b.name!=='string'||typeof b.from_net!=='string'||typeof b.to_net!=='string'||typeof b.source_vector!=='string'||!['device_terminals','user_path','unmapped'].includes(b.mapping)||!Array.isArray(b.values_A)||b.values_A.length!==v.x.length||!b.values_A.every((n:unknown)=>typeof n==='number'&&Number.isFinite(n)))throw new Error('전류 branch 샘플/단위/ID 오류');ids.add(b.id);samples+=b.values_A.length;if(samples>2_000_000)throw new Error('전류 샘플 처리 제한');if(b.path_dbu!==undefined&&(!Array.isArray(b.path_dbu)||b.path_dbu.length<2||b.path_dbu.length>4096||!b.path_dbu.every((p:unknown)=>Array.isArray(p)&&p.length===2&&p.every(n=>typeof n==='string'&&/^-?\d{1,19}$/.test(n)))))throw new Error('전류 path는 DBU 정수 좌표여야 합니다.');if(b.mapping!=='unmapped'&&!b.path_dbu)throw new Error('위치 대응된 전류에는 path_dbu가 필요합니다.');}
  // Native Run JSON carries dependency freshness outside current_flow. Preserve
  // that authority when importing a full result; a stale wrapper wins over an
  // older nested current flag, and neither form can silently clear stale data.
  const freshness=v.freshness==='stale'||value!==v&&value.freshness==='stale'?'stale':v.freshness??(value!==v?value.freshness:undefined);
  const geometry_linkage=v.geometry_linkage??(['spectre','hspice','primesim','commercial'].includes(v.source)||v.backend_profile_id?'unverified':undefined);
  return {...v,...(freshness===undefined?{}:{freshness}),...(geometry_linkage===undefined?{}:{geometry_linkage})} as CurrentFlow;
}
