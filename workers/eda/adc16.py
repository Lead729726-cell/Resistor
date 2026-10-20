"""Three editable 16-bit ADC references; code width is not a silicon ENOB claim.

SAR: differential four-by-four split CDAC, retained MOS charge/decisions.
SDM: real second-order RC/MOS loop plus independently replayed CIC3.
Pipeline: fourteen differential 1.5-bit SC MDACs plus 2-bit flash and alignment.
External references, clocks and the digital/analog timing boundary are declared.
"""
import copy, hashlib, json, math
from functools import lru_cache
from pathlib import Path
import chip_references as C, digital_units as D, sigma_delta as SD, sar12
import native
from geometry import EDAError

HERE=Path(__file__).parent
SUPPLY=['VPWR','VGND'];BITS=[f'B{i}'for i in range(16)]
SAR_DEFAULTS=dict(input_differential_V=1.2/65536,reference_V=1.2,input_common_mode_V=.9,
                  unit_F=1e-12,acquisition_s=8e-6,hold_s=.5e-6,bit_period_s=1e-6,test_mode=4)
SDM_DEFAULTS=dict(input_V=.9,sine_amplitude_V=0.,sine_frequency_Hz=61.03515625)
PIPE_DEFAULTS=dict(input_differential_V=.15,reference_V=1.2,input_common_mode_V=.9,clock_Hz=100000.)

PARTS={
 'adc16_reference':('ADC16_REFERENCE','공통 · VCM 저항 기준·디커플링','common'),
 'adc16_bias':('ADC16_BIAS','공통 · MOS 바이어스','common'),
 'adc16_ota':('ADC16_OTA','공통 · 2단 Miller OTA','common'),
 'adc16_comparator':('ADC16_COMPARATOR','공통 · 정적 MOS 비교기','common'),
 'sar16_switch':('SAR12_TG','SAR16 · CMOS 전송 게이트','sar'),
 'sar16_unit_cap':('SAR16_UNIT','SAR16 · 동일 1pF 단위 C','sar'),
 'sar16_bridge':('SAR16_BRIDGE','SAR16 · 4-bit bank bridge','sar'),
 'sar16_cdac':('SAR16_CDAC','SAR16 · 차동 4+4+4+4 CDAC','sar'),
 'sar16_comparator':('SAR12_COMPARATOR','SAR16 · 2단 preamp·동적 latch','sar'),
 'sar16_analog':('SAR16_ANALOG','SAR16 · 실제 MOS·전하 아날로그 코어','sar'),
 'sar16_controller':('SAR16_CONTROLLER','SAR16 · 획득·비중첩·16회 제어','sar'),
 'sar_adc16':('SAR_ADC16','SAR16 · 전체 ADC·CODE/VALID','sar'),
 'sdm16_integrator':('SDM16_INTEGRATOR2','ΣΔ16 · 2차 루프 두 번째 적분기','sigma_delta'),
 'sdm16_modulator':('SDM16_MODULATOR','ΣΔ16 · 2차 MOS 모듈레이터','sigma_delta'),
 'sdm16_filter':('SIGMA_DELTA16_FILTER','ΣΔ16 · 25-bit CIC3·×256·포화','sigma_delta'),
 'sigma_delta16':('SIGMA_DELTA16','ΣΔ16 · 2차 루프·16-bit 디지털 출력','sigma_delta'),
 'pipeline16_subadc':('PIPE16_SUBADC','Pipeline16 · 1.5-bit 2-comparator subADC','pipeline'),
 'pipeline16_mdac':('PIPE16_MDAC','Pipeline16 · 2배 SC MDAC 반회로','pipeline'),
 'pipeline16_stage':('PIPE16_STAGE','Pipeline16 · 차동 1.5-bit 스테이지','pipeline'),
 'pipeline16_flash':('PIPE16_FLASH','Pipeline16 · 최종 2-bit flash','pipeline'),
 'pipeline16_analog':('PIPE16_ANALOG','Pipeline16 · 14 MDAC + flash 코어','pipeline'),
 'pipeline16_align':('PIPELINE16_ALIGN','Pipeline16 · 지연 정렬·중복 코드 보정','pipeline'),
 'pipeline_adc16':('PIPELINE_ADC16','Pipeline16 · 전체 ADC·CODE/VALID/ERROR','pipeline')}


