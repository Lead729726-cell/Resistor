import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {build} from 'esbuild';

const require=createRequire(import.meta.url);
const source=await build({entryPoints:['packages/ui/src/LicenseGate.tsx'],bundle:true,write:false,format:'cjs',platform:'node',loader:{'.css':'empty'},external:['react','react/jsx-runtime','@mos/contracts'],define:{__RESISTOR_EDITION__:'"edu"'}});

// Exercise the real component's state/events without a browser or licensing server.
// Native dialog focus and inert behavior are separately checked in browser QA.
function fixture({edition='edu',authorized=true,local=true}={}){
 const slots=[],effects=[],listeners=new Map(),calls=[],events=[],timers=[];let cursor=0,pendingRefresh=null;
 const status={edition,authorized,state:authorized?'online_valid':'not_activated',message:'Fixture only',device_limit:2,server_configured:true};
 const hooks={...require('react'),
  useState(initial){const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return [slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value;}];},
  useRef(initial){const index=cursor++;return slots[index]??=( {current:initial});},
  useEffect(effect,deps){const index=cursor++,prior=slots[index];if(!prior||deps.some((value,i)=>!Object.is(value,prior.deps[i]))){prior?.cleanup?.();slots[index]={deps,cleanup:null};effects.push(()=>{slots[index].cleanup=effect();});}},
 };
 const window={
  addEventListener(name,handler){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(handler);},
  removeEventListener(name,handler){listeners.get(name)?.delete(handler);},
  dispatchEvent(event){events.push(event.type);for(const handler of listeners.get(event.type)||[])handler(event);},
  confirm(){throw Error('No destructive confirmation expected in presentation QA');},
 };
 const module={exports:{}};
 runInNewContext(source.outputFiles[0].text,{module,exports:module.exports,Event,window,
  setInterval:callback=>{timers.push(callback);return timers.length;},clearInterval:()=>{},require:name=>name==='react'?hooks:name==='@mos/contracts'?{isLocalWorkbench:()=>local,localRpc:async(method,params)=>{calls.push({method,params});return method==='license.refresh'&&pendingRefresh?pendingRefresh:{...status};}}:require(name),
 });
 const render=()=>{cursor=0;const tree=module.exports.default({children:'retained-workspace'});while(effects.length)effects.shift()();return tree;};
 const boot=async()=>{render();await new Promise(setImmediate);return render();};
 const poll=async patch=>{Object.assign(status,patch);for(const callback of timers)callback();await new Promise(setImmediate);return render();};
 const deferRefresh=()=>{let finish;pendingRefresh=new Promise(resolve=>{finish=resolve;});return async()=>{finish({...status});await new Promise(setImmediate);return render();};};
 return {render,boot,poll,deferRefresh,window,calls,events,visibility:module.exports.licenseGateVisibility};
}
function nodes(tree){
 if(Array.isArray(tree))return tree.flatMap(nodes);
 if(!tree||typeof tree!=='object')return [];
 return [tree,...nodes(tree.props?.children)];
}
const text=tree=>Array.isArray(tree)?tree.map(text).join(''):tree&&typeof tree==='object'?text(tree.props?.children):tree==null?'':String(tree);
const button=(tree,label)=>nodes(tree).find(node=>node.type==='button'&&text(node)===label);

test('Edu settings entry preserves the serial draft and only returns to settings after an explicit authenticated close',async()=>{
 const f=fixture();let tree=await f.boot();
 assert.equal(nodes(tree).some(node=>node.props?.className==='license-manage'),false);
 f.window.dispatchEvent(new Event('resistor:license-open'));tree=f.render();
 const input=nodes(tree).find(node=>node.type==='input');input.props.onChange({target:{value:'QA_DRAFT_NEVER_SENT'}});tree=f.render();
 nodes(tree).find(node=>node.props?.className==='edu-license-help').props.onClick();tree=f.render();
 const guide=nodes(tree).find(node=>node.type?.name==='EduLegalGuide');assert.equal(guide.props.open,true);
 assert.equal(nodes(tree).find(node=>node.type==='dialog').props.style.display,'none');
 guide.props.onClose();tree=f.render();
 assert.equal(nodes(tree).find(node=>node.type==='input').props.value,'QA_DRAFT_NEVER_SENT');
 assert.equal(nodes(tree).find(node=>node.type==='dialog').props.style.display,'grid');
 button(tree,'작업으로 돌아가기').props.onClick();tree=f.render();
 assert.equal(nodes(tree).find(node=>node.type==='dialog').props.style.display,'none');
 assert.equal(f.events.filter(name=>name==='resistor:license-closed').length,1);
 assert.deepEqual(f.calls.map(call=>call.method),['license.status']);
});

