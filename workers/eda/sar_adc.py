import runtime_resources
"""Editable charge-redistribution SAR; real capacitor/MOS transient decisions.

The ngspice continuation bridge retains charge between all bit decisions. RTL
and synthesized-gate replay must reproduce those decisions. This is mixed
simulation, not a claim of transistor-level controller timing or eight ENOB.
"""
import copy, hashlib, json, math, re, shutil
from pathlib import Path
import chip_references as C
import digital_units as D
import sigma_delta as SD
import native
from geometry import EDAError

HERE=Path(__file__).parent
RTL=HERE/'rtl/sar8.v';GATE=HERE/'rtl/sar8_gate.v';CMOS=HERE/'rtl/sar8_cmos.json'
SUPPLY=['VPWR','VGND'];BITS=[f'B{i}' for i in range(8)]
DEFAULTS={'input_V':.6,'reference_V':1.2,'acquisition_s':2e-6,'bit_period_s':2e-6,'sweep_codes':0}
SETTINGS={'analysis':'tran','duration_s':220e-6,'step_s':20e-9}
PARTS={
 'sar8_switch':('SAR8_TG','CMOS 전송 스위치'),
 'sar8_bottom_switch':('SAR8_BOTTOM','VIN / 기준 / GND bottom-plate 선택'),
 'sar8_unit_cap':('SAR8_UNIT','동일한 400fF 단위 커패시터'),
 'sar8_cdac':('SAR8_CDAC','128:64:32:16:8:4:2:1 + dummy CDAC'),
 'sar8_comparator':('SAR8_COMPARATOR','차동 비교기 · 실제 CMOS 출력'),
 'sar8_analog':('SAR8_ANALOG','샘플링 + CDAC + 비교기 코어'),
 'sar8_controller':('SAR8_CONTROLLER','합성 SAR 제어·code/valid 레지스터'),
 'sar_adc8':('SAR_ADC8','8비트 SAR · 전체 계층')}

