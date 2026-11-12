"""Editable 1.8-V sensor interface references with actual SKY130 MOS.

R/C are ideal, sources are external test fixtures, and reported results come
only from ngspice samples. No layout, noise, mismatch or signoff is implied.
"""
import copy
import math
from pathlib import Path
import analog_soc as A
import chip_references as C
import native
import signal_metrics as M
from geometry import EDAError

COMMON = ['VCM', 'BIAS', 'VPWR', 'VGND']
BASE = dict(compensation_F=5e-12, nulling_Ohm=5000., bias_resistance_Ohm=30000.)
LIMITS = ['Actual SKY130 MOS schematic reference; ideal R/C and external stimuli.',
          'No physical layout, DRC/LVS/PEX or manufacturing signoff.',
          'No stochastic noise, mismatch, ESD, lifetime or production qualification.',
          'A current source plus input capacitor approximates the sensor; no photodiode junction model.',
          'PVT varies supported MOS corners and supply/temperature; ideal R/C do not gain process variation.']
CATALOG = {
    'sensor_current_tia': dict(name='센서 전류 입력 · 자체 바이어스 TIA',
        ports=['IIN', 'OUT', *COMMON], analyses=['op', 'ac', 'tran'],
        parameter_defaults={**BASE, 'feedback_Ohm':200000., 'feedback_F':2e-12,
                            'input_F':5e-12, 'input_current_A':1e-6},
        targets=['200 kV/A 전류-전압 변환', '영입력 오프셋 ≤25mV', '정착 후 이득 오차 ≤5%']),
    'adc_track_hold': dict(name='ADC 입력 · 전송 게이트 Track/Hold',
        ports=['VIN', 'CLK', 'HOLD', 'OUT', *COMMON], analyses=['op', 'tran'],
        parameter_defaults={**BASE, 'hold_F':10e-12, 'switch_width_um':10.,
                            'leakage_Ohm':1e9, 'input_amplitude_V':.1},
        targets=['10kHz 샘플 클록', '획득·홀드 오차 ≤5mV', '스위칭 순간 오차·홀드 드루프 측정']),
    'sensor_schmitt': dict(name='센서 입력 · 히스테리시스 비교기',
        ports=['VIN', 'SUM', 'OUT', *COMMON], analyses=['op', 'tran'],
        parameter_defaults={**BASE, 'input_Ohm':100000., 'hysteresis_Ohm':1000000.},
        targets=['상승·하강 임계값 분리', '양의 히스테리시스 폭', '각 램프에서 한 번만 전환']),
}
for spec in CATALOG.values():
    spec.update(physical_supported=False, physical_status='not-generated', category='실용 아날로그 블록',
                scope='1.6–1.8V SKY130 · 실제 MOS 계층 · 이상적 R/C · 제작 전용 레이아웃 미생성')


def parameters(kind, values):
    if kind not in CATALOG or not isinstance(values, dict) or set(values)-set(CATALOG[kind]['parameter_defaults']):
        raise EDAError('UNSUPPORTED_PARAMETER', 'Unknown practical analog template or parameter.')
    v={**CATALOG[kind]['parameter_defaults'], **values}
    ranges=dict(compensation_F=(2e-12,10e-12), nulling_Ohm=(1000.,20000.), bias_resistance_Ohm=(20000.,80000.),
                feedback_Ohm=(100000.,300000.), feedback_F=(.5e-12,10e-12), input_F=(1e-12,20e-12),
                input_current_A=(.1e-6,1e-6), hold_F=(5e-12,50e-12), switch_width_um=(2.,20.),
                leakage_Ohm=(1e8,1e10), input_amplitude_V=(.05,.15), input_Ohm=(50000.,200000.),
                hysteresis_Ohm=(500000.,2000000.))
    for key, value in v.items():
        v[key]=native.num(value); lo,hi=ranges[key]
        if not lo <= v[key] <= hi: raise EDAError('PARAMETER_RANGE', f'{key} must be {lo}..{hi} in SI units.')
    if kind=='sensor_schmitt' and not .05 <= v['input_Ohm']/v['hysteresis_Ohm'] <= .2:
        raise EDAError('PARAMETER_RANGE', 'Positive feedback resistance ratio must be 0.05..0.2.')
    return v


