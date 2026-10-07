import {spawn} from 'node:child_process';
import {access,readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url),metadata=JSON.parse(await readFile('package.json','utf8'));
const app=path.resolve(`release/${metadata.version}/Resistor-win32-x64`);await access(path.join(app,'Resistor.exe'));
const child=spawn(process.execPath,[require.resolve('electron-builder/out/cli/cli.js'),'--config','apps/desktop/builder.json','--prepackaged',app,'--win','--publish','never'],{stdio:'inherit',windowsHide:true});
const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});process.exitCode=code??1;