def library():
    lib=D.make_library(1)
    tg=C.cell(['A','Y','EN','ENB']+SUPPLY)
    C.mos(tg,'N','nmos','Y','EN','A',4,.15);C.mos(tg,'P','pmos','Y','ENB','A',8,.15);lib['SAR8_TG']=tg
    bottom=C.cell(['VIN','VREF','BIT','SAMPLE','SAMPLEB','OUT']+SUPPLY)
    D.block(bottom,lib,'INV','BIT_INV',{'A':'BIT','Y':'BITB'})
    D.block(bottom,lib,'SAR8_TG','HIGH',{'A':'VREF','Y':'REFSEL','EN':'BIT','ENB':'BITB'})
    D.block(bottom,lib,'SAR8_TG','LOW',{'A':'VGND','Y':'REFSEL','EN':'BITB','ENB':'BIT'})
    D.block(bottom,lib,'SAR8_TG','ACQUIRE',{'A':'VIN','Y':'OUT','EN':'SAMPLE','ENB':'SAMPLEB'})
    D.block(bottom,lib,'SAR8_TG','CONVERT',{'A':'REFSEL','Y':'OUT','EN':'SAMPLEB','ENB':'SAMPLE'})
    lib['SAR8_BOTTOM']=bottom
    unit=C.cell(['TOP','BOTTOM']);C.passive(unit,'C_UNIT','capacitor','TOP','BOTTOM',400e-15);lib['SAR8_UNIT']=unit
    cdac=C.cell(['VIN','VREF','VCM','SAMPLE','TOP']+BITS+SUPPLY)
    D.block(cdac,lib,'INV','SAMPLE_INV',{'A':'SAMPLE','Y':'SAMPLEB'})
    D.block(cdac,lib,'SAR8_TG','TOP_RESET',{'A':'VCM','Y':'TOP','EN':'SAMPLE','ENB':'SAMPLEB'})
    for bit in range(8):
        D.block(cdac,lib,'SAR8_BOTTOM','BIT'+str(bit),{'VIN':'VIN','VREF':'VREF','BIT':'B'+str(bit),'SAMPLE':'SAMPLE','SAMPLEB':'SAMPLEB','OUT':'BOTTOM'+str(bit)})
        for index in range(1<<bit):D.block(cdac,lib,'SAR8_UNIT',f'C{bit}_{index}',{'TOP':'TOP','BOTTOM':'BOTTOM'+str(bit)})
    D.block(cdac,lib,'SAR8_BOTTOM','DUMMY_SWITCH',{'VIN':'VIN','VREF':'VREF','BIT':'VGND','SAMPLE':'SAMPLE','SAMPLEB':'SAMPLEB','OUT':'DUMMY'})
    D.block(cdac,lib,'SAR8_UNIT','DUMMY_CAP',{'TOP':'TOP','BOTTOM':'DUMMY'});lib['SAR8_CDAC']=cdac
    comp=C.schematic('chip_comparator',{'input_width_um':10});lib.update(comp.pop('cells'));comp['devices']=[d for d in comp['devices'] if d['kind']!='port']
    # A 7-MOS comparator can leave its output near a receiver threshold at a
    # code boundary. Two real CMOS stages restore logic levels and fan-out;
    # their delay/offset remain in native pre/post simulation, never clamped.
    for d in comp['devices']:
        if d['name'] in ('P_OUT','N_OUT'):d['pins']['D']='DECISION_RAW'
    D.block(comp,lib,'INV','RESTORE0',{'A':'DECISION_RAW','Y':'DECISION_B'})
    D.block(comp,lib,'INV','RESTORE1',{'A':'DECISION_B','Y':'OUT'});lib['SAR8_COMPARATOR']=comp
    core=C.cell(['VIN','VREF','VCM','BIAS','SAMPLE','TOP','COMP']+BITS+SUPPLY)
    D.block(core,lib,'SAR8_CDAC','DAC',{'VIN':'VIN','VREF':'VREF','VCM':'VCM','SAMPLE':'SAMPLE','TOP':'TOP',**{n:n for n in BITS}})
    D.block(core,lib,'SAR8_COMPARATOR','COMPARE',{'INP':'VCM','INN':'TOP','BIAS':'BIAS','OUT':'COMP'});lib['SAR8_ANALOG']=core
    payload=json.loads(CMOS.read_text())
    if payload['rtl_sha256']!=hashlib.sha256(RTL.read_bytes()).hexdigest() or payload['gate_rtl_sha256']!=hashlib.sha256(GATE.read_bytes()).hexdigest():raise EDAError('SAR_SOURCE_MISMATCH','SAR synthesis no longer matches RTL source.')
    digital=copy.deepcopy(payload['schematic']);lib.update(digital.pop('cells'));lib['SAR8_CONTROLLER']=digital
    full=C.cell(['VIN','VREF','VCM','BIAS','CLK','RESET','START','TOP','COMP','SAMPLE','BUSY','VALID']+[f'CODE{i}' for i in range(8)]+SUPPLY)
    D.block(full,lib,'SAR8_ANALOG','ANALOG',{'VIN':'VIN','VREF':'VREF','VCM':'VCM','BIAS':'BIAS','SAMPLE':'SAMPLE','TOP':'TOP','COMP':'COMP',**{n:n for n in BITS}})
    D.block(full,lib,'SAR8_CONTROLLER','CONTROL',{'CLK':'CLK','RESET':'RESET','START':'START','COMPARATOR':'COMP','SAMPLE':'SAMPLE','BUSY':'BUSY','VALID':'VALID',**{f'TRIAL{i}':f'B{i}' for i in range(8)},**{f'CODE{i}':f'CODE{i}' for i in range(8)}});lib['SAR_ADC8']=full
    return lib

def schematic(kind,params=None):
    lib=library();return SD.used(lib[PARTS[kind][0]],lib)

CATALOG={key:dict(name='SAR · '+label,ports=[],parameter_defaults=copy.deepcopy(DEFAULTS) if key in ('sar_adc8','sar8_analog') else {},analyses=['tran'],physical_status='not-generated',physical_supported=key not in ('sar_adc8','sar8_controller'),scope='1.8V SKY130 · 실제 MOS / 256 동일 단위 C · ngspice 연속 해석과 합성 RTL replay; 외부 VREF/VCM/BIAS',targets=['8회 실제 비교기 판단','MSB→LSB trial','CODE/VALID','독립 DRC/LVS/PEX']) for key,(_,label) in PARTS.items()}

