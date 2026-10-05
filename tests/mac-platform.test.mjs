import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {dockerEnvironment,dockerExecutable} from '../scripts/docker-cli.mjs';
const require=createRequire(import.meta.url);
const {prepareWorkspace}=require('../apps/desktop/workspace.cjs');
const {macMenuTemplate}=require('../apps/desktop/menu.cjs');
const missing=()=>Object.assign(Error('missing'),{code:'ENOENT'});

test('Finder launch finds Apple Silicon Docker without a shell and preserves credential helper PATH',async()=>{
  const visited=[];const env={PATH:'/usr/bin:/bin'};
  const executable=await dockerExecutable({platform:'darwin',env,home:'/Users/test',check:async candidate=>{visited.push(candidate);if(candidate!=='/opt/homebrew/bin/docker')throw missing();}});
  assert.equal(executable,'/opt/homebrew/bin/docker');assert(visited.includes('/Applications/Docker.app/Contents/Resources/bin/docker'));
  assert(dockerEnvironment({platform:'darwin',env,home:'/Users/test'}).PATH.includes('/Users/test/.docker/bin'));
  assert.equal(env.PATH,'/usr/bin:/bin');
});
test('Finder discovery handles Desktop and user CLI locations, preserves paths with spaces',async()=>{
  for(const location of ['/Applications/Docker.app/Contents/Resources/bin/docker','/Users/Design User/.docker/bin/docker','/usr/local/bin/docker']){
    assert.equal(await dockerExecutable({platform:'darwin',env:{PATH:'/usr/bin'},home:'/Users/Design User',check:async candidate=>{if(candidate!==location)throw missing();}}),location);
  }
});
test('explicit Docker path never falls back, relative paths are rejected, missing CLI remains actionable',async()=>{
  await assert.rejects(dockerExecutable({platform:'darwin',env:{REGISTER_DOCKER_PATH:'./docker'}}),/absolute/);
  const visited=[];await assert.rejects(dockerExecutable({platform:'darwin',env:{REGISTER_DOCKER_PATH:'/absent/docker'},check:async p=>{visited.push(p);throw missing();}}),{code:'ENOENT'});
  assert.deepEqual(visited,['/absent/docker']);
  await assert.rejects(dockerExecutable({platform:'darwin',env:{PATH:'.'},home:'/Users/test',check:async()=>{throw missing();}}),{code:'ENOENT'});
});
test('Windows uses its normal CLI lookup and supplied environment',async()=>{
  assert.equal(await dockerExecutable({platform:'win32',env:{}}),'docker');
  assert.deepEqual(dockerEnvironment({platform:'win32',env:{PATH:'C:\\Docker',MARKER:'retained'}}),{PATH:'C:\\Docker',MARKER:'retained'});
});
test('read-only app resources seed user data; later app replacement preserves edits and adds new samples',async()=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'register-mac-workspace-')),root=path.join(temp,'Applications/Register.app/Contents/Resources/app'),userData=path.join(temp,'User Data');
  for(const folder of ['workers','adapters','examples','platform/commercial']){await mkdir(path.join(root,folder),{recursive:true});await writeFile(path.join(root,folder,'seed.txt'),'original');}
  await writeFile(path.join(root,'.dockerignore'),'.runtime\n.secrets\n');
  const options={root,userData,executable:path.join(root,'Register'),packaged:true};
  const workspace=await prepareWorkspace(options);assert.equal(workspace,path.join(userData,'workspace'));
  for(const folder of ['workers','adapters','examples','platform/commercial'])await writeFile(path.join(workspace,folder,'seed.txt'),'user content');
  await mkdir(path.join(workspace,'.runtime/eda'),{recursive:true});await writeFile(path.join(workspace,'.runtime/eda/project.json'),'saved circuit');
  await writeFile(path.join(root,'examples/new.gds'),'new sample');
  await writeFile(path.join(workspace,'.dockerignore'),'.runtime\ncustom exclusion\n');
  assert.equal(await prepareWorkspace(options),workspace);
  for(const folder of ['workers','adapters','examples','platform/commercial'])assert.equal(await readFile(path.join(workspace,folder,'seed.txt'),'utf8'),'user content');
  assert.equal(await readFile(path.join(workspace,'.runtime/eda/project.json'),'utf8'),'saved circuit');assert.equal(await readFile(path.join(workspace,'examples/new.gds'),'utf8'),'new sample');
  assert.equal(await readFile(path.join(workspace,'.dockerignore'),'utf8'),'.runtime\ncustom exclusion\n');
});
test('Mac menus have native quit/edit/window roles and circuit commands reach the renderer',()=>{
  const commands=[],menu=macMenuTemplate({name:'레지스터',send:c=>commands.push(c)});
  assert(menu[0].submenu.some(i=>i.role==='quit'));assert(menu.some(i=>i.role==='windowMenu'));
  const items=menu.flatMap(i=>i.submenu??[]);
  for(const id of ['register-save','register-undo','register-redo'])items.find(i=>i.id===id).click();
  assert.deepEqual(commands,['save','undo','redo']);assert(items.some(i=>i.role==='paste'));
});

test('only release development packages reuse a checkout; an installed app under that checkout seeds its own user data',async()=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'register-installed-workspace-')),checkout=path.join(temp,'checkout'),root=path.join(temp,'bundle'),userData=path.join(temp,'user-data');
  for(const folder of ['workers','adapters','examples','platform/commercial']){await mkdir(path.join(root,folder),{recursive:true});await writeFile(path.join(root,folder,'seed.txt'),'packaged');}
  await writeFile(path.join(root,'.dockerignore'),'.runtime\n');
  await mkdir(path.join(checkout,'.runtime'),{recursive:true});await mkdir(path.join(checkout,'workers/eda'),{recursive:true});
  await writeFile(path.join(checkout,'.runtime/worker.json'),'test session, never loaded');await writeFile(path.join(checkout,'workers/eda/server.py'),'checkout source');
  const options={root,userData,packaged:true};
  assert.equal(await prepareWorkspace({...options,executable:path.join(checkout,'release/0.14/Register.exe')}),checkout);
  assert.equal(await prepareWorkspace({...options,executable:path.join(checkout,'.runtime/installed/Register.exe')}),path.join(userData,'workspace'));
  assert.equal(await readFile(path.join(checkout,'workers/eda/server.py'),'utf8'),'checkout source');
});

test('r4 reopening an r3 design folder restores missing server and backend files without changing designs',async()=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'register-r3-workspace-upgrade-')),userData=path.join(temp,'User Data'),workspace=path.join(userData,'workspace');
  await mkdir(path.join(workspace,'.runtime/eda'),{recursive:true});await mkdir(path.join(workspace,'workers/eda'),{recursive:true});
  await writeFile(path.join(workspace,'.runtime/eda/user-design'),'keep circuit');await writeFile(path.join(workspace,'workers/eda/Dockerfile'),'user engine customization');
  await prepareWorkspace({root:process.cwd(),userData,executable:path.join(temp,'Applications/Register.app/Contents/MacOS/Register'),packaged:true});
  for(const file of ['workers/eda/server.py','workers/eda/bootstrap.py','platform/commercial/runner.py','platform/commercial/agent.py'])assert((await readFile(path.join(workspace,file))).length>0);
  assert.equal(await readFile(path.join(workspace,'.runtime/eda/user-design'),'utf8'),'keep circuit');assert.equal(await readFile(path.join(workspace,'workers/eda/Dockerfile'),'utf8'),'user engine customization');
});
