import type {Device} from '@mos/contracts';
import {pinOffsets,type Point} from './schematic-drawing';

export interface WirePin { device_id:string; pin:string; name:string; net:string; point:Point }
export function wirePins(devices:Device[]):WirePin[]{
  return devices.flatMap(device=>Object.entries(device.pins).flatMap(([pin,net])=>{
    const offset=pinOffsets(device)[pin];
    return offset?[{device_id:device.id,pin,name:device.name,net,point:[device.x+offset[0],device.y+offset[1]] as Point}]:[];
  }));
}
export function nearestWirePin(pins:WirePin[],point:Point,radius:number):WirePin|null{
  if(!Number.isFinite(radius)||radius<=0)return null;
  const distances=pins.map(pin=>({pin,d:Math.hypot(point[0]-pin.point[0],point[1]-pin.point[1])})).filter(p=>p.d<=radius).sort((a,b)=>a.d-b.d);
  // Overlapping terminals require an explicit terminal click, never a guess.
  return distances.length&&!(distances.length>1&&Math.abs(distances[0].d-distances[1].d)<1e-6)?distances[0].pin:null;
}
export function wireNetConflict(from:WirePin,to:WirePin,label=''):string|null{
  const names=[...new Set([from.net,to.net,label.trim()].filter(Boolean))];
  return names.length>1?`노드 이름 충돌: ${names.join(' ↔ ')}. 노드 이름을 먼저 확인·수정하세요.`:null;
}
