import test from 'node:test';
import assert from 'node:assert/strict';
import {deleteDesignKey} from '../packages/ui/src/shortcuts';
import {resolveShortcut,nudgeVector,shortcutKeyLabel,shortcutDefinitions} from '../packages/shortcuts/src/index';
const key=(key:string,extra={})=>({key,ctrlKey:false,metaKey:false,altKey:false,...extra});
test('Mac Delete key is Backspace; modified text deletion never deletes circuit objects',()=>{
  assert(deleteDesignKey(key('Backspace'),true));assert(!deleteDesignKey(key('Backspace'),false));assert(deleteDesignKey(key('Delete'),false));
  for(const modifier of ['ctrlKey','metaKey','altKey'])assert(!deleteDesignKey(key('Backspace',{[modifier]:true}),true));
});
test('shortcut modifiers and canvas scope distinguish rectangle from rotation and shifted placement',()=>{
 assert.equal(resolveShortcut('layout',key('r'))?.id,'box');
 assert.equal(resolveShortcut('schematic',key('r'))?.id,'rotate');
 assert.equal(resolveShortcut('schematic',key('R',{shiftKey:true}))?.id,'place_resistor');
 assert.equal(resolveShortcut('global',key('1',{altKey:true}))?.id,'tab_schematic');
 assert.equal(resolveShortcut('global',key('¡',{altKey:true,code:'Digit1'}),{apple:true})?.id,'tab_schematic');
 assert.equal(resolveShortcut('global',key('s',{ctrlKey:true}))?.id,'save');
 assert.equal(resolveShortcut('global',key('s',{metaKey:true}),{apple:true})?.id,'save');
 assert.equal(resolveShortcut('global',key('s',{ctrlKey:true}),{apple:true}),null);
 assert.equal(resolveShortcut('layout',key('f',{ctrlKey:true})),null);
});
test('IME, repeat, dialogs, text fields and read-only mode never invoke destructive design keys',()=>{
 for(const flags of [{isComposing:true},{repeat:true}])assert.equal(resolveShortcut('layout',key('r',flags)),null);
 for(const c of [{textEditing:true},{modalOpen:true},{readOnly:true},{pending:true}])assert.equal(resolveShortcut('layout',key('r'),c),null);
 assert.equal(resolveShortcut('global',key('z',{ctrlKey:true}),{textEditing:true}),null);
 assert.equal(resolveShortcut('global',key('?'),{textEditing:true}),null);
 assert.equal(resolveShortcut('global',key('F1'),{textEditing:true})?.id,'help');
 assert.equal(resolveShortcut('global',key('s',{ctrlKey:true}),{textEditing:true})?.id,'save');
 assert.equal(resolveShortcut('layout',key('f'),{readOnly:true})?.id,'fit');
});
test('drawing Backspace and Space are contextual; native text undo and browser Ctrl shortcuts stay separate',()=>{
 assert.equal(resolveShortcut('layout',key('Backspace')),null);
 assert.equal(resolveShortcut('layout',key('Backspace'),{drawing:true})?.id,'undo_point');
 assert.equal(resolveShortcut('schematic',key(' '),{drawing:true})?.id,'bend');
 assert.equal(resolveShortcut('schematic',key('Backspace',{ctrlKey:true}),{drawing:true}),null);
 assert.equal(resolveShortcut('global',key('Z',{ctrlKey:true,shiftKey:true}))?.id,'redo');
 assert.equal(resolveShortcut('global',key('y',{ctrlKey:true}))?.id,'redo');
 assert.equal(resolveShortcut('global',key('y',{ctrlKey:true}),{apple:true}),null);
 assert.equal(resolveShortcut('layout',key('+',{shiftKey:true}))?.id,'zoom_in');
 assert.equal(resolveShortcut('layout',key('='))?.id,'zoom_in');
 assert.equal(resolveShortcut('layout',key('-', {ctrlKey:true})),null);
});
test('nudge distances preserve the project grid and display platform-specific key names',()=>{
 assert.deepEqual(nudgeVector('ArrowLeft',false,5),[-5,0]);
 assert.deepEqual(nudgeVector('ArrowUp',true,5),[0,50]);
 assert.deepEqual(nudgeVector('ArrowDown',true,10),[0,-100]);
 assert.equal(shortcutKeyLabel('Primary+Shift+Z',true),'⌘+⇧+Z');
 assert.equal(shortcutKeyLabel('Alt+2',true),'⌥+2');
});
test('every displayed binding resolves to its documented action without collisions',()=>{
 const events=(combo:string)=>{
  if(combo==='?')return key('?',{shiftKey:true});if(combo==='+')return key('+',{shiftKey:true});
  const tokens=combo.split('+'),k=tokens.pop()!;return key(k==='Arrows'?'ArrowRight':k==='Space'?' ':k.length===1?k.toLowerCase():k,{ctrlKey:tokens.includes('Primary')||tokens.includes('Ctrl'),shiftKey:tokens.includes('Shift'),altKey:tokens.includes('Alt')});
 };
 for(const d of shortcutDefinitions)for(const combo of d.keys)assert.equal(resolveShortcut(d.scope,events(combo),{drawing:true})?.id,d.id,`${d.scope} ${combo}`);
});
test('block placement B is canvas-only and preserves IME, text editing and read-only guards',()=>{
 assert.equal(resolveShortcut('schematic',key('b'))?.id,'block_palette');
 assert.equal(resolveShortcut('layout',key('b')),null);
 for(const c of [{textEditing:true},{modalOpen:true},{readOnly:true},{pending:true}])assert.equal(resolveShortcut('schematic',key('b'),c),null);
 assert.equal(resolveShortcut('schematic',key('Process',{isComposing:true,code:'KeyB'})),null);
});
