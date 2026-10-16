import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {DesktopUpdater} from '../apps/desktop/updates.mjs';
const userData=await mkdtemp(path.join(os.tmpdir(),'resistor-public-update-')),checks=[];
for(const edition of ['edu','indust'])for(const [platform,arch]of [['win32','x64'],['win32','arm64'],['darwin','arm64'],['darwin','x64'],['linux','x64']]){
 const manager=new DesktopUpdater({version:'0.27.0',edition,platform,arch,userData,packaged:false});await manager.initialize();await manager.check();const s=manager.status();assert.equal(s.status,'available',s.message);assert.equal(s.update.edition,edition);assert.equal(s.update.product_id,'resistor.'+edition);assert.ok(s.update.source_revision);
 checks.push({edition,platform,arch,status:s.status,version:s.update.version,file:s.update.asset.name,sha256:s.update.asset.sha256,source_revision:s.update.source_revision,receipt_sha256:s.update.receipt.sha256});
}
const report={schema_version:1,checked_at:new Date().toISOString(),checks,passed:checks.length,installer_downloaded:false,installer_executed:false,metadata_and_build_receipt_verified:true};
await mkdir('docs/evidence/edition-updates',{recursive:true});await writeFile('docs/evidence/edition-updates/live-feed.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
