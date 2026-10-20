"""Collect the controlled, same-PEX convergence experiment without relabeling jobs."""
import hashlib,json,re,shutil,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'workers/eda'))
import sar12

def sha(file):return hashlib.sha256(file.read_bytes()).hexdigest()
source=ROOT/'.runtime/sar12/lab/.runtime/eda/runs/8a098651639f4123b3e5251749efa44c'
out=ROOT/'examples/sar12-lab/convergence';out.mkdir(parents=True,exist_ok=True)
original=(source/'testbench.spice').read_text()
project=json.loads((source/'project.json').read_text());v={**sar12.DEFAULTS,**project['design_template']['parameters']}
report={'schema_version':1,'edition':'Resistor Indust','source_run':source.name,'extracted_dut_sha256':sha(source/'pex-simulation.spice'),'solver':'ngspice 42 / KLU','cases':[],'scope':'Controlled external testbench change only; no extracted resistor, capacitor, MOS model or solver tolerance changed. These are preserved experiments, separate from revision-bound engine jobs.'}
for mode in ('baseline','no-marker','supply-r'):
    folder=ROOT/'.runtime/sar12/convergence'/mode;result=json.loads((folder/'result.json').read_text())
    text=(folder/'testbench.spice').read_text();log=(folder/'ngspice.log').read_text()
    assert result['source_sha256']==report['extracted_dut_sha256']
    expected=original
    if mode=='supply-r':expected=expected.replace('VDD VPWR VGND 1.8','VDD VDD_DRV VGND 1.8\nRVDD VDD_DRV VPWR 0.1')
    if mode=='no-marker':expected='\n'.join(l for l in original.splitlines()if not l.startswith(('VMARK ','RMARK ')))+'\n'
    assert text==expected,'Unrecorded experiment change'
    complete=result['exit']==0 and 'SAR12_NATIVE_COMPLETE' in log and 'Timestep too small' not in log
    item={'case':mode,'execution_status':'completed' if complete else 'failed','returncode':result['exit'],'elapsed_s':result['seconds'],'source_unchanged':True,'complete':complete,'files':{}}
    if complete:
        rows,frames,ambiguous=sar12.parse_decisions(folder/'decisions.csv',sar12.inputs(v),project['testbench']['supply_V'],v['reference_V'])
        pauses=[float(l.split('=')[-1])for l in (folder/'pause-times.txt').read_text().splitlines()if '=' in l]
        assert len(pauses)==26 and all(a<b for a,b in zip(pauses,pauses[1:]))
        item.update(frames=frames,ambiguous_decisions=ambiguous,actual_pause_count=len(pauses),raw_waveform_sha256=sha(folder/'waveform.dat'))
    for name in ('testbench.spice','ngspice.log','decisions.csv','pause-times.txt','result.json'):
        if not (folder/name).exists():continue
        dest=out/mode/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(folder/name,dest);item['files'][name]=sha(dest)
    report['cases'].append(item)
assert [c['complete'] for c in report['cases']]==[False,False,True]
low_source=ROOT/'.runtime/sar12/lab/.runtime/eda/runs/d52e6edd331f4f61a400ac2fc30fc73b'
low_text=(low_source/'testbench.spice').read_text();end=float(next(l for l in low_text.splitlines()if l.startswith('.tran ')).split()[2]);now=0.;expected=[]
for line in low_text.splitlines():
    f=line.split()
    if f and f[0] in ('VINP','VINN','VD_SAMPLE','VD_EVAL',*[f'VD_B{i}'for i in range(12)]):line=' '.join(f[:3])+f' PWL(0 {f[3]} {end:.15g} {f[3]})'
    m=re.match(r'if abs\(time\[sar12_k\] - ([\d.eE+-]+)\)',line)
    if m:now=float(m[1])
    m=re.match(r'alter (\w+) = (.+)',line)
    if m:
        src,value=m.groups();value=value.replace('$&','')
        expected += [f'let sar12_previous = @{src}[pwl]','let sar12_stimulus = vector(8)','let sar12_stimulus[0] = 0','let sar12_stimulus[1] = sar12_previous[length(sar12_previous)-1]',f'let sar12_stimulus[2] = {now+1e-9:.15g}','let sar12_stimulus[3] = sar12_stimulus[1]',f'let sar12_stimulus[4] = {now+3e-9:.15g}',f'let sar12_stimulus[5] = {value}',f'let sar12_stimulus[6] = {end:.15g}','let sar12_stimulus[7] = sar12_stimulus[5]',f'alter @{src}[pwl] = sar12_stimulus']
    else:expected.append(line)