test('an open event or Escape never authorizes an unauthenticated Edu session or dismisses its gate',async()=>{
 const f=fixture({authorized:false});let tree=await f.boot();
 f.window.dispatchEvent(new Event('resistor:license-open'));tree=f.render();
 assert.equal(text(tree).includes('retained-workspace'),false);
 assert.equal(button(tree,'작업으로 돌아가기'),undefined);
 let prevented=false;nodes(tree).find(node=>node.type==='dialog').props.onCancel({preventDefault(){prevented=true;},stopPropagation(){}});
 tree=f.render();assert.equal(prevented,true);
 assert.equal(nodes(tree).find(node=>node.type==='dialog').props.style.display,'grid');
 assert.equal(f.events.includes('resistor:license-closed'),false);
 assert.deepEqual(f.calls.map(call=>call.method),['license.status']);
 for(const manage of [false,true])for(const guideOpen of [false,true]){
  const view=f.visibility({local:true,authorized:false,edu:true,manage,guideOpen});
  assert.equal(view.gate,true);assert.equal(view.canReturn,false);assert.equal(view.floating,false);
 }
});

test('Industry retains its floating management entry; public browser mode cannot acquire a gate through an event',async()=>{
 const industry=fixture({edition:'indust'});let tree=await industry.boot();
 assert(nodes(tree).some(node=>node.props?.className==='license-manage'));
 industry.window.dispatchEvent(new Event('resistor:license-open'));tree=industry.render();
 assert(nodes(tree).some(node=>node.props?.className==='license-manage'));
 const web=fixture({local:false});tree=await web.boot();web.window.dispatchEvent(new Event('resistor:license-open'));tree=web.render();
 assert.equal(text(tree),'retained-workspace');assert.equal(web.calls.length,0);
});

test('a revoked session keeps the mounted workspace while showing a non-dismissible authentication gate',async()=>{
 const f=fixture();let tree=await f.boot();assert(text(tree).includes('retained-workspace'));
 tree=await f.poll({authorized:false,state:'revoked',message:'Fixture revoked'});
 assert(text(tree).includes('retained-workspace'));
 assert.equal(nodes(tree).find(node=>node.type==='dialog').props.style.display,'grid');
 assert.equal(button(tree,'작업으로 돌아가기'),undefined);
 nodes(tree).find(node=>node.type==='dialog').props.onCancel({preventDefault(){},stopPropagation(){}});
 tree=f.render();assert.equal(nodes(tree).find(node=>node.type==='dialog').props.style.display,'grid');
 assert.equal(f.events.includes('resistor:license-closed'),false);
 assert.deepEqual(f.calls.map(call=>call.method),['license.status','license.status']);
});

test('Escape cannot race an active license refresh into settings before its actual response',async()=>{
 const f=fixture();let tree=await f.boot();f.window.dispatchEvent(new Event('resistor:license-open'));tree=f.render();
 const finish=f.deferRefresh();button(tree,'연결·인증 다시 확인').props.onClick();tree=f.render();
 assert.equal(button(tree,'작업으로 돌아가기').props.disabled,true);
 nodes(tree).find(node=>node.type==='dialog').props.onCancel({preventDefault(){},stopPropagation(){}});
 tree=f.render();assert.equal(nodes(tree).find(node=>node.type==='dialog').props.style.display,'grid');
 assert.equal(f.events.includes('resistor:license-closed'),false);
 tree=await finish();assert.equal(button(tree,'작업으로 돌아가기').props.disabled,false);
 nodes(tree).find(node=>node.type==='dialog').props.onCancel({preventDefault(){},stopPropagation(){}});
 tree=f.render();assert.equal(nodes(tree).find(node=>node.type==='dialog').props.style.display,'none');
 assert.equal(f.events.filter(name=>name==='resistor:license-closed').length,1);
 assert.deepEqual(f.calls.map(call=>call.method),['license.status','license.refresh']);
});
