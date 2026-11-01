import {spawn} from 'node:child_process';
import {access,readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {getProductEdition} from './edition-workspace.mjs';
import {eduWindowsBuilderConfig} from './edu-native-options.mjs';
import {assertLicenseReleaseReady} from './license-release-check.mjs';
const require=createRequire(import.meta.url),metadata=JSON.parse(await readFile('package.json','utf8'));
await assertLicenseReleaseReady();
const edition=getProductEdition(),name=edition.edition==='edu'?'Resistor Edu':'Resistor';
const app=path.resolve(`release/${metadata.version}/${name}-win32-x64`);await access(path.join(app,name+'.exe'));
let config='apps/desktop/builder.json';if(edition.edition==='edu'){await mkdir('release/edu-installers',{recursive:true});config='release/edu-installers/edu-windows-builder.json';await writeFile(config,JSON.stringify(eduWindowsBuilderConfig(JSON.parse(await readFile('apps/desktop/builder.json','utf8')),metadata.version),null,2));}
const child=spawn(process.execPath,[require.resolve('electron-builder/out/cli/cli.js'),'--config',config,'--prepackaged',app,'--win','--publish','never'],{stdio:'inherit',windowsHide:true});
const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});process.exitCode=code??1;
