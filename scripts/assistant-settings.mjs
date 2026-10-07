import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {status} from './design-assistant.mjs';
const folder=path.resolve('.runtime/assistant'),file=path.join(folder,'settings.json');
const args=process.argv.slice(2),allowed=['budget-usd','ollama-model','ollama-url'];
let config={};try{config=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
for(const arg of args){const match=arg.match(/^--([^=]+)=(.+)$/);if(!match||!allowed.includes(match[1]))throw Error('Use --budget-usd=N, --ollama-model=NAME or --ollama-url=http://127.0.0.1:11434');const [,key,value]=match;if(key==='budget-usd'){const cap=Number(value);if(!Number.isFinite(cap)||cap<0||cap>100)throw Error('Budget must be US$0..100. Set only the amount you explicitly authorize.');config.budget_usd=cap;}else if(key==='ollama-url'){const url=new URL(value);if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Ollama must be loopback HTTP.');config.ollama_url=url.origin;}else{if(value.length>120)throw Error('Model name is too long.');config.ollama_model=value;}}
if(args.length){await mkdir(folder,{recursive:true});await writeFile(file,JSON.stringify(config,null,2)+'\n',{mode:0o600});}
console.log(JSON.stringify(await status(process.cwd()),null,2));
