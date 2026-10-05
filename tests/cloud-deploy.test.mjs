import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {chromium} from 'playwright';

const execFileAsync=promisify(execFile);
// Operator-only source setup for an actual public file in the isolated worker.
// The private token stays inside the container and never enters test output.
const bindPublicDatabase=async(sourceId,projectId)=>{
  const script=`import json,sys,urllib.request\nfrom pathlib import Path\ntoken=Path('/run/secrets/worker_session').read_text().strip()\nmanifest={'schema_version':1,'id':sys.argv[1],'name':'Linux shared public GDS reader','adapter':'klayout-file','library':'public_wire','view':'layout','layout_file':'/workspace/examples/sky130/wire.gds','layer_map':[],'shared_project_ids':[sys.argv[2]]}\ndata=json.dumps({'method':'database.register','params':{'manifest':manifest}}).encode()\nrequest=urllib.request.Request('http://127.0.0.1:8765/rpc',data=data,headers={'Content-Type':'application/json','X-MOS-Token':token})\nreply=json.load(urllib.request.urlopen(request,timeout=60))\nif not reply.get('ok'): raise SystemExit('Operator public source registration failed')\nprint(json.dumps({'id':reply['result']['id'],'available':reply['result']['available'],'vendor_execution_verified':reply['result']['vendor_execution_verified']}))`;
  const {stdout}=await execFileAsync('docker',['exec',process.env.REGISTER_CLOUD_EDA_CONTAINER||'register-cloud-eda-1','python3','-c',script,sourceId,projectId],{timeout:75000,maxBuffer:65536});
  const registered=JSON.parse(stdout);assert.equal(registered.id,sourceId);assert.equal(registered.available,true);assert.equal(registered.vendor_execution_verified,false);
};

