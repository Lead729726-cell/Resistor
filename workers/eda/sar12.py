"""Differential 12-bit split-CDAC SAR, with native charge and comparator decisions.

Inspired by arXiv:2610.15240v1's verification lessons, not a reproduction of its
11-bit ADC or its performance. Output width, noiseless transient accuracy,
physical parasitics and manufacturing approval are separate claims.
"""
import copy,hashlib,json,math,shutil
from pathlib import Path
import chip_references as C
import digital_units as D
import sigma_delta as SD
import sar_adc as A
import native,runtime_resources
from geometry import EDAError

HERE=Path(__file__).parent
RTL=HERE/'rtl/sar12.v';GATE=HERE/'rtl/sar12_gate.v';CMOS=HERE/'rtl/sar12_cmos.json'
SUPPLY=['VPWR','VGND'];BITS=[f'B{i}' for i in range(12)]
SUPPLY_SOURCE_R_OHM=.1
SOURCE_DELAY_S=1e-9;SOURCE_RISE_S=2e-9
DEFAULTS={'input_differential_V':1.2/4096,'reference_V':1.2,'input_common_mode_V':.9,'unit_F':200e-15,'acquisition_s':4e-6,'hold_s':50e-9,'bit_period_s':.5e-6,'test_mode':0,'static_batch':0}
PARTS={
 'sar12_switch':('SAR12_TG','CMOS 전송 게이트'),
 'sar12_reference_mux':('SAR12_REFMUX','샘플링·기준 전환'),
 'sar12_bit_mux':('SAR12_BITMUX','bit bottom-plate 스위치'),
 'sar12_unit_cap':('SAR12_UNIT','200fF 동일 단위 C'),
 'sar12_bridge':('SAR12_BRIDGE','6+6 분할 bridge C'),
 'sar12_cdac':('SAR12_CDAC','차동 6+6 분할·508 unit + 2 bridge CDAC'),
 'sar12_preamp':('SAR12_PREAMP','차동 전치 증폭기'),
 'sar12_latch':('SAR12_LATCH','대칭 동적 래치'),
 'sar12_comparator':('SAR12_COMPARATOR','2단 전치 증폭·동적 래치 비교기'),
 'sar12_analog':('SAR12_ANALOG','12bit 샘플링·CDAC·비교기 코어'),
 'sar12_controller':('SAR12_CONTROLLER','12bit 합성 제어·EVAL·CODE/VALID'),
 'sar_adc12':('SAR_ADC12','12bit SAR 통합 회로')}
CATALOG={key:dict(name='SAR12 · '+label,ports=[],parameter_defaults=copy.deepcopy(DEFAULTS) if key in ('sar_adc12','sar12_analog') else {},analyses=['tran'],physical_status='not-generated',physical_supported=key=='sar12_analog',scope='12-bit interface · differential 6+6 split CDAC · actual MOS latch decisions; external reference/VCM/control bridge; noise, mismatch and full digital timing require separate checks',targets=['12회 실제 비교기 판단','4096 code·독립 code/FFT 검사','대칭 unit 배치·배선 결합 PEX','1mm² 영역']) for key,(_,label) in PARTS.items()}

def parameters(kind,raw):
    v={**DEFAULTS,**raw}
    if not .6<=v['reference_V']<=1.2 or abs(v['input_differential_V'])>v['reference_V']:raise EDAError('SAR12_INPUT_RANGE','Differential input must lie within ±VREF, VREF=.6..1.2V.')
    if not .75<=v['input_common_mode_V']<=1.05 or not 0<=v['input_common_mode_V']-v['reference_V']/2 or v['input_common_mode_V']+v['reference_V']/2>1.8:raise EDAError('SAR12_INPUT_RANGE','Input common mode must keep both actual input pins within the 1.8V rails.')
    if v['unit_F']!=200e-15:raise EDAError('SAR12_UNIT_RANGE','This first physical adapter uses equal 200fF nominal units; no arbitrary geometry scaling.')
    if not .5e-6<=v['acquisition_s']<=20e-6 or not 100e-9<=v['bit_period_s']<=5e-6:raise EDAError('SAR12_TIMING_RANGE','Acquisition=.5..20us, bit period=.1..5us; accuracy must be measured.')
    if not 50e-9<=v['hold_s']<=1e-6:raise EDAError('SAR12_TIMING_RANGE','A 50ns..1us nonoverlap hold interval separates acquisition from the first DAC switch.')
    if v['test_mode'] not in (0,1,2,3,4):raise EDAError('SAR12_TEST_RANGE','test_mode: 0 directed, 1 coherent 64, 2 coherent 256, 3 batched static centers, 4 one actual input.')
    if int(v['static_batch'])!=v['static_batch'] or not 0<=v['static_batch']<=15:raise EDAError('SAR12_TEST_RANGE','static_batch selects one of sixteen 256-code batches; one run does not claim all 4096 codes.')
    return raw

