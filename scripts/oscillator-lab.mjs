// Isolated native-engine qualification and importable circuit examples. No Docker,
// paid API, user project edits, layout verdicts or manufactured output waveforms.
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {mkdir,mkdtemp,readFile,writeFile,copyFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {startWorker} from './worker.mjs';
import {stopNativeWorker,nativeEnvironment,runNative} from './native-worker.mjs';
import {runtimeConfig,workerRpc} from './runtime.mjs';

const root=process.cwd(),generate=process.argv.includes('--generate');
const output=path.join(root,'examples/oscillator-lab');
await mkdir(path.join(root,'.runtime/oscillator-lab'),{recursive:true});
const workspace=await mkdtemp(path.join(root,'.runtime/oscillator-lab','run-'));
const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));
const port=listener.address().port;await new Promise(r=>listener.close(r));
await mkdir(path.join(workspace,'.runtime'),{recursive:true});
await writeFile(path.join(workspace,'.runtime/worker.json'),JSON.stringify({url:`http://127.0.0.1:${port}`,token:randomUUID()+randomUUID()}));
const config=await runtimeConfig(workspace);
const resources=await nativeEnvironment(root);
const sourceFiles=['workers/eda/oscillator_projects.py','workers/eda/test_oscillator_projects.py','workers/eda/design_tools.py','workers/eda/semiconductor_starters.py','workers/eda/research.py','workers/eda/literature.json','scripts/oscillator-lab.mjs','scripts/oscillator-plots.mjs'];
const report={schema_version:1,completed:false,edition:'Resistor Indust',generated_at:new Date().toISOString(),
    engine:'native-'+process.platform,arch:process.arch,docker_used:false,paid_api_calls:0,
    physical_layout_generated:false,manufacturing_signoff:false,runs:[],checks:[]};
const sha=b=>createHash('sha256').update(b).digest('hex');
const sourceHashes=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async f=>[f,sha(await readFile(path.join(root,f)))])));
const initialHashes=await sourceHashes();
const api=async(method,params={})=>{const body=await workerRpc(config,method,params);assert(body.ok,`${method}: ${body.error?.code}: ${body.error?.message}`);return body.result;};
const check=(name,detail={})=>{report.checks.push({name,passed:true,...detail});console.log(JSON.stringify({check:name,...detail}));};
const wait=async job=>{const deadline=Date.now()+150000;while(['queued','running'].includes(job.execution_status)&&Date.now()<deadline){await new Promise(r=>setTimeout(r,350));job=await api('job.status',{run_id:job.id});}
    if(job.execution_status!=='completed'){const log=await api('job.logs',{run_id:job.id});throw Error(`${job.message}: ${log.text?.slice(-4000)}`);}return job;};
