"""Integrated linear IVR: actual MOS feedback; external reference/stimuli.

Ideal passives and an area envelope are not fabricated layout or signoff.
"""
import math
from pathlib import Path
import chip_references as C
import native
from geometry import EDAError
from signal_metrics import validate_wave, window, variable_supply_metrics

ID='soc_ivr_ldo'
PORTS=['VREF','EN','OUT','FB','GATE','BIAS','VPWR','VGND']
DEFAULTS=dict(reference_V=.6,output_V=1.2,pass_units=8,pass_width_um=20.,
    bias_resistance_Ohm=100000.,compensation_F=10e-12,nulling_Ohm=1000.,
    output_F=1e-9,output_esr_Ohm=.5,load_low_A=20e-6,load_high_A=200e-6)
LIMITS=['Integrated linear-regulator schematic prototype; not a switching buck IVR.',
    'External ideal VREF and supply/enable/load control; reference ramp supplies soft start.',
    'Ideal R/C; MOS corners do not vary feedback/compensation/decoupling passives.',
    'No return-ratio/phase-margin, noise, mismatch, current-limit, reverse-current or thermal protection qualification.',
    'No generated layout, physical capacitor area, PEX or foundry signoff.']
CATALOG={ID:dict(name='IVR · 1.8V → 1.2V 자체 바이어스 온칩 LDO',ports=PORTS,
    parameter_defaults=DEFAULTS,analyses=['op','ac','tran'],category='전원·온칩 IVR',
    physical_supported=False,physical_status='not-generated',
    scope='자체 MOS 바이어스·오차 증폭기·병렬 PMOS·EN/방전·이상적 출력 C. 외부 VREF, 회로도 수준.',
    targets=['기동/재시작','20→200µA 저항 부하','입력 전압 변화','실제 전류·전력','PSRR'])}

def parameters(values):
    if not isinstance(values,dict) or set(values)-set(DEFAULTS):raise EDAError('UNSUPPORTED_PARAMETER','Unknown IVR parameter object.')
    v={**DEFAULTS,**values}
    ranges={'reference_V':(.5,.65),'output_V':(.9,1.3),'pass_units':(1,32),
        'pass_width_um':(.42,20),'bias_resistance_Ohm':(10000,300000),
        'compensation_F':(5e-12,100e-12),'nulling_Ohm':(100,10000),
        'output_F':(100e-12,2e-9),'output_esr_Ohm':(.05,10),
        'load_low_A':(5e-6,200e-6),'load_high_A':(20e-6,1e-3)}
    for key,value in v.items():
        v[key]=native.num(value)
        if not ranges[key][0]<=v[key]<=ranges[key][1]:raise EDAError('PARAMETER_RANGE',key+' outside supported base-SI bounds.')
    if v['pass_units']!=int(v['pass_units']):raise EDAError('PARAMETER_RANGE','pass_units must be an integer.')
    if v['load_high_A']<v['load_low_A']:raise EDAError('PARAMETER_RANGE','High load cannot be below low load.')
    v['pass_units']=int(v['pass_units']);return v

def settings():return dict(analysis='tran',duration_s=260e-6,step_s=50e-9,load_F=DEFAULTS['output_F'])

