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
  else offsets={'+':[0,-44],'-':[0,44],'1':[0,-44],'2':[0,44],...(d.kind==='resistor'&&d.model?{B:[44,0] as Point}:{})};
  const rotation=d.rotation??0;
  return Object.fromEntries(Object.entries(offsets).map(([p,[x,y]])=>{if(d.mirror)x=-x;const point=rotation===90?[-y,x]:rotation===180?[-x,-y]:rotation===270?[y,-x]:[x,y];return [p,point.map(value=>value===0?0:value) as Point];}));
}
export function makePlacedDevice(kind:PlaceKind,devices:Device[],position:Point,id:string,rotation:Device['rotation']=0,mirror=false):Device{
  const prefix={resistor:'R',capacitor:'C',voltage:'V',current:'I',nmos:'MN',pmos:'MP',ground:'GND',port:'PORT'}[kind];
  let index=1;const names=new Set(devices.map(d=>d.name.toLowerCase()));while(names.has((prefix+index).toLowerCase()))index++;
  const sample=devices.find(d=>d.kind===kind),mos=kind==='nmos'||kind==='pmos';
  const pins:Record<string,string>=mos?{D:'',G:'',S:'',B:''}:kind==='ground'?{G:'0'}:kind==='port'?{P:prefix+index}:{'+':'','-':''};
  // Palette placement creates an ideal R/C unless a dedicated PDK symbol is
  // selected. Do not copy dimension fields while silently dropping its model.
  const parameters:Device['parameters']=sample&&(!(kind==='resistor'||kind==='capacitor')||!sample.model)?{...sample.parameters}:mos?{w_um:1,l_um:.15,nf:1,m:1}:kind==='resistor'?{value:1000}:kind==='capacitor'?{value:1e-12}:kind==='voltage'?{dc:1.8}:kind==='current'?{dc:.001}:{};
  return {id,name:prefix+index,kind,pins,parameters,x:position[0],y:position[1],rotation,mirror,...(mos?{model:sample?.model??(kind==='nmos'?'sky130_fd_pr__nfet_01v8':'sky130_fd_pr__pfet_01v8_hvt')}:{})};
}
export function orthogonalBridge(from:Point,to:Point,order:'x-first'|'y-first'):Point[]{
  if(from[0]===to[0]&&from[1]===to[1])return [];
  return from[0]===to[0]||from[1]===to[1]?[to]:[order==='x-first'?[to[0],from[1]]:[from[0],to[1]],to];
}
export function pinBridge(from:Point,to:Point,order:'x-first'|'y-first'):Point[]{
  if(from[0]===to[0]||from[1]===to[1])return orthogonalBridge(from,to,order);
  // A centre dogleg avoids running through the opposite terminal of common
  // vertical two-terminal symbols when connecting bottom-to-top pins.
  const mid=order==='x-first'?(from[0]+to[0])/2:(from[1]+to[1])/2;
  return order==='x-first'?[[mid,from[1]],[mid,to[1]],to]:[[from[0],mid],[to[0],mid],to];
}
export function engineeringValue(input:string,unit:'ohm'|'F'|'V'|'A'|'um'):number{
  const text=input.trim().replaceAll('μ','u').replaceAll('µ','u').replaceAll('Ω','ohm');
  const match=/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*(meg|[TGMkmunpf]?)\s*(ohms?|[FVA]|m)?$/.exec(text);
  if(!match)throw new Error('숫자와 공학 단위를 입력하세요. 예: 10k, 4.7nF, 1.8V, 0.65um');
  const prefix=match[2],suffix=match[3];
  if(unit==='um'){
    if(suffix&&suffix!=='m'||prefix&&!suffix)throw new Error('길이는 0.65, 0.65um, 650nm처럼 입력하세요.');
  }else if(suffix&&(unit==='ohm'?!/^ohms?$/.test(suffix):suffix!==unit))throw new Error(`이 값에는 ${unit==='ohm'?'Ω':unit} 단위가 필요합니다.`);
  const factor:Record<string,number>={'':1,T:1e12,G:1e9,M:1e6,meg:1e6,k:1e3,m:1e-3,u:1e-6,n:1e-9,p:1e-12,f:1e-15};
  const value=Number(match[1])*factor[prefix]*(unit==='um'&&suffix?1e6:1);
  if(!Number.isFinite(value))throw new Error('유한한 값이 필요합니다.');return value;
}
