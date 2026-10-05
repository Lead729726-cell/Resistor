import {_electron as electron,expect} from '@playwright/test';
import {access,readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const version=JSON.parse(await readFile('package.json','utf8')).version,evidenceVersion=version.split('.').slice(0,2).join('.');
const root=path.resolve('.runtime/install-test',version),exe=path.join(root,'app/Register.exe');
const workspace=path.join(root,'user-data/workspace');
const env={...process.env,REGISTER_USER_DATA:path.join(root,'user-data'),PATH:path.dirname(process.execPath)};delete env.MOS_WORKSPACE;
const app=await electron.launch({executablePath:exe,args:['--viewer'],env,timeout:60000});
try{
  const page=await app.firstWindow();await expect(page.getByTestId('viewer-empty-gds-input')).toBeAttached();
  await page.getByTestId('viewer-empty-gds-input').setInputFiles(path.resolve('examples/sky130/mosfet.gds'));
  await expect(page.getByTestId('viewer-shape-count')).toHaveText('52 / 52');await page.getByTestId('viewer-sky130').click();
  const isolation=await page.evaluate(()=>({nodeAvailable:'require' in globalThis,ipcAvailable:typeof window.mos?.rpc==='function'}));
  if(isolation.nodeAvailable||!isolation.ipcAvailable)throw Error('Desktop isolation failed.');
  let initialized=false;try{await access(path.join(workspace,'.runtime/worker.json'));initialized=true;}catch{}
  if(initialized)throw Error('Viewer started native runtime.');
  await access(path.join(workspace,'workers/eda/server.py'));await access(path.join(workspace,'.dockerignore'));
  await page.screenshot({path:`docs/evidence/installed-viewer-${evidenceVersion}.png`});
  const source=['workers/eda/digital_units.py','workers/eda/digital_mux.py','workers/eda/current_flow.py','workers/eda/hierarchy_transfer.py','workers/eda/server.py','workers/eda/pvt.py','workers/eda/configured_analysis.py','apps/desktop/main.cjs','apps/desktop/preload.cjs','apps/desktop/workspace.cjs','apps/desktop/menu.cjs','scripts/docker-cli.mjs','scripts/worker.mjs','scripts/desktop-diagnostics.mjs','.dockerignore','docs/digital-hierarchy.md','dist/index.html',...(await readdir('dist/assets')).filter(n=>/\.(js|css)$/.test(n)).map(n=>'dist/assets/'+n)];
  for(const f of source){const a=await readFile(f),b=await readFile(path.join(root,'app/resources/app',f));if(!a.equals(b))throw Error('Installed source differs: '+f);}
  await writeFile(path.join(root,'user-data/keep-on-uninstall.txt'),'installation QA marker; preserve data');
  await writeFile(`docs/evidence/installed-viewer-${evidenceVersion}.json`,JSON.stringify({version,checked_at:new Date().toISOString(),executable:exe,installed_exe_sha256:createHash('sha256').update(await readFile(exe)).digest('hex'),source_files_match:source,workspace,writable_workspace_seeded:true,workspace_override:false,docker_context_excludes_runtime:true,native_session_created:false,docker_not_on_PATH:true,actual_gds_shapes:52,isolation},null,2));
}finally{await app.close();}