def schematic(values):
    v=parameters(values);lib={}
    bias=C.cell(['BIAS','ENB','VPWR','VGND'])
    C.passive(bias,'R_BIAS','resistor','VPWR','BIAS',v['bias_resistance_Ohm'])
    C.mos(bias,'N_REFERENCE','nmos','BIAS','BIAS','VGND',2.,1.)
    C.mos(bias,'N_DISABLE','nmos','BIAS','ENB','VGND',2.,.15);lib['IVR_BIAS']=bias
    lib['IVR_ERROR_AMP']=C.ota()
    bank=C.cell(['OUT','GATE','VPWR','VGND'])
    for i in range(v['pass_units']):C.mos(bank,'P_PASS'+str(i),'pmos','OUT','GATE','VPWR',v['pass_width_um'],.15)
    lib['IVR_PASS_BANK']=bank
    feedback=C.cell(['OUT','FB','VGND'])
    C.passive(feedback,'R_TOP','resistor','OUT','FB',200000*(v['output_V']/v['reference_V']-1))
    C.passive(feedback,'R_BOTTOM','resistor','FB','VGND',200000.);lib['IVR_FEEDBACK']=feedback
    comp=C.cell(['EA_OUT','GATE','OUT'])
    C.passive(comp,'R_GATE','resistor','EA_OUT','GATE',1000.)
    C.passive(comp,'C_COMP','capacitor','GATE','ZERO',v['compensation_F'])
    C.passive(comp,'R_ZERO','resistor','ZERO','OUT',v['nulling_Ohm']);lib['IVR_COMPENSATION']=comp
    enable=C.cell(['EN','ENB','GATE','OUT','VPWR','VGND'])
    C.mos(enable,'P_INV','pmos','ENB','EN','VPWR',1.,.15)
    C.mos(enable,'N_INV','nmos','ENB','EN','VGND',.5,.15)
    C.mos(enable,'P_GATE_OFF','pmos','GATE','EN','VPWR',20.,.15)
    C.mos(enable,'N_DISCHARGE','nmos','OUT','ENB','VGND',2.,1.);lib['IVR_ENABLE']=enable
    decap=C.cell(['OUT','VGND'])
    C.passive(decap,'R_ESR','resistor','OUT','CAP',v['output_esr_Ohm'])
    C.passive(decap,'C_DECAP','capacitor','CAP','VGND',v['output_F']);lib['IVR_DECOUPLING']=decap
    ir=C.cell(PORTS)
    for name,child,mapping in [('BIAS_SOURCE','IVR_BIAS',{}),
        ('ERROR_AMP','IVR_ERROR_AMP',{'INP':'VREF','INN':'FB','OUT':'EA_OUT'}),
        ('PASS_BANK','IVR_PASS_BANK',{}),('FEEDBACK','IVR_FEEDBACK',{}),
        ('COMPENSATION','IVR_COMPENSATION',{}),('ENABLE','IVR_ENABLE',{}),
        ('DECOUPLING','IVR_DECOUPLING',{})]:C.block(ir,name,child,lib[child]['ports'],mapping)
    ir['cells']=lib;return ir

def spice_tb(p,folder,s,netlist,model_deck,sub):
    v=parameters(p['design_template']['parameters']);supply=s['supply_V'];analysis=s['analysis']
    if not 1.6<=supply<=1.8:raise EDAError('STIMULUS_RANGE','IVR supply range is 1.6..1.8V.')
    if analysis=='tran' and (s['duration_s']<260e-6-1e-15 or s['step_s']>100e-9):raise EDAError('STIMULUS_RANGE','IVR needs at least 260us duration and at most 100ns timestep.')
    lowR=v['output_V']/v['load_low_A'];extra=v['load_high_A']-v['load_low_A'];extraR=v['output_V']/extra if extra else 1e15
    line=max(1.5,supply-.15)
    rows=['Resistor actual SKY130 integrated linear IVR',f'.include "{model_deck}"',f'.include "{netlist}"',
        '.options method=gear maxord=2',f'.temp {s["temperature_C"]}','VGND VGND 0 0',
        f'RLOAD OUT VGND {lowR:.15g}',f'RSTEP OUT LOADSTEP {extraR:.15g}',
        'SLOAD LOADSTEP VGND LOADCTL VGND LOADSW','.model LOADSW SW(Ron=0.1 Roff=1e12 Vt=0.9 Vh=0.01)']
    if analysis=='tran':
        rows += [f'VDD VPWR VGND PWL(0 0 2u {supply:.12g} 100u {supply:.12g} 101u {line:.12g} 140u {line:.12g} 141u {supply:.12g})',
            f'VREF VREF VGND PWL(0 0 2u 0 7u {v["reference_V"]:.12g})',
            f'VEN EN VGND PWL(0 0 2u 0 2.1u {supply:.12g} 180u {supply:.12g} 180.1u 0 220u 0 220.1u {supply:.12g})',
            f'VLOAD LOADCTL VGND PULSE(0 {supply:.12g} 40u 100n 100n 40u 500u)']
    else:rows += [f'VDD VPWR VGND DC {supply:.12g}'+(' AC 1' if analysis=='ac' else ''),f'VREF VREF VGND {v["reference_V"]:.12g}',f'VEN EN VGND {supply:.12g}','VLOAD LOADCTL VGND 0']
    rows += ['XU '+' '.join(sub)+' '+p['cell'],'.control','set num_threads=1','set numdgt=17','set wr_singlescale','set wr_vecnames','set noaskquit']
    names=['VIN','OUT','VREF','EN','FB','GATE','BIAS','supply_current','load_current']
    vectors=['v(VPWR)','v(OUT)','v(VREF)','v(EN)','v(FB)','v(GATE)','v(BIAS)','-i(VDD)',f'v(OUT)/{lowR:.15g}+(v(OUT)-v(LOADSTEP))/{extraR:.15g}'];units=['V']*7+['A','A']
    if analysis=='tran':rows += [f'tran {s["step_s"]:.12g} {s["duration_s"]:.12g}'];xunit,xlabel='s','time'
    elif analysis=='op':rows += ['op','let mos_sample_index=0','setscale mos_sample_index'];xunit,xlabel='point','operating point'
    elif analysis=='ac':
        rows += ['ac dec 80 10 1e8'];names=['supply_to_output_gain','supply_to_output_phase'];vectors=['mag(v(OUT))','180/pi*ph(v(OUT))'];units=['V/V','deg'];xunit,xlabel='Hz','frequency'
    else:raise EDAError('UNSUPPORTED_ANALYSIS','IVR supports op/ac/tran only.')
    rows += [f'let mos_wave_{i} = {vec}' for i,vec in enumerate(vectors)]
    rows += ['wrdata waveform.dat '+' '.join(f'mos_wave_{i}' for i in range(len(vectors))),'write waveform.raw all','quit','.endc','.end']
    dest=Path(folder)/'testbench.spice';dest.write_text('\n'.join(rows)+'\n');return dest,names,units,xunit,xlabel

