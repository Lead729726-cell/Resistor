import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {unzipSync,strFromU8} from 'fflate';
const sha=b=>createHash('sha256').update(b).digest('hex');
test('portable workbook contains runnable inline code, matching CSP/digests, licenses and no native authority',async()=>{
 const out=path.resolve('.runtime/edu-workbook-package-test');
 const before=await Promise.all(['packages/ui/src/theme.css','public/appearance-init.js','platform/licensing/public-config.json'].map(async p=>[p,sha(await fs.readFile(p))]));
 execFileSync(process.execPath,['scripts/edu-workbook-release.mjs'],{env:{...process.env,RESISTOR_WORKBOOK_OUTPUT:out,RESISTOR_EDITION:'edu'},windowsHide:true});
 const zip=await fs.readFile(path.join(out,'Resistor-Edu-Workbook.zip')),entries=unzipSync(zip),receipt=JSON.parse(await fs.readFile(path.join(out,'release-receipt.json'),'utf8'));
 assert.equal(sha(zip),receipt.zip.sha256);
 const html=strFromU8(entries['Resistor-Edu-Workbook.html']),script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
 assert.equal(script.length,1);assert.ok(script[0][1].length>100000);
 const hash=createHash('sha256').update(script[0][1]).digest('base64');
 assert.ok(html.includes("script-src 'sha256-"+hash+"'"));assert.ok(html.includes("default-src 'none'"));
 assert.equal(/<(script|link|img)[^>]+(?:src|href)=["'](?:https?:|\/)/i.test(html),false);
 const manifest=JSON.parse(strFromU8(entries['manifest.json']));
 assert.equal(manifest.edition,'edu');assert.equal(manifest.actual_engine_included,false);assert.equal(manifest.official_native_installer,false);
 for(const [name,bytes]of Object.entries(entries)){assert.equal(name.includes('..'),false);assert.equal(/\.env|private-key|public-config|node_modules|worker|installer\.exe/.test(name),false);if(manifest.files[name])assert.equal(sha(bytes),manifest.files[name].sha256);}
 assert.deepEqual(Object.keys(manifest.files).sort(),Object.keys(entries).filter(n=>n!=='manifest.json').sort());
 for(const name of ['react','react-dom','scheduler','three'])assert.ok(entries['licenses/'+name+'.txt']?.length>300);
 for(const [name,hash]of before)assert.equal(sha(await fs.readFile(name)),hash,name+' must be preserved');
});
