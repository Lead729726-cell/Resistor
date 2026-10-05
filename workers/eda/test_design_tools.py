"""Actual KLayout/Magic/ngspice regressions; isolated worker state."""
import copy
import hashlib
import json
import math
import os
from pathlib import Path
import time
import uuid
import klayout.db as k

ROOT=Path('/workspace');OUT=ROOT/'.runtime/evidence'/('design-tools-'+uuid.uuid4().hex);OUT.mkdir(parents=True)
os.environ['MOS_STATE']=str(OUT/'state');os.environ['MOS_TOKEN']='isolated-not-a-credential'
os.environ['PATH']='/foss/tools/magic/bin:/foss/tools/netgen/bin:/foss/tools/ngspice/bin:/foss/tools/xschem/bin:'+os.environ['PATH']
import server as S
import design_tools as D
import geometry as G

cases=[]
def case(name,fn):
    start=time.monotonic()
    try:details=fn() or {};cases.append({'case':name,'result':'pass','elapsed_s':time.monotonic()-start,**details});print('PASS '+name,flush=True)
    except Exception as error:
        cases.append({'case':name,'result':'fail','error':str(error)});print('FAIL '+name+': '+str(error),flush=True);save();raise
def save():
    record={'schema_version':1,'adapter':D.VERSION,'passed':sum(c['result']=='pass' for c in cases),'case_count':len(cases),'cases':cases,'source_sha256':{str(path.relative_to(ROOT)):hashlib.sha256(path.read_bytes()).hexdigest() for path in [ROOT/'workers/eda/design_tools.py',ROOT/'workers/eda/server.py',ROOT/'workers/eda/test_design_tools.py']},'actual_tools':['KLayout','Magic','ngspice'],'commercial_execution_verified':False,'physical_scope':D.LIMITS,'state_root':str(OUT/'state')}
    (ROOT/'docs/evidence/design-tools.json').write_text(json.dumps(record,indent=2));(OUT/'result.json').write_text(json.dumps(record,indent=2))
def failure(fn,code):
    try:fn()
    except G.EDAError as e:assert e.code==code,(e.code,str(e));return
    raise AssertionError('Expected '+code)
def create(kind,**extra):return S.rpc('design.create_template',{'template_id':kind,'command_id':str(uuid.uuid4()),**extra})
def job(p,kind='simulation.run',**params):
    run=S.rpc(kind,{'project_id':p['id'],**params});deadline=time.monotonic()+90
    while time.monotonic()<deadline:
        run=S.get_run(run['id'])
        if run['execution_status'] not in ('queued','running'):break
        time.sleep(.05)
    assert run['execution_status']=='completed' and run['analysis_result']=='pass',run
    return run

def helpers():
    resources=D.model_resources('tt');deck=D.supported_model_deck(OUT/'model-probe','tt')
    assert len(resources)==6 and all(Path(r['path']).is_file() and r['sha256'] for r in resources)
    assert 'sky130_fd_pr__nfet_01v8__tt.pm3.spice' in deck.read_text()
    failure(lambda:D.supported_model_deck(OUT/'model-probe','tt\n.control'),'INVALID_CORNER')
    return {'model_resources':resources,'deck_sha256':S.profile.sha(deck)}
case('actual confined public model subset and corner injection rejection',helpers)

def rules():
    p=create('rc_lowpass');r=D.routing_rules(p);layer=r['layers'][0]
    assert layer['min_width_dbu']=='140' and layer['min_spacing_dbu']=='140' and layer['min_area_dbu2']=='83000' and layer['grid_dbu']=='5' and layer['conservative_spacing_dbu']=='280',layer
    failure(lambda:D.routing_rules({**p,'pdk_id':'arbitrary'}),'PDK_RULE_UNSUPPORTED')
    failure(lambda:D._rule_values(S.profile.TECH.read_text().replace('width *m1,rm1 140','width missing 140'),S.profile.MAGIC_RC.read_text()),'PDK_RULE_UNSUPPORTED')
    return {'rules':r}
case('actual hashed tech width spacing area grid and wrong rule adapter rejection',rules)

