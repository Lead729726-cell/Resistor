import test from 'node:test';import assert from 'node:assert/strict';
import type {Device} from '@mos/contracts';
import {createDeviceDraft,DeviceDraftStore,deviceDraftDirty,planDeviceDraft} from '../packages/ui/src/device-drafts';
const device:Device={id:'r1',name:'R1',kind:'resistor',pins:{'+':'IN','-':'0'},parameters:{value:1000,temp:25},x:0,y:0};
test('drafts retain independent input across device/cell/project selection and never share mutable state',()=>{
 const store=new DeviceDraftStore(),a=createDeviceDraft(device,7);a.parameters.value=1234;store.set('project-a/TOP',a);a.parameters.value=999;
 assert.equal(store.get('project-a/TOP','r1')?.parameters.value,1234);assert.equal(store.get('project-b/TOP','r1'),undefined);assert.equal(store.get('project-a/CHILD','r1'),undefined);
 const restored=store.get('project-a/TOP','r1')!;restored.pins['+']='changed';assert.equal(store.get('project-a/TOP','r1')?.pins['+'],'IN');store.delete('project-a/TOP','r1');assert.equal(store.get('project-a/TOP','r1'),undefined);
});
test('local edited fields merge with unrelated new server values instead of overwriting them',()=>{
 const d=createDeviceDraft(device,7);assert(!deviceDraftDirty(d));d.parameters.value=2000;assert(deviceDraftDirty(d));
 const current={...device,parameters:{value:1000,temp:80,extra:'new'},pins:{'+':'REMOTE','-':'0'}};
 const plan=planDeviceDraft(d,current);assert.deepEqual(plan.parameters,{value:2000,temp:80,extra:'new'});assert.deepEqual(plan.pins,current.pins);assert.equal(plan.conflicts.length,0);assert.equal(plan.pinChanges.length,0);
});
test('same-field conflicts are explicit and already-applied values can be retried without duplicate commands',()=>{
 const d=createDeviceDraft(device,7);d.parameters.value=2000;d.pins['+']='OUT';
 const conflict=planDeviceDraft(d,{...device,parameters:{...device.parameters,value:3000},pins:{...device.pins,'+':'NEW'}});assert.deepEqual(conflict.conflicts.map(c=>c.key),['value','+']);
 const partial=planDeviceDraft(d,{...device,parameters:{...device.parameters,value:2000}});assert(!partial.parametersChanged);assert.deepEqual(partial.pinChanges,[{pin:'+',net:'OUT'}]);assert.equal(partial.conflicts.length,0);
 assert.throws(()=>planDeviceDraft(d,{...device,id:'other'}),/다른 소자/);
});