def settings(kind):
    if kind not in CATALOG: raise EDAError('UNSUPPORTED_TEMPLATE', 'Unknown practical analog template.')
    return dict(analysis='tran', duration_s=320e-6, step_s=50e-9, load_F=100e-15)


def schematic(kind, values):
    v=parameters(kind, values); lib=A.library(v)
    next(d for d in lib['SOC_BIAS']['devices'] if d['name']=='R_BIAS')['parameters']['value']=v['bias_resistance_Ohm']
    top=C.cell(CATALOG[kind]['ports'])
    C.block(top, 'SELF_BIAS', 'SOC_BIAS', lib['SOC_BIAS']['ports'], {})
    if kind=='sensor_current_tia':
        core=C.cell(['IIN','OUT',*COMMON])
        C.block(core,'CURRENT_AMPLIFIER','SOC_OTA',lib['SOC_OTA']['ports'],{'INP':'VCM','INN':'IIN'})
        C.passive(core,'FEEDBACK_RESISTANCE','resistor','OUT','IIN',v['feedback_Ohm'])
        C.passive(core,'FEEDBACK_COMPENSATION','capacitor','OUT','IIN',v['feedback_F'])
        C.passive(core,'SENSOR_INPUT_CAPACITANCE','capacitor','IIN','VGND',v['input_F'])
        lib['PRACTICAL_TIA']=core
        C.block(top,'SENSOR_CURRENT_FRONTEND','PRACTICAL_TIA',core['ports'],{})
    elif kind=='adc_track_hold':
        switch=C.cell(['VIN','CLK','HOLD','VCM','VPWR','VGND'])
        C.block(switch,'CLOCK_COMPLEMENT','INV',lib['INV']['ports'],{'A':'CLK','Y':'CLKB'})
        C.mos(switch,'TRACK_N','nmos','VIN','CLK','HOLD',v['switch_width_um'],.15)
        C.mos(switch,'TRACK_P','pmos','VIN','CLKB','HOLD',2*v['switch_width_um'],.15)
        C.passive(switch,'HOLD_CAPACITOR','capacitor','HOLD','VGND',v['hold_F'])
        C.passive(switch,'EXPLICIT_HOLD_LEAKAGE','resistor','HOLD','VCM',v['leakage_Ohm'])
        lib['PRACTICAL_SAMPLE_SWITCH']=switch
        C.block(top,'TRACK_AND_STORAGE','PRACTICAL_SAMPLE_SWITCH',switch['ports'],{})
        C.block(top,'HOLD_READOUT_BUFFER','SOC_OTA',lib['SOC_OTA']['ports'],{'INP':'HOLD','INN':'OUT'})
    else:
        feedback=C.cell(['VIN','SUM','OUT'])
        C.passive(feedback,'INPUT_RESISTANCE','resistor','VIN','SUM',v['input_Ohm'])
        C.passive(feedback,'POSITIVE_FEEDBACK','resistor','OUT','SUM',v['hysteresis_Ohm'])
        lib['PRACTICAL_HYSTERESIS']=feedback
        C.block(top,'HYSTERESIS_NETWORK','PRACTICAL_HYSTERESIS',feedback['ports'],{})
        C.block(top,'MOS_COMPARATOR','SOC_COMPARATOR',lib['SOC_COMPARATOR']['ports'],{'INP':'SUM','INN':'VCM'})
    cells={}
    def visit(ir):
        for device in ir['devices']:
            if device['kind']=='block' and device['cell_name'] not in cells:
                name=device['cell_name']; cells[name]=copy.deepcopy(lib[name]); visit(cells[name])
    visit(top); top['cells']=cells
    return top