const local=file=>{assert(file.startsWith('/workspace/'));const target=path.resolve(workspace,file.slice(11));assert(target.startsWith(workspace+path.sep));return target;};
const run=async(p,condition={})=>{
    const job=await wait(await api('simulation.run',{project_id:p.id,...p.testbench,...condition}));
    const entry={template:p.design_template.id,parameters:p.design_template.parameters,condition:{...p.testbench,...condition},
        run_id:job.id,revision:job.revision,execution_status:job.execution_status,analysis_result:job.analysis_result,
        freshness:job.freshness,measurements:job.measurements,reference_verification:job.reference_verification,
        manifest_sha256:sha(await readFile(local(job.manifest_path)))};
    report.runs.push(entry);
    console.log(JSON.stringify({template:entry.template,corner:entry.condition.corner,status:job.execution_status,
        verdict:job.analysis_result,frequency_Hz:job.measurements?.output_frequency_Hz,checks:job.reference_verification?.checks}));
    return {job,entry};
};
let started=false;
try{
    const text=await runNative(resources.python,['-c','import sys,unittest;sys.path.insert(0,sys.argv[1]);unittest.main(module=None,argv=[sys.argv[0],*sys.argv[2:]])',path.join(root,'workers/eda'),'test_oscillator_projects','test_chip_references','test_research'],{env:{...resources.environment,...resources.extra}});
    console.log(text.trim());check('analytic, unit, corruption and regression fixtures');
    // Also exercise the formerly unconditional PDK dependency of the ideal RC template.
    const empty=path.join(workspace,'empty-pdks');await mkdir(empty);
    await writeFile(path.join(workspace,'.runtime/engine.json'),JSON.stringify({mode:'native',pdk_root:empty}));
    await startWorker(workspace,{resourcesRoot:root,mode:'native',prepare:false});started=true;
    let rc=await api('design.create_template',{template_id:'rc_lowpass',command_id:randomUUID()});
    const rcRun=await wait(await api('simulation.run',{project_id:rc.id,analysis:'tran'}));
    assert(rcRun.waveforms.some(w=>w.name==='OUT'&&w.y.some(v=>v>.5)));
    report.ideal_rc_without_pdk={run_id:rcRun.id,execution_status:rcRun.execution_status,analysis_result:rcRun.analysis_result};
    check('ideal RC template creates and simulates without PDK files',{execution_status:rcRun.execution_status,analysis_result:rcRun.analysis_result});
    await stopNativeWorker(workspace);started=false;
    await writeFile(path.join(workspace,'.runtime/engine.json'),JSON.stringify({mode:'native'}));
    await startWorker(workspace,{resourcesRoot:root,mode:'native',prepare:false});started=true;
    const doctor=await api('toolchain.doctor');assert(doctor.pdk.available);
    report.tools=doctor.tools.filter(t=>['ngspice','KLayout'].includes(t.name));
    const catalog=await api('design.catalog');const templates=catalog.templates.filter(t=>t.id.startsWith('osc_'));
    assert.equal(templates.length,4);
    if(generate){await mkdir(output,{recursive:true});await writeFile(path.join(output,'catalog.json'),JSON.stringify({schema_version:1,edition:'Resistor Indust',templates},null,2)+'\n');}
    const projects={};
    for(const template of templates){
        const command=randomUUID();
        const p=await api('design.create_template',{template_id:template.id,command_id:command});projects[template.id]=p;
        assert.equal((await api('design.create_template',{template_id:template.id,command_id:command})).id,p.id);
        const {job,entry}=await run(p);
        assert.equal(job.analysis_result,'pass',template.id+' default waveform criteria');
        assert(job.current_flow.branches.length>0);assert.equal(job.freshness,'current');
        const bundle=await api('project.export_bundle',{project_id:p.id,inline:true});
        const imported=await api('project.import_bundle',{bundle_base64:bundle.bundle_base64,mode:'new',command_id:randomUUID()});
        assert.equal(imported.runs.length,0);
        const scene=await api('view.get_scene',{project_id:imported.id,max_shapes:100});assert.equal(scene.shapes.length,0);
        for(const method of ['verification.run_drc','verification.run_lvs','extraction.run_pex']){
            const response=await workerRpc(config,method,{project_id:imported.id});assert.equal(response.error?.code,'NO_PHYSICAL_LAYOUT');
        }
        check(template.id+' bundle roundtrip, no inherited results, empty layout rejects physical verdicts');
        // Rerun imported graph, not just archive metadata inspection.
        const rerun=await run(imported);assert.equal(rerun.job.analysis_result,'pass');
        if(generate){
            const folder=path.join(output,template.id);await mkdir(folder,{recursive:true});
            await writeFile(path.join(folder,template.id+'.register.zip'),Buffer.from(bundle.bundle_base64,'base64'));
            const net=await api('schematic.export_spice',{project_id:p.id});await writeFile(path.join(folder,'core.spice'),net.text);
            await writeFile(path.join(folder,'result-tt.json'),JSON.stringify(entry,null,2)+'\n');
            await copyFile(local(job.manifest_path),path.join(folder,'manifest.json'));
            await copyFile(local(job.artifacts.waveform_data),path.join(folder,'waveform.dat'));
            await copyFile(local(job.artifacts.testbench),path.join(folder,'executed-testbench.spice'));
            const raw=await readFile(local(job.artifacts.waveform_data));
            entry.waveform_sha256=sha(raw);
            // SVG uses only selected actual samples; full numerical data is retained.
            const svg=(await import('./oscillator-plots.mjs')).waveformSVG(job,template.name);
            await writeFile(path.join(folder,'waveform.svg'),svg);
        }
        for(const condition of [{corner:'ss',temperature_C:125,supply_V:1.62},{corner:'ff',temperature_C:-40,supply_V:1.8}]){
            const tested=await run(p,condition);assert.equal(tested.job.analysis_result,'pass',template.id+' '+condition.corner);
        }
    }
    const sensor=[];
    for(const sense_F of [5e-12,20e-12]){
        const p=await api('design.create_template',{template_id:'osc_rc_sensor',parameters:{sense_F},command_id:randomUUID()});
        const {job}=await run(p);assert.equal(job.analysis_result,'pass');sensor.push(job.measurements);
    }
    const base=report.runs.find(r=>r.template==='osc_rc_sensor').measurements.output_frequency_Hz;
    assert(sensor[0].output_frequency_Hz>base&&base>sensor[1].output_frequency_Hz);
    const nominalSensor=report.runs.find(r=>r.template==='osc_rc_sensor').measurements;
    const calibration=[sensor[0],nominalSensor,sensor[1]].map((m,i)=>({capacitance_pF:[5,10,20][i],frequency_Hz:m.output_frequency_Hz,
        unloaded_reference_Hz:m.unloaded_RC_reference_frequency_Hz,
        reference_relative_error:Math.abs(m.output_frequency_Hz/m.unloaded_RC_reference_frequency_Hz-1)}));
    // Finite MOS response changes the actual thresholds as C changes. Compare
    // against those measured levels, never demand an invented exact 1/C law.
    assert(calibration.every(c=>c.reference_relative_error<.05));
    report.sensor_calibration=calibration;
    check('sensor 5/10/20pF monotonic response and measured-threshold RC reference within 5 percent',{calibration});
    const loaded=await api('design.create_template',{template_id:'osc_ring5',parameters:{stage_F:4e-12},command_id:randomUUID()});
    const loadRun=await run(loaded);assert.equal(loadRun.job.analysis_result,'pass');
    const baseRing=report.runs.find(r=>r.template==='osc_ring5').measurements.output_frequency_Hz;
    assert(loadRun.job.measurements.output_frequency_Hz<baseRing*.7);
    check('doubling actual ring load slows oscillation',{base_Hz:baseRing,loaded_Hz:loadRun.job.measurements.output_frequency_Hz});
    // A real circuit edit invalidates old measurements; solver failure is not a new PASS.
    const target=projects.osc_ring5;
    const first=target.schematic.devices.find(d=>d.kind==='capacitor');
    const edited=await api('schematic.apply_command',{project_id:target.id,expected_revision:target.revision,command_id:randomUUID(),command:{type:'update_device',id:first.id,parameters:{value:3e-12}}});
    assert(edited.revision>target.revision);
    const old=await api('job.status',{run_id:report.runs.find(r=>r.template==='osc_ring5').run_id});
    assert.equal(old.freshness,'stale');check('real schematic edit stales prior oscillator results');
    report.source_sha256=await sourceHashes();assert.deepEqual(report.source_sha256,initialHashes,'Source changed during native qualification; rerun the suite.');
    report.completed=true;
}finally{
    if(started)await stopNativeWorker(workspace);
    await mkdir(path.join(root,'docs/evidence/oscillator-lab'),{recursive:true});
    await writeFile(path.join(root,'docs/evidence/oscillator-lab/native-verification.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({native_runs:report.runs.length,checks:report.checks.length,output:generate?output:null}));