projects={}
for template in D.CATALOG:
    def template_create(template=template):
        p=create(template);projects[template]=p;l=S.load_layout(p);assert l.cell(p['cell']).is_empty();assert p['design_template']['layout_status']=='not-generated';assert S.native.validate(p['schematic'])['valid'];netlist=S.native.emit(p['schematic'],p['cell'],p['ports']);assert netlist.startswith('*') or '.subckt' in netlist
        failure(lambda:S.start_job({'project_id':p['id']},'drc'),'NO_PHYSICAL_LAYOUT')
        failure(lambda:S.start_job({'project_id':p['id'],'post_layout':True},'simulation'),'NO_PHYSICAL_LAYOUT')
        return {'project_id':p['id'],'device_count':len(p['schematic']['devices']),'ports':p['ports'],'netlist_sha256':hashlib.sha256(netlist.encode()).hexdigest()}
    case('actual '+template+' explicit graph; empty physical layout gates',template_create)

def replay():
    params={'template_id':'rc_lowpass','command_id':'create-replay-'+uuid.uuid4().hex};a=S.rpc('design.create_template',params);b=S.rpc('design.create_template',params);assert a['id']==b['id'];failure(lambda:S.rpc('design.create_template',{**params,'name':'changed'}),'COMMAND_ID_CONFLICT')
    failure(lambda:create('current_mirror',physical_core=True,parameters={'w_um':1}),'UNSUPPORTED_PHYSICAL')
    failure(lambda:create('rc_lowpass',parameters={'resistance_Ohm':True}),'INVALID_PARAMETER')
case('new-project CID replay conflict and physical parameter binding rejection',replay)

def bare_import():
    p=create('rc_lowpass');l=k.Layout();l.dbu=.001;top=l.create_cell('UNRELATED');top.shapes(l.layer(68,20)).insert(k.Box(0,0,1000,1000));path=S.STATE/'bare-layout.gds';l.write(str(path));p=S.rpc('layout.import',{'project_id':p['id'],'path':str(path)})
    assert p['pdk_id']=='fixture' and p['source']=='fixture' and p['ports']==[] and not p['schematic']['devices'] and 'design_template' not in p and 'testbench' not in p
    failure(lambda:D.routing_rules(p),'PDK_RULE_UNSUPPORTED');failure(lambda:S.start_job({'project_id':p['id'],'analysis':'op'},'simulation'),'UNSUPPORTED')
    return {'project_id':p['id'],'revision':p['revision'],'import_sha256':S.profile.sha(path),'prior_template_removed':True,'inherited_models_stimuli':'none'}
case('bare GDS into RC target removes inherited template circuit PDK and stimuli',bare_import)

restored_template={}
def sidecar_import():
    origin=create('rc_lowpass',parameters={'resistance_Ohm':20000});origin=S.edit(origin['id'],{'type':'update_testbench','settings':{'duration_s':400e-9}},'schematic');export=S.export_layout({'project_id':origin['id'],'format':'gds'});target=create('common_source');imported=S.rpc('layout.import',{'project_id':target['id'],'path':export['path']});assert imported['id']==target['id'] and imported['design_template']['id']=='rc_lowpass' and imported['ports']==origin['ports'] and imported['design_template']['parameters']['resistance_Ohm']==20000 and imported['testbench']['duration_s']==400e-9 and imported['import_metadata']['sidecar_preserved'];assert D.validate_template_project(imported)
    restored_template['p']=imported
    # A modified metadata sidecar without matching actual geometry hash cannot restore a template.
    side=Path(export['sidecar_path']);metadata=json.loads(side.read_text());metadata['file_hash']='0'*64;side.write_text(json.dumps(metadata));rejected=S.rpc('layout.import',{'project_id':target['id'],'path':export['path']});assert 'design_template' not in rejected and rejected['pdk_id']=='fixture' and not rejected['import_metadata']['sidecar_preserved']
    return {'origin_project_id':origin['id'],'imported_project_id':imported['id'],'revision':imported['revision'],'source_sha256':S.profile.sha(export['path']),'explicit_matching_template_restored':True,'wrong_geometry_hash_template_rejected':True}
case('matching GDS sidecar restores only origin RC parameters ports and testbench; wrong hash rejects',sidecar_import)

