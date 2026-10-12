"""Editable SKY130 analog SoC macros, owned stimuli and measured criteria.

This is a sensor-interface subsystem, not a fabricated SoC or foundry signoff.
All signal processing in the DUT uses actual MOS/poly/MIM-capable devices.
"""
import copy
import math
from pathlib import Path
import chip_references as C
import digital_units as D
import native
from geometry import EDAError

SUPPLY = ['VPWR', 'VGND']
PARTS = {
    'soc_bias': ('SOC_BIAS', 'SoC · 바이어스·공통모드 기준', ['BIAS', 'VCM', *SUPPLY]),
    'soc_cascode_mirror': ('SOC_CASCODE', 'SoC · 4-MOS 캐스코드 전류 미러', ['REF', 'OUT', 'VGND']),
    'soc_miller_ota': ('SOC_OTA', 'SoC · 2단 Miller 보상 OTA', ['INP', 'INN', 'BIAS', 'OUT', *SUPPLY]),
    'soc_pga': ('SOC_PGA', 'SoC · ×2/×8 가변 이득 증폭기', ['VIN', 'GAIN', 'VCM', 'BIAS', 'OUT', *SUPPLY]),
    'soc_filter2': ('SOC_FILTER2', 'SoC · 버퍼형 2극 active RC 필터', ['VIN', 'BIAS', 'OUT', *SUPPLY]),
    'soc_tia': ('SOC_TIA', 'SoC · 보상형 전류 입력 증폭기', ['IIN', 'VCM', 'BIAS', 'OUT', *SUPPLY]),
    'soc_sensor_afe': ('SOC_SENSOR_AFE', 'SoC · 센서 AFE·클록 동기 판정', ['VIN', 'GAIN', 'CLK', 'RESET', 'OUT', 'DATA', 'VCM', 'BIAS', *SUPPLY]),
}
DEFAULTS = dict(compensation_F=5e-12, filter_Ohm=40000., filter_F=20e-12,
                feedback_Ohm=100000., feedback_F=1e-12, reference_current_A=10e-6)
CATALOG = {key: dict(name=name, ports=ports, parameter_defaults=dict(DEFAULTS),
    analyses=['op', 'ac', 'tran'] if key not in ('soc_cascode_mirror', 'soc_sensor_afe') else
             ['dc', 'op'] if key == 'soc_cascode_mirror' else ['tran'],
    physical_status='optional-public-pcell-core', physical_supported=True,
    scope='1.8V SKY130 · 실제 MOS 계층 · 공개 poly/MIM 물리 변환 · 독립 DRC/LVS/PEX 필요',
    targets=['하위 회로 재사용', '실측 전달함수·전류', '기생 RC 후 동작'])
    for key, (_, name, ports) in PARTS.items()}
SETTINGS = {key: dict(analysis='dc' if key == 'soc_cascode_mirror' else
    'tran' if key in ('soc_pga', 'soc_tia', 'soc_sensor_afe', 'soc_bias') else 'ac',
    duration_s=200e-6, step_s=20e-9) for key in PARTS}
CATALOG['soc_bias']['analyses'] = ['op', 'tran']
CATALOG['soc_miller_ota']['analyses'] = ['op', 'ac']
for kind, keys in {
    'soc_bias': [], 'soc_cascode_mirror':['reference_current_A'],
    'soc_miller_ota':['compensation_F'], 'soc_pga':['compensation_F'],
    'soc_filter2':['compensation_F','filter_Ohm','filter_F'],
    'soc_tia':['compensation_F','feedback_Ohm','feedback_F'],
    'soc_sensor_afe':['compensation_F','filter_Ohm','filter_F'],
}.items(): CATALOG[kind]['parameter_defaults']={key:DEFAULTS[key] for key in keys}

def parameters(kind, values):
    raw=values;values={**DEFAULTS,**values}
    if not .2e-12 <= values['compensation_F'] <= 20e-12:
        raise EDAError('PARAMETER_RANGE', 'Miller compensation must be 0.2..20pF.')
    if not 1000 <= values['filter_Ohm'] <= 100000 or not 1e-12 <= values['filter_F'] <= 100e-12:
        raise EDAError('PARAMETER_RANGE', 'Filter R must be 1..100kohm and C 1..100pF.')
    if not 10000 <= values['feedback_Ohm'] <= 500000 or not .1e-12 <= values['feedback_F'] <= 20e-12:
        raise EDAError('PARAMETER_RANGE', 'TIA feedback must be 10..500kohm and 0.1..20pF.')
    if not 1e-6 <= values['reference_current_A'] <= 30e-6:
        raise EDAError('PARAMETER_RANGE', 'Cascode reference current must be 1..30uA; compliance must be measured.')
    return raw

