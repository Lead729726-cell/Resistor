import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {build} from 'esbuild';

// Exercise actual App navigation without mounting engines, browsers or online services.
const built=await build({entryPoints:['packages/ui/src/App.tsx'],bundle:true,write:false,platform:'node',format:'cjs',loader:{'.css':'empty'},external:['react','react/jsx-runtime'],plugins:[{name:'shell-boundaries',setup(builder){builder.onResolve({filter:/.*/},args=>{
 if(!/[\\/]App\.tsx$/.test(args.importer)||args.path.endsWith('.css')||['react','react/jsx-runtime','./edu-workspace-flow','./edu-navigation'].includes(args.path))return;
 return {path:'fixture:'+args.path,external:true};
});}}]});
const nodes=tree=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children)];
const text=tree=>tree==null||typeof tree==='boolean'?'':Array.isArray(tree)?tree.map(text).join(''):typeof tree==='object'?text(tree.props?.children):String(tree);
const button=(tree,label)=>nodes(tree).find(node=>node.type==='button'&&text(node).includes(label));
const dialog=tree=>nodes(tree).find(node=>node.type?.name==='EduDepthDialog'&&node.props.open);
const component=(tree,name)=>nodes(tree).find(node=>node.type?.name===name);

function fixture(hash='#home'){
 let slots=[],cursor=0,effects=[],dirty=false;
 const storage=new Map(),calls=[],listeners=new Map(),frames=[];
 const hooks={
  useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>{const next=typeof value==='function'?value(slots[i]):value;if(next!==slots[i]){slots[i]=next;dirty=true;}}];},
  useReducer(reducer,initial,init){const [value,set]=hooks.useState(()=>init?init(initial):initial);return [value,action=>set(old=>reducer(old,action))];},
  useRef(initial){return hooks.useState(()=>({current:initial}))[0];},
  useEffect(callback,deps){const i=cursor++,old=slots[i];if(!old||!deps||deps.some((value,n)=>!Object.is(value,old.deps[n]))){slots[i]={deps,cleanup:old?.cleanup};effects.push(()=>{slots[i].cleanup?.();slots[i].cleanup=callback();});}}
 };
 const components=new Map();
 const stub=name=>{if(!components.has(name))components.set(name,{[name]:()=>null}[name]);return components.get(name);};
 const location={pathname:'/eda',search:'',hash};
 const localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
 const scope={exports:{},location,history:{pushState(_a,_b,next){location.hash=next;},replaceState(_a,_b,next){location.hash=next;}},document:{title:'',activeElement:null,querySelector:()=>null},HTMLElement:class{},localStorage,requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},cancelAnimationFrame:()=>{},window:{addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),dispatchEvent:()=>{},mos:undefined},URLSearchParams,require:name=>{
  if(name==='react')return hooks;
  if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:Symbol.for('fragment')};
  if(name==='fixture:./product-edition')return {educationMode:true,productEdition:{name:'Resistor Edu'}};
  if(name==='fixture:./ui-preferences')return {readPreference:localStorage.getItem,writePreference:(key,value)=>{localStorage.setItem(key,value);return true;}};
  if(name==='fixture:@mos/contracts')return {isLocalWorkbench:()=>true,rpc:async(...args)=>{calls.push(args);throw Error('Unexpected engine call');}};
  if(name==='fixture:../../calculators/src')return {calculatorPaths:[]};
  const short=name.split('/').pop();return Object.assign(stub(short),{RegisterMark:stub('RegisterMark')});
 }};
 const module={exports:{}};runInNewContext(built.outputFiles[0].text,{...scope,module});
 const app=module.exports.default();const Workspace=nodes(app).find(node=>node.type?.name==='EduWorkspace').type;
 slots=[];effects=[];cursor=0;dirty=false;
 function render(){let tree;for(let pass=0;pass<15;pass++){dirty=false;cursor=0;tree=Workspace({onViewer:()=>{}});const pending=effects;effects=[];pending.forEach(effect=>effect());frames.splice(0).forEach(fn=>fn());if(!dirty)return tree;}throw Error('Unstable shell render');}
 return {render,calls,storage,location,pop(next){location.hash=next;listeners.get('popstate')?.();return render();}};
}

