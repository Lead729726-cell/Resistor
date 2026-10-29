"""DUET-AFE: editable dual-band SKY130 sensor front end.

Self bias, closed-loop MOS gain, two RC/buffer paths. Ideal R/C, external
two-tone stimulus/load; schematic research prototype, not a fabricated chip.
All measurements below require native ngspice samples.
"""
import copy
import math
from pathlib import Path
import analog_soc as A
import chip_references as C
import native
from geometry import EDAError

ID = 'sensor_afe_dualband'
PORTS = ['VIN', 'PRE_OUT', 'SLOW', 'FAST', 'VCM', 'BIAS', 'VPWR', 'VGND']
DEFAULTS = dict(gain_V_per_V=4., slow_cutoff_Hz=5000., fast_cutoff_Hz=100000.,
                pole_F=100e-12, compensation_F=5e-12, nulling_Ohm=5000., bias_resistance_Ohm=30000.)
CATALOG = {ID:dict(name='DUET-AFE · 이중 대역 센서 프런트엔드', ports=PORTS,
    parameter_defaults=DEFAULTS, analyses=['op','ac','tran'], physical_supported=False,
    physical_status='not-generated', category='센서·자동 설계',
    scope='SKY130 1.8V MOS · 자체 바이어스 + 폐루프 증폭 + 저속/고속 RC 버퍼. R/C는 이상적, 레이아웃·잡음·오프셋 미검증.',
    targets=['두 경로 저주파 이득','실제 −3dB 대역폭','5k/50kHz 분리','공급 전력'])}
LIMITS = ['Schematic research prototype; no novelty or product-performance claim.',
          'Ideal resistors/capacitors and external 5kHz+50kHz stimulus, 50fF loads.',
          'MOS PVT only; RC variation, noise, mismatch, CMRR/PSRR, physical area and signoff are not measured.']

def parameters(values):
    if set(values)-set(DEFAULTS):raise EDAError('UNSUPPORTED_PARAMETER','Unknown DUET-AFE parameter.')
    v={**DEFAULTS,**values}
    for key,value in v.items():v[key]=native.num(value)
    ranges={'gain_V_per_V':(2,8),'slow_cutoff_Hz':(2000,20000),'fast_cutoff_Hz':(30000,200000),
            'pole_F':(20e-12,200e-12),'compensation_F':(2e-12,10e-12),
            'nulling_Ohm':(1000,20000),'bias_resistance_Ohm':(20000,80000)}
    for key,(lo,hi) in ranges.items():
        if not lo<=v[key]<=hi:raise EDAError('PARAMETER_RANGE',f'{key} must be within {lo}..{hi} in base SI units.')
    if v['fast_cutoff_Hz']<4*v['slow_cutoff_Hz']:raise EDAError('PARAMETER_RANGE','Fast pole must be at least four times the slow pole.')
    return v

def settings():return dict(analysis='ac',duration_s=800e-6,step_s=50e-9)

def schematic(values):
    v=parameters(values);lib=A.library(v)
    next(d for d in lib['SOC_BIAS']['devices'] if d['name']=='R_BIAS')['parameters']['value']=v['bias_resistance_Ohm']
    gain=C.cell(['VIN','VCM','BIAS','OUT','VPWR','VGND'])
    C.block(gain,'AMP','SOC_OTA',lib['SOC_OTA']['ports'],{'INP':'VIN','INN':'FB'})
    C.passive(gain,'R_GROUND','resistor','FB','VCM',100000.)
    C.passive(gain,'R_FEEDBACK','resistor','OUT','FB',(v['gain_V_per_V']-1)*100000.)
    lib['DUET_GAIN']=gain
    for label,key in [('SLOW','slow_cutoff_Hz'),('FAST','fast_cutoff_Hz')]:
        branch=C.cell(['VIN','BIAS','OUT','VPWR','VGND'])
        C.passive(branch,'R_POLE','resistor','VIN','FILTERED',1/(2*math.pi*v[key]*v['pole_F']))
        C.passive(branch,'C_POLE','capacitor','FILTERED','VGND',v['pole_F'])
        C.block(branch,'BUFFER','SOC_OTA',lib['SOC_OTA']['ports'],{'INP':'FILTERED','INN':'OUT'})
        lib['DUET_'+label]=branch
    ir=C.cell(PORTS)
    for name,child,mapping in [('BIAS_SOURCE','SOC_BIAS',{}),('PREAMP','DUET_GAIN',{'OUT':'PRE_OUT'}),
        ('SLOW_PATH','DUET_SLOW',{'VIN':'PRE_OUT','OUT':'SLOW'}),('FAST_PATH','DUET_FAST',{'VIN':'PRE_OUT','OUT':'FAST'})]:
        C.block(ir,name,child,lib[child]['ports'],mapping)
    cells={}
    def visit(node):
        for d in node['devices']:
            if d['kind']=='block' and d['cell_name'] not in cells:
                cells[d['cell_name']]=copy.deepcopy(lib[d['cell_name']]);visit(cells[d['cell_name']])
    visit(ir);ir['cells']=cells
    return ir