def stats(w,a,b):
    validate_wave(w);points=window(w,a,b)
    if any(l>=r for l,r in zip(w['x'],w['x'][1:])):raise EDAError('INVALID_WAVEFORM','IVR transient axis must be strictly increasing.')
    if not points:raise EDAError('INCOMPLETE_WAVEFORM','IVR measurement interval is incomplete.')
    mean=math.fsum((r-l)*(u+v)/2 for (l,u),(r,v) in zip(points,points[1:]))/(b-a)
    return dict(mean=mean,minimum=min(v for _,v in points),maximum=max(v for _,v in points))

def product_mean(a,b,start,end):
    validate_wave(a);validate_wave(b)
    if a['x']!=b['x']:raise EDAError('INVALID_WAVEFORM','Power needs aligned actual voltage/current samples.')
    result=variable_supply_metrics(b,a,start,end)
    if not result['available']:raise EDAError('INCOMPLETE_WAVEFORM',result['reason'])
    return result['average_power_W']

def settled(w,target,edge,end,tolerance):
    validate_wave(w)
    points=window(w,edge,end)
    if not points:raise EDAError('INCOMPLETE_WAVEFORM','IVR settling interval is incomplete.')
    bad=[i for i,(_,v) in enumerate(points) if abs(v-target)>tolerance]
    if bad and bad[-1]==len(points)-1:return None
    return points[bad[-1]+1][0]-edge if bad else 0.

def psrr(w,frequency):
    validate_wave(w);x,y=w['x'],w['y']
    if any(l>=r for l,r in zip(x,x[1:])):raise EDAError('INVALID_WAVEFORM','IVR AC frequency axis must be strictly increasing.')
    if frequency<x[0] or frequency>x[-1] or any(f<=0 for f in x) or any(v<=0 for v in y):return None
    for i in range(1,len(x)):
        if x[i-1]<=frequency<=x[i]:
            t=math.log(frequency/x[i-1])/math.log(x[i]/x[i-1]);return -20/math.log(10)*(math.log(y[i-1])+t*math.log(y[i]/y[i-1]))
    return None

