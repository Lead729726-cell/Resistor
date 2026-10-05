import {test,expect} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
// @ts-expect-error Node-only private main-process transport
import {runtimeConfig,workerRpc} from '../../scripts/runtime.mjs';

async function api(method:string,params:Record<string,unknown>={}){const value=await workerRpc(await runtimeConfig(),method,params);if(!value.ok)throw new Error(value.error.message);return value.result;}
test('Actual MOS current in 2D/3D, portable viewer result, and stale arrows withheld',async({page,browser})=>{
  test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const p=await api('project.create',{name:'Current viewer native verification',example:'mosfet'});
  await page.addInitScript(id=>localStorage.setItem('mos.last_project',id),p.id);await page.goto('/');await expect(page.getByTestId('app-ready')).toBeVisible();
  await page.getByTestId('tab-simulation').click();await page.getByRole('combobox',{name:'Analysis',exact:true}).selectOption('op');await page.getByTestId('run-simulation').click();
  const row=page.getByTestId('job-row').first();await expect(row).toContainText('완료',{timeout:90000});await expect(row).toContainText('PASS');
  const runId=await row.getAttribute('data-run-id');const run=await api('job.status',{run_id:runId});expect(run.current_flow.source).toBe('ngspice');
  const branch=run.current_flow.branches.find((b:any)=>b.mapping==='device_terminals');expect(branch.values_A[0]).toBeGreaterThan(0);expect(run.current_flow.branches.find((b:any)=>b.source_vector==='i(VD)').values_A[0]).toBeLessThan(0);
  await page.getByTestId('tab-layout3d').click();await expect(page.locator('canvas').first()).toHaveAttribute('data-current-arrow-count',/^[1-9]\d*$/);await expect(page.getByTestId(`current-value-${branch.id}`)).toContainText('µA');
  await page.getByTestId('tab-layout2d').click();await expect(page.locator('canvas').first()).toHaveAttribute('data-current-arrow-count',/^[1-9]\d*$/);
  const downloadPromise=page.waitForEvent('download');await page.getByTestId('export-viewer-bundle').click();const downloaded=await downloadPromise;const bundle=await readFile((await downloaded.path())!);const saved=JSON.parse(bundle.toString());expect(saved.scene.project_id).toBe(p.id);expect(saved.currentFlow.run_id).toBe(runId);
  const portable=await browser.newPage();const network:string[]=[];portable.on('request',r=>{if(/\/api\/rpc|\/rpc|\/events/.test(r.url()))network.push(r.url());});await portable.goto('/?mode=viewer');await portable.getByTestId('viewer-bundle-input').setInputFiles({name:'actual.register-view.json',mimeType:'application/json',buffer:bundle});await expect(portable.locator('canvas').first()).toHaveAttribute('data-current-arrow-count',/^[1-9]\d*$/);expect(network).toEqual([]);await portable.close();
  await api('schematic.apply_command',{project_id:p.id,command:{type:'update_device',id:'mn1',parameters:{w_um:1.3}}});await page.reload();await expect(page.getByTestId('app-ready')).toBeVisible();await expect(page.locator('canvas').first()).toHaveAttribute('data-current-arrow-count','0');await expect(page.locator('.mos-current-stale')).toContainText('STALE');expect(errors).toEqual([]);
  await mkdir('docs/evidence',{recursive:true});await writeFile('docs/evidence/native-current-viewer.json',JSON.stringify({project_id:p.id,run_id:runId,source:'actual ngspice OP',current_A:branch.values_A[0],two_and_three_dimensional_arrows:true,portable_bundle_no_rpc:true,stale_arrows_withheld:true,browser_errors:errors},null,2));
});

test('Local GDS file picker imports real bytes and matched PDK metadata through KLayout',async({page})=>{
  test.setTimeout(180000);const p=await api('project.create',{name:'Native local upload verification',example:'fixture'});await page.addInitScript(id=>localStorage.setItem('mos.last_project',id),p.id);await page.goto('/');await expect(page.getByTestId('app-ready')).toBeVisible();
  await page.getByRole('button',{name:'파일 가져오기 / Import layout',exact:true}).click();const dialog=page.getByRole('dialog');await page.getByTestId('local-layout-import-file').setInputFiles('examples/sky130/mosfet.gds');await dialog.getByLabel('App sidecar JSON (선택)').setInputFiles('examples/sky130/mosfet.gds.mos.json');await dialog.getByRole('button',{name:'파일 가져오기 / Import',exact:true}).click();await expect(dialog).not.toBeVisible({timeout:65000});
  const snapshot=await api('project.snapshot',{project_id:p.id}),scene=await api('view.get_scene',{project_id:p.id});expect(snapshot.pdk_id).toBe('sky130A');expect(snapshot.example).toBe('mosfet');expect(scene.shapes).toHaveLength(52);expect(snapshot.revision).toBe(2);
  await writeFile('docs/evidence/local-layout-file-import.json',JSON.stringify({project_id:p.id,revision:snapshot.revision,shape_count:scene.shapes.length,file_bytes:6772,pdk_id:snapshot.pdk_id,example:snapshot.example,actual_native_parser:'KLayout'},null,2));
});