def spice_tb(p, folder, s, netlist, model_deck, sub):
    kind=p['design_template']['id']; v=parameters(kind,p['design_template']['parameters']); supply=s['supply_V']; analysis=s['analysis']
    if not 1.6<=supply<=1.8: raise EDAError('STIMULUS_RANGE','Practical analog references require 1.6..1.8V.')
    if analysis not in CATALOG[kind]['analyses']: raise EDAError('UNSUPPORTED_ANALYSIS','This block has no valid owned testbench for that analysis.')
    if analysis=='tran' and (s['duration_s']<320e-6 or s['step_s']>100e-9):
        raise EDAError('STIMULUS_RANGE','Directed transient needs at least 320us and a maximum step of 100ns.')
    rows=['Resistor practical analog '+kind,f'.include "{Path(model_deck).as_posix()}"',
          f'.include "{Path(netlist).as_posix()}"','.options scale=1e-6 method=gear maxord=2',
          f'.temp {s["temperature_C"]}', 'VGND VGND 0 0',f'VDD VPWR VGND {supply:.12g}',
          f'CLOAD OUT VGND {s["load_F"]:.12g}',f'.nodeset v(VCM)={supply/2:.12g}']
    names=['OUT','VCM','BIAS','supply_current']; vectors=['v(OUT)','v(VCM)','v(BIAS)','-i(VDD)']; units=['V','V','V','A']
    if kind=='sensor_current_tia':
        current=v['input_current_A']
        rows += ['VSENSOR SENSOR IIN 0',f'ISENSOR VGND SENSOR DC 0 AC 1 PWL(0 0 50u 0 50.1u {current:.12g} 150u {current:.12g} 150.1u {current/2:.12g} 250u {current/2:.12g} 250.1u 0)']
        names += ['IIN','input_current']; vectors += ['v(IIN)','i(VSENSOR)']; units += ['V','A']
    elif kind=='adc_track_hold':
        lo,hi=supply/2-v['input_amplitude_V'],supply/2+v['input_amplitude_V']
        rows += [f'VIN VIN VGND DC {lo:.12g} PWL(0 {lo:.12g} 85u {lo:.12g} 85.1u {hi:.12g} 185u {hi:.12g} 185.1u {lo:.12g})',
                 f'VCLK CLK VGND DC {supply:.12g} PULSE(0 {supply:.12g} 30u 10n 10n 40u 100u)',
                 f'.nodeset v(HOLD)={lo:.12g} v(OUT)={lo:.12g}']
        names += ['VIN','CLK','HOLD']; vectors += ['v(VIN)','v(CLK)','v(HOLD)']; units += ['V']*3
    else:
        lo,hi=supply/2-.35,supply/2+.35
        rows += [f'VIN VIN VGND DC {lo:.12g} PWL(0 {lo:.12g} 40u {lo:.12g} 140u {hi:.12g} 180u {hi:.12g} 280u {lo:.12g} 320u {lo:.12g})']
        names += ['VIN','SUM']; vectors += ['v(VIN)','v(SUM)']; units += ['V','V']
    rows += ['XU '+' '.join(sub)+' '+p['cell'],'.control','set num_threads=1','set numdgt=17','set noaskquit','set wr_singlescale','set wr_vecnames']
    if analysis=='ac':
        rows += ['ac dec 80 10 1e8']
        names=['transimpedance_magnitude','transimpedance_real','transimpedance_phase']
        vectors=['mag(v(OUT))','real(v(OUT))','180/pi*ph(v(OUT))']; units=['V/A','V/A','deg']; xunit,xlabel='Hz','frequency'
    elif analysis=='op':
        rows += ['op','let mos_sample_index=0','setscale mos_sample_index']; xunit,xlabel='point','operating point'
    else:
        rows += [f'tran {s["step_s"]:.12g} {s["duration_s"]:.12g} 0 {s["step_s"]:.12g}']; xunit,xlabel='s','time'
    rows += [f'let mos_wave_{i} = {vector}' for i,vector in enumerate(vectors)]
    rows += ['wrdata waveform.dat '+' '.join(f'mos_wave_{i}' for i in range(len(vectors))),'write waveform.raw all','quit','.endc','.end']
    dest=Path(folder)/'testbench.spice'; dest.write_text('\n'.join(rows)+'\n')
    return dest,names,units,xunit,xlabel


def strict_wave(wave):
    M.validate_wave(wave)
    if any(a>=b for a,b in zip(wave['x'],wave['x'][1:])):
        raise EDAError('INVALID_WAVEFORM','Measurement axes must be strictly increasing.')


def interval(wave, a, b):
    strict_wave(wave); points=M.window(wave,a,b)
    if len(points)<2: raise EDAError('INCOMPLETE_WAVEFORM','Actual waveform does not cover the entire measurement interval.')
    return points


def mean(wave, a, b):
    points=interval(wave,a,b)
    return math.fsum((t1-t0)*(y0+y1)/2 for (t0,y0),(t1,y1) in zip(points,points[1:]))/(b-a)