def digital(stem):
    p=json.loads((HERE/'rtl'/f'{stem}_cmos.json').read_text())
    for key,name in [('rtl_sha256',stem+'.v'),('gate_rtl_sha256',stem+'_gate.v')]:
        if p[key]!=hashlib.sha256((HERE/'rtl'/name).read_bytes()).hexdigest():
            raise EDAError('ADC16_STALE_SYNTHESIS','Re-synthesize the changed ADC16 RTL before using its CMOS graph.')
    return p['schematic']


def parameters(kind,raw):
    defaults=CATALOG[kind]['parameter_defaults'];v={**defaults,**raw}
    if set(raw)-set(defaults):raise EDAError('ADC16_PARAMETER','Unknown ADC16 parameter.')
    if any(isinstance(n,bool)or not isinstance(n,(int,float))or not math.isfinite(n)for n in v.values()):raise EDAError('ADC16_PARAMETER','Finite numerical parameters are required.')
    if 'input_differential_V'in v:
        if not .6<=v['reference_V']<=1.2 or abs(v['input_differential_V'])>v['reference_V']:raise EDAError('ADC16_INPUT','Differential input must remain within ±VREF, VREF=.6..1.2V.')
        if not .75<=v['input_common_mode_V']<=1.05 or v['input_common_mode_V']-v['reference_V']/2<0 or v['input_common_mode_V']+v['reference_V']/2>1.8:raise EDAError('ADC16_INPUT','Keep both actual input pins within the supply rails.')
    if kind in ('sar_adc16','sar16_analog'):
        if v['unit_F']!=1e-12:raise EDAError('ADC16_UNIT','The fixed layout reference uses equal nominal 1pF units.')
        if not 2e-6<=v['acquisition_s']<=20e-6 or not .5e-6<=v['bit_period_s']<=5e-6 or not .1e-6<=v['hold_s']<=2e-6:raise EDAError('ADC16_TIMING','Acquisition 2..20us, bit .5..5us and nonoverlap .1..2us required.')
        if v['test_mode']not in (0,1,2,4):raise EDAError('ADC16_MODE','Use directed(0), coherent64(1), coherent256(2), or one measured input(4).')
        if kind=='sar_adc16'and(not math.isclose(v['acquisition_s'],8*v['bit_period_s'],rel_tol=1e-10)or not math.isclose(v['hold_s'],v['bit_period_s']/2,rel_tol=1e-10)):raise EDAError('ADC16_RTL_TIMING','Full SAR16 RTL requires 16 acquisition clocks, one hold clock and two clocks/bit. Use the analog core for independent timing experiments.')
    if kind in ('sigma_delta16','sdm16_modulator'):
        if not .3<=v['input_V']-v['sine_amplitude_V']<=v['input_V']+v['sine_amplitude_V']<=1.5 or v['sine_amplitude_V']<0:raise EDAError('ADC16_INPUT','SDM16 nominal input including sine must stay in .3..1.5V.')
        if not 0<v['sine_frequency_Hz']<=500:raise EDAError('ADC16_INPUT','SDM16 reference signal bandwidth is at most 500Hz.')
    if 'clock_Hz'in v and not 10000<=v['clock_Hz']<=500000:raise EDAError('ADC16_TIMING','Pipeline fixture clock is 10..500kHz; settling must be measured.')
    return v