def parameters(kind,values):
    v={**DEFAULTS,**values}
    if not .3<=v['reference_V']<=1.2 or not 0<=v['input_V']<=v['reference_V']:raise EDAError('SAR_INPUT_RANGE','Reference is 0.3..1.2V and VIN must be within 0..VREF.')
    if not .5e-6<=v['acquisition_s']<=20e-6 or not .5e-6<=v['bit_period_s']<=20e-6:raise EDAError('SAR_TIMING_RANGE','Acquisition and bit settling are 0.5..20us; actual accuracy must be measured.')
    if v['sweep_codes'] not in (0,1):raise EDAError('SAR_TEST_RANGE','sweep_codes must be 0 (directed) or 1 (all 256 bin centers).')
    return values

def populate_catalog():
    lib=library()
    for kind,row in CATALOG.items():row['ports']=lib[PARTS[kind][0]]['ports']

def inputs(v):
    # Directed tests use bin centers, avoiding an arbitrary equality convention.
    return list(dict.fromkeys([v['input_V'],0.,v['reference_V'],*[v['reference_V']*(c+.5)/256 for c in (range(256) if v.get('sweep_codes') else (0,1,63,127,128,191,254,255))]]))

def settings(raw):return native.testbench(raw,duration_limit_s=.02)

def recommended_settings(values):
    v={**DEFAULTS,**values};duration=len(inputs(v))*(v['acquisition_s']+8*v['bit_period_s'])+v['bit_period_s']
    return settings({**SETTINGS,'duration_s':duration,'step_s':max(20e-9,duration/180000)})

def control_testbench(p,folder,deck,netlist,sub):
    v={**DEFAULTS,**p['design_template']['parameters']};parameters('sar8_analog',v)
    s=p['testbench']['supply_V'];period=v['bit_period_s'];acq=v['acquisition_s'];values=inputs(v);minimum=len(values)*(acq+8*period)+period;end=p['testbench']['duration_s']
    if end+1e-12<minimum:raise EDAError('SAR_DURATION_RANGE',f'Extend transient duration to at least {minimum:.12g}s for the selected SAR sequence.')
    if s<1.5:raise EDAError('SAR_SUPPLY_RANGE','SAR model requires 1.5..1.8V; VCM follows supply/2, VREF remains explicit.')
    step=p['testbench']['step_s']
    if step>min(period,acq)/10:raise EDAError('SAR_TIMING_RANGE','Transient step must resolve acquisition and bit periods with at least ten samples.')
    # The external mixed-simulation driver has finite output resistance and
    # capacitive loading. Ideal steps directly on MOS gates can force zero-time
    # displacement-current impulses and fail native integration. Actual gate
    # voltages (not the ideal driver nodes) remain the measured vectors.
    drivers=[f'VSAMPLE SAR_DRV_SAMPLE VGND {s:.12g}','RDRV_SAMPLE SAR_DRV_SAMPLE SAMPLE 200','CDRV_SAMPLE SAMPLE VGND .5p']
    for i in range(8):drivers.extend([f'VB{i} SAR_DRV_B{i} VGND 0',f'RDRV_B{i} SAR_DRV_B{i} B{i} 200',f'CDRV_B{i} B{i} VGND .5p'])
    lines=['Actual SAR charge redistribution with continuous native comparator decisions',f'.include "{deck}"','.option scale=1e-6 method=gear maxord=2',f'.include "{netlist}"',f'.temp {p["testbench"]["temperature_C"]}','VGND VGND 0 0',f'VDD VPWR VGND {s:.12g}',f'VIN VIN VGND {values[0]:.12g}',f'VREF VREF VGND {v["reference_V"]:.12g}',f'VCM VCM VGND {s/2:.12g}','VBIAS BIAS VGND .9',*drivers,'XU '+' '.join(sub)+' '+p['cell'],f'.tran {step:.12g} {end:.12g} 0 {step:.12g}', '.control','set num_threads=1','set numdgt=17','set wr_singlescale','set wr_vecnames','save v(VIN) v(SAMPLE) v(TOP) v(COMP) v(VCM) i(VDD) i(VREF) '+ ' '.join(f'v(B{i})' for i in range(8)), 'echo frame bit trial comp top vin decision > decisions.csv']
    time=0.;first=True
    def pause(target):
        nonlocal first
        lines.extend([f'stop when time = {target:.12g}','run' if first else 'resume','delete all']);first=False
    for frame,vin in enumerate(values):
        lines += [f'alter VIN = {vin:.12g}',f'alter VSAMPLE = {s:.12g}',*[f'alter VB{i} = 0' for i in range(8)],'let sar_code_word = 0']
        time+=acq;pause(time)
        lines.append('alter VSAMPLE = 0')
        for bit in reversed(range(8)):
            lines += [f'let sar_trial_word = sar_code_word + {1<<bit}']
            for i in range(8):lines += [f'let sar_drive_V = (floor(sar_trial_word / {1<<i}) - 2*floor(sar_trial_word / {1<<(i+1)}))*{s:.12g}',f'alter VB{i} = $&sar_drive_V']
            time+=period;pause(time)
            # Bare TOP/COMP scalar names shadow ngspice's saved node vectors.
            # Keep every control variable outside the circuit node namespace.
            lines += ['let sar_sample_index = length(time)-1','let sar_cmp_voltage = v(COMP)[sar_sample_index]','let sar_top_voltage = v(TOP)[sar_sample_index]','let sar_decision_bit = 0',f'if sar_cmp_voltage >= {s/2:.12g}','let sar_code_word = sar_trial_word','let sar_decision_bit = 1','end',f'echo {frame} {bit} $&sar_trial_word $&sar_cmp_voltage $&sar_top_voltage {vin:.12g} $&sar_decision_bit >> decisions.csv']
    lines += ['resume','let supply_current = -i(VDD)','let reference_current = -i(VREF)','wrdata waveform.dat v(VIN) v(SAMPLE) v(TOP) v(COMP) v(VCM) supply_current reference_current '+' '.join(f'v(B{i})' for i in range(8)),'echo SAR_NATIVE_COMPLETE','quit','.endc','.end']
    path=Path(folder)/'testbench.spice';path.write_text('\n'.join(lines)+'\n');return path,values