def difference(a,b):
    strict_wave(a); strict_wave(b)
    if a['x']!=b['x']: raise EDAError('INVALID_WAVEFORM','Voltage/current samples need aligned axes.')
    return dict(x=list(a['x']),y=[x-y for x,y in zip(a['y'],b['y'])])


def crossings(output, input_wave, threshold, start, end, rising):
    strict_wave(input_wave)
    points=interval(output,start,end); result=[]
    for (t0,y0),(t1,y1) in zip(points,points[1:]):
        crossed=(y0<threshold<=y1) if rising else (y0>threshold>=y1)
        if crossed:
            t=t0+(t1-t0)*(threshold-y0)/(y1-y0); value=M.value_at(input_wave,t)
            if value is None: raise EDAError('INCOMPLETE_WAVEFORM','Input does not cover the output crossing.')
            result.append(dict(time_s=t,input_V=value))
    return result


def measurements(p, run, s):
    kind=p['design_template']['id']; v=parameters(kind,p['design_template']['parameters']); analysis=s['analysis']; supply=s['supply_V']
    waves={wave['name']:wave for wave in run['waveforms']}; result=run.setdefault('measurements',{}); checks=[]
    def check(name, passed, observed): checks.append(dict(name=name,**{'pass':bool(passed)},observed=observed))
    def required(name):
        if name not in waves: raise EDAError('INCOMPLETE_WAVEFORM','Required actual trace missing: '+name)
        strict_wave(waves[name]); return waves[name]
    result.update(metric_source='actual-ngspice-samples',reference_scope='Directed practical analog schematic criteria.',
                  testbench_output_load_F=s.get('load_F',settings(kind)['load_F']),unverified=list(LIMITS))
    if analysis=='ac':
        gain=required('transimpedance_magnitude'); real=required('transimpedance_real')
        if gain['x'][0]>10 or gain['x'][-1]<1e7: raise EDAError('INCOMPLETE_WAVEFORM','TIA AC evidence needs 10Hz..10MHz coverage.')
        low=gain['y'][0]; error=abs(low/v['feedback_Ohm']-1); result.update(low_frequency_transimpedance_V_per_A=real['y'][0],gain_error_ratio=error)
        check('Low-frequency transimpedance magnitude within 5%',error<=.05,low)
        check('Injected positive sensor current produces negative voltage gain',real['y'][0]<0,real['y'][0])
    elif analysis=='op':
        out=required('OUT')['y'][0]; vcm=required('VCM')['y'][0]; current=required('supply_current')['y'][0]
        result.update(supply_current_A=current,supply_power_W=current*supply)
        check('Self-biased common mode within 25mV of VDD/2',abs(vcm-supply/2)<=.025,vcm)
        if kind=='sensor_current_tia':
            result['zero_input_offset_V']=out-vcm; check('Zero-current offset at most 25mV',abs(out-vcm)<=.025,out-vcm)
        elif kind=='adc_track_hold':
            error=out-required('VIN')['y'][0]; result['tracking_offset_V']=error; check('Static tracking error at most 5mV',abs(error)<=.005,error)
        else: check('Low input has low digital output',-.05<=out<=.2*supply,out)
    elif analysis=='tran':
        out=required('OUT'); vcm=required('VCM'); current=required('supply_current')
        interval(out,0,320e-6); interval(current,0,320e-6)
        check('Output remains within supply rails',all(-.05<=value<=supply+.05 for value in out['y']),[min(out['y']),max(out['y'])])
        result['supply']=M.supply_metrics(current,20e-6,320e-6,supply)
        if kind=='sensor_current_tia':
            input_current=required('input_current'); centered=difference(out,vcm)
            offset=mean(centered,25e-6,45e-6); di=mean(input_current,110e-6,140e-6)-mean(input_current,25e-6,45e-6)
            check('Actual sensor current step covers the requested stimulus',.99*v['input_current_A']<=di<=1.01*v['input_current_A'],di)
            gain=(mean(centered,110e-6,140e-6)-offset)/di if di>0 else None
            error=abs(gain/(-v['feedback_Ohm'])-1) if gain is not None else None
            result.update(zero_input_offset_V=offset,transimpedance_V_per_A=gain,gain_error_ratio=error)
            check('Zero-current offset at most 25mV',abs(offset)<=.025,offset)
            check('Settled signed transimpedance within 5%',error is not None and error<=.05,gain)
            returned=mean(centered,290e-6,315e-6); result['zero_return_error_V']=returned-offset
            check('Returns to baseline within 5mV',abs(returned-offset)<=.005,returned-offset)
        elif kind=='adc_track_hold':
            vin=required('VIN'); hold=required('HOLD'); clk=required('CLK'); cycles=[]
            for i in range(3):
                t=i*100e-6; expected=mean(vin,t+60e-6,t+68e-6)
                acquire=max(abs(value-expected) for _,value in interval(out,t+60e-6,t+68e-6))
                stored=interval(hold,t+90e-6,t+118e-6); observed=interval(out,t+90e-6,t+118e-6)
                error=max(abs(value-expected) for _,value in observed)
                droop=stored[-1][1]-stored[0][1]
                before=M.value_at(hold,t+69.99e-6); after=M.value_at(hold,t+70.05e-6)
                if before is None or after is None: raise EDAError('INCOMPLETE_WAVEFORM','Missing storage samples around the falling clock edge.')
                entry=dict(cycle=i+1,expected_V=expected,acquisition_error_V=acquire,hold_error_V=error,hold_droop_V=droop,
                           switching_step_V=after-before,switching_step_scope='HOLD 69.99us to 70.05us within each 100us cycle; combined charge injection/feedthrough, not separated components')
                cycles.append(entry)
                if i<2:
                    changed=abs(mean(vin,t+90e-6,t+118e-6)-expected)
                    check(f'Cycle {i+1} input changes while storage holds',changed>=1.9*v['input_amplitude_V'],changed)
                check(f'Cycle {i+1} tracking control high',min(value for _,value in interval(clk,t+60e-6,t+68e-6))>=.8*supply,mean(clk,t+60e-6,t+68e-6))
                check(f'Cycle {i+1} hold control low',max(value for _,value in interval(clk,t+90e-6,t+118e-6))<=.2*supply,mean(clk,t+90e-6,t+118e-6))
                check(f'Cycle {i+1} acquisition error at most 5mV',acquire<=.005,acquire)
                check(f'Cycle {i+1} hold error at most 5mV',error<=.005,error)
            result['sample_hold_cycles']=cycles
        else:
            vin=required('VIN'); rising=crossings(out,vin,supply/2,40e-6,140e-6,True); falling=crossings(out,vin,supply/2,180e-6,280e-6,False)
            up=interval(vin,40e-6,140e-6); down=interval(vin,180e-6,280e-6)
            check('Actual rising and falling input ramps are monotonic',all(a[1]<=b[1] for a,b in zip(up,up[1:])) and all(a[1]>=b[1] for a,b in zip(down,down[1:])) and up[-1][1]-up[0][1]>.6 and down[0][1]-down[-1][1]>.6,[up[0][1],up[-1][1],down[0][1],down[-1][1]])
            all_up=crossings(out,vin,supply/2,40e-6,140e-6,False); all_down=crossings(out,vin,supply/2,180e-6,280e-6,True)
            check('Exactly one rising switch on the rising input ramp',len(rising)==1 and not all_up,rising)
            check('Exactly one falling switch on the falling input ramp',len(falling)==1 and not all_down,falling)
            width=rising[0]['input_V']-falling[0]['input_V'] if len(rising)==len(falling)==1 else None
            result.update(rising_threshold_V=rising[0]['input_V'] if len(rising)==1 else None,falling_threshold_V=falling[0]['input_V'] if len(falling)==1 else None,hysteresis_V=width)
            check('Measured hysteresis is positive',width is not None and width>0,width)
            check('High and low output plateaus are valid',min(value for _,value in interval(out,150e-6,170e-6))>=.8*supply and max(value for _,value in interval(out,290e-6,315e-6))<=.2*supply,[mean(out,150e-6,170e-6),mean(out,290e-6,315e-6)])
    else: raise EDAError('UNSUPPORTED_ANALYSIS','No practical analog criteria for that analysis.')
    verdict=dict(schema_version=1,kind=kind,source='actual-ngspice-samples',scope=result['reference_scope'],checks=checks)
    verdict['pass']=all(item['pass'] for item in checks) if checks else None
    run['reference_verification']=verdict
    if checks: run['analysis_result']='pass' if verdict['pass'] else 'fail'
