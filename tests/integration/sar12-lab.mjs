// Actual Indust app against the task's separate native worker; no mocked results.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
const out='docs/evidence/sar12';await mkdir(out,{recursive:true});
const blocks=JSON.parse(await readFile('examples/sar12-lab/blocks.json','utf8')).blocks;
const physical=process.env.SAR12_PHYSICAL_PROJECT||'03bec2c7ef964e49bfa8c1fdfb2670b8';
const report={edition:'Resistor Indust',checked_at:new Date().toISOString(),cases:[],errors:[]};
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1920,height:1080}}),page=await context.newPage();
page.setDefaultTimeout(30000);
page.on('pageerror',e=>report.errors.push(e.message));
const check=name=>{report.cases.push({name,passed:true});console.log(name);};
try{
 await page.addInitScript(()=>localStorage.setItem('register.appearance',JSON.stringify({version:1,mode:'dark',skin:'graphite'})));
 await page.goto('http://127.0.0.1:5192/eda?project='+physical);await page.getByTestId('app-ready').waitFor({timeout:60000});
 await page.getByTestId('tab-layout2d').click();
 await page.getByRole('combobox',{name:'대규모 표시 도형 상한'}).selectOption('1000000');
 await expect(page.locator('body')).toContainText('339,131 수신 / 전체 339,131',{timeout:180000});
 await page.getByRole('button',{name:'맞춤',exact:true}).click();
 await page.screenshot({path:out+'/layout.png'});check('Actual 339131 mask shapes inside the bounded analog macro; full geometry requested');
 await page.getByRole('combobox',{name:'대규모 표시 도형 상한'}).selectOption('2000');
 await page.getByTestId('design-tools-menu').click();await page.getByTestId('open-integrated-tools').click();
 await page.getByTestId('integrated-tab-design').click();await page.getByTestId('design-load-catalog').click();
 const library=page.getByTestId('sar12-adc-library');await library.locator('..').locator('summary').click();await library.scrollIntoViewIfNeeded();await expect(library).toBeVisible();
 await expect(library.locator('tbody tr')).toHaveCount(12);await library.getByRole('button',{name:'기존 SAR 프로젝트 읽기'}).click();
 await expect(library.getByRole('button',{name:'기존 SAR 프로젝트 읽기'})).toBeEnabled({timeout:30000});await expect(library.getByRole('button',{name:'SAR 블록 열기'})).toHaveCount(12,{timeout:30000});await page.screenshot({path:out+'/library.png'});
 check('12 actual editable blocks appear through the app catalog, preserving SAR8');
 await library.getByRole('button',{name:'SAR 블록 열기'}).last().click();await expect(page.locator('.view-context')).toContainText('sar_adc12',{timeout:30000});await page.keyboard.press('Escape');
 await page.getByTestId('tab-schematic').click();await expect(page.locator('.schematic-svg')).toBeVisible();
 await page.getByRole('button',{name:'Fit',exact:true}).click();
 await expect.poll(()=>page.locator('.schematic-svg').evaluate(svg=>{const box=svg.getBoundingClientRect(),pins=Array.from(svg.querySelectorAll('.pin-point'));return pins.length>50&&pins.every(p=>{const r=p.getBoundingClientRect();return r.left>=box.left&&r.right<=box.right&&r.top>=box.top&&r.bottom<=box.bottom;});})).toBe(true);
 await expect(page.locator('.view-context')).toContainText('sar_adc12');await page.screenshot({path:out+'/schematic.png'});
 check('Full SAR_ADC12 hierarchy opens from the real UI and all long-block terminals fit');
 const fresh=blocks.find(b=>b.id==='sar12_controller');await page.goto('http://127.0.0.1:5192/eda?project='+fresh.project_id);await page.getByTestId('app-ready').waitFor({timeout:60000});
 await page.getByTestId('tab-simulation').click();await expect(page.getByTestId('chip-reference-results')).toHaveCount(0);
 check('Unexecuted controller does not inherit analog PASS or measured ENOB');
 assert.deepEqual(report.errors,[]);report.completed=true;
}catch(e){report.error=e.message;await page.screenshot({path:out+'/ui-failure.png'}).catch(()=>{});await writeFile('.runtime/sar12/ui-failure-body.txt',await page.locator('body').innerText().catch(()=>''));throw e;}
finally{await browser.close();await writeFile(out+'/ui-verification.json',JSON.stringify(report,null,2)+'\n');}
