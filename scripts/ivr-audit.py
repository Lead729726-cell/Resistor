"""Recompute IVR criteria from retained native bytes, without running a solver."""
import hashlib
import json
import math
from pathlib import Path
import re
import sys

root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'workers/eda'))
import power_ivr as P
import design_tools as D
import native

folder=root/'docs/evidence/ivr-20261031'
evidence=json.loads((folder/'native.json').read_text(encoding='utf-8'))
info=json.loads((root/'.runtime/ivr/latest.json').read_text(encoding='utf-8'))
workspace=Path(info['workspace'])
assert info['project_id']==evidence['project_id']
ir=P.schematic(evidence['preview']['parameters'])
assert D.digest(ir)==evidence['preview']['schematic_sha256'],'Executed DUT differs from current circuit.'
assert native.emit(ir,P.ID,P.PORTS)==(root/'examples/ivr/core.spice').read_text(encoding='utf-8')
result=dict(schema_version=1,edition='indust',solver_executed=False,
    scope='Current measurement logic re-evaluates actual retained OP/AC/tran samples; not a new solver or signoff run.',
    logical_dut_matches_current_source=True,cases=[])
for entry in evidence['runs']:
    assert re.fullmatch('[a-f0-9]{32}',entry['id'])
    runfolder=workspace/'.runtime/eda/runs'/entry['id']
    manifest=(runfolder/'manifest.json').read_bytes()
    assert hashlib.sha256(manifest).hexdigest()==entry['manifest_sha256']
    raw=(runfolder/'waveform.dat').read_bytes()
    rows=[[float(v) for v in line.split()] for line in raw.decode().splitlines()[1:] if line.strip()]
    analysis=entry['condition']['analysis']
    names=['supply_to_output_gain','supply_to_output_phase'] if analysis=='ac' else ['VIN','OUT','VREF','EN','FB','GATE','BIAS','supply_current','load_current']
    assert all(len(row)==len(names)+1 for row in rows)
    run=dict(measurements={},waveforms=[dict(name=name,x=[r[0] for r in rows],y=[r[i+1] for r in rows]) for i,name in enumerate(names)])
    P.measurements(dict(design_template=dict(parameters=evidence['preview']['parameters'])),run,entry['condition'])
    row=dict(native_run_id=entry['id'],condition=entry['condition'],original_execution_status=entry['execution_status'],
        waveform_sha256=hashlib.sha256(raw).hexdigest(),current_checks=run['reference_verification'])
    if analysis=='ac':
        peak=max(rows,key=lambda r:r[1]);row.update(minimum_sampled_psrr_dB=-20*math.log10(peak[1]),minimum_psrr_frequency_Hz=peak[0])
    result['cases'].append(row)
assert len(result['cases'])==9
result['all_current_criteria_passed']=all(c['original_execution_status']=='completed' and c['current_checks']['pass'] for c in result['cases'])
assert result['all_current_criteria_passed'],'Actual retained samples fail current IVR criteria.'
result['source_sha256']={f:hashlib.sha256((root/f).read_bytes()).hexdigest() for f in ['workers/eda/power_ivr.py','workers/eda/signal_metrics.py','scripts/ivr-audit.py']}
(folder/'criteria-audit.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(dict(actual_samples_reaudited=len(result['cases']),current_criteria_passed=True,logical_dut_unchanged=True,new_solver_runs=0)))
