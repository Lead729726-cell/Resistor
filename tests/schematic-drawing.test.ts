import test from 'node:test';
import assert from 'node:assert/strict';
import {makePlacedDevice,pinOffsets,orthogonalBridge} from '../packages/ui/src/schematic-drawing';
import {isLocalWorkbench} from '../packages/contracts/src/index';
test('local workstation routing keeps desktop/dev local and public hosting behind cloud auth',()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'location');
  try{for(const [protocol,hostname,port,expected] of [['file:','','',true],['http:','127.0.0.1','5173',true],['https:','example.com','5173',false],['http:','127.0.0.1','18766',false]] as const){Object.defineProperty(globalThis,'location',{value:{protocol,hostname,port},configurable:true});assert.equal(isLocalWorkbench(),expected);}}
  finally{if(descriptor)Object.defineProperty(globalThis,'location',descriptor);else Reflect.deleteProperty(globalThis,'location');}
});
test('horizontal resistor terminals retain polarity after clockwise rotation',()=>{
  const d=makePlacedDevice('resistor',[],[100,200],'r',90);
  assert.deepEqual(pinOffsets(d)['+'],[44,0]);assert.deepEqual(pinOffsets(d)['-'],[-44,0]);
  assert.equal(d.parameters.value,1000);assert.deepEqual(d.pins,{'+':'','-':'0'});
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