def spice_tb(p,folder,s,netlist,model_deck,sub):
    supply=s['supply_V'];analysis=s['analysis']
    if not 1.6<=supply<=1.8:raise EDAError('STIMULUS_RANGE','DUET-AFE uses the supported 1.6..1.8V supply range.')
    rows=['DUET-AFE owned two-tone testbench',f'.include "{model_deck}"',f'.include "{netlist}"',
          '.options method=gear maxord=2',f'.temp {s["temperature_C"]}',
          'VGND VGND 0 0',f'VDD VPWR VGND {supply:.12g}',
          f'VLOW VIN_BASE VGND DC {supply/2:.12g} AC 1 SIN({supply/2:.12g} 0.005 5000)',
          'VFAST VIN VIN_BASE DC 0 AC 0 SIN(0 0.005 50000)',
          'CLOAD_S SLOW VGND 50f','CLOAD_F FAST VGND 50f',
          f'.nodeset v(VCM)={supply/2:.12g} v(PRE_OUT)={supply/2:.12g} v(SLOW)={supply/2:.12g} v(FAST)={supply/2:.12g}',
          'XU '+' '.join(sub)+' '+p['cell'],'.control','set num_threads=1','set numdgt=17',
          'set wr_singlescale','set wr_vecnames','set noaskquit']
    names=['VIN','PRE_OUT','SLOW','FAST','VCM','BIAS','supply_current']
    vectors=[f'v({n})' for n in names[:-1]]+['-i(VDD)'];units=['V']*6+['A']
    if analysis=='ac':
        rows.append('ac dec 80 10 1e8');names=['SLOW_gain','FAST_gain','PRE_gain'];vectors=['mag(v(SLOW))','mag(v(FAST))','mag(v(PRE_OUT))'];units=['V/V']*3;xunit,xlabel='Hz','frequency'
    elif analysis=='op':rows+=['op','let mos_sample_index=0','setscale mos_sample_index'];xunit,xlabel='point','operating point'
    elif analysis=='tran':rows.append(f'tran {s["step_s"]:.12g} {s["duration_s"]:.12g}');xunit,xlabel='s','time'
    else:raise EDAError('UNSUPPORTED_ANALYSIS','DUET-AFE supports op/ac/tran only.')
    rows += [f'let mos_wave_{i} = {vec}' for i,vec in enumerate(vectors)]
    rows += ['wrdata waveform.dat '+' '.join(f'mos_wave_{i}' for i in range(len(vectors))),'write waveform.raw all','quit','.endc','.end']
    dest=Path(folder)/'testbench.spice';dest.write_text('\n'.join(rows)+'\n')
    return dest,names,units,xunit,xlabel

def bandwidth(w):
    from signal_metrics import validate_wave
    validate_wave(w);low=w['y'][0]
    if low<=0:return None
    target=low/math.sqrt(2)
    for i in range(1,len(w['x'])):
        a,b=w['y'][i-1:i+1]
        if 0<b<=target<=a and a!=b:
            t=math.log(target/a)/math.log(b/a)
            return math.exp(math.log(w['x'][i-1])+t*math.log(w['x'][i]/w['x'][i-1]))
    return None