def library():
    lib=D.make_library(1);tg=C.cell(['A','Y','EN','ENB']+SUPPLY)
    C.mos(tg,'N','nmos','A','EN','Y',8.,.15);C.mos(tg,'P','pmos','A','ENB','Y',12.,.15);lib['SAR12_TG']=tg
    mux=C.cell(['VIN','REF','SAMPLE','SAMPLEB','OUT']+SUPPLY)
    D.block(mux,lib,'SAR12_TG','ACQUIRE',{'A':'VIN','Y':'OUT','EN':'SAMPLE','ENB':'SAMPLEB'})
    D.block(mux,lib,'SAR12_TG','CONVERT',{'A':'REF','Y':'OUT','EN':'SAMPLEB','ENB':'SAMPLE'});lib['SAR12_REFMUX']=mux
    bit=C.cell(['HI','LO','BIT','OUT']+SUPPLY)
    D.block(bit,lib,'INV','INV',{'A':'BIT','Y':'BITB'})
    D.block(bit,lib,'SAR12_TG','HIGH',{'A':'HI','Y':'OUT','EN':'BIT','ENB':'BITB'})
    D.block(bit,lib,'SAR12_TG','LOW',{'A':'LO','Y':'OUT','EN':'BITB','ENB':'BIT'});lib['SAR12_BITMUX']=bit
    unit=C.cell(['TOP','BOTTOM']);C.passive(unit,'C_UNIT','capacitor','TOP','BOTTOM',DEFAULTS['unit_F']);lib['SAR12_UNIT']=unit
    bridge=C.cell(['TOP','FINE']);C.passive(bridge,'C_BRIDGE','capacitor','TOP','FINE',2*DEFAULTS['unit_F']*64/63);lib['SAR12_BRIDGE']=bridge
    dac=C.cell(['VINP','VINN','VREF','VCM','SAMPLE','TOPP','TOPN']+BITS+SUPPLY)
    D.block(dac,lib,'INV','SAMPLE_INV',{'A':'SAMPLE','Y':'SAMPLEB'})
    for side in ('P','N'):
        top='TOP'+side;fine='FINE'+side;hi='HI'+side;lo='LO'+side
        D.block(dac,lib,'SAR12_REFMUX','REF_HI'+side,{'VIN':'VIN'+side,'REF':'VREF','SAMPLE':'SAMPLE','SAMPLEB':'SAMPLEB','OUT':hi})
        D.block(dac,lib,'SAR12_REFMUX','REF_LO'+side,{'VIN':'VIN'+side,'REF':'VGND','SAMPLE':'SAMPLE','SAMPLEB':'SAMPLEB','OUT':lo})
        for node in (top,fine):D.block(dac,lib,'SAR12_TG','RESET_'+node,{'A':'VCM','Y':node,'EN':'SAMPLE','ENB':'SAMPLEB'})
        D.block(dac,lib,'SAR12_BRIDGE','BRIDGE'+side,{'TOP':top,'FINE':fine})
        for bank in ('COARSE','FINE'):
            positive=top if bank=='COARSE' else fine
            for bit_index in range(6):
                b=bit_index+(6 if bank=='COARSE' else 0);bottom=f'{side}_{bank}_B{bit_index}'
                D.block(dac,lib,'SAR12_BITMUX',bottom+'_SW',{'HI':hi if side=='P' else lo,'LO':lo if side=='P' else hi,'BIT':BITS[b],'OUT':bottom})
                for i in range(2<<bit_index):D.block(dac,lib,'SAR12_UNIT',f'{side}_{bank}_B{bit_index}_U{i}',{'TOP':positive,'BOTTOM':bottom})
            if bank=='FINE':
                for i in range(2):D.block(dac,lib,'SAR12_UNIT',f'{side}_{bank}_DUMMY_U{i}',{'TOP':positive,'BOTTOM':lo if side=='P' else hi})
        # Main bank has 126 physical units; the bridge contributes the missing
        # two-unit equivalent. No extra coarse dummy is silently inserted.
    lib['SAR12_CDAC']=dac
    comp=C.cell(['INP','INN','EVAL','OUTP','OUTN']+SUPPLY)
    C.mos(comp,'TAIL','nmos','TAIL','EVAL','VGND',20.,.15)
    for i,role in enumerate(('A','B','B','A')):
        C.mos(comp,'INPUT'+str(i),'nmos','FN' if role=='A' else 'FP','INP' if role=='A' else 'INN','TAIL',10.,.5)
        comp['devices'][-1].update(matching_group='input-pair',matching_role=role)
    for out,other,internal in [('QP','QN','FN'),('QN','QP','FP')]:
        C.mos(comp,'LN_'+out,'nmos',out,other,internal,8.,.15)
        C.mos(comp,'LP_'+out,'pmos',out,other,'VPWR',4.,.15)
        C.mos(comp,'RESET_'+out,'pmos',out,'EVAL','VPWR',4.,.15)
        C.mos(comp,'PRE_'+internal,'pmos',internal,'EVAL','VPWR',2.,.15)
    for q,out in [('QP','OUTN'),('QN','OUTP')]:
        D.block(comp,lib,'INV','BUF0_'+out,{'A':q,'Y':out+'_B'})
        D.block(comp,lib,'INV','BUF1_'+out,{'A':out+'_B','Y':out})
    lib['SAR12_LATCH']=comp
    pre=C.cell(['INP','INN','BIAS','OUTP','OUTN']+SUPPLY)
    C.mos(pre,'TAIL','nmos','TAIL','BIAS','VGND',4.,1.)
    for i,role in enumerate(('A','B','B','A')):
        C.mos(pre,'INPUT'+str(i),'nmos','OUTN' if role=='A' else 'OUTP','INP' if role=='A' else 'INN','TAIL',10.,1.)
        pre['devices'][-1].update(matching_group='input-pair',matching_role=role)
    for out in ('OUTP','OUTN'):C.passive(pre,'LOAD_'+out,'resistor','VPWR',out,100000.)
    lib['SAR12_PREAMP']=pre
    comp=C.cell(['INP','INN','EVAL','OUTP','OUTN']+SUPPLY)
    C.passive(comp,'BIAS_RES','resistor','VPWR','BIAS',100000.)
    C.mos(comp,'BIAS_DIODE','nmos','BIAS','BIAS','VGND',4.,1.)
    D.block(comp,lib,'SAR12_PREAMP','PRE0',{'INP':'INP','INN':'INN','BIAS':'BIAS','OUTP':'PRE0P','OUTN':'PRE0N'})
    D.block(comp,lib,'SAR12_PREAMP','PRE1',{'INP':'PRE0P','INN':'PRE0N','BIAS':'BIAS','OUTP':'PRE1P','OUTN':'PRE1N'})
    for n in ('PRE1P','PRE1N'):C.passive(comp,'LOAD_'+n,'capacitor',n,'VGND',500e-15)
    D.block(comp,lib,'SAR12_LATCH','LATCH',{'INP':'PRE1P','INN':'PRE1N','EVAL':'EVAL','OUTP':'OUTP','OUTN':'OUTN'});lib['SAR12_COMPARATOR']=comp
    core=C.cell(['VINP','VINN','VREF','VCM','SAMPLE','EVAL','TOPP','TOPN','COMP','COMPN']+BITS+SUPPLY)
    D.block(core,lib,'SAR12_CDAC','DAC',{n:n for n in lib['SAR12_CDAC']['ports'] if n not in SUPPLY})
    D.block(core,lib,'SAR12_COMPARATOR','COMPARE',{'INP':'TOPN','INN':'TOPP','EVAL':'EVAL','OUTP':'COMP','OUTN':'COMPN'});lib['SAR12_ANALOG']=core
    payload=json.loads(CMOS.read_text());
    if payload['rtl_sha256']!=hashlib.sha256(RTL.read_bytes()).hexdigest() or payload['gate_rtl_sha256']!=hashlib.sha256(GATE.read_bytes()).hexdigest():raise EDAError('SAR12_SOURCE_MISMATCH','Re-synthesize the changed 12-bit RTL before creating a controller.')
    control=copy.deepcopy(payload['schematic']);lib.update(control.pop('cells'));lib['SAR12_CONTROLLER']=control
    full=C.cell(['VINP','VINN','VREF','VCM','CLK','RESET','START','TOPP','TOPN','COMP','COMPN','SAMPLE','EVAL','BUSY','VALID']+[f'CODE{i}' for i in range(12)]+SUPPLY)
    D.block(full,lib,'SAR12_ANALOG','ANALOG',{n:n for n in core['ports'] if n not in SUPPLY})
    D.block(full,lib,'SAR12_CONTROLLER','CONTROL',{'CLK':'CLK','RESET':'RESET','START':'START','COMPARATOR':'COMP','SAMPLE':'SAMPLE','EVAL':'EVAL','BUSY':'BUSY','VALID':'VALID',**{f'TRIAL{i}':BITS[i] for i in range(12)},**{f'CODE{i}':f'CODE{i}' for i in range(12)}});lib['SAR_ADC12']=full
    return lib

