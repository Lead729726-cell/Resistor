import test from 'node:test';import assert from 'node:assert/strict';
import {maskInRegion,selectionBox,mergeSelection} from '../packages/viewer/src/selection';
import {schematicRegion} from '../packages/ui/src/schematic-selection';
import type {SceneShape,Device} from '../packages/contracts/src/index';
const shape=(polygon:string[][],holes:string[][][]=[])=>( {id:'mask',layer_id:'68/20',cell_path:'test',polygon,holes} as SceneShape);
test('exact integer DBU masks distinguish containment, crossing, hole and boundary',()=>{
 const mask=shape([['0','0'],['100','0'],['100','100'],['0','100']],[ [['20','20'],['80','20'],['80','80'],['20','80']] ]);
 assert(maskInRegion(mask,selectionBox(['-1','-1'],['101','101']),true));assert(!maskInRegion(mask,selectionBox(['0','0'],['50','50']),true));
 assert(!maskInRegion(mask,selectionBox(['30','30'],['40','40']),false));assert(maskInRegion(mask,selectionBox(['0','10'],['0','15']),false));
 const triangle=shape([['0','0'],['100','0'],['0','100']]);assert(!maskInRegion(triangle,selectionBox(['80','80'],['90','90']),false));
});
test('selection does not round large coordinates or confuse reversed bounds',()=>{
 const n=90071992547409930n,mask=shape([[String(n),'0'],[String(n+5n),'0'],[String(n+5n),'5'],[String(n),'5']]);
 assert(maskInRegion(mask,selectionBox([String(n+6n),'6'],[String(n-1n),'-1']),true));
 assert(!maskInRegion(mask,selectionBox([String(n+6n),'0'],[String(n+7n),'5']),false));
});
test('replace/add/subtract/toggle preserve distinct stable IDs',()=>{assert.deepEqual(mergeSelection(['a'],['b','b'],'add'),['a','b']);assert.deepEqual(mergeSelection(['a','b'],['a'],'subtract'),['b']);assert.deepEqual(mergeSelection(['a','b'],['b','c'],'toggle'),['a','c']);assert.deepEqual(mergeSelection(['a'],[],'replace'),[]);});
test('schematic includes mixed items; a diagonal wire bbox is not a wire intersection',()=>{
 const d={id:'r',name:'R1',kind:'resistor',x:0,y:0,pins:{P:'a',N:'b'},parameters:{value:1000}} as Device;
 const wires=[{id:'w',points:[[-100,0],[100,0]] as [number,number][]},{id:'diagonal',points:[[0,0],[100,100]] as [number,number][]}];
 assert.deepEqual(schematicRegion([150,80],[-150,-80],[d],wires,[{id:'j',x:0,y:0}]).map(i=>i.id),['r','w','diagonal','j']);
 assert(!schematicRegion([90,10],[80,20],[],[wires[1]],[]).length);
 assert(!schematicRegion([-5,-5],[5,5],[d],[],[]).length);assert.equal(schematicRegion([5,5],[-5,-5],[d],[],[])[0].id,'r');
});
