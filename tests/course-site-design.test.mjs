import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,readdir,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import {build} from 'esbuild';
import {courseSiteHeader,renderAcademyHome,renderAcademyCourse,prepareCourseDesign} from '../scripts/course-site-design.mjs';
import {coursePlan,courseModules,courseClinics} from '../scripts/site/course-site-content.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const catalog=JSON.parse(await readFile(path.join(root,'platform/commerce/catalog.json'),'utf8'));
const sha=body=>createHash('sha256').update(body).digest('hex');
const attrs=text=>Object.fromEntries([...text.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([,name,value])=>[name,value]));
const links=html=>[...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(([,attributes,text])=>({...attrs(attributes),text:text.replace(/<[^>]*>/g,'')}));

test('the public outline keeps unique lesson identities, planned status and internally consistent estimated duration',()=>{
  const core=coursePlan.lessons.filter(lesson=>lesson.kind==='core'),clinics=coursePlan.lessons.filter(lesson=>lesson.kind==='clinic');
  assert.equal(coursePlan.edition,'edu');assert.equal(coursePlan.status,'planned');assert.equal(coursePlan.duration_basis,'estimate-not-recorded');
  assert.equal(coursePlan.title,'Resistor Edu 실전 사용법: 설치부터 회로 설계·시뮬레이션까지');
  assert.equal(courseModules.length,6);assert.ok(courseModules.every(module=>module.lessons.length===2));
  assert.equal(coursePlan.core_lesson_count,12);assert.equal(coursePlan.clinic_lesson_count,4);
  assert.deepEqual(core.map(lesson=>lesson.id),Array.from({length:12},(_,i)=>String(i+1).padStart(2,'0')));
  assert.deepEqual(clinics.map(lesson=>lesson.id),['C1','C2','C3','C4']);
  assert.equal(new Set(coursePlan.lessons.map(lesson=>lesson.title)).size,16);
  assert.deepEqual(courseModules.flatMap(module=>module.lessons),core.map(lesson=>lesson.title));
  assert.deepEqual(courseModules.flatMap(module=>module.lesson_ids),core.map(lesson=>lesson.id));
  assert.deepEqual(courseClinics,clinics.map(lesson=>lesson.title));
  for(const lesson of coursePlan.lessons){
    assert.ok(lesson.title.trim().length>0);assert.equal(lesson.title,lesson.title.trim());
    assert.ok(Number.isSafeInteger(lesson.minutes)&&lesson.minutes>0);assert.equal(lesson.status,'planned');
  }
  // These paths preserve the provenance of the reviewed local plan, without making
  // CI depend on an instructor's untracked filming documents being committed.
  assert.equal(coursePlan.source_refs.length,4);assert.equal(new Set(coursePlan.source_refs).size,4);
  assert.ok(coursePlan.source_refs.every(file=>file.startsWith('docs/teaching/')&&file.endsWith('.json')&&!file.split('/').includes('..')));
  assert.equal(coursePlan.optional_clinics_registration,'draft-proposal-not-confirmed');
  assert.equal(coursePlan.core_minutes,129);assert.equal(coursePlan.clinic_minutes,48);
  assert.equal(coursePlan.core_minutes,core.reduce((sum,lesson)=>sum+lesson.minutes,0));
  assert.equal(coursePlan.clinic_minutes,clinics.reduce((sum,lesson)=>sum+lesson.minutes,0));
  assert.equal(courseModules.reduce((sum,module)=>sum+module.minutes,0),coursePlan.core_minutes);
  assert.equal(coursePlan.total_minutes,coursePlan.lessons.reduce((sum,lesson)=>sum+lesson.minutes,0));
  const html=renderAcademyCourse(catalog);
  for(const lesson of coursePlan.lessons)assert.ok(html.includes(lesson.title),`Missing planned lesson ${lesson.id}`);
  assert.match(html,/핵심 12강 \+ 선택 클리닉 4강 · 제작 계획/);
  assert.match(html,/완성한 분량이 아닌 제작할 목차/);
});

test('four primary destinations and native disclosures keep navigation and the no-JS fallback usable',()=>{
  const nav=courseSiteHeader.match(/<nav\b[^>]*id="wb-navigation"[^>]*>([\s\S]*?)<\/nav>/)?.[1];assert.ok(nav);
  const more=nav.match(/<details\b[^>]*class="academy-more"[^>]*>[\s\S]*?<\/details>/)?.[0];assert.ok(more);
  assert.deepEqual(links(nav.replace(more,'')).map(link=>link.href),['/shop/','/course/','/download/edu/','/tutorial/library/']);
  for(const href of ['/download/industry/','/editions/','/pdk-links.html','/research/'])assert.ok(links(more).some(link=>link.href===href));
  assert.match(more,/<summary>더보기<\/summary>/);assert.match(courseSiteHeader,/aria-controls="wb-navigation" aria-expanded="false"/);
  const home=renderAcademyHome(),course=renderAcademyCourse(catalog);
  for(const html of [home,course]){
    assert.equal((html.match(/<header\b/g)||[]).length,1);assert.match(html,/id="main-content"/);
    assert.ok(links(html).some(link=>link.href==='#main-content'));assert.match(html,/button[^>]*data-theme/);
    assert.doesNotMatch(html,/<form\b|type="email"|href="\/checkout/);
  }
  for(const id of ['downloads','common-downloads','resources'])assert.ok(home.includes(`id="${id}"`));
  assert.match(home,/<output data-divider-voltage>0\.90<\/output>/);assert.match(home,/<output data-divider-current>90\.0 µA<\/output>/);
  assert.match(home,/<noscript>[\s\S]*R1=R2=10 kΩ[\s\S]*<\/noscript>/);
  assert.match(home,/출력 부하가 없는 이상 저항 모델/);assert.match(home,/실제 회로 시뮬레이션은 실행하지 않습니다/);
  assert.match(course,/250,000원/);assert.match(course,/개인 기기 2대/);assert.match(course,/Industry 사용권·외부 AI 호출료는 포함되지 않습니다/);
  assert.ok(links(course).filter(link=>'data-course-action' in link||link.class?.includes('academy-button')).every(link=>!link.href.startsWith('/checkout')));
  const action=course.match(/<a\b[^>]*data-course-action[^>]*>/)?.[0];assert.equal(attrs(action).href,'/shop/#inflearn');
  assert.equal(catalog.direct_sales_enabled,false);assert.equal(catalog.inflearn_course.publication_status,'not_verified');
});

// Interpret the hero's orthogonal wire geometry, so detached pins and resistor
// bypasses are caught without snapshotting the SVG's complete markup.
function wireSegments(d){
  const tokens=d.match(/[A-Za-z]|[-+]?(?:\d*\.)?\d+/g);const segments=[];let x=0,y=0,i=0;
  while(i<tokens.length){const command=tokens[i++];if(command==='M'){x=Number(tokens[i++]);y=Number(tokens[i++]);continue;}
    const next=command==='H'?[Number(tokens[i++]),y]:command==='V'?[x,Number(tokens[i++])]:null;
    assert.ok(next,`Unsupported wire command ${command}`);segments.push([[x,y],next]);[x,y]=next;
  }return segments;
}
const onSegment=([x,y],[[x1,y1],[x2,y2]])=>(x1===x2&&x===x1&&y>=Math.min(y1,y2)&&y<=Math.max(y1,y2))||(y1===y2&&y===y1&&x>=Math.min(x1,x2)&&x<=Math.max(x1,x2));
test('hero wires join the source, both resistor terminals, OUT and ground without bypassing a resistor',()=>{
  const svg=renderAcademyHome().match(/<svg\b[^>]*aria-labelledby="divider-title divider-desc"[^>]*>[\s\S]*?<\/svg>/)?.[0];assert.ok(svg);
  const paths=[...svg.matchAll(/<path\b([^>]*)\/>/g)].map(([,attributes])=>attrs(attributes).d);
  const wire=wireSegments(paths[0]),source=attrs(svg.match(/<circle\b[^>]*r="40"[^>]*\/>/)[0]);
  const terminals=[[+source.cx,+source.cy-+source.r],[+source.cx,+source.cy+ +source.r],[240,72],[240,120],[240,168],[240,216],[240,244]];
  for(const point of terminals)assert.ok(wire.some(segment=>onSegment(point,segment)),`Disconnected electrical terminal ${point}`);
  for(const point of [[240,94],[240,186]])assert.ok(!wire.some(segment=>onSegment(point,segment)),`Wire bypasses resistor at ${point}`);
  for(const dot of [...svg.matchAll(/<circle\b[^>]*r="5"[^>]*\/>/g)].map(match=>attrs(match[0])))assert.ok(wire.some(segment=>onSegment([+dot.cx,+dot.cy],segment)),'OUT junction must lie on a wire');
  assert.ok(wire.some(segment=>onSegment([240,148],segment)&&onSegment([374,148],segment)),'OUT taps the series midpoint');
});

class Element {
  constructor(value=''){this.value=value;this.textContent='';this.attributes={};this.listeners={};this.open=false;this.focused=false;}
  setAttribute(name,value){this.attributes[name]=value;}
  getAttribute(name){return this.attributes[name];}
  addEventListener(type,callback){this.listeners[type]=callback;}
  dispatch(type,event={}){this.listeners[type]?.({target:this,...event});}
  focus(){this.focused=true;}
}
let runtimePromise;
const runtime=()=>runtimePromise??=build({entryPoints:[path.join(root,'scripts/site/course-site.ts')],bundle:true,write:false,platform:'browser',format:'iife',target:'es2022',metafile:true});
async function calculatorHarness({parentKeydown}={}){
  const slider=new Element('10'),reset=new Element(),r2Label=[new Element(),new Element()],voltage=new Element(),current=new Element(),explanation=new Element();
  const summary=new Element(),more=new Element(),navigation=['/shop/','/course/','/download/edu/','/tutorial/library/'].map(href=>Object.assign(new Element(),{href:'https://resistor.kr'+href}));
  const moreLink=new Element();more.contains=element=>element===more;more.querySelector=()=>summary;more.querySelectorAll=()=>[moreLink];
  const nodes=new Map([['[data-divider-r2-label]',r2Label],['[data-divider-voltage]',[voltage]],['[data-divider-current]',[current]],['[data-divider-explanation]',[explanation]],['#wb-navigation > a',navigation]]),events={},listeners=[];
  const document={querySelector:selector=>selector==='[data-divider-r2]'?slider:selector==='[data-divider-reset]'?reset:selector==='.academy-more'?more:null,querySelectorAll:selector=>nodes.get(selector)||[],addEventListener:(name,callback,options)=>{events[name]=callback;listeners.push({name,callback,capture:options===true||options?.capture===true});}};
  // Legacy appearance.js can register its bubbling handler before this module.
  if(parentKeydown)document.addEventListener('keydown',parentKeydown);
  let networkCalls=0;const forbidden=()=>{networkCalls++;throw Error('The local divider must not submit a request');};
  const built=await runtime();runInNewContext(built.outputFiles[0].text,{document,location:{pathname:'/download/edu/'},URL,fetch:forbidden,XMLHttpRequest:forbidden,WebSocket:forbidden,navigator:{sendBeacon:forbidden},localStorage:{setItem:forbidden}});
  const dispatchKey=key=>{
    const event={key,defaultPrevented:false,immediateStopped:false,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.immediateStopped=true;}};
    for(const capture of [true,false])for(const listener of listeners)if(listener.name==='keydown'&&listener.capture===capture&&!event.immediateStopped)listener.callback(event);
    return event;
  };
  return {slider,reset,r2Label,voltage,current,explanation,more,moreLink,summary,navigation,events,built,dispatchKey,networkCalls:()=>networkCalls};
}
test('actual bundled interaction reuses the shared calculator, converts kΩ/A correctly, resets and sends no input',async()=>{
  let parentOpen=true,parentCalls=0;
  const h=await calculatorHarness({parentKeydown:event=>{if(event.key==='Escape'){parentCalls++;parentOpen=false;}}});assert.ok(Object.keys(h.built.metafile.inputs).some(file=>file.replaceAll('\\','/').endsWith('packages/calculators/src/index.ts')));
  assert.equal(h.voltage.textContent,'0.90');assert.equal(h.current.textContent,'90.0 µA');
  h.slider.value='20';h.slider.dispatch('input');assert.equal(h.voltage.textContent,'1.20');assert.equal(h.current.textContent,'60.0 µA');
  assert.ok(h.r2Label.every(label=>label.textContent==='20 kΩ'));assert.equal(h.slider.getAttribute('aria-valuetext'),'20킬로옴');
  h.slider.value='1';h.slider.dispatch('input');assert.equal(h.voltage.textContent,'0.16');assert.equal(h.current.textContent,'163.6 µA');
  h.reset.dispatch('click');assert.equal(h.slider.value,'10');assert.equal(h.voltage.textContent,'0.90');assert.equal(h.current.textContent,'90.0 µA');
  assert.equal(h.networkCalls(),0);
  assert.equal(h.navigation[2].getAttribute('aria-current'),'page');assert.ok(h.navigation.filter((_,i)=>i!==2).every(link=>!link.getAttribute('aria-current')));
  h.more.open=true;const firstEscape=h.dispatchKey('Escape');assert.equal(h.more.open,false);assert.equal(h.summary.focused,true);
  assert.equal(firstEscape.defaultPrevented,true);assert.equal(firstEscape.immediateStopped,true);assert.equal(parentOpen,true);assert.equal(parentCalls,0);
  const secondEscape=h.dispatchKey('Escape');assert.equal(secondEscape.defaultPrevented,false);assert.equal(secondEscape.immediateStopped,false);assert.equal(parentOpen,false);assert.equal(parentCalls,1);
  h.more.open=true;h.events.click({target:new Element()});assert.equal(h.more.open,false);
  h.more.open=true;h.moreLink.dispatch('click');assert.equal(h.more.open,false);
});

let offerPromise;
const offerRuntime=()=>offerPromise??=build({entryPoints:[path.join(root,'scripts/site/course-offer.mjs')],bundle:true,write:false,platform:'browser',format:'esm',target:'es2022',plugins:[{name:'local-sales-policy',setup(builder){builder.onResolve({filter:/^\/shop\/sales-policy\.mjs$/},()=>({path:path.join(root,'platform/commerce/sales-policy.mjs')}));}}]});
async function offerHarness(result,{ok=true,reject=false}={}){
  const status=new Element(),price=new Element(),action=new Element();action.setAttribute('href','https://www.inflearn.com/course/old-stale-link');const requests=[];
  const document={getElementById:id=>id==='store-status'?status:null,querySelectorAll:selector=>selector==='[data-course-price]'?[price]:selector==='[data-course-action]'?[action]:[]};
  const built=await offerRuntime();await runInNewContext('(async()=>{'+built.outputFiles[0].text+'\n})()', {document,URL,fetch:async(url,options)=>{requests.push({url,options});if(reject)throw Error('Offline');return {ok,json:async()=>({ok:true,result})};}});
  return {status,price,action,requests};
}
test('offer checks only public catalog and fails closed on unavailable, invalid or unpublished Inflearn data',async()=>{
  for(const options of [{},{ok:false},{reject:true}]){
    const h=await offerHarness(catalog,options);assert.equal(h.requests.length,1);assert.equal(h.requests[0].url,'/api/shop?action=catalog');
    assert.equal(h.requests[0].options.cache,'no-store');assert.ok(!h.requests[0].options.method||h.requests[0].options.method==='GET');assert.equal(h.requests[0].options.body,undefined);
    assert.ok(['/shop/#inflearn','#inflearn'].includes(h.action.getAttribute('href')));assert.doesNotMatch(h.action.getAttribute('href'),/checkout|^https:/);
  }
  const safe=await offerHarness(catalog);assert.equal(safe.price.textContent,'250,000원');assert.match(safe.status.textContent,/제작 중/);
  const invalid=structuredClone(catalog);invalid.products.find(p=>p.id==='resistor.edu.course-bundle').edition='indust';assert.equal((await offerHarness(invalid)).action.getAttribute('href'),'#inflearn');
  for(const url of ['https://www.inflearn.com/course/temp_345103','https://evil.invalid/course/claim','http://www.inflearn.com/course/example']){
    const fixture={...catalog,inflearn_course:{publication_status:'published',public_url:url}};assert.equal((await offerHarness(fixture)).action.getAttribute('href'),'/shop/#inflearn');
  }
  const published={...catalog,inflearn_course:{publication_status:'published',public_url:'https://www.inflearn.com/course/fixture-course'}};
  assert.equal((await offerHarness(published)).action.getAttribute('href'),'https://www.inflearn.com/course/fixture-course');
});

async function snapshot(directory,prefix=''){
  const output=new Map();for(const item of await readdir(directory,{withFileTypes:true})){const name=prefix+item.name;if(item.isDirectory()){for(const [key,value]of await snapshot(path.join(directory,item.name),name+'/'))output.set(key,value);}else output.set(name,await readFile(path.join(directory,item.name)));}return output;
}
test('overlay regeneration preserves native/API bytes and page bodies, refreshes changed hashes and is repeatable',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'resistor-course-site-'));
  const legacyHeader='<a class="wb-skip" href="#main-content">skip</a><header class="wb-site-header"><nav>old menu</nav></header>';
  const page=body=>'<html lang="ko"><head><title>Preserved page</title></head><body>'+legacyHeader+body+'</body></html>';
  const bodies={
    'download-edu.html':'<main id="main-content" data-download-edition="edu"><a data-native-download href="/download/edu/windows-x64">Edu 0.32.0</a><code>verified-original-hash</code><p>Receipt/source and scope preserved</p></main>',
    'download-industry.html':'<main id="main-content" data-download-edition="indust"><a data-native-download href="/download/industry/macos-arm64">Industry 0.31.0</a></main>',
    'learning/example.html':'<main id="main-content" data-lesson="example"><h1>Original example</h1><p>not_run · actual source revision</p></main>'
  };
  const files={
    'index.html':page('<main id="main-content">old homepage</main>'),'shop.html':page('<main id="main-content">old shop</main>'),
    ...Object.fromEntries(Object.entries(bodies).map(([name,body])=>[name,page(body)])),
    'unrelated.html':'<html><body>page without workbench chrome</body></html>',
    'api/shop.mjs':'export const untouched = "no new payment routes";', 'api/operator.html':page('<main>do not process API directory</main>'),
    '.runtime/private.html':page('<main>do not process dot directories</main>'),
    'shop/catalog.json':JSON.stringify(catalog),
    'edition-downloads.json':'{"edu":"0.32.0-original","indust":"0.31.0-original","digest":"preserved"}\n',
    'downloads.json':'{"version":"v0.27.0","files":[]}\n','updates.json':'{"original":true}\n','edu-updates.json':'{"edition":"edu","native_installer_rebuilt":false}\n',
    'vercel.json':'{"redirects":[{"source":"/download/edu/windows-x64","destination":"https://github.com/verified/asset.exe"}],"rewrites":[],"headers":[]}\n',
    'tutorial-assets/original.mp4':Buffer.from([0,1,2,3,255]),'edu-assets/inverter-desktop.png':Buffer.from([137,80,78,71]),
    '.vercelignore':'*\n!index.html\n!shop.html\n**/.env*\n**/.runtime/**\n',
    'shop/checkout.mjs':'export const paymentGuard = "untouched";'
  };
  try{
    for(const [name,body]of Object.entries(files)){await mkdir(path.dirname(path.join(directory,name)),{recursive:true});await writeFile(path.join(directory,name),body);}
    const tracked=['index.html','shop.html',...Object.keys(bodies),'tutorial-assets/original.mp4'];
    const manifest={schema_version:1,source_revision:'original-verified-revision',files:tracked.map(file=>({file,bytes:Buffer.byteLength(files[file]),sha256:sha(files[file])}))};
    await writeFile(path.join(directory,'learning-assets.json'),JSON.stringify(manifest));
    const before=await snapshot(directory),result=await prepareCourseDesign(root,directory),after=await snapshot(directory);
    assert.equal(result.edition,'edu');assert.equal(result.course_status,'planned');
    const mutable=new Set(['index.html','shop.html','unrelated.html',...Object.keys(bodies),'learning-assets.json','.vercelignore']);
    for(const [file,bytes]of before)if(!mutable.has(file))assert.deepEqual(after.get(file),bytes,`Protected original changed: ${file}`);
    for(const [file,body]of Object.entries(bodies)){
      const html=after.get(file).toString();assert.ok(html.includes(body),`Native or lesson body changed: ${file}`);
      assert.equal((html.match(/<header\b/g)||[]).length,1);assert.ok(html.includes('data-academy-header'));
    }
    assert.deepEqual([...after.keys()].filter(file=>!before.has(file)).sort(),['course-documents.css','course-offer.mjs','course-site.css','course-site.mjs']);
    assert.match(after.get('unrelated.html').toString(),/academy-document/);assert.match(after.get('unrelated.html').toString(),/page without workbench chrome/);
    const updated=JSON.parse(after.get('learning-assets.json'));assert.equal(updated.source_revision,manifest.source_revision);
    for(const entry of updated.files){const bytes=after.get(entry.file);assert.equal(entry.bytes,bytes.length,entry.file);assert.equal(entry.sha256,sha(bytes),entry.file);}
    const ignore=after.get('.vercelignore').toString();for(const line of ['**/.env*','**/.runtime/**','!course-site.css','!course-documents.css','!course-site.mjs','!course-offer.mjs'])assert.ok(ignore.split(/\r?\n/).includes(line));
    await prepareCourseDesign(root,directory);const repeated=await snapshot(directory);
    assert.deepEqual([...repeated.keys()].sort(),[...after.keys()].sort());for(const [file,bytes]of after)assert.deepEqual(repeated.get(file),bytes,`Second generation changed ${file}`);
  }finally{
    assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));assert.ok(path.basename(directory).startsWith('resistor-course-site-'));
    await rm(directory,{recursive:true,force:true});
  }
});