def schematic(kind,params=None):
    lib=library();return SD.used(lib[PARTS[kind][0]],lib)
def populate_catalog():
    lib=library()
    for kind,row in CATALOG.items():row['ports']=lib[PARTS[kind][0]]['ports']
def inputs(v):
    ref=v['reference_V'];mode=v['test_mode']
    if mode==4:return [v['input_differential_V']]
    if mode in (1,2):
        n=64 if mode==1 else 256;tone=7 if mode==1 else 17
        return [ref*10**(-1/20)*math.sin(2*math.pi*tone*i/n+.37) for i in range(n)]
    start=int(v['static_batch'])*256
    codes=range(start,start+256) if mode==3 else (0,1,31,63,64,65,1023,2047,2048,2049,3072,4031,4094,4095)
    return list(dict.fromkeys([v['input_differential_V'],*[ref*(2*(i+.5)/4096-1) for i in codes]]))
def settings(raw):return native.testbench(raw,duration_limit_s=.1)
def recommended_settings(raw):
    v={**DEFAULTS,**raw};end=len(inputs(v))*(v['acquisition_s']+v['hold_s']+12*v['bit_period_s'])+v['bit_period_s']
    return settings(dict(analysis='tran',duration_s=end,step_s=max(10e-9,end/180000)))