def library(params=None):
    params=params or {};unit=params.get('unit_F',1e-12)
    lib=SD.analog_library()
    lib.update(sar12.library())
    lib['ADC16_REFERENCE']=copy.deepcopy(lib['SDM8_REFERENCE']);lib['ADC16_BIAS']=copy.deepcopy(lib['SDM8_BIAS'])
    lib['ADC16_OTA']=copy.deepcopy(lib['SDM8_OTA']);lib['ADC16_COMPARATOR']=copy.deepcopy(lib['SDM8_COMPARATOR'])
    # The original 100k divider cannot drive the extra loop feedforward load.
    # This deliberately strong, real resistor reference costs 16.2mW at 1.8V;
    # it is a measurable reference fixture, not a low-power bandgap claim.
    for d in lib['ADC16_REFERENCE']['devices']:
        if d['kind']=='resistor':d['parameters']['value']=100.
    # Remove the old 10k source-loading error; this RC is not an anti-alias
    # filter for the 1MHz modulator. An external signal-band filter is required.
    for d in lib['SDM8_INPUT_FILTER']['devices']:
        if d['kind']=='resistor':d['parameters']['value']=100.
    cap=C.cell(['TOP','BOTTOM']);C.passive(cap,'C_UNIT','capacitor','TOP','BOTTOM',unit);lib['SAR16_UNIT']=cap
    cap=C.cell(['TOP','FINE']);C.passive(cap,'C_BRIDGE','capacitor','TOP','FINE',32*unit/15);lib['SAR16_BRIDGE']=cap
    dac=C.cell(['VINP','VINN','VREF','VCM','SAMPLE','TOPP','TOPN']+BITS+SUPPLY)
    D.block(dac,lib,'INV','SAMPLE_INV',{'A':'SAMPLE','Y':'SAMPLEB'})
    for side in ('P','N'):
        hi,lo='HI'+side,'LO'+side
        for tag,ref in [('HI','VREF'),('LO','VGND')]:D.block(dac,lib,'SAR12_REFMUX',tag+side,{'VIN':'VIN'+side,'REF':ref,'SAMPLE':'SAMPLE','SAMPLEB':'SAMPLEB','OUT':tag+side})
        # Bank zero is the MSB bank. The bottom bank has two dummy units.
        for bank in range(4):
            top='TOP'+side if bank==0 else f'BANK{bank}{side}'
            D.block(dac,lib,'SAR12_TG',f'RESET_{bank}{side}',{'A':'VCM','Y':top,'EN':'SAMPLE','ENB':'SAMPLEB'})
            if bank<3:D.block(dac,lib,'SAR16_BRIDGE',f'BRIDGE_{bank}{side}',{'TOP':top,'FINE':f'BANK{bank+1}{side}'})
            for bit in range(4):
                n=12-4*bank+bit;bottom=f'{side}_BANK{bank}_B{bit}'
                D.block(dac,lib,'SAR12_BITMUX',bottom+'_SW',{'HI':hi if side=='P'else lo,'LO':lo if side=='P'else hi,'BIT':BITS[n],'OUT':bottom})
                for i in range(2<<bit):D.block(dac,lib,'SAR16_UNIT',f'{bottom}_U{i}',{'TOP':top,'BOTTOM':bottom})
            if bank==3:
                for i in range(2):D.block(dac,lib,'SAR16_UNIT',f'{side}_BANK{bank}_DUMMY_U{i}',{'TOP':top,'BOTTOM':lo if side=='P'else hi})
    lib['SAR16_CDAC']=dac
    core=C.cell(['VINP','VINN','VREF','VCM','SAMPLE','EVAL','TOPP','TOPN','COMP','COMPN']+BITS+SUPPLY)
    D.block(core,lib,'SAR16_CDAC','DAC',{n:n for n in dac['ports']if n not in SUPPLY})
    D.block(core,lib,'SAR12_COMPARATOR','COMPARE',{'INP':'TOPN','INN':'TOPP','EVAL':'EVAL','OUTP':'COMP','OUTN':'COMPN'});lib['SAR16_ANALOG']=core
    for stem,target in [('sar16','SAR16_CONTROLLER'),('sigma_delta16','SIGMA_DELTA16_FILTER'),('pipeline16','PIPELINE16_ALIGN')]:
        ir=copy.deepcopy(digital(stem));lib.update(ir.pop('cells'));lib[target]=ir
    full=C.cell(['VINP','VINN','VREF','VCM','CLK','RESET','START','TOPP','TOPN','COMP','COMPN','SAMPLE','EVAL','BUSY','VALID']+[f'CODE{i}'for i in range(16)]+SUPPLY)
    D.block(full,lib,'SAR16_ANALOG','ANALOG',{n:n for n in core['ports']if n not in SUPPLY})
    D.block(full,lib,'SAR16_CONTROLLER','CONTROL',{'CLK':'CLK','RESET':'RESET','START':'START','COMPARATOR':'COMP','SAMPLE':'SAMPLE','EVAL':'EVAL','BUSY':'BUSY','VALID':'VALID',**{f'TRIAL{i}':BITS[i]for i in range(16)},**{f'CODE{i}':f'CODE{i}'for i in range(16)}});lib['SAR_ADC16']=full
    # CT second order: y1'=(b*VDD-VIN)/tau1,
    # y2'=-(y1-VCM)/tau2-2*(b*VDD-VIN)/tau2, b=sign(y2-VCM).
    # Real resistor feedforward sets V+= (VCM+2*VIN)/3, preventing the
    # first integrator's DC output from moving to 2.7-2*VIN and railing.
    # Opposite comparator polarity to the old first-order loop is essential.
    integ=C.cell(['VIN','SIGNAL','BITSTREAM','VCM','BIAS','OUT','RESET','RESETB']+SUPPLY)
    C.block(integ,'AMP','ADC16_OTA',lib['ADC16_OTA']['ports'],{'INP':'TRACK_REF','INN':'SUM'})
    C.passive(integ,'R_REF_CM','resistor','VCM','TRACK_REF',200000.)
    C.passive(integ,'R_REF_SIGNAL','resistor','SIGNAL','TRACK_REF',100000.)
    C.passive(integ,'R_INPUT','resistor','VIN','SUM',500000.)
    C.passive(integ,'R_FEEDBACK','resistor','BITSTREAM','SUM',250000.)
    C.passive(integ,'C_INT','capacitor','OUT','SUM',4e-12)
    C.block(integ,'RESET_SWITCH','SDM8_RESET_SWITCH',lib['SDM8_RESET_SWITCH']['ports'],{});lib['SDM16_INTEGRATOR2']=integ
    mod=C.cell(['VIN','CLK','RESET','BITSTREAM','VCM','BIAS','INT1','INT2']+SUPPLY)
    for instance,target,mapping in [
        ('INPUT','SDM8_INPUT_FILTER',{'OUT':'FILTERED'}),('REFERENCE','ADC16_REFERENCE',{}),('BIAS_SOURCE','ADC16_BIAS',{}),
        ('CLOCK','SDM8_CLOCK_BUFFER',{'CLK_OUT':'SAMPLE_CLK'}),('RESET_INV','INV',{'A':'RESET','Y':'RESETB'}),
        ('INTEGRATOR1','SDM8_INTEGRATOR',{'VIN':'FILTERED','OUT':'INT1'}),
        ('INTEGRATOR2','SDM16_INTEGRATOR2',{'VIN':'INT1','SIGNAL':'FILTERED','OUT':'INT2'}),
        ('QUANTIZER','ADC16_COMPARATOR',{'INP':'INT2','INN':'VCM','OUT':'CMP'}),
        ('BIT_LATCH','SDM8_SAMPLE_LATCH',{'D':'CMP','CLK':'SAMPLE_CLK','Q':'BITSTREAM'}),('FEEDBACK_DAC','SDM8_DAC',{})]:C.block(mod,instance,target,lib[target]['ports'],mapping)
    lib['SDM16_MODULATOR']=mod
    full=C.cell(mod['ports']+[f'CODE{i}'for i in range(16)]+['VALID'])
    C.block(full,'MODULATOR','SDM16_MODULATOR',mod['ports'],{})
    C.block(full,'FILTER_CLOCK','INV',lib['INV']['ports'],{'A':'CLK','Y':'FILTER_CLK'})
    C.block(full,'DECIMATOR','SIGMA_DELTA16_FILTER',lib['SIGMA_DELTA16_FILTER']['ports'],{'CLK':'FILTER_CLK','BIT_IN':'BITSTREAM'});lib['SIGMA_DELTA16']=full
    # Differential flash thresholds are made by equal physical resistors.
    # HIGH tests VINP-VINN > (THP-VCM); LOW tests > (THN-VCM).
    sub=C.cell(['VINP','VINN','VCM','THP','THN','BIAS','HIGH','LOW']+SUPPLY)
    C.passive(sub,'R_P0','resistor','VINP','AVG_P',1000000.);C.passive(sub,'R_P1','resistor','VCM','AVG_P',1000000.)
    for tag,threshold in [('HIGH','THP'),('LOW','THN')]:
        C.passive(sub,'R_'+tag+'0','resistor','VINN','AVG_'+tag,1000000.)
        C.passive(sub,'R_'+tag+'1','resistor',threshold,'AVG_'+tag,1000000.)
        C.block(sub,tag,'ADC16_COMPARATOR',lib['ADC16_COMPARATOR']['ports'],{'INP':'AVG_P','INN':'AVG_'+tag,'OUT':tag})
    lib['PIPE16_SUBADC']=sub
    mdac=C.cell(['VIN','DAC','VCM','BIAS','SAMPLE','SAMPLEB','OUT']+SUPPLY)
    C.block(mdac,'AMP','ADC16_OTA',lib['ADC16_OTA']['ports'],{'INP':'VCM','INN':'SUM'})
    C.passive(mdac,'C_SAMPLE','capacitor','SUM','BOTTOM',2e-12)
    C.passive(mdac,'C_FEEDBACK','capacitor','SUM','OUT',1e-12)
    for name,a,b,en,enb in [('SAMPLE','VIN','BOTTOM','SAMPLE','SAMPLEB'),('HOLD','DAC','BOTTOM','SAMPLEB','SAMPLE'),('RESET_SUM','VCM','SUM','SAMPLE','SAMPLEB'),('RESET_OUT','VCM','OUT','SAMPLE','SAMPLEB')]:
        C.block(mdac,name,'SAR12_TG',lib['SAR12_TG']['ports'],{'A':a,'Y':b,'EN':en,'ENB':enb})
    lib['PIPE16_MDAC']=mdac
    stage=C.cell(['VINP','VINN','OUTP','OUTN','VCM','REFP','REFN','THP','THN','BIAS','SAMPLE','HOLD','RESET','HIGH','LOW']+SUPPLY)
    C.block(stage,'SUBADC','PIPE16_SUBADC',sub['ports'],{'HIGH':'HI_RAW','LOW':'LO_RAW'})
    for role in ('HIGH','LOW'):C.block(stage,'LATCH_'+role,'SDM8_SAMPLE_LATCH',lib['SDM8_SAMPLE_LATCH']['ports'],{'D':'HI_RAW'if role=='HIGH'else'LO_RAW','CLK':'HOLD','Q':role})
    C.block(stage,'SAMPLE_INV','INV',lib['INV']['ports'],{'A':'SAMPLE','Y':'SAMPLEB'})
    for side,first,last in [('P','REFN','REFP'),('N','REFP','REFN')]:
        C.block(stage,'DAC0_'+side,'MUX2',lib['MUX2']['ports'],{'A':first,'B':'VCM','S':'LOW','Y':'DAC0_'+side})
        C.block(stage,'DAC1_'+side,'MUX2',lib['MUX2']['ports'],{'A':'DAC0_'+side,'B':last,'S':'HIGH','Y':'DAC_'+side})
        C.block(stage,'MDAC_'+side,'PIPE16_MDAC',mdac['ports'],{'VIN':'VIN'+side,'DAC':'DAC_'+side,'OUT':'OUT'+side})
    lib['PIPE16_STAGE']=stage
    flash=C.cell(['VINP','VINN','VCM','FP','FM','BIAS','CLK','RESET','Q0','Q1','Q2']+SUPPLY)
    C.passive(flash,'R_P0','resistor','VINP','AVG_P',1000000.);C.passive(flash,'R_P1','resistor','VCM','AVG_P',1000000.)
    for n,threshold in enumerate(('FM','VCM','FP')):
        C.passive(flash,f'R_N{n}0','resistor','VINN','AVG_'+str(n),1000000.)
        C.passive(flash,f'R_N{n}1','resistor',threshold,'AVG_'+str(n),1000000.)
        C.block(flash,'CMP'+str(n),'ADC16_COMPARATOR',lib['ADC16_COMPARATOR']['ports'],{'INP':'AVG_P','INN':'AVG_'+str(n),'OUT':'RAW_Q'+str(n)})
        C.block(flash,'LATCH'+str(n),'SDM8_SAMPLE_LATCH',lib['SDM8_SAMPLE_LATCH']['ports'],{'D':'RAW_Q'+str(n),'Q':'Q'+str(n)})
    lib['PIPE16_FLASH']=flash
    ports=['VINP','VINN','VCM','REFP','REFN','THP','THN','FP','FM','BIAS','PHI1','PHI2','RESET']+[f'STAGE{i}_{p}'for i in range(14)for p in ('LOW','HIGH')]+['RESIDUEP','RESIDUEN','Q0','Q1','Q2']+SUPPLY
    analog=C.cell(ports)
    for i in range(14):C.block(analog,f'STAGE{i}','PIPE16_STAGE',stage['ports'],{
        'VINP':'VINP'if i==0 else f'R{i}P','VINN':'VINN'if i==0 else f'R{i}N',
        'OUTP':'RESIDUEP'if i==13 else f'R{i+1}P','OUTN':'RESIDUEN'if i==13 else f'R{i+1}N',
        'SAMPLE':'PHI1'if i%2==0 else'PHI2','HOLD':'PHI2'if i%2==0 else'PHI1',
        'LOW':f'STAGE{i}_LOW','HIGH':f'STAGE{i}_HIGH'})
    C.block(analog,'FLASH','PIPE16_FLASH',flash['ports'],{'VINP':'RESIDUEP','VINN':'RESIDUEN','CLK':'PHI2'});lib['PIPE16_ANALOG']=analog
    full=C.cell(ports+['CLK','SAMPLE_VALID','VALID','ERROR']+[f'CODE{i}'for i in range(16)])
    C.block(full,'ANALOG','PIPE16_ANALOG',ports,{})
    C.block(full,'ALIGN','PIPELINE16_ALIGN',lib['PIPELINE16_ALIGN']['ports'],{'FLASH_THERM0':'Q0','FLASH_THERM1':'Q1','FLASH_THERM2':'Q2',**{f'STAGE_CODES{2*i+j}':f'STAGE{i}_{["LOW","HIGH"][j]}'for i in range(14)for j in range(2)}});lib['PIPELINE_ADC16']=full
    return lib


