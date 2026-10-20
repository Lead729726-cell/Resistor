// Unit/reference fixtures and exhaustive actual Icarus logic, no analog PASS claim.
import path from 'node:path';
import {runNative,nativeEnvironment} from './native-worker.mjs';
const root=process.cwd(),mode=process.env.SAR12_ENGINE_MODE||(process.platform==='win32'?'wsl':'native');
const unit='import sys,unittest;sys.path.insert(0,sys.argv[1]);unittest.main(module=None,argv=["sar12","test_sar12","test_sar_adc","test_research"])';
if(mode==='wsl'){
 if(process.platform!=='win32')throw Error('WSL QA is Windows-only; choose native mode on Mac/Linux.');
 const prefix=['--distribution',process.env.SAR12_WSL_DISTRIBUTION||'ResistorEDA','--exec'];
 const linuxRoot=(await runNative('wsl.exe',[...prefix,'wslpath','-a','-u',root])).trim();
 const settings=JSON.parse(await runNative('wsl.exe',[...prefix,'python3','-c','import pathlib,os,json;p=pathlib.Path.home()/".local/share/resistor";print(json.dumps({"python":str(p/"engine/bin/python3"),"path":str(p/"tools/bin")+":"+os.environ["PATH"]}))']));
 const exec=async args=>console.log((await runNative('wsl.exe',[...prefix,'env','PATH='+settings.path,settings.python,...args],{timeout:90000})).trim());
 await exec(['-c',unit,linuxRoot+'/workers/eda']);await exec([linuxRoot+'/scripts/sar12-controller-qa.py']);
}else if(mode==='native'){
 const resources=await nativeEnvironment(root,{prepare:false}),options={env:{...resources.environment,...resources.extra},timeout:90000};
 console.log((await runNative(resources.python,['-c',unit,path.join(root,'workers/eda')],options)).trim());
 console.log((await runNative(resources.python,[path.join(root,'scripts/sar12-controller-qa.py')],options)).trim());
}else throw Error('Select native or wsl for SAR12 QA.');