route_project={}
def routing_preview():
    p=create('rc_lowpass');route_project['p']=p
    inputs={'project_id':p['id'],'layer_id':'68/20','start':['0','0'],'end':['1000','1000'],'width':'140'}
    preview=S.rpc('design.route_preview',inputs);assert preview['valid'] and preview['scope']=='whole native hierarchy' and preview['length_dbu']=='2000'
    route_project.update(inputs=inputs,preview=preview)
    failure(lambda:S.rpc('design.route_preview',{**inputs,'layer_id':'69/20'}),'UNSUPPORTED_LAYER')
    failure(lambda:S.rpc('design.route_preview',{**inputs,'width':'130'}),'ROUTE_WIDTH')
    failure(lambda:S.rpc('design.route_preview',{**inputs,'start':['1','0']}),'OFF_GRID')
    failure(lambda:S.rpc('design.route_preview',{**inputs,'end':['100','0']}),'ROUTE_AREA')
    failure(lambda:S.rpc('design.route_preview',{**inputs,'rule_fingerprint':'0'*64}),'STALE_RULES')
    failure(lambda:D.routing_rules({**p,'interchange_layout':{'reader':'native-database'}}),'PDK_RULE_UNSUPPORTED')
    failure(lambda:D.routing_rules({**p,'active_backend':{'profile_id':'unknown'}}),'PDK_RULE_UNSUPPORTED')
    return {'preview':preview}
case('exact integer Manhattan route and negative width area grid wrong process checks',routing_preview)

def apply_route():
    p=route_project['p'];preview=route_project['preview'];params={'project_id':p['id'],'expected_revision':p['revision'],'command_id':'room:'+str(uuid.uuid4()),'preview':route_project['inputs'],'preview_hash':preview['preview_hash'],'rule_fingerprint':preview['rule_fingerprint']}
    failure(lambda:S.rpc('design.route_apply',{**params,'preview_hash':'f'*64}),'STALE_PREVIEW')
    result=S.rpc('design.route_apply',params);assert result['revision']==2
    again=S.rpc('design.route_apply',params);assert again['revision']==2
    failure(lambda:S.rpc('design.route_apply',{**params,'command_id':uuid.uuid4().hex}),'REVISION_CONFLICT')
    l=S.load_layout(result);paths=[s for s in l.cell(result['cell']).shapes(l.layer(68,20)).each() if s.is_path()];assert len(paths)==1 and paths[0].path.width==140
    route_project['p']=result
    return {'project_id':result['id'],'revision':result['revision'],'preview_hash':preview['preview_hash'],'shape_property_id':paths[0].property(1)}
case('atomic route applies once with room CID and stale revision/hash rejection',apply_route)

def obstacle_tests():
    p=create('rc_lowpass')
    p=S.edit(p['id'],{'type':'add_box','layer_id':'68/20','box':['0','0','1000','1000'],'net':'A'},'layout')
    p=S.edit(p['id'],{'type':'add_label','layer_id':'68/5','text':'A','position':['500','500'],'net':'A'},'layout')
    p=S.edit(p['id'],{'type':'add_pin','layer_id':'68/16','name':'A','box':['0','0','1000','1000'],'net':'A'},'layout')
    before=S.rpc('view.get_scene',{'project_id':p['id'],'max_shapes':2000})
    separate={'project_id':p['id'],'layer_id':'68/20','start':['1100','500'],'end':['2100','500'],'width':'140','net':'A'}
    collision=S.rpc('design.route_preview',separate);assert not collision['valid'] and collision['collisions']
    unknown=S.rpc('design.route_preview',{**separate,'start':['500','500'],'net':'OTHER'});assert not unknown['valid']
    joined={**separate,'start':['900','500']};preview=S.rpc('design.route_preview',joined);assert preview['valid']
    p=S.rpc('design.route_apply',{'project_id':p['id'],'expected_revision':p['revision'],'command_id':uuid.uuid4().hex,'preview':joined,'preview_hash':preview['preview_hash'],'rule_fingerprint':preview['rule_fingerprint']})
    after=S.rpc('view.get_scene',{'project_id':p['id'],'max_shapes':2000});old={s['id']:s for s in before['shapes']};new={s['id']:s for s in after['shapes']};assert all(new[id]==s for id,s in old.items()),{'old':old,'new':new};assert sorted(before['labels'],key=lambda s:s['id'])==sorted(after['labels'],key=lambda s:s['id']) and sorted(before['pins'],key=lambda s:s['id'])==sorted(after['pins'],key=lambda s:s['id'])
    l=S.load_layout(p);l.cell(p['cell']).shapes(l.layer(68,44)).insert(k.Box(4000,0,4260,260));oldrev=p['revision'];p.update(revision=p['next_revision'],next_revision=p['next_revision']+1,undo_stack=p['undo_stack']+[oldrev]);p=S.commit(p,l,parent=oldrev)
    blocked=S.rpc('design.route_preview',{'project_id':p['id'],'layer_id':'68/20','start':['4100','0'],'end':['4100','1000'],'width':'140'});assert not blocked['valid'] and any(c['layer_id']=='68/44' for c in blocked['collisions'])
    return {'project_id':p['id'],'preserved_shape_ids':list(old),'preserved_label_count':len(before['labels']),'preserved_pin_count':len(before['pins']),'separate_same_annotation_valid':collision['valid']}