def two_tone(w,a,b):
    # Uniform resampling avoids weighting adaptive SPICE timestep density.
    # This fixed five-term fit uses no optional NumPy/runtime dependency.
    from signal_metrics import validate_wave,value_at
    validate_wave(w)
    if value_at(w,a) is None or value_at(w,b) is None:raise EDAError('INCOMPLETE_WAVEFORM','Two-tone window is not covered by actual samples.')
    if b-a<1/5000:raise EDAError('INCOMPLETE_WAVEFORM','Two-tone fitting requires at least one complete 5kHz cycle.')
    times=[a+(b-a)*i/4096 for i in range(4097)]
    values=[value_at(w,t) for t in times]
    matrix=[[1.,math.sin(2*math.pi*5000*t),math.cos(2*math.pi*5000*t),math.sin(2*math.pi*50000*t),math.cos(2*math.pi*50000*t)] for t in times]
    aug=[[math.fsum(row[i]*row[j] for row in matrix) for j in range(5)]+[math.fsum(row[i]*y for row,y in zip(matrix,values))] for i in range(5)]
    for i in range(5):
        pivot=max(range(i,5),key=lambda j:abs(aug[j][i]));aug[i],aug[pivot]=aug[pivot],aug[i]
        if abs(aug[i][i])<1e-10:raise EDAError('INVALID_WAVEFORM','Two-tone fit is singular.')
        scale=aug[i][i];aug[i]=[v/scale for v in aug[i]]
        for j in range(5):
            if j!=i:
                factor=aug[j][i];aug[j]=[v-factor*u for v,u in zip(aug[j],aug[i])]
    c=[row[-1] for row in aug]
    residual=math.sqrt(math.fsum((y-math.fsum(v*q for v,q in zip(row,c)))**2 for row,y in zip(matrix,values))/len(values))
    return dict(mean_V=c[0],tone_5k_V=math.hypot(c[1],c[2]),tone_50k_V=math.hypot(c[3],c[4]),residual_rms_V=residual)

def measurements(p,run,s):
    v=parameters(p['design_template']['parameters']);waves={w['name']:w for w in run['waveforms']};m=run.setdefault('measurements',{});checks=[]
    def check(name,passed,observed):checks.append(dict(name=name,pass_=bool(passed),observed=observed))
    m.update(metric_source='actual-ngspice-samples',reference_scope='DUET-AFE directed schematic criteria only.',unverified=LIMITS)
    if s['analysis']=='ac':
        for label,key in [('SLOW','slow_cutoff_Hz'),('FAST','fast_cutoff_Hz')]:
            w=waves[label+'_gain'];gain=w['y'][0];bw=bandwidth(w)
            m[label.lower()+'_gain_V_per_V']=gain;m[label.lower()+'_bandwidth_Hz']=bw
            check(label+' low-frequency gain within 5%',abs(gain/v['gain_V_per_V']-1)<=.05,gain)
            check(label+' bandwidth within 20% of requested RC pole',bw is not None and abs(bw/v[key]-1)<=.2,bw)
    elif s['analysis']=='op':
        for label in ('PRE_OUT','SLOW','FAST'):
            value=waves[label]['y'][0];check(label+' DC within 50mV of VDD/2',abs(value-s['supply_V']/2)<.05,value)
        current=waves['supply_current']['y'][0];m.update(supply_current_A=current,supply_power_W=current*s['supply_V'])
        check('Nonnegative finite DC supply power',math.isfinite(m['supply_power_W']) and m['supply_power_W']>=0,m['supply_power_W'])
    elif s['analysis']=='tran':
        end=waves['VIN']['x'][-1];a=end/2;b=end
        for label in ('VIN','SLOW','FAST'):
            m[label.lower()+'_two_tone']=two_tone(waves[label],a,b)
            if label!='VIN':
                vals=[y for x,y in zip(waves[label]['x'],waves[label]['y']) if x>=a]
                check(label+' settled signal within rails',bool(vals) and min(vals)>=-.05 and max(vals)<=s['supply_V']+.05,[min(vals),max(vals)])
                check(label+' two-tone residual below 5mV',m[label.lower()+'_two_tone']['residual_rms_V']<.005,m[label.lower()+'_two_tone']['residual_rms_V'])
        slow=m['slow_two_tone']['tone_50k_V'];fast=m['fast_two_tone']['tone_50k_V']
        m['fast_to_slow_50k_ratio']=fast/slow if slow>0 else None
        check('50kHz fast/slow amplitude separation greater than 3',m['fast_to_slow_50k_ratio'] is not None and m['fast_to_slow_50k_ratio']>3,m['fast_to_slow_50k_ratio'])
        mean=A.window(waves['supply_current'],a,b)[0];m.update(supply_current_A=mean,supply_power_W=mean*s['supply_V'])
    result=dict(schema_version=1,kind=ID,source='actual-ngspice-samples',checks=[dict(name=c['name'],**{'pass':c['pass_']},observed=c['observed']) for c in checks],scope=m['reference_scope'])
    result['pass']=all(c['pass_'] for c in checks) if checks else None;run['reference_verification']=result
    if checks:run['analysis_result']='pass' if result['pass'] else 'fail'