def control_testbench(p,folder,deck,netlist,sub,post_layout=False):
    v={**DEFAULTS,**p['design_template']['parameters']};parameters('sar12_analog',v)
    s=p['testbench']['supply_V'];period=v['bit_period_s'];acq=v['acquisition_s'];values=inputs(v);end=p['testbench']['duration_s'];step=p['testbench']['step_s'];cm=v['input_common_mode_V']
    if end+1e-12<len(values)*(acq+v['hold_s']+12*period)+period or step>min(acq,period)/10:raise EDAError('SAR12_TIMING_RANGE','Resolve every acquisition/decision interval with ten or more steps and retain the full sequence.')
    if s<1.6 or cm+v['reference_V']/2>s:raise EDAError('SAR12_SUPPLY_RANGE','This adapter needs 1.6..1.8V and rail-valid differential input common mode.')
    reset_cm=cm+(s-v['reference_V'])/2
    if not 0<=reset_cm<=s:raise EDAError('SAR12_COMMON_MODE','Reset common mode must remain within actual rails.')
    drivers=[]
    for node,initial in [('SAMPLE',s),('EVAL',0),*[(b,0) for b in BITS]]:drivers += [f'VD_{node} DRV_{node} VGND {initial:.12g}',f'RD_{node} DRV_{node} {node} 2000',f'CD_{node} {node} VGND 2p']
    names=['VINP','VINN','SAMPLE','EVAL','TOPP','TOPN','COMP','COMPN']
    lines=['Differential twelve-bit SAR with actual retained charge and dynamic MOS latch',f'.include "{deck}"','.option sparse scale=1e-6 method=gear maxord=2 reltol=1e-5 vntol=1e-6 abstol=1e-12 chgtol=1e-16',f'.include "{netlist}"',f'.temp {p["testbench"]["temperature_C"]}','VGND VGND 0 0',f'VDD VPWR VGND {s:.12g}',f'VINP VINP VGND {cm+values[0]/2:.12g}',f'VINN VINN VGND {cm-values[0]/2:.12g}',f'VREF VREF VGND {v["reference_V"]:.12g}',f'VCM VCM VGND {reset_cm:.12g}',*drivers,'XU '+' '.join(sub)+' '+p['cell'],f'.tran {step:.12g} {end:.12g} 0 {step:.12g}', '.control','set num_threads=1','set numdgt=17','set wr_singlescale','set wr_vecnames','save '+' '.join('v('+n+')' for n in names+BITS)+' i(VDD) i(VREF)','echo frame bit trial comp compn topp topn vin decision > decisions.csv']
    # Finite off-macro reference/common-mode drive prevents an unphysical
    # zero-impedance displacement-current impulse at a switch transition.
    idx=next(i for i,line in enumerate(lines) if line.startswith('VCM '));lines[idx:idx+1]=[f'VCM VCM_DRV VGND {reset_cm:.12g}','RVCM VCM_DRV VCM 10','CVCM VCM VGND 100p']
    idx=next(i for i,line in enumerate(lines) if line.startswith('VREF '));lines[idx:idx+1]=[f'VREF VREF_DRV VGND {v["reference_V"]:.12g}','RREF VREF_DRV VREF 2','CREF VREF VGND 1n']
    # Preserve the same finite off-macro input source in pre and post runs.
    # An ideal voltage source directly on the distributed pin capacitance can
    # make a resumed RC-extracted deck singular at a switching boundary.
    for pin in ('VINP','VINN'):
        idx=next(i for i,line in enumerate(lines) if line.startswith(pin+' '));lines[idx]=lines[idx].replace(pin+' '+pin+' ',pin+' '+pin+'_DRV ',1);lines.insert(idx+1,f'R_{pin} {pin}_DRV {pin} 50')
    # A finite off-macro supply impedance also isolates the ideal source's
    # branch equation from the stiff distributed PEX capacitances. Preserve
    # the extracted DUT and all tolerances; use the same source pre/post.
    idx=next(i for i,line in enumerate(lines) if line.startswith('VDD '))
    lines[idx:idx+1]=[f'VDD VDD_DRV VGND {s:.12g}',f'RVDD VDD_DRV VPWR {SUPPLY_SOURCE_R_OHM:.12g}']
    idx=next(i for i,line in enumerate(lines) if line.startswith('save '));lines[idx]+=' v(VPWR)'
    sources={'VINP','VINN','VD_SAMPLE','VD_EVAL',*('VD_'+b for b in BITS)}
    for i,line in enumerate(lines):
        f=line.split()
        if f and f[0] in sources:lines[i]=' '.join(f[:3])+f' PWL(0 {f[3]} {end:.15g} {f[3]})'
    time=0.;first=True
    def drive(source,value):
        # Altering DC at a paused transient silently introduces a discontinuity
        # into the accepted integration history. Schedule a continuous ramp
        # strictly after the pause instead; capacitor state is never restarted.
        lines.extend([f'let sar12_previous = @{source}[pwl]','let sar12_stimulus = vector(8)',
            'let sar12_stimulus[0] = 0','let sar12_stimulus[1] = sar12_previous[length(sar12_previous)-1]',
            f'let sar12_stimulus[2] = {time+SOURCE_DELAY_S:.15g}','let sar12_stimulus[3] = sar12_stimulus[1]',
            f'let sar12_stimulus[4] = {time+SOURCE_DELAY_S+SOURCE_RISE_S:.15g}',f'let sar12_stimulus[5] = {value}',
            f'let sar12_stimulus[6] = {end:.15g}','let sar12_stimulus[7] = sar12_stimulus[5]',f'alter @{source}[pwl] = sar12_stimulus'])
    # Register every exact breakpoint before the one continuous transient.
    # Dynamic relational stops in ngspice 42 can fire on a rejected trial step
    # (even with an isolated PWL marker), so they cannot define sample times.
    stops=[];t=0.
    for _ in values:
        t+=acq;stops.append(t);t+=v['hold_s'];stops.append(t)
        for _ in range(12):t+=period*.65;stops.append(t);t+=period*.35;stops.append(t)
    def pause(target):
        nonlocal first
        if first:lines.extend(f'stop when time = {stop:.15g}' for stop in stops)
        if first:lines.extend(['echo actual_pause_time_s > pause-times.txt','run'])
        else:lines.append('resume')
        lines.extend(['let sar12_k = length(time)-1',f'if abs(time[sar12_k] - {target:.15g}) > 1e-12','print time[sar12_k]',f'echo expected_pause_time_s {target:.15g}','echo SAR12_PAUSE_FAILED','quit 1','end','print time[sar12_k] >> pause-times.txt'])
        first=False
    for frame,vin in enumerate(values):
        for source,value in [('VINP',f'{cm+vin/2:.12g}'),('VINN',f'{cm-vin/2:.12g}'),('VD_SAMPLE',f'{s:.12g}'),('VD_EVAL','0'),*[('VD_B'+str(i),'0')for i in range(12)]]:drive(source,value)
        lines.append('let sar12_code = 0')
        time+=acq;pause(time);drive('VD_SAMPLE','0');time+=v['hold_s'];pause(time)
        for bit in reversed(range(12)):
            drive('VD_EVAL','0');lines.append(f'let sar12_trial = sar12_code + {1<<bit}')
            for i in range(12):
                lines.append(f'let sar12_drive = (floor(sar12_trial / {1<<i}) - 2*floor(sar12_trial / {1<<(i+1)}))*{s:.12g}');drive('VD_B'+str(i),'sar12_drive')
            time+=period*.65;pause(time);drive('VD_EVAL',f'{s:.12g}');time+=period*.35;pause(time)
            lines += ['let sar12_k = length(time)-1','let sar12_cmp = v(COMP)[sar12_k]','let sar12_cmpn = v(COMPN)[sar12_k]','let sar12_p = v(TOPP)[sar12_k]','let sar12_n = v(TOPN)[sar12_k]','let sar12_decision = 0',f'if sar12_cmp >= {s/2:.12g}','let sar12_code = sar12_trial','let sar12_decision = 1','end',f'echo {frame} {bit} $&sar12_trial $&sar12_cmp $&sar12_cmpn $&sar12_p $&sar12_n {vin:.15g} $&sar12_decision >> decisions.csv']
        drive('VD_EVAL','0')
    lines+=['resume','let supply_current = -i(VDD)','let reference_current = -i(VREF)','wrdata waveform.dat '+' '.join('v('+n+')' for n in names)+' supply_current reference_current '+' '.join('v('+n+')' for n in BITS)+' v(VPWR)','echo SAR12_NATIVE_COMPLETE','quit','.endc','.end']
    target=Path(folder)/'testbench.spice';target.write_text('\n'.join(lines)+'\n');return target,values

