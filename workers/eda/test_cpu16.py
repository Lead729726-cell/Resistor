"""Isolated 16-bit numerical/structural cases and actual ngspice regressions."""
import copy,hashlib,json,os,time,uuid
from pathlib import Path
ROOT=Path('/workspace');OUT=ROOT/'.runtime/evidence'/('cpu16-'+uuid.uuid4().hex);OUT.mkdir(parents=True)
os.environ['MOS_STATE']=str(OUT/'state');os.environ['MOS_TOKEN']='isolated-cpu16-tests-only'
os.environ['PATH']='/foss/tools/magic/bin:/foss/tools/netgen/bin:/foss/tools/ngspice/bin:'+os.environ['PATH']
import server as S
import digital_units as U
import native
from geometry import EDAError
cases=[];projects={};runs={}
def save():
    paths=['workers/eda/digital_units.py','workers/eda/server.py','workers/eda/hierarchy_transfer.py','workers/eda/test_cpu16.py']
    record={'schema_version':1,'case_count':len(cases),'passed':sum(c['pass'] for c in cases),'cases':cases,'state_root':str(OUT/'state'),'source_sha256':{p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in paths}}
    (OUT/'result.json').write_text(json.dumps(record,indent=2));(ROOT/'docs/evidence/cpu16-native.json').write_text(json.dumps(record,indent=2))
def case(name,fn,source):
    try:details=fn() or {};cases.append({'name':name,'pass':True,'source':source,**details});print('PASS '+name,flush=True);save()
    except Exception as e:cases.append({'name':name,'pass':False,'error':str(e),'source':source});save();raise
def rejects(fn,code):
    try:fn()
    except EDAError as e:assert e.code==code,(e.code,code);return
    raise AssertionError('Expected '+code)
def structure():
    ir=U.schematic('cpu16');assert native.validate(ir)['valid'];flat=U.flattened(ir)
    assert len(ir['cells']['ADD16']['devices'])==16
    assert all(d['kind'] in ('nmos','pmos') for d in flat['devices'])
    assert 'ACC15' in ir['ports'] and 'PC3' in ir['ports'] and 'PC4' not in ir['ports']
    assert len(ir['cells']['ROM16']['ports'])==24
    for drawing in [ir,*ir['cells'].values()]:
        for start in range(4,len(drawing['devices']),4):
            previous=drawing['devices'][start-4:start];current=drawing['devices'][start:start+4]
            height=lambda d:max(60,len(d['pins'])*24) if d['kind']=='block' else 115
            assert min(d['y']-height(d)/2 for d in current)>max(d['y']+height(d)/2 for d in previous)
    text=native.emit(ir,'cpu16',ir['ports']);assert not any(line.startswith(('B','E','G','V','I')) for line in text.splitlines() if line and not line.startswith('*'))
    return {'mos_count':len(flat['devices']),'data_bits':16,'pc_bits':4,'rom_bits_per_word':18}
case('Native hierarchical 16-bit ALU/register/ROM; flattened devices are MOS only',structure,'native-schematic-structure')
def limits():
    for value in [-1,65536,True,1.2]:
        program=copy.deepcopy(U.DEFAULT_PROGRAM16);program[0]['value']=value;rejects(lambda:U.program_input(program,16),'INVALID_PROGRAM')
    rejects(lambda:U.program_input(U.DEFAULT_PROGRAM16,4),'INVALID_PROGRAM')
    rejects(lambda:U.program_input([],16),'INVALID_PROGRAM')
    U.program_input([{'op':'LOAD','value':65535}]*16,16)
case('16-bit unsigned immediates and 4-bit legacy limits remain separate',limits,'input-validation')
def oracle():
    rows=U.cpu_trace(U.DEFAULT_PROGRAM16,32,16)
    expected=[4660,9029,0,65535,32769,65535,0,32767,32768,0,43605,21930,43605,2565,0,32768]
    assert [r['expected'] for r in rows[:16]]==expected
    assert [r['index'] for r in rows if r['carry_expected']]==[2,6,14,18,22,30]
    assert rows[15]['pc_after']==0 and rows[31]['pc_after']==0
    return {'known_outputs':expected,'cycles':32,'rom_wraps':2}
case('Independent 16-bit known values, carry, zero and two ROM wraps',oracle,'numerical-oracle-fixture')
def directed():
    rows=U.operands('adder16');assert len(rows)==70 and len(rows)==len(set(rows))
    for i in range(16):assert (1<<i,0,0) in rows and (0,1<<i,0) in rows and ((1<<i)-1,0,1) in rows
    assert (65535,65535,1) in rows;return {'count':70,'coverage':'directed, not exhaustive 2^33 combinations'}
case('Walking bit, every carry-chain length and arithmetic boundary vector coverage',directed,'test-vector-contract')
def actual(kind,wrap=False):
    p=S.rpc('digital.create',{'kind':kind,'physical':False,'period_ns':100,'command_id':uuid.uuid4().hex})
    if wrap:
        request={'project_id':p['id'],'mode':'wrap','parent_name':'CPU16_CHIP'}
        preview=S.rpc('hierarchy.preview',request)
        p=S.rpc('hierarchy.apply',{'project_id':p['id'],'request':request,'preview_hash':preview['preview_hash'],'approved':True,'expected_revision':p['revision'],'command_id':uuid.uuid4().hex})
        assert p['digital_unit']['internal_probe_prefix']=='xu.xMAIN.'
    r=S.rpc('simulation.run',{'project_id':p['id'],'expected_revision':p['revision'],**p['testbench']});deadline=time.monotonic()+650
    while r['execution_status'] in ('queued','running') and time.monotonic()<deadline:
        time.sleep(.5);r=S.rpc('job.status',{'run_id':r['id']})
    assert r['execution_status']=='completed',r.get('message');v=r['unit_verification'];assert v['pass'],[row for row in v['rows'] if not row['pass']]
    assert v['power']['available'];projects[kind]=p;runs[kind]=r
    if kind.startswith('cpu'):assert v['reset_verified'] and v['rom_wraps']==1
    if kind=='cpu16':assert v['datapath_bits']==16 and max(row['actual'] for row in v['rows'])==65535
    return {'project_id':p['id'],'run_id':r['id'],'elapsed_s':r['elapsed_s'],'measurements':r['measurements'],'verification':v,'wrapped':wrap}
case('Actual 16-bit ripple adder 70/70 directed transient cases',lambda:actual('adder16'),'actual-ngspice')
case('Actual wrapped 16-bit CPU: upper bits, overflow, reset, PC, ROM and flags',lambda:actual('cpu16',True),'actual-ngspice')
case('Actual legacy 4-bit CPU still executes and wraps 16 instructions',lambda:actual('cpu4'),'actual-ngspice-regression')
def corrupted():
    p=projects['cpu16'];r=copy.deepcopy(runs['cpu16']);next(w for w in r['waveforms'] if w['name']=='ACC15')['y']=[0]*len(r['waveforms'][0]['x']);assert not U.verify(p,r,p['testbench'])['pass']
    r=copy.deepcopy(runs['cpu16']);r['waveforms']=[w for w in r['waveforms'] if w['name']!='IMM15'];rejects(lambda:U.verify(p,r,p['testbench']),'MISSING_WAVEFORM')
    return {'altered_upper_output_rejected':True,'missing_upper_rom_bit_rejected':True}
case('Corrupt or missing high-bit actual samples cannot certify a 16-bit CPU',corrupted,'deliberately-altered-actual-waveform')
save();print(f'{len(cases)}/{len(cases)} CPU16 cases passed',flush=True)