def parse_decisions(path,values,supply,reference):
    rows=[]
    for line in Path(path).read_text().splitlines()[1:]:
        try:row=[float(x) for x in line.split()]
        except ValueError:raise EDAError('SAR_PARSER_FAILED','Comparator decision file contains non-numeric data.')
        if len(row)!=7 or any(not math.isfinite(x) for x in row):raise EDAError('SAR_PARSER_FAILED','Comparator decisions require seven finite fields.')
        rows.append(row)
    if len(rows)!=8*len(values):raise EDAError('SAR_INCOMPLETE','Native SAR requires eight actual decisions per input.')
    frames=[];ambiguous=0
    for frame,vin in enumerate(values):
        code=0
        for bit,row in zip(reversed(range(8)),rows[frame*8:frame*8+8]):
            f,b,trial,cmp,top,v,decision=row
            if (f,b,trial,v)!=(frame,bit,code+(1<<bit),vin) and (f,b,trial)!=(frame,bit,code+(1<<bit)):raise EDAError('SAR_SEQUENCE_FAILED','Native comparator trace has an invalid bit trial sequence.')
            if abs(v-vin)>1e-10 or decision not in (0.,1.) or decision!=int(cmp>=supply/2):raise EDAError('SAR_SEQUENCE_FAILED','Decision must come from actual comparator voltage and actual input.')
            ambiguous+=int(.3*supply<cmp<.7*supply)
            if decision:code=int(trial)
        expected=min(255,max(0,math.floor(vin/reference*256)))
        frames.append(dict(frame=frame,input_V=vin,code=code,expected_code=expected,error_codes=code-expected))
    return rows,frames,ambiguous