def library(v):
    v={**DEFAULTS,**v}
    lib = D.make_library(1)
    lib['SOC_OTA_FIRST'] = C.ota(10.)
    ota = C.cell(PARTS['soc_miller_ota'][2])
    C.block(ota, 'FIRST', 'SOC_OTA_FIRST', lib['SOC_OTA_FIRST']['ports'], {'OUT': 'PRE'})
    C.mos(ota, 'P_SECOND', 'pmos', 'OUT', 'PRE', 'VPWR', 40, 1)
    C.mos(ota, 'N_SECOND', 'nmos', 'OUT', 'BIAS', 'VGND', 2, 1)
    C.passive(ota, 'C_MILLER', 'capacitor', 'PRE', 'COMP', v['compensation_F'])
    C.passive(ota, 'R_ZERO', 'resistor', 'COMP', 'OUT', 5000)
    lib['SOC_OTA'] = ota
    bias = C.cell(PARTS['soc_bias'][2])
    C.mos(bias, 'N_DIODE', 'nmos', 'BIAS', 'BIAS', 'VGND', 2, 1)
    for name, a, b, r in [('R_BIAS', 'VPWR', 'BIAS', 30000), ('R_VCM_TOP', 'VPWR', 'VCM_RAW', 100000), ('R_VCM_BOTTOM', 'VCM_RAW', 'VGND', 100000)]:
        C.passive(bias, name, 'resistor', a, b, r)
    C.passive(bias, 'C_VCM', 'capacitor', 'VCM_RAW', 'VGND', 20e-12)
    C.block(bias, 'VCM_BUFFER', 'SOC_OTA', ota['ports'], {'INP':'VCM_RAW', 'INN':'VCM', 'OUT':'VCM'})
    lib['SOC_BIAS'] = bias
    mirror = C.cell(PARTS['soc_cascode_mirror'][2])
    for name, d, g, s in [('N_REF', 'LOW_REF', 'LOW_REF', 'VGND'), ('N_REF_CAS', 'REF', 'REF', 'LOW_REF'), ('N_OUT', 'LOW_OUT', 'LOW_REF', 'VGND'), ('N_OUT_CAS', 'OUT', 'REF', 'LOW_OUT')]:
        C.mos(mirror, name, 'nmos', d, g, s, 2, 1)
    lib['SOC_CASCODE'] = mirror
    pga = C.cell(PARTS['soc_pga'][2])
    C.block(pga, 'AMP', 'SOC_OTA', ota['ports'], {'INP': 'VIN', 'INN': 'FB'})
    C.passive(pga, 'R_GROUND', 'resistor', 'FB', 'VCM', 10000)
    C.passive(pga, 'R_HIGH', 'resistor', 'OUT', 'FB', 70000)
    C.passive(pga, 'R_LOW', 'resistor', 'LOW', 'FB', 70000/6)
    C.block(pga, 'GAIN_INVERTER', 'INV', lib['INV']['ports'], {'A': 'GAIN', 'Y': 'GAINB'})
    C.mos(pga, 'N_GAIN', 'nmos', 'OUT', 'GAINB', 'LOW', 20, .15)
    C.mos(pga, 'P_GAIN', 'pmos', 'OUT', 'GAIN', 'LOW', 20, .15)
    lib['SOC_PGA'] = pga
    filt = C.cell(PARTS['soc_filter2'][2])
    for i in range(2):
        a, b = ('VIN', 'MID') if i == 0 else ('MID', 'OUT')
        n = f'FILTER{i}'
        C.passive(filt, f'R_POLE{i}', 'resistor', a, n, v['filter_Ohm'])
        C.passive(filt, f'C_POLE{i}', 'capacitor', n, 'VGND', v['filter_F'])
        C.block(filt, f'BUFFER{i}', 'SOC_OTA', ota['ports'], {'INP': n, 'INN': b, 'OUT': b})
    lib['SOC_FILTER2'] = filt
    tia = C.cell(PARTS['soc_tia'][2])
    C.block(tia, 'AMP', 'SOC_OTA', ota['ports'], {'INP': 'VCM', 'INN': 'IIN'})
    C.passive(tia, 'R_FEEDBACK', 'resistor', 'OUT', 'IIN', v['feedback_Ohm'])
    C.passive(tia, 'C_FEEDBACK', 'capacitor', 'OUT', 'IIN', v['feedback_F'])
    lib['SOC_TIA'] = tia
    cmp = C.schematic('chip_comparator', {'input_width_um': 10})
    lib.update(cmp.pop('cells'))
    lib['SOC_COMPARATOR'] = cmp
    afe = C.cell(PARTS['soc_sensor_afe'][2])
    for name, child, mapping in [('BIAS_SOURCE', 'SOC_BIAS', {}),
        ('PGA', 'SOC_PGA', {'OUT': 'AMPLIFIED'}),
        ('FILTER', 'SOC_FILTER2', {'VIN': 'AMPLIFIED'}),
        ('COMPARATOR', 'SOC_COMPARATOR', {'INP': 'OUT', 'INN': 'VCM', 'OUT': 'CMP'}),
        ('RESET_MUX', 'MUX2', {'A': 'CMP', 'B': 'VGND', 'S': 'RESET', 'Y': 'D'}),
        ('SAMPLE', 'DFF', {'D': 'D', 'Q': 'DATA'})]:
        C.block(afe, name, child, lib[child]['ports'], mapping)
    lib['SOC_SENSOR_AFE'] = afe
    return lib

