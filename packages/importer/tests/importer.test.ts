import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseGds,parsePdkLayers,applyPdk,parseCurrentFlow} from '../src/index.ts';

const rec=(type:number,dataType=0,data:number[]=[])=>{const n=data.length+4;return [n>>8,n&255,type,dataType,...data];};
const int2=(v:number)=>[v>>8&255,v&255];
const int4=(v:number)=>[v>>24&255,v>>16&255,v>>8&255,v&255];
const ascii=(v:string)=>{const a=[...v].map(c=>c.charCodeAt(0));if(a.length%2)a.push(0);return a;};
const str=(type:number,v:string)=>rec(type,6,ascii(v));
function real(v:number){if(!v)return Array(8).fill(0);let exp=64;const sign=v<0?128:0;v=Math.abs(v);while(v>=1){v/=16;exp++;}while(v<1/16){v*=16;exp--;}const out=[sign|exp];for(let i=0;i<7;i++){v*=256;out.push(Math.floor(v));v-=Math.floor(v);}return out;}
const xy=(pts:number[][])=>rec(16,3,pts.flatMap(p=>p.flatMap(int4)));
const box=[...rec(8),...rec(13,2,int2(68)),...rec(14,2,int2(20)),...xy([[0,0],[20,0],[20,10],[0,10],[0,0]]),...rec(17)];
const cell=(name:string,body:number[])=>[...rec(5,2,Array(24).fill(0)),...str(6,name),...body,...rec(7)];
const file=(body:number[])=>new Uint8Array([...rec(0,2,int2(600)),...rec(1,2,Array(24).fill(0)),...str(2,'TEST'),...rec(3,5,[...real(.001),...real(1e-9)]),...body,...rec(4)]).buffer;

