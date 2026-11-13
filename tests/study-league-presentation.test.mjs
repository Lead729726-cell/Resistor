import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {build} from 'esbuild';
import {createOnlineAcknowledgment,ONLINE_ACCESS_POLICY_VERSION} from '../platform/licensing/online-access-policy.mjs';

const require=createRequire(import.meta.url);
const built=await build({entryPoints:['packages/ui/src/StudyLeague.tsx'],bundle:true,write:false,format:'cjs',platform:'node',loader:{'.css':'empty'},external:['react','react/jsx-runtime'],plugins:[{name:'league-test-boundary',setup(build){build.onResolve({filter:/^\.\/(league-device|ui-preferences)$/},args=>({path:'fixture:'+args.path.slice(2),external:true}));}}]});
const copy=value=>JSON.parse(JSON.stringify(value));
const qs=()=>Array.from({length:5},(_,i)=>({id:'q'+(i+1),title:'Fixture question '+(i+1),prompt:'Fixture numeric question',level:1,difficulty:{label:'입문',reason:'Fixture'},conditions:['Fixture condition'],unit:'V'}));

// Runs actual component callbacks and effect dependencies with a deterministic server boundary.
// Native dialog keyboard/focus behavior is covered by the separate browser walkthrough.
function fixture({registered=true,started=true,draft={}}={}){
 const now=Date.parse('2026-11-12T03:00:00Z'),slots=[],effects=[],calls=[],timers=new Map(),drafts=new Map([['attempt-a',copy(draft)]]);
 let clock=now,cursor=0,dirty=false,timerId=0,active=true;
 const attempt=()=>({id:'attempt-a',day:'2026-11-12',level:1,difficulty_mode:'auto',status:'started',deadline:now+600000,questions:qs(),answers:null,review:null,review_available_at:now+1000000,score:null,correct:null});
 let person=registered?{device_id:'fixture-device',nickname:'Fixture learner # 1234',difficulty:{mode:'auto',manual_level:1,selected_level:1,locked:started,revision:1,recommendation:{reason:'Fixture recommendation',level:1}},attempt:started?attempt():null,standing:null,history:[],allowed_emojis:['🌱']}:null;
 const board=(params={})=>({level:params.level||1,level_label:'입문',period:params.period||'today',entries:[],participants:0,mine:null,tie_break:'Fixture server order'});
 const client={clock:()=>clock,hasIdentity:async()=>!!person,loadDraft:async id=>copy(drafts.get(id)||{}),saveDraft:async(id,answers)=>{drafts.set(id,copy(answers));},clearDraft:async id=>{drafts.delete(id);},call:async(method,params={})=>{
  calls.push({method,params:copy(params)});
  if(method==='league.snapshot'){const me=copy(person);if(me?.attempt?.status==='started'&&clock>=me.attempt.deadline)me.attempt.status='expired';return copy({info:{day:'2026-11-12',ends_at:now+1000000,origin:'template',mode:'qa',automatic_ai_calls:false},me,board:board(params),feed:{posts:[],next_before:null}});}
  if(method==='league.board')return board(params);
  if(method==='league.start'){assert(person);assert.equal(person.attempt,null);person.attempt=attempt();person.difficulty.locked=true;return {attempt:copy(person.attempt)};}
  if(method==='league.submit'){assert.equal(clock<person.attempt.deadline,true);assert.equal(person.attempt.status,'started');person.attempt={...person.attempt,status:'submitted',answers:copy(params.answers),score:80,correct:4};return {score:80};}
  if(method==='league.difficulty'){person.difficulty={...person.difficulty,mode:params.mode,manual_level:params.level||1,revision:person.difficulty.revision+1};return {};}
  throw Error('Unexpected API call: '+method);
 }};
 const hooks={...require('react'),useState(initial){const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return [slots[index],value=>{const next=typeof value==='function'?value(slots[index]):value;if(!Object.is(next,slots[index]))dirty=true;slots[index]=next;}];},useRef(initial){return slots[cursor++]??={current:initial};},useMemo(make,deps){const index=cursor++,prior=slots[index];if(!prior||deps.some((value,i)=>!Object.is(value,prior.deps[i])))slots[index]={deps,value:make()};return slots[index].value;},useEffect(effect,deps){const index=cursor++,prior=slots[index];if(!prior||deps.some((value,i)=>!Object.is(value,prior.deps[i]))){prior?.cleanup?.();slots[index]={deps,cleanup:null};effects.push(()=>{slots[index].cleanup=effect();});}}};
 const module={exports:{}};
 const schedule=(callback,delay,repeat)=>{timers.set(++timerId,{callback,delay,repeat});return timerId;};
 const acknowledgment=createOnlineAcknowledgment({edition:'edu',policy_version:ONLINE_ACCESS_POLICY_VERSION,age_14_or_over:true});
 runInNewContext(built.outputFiles[0].text,{module,exports:module.exports,document:{hidden:false},Date,localStorage:{getItem:key=>key==='resistor.edu.online-access.v1'?JSON.stringify(acknowledgment):null},requestAnimationFrame:()=>0,cancelAnimationFrame:()=>{},setInterval:(fn,ms)=>schedule(fn,ms,true),clearInterval:id=>timers.delete(id),setTimeout:(fn,ms)=>schedule(fn,ms,false),clearTimeout:id=>timers.delete(id),require:name=>name==='react'?hooks:name==='fixture:league-device'?{defaultLeagueEndpoint:()=> 'http://localhost:5198/api/league',leagueEndpoint:value=>value,leagueClient:()=>client}:name==='fixture:ui-preferences'?{readPreference:()=>null,writePreference:()=>true,removePreference:()=>true}:require(name)});
 const render=()=>{let tree;for(let i=0;i<12;i++){dirty=false;cursor=0;tree=module.exports.default({active});while(effects.length)effects.shift()();if(!dirty)return tree;}throw Error('Component did not settle');};
 const settle=async()=>{let tree;for(let i=0;i<5;i++){tree=render();await new Promise(setImmediate);}return render();};
 const fire=async delay=>{for(const [id,timer] of [...timers])if(timer.delay===delay){if(!timer.repeat)timers.delete(id);timer.callback();}return settle();};
 return {calls,drafts,render,settle,setActive:value=>{active=value;return render();},poll:()=>fire(15000),save:()=>fire(350),advance:async ms=>{clock+=ms;return fire(1000);},nextAttempt:async()=>{person.attempt={...attempt(),id:'attempt-b',deadline:clock+600000};return fire(15000);},deadline:()=>person?.attempt?.deadline};
}
function nodes(tree){if(Array.isArray(tree))return tree.flatMap(nodes);if(!tree||typeof tree!=='object')return [];return [tree,...nodes(tree.props?.children)];}
const text=tree=>Array.isArray(tree)?tree.map(text).join(''):tree&&typeof tree==='object'?text(tree.props?.children):tree==null?'':String(tree);
const button=(tree,label)=>nodes(tree).find(node=>node.type==='button'&&text(node)===label);
const dialog=tree=>nodes(tree).find(node=>node.type?.name==='EduDepthDialog');
const inputs=tree=>nodes(tree).filter(node=>node.type==='input'&&/번 리그 답안/.test(node.props['aria-label']||''));
const click=(tree,label)=>{const b=button(tree,label);assert(b,'Missing button: '+label);assert(!b.props.disabled,'Disabled button: '+label);b.props.onClick();};

