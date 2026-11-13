import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {build} from 'esbuild';
const require=createRequire(import.meta.url);
const compiled=await build({stdin:{contents:"export {default as Boundary} from './packages/ui/src/OnlineAccessBoundary';export {configureOnlineAccess,requireOnlineAccess,onlineAccessStorageKey} from './packages/contracts/src/online-access';",resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'node',loader:{'.css':'empty'},external:['react','react/jsx-runtime'],define:{__RESISTOR_EDITION__:'"edu"'}});
const nodes=tree=>Array.isArray(tree)?tree.flatMap(nodes):tree&&typeof tree==='object'?[tree,...nodes(tree.props?.children)]:[];
const text=tree=>Array.isArray(tree)?tree.map(text).join(''):tree&&typeof tree==='object'?text(tree.props?.children):tree==null||typeof tree==='boolean'?'':String(tree);
const button=(tree,label)=>nodes(tree).find(node=>node.type==='button'&&text(node)===label);
function fixture({enabled=true,storageFails=false}={}){
 const slots=[],effects=[],storage=new Map(),frames=new Map(),timers=new Map(),observers=new Set(),focusListeners=new Set();let cursor=0,focusReturns=0,networkCalls=0,frameId=0,timerId=0;
 class Element{isConnected=true;disabled=false;tagName='BUTTON';getClientRects(){return [{}];}matches(){return this.disabled;}contains(target){return target===this;}focus(){focusReturns++;document.activeElement=this;for(const listener of focusListeners)listener();}}
 const trigger=new Element(),body=new Element();body.tagName='BODY';
 const document={body,activeElement:trigger,querySelectorAll:()=>[],addEventListener:(name,fn)=>{if(name==='focusin')focusListeners.add(fn);},removeEventListener:(name,fn)=>focusListeners.delete(fn)};
 const nativeDialog={open:false,tagName:'DIALOG',contains:()=>true,showModal(){this.open=true;document.activeElement=this;},close(){this.open=false;document.activeElement=body;}};
 class Observer{constructor(callback){this.callback=callback;}observe(){observers.add(this);}disconnect(){observers.delete(this);}}
 const hooks={...require('react'),useState(initial){const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return [slots[index],value=>slots[index]=typeof value==='function'?value(slots[index]):value];},useRef(initial){return slots[cursor++]??={current:initial};},useEffect(effect,deps){const index=cursor++,previous=slots[index];if(!previous||deps.some((v,i)=>!Object.is(v,previous.deps[i]))){previous?.cleanup?.();slots[index]={deps,cleanup:null};effects.push(()=>slots[index].cleanup=effect());}}};
 const module={exports:{}};
 runInNewContext(compiled.outputFiles[0].text,{module,exports:module.exports,Event,Error,HTMLElement:Element,MutationObserver:Observer,setTimeout:callback=>{timers.set(++timerId,callback);return timerId;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:callback=>{frames.set(++frameId,callback);return frameId;},cancelAnimationFrame:id=>frames.delete(id),document,window:{dispatchEvent(){}},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>{if(storageFails)throw Error('Synthetic storage blocked');storage.set(key,value);}},fetch:async()=>{networkCalls++;throw Error('No external call expected');},require:name=>name==='react'?hooks:require(name)});
 const api=module.exports;api.configureOnlineAccess({edition:enabled?'edu':'indust',host:'browser'});
 const render=()=>{cursor=0;const tree=api.Boundary({children:'existing-workspace-and-draft',enabled});for(const node of nodes(tree))if(node.type==='dialog')node.props.ref.current=nativeDialog;while(effects.length)effects.shift()();return tree;};
 const settle=async()=>{await new Promise(setImmediate);return render();};const unmount=()=>{for(const slot of slots)slot?.cleanup?.();};
 const frame=()=>{const pending=[...frames.values()];frames.clear();for(const callback of pending)callback();};
 const mutate=()=>{for(const observer of [...observers])observer.callback();};
 const focusElsewhere=()=>{document.activeElement=new Element();for(const listener of [...focusListeners])listener();};
 const expire=()=>{for(const callback of [...timers.values()])callback();};
 return {api,render,settle,unmount,storage,nativeDialog,trigger,frame,mutate,focusElsewhere,expire,setActiveElement:value=>{document.activeElement=value==='trigger'?trigger:body;for(const listener of [...focusListeners])listener();},observing:()=>observers.size,focusReturns:()=>focusReturns,networkCalls:()=>networkCalls};
}

test('local work opens immediately; silent background checks neither display a dialog nor send a request',async()=>{
 const f=fixture();let tree=f.render();assert(text(tree).includes('existing-workspace-and-draft'));assert.equal(f.nativeDialog.open,false);assert.equal(f.storage.size,0);
 await assert.rejects(f.api.requireOnlineAccess({prompt:false}),{code:'ONLINE_AGE_CONFIRMATION_REQUIRED'});tree=await f.settle();assert.equal(f.nativeDialog.open,false);assert.equal(f.networkCalls(),0);assert(text(tree).includes('existing-workspace-and-draft'));f.unmount();
});

test('a deliberate action waits before transmission; cancellation and Escape preserve work and reset the unchecked prompt',async()=>{
 const f=fixture();f.render();let sent=0;const waiting=f.api.requireOnlineAccess().then(()=>sent++,error=>error.code);let tree=await f.settle();assert.equal(f.nativeDialog.open,true);assert.equal(nodes(tree).find(node=>node.type==='input').props.checked,false);assert.equal(button(tree,'확인하고 계속').props.disabled,true);assert.equal(sent,0);
 nodes(tree).find(node=>node.type==='input').props.onChange({target:{checked:true}});tree=f.render();f.trigger.disabled=true;button(tree,'취소').props.onClick();tree=f.render();assert.equal(await waiting,'ONLINE_ACCESS_CANCELLED');assert.equal(f.storage.size,0);assert.equal(sent,0);assert.equal(f.nativeDialog.open,false);assert.equal(f.focusReturns(),0);f.trigger.disabled=false;f.frame();assert.equal(f.focusReturns(),1);assert(text(tree).includes('existing-workspace-and-draft'));
 const again=f.api.requireOnlineAccess().catch(error=>error.code);tree=await f.settle();assert.equal(nodes(tree).find(node=>node.type==='input').props.checked,false);let stopped=false;nodes(tree).find(node=>node.type==='dialog').props.onCancel({preventDefault(){},stopPropagation(){stopped=true;}});f.render();assert.equal(await again,'ONLINE_ACCESS_CANCELLED');assert.equal(stopped,true);f.unmount();
});

test('a delayed old close event cannot cancel a new request or restore focus into its background',async()=>{
 const f=fixture();f.render();const first=f.api.requireOnlineAccess().catch(error=>error.code);let tree=await f.settle();button(tree,'취소').props.onClick();f.render();assert.equal(await first,'ONLINE_ACCESS_CANCELLED');
 const second=f.api.requireOnlineAccess().catch(error=>error.code);tree=await f.settle();assert.equal(f.nativeDialog.open,true);nodes(tree).find(node=>node.type==='dialog').props.onClose({currentTarget:f.nativeDialog});tree=f.render();f.frame();assert.equal(f.nativeDialog.open,true);assert.equal(f.focusReturns(),0);button(tree,'취소').props.onClick();f.render();assert.equal(await second,'ONLINE_ACCESS_CANCELLED');f.unmount();f.frame();assert.equal(f.focusReturns(),0);
});

test('delayed host cleanup restores focus on re-enable, but respects user focus and the bounded timeout',async()=>{
 for(const mode of ['enable','user-focus','timeout']){
  const f=fixture();f.render();const pending=f.api.requireOnlineAccess().catch(error=>error.code);let tree=await f.settle();f.trigger.disabled=true;button(tree,'취소').props.onClick();f.render();assert.equal(await pending,'ONLINE_ACCESS_CANCELLED');f.frame();assert.equal(f.focusReturns(),0);assert.equal(f.observing(),1);
  if(mode==='user-focus')f.focusElsewhere();if(mode==='timeout')f.expire();
  f.trigger.disabled=false;f.mutate();f.frame();assert.equal(f.focusReturns(),mode==='enable'?1:0);assert.equal(f.observing(),0);f.unmount();
 }
});

test('a transient browser focus on the still-disabled origin does not end restoration before host cleanup',async()=>{
 const f=fixture();f.render();const pending=f.api.requireOnlineAccess().catch(error=>error.code);const tree=await f.settle();f.trigger.disabled=true;button(tree,'취소').props.onClick();f.render();assert.equal(await pending,'ONLINE_ACCESS_CANCELLED');
 f.setActiveElement('trigger');f.frame();assert.equal(f.observing(),1);assert.equal(f.focusReturns(),0);
 f.setActiveElement('body');f.trigger.disabled=false;f.mutate();f.frame();assert.equal(f.focusReturns(),1);assert.equal(f.observing(),0);f.unmount();
});

test('explicit checked confirmation persists once and continues only the waiting original action',async()=>{
 const f=fixture();f.render();let sent=0;const waiting=f.api.requireOnlineAccess().then(()=>sent++);let tree=await f.settle();
 await assert.rejects(f.api.requireOnlineAccess(),{code:'ONLINE_ACCESS_CANCELLED'});assert.equal(sent,0);
 nodes(tree).find(node=>node.type==='input').props.onChange({target:{checked:true}});tree=f.render();button(tree,'확인하고 계속').props.onClick();await waiting;tree=await f.settle();assert.equal(sent,1);assert.equal(f.nativeDialog.open,false);assert(text(tree).includes('existing-workspace-and-draft'));
 const saved=JSON.parse(f.storage.get(f.api.onlineAccessStorageKey('edu')));assert.equal(saved.age_14_or_over,true);assert.equal(saved.policy_version,'2026-11-13');assert.deepEqual(Object.keys(saved).sort(),['acknowledged_at','age_14_or_over','edition','policy_version','schema_version']);
 await f.api.requireOnlineAccess();assert.equal(f.nativeDialog.open,false);f.unmount();
});

test('persistence failures do not continue the action; unmount cancels pending work, Industry has no new prompt',async()=>{
 const f=fixture({storageFails:true});f.render();let sent=0;const waiting=f.api.requireOnlineAccess().then(()=>sent++,error=>error.code);let tree=await f.settle();nodes(tree).find(node=>node.type==='input').props.onChange({target:{checked:true}});tree=f.render();button(tree,'확인하고 계속').props.onClick();tree=await f.settle();assert.equal(f.nativeDialog.open,true);assert(text(tree).includes('저장하지 못했습니다'));assert.equal(sent,0);assert(text(tree).includes('existing-workspace-and-draft'));f.unmount();assert.equal(await waiting,'ONLINE_ACCESS_CANCELLED');
 const industry=fixture({enabled:false});assert.equal(text(industry.render()),'existing-workspace-and-draft');await industry.api.requireOnlineAccess();assert.equal(industry.storage.size,0);assert.equal(industry.networkCalls(),0);industry.unmount();
});