def parse_decisions(file,values,supply,reference):
    rows=[]
    for line in Path(file).read_text().splitlines()[1:]:
        try:r=[float(v) for v in line.split()]
        except ValueError:raise EDAError('SAR12_PARSER_FAILED','Decision trace has non-numeric fields.')
        if len(r)!=9 or any(not math.isfinite(v) for v in r):raise EDAError('SAR12_PARSER_FAILED','Decision trace requires nine finite columns.')
        rows.append(r)
    if len(rows)!=12*len(values):raise EDAError('SAR12_INCOMPLETE','Every input needs twelve actual comparison records.')
    frames=[];ambiguous=0
    for f,vin in enumerate(values):
        code=0
        for bit,r in zip(reversed(range(12)),rows[12*f:12*f+12]):
            frame,b,trial,cmp,cmpn,tp,tn,v,decision=r
            if (frame,b,trial)!=(f,bit,code+(1<<bit)) or abs(v-vin)>1e-10 or decision not in (0.,1.) or decision!=int(cmp>=supply/2):raise EDAError('SAR12_SEQUENCE_FAILED','Read the actual comparator output; do not substitute an ideal VIN quantizer or a different bit sequence.')
            ambiguous+=int(not((cmp>.7*supply and cmpn<.3*supply)or(cmp<.3*supply and cmpn>.7*supply)))
            if decision:code=int(trial)
        expected=min(4095,max(0,math.floor((vin/reference+1)*2048)))
        frames.append(dict(frame=f,input_differential_V=vin,code=code,expected_code=expected,error_codes=code-expected))
    return rows,frames,ambiguous

