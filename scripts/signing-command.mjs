import {spawn} from 'node:child_process';
import path from 'node:path';
// No argument or environment logging: keychain/auth material stays in its provider.
export const runSigningCommand=(file,args,options={})=>new Promise((resolve,reject)=>{
 const child=spawn(file,args,{windowsHide:true,stdio:['ignore','pipe','pipe'],...options});let output='';
 const timer=setTimeout(()=>{child.kill();reject(Error(path.basename(file)+' signing command timed out.'));},options.timeout??120000);
 child.stdout?.on('data',b=>output=(output+b).slice(-2*1024*1024));child.stderr?.on('data',b=>output=(output+b).slice(-2*1024*1024));
 child.once('error',()=>{clearTimeout(timer);reject(Error('Cannot start signing tool: '+path.basename(file)));});
 child.once('close',code=>{clearTimeout(timer);code===0?resolve(output):reject(Error(path.basename(file)+' signing verification failed (exit '+code+').'));});
});