case('actual obstacle spacing, same-net disjoint rejection, preserved IDs labels pins and contact rejection',obstacle_tests)

def graph():
    p=projects['common_source_bias'];graph=S.rpc('design.connectivity',{'project_id':p['id']});nets={n['name']:n for n in graph['nets']};assert len(nets['GATE']['pins'])==4;assert graph['layout_binding']['status']=='not-generated' and graph['layout_binding']['mappings']==[]
    assert graph['ground_status']=='owned-testbench-ground-declaration'
    p=S.edit(p['id'],{'type':'set_pin','id':'mn1','pin':'D','net':'FLOAT'},'schematic');graph=S.rpc('design.check',{'project_id':p['id']});assert any(i['code']=='ADVISORY_SINGLE_TERMINAL_NET' and i['net']=='FLOAT' for i in graph['issues'])
    return {'project_id':p['id'],'net_count':len(nets),'source':graph['source'],'issues':graph['issues']}
case('actual declared pin connectivity, no fake geometry link and floating-net advisory',graph)

def route_drc():
    p=route_project['p'];run=job(p,'verification.run_drc');assert run.get('markers',[])==[]
    return {'project_id':p['id'],'run_id':run['id'],'revision':run['revision'],'manifest_path':run['manifest_path'],'tool':run.get('tool'),'analysis_result':run['analysis_result'],'scope':'only actual routed metal fixture, not RC layout completion','measurements':run.get('measurements',{})}

def restored_simulation():
    # Restore the validated immutable revision, rather than silently reusing the later failed-sidecar import.
    prior=restored_template['p'];origin=S.history_project(prior['id'],prior['revision']);bundle=S.export_bundle({'project_id':prior['id'],'revision':prior['revision']});restored=S.import_bundle({'path':bundle['path'],'mode':'new'});run=job(restored,analysis='tran');tau=run['measurements']['measured_tau_s'];assert abs(tau/20e-9-1)<.02;assert all(b['mapping']=='unmapped' for b in run['current_flow']['branches'])
    return {'project_id':restored['id'],'run_id':run['id'],'manifest_path':run['manifest_path'],'measured_tau_s':tau,'geometry_mapping':'unmapped','explicit_original_resistance_Ohm':origin['design_template']['parameters']['resistance_Ohm']}

def actual_op(template):
    analysis='op' if 'op' in D.CATALOG[template]['analyses'] else 'tran'
    p=create(template);run=job(p,analysis=analysis);waves={w['name']:w for w in run['waveforms']};assert all(math.isfinite(y) for w in waves.values() for y in w['y']);assert run['measurements']['metric_source']=='actual-ngspice-samples';flow=run['current_flow'];assert all(b['mapping']=='unmapped' and 'path_dbu' not in b for b in flow['branches'])
    if template=='mux4':assert run['digital_verification']['pass'] and run['digital_verification']['passed_cases']==64
    if template.startswith('common_source'):assert 0<waves['OUT']['y'][0]<1.8 and waves['supply_current']['y'][0]>1e-9
    if template=='current_mirror':assert .7<run['measurements']['mirror_ratio']<1.5 and abs(waves['reference_current']['y'][0]-100e-6)<1e-10
    if template=='differential_pair':assert run['measurements']['measured_tail_current_A']>1e-9
    return {'project_id':p['id'],'run_id':run['id'],'revision':run['revision'],'manifest_path':run['manifest_path'],'analysis_result':run['analysis_result'],'measurements':run['measurements'],'signed_current_branch_count':len(flow['branches']),'geometry_mapping':'unmapped (physical layout not generated)'}

