import {test,expect,type Page} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
// @ts-expect-error Authenticated transport is main-process-only.
import {runtimeConfig,workerRpc} from '../../scripts/runtime.mjs';
const evidence='docs/evidence/workbench-usability';
const records:Record<string,unknown>[]=[];
async function api(method:string,params:Record<string,unknown>={}){const r=await workerRpc(await runtimeConfig(),method,params);expect(r.ok,r.error?.message).toBe(true);return r.result;}
async function open(page:Page,id:string){await page.addInitScript(id=>localStorage.setItem('mos.last_project',id),id);await page.goto('/eda');await expect(page.getByTestId('app-ready')).toBeVisible({timeout:60000});}
test.beforeAll(async()=>{await mkdir(evidence,{recursive:true});});
test.afterAll(async()=>{await writeFile(`${evidence}/verification.json`,JSON.stringify({checked_at:new Date().toISOString(),records,user_projects_modified:false,source:'actual authenticated native engine and browser UI'},null,2)+'\n');});

test('new circuit starts in its drawing workspace, keyboard focus stays in dialog, readiness explains missing input',async({page})=>{
 await page.setViewportSize({width:1366,height:720});const original=await api('project.create',{example:'schematic',name:'Usability preserved original'});await open(page,original.id);
 const trigger=page.getByRole('button',{name:'새 프로젝트',exact:true}).first();await trigger.click();
 const dialog=page.getByRole('dialog');await expect(page.getByTestId('project-example-select')).toHaveValue('schematic');
 await page.getByTestId('project-name').fill('Usability fresh circuit');await expect(page.getByTestId('project-create')).toBeInViewport();
 await dialog.getByRole('button',{name:'닫기',exact:true}).focus();await page.keyboard.press('Shift+Tab');await expect(page.getByTestId('project-create')).toBeFocused();
 await page.keyboard.press('Tab');await expect(dialog.getByRole('button',{name:'닫기',exact:true})).toBeFocused();
 await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(trigger).toBeFocused();await trigger.click();
 const created=page.waitForResponse(r=>r.url().endsWith('/api/rpc')&&r.request().postDataJSON()?.method==='project.create');
 await page.getByTestId('project-create').click();const fresh=(await(await created).json()).result;
 await expect(page.getByTestId('tab-schematic')).toHaveAttribute('aria-selected','true');await expect(page.locator('.schematic-svg')).toBeVisible();
 await expect(page.getByTestId('run-simulation')).toBeDisabled();await page.setViewportSize({width:1100,height:720});await expect(page.getByTestId('next-run-context')).toBeVisible();await page.getByTestId('next-run-context').click();
 await expect(page.getByTestId('readiness-simulation')).toContainText('빈 회로입니다');await expect(page.getByTestId('readiness-simulation').getByRole('button')).toBeDisabled();
 await expect(page.getByTestId('execution-readiness')).not.toContainText('PASS');await page.screenshot({path:`${evidence}/readiness-desktop.png`});
 await page.setViewportSize({width:390,height:844});const box=await dialog.evaluate(el=>({width:el.clientWidth,content:el.scrollWidth}));expect(box.content).toBeLessThanOrEqual(box.width+1);await page.screenshot({path:`${evidence}/readiness-mobile.png`});
 expect((await api('project.snapshot',{project_id:original.id})).revision).toBe(original.revision);expect((await api('project.snapshot',{project_id:fresh.id})).runs).toEqual([]);
 records.push({case:'blank circuit, readiness, dialog focus and narrow screen',original_project_id:original.id,new_project_id:fresh.id,blank_simulation_blocked:true,unexecuted_results_not_pass:true,keyboard_focus_trapped_and_restored:true,mobile_dialog:box});
});