def controller_ir_verilog():
    ir=schematic('sar12_controller');leaves={'INV':'assign Y=~A;','NAND2':'assign Y=~(A0&A1);','NOR2':'assign Y=~(A|B);','AND2':'assign Y=A&B;','OR2':'assign Y=A|B;','MUX2':'assign Y=S?B:A;','DFF':'always @(posedge CLK) Q<=D;'};lines=[]
    for name,cell in {**ir['cells'],'IR_CONTROLLER':{k:v for k,v in ir.items() if k!='cells'}}.items():
        ports=cell['ports'];outputs=[p for p in ports if p in ('Y','Q','SAMPLE','EVAL','BUSY','VALID') or p.startswith(('TRIAL','CODE'))];inputs_=[p for p in ports if p not in outputs]
        lines+=['module '+name+'('+','.join(ports)+');','input '+','.join(inputs_)+';',('output reg ' if name=='DFF' else 'output ')+','.join(outputs)+';']
        if name in leaves:lines.append(leaves[name])
        else:
            nets=sorted({n for d in cell['devices'] for n in d['pins'].values()}-set(ports))
            if nets:lines.append('wire '+','.join(nets)+';')
            for d in cell['devices']:
                if d['kind']!='block':raise EDAError('SAR12_IR_REPLAY','An edited CMOS leaf requires a new independent logic adapter.')
                lines.append(d['cell_name']+' IR_INSTANCE_'+d['name']+'('+','.join('.'+p+'('+n+')' for p,n in d['pins'].items())+');')
        lines.append('endmodule')
    lines += ['module sar12_controller(input clk,reset,start,comparator,output sample,eval,busy,valid,output [11:0] trial,code);','IR_CONTROLLER x(.CLK(clk),.RESET(reset),.START(start),.COMPARATOR(comparator),.SAMPLE(sample),.EVAL(eval),.BUSY(busy),.VALID(valid),'+','.join(f'.TRIAL{i}(trial[{i}]),.CODE{i}(code[{i}])' for i in range(12))+',.VPWR(1\'b1),.VGND(1\'b0));','endmodule'];return '\n'.join(lines)+'\n'

def replay(server,run,folder,manifest,rows,frames):
    (folder/'decisions.mem').write_text('\n'.join(str(int(r[8])) for r in rows)+'\n')
    tb='''module replay;
 reg clk=0,reset=1,start=0,comparator=0;wire sample,eval,busy,valid;wire [11:0] trial,code;
 reg decisions[0:COUNT-1];integer f,b,out;
 sar12_controller dut(clk,reset,start,comparator,sample,eval,busy,valid,trial,code);
 task tick;begin #5;clk=1;#5;clk=0;end endtask
 initial begin $readmemb("decisions.mem",decisions);out=$fopen("replay.csv","w");tick;reset=0;
 for(f=0;f<FRAMES;f=f+1)begin start=1;tick;start=0;
 $fwrite(out,"%0d acquire %0d %0d %0d %0d\\n",f,sample,eval,busy,valid);tick;
 for(b=11;b>=0;b=b-1)begin $fwrite(out,"%0d %0d %0d %0d ",f,b,trial,eval);tick;
 $fwrite(out,"%0d ",eval);comparator=decisions[f*12+11-b];tick;
 $fwrite(out,"%0d %0d %0d %0d\\n",code,valid,busy,eval);end
 tick;end $fclose(out);$finish;end endmodule'''.replace('COUNT',str(len(rows))).replace('FRAMES',str(len(frames)))
    (folder/'replay.v').write_text(tb+'\n');(folder/'ir-controller.v').write_text(controller_ir_verilog());outputs=[]
    for name,sources in [('rtl',[RTL]),('gate',[runtime_resources.yosys_simcells(),GATE]),('ir',[folder/'ir-controller.v'])]:
        server.process(run,folder,['iverilog','-g2012','-s','replay','-o',str(folder/f'{name}.vvp'),*map(str,sources),str(folder/'replay.v')],name+'-compile',manifest)
        server.process(run,folder,['vvp',str(folder/f'{name}.vvp')],name+'-replay',manifest)
        target=folder/f'{name}-replay.csv';shutil.move(folder/'replay.csv',target);outputs.append(target.read_text().splitlines());run['artifacts'][name+'_replay']=str(target)
    matched=outputs[0]==outputs[1]==outputs[2]
    for f,frame in enumerate(frames):
        chunk=outputs[0][13*f:13*f+13];matched &=len(chunk)==13 and chunk[0]==f'{f} acquire 1 0 1 0'
        for b,line in zip(reversed(range(12)),chunk[1:]):
            fields=line.split();actual=rows[12*f+11-b];previous=frames[f-1]['code'] if f else 0
            matched &=len(fields)==9 and [int(x) for x in fields]==[f,b,int(actual[2]),0,1,frame['code'] if b==0 else previous,int(b==0),int(b!=0),0]
    return matched

