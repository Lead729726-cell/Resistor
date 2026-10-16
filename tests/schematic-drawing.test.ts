import test from 'node:test';
import assert from 'node:assert/strict';
import {makePlacedDevice,pinOffsets,orthogonalBridge,pinBridge,engineeringValue} from '../packages/ui/src/schematic-drawing';
import {isLocalWorkbench} from '../packages/contracts/src/index';
import {logicPreview,connectionCommand} from '../packages/ui/src/logic-composition';
test('local workstation routing keeps desktop/dev local and public hosting behind cloud auth',()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'location');
  try{for(const [protocol,hostname,port,expected] of [['file:','','',true],['http:','127.0.0.1','5173',true],['https:','example.com','5173',false],['http:','127.0.0.1','18766',false]] as const){Object.defineProperty(globalThis,'location',{value:{protocol,hostname,port},configurable:true});assert.equal(isLocalWorkbench(),expected);}}
  finally{if(descriptor)Object.defineProperty(globalThis,'location',descriptor);else Reflect.deleteProperty(globalThis,'location');}
});
test('horizontal resistor terminals retain polarity after clockwise rotation',()=>{
  const d=makePlacedDevice('resistor',[],[100,200],'r',90);
  assert.deepEqual(pinOffsets(d)['+'],[44,0]);assert.deepEqual(pinOffsets(d)['-'],[-44,0]);
  assert.equal(d.parameters.value,1000);assert.deepEqual(d.pins,{'+':'','-':''});
});

test('role-aware gate terminals match native coordinates in every orientation; legacy blocks keep their coordinates',()=>{
  const d=logicPreview('INV','u','U1',200,200);
  assert.deepEqual(pinOffsets(d),{A:[-55,0],Y:[73,0],VPWR:[10,-68],VGND:[10,68]});
  assert.deepEqual(pinOffsets({...d,rotation:90,mirror:true}),{A:[0,55],Y:[0,-73],VPWR:[68,-10],VGND:[-68,-10]});
  assert.deepEqual(pinOffsets({...d,pin_roles:undefined}),{A:[-55,-36],Y:[-55,-12],VPWR:[-55,12],VGND:[-55,36]});
  const nand=logicPreview('NAND2','n','U2',400,300);assert.deepEqual(Object.keys(nand.pins),['A0','A1','Y','VPWR','VGND']);
  assert.equal(nand.pins.A0,'');assert.equal(nand.pins.VGND,'0');
});

