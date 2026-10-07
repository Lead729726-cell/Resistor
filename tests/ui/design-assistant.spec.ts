import {test,expect,type APIRequestContext,type Page} from '@playwright/test';
import {clickWorkbenchAction} from './helpers/workbench';
import type {Project,RoutingRules,RoutePreview,RouteInput} from '../../packages/contracts/src/index';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';

async function call<T>(request:APIRequestContext,method:string,params:Record<string,unknown>):Promise<T>{const body=await(await request.post('/api/rpc',{data:{method,params}})).json();expect(body.ok,JSON.stringify(body.error)).toBe(true);return body.result;}
async function open(page:Page,p:Project){await page.addInitScript(id=>localStorage.setItem('mos.last_project',id),p.id);await page.goto('/eda');await expect(page.getByTestId('app-ready')).toBeVisible();await expect(page.locator('.project-breadcrumb strong')).toHaveText(p.name);}

test('local assistant previews actual evidence, requires approval and never sends an automatic provider request',async({page,request})=>{
  const p=await call<Project>(request,'design.create_template',{template_id:'rc_lowpass',name:'Assistant UI evidence '+randomUUID().slice(0,8),command_id:randomUUID()});let reviews=0;
  page.on('request',r=>{if(r.url().includes('/api/rpc')&&r.postDataJSON()?.method==='assistant.review')reviews++;});
  await open(page,p);await clickWorkbenchAction(page,'open-design-assistant');await expect(page.getByTestId('assistant-preview')).toBeEnabled();await expect(page.getByTestId('assistant-result')).toHaveCount(0);
  await page.getByTestId('assistant-preview').click();await expect(page.getByTestId('design-assistant')).toContainText('NOT_VERIFIED');await expect(page.getByTestId('assistant-run')).toBeDisabled();
  await page.getByLabel('AI 제공자',{exact:true}).selectOption('openai');await expect(page.getByTestId('assistant-run')).toBeDisabled();await page.getByTestId('assistant-history').click();await expect(page.getByTestId('design-assistant')).not.toContainText('저장된 검토 읽는 중');expect(reviews).toBe(0);
  await mkdir('docs/evidence/assistant-ui',{recursive:true});await page.screenshot({path:'docs/evidence/assistant-ui/evidence-desktop.png'});
  await page.setViewportSize({width:390,height:844});await expect(page.getByTestId('assistant-preview')).toBeVisible();const width=await page.locator('.modal').evaluate(e=>e.getBoundingClientRect().width);expect(width).toBeLessThanOrEqual(390);await page.screenshot({path:'docs/evidence/assistant-ui/evidence-mobile.png'});expect(reviews).toBe(0);
});

test('actual obstacle detour is displayed, explicitly applied and invalidated after the revision changes',async({page,request})=>{
  test.setTimeout(120000);
  let p=await call<Project>(request,'design.create_template',{template_id:'rc_lowpass',name:'Detour UI geometry '+randomUUID().slice(0,8),command_id:randomUUID()});
  const rules=await call<RoutingRules>(request,'design.routing_rules',{project_id:p.id});const obstacle:RouteInput={layer_id:'68/20',start:['0','0'],end:['4000','0'],width:'140',rule_fingerprint:rules.fingerprint};
  const preview=await call<RoutePreview>(request,'design.route_preview',{project_id:p.id,...obstacle});p=await call<Project>(request,'design.route_apply',{project_id:p.id,expected_revision:p.revision,command_id:randomUUID(),preview:obstacle,preview_hash:preview.preview_hash,rule_fingerprint:rules.fingerprint});
  await open(page,p);await clickWorkbenchAction(page,'open-integrated-tools');await page.getByTestId('integrated-tab-routing').click();await page.getByTestId('routing-load-rules').click();await expect(page.getByTestId('routing-rule-ledger')).toBeVisible();
  await page.getByLabel('시작 X DBU',{exact:true}).fill('2000');await page.getByLabel('시작 Y DBU',{exact:true}).fill('-2000');await page.getByLabel('끝 X DBU',{exact:true}).fill('2000');await page.getByLabel('끝 Y DBU',{exact:true}).fill('2000');
  await page.getByTestId('routing-preview').click();await expect(page.getByTestId('routing-notice')).toContainText('충돌');await expect(page.getByTestId('routing-apply')).toBeDisabled();await page.getByTestId('routing-search').click();await expect(page.getByTestId('routing-notice')).toContainText('우회 후보를 찾았습니다');await expect(page.getByTestId('routing-apply')).toBeDisabled();
  await expect(page.getByTestId('routing-context-shape').first()).toBeVisible();await page.getByTestId('routing-apply-confirm').check();await expect(page.getByTestId('routing-apply')).toBeEnabled();await page.screenshot({path:'docs/evidence/assistant-ui/detour-desktop.png'});
  await page.getByTestId('routing-apply').click();await expect(page.getByTestId('routing-notice')).toContainText('추가되었습니다');await expect(page.getByTestId('routing-apply')).toBeDisabled();const after=await call<Project>(request,'project.snapshot',{project_id:p.id});expect(after.revision).toBe(p.revision+1);
});