test('one visible question retains draft contents across previous/next, help, and periodic server snapshots',async()=>{
 const f=fixture({draft:{q1:'0.9 V'}});let tree=await f.settle();const initialCalls=f.calls.length,deadline=f.deadline();
 assert.equal(inputs(tree).length,1);assert.equal(inputs(tree)[0].props.value,'0.9 V');
 click(tree,'다음 문제 →');tree=f.render();assert.equal(inputs(tree).length,1);assert.equal(inputs(tree)[0].props['aria-label'],'2번 리그 답안');
 inputs(tree)[0].props.onChange({target:{value:'2 V'}});tree=f.render();click(tree,'← 이전 문제');tree=f.render();assert.equal(inputs(tree)[0].props.value,'0.9 V');
 click(tree,'참가·답안 안내');tree=f.render();assert.equal(dialog(tree).props.open,true);dialog(tree).props.onBack();tree=f.render();assert.equal(dialog(tree).props.title,'리그 도구');dialog(tree).props.onClose();tree=f.render();assert.equal(dialog(tree).props.open,false);
 assert.equal(f.calls.length,initialCalls);assert.equal(f.deadline(),deadline);
 tree=await f.poll();click(tree,'다음 문제 →');tree=f.render();assert.equal(inputs(tree)[0].props.value,'2 V');
 await f.save();assert.deepEqual(f.drafts.get('attempt-a'),{q1:'0.9 V',q2:'2 V'});assert.equal(f.calls.filter(x=>x.method==='league.start'||x.method==='league.submit').length,0);
});