def schematic(kind, values):
    lib = library(values)
    ir = copy.deepcopy(lib[PARTS[kind][0]])
    cells = {}
    def visit(node):
        for d in node['devices']:
            if d['kind'] == 'block' and d['cell_name'] not in cells:
                cells[d['cell_name']] = copy.deepcopy(lib[d['cell_name']])
                visit(cells[d['cell_name']])
    visit(ir)
    ir['cells'] = cells
    return ir

def spice_tb(p, folder, settings, netlist, model_deck, sub):
    kind = p['design_template']['id']; v = {**DEFAULTS,**p['design_template']['parameters']}
    s = settings['supply_V']; analysis = settings['analysis']
    if not 1.6 <= s <= 1.8:
        raise EDAError('STIMULUS_RANGE', 'Analog references require 1.6..1.8V; external VCM is VDD/2.')
    rows = ['Resistor analog SoC '+kind, f'.include "{model_deck}"', '.options method=gear maxord=2',
            f'.include "{netlist}"', f'.temp {settings["temperature_C"]}', 'VGND VGND 0 0', f'VDD VPWR VGND {s:.12g}']
    names, vectors, units = [], [], []
    def probe(name, vector=None, unit='V'):
        names.append(name); vectors.append(vector or f'v({name})'); units.append(unit)
    probe('OUT' if kind != 'soc_bias' else 'VCM')
    probe('supply_current', '-i(VDD)', 'A')
    if kind not in ('soc_bias', 'soc_cascode_mirror', 'soc_sensor_afe'):
        rows.append('VBIAS BIAS VGND 0.9')
    if kind in ('soc_pga', 'soc_tia'):
        rows.append(f'VCM VCM VGND {s/2:.12g}')
    if kind == 'soc_cascode_mirror':
        rows.extend([f'IREF VPWR REF {v["reference_current_A"]:.12g}', f'VOUT OUT VGND {s:.12g}'])
        probe('REF'); probe('output_current', '-i(VOUT)', 'A')
    elif kind == 'soc_miller_ota':
        # DC feedback biases the OTA; C isolates INN at AC. These are external
        # measurement fixtures, not hidden components in the device under test.
        rows.extend([f'VINP INP VGND DC {s/2:.12g} AC 1', 'RSERVO OUT INN 1G', 'CSERVO INN VGND 1'])
        probe('INP'); probe('INN'); rows.append('CLOAD OUT VGND 1p')
    elif kind in ('soc_pga', 'soc_filter2', 'soc_sensor_afe'):
        rows.append(f'VIN VIN VGND DC {s/2:.12g} AC 1 SIN({s/2:.12g} 0.025 5000)')
        probe('VIN')
        if kind != 'soc_filter2':
            rows.append(f'VGAIN GAIN VGND PULSE(0 {s:.12g} 100u 2n 2n 1 2)'); probe('GAIN')
        if kind == 'soc_sensor_afe':
            rows.extend([f'VCLK CLK VGND PULSE(0 {s:.12g} 250n 2n 2n 498n 1u)', f'VRESET RESET VGND PWL(0 {s:.12g} 5u {s:.12g} 5.002u 0)'])
            for n in ['CLK', 'RESET', 'DATA', 'VCM', 'BIAS']: probe(n)
        rows.append('CLOAD OUT VGND 50f')
    elif kind == 'soc_tia':
        rows.extend(['VSENSOR IIN SENSOR 0', 'ISENSOR SENSOR VGND DC 0 AC 1 SIN(0 1u 5000)'])
        probe('input_current', 'i(VSENSOR)', 'A'); probe('IIN'); rows.append('CLOAD OUT VGND 50f')
    elif kind == 'soc_bias':
        probe('BIAS')
    rows.extend(['XU '+' '.join(sub or p['ports'])+' '+p['cell'], '.control', 'set num_threads=1',
                 'set numdgt=17', 'set wr_singlescale', 'set wr_vecnames', 'set noaskquit'])
    if analysis == 'ac':
        rows.append('ac dec 60 10 1e9')
        names, vectors, units = ['OUT_gain', 'OUT_phase'], ['mag(v(OUT))', '180/pi*ph(v(OUT))'], ['V/A' if kind == 'soc_tia' else 'V/V', 'deg']
        xunit, xlabel = 'Hz', 'frequency'
    elif analysis == 'dc':
        rows.append(f'dc VOUT 0 {s:.12g} 0.01'); xunit, xlabel = 'V', 'output compliance'
    elif analysis == 'op':
        rows.extend(['op', 'let mos_sample_index=0', 'setscale mos_sample_index']); xunit, xlabel = 'point', 'operating point'
    elif analysis == 'tran':
        rows.append(f'tran {settings["step_s"]:.12g} {settings["duration_s"]:.12g}'); xunit, xlabel = 's', 'time'
    else: raise EDAError('UNSUPPORTED_ANALYSIS', 'No owned analog testbench for this analysis.')
    rows.extend([f'let mos_wave_{i} = {vec}' for i, vec in enumerate(vectors)])
    rows.extend(['wrdata waveform.dat '+' '.join(f'mos_wave_{i}' for i in range(len(vectors))), 'write waveform.raw all', 'quit', '.endc', '.end'])
    dest = Path(folder)/'testbench.spice'; dest.write_text('\n'.join(rows)+'\n')
    return dest, names, units, xunit, xlabel