def schematic(kind,params=None):
    lib=library(params)
    return SD.used(lib[PARTS[kind][0]],lib)


CATALOG={}
for key,(target,label,family)in PARTS.items():
    defaults=SAR_DEFAULTS if key in ('sar_adc16','sar16_analog')else SDM_DEFAULTS if key in ('sigma_delta16','sdm16_modulator')else PIPE_DEFAULTS if key in ('pipeline_adc16','pipeline16_analog')else{}
    CATALOG[key]=dict(name=label,ports=[],parameter_defaults=copy.deepcopy(defaults),analyses=['tran'],adc_family=family,output_bits=16 if defaults or key in('sar16_controller','sdm16_filter','pipeline16_align')else None,
        physical_status='not-generated',physical_supported=key in ('sar16_analog','adc16_reference','adc16_bias','adc16_ota','adc16_comparator','sar16_unit_cap','sar16_bridge','sar16_comparator','sdm16_integrator','pipeline16_subadc','pipeline16_mdac','pipeline16_stage','pipeline16_flash'),
        scope='Editable actual MOS/R/C reference. 16-bit code interface; ENOB, noise/mismatch, full-chip PEX and manufacturing signoff not established.',
        targets=['블록 계층·입출력 추적','실제 MOS transient·RTL/gate 재생','16bit 코드와 유효 해상도 분리'])