def replay(folder,rows,frames):
    # Feed the actual comparator bits, never an ideal VIN quantizer, to RTL.
    (folder/'decisions.mem').write_text('\n'.join(str(int(r[6])) for r in rows)+'\n')
    tb='''module replay;
 reg clk=0,reset=1,start=0,comparator=0;wire sample,busy,valid;wire [7:0] trial,code;
 reg decisions [0:COUNT-1];integer f,b,out;
 sar8_controller dut(clk,reset,start,comparator,sample,busy,valid,trial,code);
 task tick;begin #5;clk=1;#5;clk=0;end endtask
 initial begin $readmemb("decisions.mem",decisions);out=$fopen("replay.csv","w");tick;reset=0;
 for(f=0;f<FRAMES;f=f+1)begin start=1;tick;start=0;
 $fwrite(out,"%0d acquire %0d %0d %0d\\n",f,sample,busy,valid);tick;
 for(b=7;b>=0;b=b-1)begin $fwrite(out,"%0d %0d %0d ",f,b,trial);comparator=decisions[f*8+7-b];tick;
 $fwrite(out,"%0d %0d %0d\\n",code,valid,busy);end
 tick;end $fclose(out);$finish;end
 endmodule'''.replace('COUNT',str(len(rows))).replace('FRAMES',str(len(frames)))
    (folder/'replay.v').write_text(tb+'\n')

def controller_ir_verilog():
    """Independently replay the actual editable CMOS connection graph."""
    ir=schematic('sar8_controller');leaves={'INV':'assign Y=~A;','NAND2':'assign Y=~(A0&A1);','NOR2':'assign Y=~(A|B);','AND2':'assign Y=A&B;','OR2':'assign Y=A|B;','DFF':'always @(posedge CLK) Q<=D;'}
    lines=[]
    for name,cell in {**ir['cells'],'IR_CONTROLLER':{k:v for k,v in ir.items() if k!='cells'}}.items():
        ports=cell['ports'];outputs=[p for p in ports if p in ('Y','Q','SAMPLE','BUSY','VALID') or p.startswith(('TRIAL','CODE'))];inputs=[p for p in ports if p not in outputs]
        lines+=['module '+name+'('+','.join(ports)+');','input '+','.join(inputs)+';',('output reg ' if name=='DFF' else 'output ')+','.join(outputs)+';']
        if name in leaves:lines.append(leaves[name])
        else:
            nets=sorted({n for d in cell['devices'] for n in d['pins'].values()}-set(ports))
            if nets:lines.append('wire '+','.join(nets)+';')
            for d in cell['devices']:
                if d['kind']!='block':raise EDAError('SAR_IR_REPLAY','Unknown primitive outside verified CMOS logic leaves.')
                lines.append(d['cell_name']+' '+d['name']+'('+','.join('.'+p+'('+n+')' for p,n in d['pins'].items())+');')
        lines.append('endmodule')
    lines += ['module sar8_controller(input clk,reset,start,comparator,output sample,busy,valid,output [7:0] trial,code);','IR_CONTROLLER x(.CLK(clk),.RESET(reset),.START(start),.COMPARATOR(comparator),.SAMPLE(sample),.BUSY(busy),.VALID(valid),'+','.join(f'.TRIAL{i}(trial[{i}]),.CODE{i}(code[{i}])' for i in range(8))+',.VPWR(1\'b1),.VGND(1\'b0));','endmodule']
    return '\n'.join(lines)+'\n'

def context(p):
    kind=p['design_template']['id']
    if kind in ('sar_adc8','sar8_analog'):return p
    if kind=='sar8_controller':
        expected=schematic(kind)
        if SD.electrical(p['schematic'])!=SD.electrical(expected) or any(SD.electrical(p['schematic'].get('cells',{}).get(n,{'devices':[]}))!=SD.electrical(c) for n,c in expected['cells'].items()):raise EDAError('SAR_RTL_MISMATCH','Edited controller requires corresponding RTL and re-synthesis.')
    lib=library();ir=SD.used(lib['SAR8_ANALOG'],lib)
    if kind!='sar8_controller':
        ir['cells'][PARTS[kind][0]]={k:v for k,v in copy.deepcopy(p['schematic']).items() if k!='cells'}
        ir['cells'].update(copy.deepcopy(p['schematic'].get('cells',{})))
    return {**copy.deepcopy(p),'cell':'sar8_analog','schematic':ir,'ports':ir['ports'],'design_template':{**p['design_template'],'id':'sar8_analog','parameters':copy.deepcopy(DEFAULTS)}}

