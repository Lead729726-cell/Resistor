import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';

const run=(file,args)=>new Promise((resolve,reject)=>{
  const child=spawn(file,args,{stdio:'inherit',windowsHide:true});
  child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(`Mac signing command failed: ${file} (${code})`)));
});
let signer;
async function linuxSigner(){
  if(process.platform!=='linux'||process.arch!=='x64')throw Error('Cross signing is pinned for the Linux x64 builder.');
  const name='apple-codesign-0.29.0-x86_64-unknown-linux-musl';
  const url=`https://github.com/indygreg/apple-platform-rs/releases/download/apple-codesign/0.29.0/${name}.tar.gz`;
  const response=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error(`Signing tool download failed (${response.status}).`);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(createHash('sha256').update(bytes).digest('hex')!=='dbe85cedd8ee4217b64e9a0e4c2aef92ab8bcaaa41f20bde99781ff02e600002')throw Error('Signing tool checksum mismatch.');
  const temporary=await mkdtemp(path.join(os.tmpdir(),'register-signer-')),archive=path.join(temporary,'tool.tar.gz');
  await writeFile(archive,bytes);await run('tar',['-xzf',archive,'-C',temporary]);
  return path.join(temporary,name,'rcodesign');
}
export async function signMacApp(app){
  const entitlements=path.resolve('apps/desktop/mac-entitlements.plist');await readFile(entitlements);
  if(process.platform==='darwin'){
    await run('/usr/bin/codesign',['--force','--deep','--sign','-','--timestamp=none','--entitlements',entitlements,app]);
    await run('/usr/bin/codesign',['--verify','--deep','--strict','--verbose=2',app]);
  }else{
    signer??=linuxSigner();
    await run(await signer,['--config-file','/dev/null','sign','--timestamp-url','none','--entitlements-xml-file',entitlements,'--entitlements-xml-file',`Contents/Frameworks/Register Helper.app:${entitlements}`,'--entitlements-xml-file',`Contents/Frameworks/Register Helper (GPU).app:${entitlements}`,'--entitlements-xml-file',`Contents/Frameworks/Register Helper (Renderer).app:${entitlements}`,'--entitlements-xml-file',`Contents/Frameworks/Register Helper (Plugin).app:${entitlements}`,app]);
  }
  return {ad_hoc_signed:true,hardened_runtime:false,developer_id_signed:false,notarized:false,signing_tool:process.platform==='darwin'?'macOS codesign':'apple-codesign 0.29.0'};
}