test('first screen exposes two modes and selecting an activity does not navigate before Open',()=>{
 const f=fixture();let tree=f.render();
 const home=nodes(tree).find(node=>node.props?.['data-testid']==='edu-home');
 assert.equal(nodes(home).filter(node=>node.type==='button').length,2);
 assert.ok(button(home,'퀴즈·공부'));assert.ok(button(home,'설계·시뮬레이션'));
 assert.equal(dialog(tree),undefined);assert.equal(component(tree,'SelfStudy'),undefined);
 button(tree,'퀴즈·공부').props.onClick();tree=f.render();assert.equal(dialog(tree).props.step.total,2);
 const radios=nodes(dialog(tree)).filter(node=>node.type==='input'&&node.props.type==='radio');assert.equal(radios.length,3);
 radios[2].props.onChange();tree=f.render();assert.equal(f.location.hash,'#home');
 assert.equal(component(tree,'SelfStudy'),undefined);dialog(tree).props.footer.props.onClick();tree=f.render();
 assert.equal(f.location.hash,'#quiz/puzzles');assert.equal(component(tree,'SelfStudy').props.active,true);assert.deepEqual(f.calls,[]);
});
test('returning home and opening another mode keeps opened quiz and workbook components mounted',()=>{
 const f=fixture('#quiz/questions');let tree=f.render();const study=component(tree,'SelfStudy').type;
 button(tree,'← 홈').props.onClick();tree=f.render();assert.equal(component(tree,'SelfStudy').type,study);assert.equal(component(tree,'SelfStudy').props.active,false);
 button(tree,'퀴즈·공부').props.onClick();tree=f.render();dialog(tree).props.footer.props.onClick();tree=f.render();
 assert.equal(f.location.hash,'#workbook');const workbook=component(tree,'CoursePractice').type;
 button(tree,'← 홈').props.onClick();tree=f.render();assert.equal(component(tree,'CoursePractice').type,workbook);assert.equal(component(tree,'CoursePractice').props.active,false);
 assert.equal(component(tree,'SelfStudy').type,study);assert.equal(component(tree,'SelfStudy').props.active,false);
 assert.ok(button(tree,'이어서 열기'));assert.deepEqual(f.calls,[]);
});
test('tools, preview and settings preserve a deep-linked design and back follows the parent page',()=>{
 const id='2e053569-8076-40dc-8016-7056dbbc2c61',hash='#design/6/lesson/'+id,f=fixture(hash);let tree=f.render();
 button(tree,'학습 도구').props.onClick();tree=f.render();assert.equal(dialog(tree).props.title,'학습 도구');
 button(dialog(tree),'작업대 미리보기').props.onClick();tree=f.render();assert.equal(dialog(tree).props.title,'작업대 미리보기');
 dialog(tree).props.onBack();tree=f.render();assert.equal(dialog(tree).props.title,'학습 도구');
 button(dialog(tree),'다른 학습 선택').props.onClick();tree=f.render();assert.equal(dialog(tree).props.title,'학습 방식 선택');
 dialog(tree).props.onBack();tree=f.render();assert.equal(dialog(tree).props.title,'학습 도구');
 dialog(tree).props.onClose();tree=f.render();assert.equal(f.location.hash,hash);
 const design=component(tree,'DesignWorkspace');assert.equal(design.props.guidedStep,6);assert.equal(design.props.requestedLessonId,id);
 button(tree,'설정').props.onClick();tree=f.render();button(dialog(tree),'화면 스타일').props.onClick();tree=f.render();
 assert.equal(component(tree,'AppearanceControl').props.open,true);component(tree,'AppearanceControl').props.onBack();tree=f.render();assert.equal(dialog(tree).props.title,'앱 설정');
 dialog(tree).props.onClose();tree=f.render();assert.equal(f.location.hash,hash);assert.deepEqual(f.calls,[]);
 tree=f.pop('#home');assert.equal(component(tree,'DesignWorkspace').props.active,false);
 button(tree,'설계·시뮬레이션').props.onClick();tree=f.render();dialog(tree).props.footer.props.onClick();tree=f.render();
 assert.equal(f.location.hash,hash);assert.equal(component(tree,'DesignWorkspace').props.guidedStep,6);
});
