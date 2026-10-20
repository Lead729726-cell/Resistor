import test from 'node:test';
import assert from 'node:assert/strict';
import {deleteDesignKey,dispatchMenuHistory} from '../packages/ui/src/shortcuts';
import {resolveShortcut,shortcutDecision,nudgeVector,shortcutKeyLabel,shortcutDefinitions} from '../packages/shortcuts/src/index';
const key=(key:string,extra={})=>({key,ctrlKey:false,metaKey:false,altKey:false,...extra});
test('Mac Delete key is Backspace; modified text deletion never deletes circuit objects',()=>{
  assert(deleteDesignKey(key('Backspace'),true));assert(!deleteDesignKey(key('Backspace'),false));assert(deleteDesignKey(key('Delete'),false));
  for(const modifier of ['ctrlKey','metaKey','altKey'])assert(!deleteDesignKey(key('Backspace',{[modifier]:true}),true));
});
test('shortcut modifiers and canvas scope distinguish rectangle from rotation and shifted placement',()=>{
 assert.equal(resolveShortcut('layout',key('r'))?.id,'box');
 assert.equal(resolveShortcut('schematic',key('r'))?.id,'rotate');
 assert.equal(resolveShortcut('schematic',key('R',{shiftKey:true}))?.id,'mirror');
 assert.equal(resolveShortcut('schematic',key('r',{altKey:true}))?.id,'place_resistor');
 assert.equal(resolveShortcut('layout',key('p'))?.id,'route');
 assert.equal(resolveShortcut('layout',key('P',{shiftKey:true}))?.id,'polygon');
 for(const scope of ['layout','schematic'] as const){assert.equal(resolveShortcut(scope,key('d',{ctrlKey:true}))?.id,'deselect');assert.equal(resolveShortcut(scope,key('m'))?.id,'move');assert.equal(resolveShortcut(scope,key('i'))?.id,'instance');assert.equal(resolveShortcut(scope,key('q'))?.id,'properties');}
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
test('Ctrl+Z and U undo draft clicks before engine history; Backspace no longer undoes points',()=>{
 assert.equal(resolveShortcut('layout',key('Backspace')),null);
 assert.equal(resolveShortcut('layout',key('Backspace'),{drawing:true}),null);
 for(const scope of ['layout','schematic'] as const)for(const e of [key('z',{ctrlKey:true}),key('u')]){assert.equal(resolveShortcut(scope,e),null);assert.equal(resolveShortcut(scope,e,{drawing:true})?.id,'undo_point');assert.equal(resolveShortcut('global',e)?.id,'undo');}
 assert.equal(resolveShortcut('schematic',key('z',{metaKey:true}),{drawing:true,apple:true})?.id,'undo_point');
 assert.equal(resolveShortcut('schematic',key('Z',{ctrlKey:true,shiftKey:true}),{previewRedo:true})?.id,'redo_point');
 assert.equal(resolveShortcut('schematic',key('U',{shiftKey:true}),{drawing:true})?.id,'redo_point');
 assert.equal(resolveShortcut('schematic',key(' '),{drawing:true})?.id,'bend');
 assert.equal(resolveShortcut('schematic',key('Backspace',{ctrlKey:true}),{drawing:true}),null);
 assert.equal(resolveShortcut('global',key('Z',{ctrlKey:true,shiftKey:true}))?.id,'redo');
 assert.equal(resolveShortcut('global',key('y',{ctrlKey:true}))?.id,'redo');
 assert.equal(resolveShortcut('global',key('y',{ctrlKey:true}),{apple:true}),null);
 assert.equal(resolveShortcut('layout',key('+',{shiftKey:true}))?.id,'zoom_in');
 assert.equal(resolveShortcut('layout',key('='))?.id,'zoom_in');
 assert.equal(resolveShortcut('layout',key('-', {ctrlKey:true})),null);
});
test('pending/read-only preview claims history shortcuts so they cannot fall through to project undo',()=>{
 for(const scope of ['layout','schematic'] as const)for(const flags of [{pending:true},{readOnly:true}]){
   const c={...flags,drawing:true};assert.equal(resolveShortcut(scope,key('z',{ctrlKey:true}),c),null);const d=shortcutDecision(scope,key('z',{ctrlKey:true}),c);assert.equal(d?.action.id,'undo_point');assert.equal(d?.blocked,true);
 }
 assert.equal(shortcutDecision('layout',key('z',{ctrlKey:true}),{drawing:true,textEditing:true}),null);
});
test('native menu undo goes through the focused canvas and preserves text-field undo',()=>{
 const original=globalThis.KeyboardEvent;
 class Key extends Event{key:string;code:string;ctrlKey:boolean;metaKey:boolean;shiftKey:boolean;constructor(type:string,init:KeyboardEventInit){super(type,init);this.key=init.key!;this.code=init.code!;this.ctrlKey=!!init.ctrlKey;this.metaKey=!!init.metaKey;this.shiftKey=!!init.shiftKey;}}
 Object.assign(globalThis,{KeyboardEvent:Key});
 try{for(const apple of [false,true]){let calls=0;const target={closest:()=>true,dispatchEvent(e:Key){calls++;assert.equal(e.code,'KeyZ');assert.equal(e.metaKey,apple);assert.equal(e.ctrlKey,!apple);assert.equal(e.shiftKey,true);e.preventDefault();}} as unknown as Element;assert.equal(dispatchMenuHistory('redo',target,apple),true);assert.equal(calls,1);}assert.equal(dispatchMenuHistory('undo',null),false);assert.equal(dispatchMenuHistory('undo',{closest:()=>null} as unknown as Element),false);}
 finally{Object.assign(globalThis,{KeyboardEvent:original});}
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
