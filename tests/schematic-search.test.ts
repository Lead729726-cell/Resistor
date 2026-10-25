import test from 'node:test';
import assert from 'node:assert/strict';
import type {SchematicCell,Device} from '@mos/contracts';
import {schematicSearchIndex,searchSchematic,schematicSelectionViewport} from '../packages/ui/src/schematic-search';
import {resolveShortcut} from '../packages/shortcuts/src/index';

const device=(id:string,x=0,extra:Partial<Device>={}):Device=>({id,name:id.toUpperCase(),kind:'resistor',x,y:0,pins:{'+':'VDD','-':'0'},parameters:{value:1000},...extra});
const cell:SchematicCell={devices:[device('r1'),device('mn_far',10000,{kind:'nmos',name:'입력 소자',model:'sky130_nfet',pins:{D:'OUT',G:'IN',S:'0',B:'0'}})],
 wires:[{id:'out_wire',net:'OUT',points:[[10000,42],[12000,42]]}],junctions:[{id:'j1',net:'OUT',x:12000,y:42},{id:'unlabeled',x:10,y:10}]};

test('current-cell index finds names, IDs, models, pin/net names and combined terms without mutation',()=>{
 const before=JSON.stringify(cell),index=schematicSearchIndex(cell);
 for(const query of ['입력','MN_FAR','sky130','nfet OUT','G IN'])assert(searchSchematic(index,query,'device').entries.some(entry=>entry.items[0].id==='mn_far'),query);
 assert.equal(searchSchematic(index,'r1','device').total,1);
 assert.equal(searchSchematic(index,'unfindable','all').total,0);
 assert.equal(JSON.stringify(cell),before);
});
test('net search retains exact labels and mixed items, deduplicates multi-terminal devices, includes ground zero',()=>{
 const index=schematicSearchIndex(cell),out=searchSchematic(index,'OUT','net').entries[0];
 assert.deepEqual(out.items,[{kind:'device',id:'mn_far'},{kind:'wire',id:'out_wire'},{kind:'junction',id:'j1'}]);
 assert.equal(searchSchematic(index,'0','net').entries[0].items.length,2);
 assert(!index.some(entry=>entry.key==='net:'));
 const distinct=schematicSearchIndex({devices:[device('a',0,{pins:{'1':'OUT','2':'out'}})]});
 assert.equal(searchSchematic(distinct,'out','net').total,2,'case-insensitive search never merges distinct source net names');
});
test('bounded large-cell search reports full count and normalizes Korean/full-width characters',()=>{
 const index=schematicSearchIndex({devices:Array.from({length:1000},(_,i)=>device('R'+i))});
 assert.equal(searchSchematic(index,'','device').total,1000);
 assert.equal(searchSchematic(index,'','device').entries.length,40);
 assert.equal(searchSchematic(index,'Ｒ１２','device').entries[0].label,'R12');
 assert.equal(searchSchematic(index,'','device',500).entries.length,200);
 assert.equal(searchSchematic(index,'','device',-1).entries.length,0);
});
test('selection fit includes mixed geometry and transformed pins, excludes distant unselected devices',()=>{
 const bounds=schematicSelectionViewport(cell,[{kind:'device',id:'mn_far'},{kind:'wire',id:'out_wire'},{kind:'junction',id:'j1'}])!;
 assert(bounds.left>9000);assert(bounds.left+bounds.width>=12000);assert(bounds.top<=0&&bounds.top+bounds.height>=42);
 const rotated=schematicSelectionViewport({devices:[device('rot',0,{rotation:90,mirror:true})]},[{kind:'device',id:'rot'}])!;
 assert(rotated.left< -44 &&rotated.left+rotated.width>44);
 assert.equal(schematicSelectionViewport(cell,[]),null);
 assert.equal(schematicSelectionViewport(cell,[{kind:'device',id:'deleted'}]),null);
});
test('finder and fit selection are read-only canvas shortcuts; browser text search and IME remain intact',()=>{
 for(const apple of [false,true])assert.equal(resolveShortcut('schematic',{key:'f',ctrlKey:!apple,metaKey:apple},{apple,readOnly:true})?.id,'find');
 assert.equal(resolveShortcut('schematic',{key:'F',shiftKey:true},{readOnly:true})?.id,'fit_selection');
 assert.equal(resolveShortcut('schematic',{key:'f',ctrlKey:true},{textEditing:true}),null);
 assert.equal(resolveShortcut('schematic',{key:'f',ctrlKey:true,isComposing:true}),null);
 assert.equal(resolveShortcut('layout',{key:'f',ctrlKey:true}),null);
});