def sample(w, t):
    import bisect
    i = bisect.bisect_left(w['x'], t)
    if i == len(w['x']) or t < w['x'][0]: raise EDAError('INCOMPLETE_WAVEFORM', 'Requested measurement window is not covered.')
    if not i or w['x'][i] == t: return w['y'][i]
    a, b = w['x'][i-1:i+1]; u, v = w['y'][i-1:i+1]
    return u+(v-u)*(t-a)/(b-a)

def window(w, a, b):
    from signal_metrics import validate_wave
    validate_wave(w)
    if b <= a: raise EDAError('INVALID_WINDOW', 'Window must have positive duration.')
    pairs = [(a, sample(w,a)), *[(x,y) for x,y in zip(w['x'],w['y']) if a<x<b], (b,sample(w,b))]
    mean = sum((q[0]-p[0])*(q[1]+p[1])/2 for p,q in zip(pairs,pairs[1:]))/(b-a)
    return mean, pairs

def sine_amplitude(w, a, b, frequency=5000):
    # Resample onto a uniform grid: adaptive simulator step density must not
    # bias a transfer amplitude. Least squares also handles partial cycles.
    import numpy as np
    window(w,a,b)
    times = np.linspace(a,b,2049)
    values = np.interp(times, w['x'], w['y'])
    theta = 2*math.pi*frequency*times
    coeff = np.linalg.lstsq(np.column_stack([np.ones(len(times)),np.sin(theta),np.cos(theta)]), values, rcond=None)[0]
    fit = coeff[0]+coeff[1]*np.sin(theta)+coeff[2]*np.cos(theta)
    return dict(amplitude=math.hypot(coeff[1],coeff[2]), mean=float(coeff[0]), residual_rms=float(np.sqrt(np.mean((values-fit)**2))))

