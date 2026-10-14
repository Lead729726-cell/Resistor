import type {Device,LogicGate,PinConnectionCommand} from '@mos/contracts';
import {pinOffsets,pinBridge} from './schematic-drawing';

export const logicInputs:Record<LogicGate,string[]>={INV:['A'],NAND2:['A0','A1'],NOR2:['A','B'],AND2:['A','B'],OR2:['A','B'],XOR2:['A','B'],XNOR2:['A','B'],MUX2:['A','B','S']};
export const logicGates=Object.keys(logicInputs) as LogicGate[];
export function logicPreview(gate:LogicGate,id:string,name:string,x:number,y:number,rotation:Device['rotation']=0,mirror=false,power={VPWR:'VPWR',VGND:'0'}):Device{
  const inputs=logicInputs[gate];
  return {id,name,kind:'block',cell_name:`RES_LOGIC_${gate}_v1`,pins:Object.fromEntries([...inputs,'Y','VPWR','VGND'].map(p=>[p,p==='VPWR'?power.VPWR:p==='VGND'?power.VGND:''])),pin_roles:Object.fromEntries([...inputs.map(p=>[p,'input']),['Y','output'],['VPWR','power'],['VGND','power']]),parameters:{},x,y,rotation,mirror};
}
export function connectionCommand(from:Device,fromPin:string,to:Device,toPin:string,id:string,order?:'x-first'|'y-first'):PinConnectionCommand{
  if(from.id===to.id&&fromPin===toPin)throw Error('다른 핀을 선택하세요.');
  const a=pinOffsets(from)[fromPin],b=pinOffsets(to)[toPin];
  if(!a||!b)throw Error('현재 revision에 존재하는 핀을 선택하세요.');
  const start:[number,number]=[from.x+a[0],from.y+a[1]],end:[number,number]=[to.x+b[0],to.y+b[1]];
  const points=[start,...pinBridge(start,end,order??(end[0]<start[0]?'y-first':'x-first'))];
  if(points.length<2)throw Error('겹친 핀은 소자 위치를 옮긴 뒤 연결하세요.');
  return {type:'connect_pins',id,from_device_id:from.id,from_pin:fromPin,to_device_id:to.id,to_pin:toPin,points};
}
