"""Editable SKY130 chip cores. No ideal sources implement the DUT's function.

Bias/reference/clocks, capacitors and loads are declared testbench assumptions.
These are schematic references, never generated masks or foundry signoff.
"""
import copy
import math
from pathlib import Path
import native
import digital_units
from geometry import EDAError

COMMON = ['VPWR', 'VGND']
CATALOG = {
 'chip_ldo': {'name':'LDO · 1.8V → 1.2V PMOS 레귤레이터', 'ports':['VREF','BIAS','OUT',*COMMON], 'parameter_defaults':{'pass_width_um':20.,'compensation_F':20e-12,'output_F':1e-9,'load_low_A':20e-6,'load_high_A':200e-6}, 'analyses':['tran','op'], 'category':'전원', 'scope':'병렬 PMOS 5개 · 외부 0.6V 기준·바이어스, 이상적 출력 C, 1.2V 기준 20→200µA 저항 부하', 'targets':['출력 1.2V','부하 과도 응답','실제 공급 전류']},
 'chip_sc_dcdc': {'name':'DC-DC · 2:1 스위치드 커패시터 코어', 'ports':['PHI1','PHI1B','PHI2','PHI2B','OUT',*COMMON], 'parameter_defaults':{'switch_width_um':20.,'flying_F':1e-9,'output_F':1e-9,'load_Ohm':50000.}, 'analyses':['tran'], 'category':'전원', 'scope':'외부 비중첩 5MHz 클록, 이상적 1nF flying/output C · 개방루프', 'targets':['Vin/2 변환','출력 리플','입·출력 전력과 효율']},
 'chip_vco': {'name':'VCO · 전류 제한 3단 링 발진기', 'ports':['CTRL','OUT',*COMMON], 'parameter_defaults':{'stage_F':500e-15,'control_V':.9}, 'analyses':['tran'], 'category':'클록', 'scope':'SKY130 MOS 14개 · 초기 조건으로 발진 시작', 'targets':['CTRL에 따른 실제 주파수','듀티','소비 전력']},
 'chip_pll': {'name':'PLL · XOR 위상 검출 1:1 루프', 'ports':['REF','CTRL','OUT',*COMMON], 'parameter_defaults':{'stage_F':500e-15,'reference_Hz':30e6,'filter_Ohm':20000.,'filter_F':10e-12}, 'analyses':['tran'], 'category':'클록', 'scope':'실제 CMOS XOR + RC + 저항 바이어스 VCO · Type-I, N=1 · CP/PFD 아님', 'targets':['기준과 출력 주파수 비교','위상 오차 안정','제어 전압과 lock 판정']},
 'chip_ota': {'name':'OTA · 5-MOS 전류 미러 부하 증폭기', 'ports':['INP','INN','BIAS','OUT',*COMMON], 'parameter_defaults':{'input_width_um':10.,'load_F':1e-12}, 'analyses':['ac','op'], 'category':'아날로그', 'scope':'외부 바이어스 · 이상적 부하 · INP→OUT 반전 이득', 'targets':['DC 동작점','AC 저주파 이득','−3dB 대역폭']},
 'chip_comparator': {'name':'비교기 · 차동 입력 + CMOS 출력', 'ports':['INP','INN','BIAS','OUT',*COMMON], 'parameter_defaults':{'input_width_um':10.,'differential_V':.1,'load_F':50e-15}, 'analyses':['tran','op'], 'category':'아날로그', 'scope':'정적 비교기 · 외부 바이어스 · hysteresis/offset/MC 미검증', 'targets':['INP > INN → HIGH','INP < INN → LOW','지연·전류 파형']}
}
SETTINGS = {
 'chip_ldo':dict(analysis='tran',duration_s=100e-6,step_s=50e-9),
 'chip_sc_dcdc':dict(analysis='tran',duration_s=20e-6,step_s=2e-9),
 'chip_vco':dict(analysis='tran',duration_s=3e-6,step_s=.5e-9),
 'chip_pll':dict(analysis='tran',duration_s=15e-6,step_s=1e-9),
 'chip_ota':dict(analysis='ac',duration_s=1e-6,step_s=1e-9),
 'chip_comparator':dict(analysis='tran',duration_s=4e-6,step_s=1e-9)
}
for row in CATALOG.values(): row['physical_status']='not-generated'