test('Open discovers real projects by name and PDK, limits rendered cards and handles empty search',async({page})=>{
 const p=await api('project.create',{example:'schematic',name:'Usability searchable design '+crypto.randomUUID().slice(0,8)});await open(page,p.id);
 await page.getByRole('button',{name:'열기',exact:true}).first().click();const dialog=page.getByRole('dialog');
 await expect(page.getByTestId('workspace-search')).toBeVisible();await expect(page.getByRole('button',{name:'새로고침',exact:true})).toBeEnabled();
 const list=await api('project.list',{metadata_only:true});await expect(page.locator('.workspace-project-card')).toHaveCount(Math.min(50,list.length));
 if(list.length>50){await page.getByLabel('다음 프로젝트 페이지').click();await expect(page.locator('.workspace-project-card')).toHaveCount(Math.min(50,list.length-50));await page.getByLabel('이전 프로젝트 페이지').click();}
 await page.getByTestId('workspace-search').fill(p.name);await expect(page.locator('.workspace-project-card')).toHaveCount(1);await page.getByLabel('프로젝트 공정 필터').selectOption(p.pdk_id);await expect(page.locator('.workspace-project-card')).toHaveCount(1);
 await page.getByTestId('workspace-search').fill('No design has this unique search 73691');await expect(dialog).toContainText('검색 결과가 없습니다.');await dialog.getByRole('button',{name:'검색·필터 지우기'}).click();await expect(page.locator('.workspace-project-card')).toHaveCount(Math.min(50,list.length));
 await page.getByTestId('workspace-search').fill(p.id);await page.setViewportSize({width:390,height:844});const box=await dialog.evaluate(el=>({width:el.clientWidth,content:el.scrollWidth}));expect(box.content).toBeLessThanOrEqual(box.width+1);await page.screenshot({path:`${evidence}/project-search-mobile.png`});
 await page.locator('.workspace-project-card').getByRole('button',{name:'열기',exact:true}).click();await expect(dialog).not.toBeVisible();await expect(page.locator('.project-breadcrumb strong')).toHaveText(p.name);expect((await api('project.snapshot',{project_id:p.id})).revision).toBe(p.revision);
 records.push({case:'real project discovery without ID entry',project_id:p.id,metadata_entries:list.length,render_limit:50,pagination_exercised:list.length>50,search_by_name_and_id:true,pdk_filter:true,mobile_dialog:box,revision_preserved:true});
});

test('actual 0.9 V and 0.6 V runs keep selected evidence, logs and displayed waveform synchronized',async({page})=>{
 test.setTimeout(150000);let p=await api('project.create',{example:'schematic',name:'Usability actual result selection'});
 for(const device of [{id:'v1',name:'SUPPLY',kind:'voltage',pins:{'+':'VDD','-':'0'},parameters:{dc:1.8},x:100,y:100},{id:'r1',name:'TOP',kind:'resistor',pins:{'+':'VDD','-':'OUT'},parameters:{value:10000},x:240,y:100},{id:'r2',name:'BOTTOM',kind:'resistor',pins:{'+':'OUT','-':'0'},parameters:{value:10000},x:240,y:240}])p=await api('schematic.apply_command',{project_id:p.id,expected_revision:p.revision,command:{type:'add_device',device}});
 const simulate=async()=>{let r=await api('simulation.run',{project_id:p.id,analysis:'op'});for(let i=0;i<300&&['queued','running'].includes(r.execution_status);i++){await new Promise(resolve=>setTimeout(resolve,100));r=await api('job.status',{run_id:r.id});}expect(r.execution_status).toBe('completed');expect(r.analysis_result).toBe('unknown');return r;};
 const first=await simulate();expect(first.waveforms.find((w:any)=>w.name==='OUT').y[0]).toBeCloseTo(.9,8);
 p=await api('schematic.apply_command',{project_id:p.id,expected_revision:p.revision,command:{type:'update_device',id:'r2',parameters:{value:5000}}});const second=await simulate();expect(second.waveforms.find((w:any)=>w.name==='OUT').y[0]).toBeCloseTo(.6,8);
 await open(page,p.id);await page.getByTestId('tab-simulation').click();const result=page.getByLabel('Simulation result');const output=page.locator('.operating-point-grid>div').filter({has:page.locator('span',{hasText:/^OUT$/})}).locator('strong');
 await expect(result).toHaveValue(second.id);await expect(output).toHaveText('600m');await page.locator(`[data-run-id="${first.id}"]`).click();await expect(result).toHaveValue(first.id);await expect(output).toHaveText('900m');await expect(page.getByTestId('selected-run-evidence')).toContainText(first.id.slice(0,8));await expect(page.getByTestId('selected-run-freshness')).toContainText(`현재 설계는 r${p.revision}`);
 await result.selectOption(second.id);await expect(output).toHaveText('600m');await expect(page.getByTestId('selected-run-evidence')).toContainText(second.id.slice(0,8));await expect(page.getByTestId('selected-run-freshness')).toHaveCount(0);
 await page.getByTestId('selected-run-waveform').click();await expect(result).toHaveValue(second.id);await page.getByTestId('selected-run-evidence').getByRole('button',{name:'로그 보기',exact:true}).click();await expect(page.locator('.log-toolbar select')).toHaveValue(second.id);
 await page.getByTestId('tab-simulation').click();await page.screenshot({path:`${evidence}/actual-results-synchronized.png`});
 records.push({case:'actual numeric result selection',project_id:p.id,first_run_id:first.id,second_run_id:second.id,first_output_V:.9,second_output_V:.6,analysis_result:'unknown',selection_and_waveform_synchronized:true,stale_revision_explained:true,logs_synchronized:true});
});