def execute(server,run,p,folder,manifest,params):
    kind=p['design_template']['id'];original=p
    if kind=='sar_adc12':
        if SD.electrical(p['schematic'])!=SD.electrical(schematic(kind)) or any(SD.electrical(c)!=SD.electrical(schematic(kind)['cells'].get(n,{'devices':[]})) for n,c in p['schematic']['cells'].items()):raise EDAError('SAR12_RTL_MISMATCH','An edited full ADC must be re-synthesized; no different unedited analog DUT is substituted.')
        if params.get('post_layout'):raise EDAError('SAR12_FULL_PEX_UNSUPPORTED','Full digital-controller mask/timing extraction is separate from the analog core.')
        ir=schematic('sar12_analog');p={**copy.deepcopy(p),'cell':'sar12_analog','schematic':ir,'ports':ir['ports']}
    elif kind!='sar12_analog':raise EDAError('SAR12_BLOCK_TEST_REQUIRED','Open the analog core for whole conversion; standalone block stimulus is not silently substituted.')
    config=settings({**p['testbench'],**{k:params[k] for k in native.TESTBENCH if k in params}});p={**p,'testbench':config}
    v={**DEFAULTS,**p['design_template']['parameters']}
    if config['analysis']!='tran':raise EDAError('SAR12_ANALYSIS','Twelve actual retained-charge decisions require transient analysis.')
    if params.get('post_layout'):
        netlist=server.extract(run,p,folder,manifest,pex=True)
        import pex_reduce
        netlist,audit,reduction=pex_reduce.prepare(p,netlist,folder);run['artifacts'].update(pex_reduced_netlist=str(netlist),pex_reduction=str(audit));manifest['settings']['pex_exact_reduction']=reduction
    else:netlist=folder/'analog.spice';netlist.write_text(native.emit(p['schematic'],p['cell'],p['ports']))
    sub=A.subcircuit_ports(Path(netlist).read_text(),p['cell'])
    if sub is None or set(sub)!=set(p['ports']) or len(sub)!=len(p['ports']):raise EDAError('PORT_MISMATCH','Actual SAR12 netlist ports differ.')
    deck=server.design_tools.supported_model_deck(folder,config['corner']);tb,values=control_testbench(p,folder,deck,netlist,sub,post_layout=bool(params.get('post_layout')))
    manifest['settings']['sar12_external_control']={'R_Ohm':2000,'C_F':2e-12,'input_source_R_Ohm_each':50,'supply_source_R_Ohm':SUPPLY_SOURCE_R_OHM,'source_transition':'continuous PWL, same pre/post','source_update_delay_s':SOURCE_DELAY_S,'source_rise_fall_s':SOURCE_RISE_S,'reference_R_Ohm':2,'reference_decoupling_F':1e-9,'common_mode_R_Ohm':10,'common_mode_decoupling_F':100e-12,'reset_common_mode_V':v['input_common_mode_V']+(config['supply_V']-v['reference_V'])/2,'digital_delay':'external bridge only; transistor controller delay not simulated'}
    manifest['settings']['sar12_matrix_solver']='Sparse 1.3; identical accuracy tolerances pre/post'
    log=server.process(run,folder,['ngspice','-b',str(tb)],'ngspice',manifest,timeout=1800 if params.get('post_layout') else 900)
    if 'SAR12_NATIVE_COMPLETE' not in log or any(x in log.lower() for x in ('fatal error','timestep too small','unknown subckt','singular matrix','error on line','error:','warning: upper limit','warning: lower limit')):raise EDAError('SIMULATION_FAILED','Actual SAR12 native transient failed; original log retained.')
    rows,frames,ambiguous=parse_decisions(folder/'decisions.csv',values,config['supply_V'],v['reference_V']);matched=replay(server,run,folder,manifest,rows,frames)
    # Verify the complete pause schedule separately from the control script's
    # in-simulator checks; neither a restarted plot nor a missed pause can pass.
    pauses=[float(line.split('=')[-1])for line in (folder/'pause-times.txt').read_text().splitlines() if '=' in line]
    if len(pauses)!=26*len(values) or any(not math.isfinite(t) for t in pauses):raise EDAError('SAR12_TIME_MISMATCH','An actual acquisition/decision pause is missing or non-finite.')
    frame_period=v['acquisition_s']+v['hold_s']+12*v['bit_period_s']
    for f in range(len(values)):
        expected=[f*frame_period+v['acquisition_s'],f*frame_period+v['acquisition_s']+v['hold_s']]
        for b in range(12):expected.extend([expected[1]+(b+.65)*v['bit_period_s'],expected[1]+(b+1)*v['bit_period_s']])
        if any(abs(a-b)>1e-12 for a,b in zip(pauses[26*f:26*f+26],expected)):raise EDAError('SAR12_TIME_MISMATCH','Actual comparison time differs from the declared continuous sequence.')
    import sar12_metrics
    selected,trace=sar12_metrics.display_trace(folder/'waveform.dat',24,power_sources={9:config['supply_V'],10:v['reference_V']})
    names=['VINP','VINN','SAMPLE','EVAL','TOPP','TOPN','COMP','COMPN','supply_current','reference_current']+BITS+['VPWR']
    # Bound RPC size. Keep actual extrema on a shared axis, never synthesize a
    # waveform; full raw samples remain the authoritative downloadable artifact.
    period=v['acquisition_s']+v['hold_s']+12*v['bit_period_s'];run['waveforms']=[dict(name=n,unit='A' if n.endswith('current') else 'V',x=[r[0] for r in selected],y=[r[i+1] for r in selected]) for i,n in enumerate(names)]+[dict(name='CODE',unit='code',x=[(f['frame']+1)*period for f in frames],y=[f['code'] for f in frames])]
    checks=[dict(name='Actual comparator trials match RTL, synthesized gates and editable CMOS logic',pass_=matched),dict(name='Both comparator outputs reach complementary logic levels',pass_=ambiguous==0),dict(name='Native directed codes within one nominal 12-bit LSB',pass_=all(abs(f['error_codes'])<=1 for f in frames))]
    checks=[{'name':c['name'],'pass':c['pass_'],'observed':None} for c in checks];passed=all(c['pass'] for c in checks)
    report=dict(schema_version=1,kind=kind,source='continuous ngspice MOS/charge decisions and independent RTL/gate/IR replay',pass_=passed,checks=checks,frames=frames,ambiguous_decisions=ambiguous,scope='Noiseless deterministic transient; external finite-impedance supply, input, VREF/VCM and RC control bridge. Full digital transistor timing, mismatch, calibrated accuracy and foundry signoff are not established.')
    report['pass']=report.pop('pass_');target=folder/'sar12-verification.json';target.write_text(json.dumps(report,indent=2)+'\n')
    run.update(tool='ngspice + Icarus Verilog',reference_verification=report,analysis_result='pass' if passed else 'fail',message='Actual twelve-bit split-CDAC/latch decisions and RTL/gate/IR replay completed.')
    run.setdefault('measurements',{}).update(analysis='tran',matrix_solver='Sparse 1.3',x_unit='s',x_label='time',output_bits=12,frames=len(frames),max_code_error=max(abs(f['error_codes']) for f in frames),ambiguous_decisions=ambiguous,rtl_gate_replay_match=matched,lsb_V=2*v['reference_V']/4096,conversion_s=period,sample_rate_Hz=1/period,effective_resolution='not measured',physical_unit_count=508,scope=report['scope'])
    run['measurements'].update(trace)
    run['measurements'].update(core_supply_min_V=min(r[-1] for r in selected),core_supply_max_V=max(r[-1] for r in selected),supply_source_R_Ohm=SUPPLY_SOURCE_R_OHM)
    run['measurements']['source_energy_scope']='All raw VDD/VREF source samples, including their external series-resistor losses. External control-driver energy and synthesized-controller power are not measured.'
    if v['test_mode'] in (1,2):
        import sar12_metrics
        spectrum=sar12_metrics.coherent_spectrum([f['code'] for f in frames],1/period,7 if v['test_mode']==1 else 17)
        (folder/'spectrum.json').write_text(json.dumps(spectrum,indent=2)+'\n');run['artifacts']['spectrum']=str(folder/'spectrum.json')
        run['measurements'].update({k:spectrum[k] for k in ('SNDR_dB','SFDR_dB','ENOB_noiseless_bits')});run['measurements']['effective_resolution']='measured from deterministic raw codes; noise/mismatch/jitter excluded'
    if params.get('post_layout'):
        import sar12_metrics
        audit=sar12_metrics.coupling_audit(Path(netlist).read_text());(folder/'coupling-audit.json').write_text(json.dumps(audit,indent=2)+'\n');run['artifacts']['coupling_audit']=str(folder/'coupling-audit.json')
    run['artifacts'].update(testbench=str(tb),native_decisions=str(folder/'decisions.csv'),waveform_data=str(folder/'waveform.dat'),sar12_verification=str(target))
    manifest['settings'].update(sar12_architecture='differential 6+6 split CDAC, 200fF unit pairs, dynamic reset/evaluate comparator',sar12_reference_paper='https://arxiv.org/abs/2610.15240v1',sar12_scope=report['scope'])