def parameters(kind, values):
    for key in ('pass_width_um','switch_width_um','input_width_um'):
        if key in values and not .42 <= values[key] <= 20:
            raise EDAError('PARAMETER_RANGE','This chip reference uses supported model widths 0.42..20 um; the LDO has five parallel pass devices.')
    if 'reference_Hz' in values and not 1e5 <= values['reference_Hz'] <= 3e8:
        raise EDAError('PARAMETER_RANGE','Reference must be 0.1..300 MHz. Lock range must be measured.')
    if kind=='chip_comparator' and not .02 <= values['differential_V'] <= .4:
        raise EDAError('PARAMETER_RANGE','Comparator differential step must be 20..400mV.')
    if kind=='chip_ldo' and values['load_high_A'] < values['load_low_A']:
        raise EDAError('PARAMETER_RANGE','High load must not be below low load.')
    return values

def cell(ports):
    return {'schema_version':1,'ports':ports,'connectivity_mode':'explicit','devices':[],'wires':[],'junctions':[]}

def element(ir, name, kind, pins, value, **extra):
    i=len(ir['devices']); ir['devices'].append(dict(id=name,name=name,kind=kind,pins=pins,parameters=value,x=180+(i%4)*240,y=170+(i//4)*180,**extra))

def mos(ir,name,kind,d,g,s,w,l=.5):
    element(ir,name,kind,{'D':d,'G':g,'S':s,'B':'VGND' if kind=='nmos' else 'VPWR'},dict(w_um=w,l_um=l,nf=1,m=1),model='sky130_fd_pr__'+('nfet_01v8' if kind=='nmos' else 'pfet_01v8_hvt'))

def passive(ir,name,kind,a,b,value): element(ir,name,kind,{'+':a,'-':b},{'value':value})

def ota(w=10.):
    ir=cell(['INP','INN','BIAS','OUT',*COMMON])
    mos(ir,'N_INP','nmos','OUT','INP','TAIL',w,1.)
    mos(ir,'N_INN','nmos','MIR','INN','TAIL',w,1.)
    mos(ir,'P_DIODE','pmos','MIR','MIR','VPWR',20.,1.)
    mos(ir,'P_MIRROR','pmos','OUT','MIR','VPWR',20.,1.)
    mos(ir,'N_TAIL','nmos','TAIL','BIAS','VGND',2.,1.)
    return ir

def vco(cap):
    ir=cell(['CTRL','OUT',*COMMON])
    mos(ir,'P_BIAS','pmos','PBIAS','PBIAS','VPWR',10.)
    mos(ir,'N_BIAS','nmos','PBIAS','CTRL','VGND',5.)
    for i in range(3):
        y=['Q0','Q1','OUT'][i];a=['OUT','Q0','Q1'][i]
        mos(ir,f'P_LIMIT{i}','pmos',f'P{i}','PBIAS','VPWR',10.)
        mos(ir,f'P_INV{i}','pmos',y,a,f'P{i}',8.,.15)
        mos(ir,f'N_INV{i}','nmos',y,a,f'N{i}',4.,.15)
        mos(ir,f'N_LIMIT{i}','nmos',f'N{i}','CTRL','VGND',5.)
        passive(ir,f'C_STAGE{i}','capacitor',y,'VGND',cap)
    return ir

def block(ir,name,child,ports,mapping):
    element(ir,name,'block',{p:mapping.get(p,p) for p in ports},{},cell_name=child)

def schematic(kind, v):
    ir=cell(CATALOG[kind]['ports']); children={}
    if kind=='chip_vco': ir=vco(v['stage_F'])
    elif kind=='chip_pll':
        lib=digital_units.make_library(1);children={k:lib[k] for k in ('NAND2','XOR2')};children['RING_VCO']=vco(v['stage_F'])
        block(ir,'PHASE_DETECTOR','XOR2',children['XOR2']['ports'],{'A':'REF','B':'OUT','Y':'PD'})
        passive(ir,'R_FILTER','resistor','PD','CTRL',v['filter_Ohm'])
        passive(ir,'C_FILTER','capacitor','CTRL','VGND',v['filter_F'])
        passive(ir,'R_BIAS_TOP','resistor','VPWR','TUNE',100000.)
        passive(ir,'R_BIAS_BOTTOM','resistor','TUNE','VGND',100000.)
        passive(ir,'R_TUNE','resistor','CTRL','TUNE',1000000.)
        block(ir,'OSCILLATOR','RING_VCO',children['RING_VCO']['ports'],{'CTRL':'TUNE'})
    elif kind=='chip_ldo':
        children['ERROR_AMP']=ota();block(ir,'ERROR_AMP','ERROR_AMP',children['ERROR_AMP']['ports'],{'INP':'VREF','INN':'FB','OUT':'GATE'})
        for i in range(5):mos(ir,f'PASS{i}','pmos','OUT','GATE','VPWR',v['pass_width_um'],.15)
        passive(ir,'R_FB_TOP','resistor','OUT','FB',200000.)
        passive(ir,'R_FB_BOTTOM','resistor','FB','VGND',200000.)
        passive(ir,'C_COMP','capacitor','GATE','COMP',v['compensation_F'])
        passive(ir,'R_ZERO','resistor','COMP','OUT',1000.)
    elif kind=='chip_ota': ir=ota(v['input_width_um'])
    elif kind=='chip_comparator':
        children['PREAMP']=ota(v['input_width_um']);block(ir,'PREAMP','PREAMP',children['PREAMP']['ports'],{'OUT':'PRE'})
        mos(ir,'P_OUT','pmos','OUT','PRE','VPWR',8.,.15)
        mos(ir,'N_OUT','nmos','OUT','PRE','VGND',4.,.15)
    elif kind=='chip_sc_dcdc':
        for name,a,b,phi in [('TOP_CHARGE','VPWR','FLYTOP','PHI1'),('BOTTOM_CHARGE','OUT','FLYBOTTOM','PHI1'),('TOP_TRANSFER','FLYTOP','OUT','PHI2'),('BOTTOM_TRANSFER','FLYBOTTOM','VGND','PHI2')]:
            mos(ir,'N_'+name,'nmos',a,phi,b,v['switch_width_um'],.15)
            mos(ir,'P_'+name,'pmos',a,phi+'B',b,v['switch_width_um'],.15)
    ir['cells']=children
    for port in CATALOG[kind]['ports']:element(ir,'PORT_'+port,'port',{'P':port},{})
    return ir

def spice_tb(p,folder,settings,netlist,model_deck):
    kind=p['design_template']['id'];v=p['design_template']['parameters'];s=settings['supply_V'];analysis=settings['analysis']
    if s<1.5:raise EDAError('STIMULUS_RANGE','Chip references require 1.5..1.8V supply; external VREF/bias must remain valid.')
    rows=['Resistor actual SKY130 chip reference '+kind,'.options method=gear maxord=2',f'.include "{model_deck}"','.option scale=1e-6',f'.include "{netlist}"',f'.temp {settings["temperature_C"]}','VGND VGND 0 0',f'VDD VPWR VGND {s:.12g}']
    names=['OUT','supply_current'];vectors=['v(OUT)','-i(VDD)'];units=['V','A']
    def probe(name,vector,unit='V'):names.append(name);vectors.append(vector);units.append(unit)
    if kind=='chip_ldo':
        low=v['load_low_A'];extra=v['load_high_A']-low
        rows += ['VREF VREF VGND 0.6','VBIAS BIAS VGND 0.9',f'COUT OUT VGND {v["output_F"]:.12g}',f'RLOAD OUT VGND {1.2/low:.12g}']
        if extra>0:rows += [f'RSTEP OUT LOADSTEP {1.2/extra:.12g}','SLOAD LOADSTEP VGND LOADCTL VGND LOADSW',f'VLOAD LOADCTL VGND PULSE(0 {s:.12g} 20u 100n 100n 40u 100u)','.model LOADSW SW(Ron=0.1 Roff=1e12 Vt=0.9 Vh=0.01)']
        probe('FB','v(xu.FB)');probe('GATE','v(xu.GATE)')
    elif kind=='chip_sc_dcdc':
        for name,delay in [('PHI1',100e-9),('PHI2',200e-9)]:
            rows += [f'V{name} {name} VGND PULSE(0 {s:.12g} {delay:.12g} 100p 100p 75n 200n)',f'V{name}B {name}B VGND PULSE({s:.12g} 0 {delay:.12g} 100p 100p 75n 200n)']
        rows += [f'CFLY xu.FLYTOP xu.FLYBOTTOM {v["flying_F"]:.12g}',f'COUT OUT VGND {v["output_F"]:.12g}',f'RLOAD OUT VGND {v["load_Ohm"]:.12g}']
        probe('FLYTOP','v(xu.FLYTOP)');probe('FLYBOTTOM','v(xu.FLYBOTTOM)');probe('PHI1','v(PHI1)');probe('PHI2','v(PHI2)')
    elif kind in ('chip_vco','chip_pll'):
        if kind=='chip_vco':rows += [f'VCTRL CTRL VGND {v["control_V"]:.12g}','.ic v(xu.Q0)=0.1 v(xu.Q1)=1.5 v(OUT)=0.2']
        else:
            period=1/v['reference_Hz'];rows += [f'VREF REF VGND PULSE(0 {s:.12g} 1n 100p 100p {period/2-100e-12:.12g} {period:.12g})','.ic v(xu.OSCILLATOR.Q0)=0.1 v(xu.OSCILLATOR.Q1)=1.5 v(OUT)=0.2 v(CTRL)=0.9 v(xu.TUNE)=0.9'];probe('REF','v(REF)');probe('PD','v(xu.PD)');probe('TUNE','v(xu.TUNE)')
        probe('CTRL','v(CTRL)')
    else:
        rows += ['VBIAS BIAS VGND 0.9','VINN INN VGND 0.9']
        if kind=='chip_comparator':
            delta=v['differential_V']/2;rows += [f'VINP INP VGND PULSE({.9-delta:.12g} {.9+delta:.12g} 1u 2n 2n 1u 2u)'];probe('INP','v(INP)');probe('INN','v(INN)');probe('PRE','v(xu.PRE)')
        else: rows += ['VINP INP VGND DC 0.9 AC 1','RLOAD OUT VGND 100meg']
        rows += [f'COUT OUT VGND {v["load_F"]:.12g}']
    rows += ['XU '+' '.join(p['ports'])+' '+p['cell'],'.control','set num_threads=1','set numdgt=17','set noaskquit','set wr_singlescale','set wr_vecnames']
    if analysis=='tran':rows += [f'tran {settings["step_s"]:.12g} {settings["duration_s"]:.12g}'+(' uic' if kind in ('chip_vco','chip_pll','chip_sc_dcdc') else '')];xunit,xlabel='s','time'
    elif analysis=='op':rows += ['op','let mos_sample_index=0','setscale mos_sample_index'];xunit,xlabel='point','operating point'
    elif analysis=='ac':
        rows += ['ac dec 40 10 1e9'];names=['OUT_gain','OUT_phase'];vectors=['mag(v(OUT))','180/pi*ph(v(OUT))'];units=['V/V','deg'];xunit,xlabel='Hz','frequency'
    else:raise EDAError('UNSUPPORTED_ANALYSIS','Analysis has no owned chip-reference testbench.')
    for i,vector in enumerate(vectors):rows += [f'let mos_wave_{i} = {vector}']
    rows += ['wrdata waveform.dat '+' '.join(f'mos_wave_{i}' for i in range(len(vectors))),'write waveform.raw all','quit','.endc','.end']
    dest=Path(folder)/'testbench.spice';dest.write_text('\n'.join(rows)+'\n');return dest,names,units,xunit,xlabel

def crossings(wave,threshold,start=0):
    x,y=wave['x'],wave['y'];return [x[i-1]+(threshold-y[i-1])*(x[i]-x[i-1])/(y[i]-y[i-1]) for i in range(1,len(x)) if x[i]>=start and y[i-1]<threshold<=y[i]]

def window(w,start,end):return [y for x,y in zip(w['x'],w['y']) if start<=x<=end]
def average(values):return sum(values)/len(values) if values else None
def integrate(x,y,start):
    pairs=[(t,v) for t,v in zip(x,y) if t>=start]
    if len(pairs)<2:return None
    return sum((b[0]-a[0])*(a[1]+b[1])/2 for a,b in zip(pairs,pairs[1:]))/(pairs[-1][0]-pairs[0][0])

def measurements(p,run,params):
    kind=p['design_template']['id'];v=p['design_template']['parameters'];m=run['measurements'];waves={w['name']:w for w in run['waveforms']};s=params['supply_V'];checks=[]
    def check(name,passed,value):checks.append({'name':name,'pass':bool(passed),'observed':value})
    m['reference_scope']='schematic-only; external ideal testbench components; no physical signoff'
    if params['analysis']=='tran':
        out=waves['OUT'];end=out['x'][-1];start=end*.75;tail=window(out,start,end)
        if not tail:raise EDAError('INCOMPLETE_WAVEFORM','No samples in observation window.')
        m['settled_output_mean_V']=integrate(out['x'],out['y'],start);m['settled_output_ripple_V']=max(tail)-min(tail)
        supply=waves['supply_current'];m['average_supply_current_A']=integrate(supply['x'],supply['y'],start);m['average_supply_power_W']=s*m['average_supply_current_A']
        if kind=='chip_ldo':
            for label,a,b in [('light_load',10e-6,18e-6),('heavy_load',50e-6,58e-6),('recovery',90e-6,98e-6)]:
                ys=window(out,a,b);mean=average(ys);m[label+'_output_V']=mean;check(label+' every sample within 50mV of 1.2V',bool(ys) and all(abs(y-1.2)<=.05 for y in ys),[min(ys),max(ys)] if ys else None)
            m['load_step_undershoot_V']=1.2-min(window(out,20e-6,60e-6),default=1.2)
            check('load-step undershoot below 150mV',m['load_step_undershoot_V']<.15,m['load_step_undershoot_V'])
        elif kind=='chip_sc_dcdc':
            mean=m['settled_output_mean_V'];power=integrate(out['x'],[y*y/v['load_Ohm'] for y in out['y']],start);m['output_power_W']=power;m['power_stage_efficiency']=power/m['average_supply_power_W'] if m['average_supply_power_W']>0 else None
            m['efficiency_scope']='Includes DUT MOS loss and VDD current; excludes externally supplied clock-driver power.'
            check('output near Vin/2',abs(mean-s/2)<.15,mean);check('non-overlap clock high windows do not intersect',all(not(a>s*.5 and b>s*.5) for a,b in zip(waves['PHI1']['y'],waves['PHI2']['y'])),None)
            check('power-stage efficiency within physical bounds',m['power_stage_efficiency'] is not None and 0<m['power_stage_efficiency']<=1.001,m['power_stage_efficiency'])
        elif kind in ('chip_vco','chip_pll'):
            edges=crossings(out,s/2,end*.6);f=(len(edges)-1)/(edges[-1]-edges[0]) if len(edges)>2 else None;m['output_frequency_Hz']=f
            check('oscillation crosses both logic rails',min(tail)<s*.3 and max(tail)>s*.7,[min(tail),max(tail)]);check('at least 3 complete output periods measured',len(edges)>3,len(edges))
            if kind=='chip_pll':
                refs=crossings(waves['REF'],s/2,end*.6);fr=(len(refs)-1)/(refs[-1]-refs[0]) if len(refs)>2 else None;m['reference_frequency_Hz']=fr;m['relative_frequency_error']=abs(f-fr)/fr if f and fr else None
                phases=[min(abs(e-r) for r in refs)*fr*360 for e in edges[1:-1]] if fr else []
                m['phase_error_span_deg']=max(phases)-min(phases) if phases else None
                check('frequency error under 1%',m['relative_frequency_error'] is not None and m['relative_frequency_error']<.01,m['relative_frequency_error']);check('phase error remains bounded within 15 degrees',len(phases)>3 and m['phase_error_span_deg']<15,m['phase_error_span_deg'])
                m['lock_scope']='Last 40% of simulated interval; deterministic frequency/phase-window criterion, not jitter/phase-noise characterization.'
        elif kind=='chip_comparator':
            for label,a,b,high in [('negative input',.6e-6,.9e-6,False),('positive input',1.6e-6,1.9e-6,True),('negative recovery',2.6e-6,2.9e-6,False)]:
                ys=window(out,a,b);check(label+' logic level',bool(ys) and (min(ys)>s*.7 if high else max(ys)<s*.3),[min(ys),max(ys)] if ys else None)
    elif params['analysis']=='ac':
        gain=waves['OUT_gain'];g=gain['y'][0];m['low_frequency_gain_V_per_V']=g;m['low_frequency_gain_dB']=20*math.log10(g) if g>0 else None
        m['bandwidth_3dB_Hz']=None
        for i in range(1,len(gain['x'])):
            a,b=gain['y'][i-1:i+1];target=g/math.sqrt(2)
            if b<=target<=a and a!=b:
                x0,x1=gain['x'][i-1:i+1];m['bandwidth_3dB_Hz']=math.exp(math.log(x0)+(target-a)*(math.log(x1)-math.log(x0))/(b-a));break
        check('OTA low-frequency gain exceeds 10 V/V',g>10,g)
    run['reference_verification']={'schema_version':1,'kind':kind,'source':'actual-ngspice-samples','checks':checks,'pass':all(c['pass'] for c in checks) if checks else None,'scope':'Only the named deterministic waveform criteria, not complete chip specifications.'}
    if checks:run['analysis_result']='pass' if all(c['pass'] for c in checks) else 'fail'
    return run['reference_verification']
