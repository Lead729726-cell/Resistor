import type {Device,SchematicCell} from '@mos/contracts';

/** Reject recursive or unresolved dependencies before offering placement. Engine validates again. */
export function blockPlacementReason(cells:Record<string,SchematicCell>,candidate:string,parent:string|null):string|null{
 const visit=(name:string,path:Set<string>):string|null=>{
  if(name===parent)return '현재 셀을 포함하는 순환 계층은 배치할 수 없습니다.';
  if(path.has(name))return '블록 내부에 순환 계층이 있습니다.';
  const cell=cells[name];if(!cell)return '참조한 하위 셀을 찾을 수 없습니다: '+name;
  const next=new Set(path).add(name);
  for(const d of cell.devices.filter(d=>d.kind==='block')){
   if(!d.cell_name)return '참조 셀이 없는 블록이 있습니다.';
   const reason=visit(d.cell_name,next);if(reason)return reason;
  }
  return null;
 };
 return visit(candidate,new Set());
}
export function makePlacedBlock(name:string,cell:SchematicCell,devices:Device[],point:[number,number],id:string,rotation:0|90|180|270=0,mirror=false):Device{
 if(!point.every(Number.isFinite))throw Error('배치 좌표가 유효하지 않습니다.');
 let suffix=1;const prefix='X'+name+'_';while(devices.some(d=>d.name.toLowerCase()===(prefix+suffix).toLowerCase()))suffix++;
 return {id,name:prefix+suffix,kind:'block',cell_name:name,pins:Object.fromEntries((cell.ports||[]).map(port=>[port,''])),parameters:{},x:Math.round(point[0]/10)*10,y:Math.round(point[1]/10)*10,rotation,mirror};
}
