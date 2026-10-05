import { PROCESS_LIMITS, validateVolume, type ProcessMaterial, type ProcessVolume, type Vec3 } from './model';
export interface VtuOptions {
  name:string;stage:string;coordinate_unit:'um'|'nm'|'m';thickness_unit?:'um'|'nm'|'m';
  material_array:string;thickness_array?:string;materials:ProcessMaterial[];
  provenance:ProcessVolume['provenance'];scope:ProcessVolume['scope'];association?:ProcessVolume['association'];
}
const unitScale={um:1,nm:.001,m:1e6};
/** Deliberately supports one-piece inline ASCII linear tetrahedra. Binary/higher-order data is rejected. */
export function parseVtu(text:string,options:VtuOptions):ProcessVolume {
  if(new TextEncoder().encode(text).length>PROCESS_LIMITS.bytes||/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('VTU 파일 크기/외부 entity는 허용되지 않습니다.');
  if(!options||!Object.hasOwn(unitScale,options.coordinate_unit)||!options.material_array||!options.scope)throw new Error('VTU의 좌표 단위·재료 array·재료 이름/역할 및 검토 범위를 명시하세요.');
  if(options.thickness_array&&(!options.thickness_unit||!Object.hasOwn(unitScale,options.thickness_unit)))throw new Error('국부 두께 array의 단위를 명시하세요.');
  const xml=new DOMParser().parseFromString(text,'application/xml'),root=xml.documentElement;
  if(xml.querySelector('parsererror')||root.tagName!=='VTKFile'||root.getAttribute('type')!=='UnstructuredGrid'||root.hasAttribute('compressor')||xml.querySelector('AppendedData'))throw new Error('유효한 inline ASCII UnstructuredGrid VTU가 필요합니다. Binary/appended/compressed는 지원하지 않습니다.');
  const pieces=xml.getElementsByTagName('Piece');if(pieces.length!==1)throw new Error('하나의 Piece만 지원합니다. 여러 partition을 일부만 읽지 않습니다.');
  const piece=pieces[0],pointCount=Number(piece.getAttribute('NumberOfPoints')),cellCount=Number(piece.getAttribute('NumberOfCells'));
  if(!Number.isSafeInteger(pointCount)||pointCount<4||pointCount>PROCESS_LIMITS.points||!Number.isSafeInteger(cellCount)||cellCount<1||cellCount>PROCESS_LIMITS.cells)throw new Error('VTU point/cell 개수 제한을 초과했거나 잘못됐습니다.');
  for(const array of Array.from(piece.getElementsByTagName('DataArray')))if(array.getAttribute('format')!=='ascii')throw new Error('VTU DataArray는 명시적인 format=ascii만 지원합니다.');
  const child=(parent:Element,name:string)=>{const found=Array.from(parent.children).filter(v=>v.tagName===name);if(found.length!==1)throw new Error(`VTU ${name} 요소 누락/중복`);return found[0];};
  const array=(parent:Element,name:string|undefined,components:number,count:number,nullable=false)=>{
    const found=Array.from(parent.children).filter(v=>v.tagName==='DataArray'&&(name===undefined||v.getAttribute('Name')===name));if(found.length!==1||Number(found[0].getAttribute('NumberOfComponents')||'1')!==components)throw new Error(`VTU array ${name||'Points'} 누락/중복/component 오류`);
    const tokens=(found[0].textContent||'').trim().split(/\s+/);if(tokens.length!==count)throw new Error(`VTU array ${name||'Points'} 길이 오류`);
    return tokens.map(token=>{if(nullable&&/^nan$/i.test(token))return null;if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(token))throw new Error('VTU에 유효하지 않은 숫자가 있습니다.');const v=Number(token);if(!Number.isFinite(v))throw new Error('VTU의 무한대 값은 허용되지 않습니다.');return v;});
  };
  const xyz=array(child(piece,'Points'),undefined,3,pointCount*3) as number[],cellData=child(piece,'CellData'),cells=child(piece,'Cells');
  const connection=array(cells,'connectivity',1,cellCount*4) as number[],offsets=array(cells,'offsets',1,cellCount),types=array(cells,'types',1,cellCount);
  if(types.some(v=>v!==10)||offsets.some((v,i)=>v!==4*(i+1)))throw new Error('VTU linear tetra type=10만 지원합니다. 다른 cell을 생략하지 않습니다.');
  const materialIds=array(cellData,options.material_array,1,cellCount),thickness=options.thickness_array?array(cellData,options.thickness_array,1,cellCount,true):Array(cellCount).fill(null),scale=unitScale[options.coordinate_unit];
  const points=Array.from({length:pointCount},(_,i)=>xyz.slice(i*3,i*3+3).map(v=>v*scale) as Vec3);
  return validateVolume({schema_version:1,kind:'register-process-volume',name:options.name,stage:options.stage,unit:'um',scope:options.scope,provenance:options.provenance,materials:options.materials,association:options.association,points_um:points,cells:Array.from({length:cellCount},(_,i)=>({id:`vtu-cell-${i}`,vertices:connection.slice(i*4,i*4+4),material_id:materialIds[i],thickness_um:thickness[i]===null?null:Number(thickness[i])*unitScale[options.thickness_unit||'um']}))});
}