pwl=ROOT/'.runtime/sar12/convergence/pwl-low'
assert (pwl/'testbench.spice').read_text()=='\n'.join(expected)+'\n','Unexpected change besides finite source transitions'
assert 'Timestep too small' in (low_source/'ngspice.log').read_text()
pwl_result=json.loads((pwl/'result.json').read_text());assert pwl_result['exit']==0 and pwl_result['complete']
_,frames,ambiguous=sar12.parse_decisions(pwl/'decisions.csv',[-1.16220703125],1.8,1.2)
report['finite_edge_comparison']={'source_run':low_source.name,'extracted_dut_sha256':sha(low_source/'pex-simulation.spice'),'dc_update_execution_status':'failed','pwl_update_execution_status':'completed','change':'External input/control DC changes replaced by continuous PWL; 1ns delay, 2ns rise/fall. No reset, new DUT, relaxed tolerance or capacitance change.','frames':frames,'ambiguous_decisions':ambiguous,'raw_waveform_sha256':sha(pwl/'waveform.dat'),'logic_replay':'See the formal engine jobs; this standalone experiment only validates native decisions and completion.','files':{}}
for case,folder in [('low-dc',low_source),('pwl-low',pwl)]:
    for name in ('testbench.spice','ngspice.log','decisions.csv','pause-times.txt','result.json'):
        if not (folder/name).exists():continue
        dest=out/case/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(folder/name,dest);report['finite_edge_comparison']['files'][case+'/'+name]=sha(dest)
matrix_source=ROOT/'.runtime/sar12/lab/.runtime/eda/runs/4b5d8c07679a4efda589d495092c2fe2'
matrix_text=(matrix_source/'testbench.spice').read_text()
report['matrix_solver_comparison']={'source_run':matrix_source.name,'extracted_dut_sha256':sha(matrix_source/'pex-simulation.spice'),'klu_baseline':'failed at 4.551055534706587e-6 s','cases':[],'scope':'Same immutable RC netlist and source waveforms. Only the recorded solver option changes; no accuracy tolerance is relaxed.'}
for case,replacement in [('iterations','.option klu itl4=100 '),('pivot','.option klu pivrel=1 '),('sparse','.option ')]:
    folder=ROOT/'.runtime/sar12/convergence'/case;result=json.loads((folder/'result.json').read_text());log=(folder/'ngspice.log').read_text()
    assert (folder/'testbench.spice').read_text()==matrix_text.replace('.option klu ',replacement)
    complete=result['exit']==0 and 'SAR12_NATIVE_COMPLETE'in log and 'Timestep too small'not in log
    assert complete==(case=='sparse')
    item={'case':case,'execution_status':'completed'if complete else'failed','elapsed_s':result['seconds'],'files':{}}
    if complete:
        assert 'Using SPARSE 1.3 as Direct Linear Solver'in log
        _,frames,ambiguous=sar12.parse_decisions(folder/'decisions.csv',[sar12.DEFAULTS['input_differential_V']],1.8,1.2)
        item.update(frames=frames,ambiguous_decisions=ambiguous,raw_waveform_sha256=sha(folder/'waveform.dat'))
    for name in ('testbench.spice','ngspice.log','decisions.csv','pause-times.txt','result.json'):
        if not(folder/name).exists():continue
        dest=out/case/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(folder/name,dest);item['files'][name]=sha(dest)
    report['matrix_solver_comparison']['cases'].append(item)
(out/'comparison.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'controlled_comparison_verified':True,'cases':[{k:c[k]for k in ('case','execution_status','complete')}for c in report['cases']]}))
