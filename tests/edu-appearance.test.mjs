import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {build} from 'esbuild';
import {appearanceBootstrap} from '../scripts/appearance-bootstrap.mjs';

const palette=JSON.parse(await readFile(new URL('../packages/ui/src/edu-appearance.json',import.meta.url),'utf8'));
const presets=JSON.parse(await readFile(new URL('../packages/ui/src/appearance-presets.json',import.meta.url),'utf8'));
const bundles=new Map();
async function setup(edition,{saved={},denied=false,dark=false}={}){
 if(!bundles.has(edition)){
  const built=await build({entryPoints:['packages/ui/src/appearance.ts'],bundle:true,write:false,platform:'node',format:'cjs',target:'node24',define:{__RESISTOR_EDITION__:JSON.stringify(edition)},external:['react'],logLevel:'silent'});
  bundles.set(edition,built.outputFiles[0].text);
 }
 const data=new Map(Object.entries(saved)),writes=[],properties=new Map([['--user-custom','preserved']]),listeners=new Map(),mediaListeners=new Map();
 const media={matches:dark,addEventListener:(name,listener)=>mediaListeners.set(name,listener)};
 const root={dataset:{},style:{setProperty:(name,value)=>properties.set(name,value),removeProperty:name=>properties.delete(name)}},meta={content:''};
 const storage={getItem:key=>{if(denied)throw Error('blocked');return data.get(key)??null;},setItem:(key,value)=>{if(denied)throw Error('blocked');writes.push(key);data.set(key,value);}};
 const subject={exports:{}};
 runInNewContext(bundles.get(edition),{module:subject,exports:subject.exports,require:createRequire(import.meta.url),localStorage:storage,window:{matchMedia:()=>media,addEventListener:(name,listener)=>listeners.set(name,listener)},document:{documentElement:root,querySelector:()=>meta}});
 return {api:subject.exports,data,writes,properties,root,meta,storageChange:key=>listeners.get('storage')?.({key}),colorScheme:dark=>{media.matches=dark;mediaListeners.get('change')?.();}};
}
const saved=(mode,skin)=>JSON.stringify({version:1,mode,skin});

test('first paint matches the edition preference without writing or leaking another edition choice',()=>{
 for(const edition of ['edu','indust']){
  const properties=new Map(),root={dataset:{},style:{setProperty:(key,value)=>properties.set(key,value)}},meta={content:''};
  const data=new Map([['resistor.edu.appearance.v1',saved('light','graphite')],['register.appearance',saved('dark','jade')]]);
  runInNewContext(appearanceBootstrap({edition,presets,eduPalette:palette}),{document:{documentElement:root,querySelector:()=>meta},localStorage:{getItem:key=>data.get(key)||null},matchMedia:()=>({matches:true})});
  assert.equal(root.dataset.edition,edition);
  assert.equal(root.dataset.theme,edition==='edu'?'light':'dark');
  assert.equal(root.style.backgroundColor,edition==='edu'?palette.light.bg:presets.skins.jade.dark.bg);
  assert.equal(meta.content,edition==='edu'?palette.light.panel:presets.skins.jade.dark.panel);
  assert.equal(properties.size,edition==='edu'?Object.keys(palette.light).length:0);
 }
});

test('Edu primary button and text colors remain legible in both modes',()=>{
 const luminance=hex=>{const c=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];};
 const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
 for(const p of [palette.dark,palette.light]){
  assert(contrast(p.accent,p['accent-ink'])>=4.5,'primary button text');
  for(const key of ['text','muted','faint'])assert(contrast(p[key],p.panel)>=4.5,key);
 }
});

test('Edu reads an existing Industry appearance as fallback without migrating or overwriting it',async()=>{
 const legacy=saved('light','jade'),h=await setup('edu',{saved:{'register.appearance':legacy}});
 assert.equal(h.api.appearanceStorageKey,'resistor.edu.appearance.v1');
 assert.equal(h.root.dataset.edition,'edu');assert.equal(h.root.dataset.theme,'light');assert.equal(h.root.dataset.skin,'jade');
 assert.equal(h.data.get('register.appearance'),legacy);assert.equal(h.data.has('resistor.edu.appearance.v1'),false);assert.deepEqual(h.writes,[]);
});