test('only the explicit review-page submit sends the full answer set once; server result stays authoritative',async()=>{
 const f=fixture();let tree=await f.settle();
 for(let i=1;i<=5;i++){assert.equal(button(tree,'5문제 답안 최종 제출'),undefined);inputs(tree)[0].props.onChange({target:{value:i+' V'}});tree=f.render();click(tree,i<5?'다음 문제 →':'전체 답안 확인 →');tree=f.render();}
 assert.equal(inputs(tree).length,0);assert.equal(f.calls.filter(x=>x.method==='league.submit').length,0);
 click(tree,'2번 수정');tree=f.render();assert.equal(inputs(tree)[0].props.value,'2 V');
 for(let i=2;i<=5;i++){click(tree,i<5?'다음 문제 →':'전체 답안 확인 →');tree=f.render();}
 click(tree,'5문제 답안 최종 제출');tree=await f.settle();
 const submits=f.calls.filter(x=>x.method==='league.submit');assert.equal(submits.length,1);assert.deepEqual(submits[0].params,{attempt_id:'attempt-a',answers:{q1:'1 V',q2:'2 V',q3:'3 V',q4:'4 V',q5:'5 V'}});
 assert(text(tree).includes('80 / 100 · 4/5 정답'));assert.equal(button(tree,'5문제 답안 최종 제출').props.disabled,true);assert.equal(f.drafts.has('attempt-a'),false);
});

test('deadline continues inside a help depth and an expired or incomplete attempt cannot submit',async()=>{
 const f=fixture({draft:{q1:'1 V'}});let tree=await f.settle();
 for(let i=1;i<=5;i++){click(tree,i<5?'다음 문제 →':'전체 답안 확인 →');tree=f.render();}
 assert.equal(button(tree,'5문제 답안 최종 제출').props.disabled,true);
 click(tree,'참가·답안 안내');tree=f.render();assert.match(dialog(tree).props.subtitle,/10:00/);
 tree=await f.advance(600000);assert.equal(dialog(tree).props.open,true);dialog(tree).props.onClose();tree=f.render();
 tree=await f.poll();assert(text(tree).includes('제출 시간 종료'));assert.equal(button(tree,'5문제 답안 최종 제출').props.disabled,true);assert.equal(f.calls.filter(x=>x.method==='league.start'||x.method==='league.submit').length,0);
 click(tree,'1번 보기');tree=f.render();assert.equal(inputs(tree)[0].props.value,'1 V');assert.equal(inputs(tree)[0].props.disabled,true);
});

test('rankings are a separate depth and filters fetch only a board; a new server attempt resets the local page',async()=>{
 const f=fixture();let tree=await f.settle();click(tree,'다음 문제 →');tree=f.render();
 assert.equal(nodes(tree).some(n=>n.type==='table'),false);click(tree,'순위 보기');tree=f.render();assert.equal(dialog(tree).props.title,'리그 순위');assert(nodes(tree).some(n=>n.type==='table'));
 const before=f.calls.length;const select=nodes(tree).find(n=>n.type==='select'&&n.props['aria-label']==='리그 순위 난이도');select.props.onChange({target:{value:'2'}});tree=await f.settle();
 assert.deepEqual(f.calls.slice(before).map(x=>x.method),['league.board']);dialog(tree).props.onClose();tree=f.render();assert.equal(inputs(tree)[0].props['aria-label'],'2번 리그 답안');
 tree=await f.nextAttempt();assert.equal(inputs(tree)[0].props['aria-label'],'1번 리그 답안');assert.equal(inputs(tree)[0].props.value,'');assert.equal(f.calls.filter(x=>x.method==='league.start'||x.method==='league.submit').length,0);
});

