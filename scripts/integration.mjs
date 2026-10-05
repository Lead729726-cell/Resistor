import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {startWorker} from './worker.mjs';
import {workerRpc} from './runtime.mjs';
const config=await startWorker();const report={client_date:'2026-09-30',tests:[],doctor:null};
async function call(method,params={}){const r=await workerRpc(config,method,params);assert.equal(r.ok,true,`${method}: ${r.error?.message}`);return r.result;}
async function check(name,fn){const before=performance.now();try{await fn();report.tests.push({name,result:'pass',elapsed_ms:performance.now()-before});console.log(`PASS ${name}`);}catch(e){report.tests.push({name,result:'fail',reason:e.message});console.error(`FAIL ${name}: ${e.message}`);process.exitCode=1;}}
await check('Authentication rejects missing and invalid session tokens',async()=>{
  for(const token of [undefined,'wrong-session']){const headers={'Content-Type':'application/json'};if(token)headers['X-MOS-Token']=token;const r=await fetch(`${config.url}/rpc`,{method:'POST',headers,body:JSON.stringify({method:'toolchain.doctor',params:{}})});assert.ok([401,403].includes(r.status));}
});
report.doctor=await call('toolchain.doctor');
const project=await call('project.create',{name:'Geometry integrity regression',example:'fixture'});const pid={project_id:project.id};
const original=await call('view.get_scene',pid);
await check('All authoritative scene coordinates remain decimal strings',async()=>{assert.ok(original.shapes.length>0);for(const shape of original.shapes)for(const coordinate of shape.polygon.flat()){assert.equal(typeof coordinate,'string');assert.match(coordinate,/^-?\d+$/);}});
await check('Backend rejects signed-int64 values beyond its coordinate build',async()=>{const r=await workerRpc(config,'layout.apply_command',{...pid,command:{type:'add_box',layer_id:original.layers[0].id,box:['9223372036854775800','0','9223372036854775805','100']}});assert.equal(r.ok,false);});
await check('Save/reopen retains exact geometry and stable occurrence IDs',async()=>{await call('project.save',pid);const reopened=await call('project.open',pid);assert.equal(reopened.id,project.id);const scene=await call('view.get_scene',pid);assert.deepEqual(scene.shapes,original.shapes);});
await check('Transaction undo/redo restores stable IDs and exact DBU geometry',async()=>{
  const shape=original.shapes.find(s=>s.cell_path===project.cell||!s.cell_path.includes('/'))??original.shapes[0];
  const step=String(project.grid_dbu*10);
  await call('layout.apply_command',{...pid,command:{type:'move_shape',id:shape.id,dx:step,dy:step}});const moved=await call('view.get_scene',pid);assert.notDeepEqual(moved.shapes,original.shapes);
  await call('layout.apply_command',{...pid,command:{type:'undo'}});const undone=await call('view.get_scene',pid);assert.deepEqual(undone.shapes,original.shapes);
  await call('layout.apply_command',{...pid,command:{type:'redo'}});const redone=await call('view.get_scene',pid);assert.deepEqual(redone.shapes,moved.shapes);
});
await check('GDSII and OASIS can be exported through actual KLayout',async()=>{for(const format of ['gds','oas']){const out=await call('layout.export',{...pid,format});assert.ok(out&&typeof out==='object');report[`${format}_export`]=out;}});
await check('Unsupported method cannot access arbitrary host process APIs',async()=>{const r=await fetch(`${config.url}/rpc`,{method:'POST',headers:{'Content-Type':'application/json','X-MOS-Token':config.token},body:JSON.stringify({method:'shell.exec',params:{command:'id'}})});const response=await r.json();assert.equal(response.ok,false);});
await mkdir('docs/evidence',{recursive:true});await writeFile('docs/evidence/transport-and-save.json',JSON.stringify(report,null,2));
console.log('Report: docs/evidence/transport-and-save.json');
