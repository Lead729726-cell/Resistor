import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
const target=path.resolve('platform/cloud/.secrets');
await fs.mkdir(target,{recursive:true,mode:0o700});
try{await fs.writeFile(path.join(target,'worker_session'),crypto.randomBytes(32).toString('hex'),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}
console.log('Private worker session file prepared; existing session preserved.');