def measurements(p,run,s):
    v=parameters(p['design_template']['parameters']);m=run['measurements'];w={r['name']:r for r in run['waveforms']};checks=[];target=v['output_V']
    def check(name,passed,observed):checks.append(dict(name=name,**{'pass':bool(passed)},observed=observed))
    m.update(reference_scope='IVR directed schematic checks only; not stability/signoff certification.',metric_source='actual-ngspice-samples',unverified=LIMITS)
    if s['analysis']=='op':
        out=w['OUT']['y'][0];ii=w['supply_current']['y'][0];io=w['load_current']['y'][0]
        m.update(output_V=out,supply_current_A=ii,load_current_A=io,quiescent_current_A=ii-io,dropout_headroom_V=s['supply_V']-out,supply_power_W=s['supply_V']*ii,output_power_W=out*io)
        m['power_stage_efficiency']=m['output_power_W']/m['supply_power_W'] if m['supply_power_W']>0 else None
        check('DC output within 50mV of requested rail',abs(out-target)<=.05,out)
        check('Positive supply power and physical efficiency',m['power_stage_efficiency'] is not None and 0<m['power_stage_efficiency']<=1,m['power_stage_efficiency'])
    elif s['analysis']=='ac':
        for f in [100,10000,1000000]:m['psrr_'+str(f)+'Hz_dB']=psrr(w['supply_to_output_gain'],f)
        val=m['psrr_100Hz_dB'];check('Light-load PSRR at 100Hz at least 20dB',val is not None and val>=20,val)
        m['ac_scope']='Closed-loop supply ripple transfer at light resistive load, not loop gain/phase margin.'
    elif s['analysis']=='tran':
        for label,a,b in [('light',25e-6,35e-6),('heavy',65e-6,75e-6),('line_low',120e-6,135e-6),('reenabled',245e-6,255e-6)]:
            st=stats(w['OUT'],a,b);m[label+'_output_V']=st['mean'];check(label+' output within 50mV',max(abs(st['minimum']-target),abs(st['maximum']-target))<=.05,[st['minimum'],st['maximum']])
        dip=stats(w['OUT'],40e-6,80e-6);rise=stats(w['OUT'],80.2e-6,98e-6)
        m['load_step_undershoot_V']=max(0,target-dip['minimum']);m['load_release_overshoot_V']=max(0,rise['maximum']-target)
        m['load_regulation_V']=m['heavy_output_V']-m['light_output_V'];m['line_regulation_V']=m['line_low_output_V']-m['light_output_V']
        m['load_settle_2pct_s']=settled(w['OUT'],target,40.1e-6,75e-6,.02*target)
        m['startup_settle_2pct_s']=settled(w['OUT'],target,7e-6,35e-6,.02*target)
        off=stats(w['OUT'],200e-6,215e-6);m['disabled_maximum_V']=off['maximum']
        check('Load step undershoot below 150mV',m['load_step_undershoot_V']<.15,m['load_step_undershoot_V'])
        check('Load release overshoot below 150mV',m['load_release_overshoot_V']<.15,m['load_release_overshoot_V'])
        check('Disable output remains within ±50mV',max(abs(off['minimum']),abs(off['maximum']))<.05,[off['minimum'],off['maximum']])
        a,b=65e-6,75e-6
        m['heavy_input_power_W']=product_mean(w['VIN'],w['supply_current'],a,b);m['heavy_output_power_W']=product_mean(w['OUT'],w['load_current'],a,b)
        m['heavy_power_stage_efficiency']=m['heavy_output_power_W']/m['heavy_input_power_W'] if m['heavy_input_power_W']>0 else None
        check('Heavy-load efficiency physically bounded',m['heavy_power_stage_efficiency'] is not None and 0<m['heavy_power_stage_efficiency']<=1,m['heavy_power_stage_efficiency'])
        m['power_scope']='All DUT VDD current including bias/feedback. External VREF/enable-driver power excluded. Resistive loads specified at target VOUT.'
    run['reference_verification']=dict(schema_version=1,kind=ID,source='actual-ngspice-samples',checks=checks,**{'pass':all(c['pass'] for c in checks) if checks else None},scope=m['reference_scope'])
    if checks:run['analysis_result']='pass' if run['reference_verification']['pass'] else 'fail'
