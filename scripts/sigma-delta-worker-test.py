"""Isolated database/API regression; never opens the user's live design DB."""
import json
import os
from pathlib import Path
import sys
import time
import uuid
ROOT=Path('/workspace')
sys.path.insert(0,str(ROOT/'workers/eda'))
output=ROOT/'.runtime/sigma-delta8'/('worker-test-'+uuid.uuid4().hex)
os.environ['MOS_STATE']=str(output/'state')
os.environ['MOS_TOKEN']='isolated-sigma-delta-test-not-a-credential'
import server as S
import sigma_delta as A

projects=[]
for kind in A.CATALOG:
    params={'template_id':kind,'command_id':uuid.uuid4().hex,'physical_core':False}
    p=S.rpc('design.create_template',params)
    assert S.rpc('design.create_template',params)['id']==p['id']
    assert S.rpc('schematic.validate',{'project_id':p['id']})['valid']
    projects.append(p)
    assert not p['runs'] and p['design_template']['physical_verification']=='not-run'
    try:S.rpc('verification.run_drc',{'project_id':p['id']})
    except S.EDAError as error:assert error.code=='NO_PHYSICAL_LAYOUT'
    else:raise AssertionError('Empty ADC layout must never pass physical checks')

digital=next(p for p in projects if p['example']=='sdm8_filter')
run=S.rpc('simulation.run',{'project_id':digital['id']})
deadline=time.monotonic()+30
while time.monotonic()<deadline:
    result=S.get_run(run['id'])
    if result['execution_status'] in ('completed','failed','canceled'):break
    time.sleep(.1)
assert result['execution_status']=='completed',result
assert result['analysis_result']=='pass',result
assert result['tool']=='Icarus Verilog'
assert result['measurements']['analog_execution'].startswith('not performed')
assert all(Path(path).is_file() for key,path in result['artifacts'].items() if key!='stdout')
root=next(p for p in projects if p['example']=='sigma_delta8')
root=S.rpc('schematic.apply_command',{'project_id':root['id'],'expected_revision':root['revision'],'command_id':uuid.uuid4().hex,'command':{'type':'update_testbench','settings':{'duration_s':.017,'step_s':125e-9}}})
assert root['testbench']['duration_s']==.017
report={'schema_version':1,'isolated_state':str(output/'state'),'created_circuits':len(projects),'empty_layout_checks_rejected':len(projects),'idempotent_creation':True,'digital_run':result,'bounded_adc_settings_saved':True}
(output/'result.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'created_circuits':len(projects),'digital_status':result['execution_status'],'digital_verdict':result['analysis_result'],'result':str(output/'result.json')}))
S.POOL.shutdown(wait=True)