def subcircuit_ports(text,cell):
    statements=[]
    for line in text.splitlines():
        stripped=line.strip()
        if not stripped or stripped.startswith('*'):continue
        if stripped.startswith('+'):
            if not statements:raise EDAError('PORT_MISMATCH','SPICE continuation has no parent statement.')
            statements[-1]+=' '+stripped[1:].strip()
        else:statements.append(stripped)
    for line in statements:
        fields=line.split()
        if len(fields)>2 and fields[0].lower()=='.subckt' and fields[1].lower()==cell.lower():return fields[2:]
    return None

def execute(server,run,p,folder,manifest,params):
    kind=p['design_template']['id']
    if params.get('post_layout') and kind!='sar8_analog':raise EDAError('SAR_POST_LAYOUT_UNSUPPORTED','Full controller/ADC physical timing is not implemented; use the actual analog core PEX.')
    original=copy.deepcopy(p)
    p=context(p)
    if kind=='sar_adc8':
        if SD.electrical(p['schematic'])!=SD.electrical(schematic(kind)) or any(SD.electrical(p['schematic']['cells'].get(n,{'devices':[]}))!=SD.electrical(c) for n,c in schematic(kind)['cells'].items()):raise EDAError('SAR_RTL_MISMATCH','Edited full SAR hierarchy requires a corresponding RTL/analog adapter; no unchanged DUT is substituted.')
        p={**copy.deepcopy(p),'cell':'sar8_analog','schematic':schematic('sar8_analog'),'ports':CATALOG['sar8_analog']['ports']}
    config=settings({**p['testbench'],**{key:params[key] for key in native.TESTBENCH if key in params}});p['testbench']=config
    if config['analysis']!='tran':raise EDAError('UNSUPPORTED_ANALYSIS','SAR requires continuous transient simulation.')
    if params.get('post_layout'):
        netlist=server.extract(run,p,folder,manifest,pex=True)
        import pex_reduce
        netlist,audit,reduction=pex_reduce.prepare(p,netlist,folder)
        run['artifacts'].update(pex_reduced_netlist=str(netlist),pex_reduction=str(audit))
        manifest['settings']['pex_exact_reduction']=reduction
    else:
        netlist=folder/'analog.spice';netlist.write_text(native.emit(p['schematic'],p['cell'],p['ports']))
    sub=subcircuit_ports(Path(netlist).read_text(),p['cell'])
    if sub is None or set(sub)!=set(p['ports']) or len(sub)!=len(p['ports']):raise EDAError('PORT_MISMATCH','SAR extracted/owned ports differ.')
    deck=server.design_tools.supported_model_deck(folder,config['corner']);tb,values=control_testbench(p,folder,deck,netlist,sub)
    log=server.process(run,folder,['ngspice','-b',str(tb)],'ngspice',manifest,timeout=600)
    if 'SAR_NATIVE_COMPLETE' not in log or any(x in log.lower() for x in ('fatal error','timestep too small','unknown subckt','singular matrix','error on line','error:','warning: upper limit','warning: lower limit')):raise EDAError('SIMULATION_FAILED','SAR continuous native simulation failed; actual log retained.')
    reference={**DEFAULTS,**p['design_template']['parameters']}['reference_V']
    rows,frames,ambiguous=parse_decisions(folder/'decisions.csv',values,config['supply_V'],reference)
    replay(folder,rows,frames);runs=[]
    (folder/'ir-controller.v').write_text(controller_ir_verilog())
    for name,sources in [('rtl',[RTL]),('gate',[runtime_resources.yosys_simcells(),GATE]),('ir',[folder/'ir-controller.v'])]:
        server.process(run,folder,['iverilog','-g2012','-s','replay','-o',str(folder/f'{name}.vvp'),*map(str,sources),str(folder/'replay.v')],name+'-compile',manifest)
        server.process(run,folder,['vvp',str(folder/f'{name}.vvp')],name+'-replay',manifest)
        path=folder/f'{name}-replay.csv';shutil.move(folder/'replay.csv',path);runs.append(path.read_text().splitlines());run['artifacts'][name+'_replay']=str(path)
    matched=runs[0]==runs[1]==runs[2]
    for f,frame in enumerate(frames):
        chunk=runs[0][f*9:f*9+9]
        matched &= len(chunk)==9 and chunk[0]==f'{f} acquire 1 1 0'
        for b,line in zip(reversed(range(8)),chunk[1:]):
            fields=line.split();actual=rows[f*8+7-b]
            matched &= len(fields)==6 and [int(x) for x in fields[:3]]==[f,b,int(actual[2])] and [int(x) for x in fields[3:]]==[frame['code'] if b==0 else (frames[f-1]['code'] if f else 0),int(b==0),int(b!=0)]
    data=[]
    for line in (folder/'waveform.dat').read_text().splitlines()[1:]:
        a=[float(x) for x in line.split()]
        if len(a)!=16 or any(not math.isfinite(x) for x in a):raise EDAError('SAR_PARSER_FAILED','SAR waveform requires 16 finite columns.')
        data.append(a)
    if not data or any(b[0]<=a[0] for a,b in zip(data,data[1:])):raise EDAError('SAR_PARSER_FAILED','SAR transient time is not strictly increasing.')
    names=['VIN','SAMPLE','TOP','COMP','VCM','supply_current','reference_current']+BITS
    v={**DEFAULTS,**p['design_template']['parameters']};frame_period=v['acquisition_s']+8*v['bit_period_s']
    run['waveforms']=[dict(name=n,unit='A' if n.endswith('current') else 'V',x=[r[0] for r in data],y=[r[i+1] for r in data]) for i,n in enumerate(names)]+[dict(name='CODE',unit='code',x=[(f['frame']+1)*frame_period for f in frames],y=[f['code'] for f in frames])]
    checks=[dict(name='RTL / synthesized gates / CMOS schematic reproduce every native comparator decision and trial',pass_=matched),dict(name='Comparator logic levels unambiguous at decision edges',pass_=ambiguous==0),dict(name='Directed input codes within one LSB',pass_=all(abs(f['error_codes'])<=1 for f in frames))]
    checks=[{**{k:v for k,v in c.items() if k!='pass_'},'pass':c['pass_']} for c in checks];passed=all(c['pass'] for c in checks)
    report=dict(schema_version=1,kind=kind,source='continuous ngspice MOS/capacitor decisions + actual Icarus RTL/gate/CMOS replay',pass_=passed,checks=checks,frames=frames,ambiguous_decisions=ambiguous,rtl_sha256=hashlib.sha256(RTL.read_bytes()).hexdigest(),gate_sha256=hashlib.sha256(GATE.read_bytes()).hexdigest(),scope='Static directed inputs / optional all 256 bin centers; ±1 code criterion. Not full INL/DNL, noise, ENOB, yield, digital transistor timing or manufacturing signoff.')
    report['pass']=report.pop('pass_');path=folder/'sar-verification.json';path.write_text(json.dumps(report,indent=2)+'\n')
    run.update(tool='ngspice + Icarus Verilog',reference_verification=report,analysis_result='pass' if passed else 'fail',message='Actual charge-retaining SAR comparator decisions and RTL/gate replay completed.')
    run.setdefault('measurements',{}).update(analysis='tran',x_unit='s',x_label='time',output_bits=8,frames=len(frames),max_code_error=max(abs(f['error_codes']) for f in frames),ambiguous_decisions=ambiguous,rtl_gate_replay_match=matched,lsb_V=reference/256,conversion_s=frame_period,effective_resolution='not measured')
    import research
    run['measurements']['source_energy'] = research.sar_energy(run['waveforms'],frames,v,config['supply_V'])
    run['artifacts'].update(testbench=str(tb),native_decisions=str(folder/'decisions.csv'),waveform_data=str(folder/'waveform.dat'),sar_verification=str(path))
    manifest['settings'].update(sar_cosimulation='retained-charge ngspice continuation → actual RTL and synthesized-gate replay',sar_ideal_sources='External reference, VCM, bias and control bridge only; no behavioral ADC quantizer in the DUT.',sar_external_control_driver={'series_R_Ohm':200,'load_C_F':.5e-12,'nominal_RC_s':100e-12,'scope':'External driver assumption, not synthesized-controller transistor timing. Actual loaded gate voltages are saved.'},sar_scope=report['scope'])
