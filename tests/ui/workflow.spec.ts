import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';

test('Actual inverter: simulation, independent DRC/LVS/PEX, post-layout waveform, save/reopen and stale edits',async({page})=>{
  test.setTimeout(360000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.getByTestId('app-ready')).toBeVisible();
  await expect(page.getByTestId('scene-loaded-count')).toHaveAttribute('data-count',/^[1-9]\d*$/);
  await page.getByRole('button',{name:'새 프로젝트',exact:true}).first().click();
  const dialog=page.getByRole('dialog');await dialog.getByLabel('프로젝트 이름').fill('Verified UI inverter');
  await dialog.getByRole('button',{name:/CMOS inverter/}).click();await page.getByTestId('project-create').click();
  await expect(dialog).not.toBeVisible();await expect(page.locator('.project-breadcrumb strong')).toContainText('Verified UI inverter');
  for(const kind of ['simulation','drc','lvs','pex']){
    const before=await page.getByTestId('job-row').count();
    await page.getByTestId(`run-${kind}`).click();
    await expect(page.getByTestId('job-row')).toHaveCount(before+1,{timeout:90000});
    const row=page.getByTestId('job-row').filter({hasText:kind}).first();
    await expect(row).toContainText('완료',{timeout:90000});await expect(row).toContainText('PASS');
  }
  await page.getByTestId('tab-simulation').click();await expect(page.getByRole('img',{name:'실제 ngspice 파형'})).toBeVisible();
  await page.getByLabel('Post-layout').check();
  const beforePost=await page.getByTestId('job-row').count();
  await page.getByRole('button',{name:'Run analysis',exact:true}).click();
  await expect(page.getByTestId('job-row')).toHaveCount(beforePost+1,{timeout:90000});
  const post=page.getByTestId('job-row').filter({hasText:'simulation'}).first();await expect(post).toContainText('완료',{timeout:90000});await expect(post).toContainText('PASS');
  await page.getByTestId('tab-layout3d').click();await expect(page.locator('canvas').first()).toBeVisible();
  const savedResponse=page.waitForResponse(response=>{
    if(new URL(response.url()).pathname!=='/api/rpc')return false;
    try{return response.request().postDataJSON()?.method==='project.save';}catch{return false;}
  },{timeout:65000});
  const saveStarted=Date.now();await page.getByTestId('project-save').click();
  const saved=await(await savedResponse).json();expect(saved.ok).toBe(true);expect(saved.result.name).toBe('Verified UI inverter');expect(saved.result.revision).toBe(1);expect(saved.result.runs).toHaveLength(5);
  await expect(page.getByTestId('project-save')).toBeEnabled({timeout:45000});await expect(page.locator('.notice[role=status]')).toContainText('Saved',{timeout:45000});
  await mkdir('docs/evidence',{recursive:true});await page.screenshot({path:'docs/evidence/inverter-3d.png',fullPage:true});
  await writeFile('docs/evidence/inverter-save.json',JSON.stringify({checked_at:new Date().toISOString(),project_id:saved.result.id,revision:saved.result.revision,runs:saved.result.runs.length,elapsed_ms:Date.now()-saveStarted,actual_save_response:true,visible_saved_status:true},null,2));
  const frameTimes=await page.evaluate(async()=>{
    const deltas:number[]=[];let previous=performance.now();for(let i=0;i<120;i++)await new Promise<void>(r=>requestAnimationFrame(now=>{deltas.push(now-previous);previous=now;r();}));return deltas.slice(5).sort((a,b)=>a-b);
  });
  await writeFile('docs/evidence/small-scene-performance.json',JSON.stringify({client_date:'2026-09-30',test_scope:'Actual inverter, idle requestAnimationFrame timing in headless Chromium; not 100k polygon or GPU benchmark',samples:frameTimes.length,median_ms:frameTimes[Math.floor(frameTimes.length*.5)],p95_ms:frameTimes[Math.floor(frameTimes.length*.95)],browser:await page.evaluate(()=>navigator.userAgent),hardware:{cpu:'AMD Ryzen 5 7400F',ram_bytes:33816109056,os:'Windows 11 Home 10.0.26200'}},null,2));
  await page.reload();await expect(page.locator('.project-breadcrumb strong')).toContainText('Verified UI inverter');await expect(page.getByTestId('job-row')).toHaveCount(5);
  await page.getByRole('button',{name:/MN1.*nmos/}).click();await page.getByLabel('MN1 w_um').fill('1.3');await page.getByRole('button',{name:/변경 적용.*Apply/}).click();
  await expect(page.getByTestId('current-revision')).toContainText('2');await expect(page.locator('.status.stale').first()).toBeVisible();
  await page.getByTestId('tab-simulation').click();await page.getByLabel('Post-layout').uncheck();const beforeEditSim=await page.getByTestId('job-row').count();await page.getByTestId('run-simulation').click();await expect(page.getByTestId('job-row')).toHaveCount(beforeEditSim+1,{timeout:90000});
  await expect(page.getByTestId('job-row').filter({hasText:'simulation'}).first()).toContainText('PASS',{timeout:90000});
  const beforeLVS=await page.getByTestId('job-row').count();await page.getByTestId('run-lvs').click();await expect(page.getByTestId('job-row')).toHaveCount(beforeLVS+1,{timeout:90000});await expect(page.getByTestId('job-row').filter({hasText:'lvs'}).first()).toContainText('FAIL',{timeout:90000});
  await page.getByTestId('tab-schematic').click();await page.screenshot({path:'docs/evidence/schematic-and-stale.png',fullPage:true});
  expect(errors).toEqual([]);
});

test('Browser transport rejects cross-site access',async({request})=>{
  const result=await request.post('/api/rpc',{headers:{Origin:'https://untrusted.example','Content-Type':'application/json'},data:{method:'toolchain.doctor',params:{}}});expect(result.status()).toBe(403);
});
test('Development server cannot serve worker session files',async({request})=>{
  const result=await request.get('/.runtime/worker.json');expect(result.status()).toBe(403);
});

