import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {selectEditionRelease,validateEditionReceipt,assertEditionUpdate} from '../apps/desktop/edition-updates.mjs';
import {RELEASES_URL} from '../apps/desktop/update-feed.mjs';
import {DesktopUpdater} from '../apps/desktop/updates.mjs';
import {applyInstallation,validateInstalledProduct,safeArchiveEntries} from '../apps/desktop/update-install.mjs';
import {editionRelease} from './fixtures/edition-release.mjs';
const choose=(data,edition='edu',platform='windows')=>selectEditionRelease(data,{edition,platform,currentVersion:'0.22.0'});
test('combined and edition-specific release feeds never cross product or CPU boundaries',()=>{
 const edu=editionRelease({edition:'edu'}),indust=editionRelease({edition:'indust'}),r={...edu.release,assets:[...edu.release.assets,...indust.release.assets]};
 assert.equal(choose([r]).asset.name,'Resistor-Edu-0.23.0-windows-x64.exe');assert.equal(choose([r],'indust').asset.name,'Resistor-Indust-0.23.0-windows-x64.exe');assert.equal(choose([indust.release]),null);assert.equal(choose([r],'edu','windows-arm64'),null);
 for(const target of ['windows-x64','windows-arm64','macos-arm64','macos-x64','linux-x64'])assert.equal(choose([editionRelease({edition:'edu',target}).release],'edu',target).asset.target,target);
});
test('missing/corrupt paired receipt, official URL, installer digest, duplicate and substituted metadata fail closed',()=>{
 const f=editionRelease({edition:'edu'});for(const mutate of [r=>r.assets.pop(),r=>r.assets[1].digest='bad',r=>r.assets[0].browser_download_url='https://evil.test/a',r=>r.assets[0].digest='bad',r=>r.assets.push(r.assets[0])]){const r=structuredClone(f.release);mutate(r);assert.throws(()=>choose([r]));}
 const u=choose([f.release]);assert.throws(()=>validateEditionReceipt({...f.receipt,edition:'indust'},u));assert.throws(()=>validateEditionReceipt({...f.receipt,source_revision:'not-hex'.repeat(7)},u));assert.throws(()=>assertEditionUpdate(u,'indust','windows'));
});
test('automatic download verifies receipt and bytes without automatically installing; cache/settings are edition scoped',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'resistor-edition-update-')),f=editionRelease({edition:'edu'});let installed=0;
 const fetchImpl=async url=>new Response(url===RELEASES_URL?JSON.stringify([f.release]):url.endsWith('.json')?f.receiptBody:f.body);
 const edu=new DesktopUpdater({edition:'edu',version:'0.22.0',platform:'win32',arch:'x64',userData:root,fetchImpl,install:async()=>{installed++;}}),indust=new DesktopUpdater({edition:'indust',version:'0.22.0',platform:'win32',arch:'x64',userData:root,fetchImpl});
 await edu.initialize();await indust.initialize();await edu.check({automatic:true});assert.equal(edu.status().status,'ready');assert.equal(installed,0);assert.match(edu.folder,/[\\/]updates[\\/]edu$/);assert.notEqual(edu.folder,indust.folder);
 await edu.preferences({automatic:false,channel:'stable'});assert.equal(indust.status().settings.automatic,true);await indust.check();assert.equal(indust.status().status,'current');
});
test('bad receipt cannot leave a downloadable candidate or run an installer',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'resistor-edition-bad-')),f=editionRelease({edition:'edu'});let installed=0;
 const u=new DesktopUpdater({edition:'edu',version:'0.22.0',platform:'win32',arch:'x64',userData:root,fetchImpl:async url=>new Response(url===RELEASES_URL?JSON.stringify([f.release]):'bad receipt'),install:async()=>{installed++;}});
 await u.initialize();await u.check();assert.equal(u.status().status,'error');assert.equal(u.status().update,null);await assert.rejects(u.download());await assert.rejects(u.apply());assert.equal(installed,0);
});
test('Linux edition replacement uses independent destinations and launchers and preserves the other edition',async()=>{
 const home=await mkdtemp(path.join(os.tmpdir(),'resistor-edition-paths-')),folder=path.join(home,'cache');await mkdir(folder);
 for(const edition of ['edu','indust']){const target=path.join(home,'.local/opt/resistor-'+edition,'0.23.0'),staging=path.join(path.dirname(target),'.resistor-update-'+edition);await mkdir(staging,{recursive:true});await writeFile(path.join(staging,'identity'),edition);const plan={id:edition,edition,product_id:'resistor.'+edition,home,folder,target,staging,version:'0.23.0',platform:'linux'};const receipt=await applyInstallation(plan,{launch:false});assert.equal(receipt.edition,edition);assert.equal(await readFile(path.join(target,'identity'),'utf8'),edition);}
 assert.equal(await readFile(path.join(home,'.local/opt/resistor-edu/0.23.0/identity'),'utf8'),'edu');
 assert.match(await readFile(path.join(home,'.local/share/applications/org.resistor.edu.desktop'),'utf8'),/Resistor Edu/);assert.match(await readFile(path.join(home,'.local/share/applications/org.register.eda.desktop'),'utf8'),/resistor-indust/);
});
test('Mac Edu plans cannot replace the Indust app; embedded edition and product name must agree',async()=>{
 const home=await mkdtemp(path.join(os.tmpdir(),'resistor-edition-mac-'));await assert.rejects(applyInstallation({id:'bad',edition:'edu',product_id:'resistor.edu',home,folder:home,target:path.join(home,'Applications/Resistor.app'),staging:path.join(home,'Applications/.resistor-update-x'),version:'0.23.0',platform:'darwin'}));
 validateInstalledProduct({name:'resistor-eda',productName:'Resistor Edu',version:'0.23.0'},'0.23.0',{schema_version:1,edition:'edu'},'edu');assert.throws(()=>validateInstalledProduct({name:'resistor-eda',productName:'Resistor',version:'0.23.0'},'0.23.0',{schema_version:1,edition:'indust'},'edu'));
 safeArchiveEntries('Resistor Edu.app/Contents/x\nREADME.txt\ninstall.cjs\nedition-installer.json\nInstall Resistor Edu.command','Resistor Edu.app',{mac:true,edition:'edu'});assert.throws(()=>safeArchiveEntries('Resistor.app/Contents/x','Resistor Edu.app',{mac:true,edition:'edu'}));
});
test('historical Indust preferences are read without modifying that folder or copying them into Edu',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'resistor-update-migration-'));await mkdir(path.join(root,'updates'));const original=JSON.stringify({automatic:false,channel:'stable'});await writeFile(path.join(root,'updates/preferences.json'),original);
 for(const edition of ['edu','indust']){const u=new DesktopUpdater({edition,version:'0.27.0',platform:'win32',arch:'x64',userData:root});await u.initialize();assert.equal(u.status().settings.automatic,edition==='edu');}
 assert.equal(await readFile(path.join(root,'updates/preferences.json'),'utf8'),original);
});