test('output-to-input helper uses actual transformed terminals and does not invent a net or merge existing names',()=>{
  const from=logicPreview('AND2','u1','U1',400,250),to=logicPreview('INV','u2','U2',700,300,90,true);
  from.pins.Y='MID';to.pins.A='OTHER';const cmd=connectionCommand(from,'Y',to,'A','wire');
  assert.deepEqual(cmd.points[0],[473,250]);assert.deepEqual(cmd.points.at(-1),[700,355]);assert.equal(cmd.net,undefined);
  assert.equal(from.pins.Y,'MID');assert.equal(to.pins.A,'OTHER');
  assert.throws(()=>connectionCommand(from,'missing',to,'A','bad'));assert.throws(()=>connectionCommand(from,'Y',from,'Y','same'));
});
test('new devices do not invent ground connections; only ground symbols name node zero',()=>{
  assert.deepEqual(makePlacedDevice('pmos',[],[0,0],'p').pins,{D:'',G:'',S:'',B:''});
  assert.deepEqual(makePlacedDevice('ground',[],[0,0],'g').pins,{G:'0'});
  assert.equal(makePlacedDevice('port',[],[0,0],'port').pins.P,'PORT1');
});
test('engineering values preserve scale, sign, units and micrometre dimensions',()=>{
  assert.equal(engineeringValue('10kΩ','ohm'),10000);assert.equal(engineeringValue('1M','ohm'),1e6);
  assert.ok(Math.abs(engineeringValue('4.7nF','F')-4.7e-9)<1e-21);assert.equal(engineeringValue('-2mA','A'),-.002);
  assert.equal(engineeringValue('1.8V','V'),1.8);assert.ok(Math.abs(engineeringValue('650nm','um')-.65)<1e-14);assert.equal(engineeringValue('0.65µm','um'),.65);
  for(const [value,unit]of [['10kV','ohm'],['1nA','F'],['650n','um'],['NaN','F'],['1/2','V']] as const)assert.throws(()=>engineeringValue(value,unit));
});
test('MOS mirror then rotation gives exact gate, drain, source and bulk geometry',()=>{
  const d=makePlacedDevice('nmos',[],[0,0],'n',90,true);
  assert.deepEqual(pinOffsets(d),{D:[42,-30],G:[0,46],S:[-42,-30],B:[0,-49]});
  assert.equal(d.model,'sky130_fd_pr__nfet_01v8');
});
test('placement after deletion uses an unused case-insensitive name and independent SI parameters',()=>{
  const sample=makePlacedDevice('capacitor',[],[0,0],'c');sample.name='c2';sample.parameters.value=2.2e-9;
  const d=makePlacedDevice('capacitor',[sample],[10,20],'new');assert.equal(d.name,'C1');assert.equal(d.parameters.value,2.2e-9);
  d.parameters.value=3.3e-9;assert.equal(sample.parameters.value,2.2e-9);
});
test('wire bend order retains endpoints and supports exact off-grid symbol pins',()=>{
  assert.deepEqual(orthogonalBridge([144,200],[260,316],'x-first'),[[260,200],[260,316]]);
  assert.deepEqual(orthogonalBridge([144,200],[260,316],'y-first'),[[144,316],[260,316]]);
  assert.deepEqual(orthogonalBridge([144,200],[144,200],'x-first'),[]);
});

test('automatic pin route bends between devices rather than across the opposite resistor pin',()=>{
  const end:[number,number]=[300,144];
  const route=pinBridge([100,56],end,'x-first');
  assert.deepEqual(route,[[200,56],[200,144],end]);
  assert.deepEqual(pinBridge([100,56],[100,56],'x-first'),[]);
});
import {blockPlacementReason,makePlacedBlock} from '../packages/ui/src/schematic-blocks';

test('hierarchical placement preserves ports, snaps once, uses unique names and rejects recursive or missing cells',()=>{
 const cells={leaf:{ports:['IN','OUT','VDD','VSS'],devices:[]},parent:{ports:[],devices:[{id:'b',name:'X1',kind:'block' as const,cell_name:'leaf',pins:{},parameters:{},x:0,y:0}]}};
 assert.equal(blockPlacementReason(cells,'leaf','parent'),null);
 assert.match(blockPlacementReason(cells,'parent','leaf')!,/순환/);
 assert.match(blockPlacementReason(cells,'leaf','leaf')!,/순환/);
 assert.match(blockPlacementReason(cells,'missing',null)!,/찾을 수/);
 const d=makePlacedBlock('leaf',cells.leaf,[],[123,-46],'preview',90,true);
 assert.equal(d.x,120);assert.equal(d.y,-50);assert.equal(d.rotation,90);assert.equal(d.mirror,true);assert.equal(d.cell_name,'leaf');
 assert.deepEqual(d.pins,{IN:'',OUT:'',VDD:'',VSS:''});assert.ok(!d.pin_roles);
 const duplicate=makePlacedBlock('leaf',cells.leaf,[{...d,name:'xLEAF_1'}],[0,0],'second');assert.equal(duplicate.name,'Xleaf_2');
 assert.deepEqual(cells.leaf.devices,[]);assert.throws(()=>makePlacedBlock('leaf',cells.leaf,[],[Infinity,0],'bad'));
 const cyclic={a:{devices:[{...d,cell_name:'b'}]},b:{devices:[{...d,cell_name:'a'}]}};assert.match(blockPlacementReason(cyclic,'a',null)!,/순환/);
});