test('real public SKY130 files retain exact bounds, units and source counts',()=>{
  for(const [name,count,bounds] of [['mosfet',52,['-1000','-1320','1000','1320']],['inverter',90,['-650','-240','2030','2960']],['wire',3,['0','0','200000','1000']],['current_mirror',172,['-1700','-3750','6500','3650']],['differential_pair',262,['-1700','-3750','11500','7650']]] as const){
    const b=readFileSync(`examples/sky130/${name}.gds`),scene=parseGds(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));assert.equal(scene.total_shape_count,count);assert.deepEqual(scene.bounds,bounds);assert.equal(scene.dbu_um,.001);assert.equal(scene.source,'imported');
    const scoped=parseGds(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),{maxShapes:2});assert.equal(scoped.shapes.length,2);assert.equal(scoped.total_shape_count,count);assert.equal(scoped.truncated,true);
  }
});
test('hierarchy rotation/reflection/magnification and AREF step use stream coordinates',()=>{
  const ref=[...rec(10),...str(18,'child'),...rec(26,1,int2(0x8000)),...rec(27,5,real(2)),...rec(28,5,real(90)),...xy([[100,200]]),...rec(17)];
  const array=[...rec(11),...str(18,'child'),...rec(19,2,[...int2(2),...int2(2)]),...xy([[0,0],[200,0],[0,100]]),...rec(17)];
  const scene=parseGds(file([...cell('child',box),...cell('top',[...ref,...array])]));assert.equal(scene.top_cell,'top');assert.equal(scene.shapes.length,5);assert.deepEqual(scene.shapes[0].polygon,[['100','200'],['100','240'],['120','240'],['120','200']]);assert.deepEqual(scene.shapes[4].polygon,[['100','50'],['120','50'],['120','60'],['100','60']]);assert.deepEqual(scene.bounds,['0','0','120','240']);
  assert.equal(new Set(scene.shapes.map(s=>s.id)).size,5);assert.deepEqual(parseGds(file([...cell('child',box),...cell('top',array)]),{topCell:'child'}).bounds,['0','0','20','10']);
});
test('scope tests polygon bounds while preserving global coordinates and count',()=>{
  const ref=[...rec(11),...str(18,'child'),...rec(19,2,[...int2(2),...int2(1)]),...xy([[0,0],[200,0],[0,0]]),...rec(17)];
  const scene=parseGds(file([...cell('child',box),...cell('top',ref)]),{bounds:['90','-5','130','20']});assert.equal(scene.total_shape_count,2);assert.equal(scene.shapes.length,1);assert.deepEqual(scene.shapes[0].polygon[0],['100','0']);
});
test('PATH miter and extended ends have bounded integer geometry',()=>{
  const path=[...rec(9),...rec(13,2,int2(68)),...rec(14,2,int2(20)),...rec(15,3,int4(10)),...rec(33,2,int2(2)),...xy([[0,0],[100,0],[100,100]]),...rec(17)];const scene=parseGds(file(cell('top',path)));assert.deepEqual(scene.bounds,['-5','-5','105','105']);assert.equal(scene.shapes[0].polygon.length,6);
});
test('GDS contour bridges restore holes instead of filling their area',()=>{
  const contour=[[0,0],[3,3],[3,7],[7,7],[7,3],[3,3],[0,0],[10,0],[10,10],[0,10],[0,0]];
  const boundary=[...rec(8),...rec(13,2,int2(68)),...rec(14,2,int2(20)),...xy(contour),...rec(17)];const scene=parseGds(file(cell('top',boundary)));assert.equal(scene.shapes[0].polygon.length,4);assert.deepEqual(scene.shapes[0].holes,[[['3','3'],['3','7'],['7','7'],['7','3']]]);
});
test('malformed, cycle, unsupported path transforms fail visibly',()=>{
  assert.throws(()=>parseGds(new Uint8Array([0,8,0,2]).buffer),/record/);
  const cycle=[...rec(10),...str(18,'loop'),...xy([[0,0]]),...rec(17)];assert.throws(()=>parseGds(file(cell('loop',cycle)),{topCell:'loop'}),/순환/);
  const absolute=[...rec(10),...str(18,'child'),...rec(26,1,int2(2)),...xy([[0,0]]),...rec(17)];assert.throws(()=>parseGds(file([...cell('child',box),...cell('top',absolute)])),/absolute/);
});
test('PDK nested LYP maps layer/datatype colors, preserves actual geometry',()=>{
  const pdk=parsePdkLayers('<layer-properties><properties><name>group</name><group-member><source>68/20@1</source><name>metal &amp; routing</name><fill-color>#abcdef</fill-color></group-member></properties></layer-properties>','pdk.lyp');assert.equal(pdk.layers[0].name,'metal & routing');const original=parseGds(file(cell('top',box))),styled=applyPdk(original,pdk);assert.strictEqual(styled.shapes,original.shapes);assert.equal(styled.layers[0].color,'#abcdef');assert.equal(styled.layers[0].physical_thickness_um,null);
  const sky=parsePdkLayers(readFileSync('adapters/pdks/sky130/sky130A.lyp','utf8'),'sky130A.lyp');assert.equal(sky.layers.length,429);assert(sky.layers.some(l=>l.id==='68/20'));
  const compact=applyPdk(original,sky);assert(compact.layers.every(l=>l.z_display_um<10));
  const explicit=parsePdkLayers('{"layers":[{"gds":[68,20],"color":"#abcdef","z_display_um":22}]}','explicit.json');assert.equal(applyPdk(original,explicit).layers[0].z_display_um,22);
  assert.throws(()=>parsePdkLayers('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///secret">]><x/>','pdk.lyp'),/entity/);assert.throws(()=>parsePdkLayers('{"layers":[{"gds":[1,0],"color":"url(secret)"}]}','pdk.json'),/#RRGGBB/);
});
test('actual flow import retains signed samples and provenance, rejects fabricated coordinates/NaN',()=>{
  const scene=parseGds(file(cell('top',box))),flow={schema_version:1,source:'ngspice',analysis:'dc',x:[0,1],x_unit:'V',revision:12,project_id:'original',convention:'conventional',branches:[{id:'M1',name:'M1',from_net:'d',to_net:'s',values_A:[0,-.0002],mapping:'device_terminals',source_vector:'i(vsense)',path_dbu:[['0','0'],['20','10']]}]};const imported=parseCurrentFlow(JSON.stringify({current_flow:flow}),scene);assert.equal(imported.revision,12);assert.equal(imported.project_id,'original');assert.deepEqual(imported.branches[0].values_A,[0,-.0002]);assert.throws(()=>parseCurrentFlow(JSON.stringify({...flow,branches:[{...flow.branches[0],path_dbu:[['1.2','0'],['20','10']]}]}),scene),/DBU/);assert.throws(()=>parseCurrentFlow(JSON.stringify({...flow,x:[null,1]}),scene),/CurrentFlow/);
});
test('saved flow preserves stale dependency status and rejects unrecognized freshness or scalar AC',()=>{
 const scene=parseGds(file(cell('top',box))),flow={schema_version:1,source:'ngspice',analysis:'dc',x:[0],x_unit:'V',revision:0,project_id:scene.project_id,convention:'conventional',freshness:'stale',branches:[{id:'R1',name:'R1',from_net:'p',to_net:'0',values_A:[-1e-6],mapping:'unmapped',source_vector:'i(vsense)'}]};
 const imported=parseCurrentFlow(JSON.stringify({current_flow:flow}),scene);
 assert.equal(imported.freshness,'stale');assert.equal(imported.revision,scene.revision);assert.equal(imported.project_id,scene.project_id);assert.deepEqual(imported.branches[0].values_A,[-1e-6]);
 assert.throws(()=>parseCurrentFlow(JSON.stringify({...flow,freshness:'assumed'}),scene),/freshness/);
 assert.throws(()=>parseCurrentFlow(JSON.stringify({...flow,analysis:' AC '}),scene),/AC/);
 assert.equal(parseCurrentFlow(JSON.stringify({freshness:'stale',current_flow:{...flow,freshness:undefined}}),scene).freshness,'stale');
 assert.equal(parseCurrentFlow(JSON.stringify({freshness:'stale',current_flow:{...flow,freshness:'current'}}),scene).freshness,'stale');
 assert.equal(parseCurrentFlow(JSON.stringify({freshness:'current',current_flow:flow}),scene).freshness,'stale');
 assert.throws(()=>parseCurrentFlow(JSON.stringify({freshness:'assumed',current_flow:flow}),scene),/freshness/);
});
test('commercial current provenance stays explicit and unknown vendors are rejected',()=>{
 const scene=parseGds(file(cell('top',box))),base={schema_version:1,analysis:'op',x:[0],x_unit:'point',revision:0,project_id:scene.project_id,convention:'conventional',backend_profile_id:'operator-profile',tool:'spectre',branches:[{id:'probe',name:'Probe',from_net:'IN',to_net:'OUT',values_A:[-1e-6],mapping:'unmapped',source_vector:'VSENSE:p'}]};
 for(const source of ['spectre','hspice','primesim','commercial']){const value=parseCurrentFlow(JSON.stringify({...base,source}),scene);assert.equal(value.source,source);assert.equal(value.backend_profile_id,'operator-profile');assert.equal(value.tool,'spectre');assert.equal(value.geometry_linkage,'unverified');assert.equal(value.branches[0].mapping,'unmapped');assert.deepEqual(value.branches[0].values_A,[-1e-6]);}
 assert.equal(parseCurrentFlow(JSON.stringify({...base,source:'ngspice',geometry_linkage:'unverified',input_origin:'operator-recipe'}),scene).input_origin,'operator-recipe');
 assert.equal(parseCurrentFlow(JSON.stringify({...base,source:'spectre',geometry_linkage:'unverified',branches:[{...base.branches[0],mapping:'user_path',path_dbu:[['0','0'],['1','1']]}]}),scene).geometry_linkage,'unverified');
 assert.throws(()=>parseCurrentFlow(JSON.stringify({...base,source:'spectre',geometry_linkage:'guessed'}),scene),/geometry_linkage/);
 assert.throws(()=>parseCurrentFlow(JSON.stringify({...base,source:'unverified-tool'}),scene),/CurrentFlow/);
 assert.throws(()=>parseCurrentFlow(JSON.stringify({...base,source:'spectre',backend_profile_id:3}),scene),/provenance/);
});