test('tools and connection work before enrollment, while starting an attempt remains an explicit action',async()=>{
 const visitor=fixture({registered:false,started:false});let tree=await visitor.settle();click(tree,'리그 도구');tree=visitor.render();assert.equal(dialog(tree).props.open,true);
 const connection=nodes(tree).find(n=>n.type==='button'&&text(n).startsWith('서버 연결'));connection.props.onClick();tree=visitor.render();assert.equal(dialog(tree).props.title,'리그 서버 연결');
 assert(nodes(tree).some(n=>n.type==='input'&&n.props.type==='url'));assert.equal(visitor.calls.some(x=>x.method==='league.start'||x.method==='league.enroll'),false);
 const f=fixture({started:false});tree=await f.settle();assert.equal(f.calls.some(x=>x.method==='league.start'),false);click(tree,'오늘 리그 참가 · 타이머 시작');tree=await f.settle();assert.equal(f.calls.filter(x=>x.method==='league.start').length,1);assert.equal(inputs(tree).length,1);assert.equal(f.deadline(),Date.parse('2026-11-12T03:10:00Z'));
});

test('leaving the Edu route closes the native layer while keeping the attempt, question, answers and deadline',async()=>{
 const f=fixture({draft:{q1:'0.9 V'}});let tree=await f.settle();const deadline=f.deadline();
 click(tree,'다음 문제 →');tree=f.render();inputs(tree)[0].props.onChange({target:{value:'2 V'}});tree=f.render();
 click(tree,'참가·답안 안내');tree=f.render();assert.equal(dialog(tree).props.open,true);const calls=f.calls.length;
 tree=f.setActive(false);assert.equal(dialog(tree).props.open,false);tree=await f.advance(30000);assert.equal(dialog(tree).props.open,false);
 tree=f.setActive(true);assert.equal(dialog(tree).props.open,true);assert.match(dialog(tree).props.subtitle,/9:30/);dialog(tree).props.onClose();tree=f.render();
 assert.equal(inputs(tree)[0].props['aria-label'],'2번 리그 답안');assert.equal(inputs(tree)[0].props.value,'2 V');assert.equal(f.deadline(),deadline);assert.equal(f.calls.length,calls);
});

test('an unapplied difficulty choice is preserved and explains the blocked start until explicitly applied',async()=>{
 const f=fixture({started:false});let tree=await f.settle();
 click(tree,'L1 기초 · 난이도');tree=f.render();
 const mode=nodes(tree).find(n=>n.type==='select'&&n.props['aria-label']==='리그 난이도 조절');mode.props.onChange({target:{value:'manual'}});tree=f.render();
 const level=nodes(tree).find(n=>n.type==='select'&&n.props['aria-label']==='리그 참가 난이도');level.props.onChange({target:{value:'2'}});tree=f.render();
 dialog(tree).props.onClose();tree=f.render();assert.equal(button(tree,'오늘 리그 참가 · 타이머 시작').props.disabled,true);assert(text(tree).includes('적용하지 않은 난이도 선택이 있습니다.'));
 assert.equal(f.calls.some(x=>x.method==='league.difficulty'||x.method==='league.start'),false);
 click(tree,'L1 기초 · 난이도');tree=f.render();assert.equal(nodes(tree).find(n=>n.type==='select'&&n.props['aria-label']==='리그 참가 난이도').props.value,2);
 click(tree,'난이도 적용');tree=await f.settle();assert.equal(f.calls.filter(x=>x.method==='league.difficulty').length,1);dialog(tree).props.onClose();tree=f.render();assert.equal(button(tree,'오늘 리그 참가 · 타이머 시작').props.disabled,false);assert.equal(f.calls.some(x=>x.method==='league.start'),false);
});
