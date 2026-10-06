import type {Device} from '@mos/contracts';
export type Point=[number,number];
export type PlaceKind=Exclude<Device['kind'],'block'>;
export const placementKinds:PlaceKind[]=['resistor','capacitor','voltage','current','nmos','pmos','ground','port'];
export const placementLabels:Record<PlaceKind,string>={resistor:'저항 / R',capacitor:'커패시터 / C',voltage:'전압원 / V',current:'전류원 / I',nmos:'NMOS',pmos:'PMOS',ground:'GND',port:'Port'};
export function symbolTransform(d:Device){return `rotate(${d.rotation??0}) scale(${d.mirror?-1:1} 1)`;}
export function pinOffsets(d:Device):Record<string,Point>{
  let offsets:Record<string,Point>;
  if(d.kind==='nmos'||d.kind==='pmos')offsets={D:[30,d.kind==='pmos'?42:-42],G:[-46,0],S:[30,d.kind==='pmos'?-42:42],B:[49,0]};
  else if(d.kind==='ground')offsets={G:[0,-30]};
  else if(d.kind==='port')offsets={P:[-30,0]};
  else if(d.kind==='block'){const pins=Object.keys(d.pins);offsets=Object.fromEntries(pins.map((p,i)=>[p,[-55,-(pins.length-1)*12+i*24]]));}
  else offsets={'+':[0,-44],'-':[0,44],'1':[0,-44],'2':[0,44]};
  const rotation=d.rotation??0;
  return Object.fromEntries(Object.entries(offsets).map(([p,[x,y]])=>{if(d.mirror)x=-x;const point=rotation===90?[-y,x]:rotation===180?[-x,-y]:rotation===270?[y,-x]:[x,y];return [p,point.map(value=>value===0?0:value) as Point];}));
}
export function makePlacedDevice(kind:PlaceKind,devices:Device[],position:Point,id:string,rotation:Device['rotation']=0,mirror=false):Device{
  const prefix={resistor:'R',capacitor:'C',voltage:'V',current:'I',nmos:'MN',pmos:'MP',ground:'GND',port:'PORT'}[kind];
  let index=1;const names=new Set(devices.map(d=>d.name.toLowerCase()));while(names.has((prefix+index).toLowerCase()))index++;
  const sample=devices.find(d=>d.kind===kind),mos=kind==='nmos'||kind==='pmos';
  const pins:Record<string,string>=mos?{D:'',G:'',S:'0',B:'0'}:kind==='ground'?{G:'0'}:kind==='port'?{P:''}:{'+':'','-':'0'};
  const parameters:Device['parameters']=sample?{...sample.parameters}:mos?{w_um:1,l_um:.15,nf:1,m:1}:kind==='resistor'?{value:1000}:kind==='capacitor'?{value:1e-12}:kind==='voltage'?{dc:1.8}:kind==='current'?{dc:.001}:{};
  return {id,name:prefix+index,kind,pins,parameters,x:position[0],y:position[1],rotation,mirror,...(mos?{model:sample?.model??(kind==='nmos'?'sky130_fd_pr__nfet_01v8':'sky130_fd_pr__pfet_01v8_hvt')}:{})};
}
export function orthogonalBridge(from:Point,to:Point,order:'x-first'|'y-first'):Point[]{
  if(from[0]===to[0]&&from[1]===to[1])return [];
  return from[0]===to[0]||from[1]===to[1]?[to]:[order==='x-first'?[to[0],from[1]]:[from[0],to[1]],to];
}
