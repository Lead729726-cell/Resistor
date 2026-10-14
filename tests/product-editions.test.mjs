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
 const root=await fixture(t);let requests=0,installs=0;const updater=new DesktopUpdater({edition:'edu',version:'0.27.0',userData:root,packaged:true,fetchImpl:async()=>{requests++;throw Error('must not fetch Indust feed');},install:async()=>{installs++;}});
 await updater.initialize();await updater.check();assert.equal(updater.status().status,'unsupported');await assert.rejects(updater.download(),/Edu/);await assert.rejects(updater.apply(),/Edu/);assert.equal(requests,0);assert.equal(installs,0);
});
for(const edition of [edu,indust])test('real MCP handshake identifies '+edition.name+' without exposing credentials',async t=>{
 const workspace=await fixture(t);const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve(process.env.REGISTER_MCP_ENTRY||'scripts/mcp.mjs')],env:{RESISTOR_EDITION:edition.edition,MOS_WORKSPACE:workspace},stderr:'pipe'});
 const client=new Client({name:'edition-qa',version:'1.0.0'});t.after(()=>client.close());await client.connect(transport);
 assert.equal(client.getServerVersion().name,edition.mcp_name);const tools=await client.listTools();assert.equal(tools.tools.length,48);
 const result=await client.callTool({name:'register_product_context',arguments:{}});assert.equal(result.isError,undefined);assert.equal(result.structuredContent.result.product_id,edition.id);assert.equal(result.structuredContent.product.id,edition.id);assert.equal(result.structuredContent.result.workspace,workspace);assert.equal(result.structuredContent.result.foundry_signoff,false);assert(!JSON.stringify(result).includes('token'));
});