def measurements(p, run, settings):
    kind=p['design_template']['id']; v={**DEFAULTS,**p['design_template']['parameters']}; s=settings['supply_V']
    waves={w['name']:w for w in run['waveforms']}; m=run['measurements']; checks=[]
    def check(name, passed, observed): checks.append(dict(name=name, pass_=bool(passed), observed=observed))
    m['reference_scope']='Actual SKY130 analog macro; nominal directed criteria only; no noise/mismatch/ESD/EM/IR/foundry signoff.'
    if settings['analysis']=='ac':
        g=waves['OUT_gain']; phase=waves['OUT_phase']; low=g['y'][0]
        m['low_frequency_gain']=low; m['gain_unit']=g['unit']; m['bandwidth_3dB_Hz']=None
        for i in range(1,len(g['x'])):
            target=low/math.sqrt(2);a,b=g['y'][i-1:i+1]
            if b<=target<=a and a!=b:
                m['bandwidth_3dB_Hz']=math.exp(math.log(g['x'][i-1])+(target-a)/(b-a)*math.log(g['x'][i]/g['x'][i-1])); break
        if kind=='soc_miller_ota':
            import numpy as np
            unwrapped=np.unwrap(np.radians(phase['y']))*180/math.pi
            m['open_loop_gain_dB']=20*math.log10(low)
            for i in range(1,len(g['x'])):
                if g['y'][i]<=1<g['y'][i-1]:
                    fraction=(math.log(g['y'][i-1]))/(math.log(g['y'][i-1])-math.log(g['y'][i]))
                    m['unity_gain_Hz']=math.exp(math.log(g['x'][i-1])+fraction*math.log(g['x'][i]/g['x'][i-1]))
                    m['phase_margin_deg']=180+unwrapped[i-1]+fraction*(unwrapped[i]-unwrapped[i-1]); break
            check('open-loop gain >40dB',low>100,low)
            check('unity-loop phase margin 45..180deg',45<m.get('phase_margin_deg',-1)<=180,m.get('phase_margin_deg'))
        else:
            target=2 if kind=='soc_pga' else v['feedback_Ohm'] if kind=='soc_tia' else 1
            check('low-frequency transfer within 5%',abs(low/target-1)<.05,low)
            check('measured finite bandwidth',m['bandwidth_3dB_Hz'] is not None,m['bandwidth_3dB_Hz'])
    elif settings['analysis']=='dc':
        w=waves['output_current']; target=v['reference_current_A']
        good=[x for x,y in zip(w['x'],w['y']) if abs(y/target-1)<.05]
        m['compliance_min_V']=min(good) if good else None
        tail=[y for x,y in zip(w['x'],w['y']) if x>=1.5]
        m['compliant_current_mean_A']=sum(tail)/len(tail) if tail else None
        check('1.5V..VDD current error <5%',bool(tail) and all(abs(y/target-1)<.05 for y in tail),m['compliant_current_mean_A'])
    elif settings['analysis']=='tran':
        end=waves[next(iter(waves))]['x'][-1]
        if 'supply_current' in waves:
            m['average_supply_current_A']=window(waves['supply_current'],end*.75,end)[0]
            m['average_supply_power_W']=m['average_supply_current_A']*s
        if kind=='soc_bias':
            vc=window(waves['VCM'],end*.75,end)[0]; bias=window(waves['BIAS'],end*.75,end)[0]
            m.update(common_mode_V=vc,bias_V=bias)
            check('VCM within 1% of VDD/2',abs(vc-s/2)<s*.005,vc); check('NMOS bias within 0.5..1.1V',.5<bias<1.1,bias)
        elif kind in ('soc_pga','soc_sensor_afe','soc_tia','soc_filter2'):
            for label,a,b,target in [('low',20e-6,90e-6,2),('high',120e-6,195e-6,8)] if kind in ('soc_pga','soc_sensor_afe') else [('transfer',20e-6,195e-6,v['feedback_Ohm'] if kind=='soc_tia' else 1)]:
                out=sine_amplitude(waves['OUT'],a,b); inp=sine_amplitude(waves['input_current' if kind=='soc_tia' else 'VIN'],a,b)
                ratio=out['amplitude']/inp['amplitude'] if inp['amplitude']>0 else None
                m[label+'_gain']=ratio; m[label+'_output_fit']=out
                check(label+' measured gain within 8%',ratio is not None and abs(ratio/target-1)<.08,ratio)
                check(label+' settled sine residual <5mV',out['residual_rms']<.005,out['residual_rms'])
            if kind=='soc_sensor_afe':
                rows=[]
                for edge in C.crossings(waves['CLK'],s/2,20e-6):
                    if edge+.2e-6>end: continue
                    diff=sample(waves['OUT'],edge)-sample(waves['VCM'],edge)
                    if abs(diff)<.025: continue
                    data=sample(waves['DATA'],edge+.2e-6); want=diff>0
                    rows.append(dict(time_s=edge,input_difference_V=diff,output_V=data,expected=int(want),passed=data>s*.7 if want else data<s*.3))
                m['sampled_interface_cases']=len(rows); m['sampled_interface_failures']=sum(not r['passed'] for r in rows);m['sampled_interface_rows']=rows
                check('clocked interface: >=50 unambiguous samples all match',len(rows)>=50 and all(r['passed'] for r in rows),m['sampled_interface_failures'])
    normalized=[{'name':c['name'],'pass':c['pass_'],'observed':c['observed']} for c in checks]
    result=dict(schema_version=1,kind=kind,source='actual-ngspice-samples',checks=normalized,scope=m['reference_scope'])
    result['pass']=all(c['pass'] for c in normalized) if normalized else None
    run['reference_verification']=result
    if normalized: run['analysis_result']='pass' if result['pass'] else 'fail'
    return result
