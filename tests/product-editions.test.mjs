import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,access,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {getProductEdition,prepareEditionWorkspace,defaultEditionWorkspace} from '../scripts/edition-workspace.mjs';
import {DesktopUpdater} from '../apps/desktop/updates.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const require=createRequire(import.meta.url);
const {configureAppIdentity}=require('../apps/desktop/identity.cjs');
const {rendererDirectory}=require('../apps/desktop/renderer.cjs');
const edu=getProductEdition({edition:'edu',env:{}}),indust=getProductEdition({edition:'indust',env:{}});
async function fixture(t){const root=await mkdtemp(path.join(os.tmpdir(),'resistor-editions-'));t.after(async()=>{assert.equal(path.dirname(root),os.tmpdir());await rm(root,{recursive:true,force:true});});return root;}
test('branch configuration and explicit edition override are validated',async t=>{
 const root=await fixture(t);await writeFile(path.join(root,'product-edition.json'),JSON.stringify({schema_version:1,edition:'edu'}));
 assert.equal(getProductEdition({root,env:{}}).id,'resistor.edu');assert.equal(getProductEdition({root,env:{RESISTOR_EDITION:'indust'}}).id,'resistor.indust');
 assert.throws(()=>getProductEdition({root,env:{RESISTOR_EDITION:'unknown'}}));
 await writeFile(path.join(root,'product-edition.json'),'{"schema_version":9,"edition":"edu"}');assert.throws(()=>getProductEdition({root,env:{}}));
});
test('Edu data and engine do not reuse or overwrite the historical workspace',async t=>{
 const root=await fixture(t);for(const folder of ['adapters','examples/sky130','platform/commercial'])await mkdir(path.join(root,folder),{recursive:true});
 await mkdir(path.join(root,'.runtime'),{recursive:true});await writeFile(path.join(root,'.runtime/worker.json'),'{"url":"http://127.0.0.1:18765","token":"industrial"}');
 await writeFile(path.join(root,'examples/sky130/example.txt'),'public seed');await writeFile(path.join(root,'examples/sky130/.env.local'),'private');await writeFile(path.join(root,'examples/sky130/key.pem'),'private');
 const workspace=await prepareEditionWorkspace({root,edition:edu});assert.equal(workspace,defaultEditionWorkspace(root,edu));assert.notEqual(workspace,root);
 const first=JSON.parse(await readFile(path.join(workspace,'.runtime/worker.json'),'utf8'));assert.equal(first.url,'http://127.0.0.1:18775');assert.equal(first.token.length,64);
 await assert.rejects(access(path.join(workspace,'examples/sky130/.env.local')));await assert.rejects(access(path.join(workspace,'examples/sky130/key.pem')));
 await writeFile(path.join(workspace,'examples/sky130/example.txt'),'saved learner edits');await prepareEditionWorkspace({root,edition:edu});
 assert.equal(await readFile(path.join(workspace,'examples/sky130/example.txt'),'utf8'),'saved learner edits');assert.equal(JSON.parse(await readFile(path.join(workspace,'.runtime/worker.json'),'utf8')).token,first.token);
 assert.equal(JSON.parse(await readFile(path.join(root,'.runtime/worker.json'),'utf8')).token,'industrial');
 await assert.rejects(prepareEditionWorkspace({root,edition:edu,workspace:root}),/own workspace/);
 await writeFile(path.join(workspace,'.runtime/worker.json'),'{"url":"http://127.0.0.1:18765"}');await assert.rejects(prepareEditionWorkspace({root,edition:edu}),/dedicated engine/);
 await writeFile(path.join(workspace,'.runtime/product-context.json'),'{"product_id":"resistor.indust"}');await assert.rejects(prepareEditionWorkspace({root,edition:edu}),/another product/);
 assert.equal(await prepareEditionWorkspace({root,edition:indust}),root);
});
test('matching Edu registry reuses its workspace; another checkout or product does not',async t=>{
 const root=await fixture(t),workspace=path.join(root,'existing-edu');await mkdir(path.join(root,'.runtime'),{recursive:true});await mkdir(path.join(workspace,'.runtime'),{recursive:true});
 await writeFile(path.join(workspace,'.runtime/product-context.json'),JSON.stringify({product_id:'resistor.edu'}));
 const file=path.join(root,'.runtime/product-workspaces.json'),entry={checkout:root,existing_demo_workspace:workspace};await writeFile(file,JSON.stringify({edu:entry}));assert.equal(defaultEditionWorkspace(root,edu),workspace);
 await writeFile(file,JSON.stringify({edu:{...entry,checkout:path.join(root,'another-checkout')}}));assert.notEqual(defaultEditionWorkspace(root,edu),workspace);
 await writeFile(file,JSON.stringify({edu:entry}));await writeFile(path.join(workspace,'.runtime/product-context.json'),JSON.stringify({product_id:'resistor.indust'}));assert.notEqual(defaultEditionWorkspace(root,edu),workspace);
 assert.equal(JSON.parse(await readFile(path.join(workspace,'.runtime/product-context.json'),'utf8')).product_id,'resistor.indust');
});
test('app names are distinct while Indust keeps existing user designs in place',()=>{
 const observed=[];for(const edition of [edu,indust]){const app={getPath:()=>os.tmpdir(),setName:name=>observed.push(name),setPath:(_key,value)=>observed.push(value)};configureAppIdentity(app,{edition});}
 assert.deepEqual(observed,[edu.name,path.join(os.tmpdir(),'Resistor Edu'),indust.name,path.join(os.tmpdir(),'레지스터')]);
});
test('desktop rejects another edition renderer rather than mislabeling it',async t=>{
 const root=await fixture(t);await mkdir(path.join(root,'dist'),{recursive:true});await writeFile(path.join(root,'dist/index.html'),'legacy renderer');
 assert.equal(rendererDirectory(root,indust),path.join(root,'dist'));assert.throws(()=>rendererDirectory(root,edu),/Build Resistor Edu/);
 await mkdir(path.join(root,'dist-edu'),{recursive:true});await writeFile(path.join(root,'dist-edu/index.html'),'edu renderer');await writeFile(path.join(root,'dist-edu/product-context.json'),JSON.stringify({product_id:edu.id}));
 assert.equal(rendererDirectory(root,edu),path.join(root,'dist-edu'));
 await writeFile(path.join(root,'dist-edu/product-context.json'),JSON.stringify({product_id:indust.id}));assert.throws(()=>rendererDirectory(root,edu),/another edition/);
});
test('Edu updater cannot download or apply a historical Indust installer',async t=>{
 const root=await fixture(t);let requests=0,installs=0;const updater=new DesktopUpdater({edition:'edu',version:'0.27.0',userData:root,packaged:true,fetchImpl:async()=>{requests++;return new Response(JSON.stringify([{tag_name:'v0.99.0',draft:false,prerelease:true,assets:[]}]));},install:async()=>{installs++;}});
 await updater.initialize();await updater.check();assert.equal(updater.status().status,'current');assert.equal(updater.status().edition,'edu');await assert.rejects(updater.download(),/새 버전/);await assert.rejects(updater.apply(),/검증된/);assert.equal(requests,1);assert.equal(installs,0);
});
for(const edition of [edu,indust])test('real MCP handshake identifies '+edition.name+' without exposing credentials',async t=>{
 const workspace=await fixture(t);const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve(process.env.REGISTER_MCP_ENTRY||'scripts/mcp.mjs')],env:{RESISTOR_EDITION:edition.edition,MOS_WORKSPACE:workspace},stderr:'pipe'});
 const client=new Client({name:'edition-qa',version:'1.0.0'});t.after(()=>client.close());await client.connect(transport);
 assert.equal(client.getServerVersion().name,edition.mcp_name);const tools=await client.listTools();assert.equal(tools.tools.length,edition.edition==='edu'?76:48);
 for(const name of ['register_learning_dashboard','register_edu_assignments','register_edu_references','register_study_bank','register_study_recommend','register_study_generate','register_study_submit','register_study_history','register_study_coach_preview','register_study_coach_run','register_study_coach_history'])assert.equal(tools.tools.some(t=>t.name===name),edition.edition==='edu','Course material belongs to the Edu tool surface.');
 if(edition.edition==='edu'){const dashboard=await client.callTool({name:'register_learning_dashboard',arguments:{}});assert.equal(dashboard.isError,undefined);assert.equal(dashboard.structuredContent.result.read_only,true);assert.equal(dashboard.structuredContent.result.edition,'edu');assert.equal(dashboard.structuredContent.result.records.length,0);assert.equal(tools.tools.find(t=>t.name==='register_learning_dashboard').annotations.readOnlyHint,true);const bank=await client.callTool({name:'register_study_bank',arguments:{}});assert.equal(bank.isError,undefined);assert.equal(bank.structuredContent.result.questions.length,76);assert.equal(bank.structuredContent.context.engine.id,'shared-calculator-and-study-rubric');assert.equal(bank.structuredContent.context.project_id,null);const recommendation=await client.callTool({name:'register_study_recommend',arguments:{}});assert.equal(recommendation.structuredContent.result.recommendation.tokens_used,0);assert.equal(recommendation.structuredContent.context.edition,'edu');const q=bank.structuredContent.result.questions[0];const coach=await client.callTool({name:'register_study_coach_preview',arguments:{target:{kind:'question',question_id:q.id,question_version:q.version,purpose:'qa'},goal:'hint'}});assert.equal(coach.isError,undefined);assert.equal(coach.structuredContent.context.edition,'edu');assert.equal(coach.structuredContent.result.policy.judge.model,'gpt-6-luna');assert.equal(coach.structuredContent.result.policy.executor.model,'gpt-6.1-sol');assert.equal(coach.structuredContent.result.new_provider_calls,2);assert(coach.structuredContent.result.blocked_reason);assert.equal(tools.tools.find(t=>t.name==='register_study_coach_preview').annotations.readOnlyHint,true);assert.equal(tools.tools.some(t=>t.name==='register_study_coach_reflect'),false);}
 const result=await client.callTool({name:'register_product_context',arguments:{}});assert.equal(result.isError,undefined);assert.equal(result.structuredContent.result.product_id,edition.id);assert.equal(result.structuredContent.product.id,edition.id);assert.equal(result.structuredContent.result.workspace,workspace);assert.equal(result.structuredContent.result.foundry_signoff,false);assert(!JSON.stringify(result).includes('token'));
});

test('installed Edu tutorial opens only its fixed packaged MP4 and never starts an engine',async()=>{
 const {openEduTutorial}=await import('../apps/desktop/edu-tutorial.cjs');const stage=await mkdtemp(path.join(os.tmpdir(),'edu-tutorial-'));
 try{await mkdir(path.join(stage,'edu-study-tutorial'));const file=path.join(stage,'edu-study-tutorial','Resistor-Edu-AI-Study-KO.mp4');let opened=[];const openPath=async p=>{opened.push(p);return '';};await assert.rejects(openEduTutorial({rendererRoot:stage,edition:'edu',openPath}),/영상 파일/);await writeFile(file,'fixture-media');await assert.rejects(openEduTutorial({rendererRoot:stage,edition:'indust',openPath}),/Edu/);assert.equal(opened.length,0);assert.equal((await openEduTutorial({rendererRoot:stage,edition:'edu',openPath})).opened,true);assert.deepEqual(opened,[file]);await assert.rejects(openEduTutorial({rendererRoot:stage,edition:'edu',openPath:async()=> 'fixture-player-error'}),/플레이어/);}
 finally{await rm(stage,{recursive:true,force:true});}
});
