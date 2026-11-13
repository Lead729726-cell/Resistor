import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {build} from 'esbuild';
const require=createRequire(import.meta.url);
const compiled=await build({entryPoints:['packages/ui/src/OnlineAccessBoundary.tsx'],bundle:true,write:false,format:'cjs',platform:'node',loader:{'.css':'empty'},external:['react','react/jsx-runtime','@mos/contracts'],plugins:[{name:'isolate-boundary-dependencies',setup(build){build.onResolve({filter:/\/online-access$/},()=>({path:'access',namespace:'fixture'}));build.onResolve({filter:/^\.\/CalculatorHub$/},()=>({path:'calculator',namespace:'fixture'}));build.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='calculator'?'export default function CalculatorHub(){return null;}':`export const ONLINE_ACCESS_POLICY_VERSION='2026-11-13';export const onlineAccessStatus=()=>globalThis.onlineMock.status();export const acknowledgeOnlineAccess=input=>globalThis.onlineMock.acknowledge(input);`,loader:'js'}));}}]});
function fixture({authorized=false,enabled=true,storageFails=false}={}){
 const slots=[],effects=[],calls=[],events=new Map();let cursor=0,acknowledged=false;
 const status=()=>({edition:'edu',policy_version:'2026-11-13',required:true,acknowledged});
 const hooks={...require('react'),useState(initial){const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return [slots[index],value=>slots[index]=typeof value==='function'?value(slots[index]):value];},useEffect(effect,deps){const index=cursor++,previous=slots[index];if(!previous||deps.some((v,i)=>!Object.is(v,previous.deps[i]))){previous?.cleanup?.();slots[index]={deps,cleanup:null};effects.push(()=>slots[index].cleanup=effect());}}};
 const module={exports:{}};const window={addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
 runInNewContext(compiled.outputFiles[0].text,{module,exports:module.exports,window,Error,onlineMock:{status:async()=>status(),acknowledge:async input=>{calls.push({method:'acknowledge',input});if(storageFails)throw Error('Synthetic storage blocked');acknowledged=true;return status();}},require:name=>name==='react'?hooks:name==='@mos/contracts'?{isLocalWorkbench:()=>true,localRpc:async method=>{calls.push({method});return {edition:'edu',authorized};}}:require(name)});
 const render=()=>{cursor=0;const tree=module.exports.default({children:'existing-workspace-and-draft',enabled});while(effects.length)effects.shift()();return tree;};
 const settle=async()=>{await new Promise(setImmediate);return render();};const boot=async()=>{render();return settle();};return {render,settle,boot,calls};
}
const nodes=tree=>Array.isArray(tree)?tree.flatMap(nodes):tree&&typeof tree==='object'?[tree,...nodes(tree.props?.children)]:[];
const text=tree=>Array.isArray(tree)?tree.map(text).join(''):tree&&typeof tree==='object'?text(tree.props?.children):tree==null||typeof tree==='boolean'?'':String(tree);
const button=(tree,label)=>nodes(tree).find(node=>node.type==='button'&&text(node)===label);

test('no automatic affirmation: public calculations and returning to the prompt retain an unchecked declaration',async()=>{
 const f=fixture();let tree=await f.boot();assert.equal(nodes(tree).find(node=>node.type==='input').props.checked,false);assert.equal(button(tree,'확인하고 온라인 기능으로').props.disabled,true);assert.equal(text(tree).includes('existing-workspace'),false);
 assert.equal(button(tree,'온라인 기능 없이 기존 작업 계속'),undefined);button(tree,'공개 자료·기기 내 계산만 사용').props.onClick();tree=f.render();assert(nodes(tree).some(node=>node.type?.name==='CalculatorHub'));assert.equal(text(tree).includes('existing-workspace'),false);
 button(tree,'온라인 기능 안내로 돌아가기').props.onClick();tree=f.render();assert.equal(nodes(tree).find(node=>node.type==='input').props.checked,false);assert.deepEqual(f.calls.map(call=>call.method),['license.status']);
});
test('an existing valid lease can continue locally without acknowledgment; explicit checked submission is the only grant action',async()=>{
 const f=fixture({authorized:true});let tree=await f.boot();button(tree,'온라인 기능 없이 기존 작업 계속').props.onClick();tree=f.render();assert(text(tree).includes('existing-workspace-and-draft'));assert.equal(f.calls.some(call=>call.method==='acknowledge'),false);
 button(tree,'온라인 기능 안내').props.onClick();tree=f.render();assert(text(tree).includes('existing-workspace-and-draft'));
 nodes(tree).find(node=>node.type==='input').props.onChange({target:{checked:true}});tree=f.render();button(tree,'확인하고 온라인 기능으로').props.onClick();tree=await f.settle();
 assert.equal(f.calls.filter(call=>call.method==='acknowledge').length,1);assert.equal(f.calls.at(-1).input.age_14_or_over,true);assert.equal(f.calls.at(-1).input.policy_version,'2026-11-13');assert.equal(text(tree),'existing-workspace-and-draft');
});
test('failed persistence keeps the full app locked while Industry passes through without any policy or license calls',async()=>{
 const f=fixture({storageFails:true});let tree=await f.boot();nodes(tree).find(node=>node.type==='input').props.onChange({target:{checked:true}});tree=f.render();button(tree,'확인하고 온라인 기능으로').props.onClick();tree=await f.settle();assert.equal(text(tree).includes('existing-workspace'),false);assert(text(tree).includes('Synthetic storage blocked'));
 const industry=fixture({enabled:false});assert.equal(text(await industry.boot()),'existing-workspace-and-draft');assert.equal(industry.calls.length,0);
});
