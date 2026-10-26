import test from 'node:test';import assert from 'node:assert/strict';
import type {SceneShape} from '@mos/contracts';
import {layoutSelectionBounds} from '../src/selection';
import {resolveShortcut,shortcutDecision} from '../../shortcuts/src/index';
const shape=(id:string,x:bigint,y=0n):SceneShape=>({id,layer_id:'68/20',cell_path:'TOP',polygon:[[String(x),String(y)],[String(x+5n),String(y)],[String(x+5n),String(y+10n)],[String(x),String(y+10n)]]});
test('selection fit bounds preserve integers beyond Number safe range and ignore unselected geometry',()=>{
 const x=9007199254740993123n,shapes=[shape('a',x,-12n),shape('b',x+100n,5n),shape('outside',-999999999999999999n)];
 const before=JSON.stringify(shapes);assert.deepEqual(layoutSelectionBounds(shapes,['b','a','a'])?.bbox,[String(x),'-12',String(x+105n),'15']);assert.equal(JSON.stringify(shapes),before);
});
test('selection fit never invents missing unloaded geometry or an empty origin bbox',()=>{
 assert.equal(layoutSelectionBounds([shape('a',0n)],['unloaded']),null);assert.equal(layoutSelectionBounds([],[]),null);
 assert.deepEqual(layoutSelectionBounds([shape('a',0n)],['a','unloaded'])?.ids,['a']);
});
test('layout selection fit is a non-mutating shortcut available in read-only mode',()=>{
 assert.equal(resolveShortcut('layout',{key:'F',shiftKey:true},{readOnly:true})?.id,'fit_selection');
 assert.equal(shortcutDecision('layout',{key:'r'},{readOnly:true})?.blocked,true);
 assert.equal(resolveShortcut('layout',{key:'F',shiftKey:true},{textEditing:true}),null);
});