def populate_catalog():
    lib=library()
    for key,(target,_,_)in PARTS.items():CATALOG[key]['ports']=list(lib[target]['ports'])


def settings(raw):return native.testbench(raw,duration_limit_s=.02)


def recommended_settings(kind,raw):
    if kind in ('sar_adc16','sar16_analog'):
        v={**SAR_DEFAULTS,**raw};duration=len(sar_inputs(v))*(v['acquisition_s']+v['hold_s']+16*v['bit_period_s'])+v['bit_period_s']
        return settings(dict(analysis='tran',duration_s=duration,step_s=max(10e-9,duration/180000)))
    if kind in ('sigma_delta16','sdm16_modulator'):return settings(dict(analysis='tran',duration_s=(12+8*256)*1e-6,step_s=20e-9))
    if kind in ('pipeline_adc16','pipeline16_analog'):
        period=1/raw.get('clock_Hz',100000.);return settings(dict(analysis='tran',duration_s=24*period,step_s=period/200))
    return settings(dict(analysis='tran',duration_s=20e-6,step_s=2e-9))


def sar_inputs(v):
    if v['test_mode']==4:return[v['input_differential_V']]
    if v['test_mode']in(1,2):
        n=64 if v['test_mode']==1 else 256;tone=7 if n==64 else 17
        return[v['reference_V']*10**(-1/20)*math.sin(2*math.pi*tone*i/n+.37)for i in range(n)]
    return list(dict.fromkeys([v['input_differential_V'],*[v['reference_V']*(2*(i+.5)/65536-1)for i in(0,1,32767,32768,65534,65535)]]))


def execute(server,run,p,folder,manifest,params):
    import adc16_sim
    return adc16_sim.execute(server,run,p,folder,manifest,params)