def rc_sample_metrics():
    p=create('rc_lowpass');tran=job(p,analysis='tran');ac=job(p,analysis='ac');expected=10e-9;measured=tran['measurements']['measured_tau_s'];assert abs(measured/expected-1)<.02,(measured,expected)
    cutoff=ac['measurements']['measured_3db_frequency_Hz'];theory=1/(2*math.pi*expected);assert abs(cutoff/theory-1)<.02,(cutoff,theory);assert 'current_flow' not in ac
    return {'project_id':p['id'],'tran_run_id':tran['id'],'ac_run_id':ac['id'],'tran_manifest':tran['manifest_path'],'ac_manifest':ac['manifest_path'],'measured_tau_s':measured,'measured_3db_frequency_Hz':cutoff,'comparison_from_explicit_R_C':{'tau_s':expected,'3db_frequency_Hz':theory},'complex_ac_current_arrows':'unsupported'}

def common_source_ac():
    p=create('common_source');run=job(p,analysis='ac');waves={w['name']:w for w in run['waveforms']};assert len(waves['OUT_gain']['y'])>300 and waves['OUT_gain']['y'][0]>.1;phase=waves['OUT_phase']['y'][0];assert abs(abs(phase)-180)<5;assert 'current_flow' not in run
    return {'project_id':p['id'],'run_id':run['id'],'manifest_path':run['manifest_path'],'actual_low_frequency_magnitude':waves['OUT_gain']['y'][0],'actual_low_frequency_phase_deg':phase,'measurements':run['measurements']}

def actual_sweeps():
    evidence=[]
    for template in ('current_mirror','differential_pair','common_source_bias'):
        p=create(template);run=job(p,analysis='dc');assert len(run['waveforms'][0]['x'])>=90;assert run['measurements']['x_unit']=='V';evidence.append({'template':template,'project_id':p['id'],'run_id':run['id'],'manifest_path':run['manifest_path'],'samples':run['measurements']['samples']})
    return {'runs':evidence}

def physical_core():
    p=create('current_mirror',physical_core=True);l=S.load_layout(p);assert not l.cell(p['cell']).is_empty();binding=S.rpc('design.connectivity',{'project_id':p['id']});assert binding['layout_binding']['status']=='explicit-device-metadata' and binding['layout_binding']['mappings'];assert all(not item['electrical_verified'] for item in binding['layout_binding']['mappings']);run=job(p,'verification.run_drc');pre=job(p,analysis='op');post=job(p,analysis='op',post_layout=True)
    a=pre['measurements']['measured_output_current_A'];b=post['measurements']['measured_output_current_A'];assert a>1e-9 and b>1e-9 and abs(b/a-1)<.2
    return {'project_id':p['id'],'physical_status':p['design_template']['layout_status'],'drc_run_id':run['id'],'pre_run_id':pre['id'],'post_run_id':post['id'],'drc_manifest':run['manifest_path'],'pre_manifest':pre['manifest_path'],'post_manifest':post['manifest_path'],'actual_output_current_pre_A':a,'actual_output_current_post_A':b,'layout_annotation_binding_count':len(binding['layout_binding']['mappings']),'electrical_signoff':'not claimed; separate actual LVS required'}

if __name__=='__main__':
    if os.environ.get('REGISTER_DESIGN_NATIVE')=='1':
        case('actual restored RC sidecar simulation uses origin parameters and no physical arrows',restored_simulation)
        case('actual Magic full DRC of applied route metal geometry',route_drc)
        for template in D.CATALOG:case('actual ngspice '+template+' supported analysis signed currents no invented physical arrows',lambda template=template:actual_op(template))
        case('actual RC transient time constant and AC cutoff from parsed samples',rc_sample_metrics)
        case('actual public-MOS common-source AC magnitude and inverting phase',common_source_ac)
        case('actual independent declared DC sweeps for mirror diffpair and biased common-source',actual_sweeps)
        case('actual fixed public mirror physical core DRC and pre/post extracted current',physical_core)
    save()