test('Edu preferences persist in its own key and override the fallback on reopen',async()=>{
 const legacy=saved('dark','jade'),h=await setup('edu',{saved:{'register.appearance':legacy}});
 h.api.setAppearance({mode:'light',skin:'graphite'});
 assert.deepEqual(h.writes,['resistor.edu.appearance.v1']);assert.equal(h.data.get('register.appearance'),legacy);
 assert.deepEqual(JSON.parse(h.data.get('resistor.edu.appearance.v1')),{version:1,mode:'light',skin:'graphite'});
 const reopened=await setup('edu',{saved:Object.fromEntries(h.data)});
 assert.equal(reopened.root.dataset.theme,'light');assert.equal(reopened.root.dataset.skin,'graphite');assert.deepEqual(reopened.writes,[]);
});

test('Edu graphite applies the real shared palette and another skin removes every Edu override',async()=>{
 const h=await setup('edu',{saved:{'resistor.edu.appearance.v1':saved('light','graphite')}});
 for(const [token,value] of Object.entries(palette.light))assert.equal(h.properties.get('--'+token),value,token);
 assert.equal(h.root.style.backgroundColor,palette.light.bg);assert.equal(h.meta.content,palette.light.panel);
 h.api.setAppearance({mode:'dark'});
 for(const [token,value] of Object.entries(palette.dark))assert.equal(h.properties.get('--'+token),value,token);
 h.api.setAppearance({skin:'jade'});
 for(const token of Object.keys(palette.dark))assert.equal(h.properties.has('--'+token),false,token);
 assert.equal(h.properties.get('--user-custom'),'preserved');assert.equal(h.root.style.backgroundColor,presets.skins.jade.dark.bg);
});

test('Industry keeps its original key and palette without reading or modifying Edu preferences',async()=>{
 const edu=saved('light','graphite'),h=await setup('indust',{saved:{'resistor.edu.appearance.v1':edu,'register.appearance':saved('dark','graphite')}});
 assert.equal(h.api.appearanceStorageKey,'register.appearance');assert.equal(h.root.dataset.edition,'indust');assert.equal(h.root.dataset.theme,'dark');
 assert.equal(h.root.style.backgroundColor,presets.skins.graphite.dark.bg);
 assert.deepEqual([...h.properties.keys()],['--user-custom']);
 h.api.setAppearance({mode:'light',skin:'jade'});assert.deepEqual(h.writes,['register.appearance']);assert.equal(h.data.get('resistor.edu.appearance.v1'),edu);
});

test('blocked browser storage preserves in-memory theme changes and system theme resolution',async()=>{
 const h=await setup('edu',{denied:true,dark:true});
 assert.equal(h.root.dataset.theme,'dark');h.colorScheme(false);assert.equal(h.root.dataset.theme,'light');
 h.api.setAppearance({mode:'dark',skin:'jade'});assert.equal(h.root.dataset.theme,'dark');assert.equal(h.root.dataset.skin,'jade');
 h.colorScheme(false);assert.equal(h.root.dataset.theme,'dark');assert.deepEqual(h.writes,[]);
});

test('cross-tab updates are scoped to Edu and malformed stored choices fall back safely',async()=>{
 const h=await setup('edu',{saved:{'resistor.edu.appearance.v1':saved('light','graphite')}});
 h.data.set('register.appearance',saved('dark','jade'));h.storageChange('register.appearance');
 assert.equal(h.root.dataset.skin,'graphite');assert.equal(h.root.dataset.theme,'light');
 h.data.set('resistor.edu.appearance.v1',saved('dark','jade'));h.storageChange('resistor.edu.appearance.v1');
 assert.equal(h.root.dataset.skin,'jade');assert.equal(h.root.dataset.theme,'dark');assert.deepEqual(h.writes,[]);
 for(const value of ['{broken',saved('unknown','<script>')]){
  const invalid=await setup('edu',{saved:{'resistor.edu.appearance.v1':value}});
  assert.equal(invalid.root.dataset.skin,'graphite');assert.equal(invalid.root.dataset.theme,'light');assert.deepEqual(invalid.writes,[]);
 }
});
