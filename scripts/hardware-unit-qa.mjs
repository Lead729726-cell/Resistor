// Discover unittest classes without importing legacy top-level integration scripts.
import {readdir,readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {runNative,nativeEnvironment,nativeSettings} from './native-worker.mjs';
const root=process.cwd(),workspace=path.resolve(root,'.runtime/hardware/lab');
const names=[];for(const f of await readdir('workers/eda'))if(/^test_.*\.py$/.test(f)&&/unittest\.TestCase/.test(await readFile('workers/eda/'+f,'utf8')))names.push(f.slice(0,-3));
await mkdir('.runtime/hardware',{recursive:true});
const code='import sys,unittest,json;sys.path.insert(0,sys.argv[1]);suite=unittest.defaultTestLoader.loadTestsFromNames(sys.argv[3:]);stream=open(sys.argv[2],"w");r=unittest.TextTestRunner(stream=stream,verbosity=2).run(suite);stream.close();print(json.dumps({"edition":"Resistor Indust","tests_run":r.testsRun,"passed":r.testsRun-len(r.failures)-len(r.errors)-len(r.skipped),"failures":len(r.failures),"errors":len(r.errors),"skipped":[{"test":str(t),"reason":reason} for t,reason in r.skipped]}));sys.exit(not r.wasSuccessful())';
const settings=await nativeSettings(workspace);
if(process.platform==='win32'&&settings.mode==='wsl'){
 const prefix=['--distribution',settings.wsl_distribution||'ResistorEDA','--exec'];
 const query=async args=>(await runNative('wsl.exe',[...prefix,...args],{timeout:60000})).trim();
 const location=JSON.parse(await query(['python3','-c','import os,pathlib,json;p=pathlib.Path.home()/".local/share/resistor";print(json.dumps({"python":str(p/"engine/bin/python3"),"pdk":str(p/"pdks"),"path":str(p/"tools/bin")+":"+os.environ["PATH"]}))']));
 const linuxRoot=await query(['wslpath','-a','-u',root]),pdk=settings.pdk_root?await query(['wslpath','-a','-u',settings.pdk_root]):location.pdk;
 console.log(await query(['env','PDK_ROOT='+pdk,'PATH='+location.path,location.python,'-B','-c',code,linuxRoot+'/workers/eda',linuxRoot+'/.runtime/hardware/python-unit-native.log',...names.sort()]));
}else{
 const env=await nativeEnvironment(workspace,{resourcesRoot:root,prepare:false});
 console.log(await runNative(env.python,['-B','-c',code,path.join(root,'workers/eda'),path.join(root,'.runtime/hardware/python-unit-native.log'),...names.sort()],{env:{...env.environment,...env.extra},timeout:120000}));
}