test('isolated Linux hub serves remote web client and executes actual physical jobs',{timeout:360000},async t=>{
  const url=process.env.REGISTER_CLOUD_TEST_URL||'http://127.0.0.1:18767';
  const health=await fetch(`${url}/health`).then(r=>r.json());assert.equal(health.service,'register-cloud');
  const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-webgl']});let completed=false;
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];let localRequests=0;
  t.after(async()=>{
    if(!completed){await fs.mkdir('.runtime/test-failures',{recursive:true});await page.screenshot({path:'.runtime/test-failures/cloud-ui.png',timeout:15000}).catch(()=>{});await fs.writeFile('.runtime/test-failures/cloud-ui.txt',await page.locator('body').innerText({timeout:5000}).catch(()=> 'Page unavailable'));}
    await browser.close();
  });
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).pathname==='/api/rpc')localRequests++;});
  await page.goto(url);await page.getByRole('dialog').waitFor({timeout:30000});
  await page.getByRole('button',{name:'가입',exact:true}).click();await page.getByLabel('표시 이름',{exact:true}).fill('Linux cloud verification');
  await page.getByTestId('cloud-email').fill(`linux-${crypto.randomUUID()}@register.local`);
  await page.getByTestId('cloud-password').fill(crypto.randomBytes(24).toString('base64url'));
  await page.getByTestId('cloud-auth-submit').click();await page.getByText('SIGNED IN',{exact:true}).waitFor({timeout:30000});
  await page.getByLabel('공유 프로젝트 이름').fill('Linux remote physical MOS');await page.locator('.cloud-create-project select').selectOption('mosfet');
  await page.getByTestId('cloud-create-project').click();await page.locator('[data-cloud-project-ready=true]').waitFor({timeout:60000});
  await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click();
  await page.getByTestId('scene-loaded-count').waitFor();assert.ok(Number(await page.getByTestId('scene-loaded-count').getAttribute('data-count'))>0);
  const session=await page.evaluate(()=>sessionStorage.getItem('register.cloud.session'));
  const roomId=await page.evaluate(()=>sessionStorage.getItem('register.cloud.room'));
  const rpc=async(method,params={})=>{const r=await fetch(`${url}/rpc`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session}`},body:JSON.stringify({method,params})}).then(r=>r.json());assert.equal(r.ok,true,r.error?.message);return r.result;};
  const opened=await rpc('cloud.open',{id:roomId});let project=opened.project;
  const native=(method,params={},mutation=false)=>rpc('cloud.native',{room_id:roomId,method,params:{project_id:project.id,...params},...(mutation?{command_id:crypto.randomUUID(),base_revision:project.revision}:{})});
  const doctor=await native('toolchain.doctor');assert.equal(doctor.runner,'linux-docker');assert.equal(doctor.pdk.available,true);assert.ok(doctor.tools.every(x=>x.available));
  const runs=[];
  for(const [method,params] of [['simulation.run',{analysis:'dc'}],['verification.run_drc',{}],['verification.run_lvs',{}],['extraction.run_pex',{}],['simulation.run',{analysis:'dc',post_layout:true}]]){
    let r=await native(method,params,true);const deadline=Date.now()+90000;
    while(['queued','running'].includes(r.execution_status)&&Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,300));r=await native('job.status',{run_id:r.id});}
    assert.equal(r.execution_status,'completed',r.message);assert.equal(r.analysis_result,'pass',r.message);
    if(method==='simulation.run'){assert.equal(r.current_flow.source,'ngspice');assert.equal(r.current_flow.project_id,project.id);assert.equal(r.current_flow.revision,project.revision);assert.ok(r.current_flow.branches.some(b=>b.mapping==='device_terminals'&&b.values_A.some(n=>n>0)));}
    runs.push({id:r.id,kind:r.kind,revision:r.revision,result:r.analysis_result,parasitics:r.parasitics,measurements:r.measurements,current_flow:r.current_flow?{source:r.current_flow.source,samples:r.current_flow.x.length,branches:r.current_flow.branches.length,explicit_paths:r.current_flow.branches.filter(b=>b.mapping==='device_terminals').length}:undefined});
  }
  assert.equal(localRequests,0,'remote browser must never require local native RPC');assert.deepEqual(errors,[]);
  await page.reload();await page.locator('[data-cloud-project-ready=true]').waitFor({timeout:30000});assert.ok(Number(await page.getByTestId('scene-loaded-count').getAttribute('data-count'))>0);
  await fs.mkdir('docs/evidence',{recursive:true});await page.getByTestId('tab-layout3d').click();await page.waitForFunction(()=>Number(document.querySelector('canvas')?.getAttribute('data-current-arrow-count'))>0);await page.screenshot({path:'docs/evidence/linux-cloud-web.png'});
  const profiles=await native('pdk.list_profiles');assert.ok(profiles.some(p=>p.id==='sky130A'));
  const validation=await native('pdk.validate',{profile_id:'sky130A'});assert.equal(validation.valid,true);
  const inspected=await native('analysis.inspect',{profile_id:'sky130A'});assert.ok(inspected.ports.includes('D'));
  const settings={profile_id:'sky130A',profile_hash:validation.fingerprint,top_cell:inspected.top_cell,corner:'tt',temperature_C:27,analysis:'op',pex:false,
    ports:inspected.ports.map(name=>({name,mode:name==='S'?'ground':'voltage',dc_V:name==='D'?1.8:name==='G'?.9:0}))};
  project=await native('analysis.configure',{settings},true);assert.equal(project.analysis_setup.profile_id,'sky130A');
  let configured=await native('analysis.run',{},true);const deadline=Date.now()+90000;
  while(['queued','running'].includes(configured.execution_status)&&Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,250));configured=await native('job.status',{run_id:configured.id});}
  assert.equal(configured.execution_status,'completed',configured.message);assert.equal(configured.analysis_result,'pass',configured.message);
  assert.equal(configured.current_flow.source,'ngspice');assert.ok(configured.current_flow.branches.some(b=>b.values_A.some(n=>Math.abs(n)>1e-6)));
  assert.ok(configured.current_flow.branches.every(b=>b.mapping==='unmapped'));
  await page.reload();await page.locator('[data-cloud-project-ready=true]').waitFor({timeout:30000});
  await page.getByTestId('open-pdk-setup').click();const wizard=page.getByTestId('pdk-setup-wizard');await wizard.waitFor();
  await page.getByTestId('pdk-profile-select').selectOption('sky130A');await page.getByTestId('pdk-validate').click();
  await page.locator('.pdk-fingerprint').waitFor();await wizard.locator('.pdk-setup-steps button').nth(4).click();
  await page.getByTestId('pdk-job-row').filter({hasText:configured.id.slice(0,10)}).waitFor();await page.screenshot({path:'docs/evidence/linux-cloud-pdk-setup.png'});
  // Drive the actual shared setup form and analysis button, including native
  // revision/receipt transport and the completed scene/current callback.
  await page.getByTestId('pdk-step-1').click();await page.getByTestId('pdk-inspect').click();
  await page.getByTestId('pdk-inspection-status').filter({hasText:'현재 profile'}).waitFor({timeout:60000});
  await page.getByTestId('pdk-step-3').click();await page.getByTestId('pdk-save-setup').click();
  await page.waitForFunction(()=>document.querySelector('[data-testid="pdk-setup-state"]')?.textContent?.includes('해석 조건 저장됨'),undefined,{timeout:45000});
  await page.getByTestId('pdk-step-4').click();const before=await page.getByTestId('pdk-job-row').count();
  await page.getByTestId('pdk-run-analysis').click();await page.waitForFunction(count=>document.querySelectorAll('[data-testid="pdk-job-row"]').length===count+1,before,{timeout:45000});
  const buttonRow=page.getByTestId('pdk-job-row').last();await page.waitForFunction(()=>document.querySelector('[data-testid="pdk-job-row"]:last-child')?.textContent?.includes('completed · pass'),undefined,{timeout:90000});
  const buttonRun=await native('job.status',{run_id:await buttonRow.getAttribute('data-run-id')});
  assert.equal(buttonRun.workflow,'configured-layout');assert.equal(buttonRun.current_flow.source,'ngspice');
  assert.ok(buttonRun.current_flow.branches.some(b=>b.values_A.some(n=>Math.abs(n)>1e-6)));
  await page.screenshot({path:'docs/evidence/linux-cloud-pdk-button-result.png'});
  assert.equal(localRequests,0,'configured remote setup also uses authenticated cloud RPC only');assert.deepEqual(errors,[]);
  await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click();
  const backendCatalog=await native('backend.catalog');assert.equal(backendCatalog.tools.length,18);
  assert(backendCatalog.tools.filter(tool=>tool.vendor!=='Open source').every(tool=>tool.verification==='unverified'));
  await page.getByTestId('open-commercial-backend').click();await page.getByTestId('backend-step-1').click();
  await page.getByTestId('backend-profile-select').selectOption('ngspice-calibration-v1');
  await page.getByTestId('backend-validate').click();await page.getByTestId('backend-state').filter({hasText:'검증 통과'}).waitFor({timeout:45000});
  await page.getByTestId('backend-step-2').click();await page.getByTestId('backend-save').click();
  await page.getByTestId('backend-state').filter({hasText:'Backend 설정 저장됨'}).waitFor({timeout:45000});
  await page.getByTestId('backend-step-3').click();await page.getByTestId('backend-run').click();
  const backendRow=page.getByTestId('backend-job-row').last();await backendRow.filter({hasText:'completed · pass'}).waitFor({timeout:90000});
  const backendRun=await native('job.status',{run_id:await backendRow.getAttribute('data-run-id')});
  assert.equal(backendRun.workflow,'commercial-backend');assert.equal(backendRun.tool,'ngspice');
  assert.equal(backendRun.current_flow.geometry_linkage,'unverified');
  assert.deepEqual(backendRun.current_flow.branches.map(branch=>branch.values_A[0]),[-.001,.001]);
  const backendArtifact=await native('backend.read_artifact',{run_id:backendRun.id,key:'currents'});
  assert(Buffer.from(backendArtifact.base64,'base64').length>0);
  await page.screenshot({path:'docs/evidence/linux-cloud-commercial-backend.png'});
  await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click();
  await page.reload();await page.locator('[data-cloud-project-ready=true]').waitFor({timeout:30000});
  await page.getByTestId('open-commercial-backend').click();await page.getByTestId('backend-step-3').click();
  await page.getByTestId('backend-job-row').filter({hasText:backendRun.id.slice(0,10)}).waitFor();
  assert.equal(localRequests,0,'shared backend uses authorized remote RPC only');assert.deepEqual(errors,[]);
  await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click();
  await page.getByTestId('open-interchange').click();
  await page.getByTestId('interchange-files').setInputFiles([
    {name:'wire.gds',mimeType:'application/octet-stream',buffer:await fs.readFile('examples/sky130/wire.gds')},
    {name:'external.cdl',mimeType:'text/plain',buffer:Buffer.from('* external cell\n.SUBCKT extcell A Z VDD VSS\nR1 A Z 1000\n.ENDS extcell\n')},
    {name:'external.csv',mimeType:'text/csv',buffer:Buffer.from('time_s,out_V,branch_A\n0,1,0.001\n1e-9,0.5,-0.002\n')}
  ]);
  await page.getByTestId('interchange-file-row').filter({hasText:'external.cdl'}).waitFor();
  await page.getByTestId('interchange-tab-native').click();
  await page.getByTestId('interchange-netlist-file').selectOption('external.cdl');
  await page.getByTestId('interchange-netlist-top').fill('extcell');
  const inspectionReply=page.waitForResponse(response=>{
    if(new URL(response.url()).pathname!=='/rpc')return false;
    try{return response.request().postDataJSON()?.params?.method==='compat.inspect';}catch{return false;}
  });
  await page.getByTestId('interchange-inspect-native').click();
  const inspectionBody=await(await inspectionReply).json();
  assert.equal(inspectionBody.ok,true,inspectionBody.error?.message);
  assert.equal(inspectionBody.result.supported,true);
  await page.waitForFunction(()=>document.querySelector('[data-testid="interchange-import-native"]')?.disabled===false,undefined,{timeout:45000});
  await page.getByTestId('interchange-import-native').click();
  await page.getByTestId('interchange-native-state').filter({hasText:'실제 교환 파일 적용됨'}).waitFor({timeout:45000});
  project=(await rpc('cloud.open',{id:roomId})).project;
  assert(project.interchange_netlist);assert.equal(project.interchange_netlist.top_cell,'extcell');
  await page.getByText('프로젝트 표준 파일 / roundtrip 내보내기',{exact:true}).click();
  const pendingDownload=page.waitForEvent('download');await page.getByTestId('interchange-export-gds').click();
  const download=await pendingDownload,roundtripPath='docs/evidence/linux-cloud-interchange-roundtrip.gds';await download.saveAs(roundtripPath);
  const bytes=await fs.readFile(roundtripPath);
  const reread=await native('compat.inspect',{files:[{name:'roundtrip.gds',base64:bytes.toString('base64')}]});
  assert(reread.supported);assert(reread.layout.stored_shape_count>0);
  const resultDetails=page.getByTestId('interchange-native').locator('details').filter({has:page.locator('summary').filter({hasText:'외부 해석 / DRC / LVS / PEX 결과 파일'})});
  await resultDetails.locator('summary').first().click();
  await page.getByTestId('interchange-result-file').selectOption('external.csv');
  await page.getByTestId('interchange-result-role').selectOption('currents');
  await page.getByTestId('interchange-result-analysis').selectOption('tran');
  await page.getByLabel('결과 X열',{exact:true}).selectOption('time_s');
  await page.getByTestId('interchange-add-current').click();
  await page.getByLabel('전류 1 column',{exact:true}).selectOption('branch_A');
  await page.getByLabel('전류 1 name',{exact:true}).fill('VSENSE');
  await page.getByLabel('전류 1 from_net',{exact:true}).fill('IN');
  await page.getByLabel('전류 1 to_net',{exact:true}).fill('OUT');
  await page.getByTestId('interchange-import-results').click();
  await page.getByTestId('interchange-result').filter({hasText:'imported result'}).waitFor({timeout:45000});
  const withResults=(await rpc('cloud.open',{id:roomId})).project;
  const imported=withResults.runs.find(run=>run.workflow==='imported-results');assert(imported);
  assert.equal(imported.current_flow.source,'imported');assert.deepEqual(imported.current_flow.branches[0].values_A,[.001,-.002]);
  assert.equal(imported.current_flow.geometry_linkage,'unverified');
  await page.screenshot({path:'docs/evidence/linux-cloud-interchange.png'});
  assert.equal(localRequests,0,'actual interchange buttons use authorized shared RPC only');assert.deepEqual(errors,[]);
  t.diagnostic('Actual Linux physical jobs, PDK setup, backend calibration and file interchange passed.');
  await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click();
  project=withResults;
  const sourceId=`linux_file_${crypto.randomUUID().replaceAll('-','')}`;
  await bindPublicDatabase(sourceId,project.id);
  const originalHash=crypto.createHash('sha256').update(await fs.readFile('examples/sky130/wire.gds')).digest('hex');
  await page.getByTestId('open-native-database').click();
  await page.getByTestId('database-load').click();
  await page.getByTestId('database-source').selectOption(sourceId);
  assert.equal(await page.getByTestId('database-new-source').count(),0,'shared browser cannot register operator paths');
  await page.getByTestId('database-probe').click();await page.getByTestId('database-notice').filter({hasText:'접근 검사 완료'}).waitFor();
  await page.getByTestId('database-browse').click();await page.getByTestId('database-cell-list').filter({hasText:'wire'}).waitFor();
  assert.equal(await page.getByTestId('database-cell').inputValue(),'wire');
  const readReply=page.waitForResponse(response=>{
    if(new URL(response.url()).pathname!=='/rpc')return false;
    try{return response.request().postDataJSON()?.params?.method==='database.read';}catch{return false;}
  });
  await page.getByTestId('database-read').click();const readBody=await(await readReply).json();assert.equal(readBody.ok,true,readBody.error?.message);
  const databaseRead=readBody.result;assert.equal(databaseRead.graph.top_cell,'wire');assert.equal(databaseRead.can_import,true);assert.equal(databaseRead.vendor_execution_verified,false);
  const readArtifact=await native('database.read_artifact',{read_id:databaseRead.id});
  assert.equal(crypto.createHash('sha256').update(Buffer.from(readArtifact.base64,'base64')).digest('hex'),databaseRead.graph_sha256);
  assert.equal(await page.getByTestId('database-import').isDisabled(),true);
  await page.getByTestId('database-import-confirm').check();await page.getByTestId('database-import').click();
  await page.getByTestId('database-import-report').filter({hasText:databaseRead.id}).waitFor({timeout:45000});
  const databaseProject=(await rpc('cloud.open',{id:roomId})).project;assert.equal(databaseProject.revision,project.revision+1);assert.equal(databaseProject.cell,'wire');
  assert.equal(databaseProject.native_database.read_id,databaseRead.id);project=databaseProject;
  assert.equal(crypto.createHash('sha256').update(await fs.readFile('examples/sky130/wire.gds')).digest('hex'),originalHash);
  await page.screenshot({path:'docs/evidence/linux-cloud-native-database.png'});
  await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click();
  const beforeReview=localRequests;
  await page.getByTestId('open-design-review').click();await page.getByLabel('로드된 도형 검색').fill('wire');await page.getByTestId('review-tab-ruler').click();
  await page.getByLabel('점 A X DBU').fill('0');await page.getByLabel('점 A Y DBU').fill('0');await page.getByLabel('점 B X DBU').fill('300');await page.getByLabel('점 B Y DBU').fill('400');
  await page.getByTestId('review-ruler-result').filter({hasText:'500'}).waitFor();await page.screenshot({path:'docs/evidence/linux-cloud-design-review.png'});
  assert.equal(localRequests,beforeReview);assert.deepEqual(errors,[]);
  await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click();
  const integratedRoom=await rpc('cloud.create',{name:'Linux integrated native PVT',example:'mosfet'});
  await page.evaluate(id=>sessionStorage.setItem('register.cloud.room',id),integratedRoom.room.id);
  await page.reload();await page.locator('[data-cloud-project-ready=true]').waitFor({timeout:30000});
  const integratedNative=(method,params={})=>rpc('cloud.native',{room_id:integratedRoom.room.id,method,params:{project_id:integratedRoom.project.id,...params}});
  const remoteReply=method=>page.waitForResponse(response=>{if(new URL(response.url()).pathname!=='/rpc')return false;try{return response.request().postDataJSON()?.params?.method===method;}catch{return false;}});
  await page.getByTestId('open-integrated-tools').click();
  const sourcesReply=remoteReply('pvt.sources');await page.getByTestId('pvt-read-sources').click();const sourceBody=await(await sourcesReply).json();assert.equal(sourceBody.ok,true,sourceBody.error?.message);
  assert.deepEqual(sourceBody.result.bindings,[{kind:'testbench',source_names:['VD']}]);
  await page.getByLabel('검증된 PVT 공급원').selectOption('0');await page.getByLabel('PVT corners').fill('tt, ff');
  const saveReply=remoteReply('pvt.create');await page.getByTestId('pvt-create').click();const savedBody=await(await saveReply).json();assert.equal(savedBody.ok,true,savedBody.error?.message);const integratedStudyId=savedBody.result.id;
  assert.equal(savedBody.result.execution_status,'created');await page.getByTestId('pvt-start').click();
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-testid="pvt-point"]')].length===2&&[...document.querySelectorAll('[data-testid="pvt-point"]')].every(row=>row.textContent.includes('completed')),{},{timeout:120000});
  const integratedStudy=await integratedNative('pvt.status',{study_id:integratedStudyId});assert.equal(integratedStudy.execution_status,'completed');assert(integratedStudy.points.every(point=>point.analysis_result==='pass'&&point.run_id&&Number.isFinite(point.metrics.Id_max)));
  for(const point of integratedStudy.points){const child=await integratedNative('job.status',{run_id:point.run_id});assert.equal(child.project_id,point.project_id);assert.equal(child.analysis_result,'pass');}
  await page.getByTestId('integrated-tab-routing').click();await page.getByTestId('routing-load-rules').click();await page.getByTestId('routing-layer').selectOption('68/20');
  await page.getByLabel('시작 X DBU').fill('50000');await page.getByLabel('시작 Y DBU').fill('50000');await page.getByLabel('끝 X DBU').fill('52000');await page.getByLabel('끝 Y DBU').fill('52000');
  const previewReply=remoteReply('design.route_preview');await page.getByTestId('routing-preview').click();const previewBody=await(await previewReply).json();assert.equal(previewBody.ok,true,previewBody.error?.message);assert.equal(previewBody.result.valid,true);
  await page.getByTestId('routing-apply-confirm').check();const appliedReply=remoteReply('design.route_apply');await page.getByTestId('routing-apply').click();const appliedBody=await(await appliedReply).json();assert.equal(appliedBody.ok,true,appliedBody.error?.message);assert.equal(appliedBody.result.revision,integratedRoom.project.revision+1);
  assert.equal((await integratedNative('pvt.status',{study_id:integratedStudyId})).freshness,'stale');
  await page.getByTestId('integrated-tab-design').click();await page.getByTestId('design-read-connectivity').click();await page.getByTestId('design-pin-list').waitFor();
  assert.equal(await page.getByTestId('design-create').count(),0,'new projects require the separate local creation/share workflow');
  await page.screenshot({path:'docs/evidence/linux-cloud-integrated.png'});assert.equal(localRequests,0);assert.deepEqual(errors,[]);
  const standalone=await browser.newPage();let viewerRpc=0;standalone.on('request',r=>{if(/\/rpc|\/events/.test(new URL(r.url()).pathname))viewerRpc++;});await standalone.goto(url+'/?mode=viewer');await standalone.getByTestId('viewer-empty-gds-input').setInputFiles('examples/sky130/mosfet.gds');await standalone.getByTestId('viewer-shape-count').waitFor();assert.equal(await standalone.getByTestId('viewer-shape-count').innerText(),'52 / 52');assert.equal(viewerRpc,0);await standalone.close();
  await fs.writeFile('docs/evidence/cloud-container.json',JSON.stringify({checked_at:new Date().toISOString(),deployment:'Docker Linux isolated stack on this workstation; external hosting not provisioned',remote_web_boot_without_local_rpc:true,authenticated_room_restore:true,actual_current_direction_viewer:true,public_standalone_viewer_without_login_or_rpc:true,registered_pdk_configured_analysis:true,configured_job_restored_in_remote_setup_ui:true,configured_analysis_started_from_remote_button:true,configured_button_run:{id:buttonRun.id,result:buttonRun.analysis_result,source:buttonRun.current_flow.source},configured_run:{id:configured.id,result:configured.analysis_result,source:configured.current_flow.source,branches:configured.current_flow.branches.length},native_backend_started_from_remote_button:true,native_backend_saved_history_restored:true,actual_backend_calibration:{id:backendRun.id,result:backendRun.analysis_result,tool:backendRun.tool,current_A:backendRun.current_flow.branches.map(branch=>branch.values_A[0]),geometry_linkage:backendRun.current_flow.geometry_linkage,vendor_execution_verified:false},native_database_from_remote_ui:true,native_database_read:{source_id:sourceId,read_id:databaseRead.id,reader:databaseRead.graph.reader.adapter,graph_sha256:databaseRead.graph_sha256,vendor_execution_verified:false},native_database_revision:databaseProject.revision,loaded_design_review_without_local_rpc:true,file_interchange_import_export_from_remote_ui:true,file_interchange_current_import_from_remote_ui:true,file_interchange_roundtrip_bytes:bytes.length,file_interchange_run:imported.id,native_project_id:project.id,room_id:roomId,doctor,runs,browser_errors:errors},null,2));
  const containerReport=JSON.parse(await fs.readFile('docs/evidence/cloud-container.json','utf8'));
  Object.assign(containerReport,{integrated_pvt_from_remote_ui:true,integrated_route_from_remote_ui:true,integrated_connectivity_from_remote_ui:true,integrated_pvt:{study_id:integratedStudyId,points:integratedStudy.points.map(point=>({run_id:point.run_id,condition:point.condition,metrics:point.metrics}))},integrated_route:{revision:appliedBody.result.revision,preview_hash:previewBody.result.preview_hash,rule_fingerprint:previewBody.result.rule_fingerprint},integrated_stale_after_route:true});
  await fs.writeFile('docs/evidence/cloud-container.json',JSON.stringify(containerReport,null,2));completed=true;
});
