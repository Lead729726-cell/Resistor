import {mkdir,readFile,writeFile,cp} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
export const {getProductEdition}=require('../apps/desktop/product-edition.cjs');
export function defaultEditionWorkspace(root,edition){if(edition.edition==='edu'){try{const registry=JSON.parse(readFileSync(path.join(root,'.runtime/product-workspaces.json'),'utf8')),entry=registry.edu;if(entry?.checkout&&path.resolve(entry.checkout)===path.resolve(root)&&path.isAbsolute(entry.existing_demo_workspace)){const marker=JSON.parse(readFileSync(path.join(entry.existing_demo_workspace,'.runtime/product-context.json'),'utf8'));if(marker.product_id==='resistor.edu')return path.resolve(entry.existing_demo_workspace);}}catch(e){if(e.code!=='ENOENT')throw e;}}return edition.edition==='edu'?path.join(path.resolve(root),'.runtime/editions/edu/workspace'):path.resolve(root);}
export async function prepareEditionWorkspace({root=process.cwd(),workspace,edition=getProductEdition({root})}){
  root=path.resolve(root);workspace=path.resolve(workspace??defaultEditionWorkspace(root,edition));
  if(edition.edition==='indust')return workspace;
  if(workspace===root)throw Error('Edu needs its own workspace; select a separate directory instead of the industrial source workspace.');
  await mkdir(path.join(workspace,'.runtime'),{recursive:true});
  const marker=path.join(workspace,'.runtime/product-context.json');
  try{const previous=JSON.parse(await readFile(marker,'utf8'));if(previous.product_id!==edition.id)throw Error('This workspace belongs to another product edition.');}catch(e){if(e.code!=='ENOENT')throw e;}
  for(const folder of ['adapters','examples/sky130','platform/commercial'])await cp(path.join(root,folder),path.join(workspace,folder),{recursive:true,force:false,errorOnExist:false,filter:file=>!file.split(/[\\/]/).some(part=>['.secrets','__pycache__','.runtime'].includes(part))&&!path.basename(file).startsWith('.env')&&!/\.(?:pem|key|p12|pfx|sqlite3?)$/i.test(file)});
  const file=path.join(workspace,'.runtime/worker.json');
  try{await writeFile(file,JSON.stringify({url:'http://127.0.0.1:'+edition.worker_port,token:randomBytes(32).toString('hex')}),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}
  const config=JSON.parse(await readFile(file,'utf8'));
  if(config.url!=='http://127.0.0.1:'+edition.worker_port)throw Error('Edu needs its dedicated engine port '+edition.worker_port+'. Choose a separate Edu workspace.');
  await writeFile(path.join(workspace,'.runtime/product-context.json'),JSON.stringify({schema_version:1,product_id:edition.id,edition:edition.edition,workspace})+'\n');
  return workspace;
}
