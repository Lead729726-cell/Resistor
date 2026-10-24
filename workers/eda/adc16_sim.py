"""Actual ngspice ADC16 measurements and explicit digital boundary replay."""
import bisect, copy, hashlib, json, math
from pathlib import Path
import adc16 as A, adc16_digital as D, native, sar12, sar_adc, sar12_metrics as M, sigma_delta as SD
from geometry import EDAError


def check(name,passed,observed=None):return{'name':name,'pass':bool(passed),'observed':observed}


def finish(run,p,folder,report,measurements,tool='ngspice + Icarus Verilog'):
    report.update(schema_version=1,kind=p['design_template']['id'],source='actual-native-engine-artifacts',pass_=all(c['pass']for c in report['checks']))
    report['pass']=report.pop('pass_');report['scope']+=' Thermal/flicker noise, mismatch, jitter, full digital MOS timing and foundry signoff are not established.'
    output_bits=A.CATALOG[p['design_template']['id']].get('output_bits')
    report['output_bits']=output_bits
    file=Path(folder)/'adc16-verification.json';file.write_text(json.dumps(report,indent=2,allow_nan=False)+'\n')
    run['artifacts']['adc16_verification']=str(file)
    run.update(tool=tool,reference_verification=report,analysis_result='pass'if report['pass']else'fail',message='ADC16 actual native execution completed; accuracy criteria are reported independently.')
    run.setdefault('measurements',{}).update(analysis='tran',x_unit='s',x_label='time',corner=p['testbench']['corner'],temperature_C=p['testbench']['temperature_C'],supply_V=p['testbench']['supply_V'],output_bits=output_bits,ENOB_bits=None,ENOB_status='not measured; output width is not effective resolution')
    run['measurements'].update(measurements)


def native_start(server,run,p,folder,manifest,ir,params):
    if p['testbench']['analysis']!='tran':raise EDAError('ADC16_ANALYSIS','This ADC16 context uses an actual transient testbench.')
    if p['testbench']['supply_V']!=1.8:raise EDAError('ADC16_SUPPLY','These fixtures require 1.8V; new rail conditions require a separate validated setup.')
    netlist=folder/'analog.spice'
    if params.get('post_layout'):netlist=server.extract(run,p,folder,manifest,pex=True)
    else:netlist.write_text(native.emit(ir,p['cell'],ir['ports']))
    sub=sar_adc.subcircuit_ports(Path(netlist).read_text(),p['cell'])
    if sub is None or len(sub)!=len(set(sub))or set(sub)!=set(ir['ports']):raise EDAError('ADC16_PORTS','Actual SPICE subcircuit ports differ; no guessed ordering.')
    deck=server.design_tools.supported_model_deck(folder,p['testbench']['corner'])
    run['artifacts']['analog_netlist']=str(netlist)
    manifest.setdefault('settings',{})['adc16_analog_netlist_sha256']=hashlib.sha256(Path(netlist).read_bytes()).hexdigest()
    return netlist,sub,deck


def ngspice(server,run,folder,manifest,tb,marker):
    log=server.process(run,folder,['ngspice','-b',str(tb)],'ngspice',manifest,timeout=1800)
    errors=('timestep too small','fatal error','unknown subckt','singular matrix','error on line','error:')
    if marker not in log or any(e in log.lower()for e in errors)or not marker.startswith('SAR')and'simulation interrupted'in log.lower():
        raise EDAError('ADC16_SIMULATION','Native transient did not finish cleanly; original input/log retained.')
    run['artifacts'].update(testbench=str(tb),waveform_data=str(folder/'waveform.dat'))


def traces(run,folder,names,supply=1.8):
    power={names.index('supply_current')+1:supply}if'supply_current'in names else{}
    selected,audit=M.display_trace(folder/'waveform.dat',len(names)+1,max_points=8000,power_sources=power)
    run['waveforms']=[dict(name=n,unit='A'if n.endswith('current')else'V',x=[r[0]for r in selected],y=[r[i+1]for r in selected])for i,n in enumerate(names)]
    run['current_flow']=dict(schema_version=1,source='ngspice',analysis='tran',x=[r[0]for r in selected],x_unit='s',convention='conventional',revision=run.get('revision',1),project_id=run.get('project_id'),run_id=run.get('id'),geometry_linkage='unverified',input_origin='project-snapshot',
        branches=[dict(id='adc16_analog_supply',name='Aggregate analog VDD current',from_net='VPWR',to_net='VGND',values_A=[r[names.index('supply_current')+1]for r in selected],mapping='unmapped',source_vector='-i(VDD)')]if power else[],
        node_voltages=[dict(net=n,source_vector='v('+n+')',values_V=[r[i+1]for r in selected])for i,n in enumerate(names)if not n.endswith('current')],
        notes=['Actual aggregate VDD current only; external reference/bias/clock/input supplies and replayed digital power excluded.','No inferred internal branch current or geometry vector. Raw adaptive samples retained; display extrema use one shared time axis.'])
    run['measurements']={**audit,'power_scope':'Signed VDD boundary power only; external clock, input, reference, VCM/bias supplies and replayed digital power excluded. Not total ADC power.'}
    return selected


def sar(server,run,p,folder,manifest,params,ir):
    v=A.parameters(p['design_template']['id'],p['design_template']['parameters']);netlist,sub,deck=native_start(server,run,p,folder,manifest,ir,params)
    tb,values=sar12.control_testbench(p,folder,deck,netlist,sub,bit_count=16,default_values=A.SAR_DEFAULTS,values_override=A.sar_inputs(v),prepare_fraction=.5,validate_parameters=False)
    ngspice(server,run,folder,manifest,tb,'SAR16_NATIVE_COMPLETE')
    rows,frames,ambiguous=sar12.parse_decisions(folder/'decisions.csv',values,1.8,v['reference_V'],bit_count=16)
    D.sar_replay(server,run,folder,manifest,rows,frames)
    pauses=[float(line.split('=')[-1])for line in(folder/'pause-times.txt').read_text().splitlines()if'='in line]
    period=v['acquisition_s']+v['hold_s']+16*v['bit_period_s']
    expected=[]
    for f in range(len(frames)):
        t=f*period+v['acquisition_s'];expected.extend([t,t+v['hold_s']]);t+=v['hold_s']
        for b in range(16):expected.extend([t+(b+.5)*v['bit_period_s'],t+(b+1)*v['bit_period_s']])
    if len(pauses)!=len(expected)or any(not math.isfinite(t)or abs(t-e)>1e-12 for t,e in zip(pauses,expected)):raise EDAError('ADC16_TIME','Actual retained-state pauses differ from the sixteen-decision schedule.')
    names=['VINP','VINN','SAMPLE','EVAL','TOPP','TOPN','COMP','COMPN','supply_current','reference_current']+A.BITS+['VPWR']
    actual_rows(folder,len(names)+1,p['testbench']['duration_s']);traces(run,folder,names)
    run['waveforms'].append(dict(name='CODE',unit='code',x=[(r['frame']+1)*period for r in frames],y=[r['code']for r in frames]))
    checks=[check('Actual 16 comparator trials match RTL, synthesized gates and CMOS graph',True),check('Complementary comparator levels at every decision',ambiguous==0,ambiguous),check('Directed native code error within one nominal 16-bit LSB',all(abs(f['error_codes'])<=1 for f in frames),max(abs(f['error_codes'])for f in frames))]
    report={'checks':checks,'frames':frames,'scope':'Actual retained-charge four-bank CDAC and dynamic MOS decisions; external finite-impedance VREF/VCM/control. No calibrated or coupled-PEX accuracy claim.'}
    finish(run,p,folder,report,dict(frames=len(frames),max_code_error=max(abs(f['error_codes'])for f in frames),ambiguous_decisions=ambiguous,lsb_V=2*v['reference_V']/65536,conversion_s=period,sample_rate_Hz=1/period,physical_unit_count=244,bridge_capacitor_count=6,architecture='differential-4+4+4+4-split-SAR'))
    run['measurements'].update(sample_rate_scope='External analog testbench frame rate; not full-controller START throughput.',rtl_clock_Hz=2/v['bit_period_s'],rtl_min_start_period_s=25*v['bit_period_s'],rtl_max_start_rate_Hz=1/(25*v['bit_period_s']))
    if v['test_mode']in(1,2):
        spectrum=M.coherent_spectrum([f['code']for f in frames],1/period,7 if v['test_mode']==1 else 17,bits=16)
        (folder/'spectrum.json').write_text(json.dumps(spectrum,indent=2)+'\n');run['artifacts']['spectrum']=str(folder/'spectrum.json')
        run['measurements'].update({k:spectrum[k]for k in('SNDR_dB','SFDR_dB','ENOB_noiseless_bits')})
    run['artifacts']['native_decisions']=str(folder/'decisions.csv')
    manifest['settings'].update(adc16_architecture='four 4-bit banks; 244 equal 1pF units and six 32/15pF bridges',digital_boundary='external sequencer; raw MOS decisions replayed independently; no digital MOS delay/power')


def base_lines(p,deck,netlist,sub,bindings=None):
    bindings=bindings or{}
    return['Resistor Indust actual ADC16 MOS reference',f'.include "{deck}"',f'.include "{netlist}"','.option sparse scale=1e-6 method=gear maxord=2 reltol=1e-5 vntol=1e-6 abstol=1e-12',f'.temp {p["testbench"]["temperature_C"]}',
        'VGND VGND 0 0','VDD SUPPLY VGND 1.8','R_SUPPLY SUPPLY VPWR .1',
        'XU '+' '.join(bindings.get(n,n)for n in sub)+' '+p['cell']]


def write_tb(folder,lines,names,p):
    duration=p['testbench']['duration_s'];step=p['testbench']['step_s']
    vectors=['-i(VDD)'if n=='supply_current'else'v('+n+')'for n in names]
    lines+=['.control','set num_threads=1','set numdgt=17','set wr_singlescale','set wr_vecnames',f'tran {step:.15g} {duration:.15g} 0 {step:.15g}',
            'let supply_current = -i(VDD)','wrdata waveform.dat '+' '.join('supply_current'if n=='supply_current'else'v('+n+')'for n in names),
            'echo ADC16_NATIVE_COMPLETE','quit','.endc','.end']
    file=folder/'testbench.spice';file.write_text('\n'.join(lines)+'\n');return file


class NativeTrace(list):
    """One immutable time index per trace, shared by every sampled vector."""
    times=None


def actual_rows(folder,columns,expected_end=None):
    rows=NativeTrace()
    with(folder/'waveform.dat').open()as source:
        if not next(source, '').strip():raise EDAError('ADC16_TRACE','Native waveform header is missing.')
        for line in source:
            if not line.strip():continue
            try:r=list(map(float,line.split()))
            except ValueError:raise EDAError('ADC16_TRACE','Non-numeric native waveform.')
            if len(r)!=columns or any(not math.isfinite(x)for x in r)or rows and r[0]<=rows[-1][0]:raise EDAError('ADC16_TRACE','Finite increasing native time and complete columns required.')
            rows.append(r)
            if len(rows)>2000000:raise EDAError('ADC16_TRACE','Split long ADC16 traces into bounded jobs.')
    if not rows:raise EDAError('ADC16_TRACE','Native waveform has no samples.')
    if rows[0][0]!=0:raise EDAError('ADC16_INCOMPLETE','Native transient must start at zero; a partial record cannot establish complete boundary power or sampling history.')
    if expected_end is not None and abs(rows[-1][0]-expected_end)>max(1e-15,expected_end*1e-8):raise EDAError('ADC16_INCOMPLETE','Native waveform does not reach the requested stop time; completion marker alone is insufficient.')
    rows.times=[r[0]for r in rows]
    return rows


def sample(rows,t,column):
    # Rebuilding an N-row time array for every bit/vector made sampling O(N*M).
    # The immutable shared index makes each real interpolation O(log N).
    times=rows.times
    index=bisect.bisect_left(times,t)
    if index==len(times)or index==0 and times[0]!=t:raise EDAError('ADC16_SAMPLE','Missing native waveform at requested sampling time.')
    if times[index]==t:return rows[index][column]
    a,b=rows[index-1],rows[index]
    return a[column]+(b[column]-a[column])*(t-a[0])/(b[0]-a[0])


def pipeline_ambiguity(levels,output_indices):
    """Check the exact half-cycle sources consumed by each aligned output."""
    return sum(sum(levels[i-14+j][j]for j in range(14))+levels[i][14]for i in output_indices)


def sdm(server,run,p,folder,manifest,params,ir):
    v=A.parameters(p['design_template']['id'],p['design_template']['parameters']);netlist,sub,deck=native_start(server,run,p,folder,manifest,ir,params)
    lines=base_lines(p,deck,netlist,sub)
    stimulus=f'SIN({v["input_V"]} {v["sine_amplitude_V"]} {v["sine_frequency_Hz"]})'if v['sine_amplitude_V']else str(v['input_V'])
    lines+=['VIN VIN_DRV VGND '+stimulus,'R_INPUT VIN_DRV VIN 50','VCLK CLK VGND PULSE(0 1.8 500n 10n 10n 480n 1u)','VRESET RESET VGND PWL(0 1.8 7.99u 1.8 8u 0)']
    names=['VIN','CLK','RESET','BITSTREAM','INT1','INT2','VCM','BIAS','supply_current']
    tb=write_tb(folder,lines,names,p);ngspice(server,run,folder,manifest,tb,'ADC16_NATIVE_COMPLETE')
    rows=actual_rows(folder,10,p['testbench']['duration_s']);samples=int((rows[-1][0]-.875e-6)/1e-6)+1
    bits=[];resets=[];ambiguous=0
    for i in range(samples):
        t=(i+.875)*1e-6;voltage=sample(rows,t,4);reset=sample(rows,t,3)
        bits.append(int(voltage>=.9));resets.append(int(reset>=.9))
        ambiguous+=int(reset<.9 and not(voltage<=.36 or voltage>=1.44))
    frames=D.filter_replay(server,run,folder,manifest,bits,resets)
    if len(frames)<3:raise EDAError('ADC16_RECORD','Keep at least three settled CIC3 output words.')
    mean=math.fsum(code for _,code in frames)/len(frames);error=mean-v['input_V']/1.8*65536
    traces(run,folder,names)
    run['waveforms'].append(dict(name='CODE',unit='code',x=[(i+1)*1e-6 for i,_ in frames],y=[c for _,c in frames]))
    checks=[check('Actual bitstream matches RTL, gates, CMOS and independent FIR',True,len(bits)),check('No ambiguous sampled bitstream levels',ambiguous==0,ambiguous),check('Three or more settled output frames',len(frames)>=3,len(frames))]
    if not v['sine_amplitude_V']:checks.append(check('DC nominal error within 32 output LSB (functional reference, not 16-bit accuracy)',abs(error)<=32,error))
    report={'checks':checks,'scope':'Actual second-order RC/MOS modulator; sampled native bits replayed through CIC3 R=256, gain=2^24. First two startup frames withheld by RTL.',
            'frames':[{'sample':i,'code':c}for i,c in frames]}
    finish(run,p,folder,report,dict(architecture='second-order-CT-MOS-CIC3',modulator_clock_Hz=1e6,decimation=256,sample_rate_Hz=1e6/256,lsb_V=1.8/65536,frames=len(frames),mean_code=mean,dc_error_LSB=error if not v['sine_amplitude_V']else None,ambiguous_decisions=ambiguous,filter_gain=1<<24,filter_group_delay_input_samples=382.5,code_timestamp_scope='Nominal falling-edge digital replay boundary; no measured digital transistor delay.'))
    (folder/'sampled-bits.json').write_text(json.dumps({'bits':bits,'resets':resets,'sample_phase':.875,'clock_Hz':1e6})+'\n');run['artifacts']['sampled_bits']=str(folder/'sampled-bits.json')
    manifest['settings'].update(adc16_architecture='second-order CT RC/MOS; resistor signal feedforward fixes the DC operating point; opposite quantizer polarity',digital_boundary='native latched bit at .875us phase; logical falling-edge bridge; no filter MOS timing/power')


def pipeline(server,run,p,folder,manifest,params,ir):
    v=A.parameters(p['design_template']['id'],p['design_template']['parameters']);netlist,sub,deck=native_start(server,run,p,folder,manifest,ir,params)
    t=1/v['clock_Hz'];cm=v['input_common_mode_V'];ref=v['reference_V'];vin=v['input_differential_V']
    lines=base_lines(p,deck,netlist,sub)
    for pin,value in [('VINP',cm+vin/2),('VINN',cm-vin/2),('VCM',cm),('REFP',cm+ref/4),('REFN',cm-ref/4),('THP',cm+ref/4),('THN',cm-ref/4),('FP',cm+ref/2),('FM',cm-ref/2),('BIAS',.75)]:
        lines += [f'V_{pin} {pin}_DRV VGND {value:.15g}',f'R_{pin} {pin}_DRV {pin} '+('50'if pin.startswith('VIN')else'2')]
    lines += [f'VPHI1 PHI1 VGND PULSE(0 1.8 {t*.01:.15g} {t*.001:.15g} {t*.001:.15g} {t*.47:.15g} {t:.15g})',
              f'VPHI2 PHI2 VGND PULSE(0 1.8 {t*.51:.15g} {t*.001:.15g} {t*.001:.15g} {t*.47:.15g} {t:.15g})',
              f'VRESET RESET VGND PWL(0 1.8 {t*1.99:.15g} 1.8 {t*2:.15g} 0)']
    names=['VINP','VINN','PHI1','PHI2','RESET','RESIDUEP','RESIDUEN']+[f'STAGE{i}_{role}'for i in range(14)for role in('LOW','HIGH')]+['Q0','Q1','Q2','supply_current']
    tb=write_tb(folder,lines,names,p);ngspice(server,run,folder,manifest,tb,'ADC16_NATIVE_COMPLETE')
    rows=actual_rows(folder,len(names)+1,p['testbench']['duration_s']);stages=[];flashes=[];valids=[];levels=[]
    count=int(rows[-1][0]/(t/2))
    for i in range(count):
        when=(i+.90)*t/2
        if when>rows[-1][0]:break
        values=[sample(rows,when,j+1)for j in range(len(names))]
        digits=[]
        for j in range(14):
            lo,hi=values[7+2*j:9+2*j];digits.append(int(lo>=.9)+2*int(hi>=.9))
        flash=sum(int(values[35+j]>=.9)<<j for j in range(3))
        stages.append(digits);flashes.append(flash);valids.append(int(i>=8 and i%2==1))
        levels.append([sum(not(x<=.36 or x>=1.44)for x in values[7+2*j:9+2*j])for j in range(14)]+[sum(not(x<=.36 or x>=1.44)for x in values[35:38])])
    actual=D.pipeline_replay(server,run,folder,manifest,stages,flashes,valids)
    frames=[(i,code,error)for i,code,valid,error in actual if i>=28 and(valid or error)]
    valid_frames=[(i,c)for i,c,e in frames if not e]
    if not frames:raise EDAError('ADC16_RECORD','No filled pipeline output interval; retain more cycles.')
    ambiguous=pipeline_ambiguity(levels,[i for i,_,_ in frames])
    expected=D.quantize16(vin,ref);errors=[abs(c-expected)for _,c in valid_frames]
    traces(run,folder,names)
    run['waveforms'].append(dict(name='CODE',unit='code',x=[(i+.90)*t/2 for i,c in valid_frames],y=[c for i,c in valid_frames]))
    malformed=sum(e for _,_,e in frames)
    checks=[check('Actual stage words match RTL/gates/CMOS and independent aligned decode',True),check('No malformed filled-pipeline thermometer words',malformed==0,malformed),check('No ambiguous settled logic levels',ambiguous==0,ambiguous),check('At least eight valid output words',len(valid_frames)>=8,len(valid_frames)),check('Uncalibrated DC code within one nominal 16-bit LSB',bool(errors)and max(errors)<=1,max(errors)if errors else None)]
    report={'checks':checks,'scope':'Actual fourteen differential switched-capacitor MDACs, MOS flash/latches and raw-word digital alignment. DC input only; amplifier gain, offset and settling are not idealized or corrected.',
            'frames':[dict(half_cycle=i,code=c,error=e,expected_code=expected)for i,c,e in frames]}
    finish(run,p,folder,report,dict(architecture='14x1.5-bit-MDAC+2-bit-flash',frames=len(valid_frames),max_code_error=max(errors)if errors else None,ambiguous_decisions=ambiguous,malformed_words=malformed,lsb_V=2*ref/65536,sample_rate_Hz=v['clock_Hz'],digital_alignment_half_cycles=14,full_pipeline_latency_half_cycles=15,calibration='not-applied'))
    (folder/'stage-samples.json').write_text(json.dumps(dict(stages=stages,flashes=flashes,valids=valids))+'\n');run['artifacts']['stage_samples']=str(folder/'stage-samples.json')
    manifest['settings'].update(adc16_architecture='14 differential 1.5-bit stages plus registered 2-bit flash',digital_boundary='two alternating sample phases, native thermometer samples → half-cycle RTL alignment; no digital MOS delay/power')


def matches_binding(ir,original):
    # Display positions/IDs may change, but ports, primitive models and the complete
    # hierarchy must still match the independently synthesized RTL being replayed.
    def same(a,b):return a.get('ports')==b.get('ports')and SD.electrical(a)==SD.electrical(b)
    cells=ir.get('cells',{});expected=original.get('cells',{})
    return same(ir,original)and cells.keys()==expected.keys()and all(same(c,expected[n])for n,c in cells.items())


def digital_block(server,run,p,folder,manifest):
    kind=p['design_template']['id']
    original=A.schematic(kind,p['design_template']['parameters'])
    if not matches_binding(p['schematic'],original):raise EDAError('ADC16_BINDING','Edited digital CMOS hierarchy needs re-synthesis and binding; original RTL is not a substitute for your edits.')
    if kind=='sar16_controller':
        values=list(dict.fromkeys([0,1,2,255,256,32767,32768,32769,65280,65534,65535,*range(0,65536,257)]));decisions=[];frames=[]
        for f,code in enumerate(values):
            accepted=0
            for bit in reversed(range(16)):
                trial=accepted+(1<<bit);decision=int(code>=trial)
                decisions.append([f,bit,trial,1.8*decision,1.8*(1-decision),0,0,0,decision])
                if decision:accepted=trial
            frames.append(dict(frame=f,code=code))
        D.sar_replay(server,run,folder,manifest,decisions,frames);codes=[(i,c['code'])for i,c in enumerate(frames)]
    elif kind=='sdm16_filter':
        bits=[];resets=[]
        for density in(0,1,64,128,192,255,256):
            bits.append(0);resets.append(1)
            bits.extend(int((i*density)%256<density)for i in range(6*256));resets.extend([0]*(6*256))
        codes=D.filter_replay(server,run,folder,manifest,bits,resets)
    else:
        inputs=[D.pipeline_digits((i+.5)/32768-1)for i in range(0,65536,257)];stages=[];flashes=[];valids=[]
        for t in range(len(inputs)+14):
            stages.append([inputs[t-j][0][j]if 0<=t-j<len(inputs)else 0 for j in range(14)])
            flashes.append(inputs[t-14][1]if 0<=t-14<len(inputs)else 0);valids.append(int(t<len(inputs)))
        rows=D.pipeline_replay(server,run,folder,manifest,stages,flashes,valids);codes=[(i,c)for i,c,v,e in rows if v]
    run['waveforms']=[dict(name='CODE',unit='code',x=[float(i)for i,_ in codes],y=[c for _,c in codes])]
    finish(run,p,folder,dict(checks=[check('Actual RTL, synthesized gates, CMOS graph and independent digital oracle agree',True,len(codes))],scope='Digital standalone block stimuli only. No analog execution, ADC input accuracy or MOS delay/power measured.'),dict(frames=len(codes),architecture='digital-block',x_unit='cycle',x_label='digital cycle'),tool='Icarus Verilog')


def block(server,run,p,folder,manifest,params,ir):
    kind=p['design_template']['id'];netlist,sub,deck=native_start(server,run,p,folder,manifest,ir,params);lines=base_lines(p,deck,netlist,sub);target=None
    # Every source below is an explicitly declared external port fixture.
    def voltage(pin,value):lines.append(f'V_{pin} {pin} VGND {value}')
    def phased():
        voltage('SAMPLE','PULSE(0 1.8 .1u 1n 1n 4.8u 10u)')
        if 'SAMPLEB'in sub:voltage('SAMPLEB','PULSE(1.8 0 .1u 1n 1n 4.8u 10u)')
        if'HOLD'in sub:voltage('HOLD','PULSE(0 1.8 5.1u 1n 1n 4.8u 10u)')
    checks=[]
    if kind in('sar16_unit_cap','sar16_bridge'):
        bottom='FINE'if kind=='sar16_bridge'else'BOTTOM'
        voltage('DRIVE','PWL(0 0 2u 0 2.01u .6 20u .6)');lines+=['R_DRIVE DRIVE TOP 1000',f'R_BOTTOM {bottom} VGND .01'];names=['TOP',bottom,'supply_current'];target='capacitor'
    elif kind=='sar16_switch':
        voltage('A','PWL(0 .3 5u .3 5.01u 1.5 12u 1.5 12.01u .3 20u .3)');voltage('EN',1.8);voltage('ENB',0);lines+=['C_LOAD Y VGND 1p','R_LEAK Y VGND 1g'];names=['A','Y','supply_current'];target='switch'
    elif kind=='sar16_cdac':
        for pin,val in [('VINP',.95),('VINN',.85),('VREF',1.2),('VCM',1.2)]:voltage(pin,val)
        voltage('SAMPLE','PWL(0 1.8 8u 1.8 8.01u 0 20u 0)')
        for i in range(16):voltage('B'+str(i),'PWL(0 0 12u 0 12.01u 1.8 20u 1.8)'if i==15 else 0)
        names=['TOPP','TOPN','SAMPLE','B15','supply_current'];target='cdac'
    elif kind in('adc16_reference','adc16_bias'):
        node='VCM'if kind=='adc16_reference'else'BIAS';lines.append(f'R_LOAD {node} VGND 100meg');names=[node,'supply_current'];target=node
    elif kind=='adc16_ota':
        # External unity feedback, declared at the actual INN port.
        lines[lines.index(next(l for l in lines if l.startswith('XU ')))]=next(l for l in lines if l.startswith('XU ')).replace(' INN ',' OUT ')
        voltage('INP','PWL(0 .9 5u .9 5.01u .91 20u .91)');voltage('BIAS',.75);lines.append('C_LOAD OUT VGND 1p');names=['INP','OUT','supply_current'];target='ota'
    elif kind in('adc16_comparator','sar16_comparator'):
        voltage('INP',.9001 if kind=='sar16_comparator'else .95);voltage('INN',.9)
        if'EVAL'in sub:voltage('EVAL','PWL(0 0 2u 0 2.001u 1.8 20u 1.8)');names=['INP','INN','OUTP','OUTN','supply_current'];target='dynamic'
        else:voltage('BIAS',.75);lines.append('C_LOAD OUT VGND 50f');names=['INP','INN','OUT','supply_current'];target='static'
    elif kind=='sdm16_integrator':
        for pin,val in [('VIN',.91),('SIGNAL',.9),('BITSTREAM',.9),('VCM',.9),('BIAS',.75)]:voltage(pin,val)
        voltage('RESET','PWL(0 1.8 1.99u 1.8 2u 0 20u 0)');voltage('RESETB','PWL(0 0 1.99u 0 2u 1.8 20u 1.8)');names=['VIN','OUT','RESET','supply_current'];target='integrator'
    else:
        for pin,value in [('VINP',.975),('VINN',.825),('VCM',.9),('BIAS',.75),('REFP',1.2),('REFN',.6),('THP',1.2),('THN',.6),('FP',1.5),('FM',.3),('VIN',.975),('DAC',.9)]:
            if pin in sub:voltage(pin,value)
        if'SAMPLE'in sub:phased()
        if'RESET'in sub:voltage('RESET','PWL(0 1.8 1.99u 1.8 2u 0 20u 0)')
        if'CLK'in sub:voltage('CLK','PULSE(0 1.8 5u 1n 1n 4.9u 10u)')
        names=[n for n in('VINP','VINN','VIN','OUTP','OUTN','OUT','HIGH','LOW','Q0','Q1','Q2')if n in sub]+['supply_current'];target=kind
    tb=write_tb(folder,lines,names,p);ngspice(server,run,folder,manifest,tb,'ADC16_NATIVE_COMPLETE');rows=actual_rows(folder,len(names)+1,p['testbench']['duration_s']);traces(run,folder,names)
    def at(name,t=19e-6):return sample(rows,t,names.index(name)+1)
    if target=='capacitor':
        difference=at('TOP')-at(bottom);checks=[check('Real capacitor terminal settles to declared 0.6V step',abs(difference-.6)<.001,difference)]
    elif target=='switch':checks=[check('Enabled real TG passes the external voltage',abs(at('Y')-at('A'))<.02,at('Y')-at('A'))]
    elif target=='cdac':
        delta=(at('TOPP',18e-6)-at('TOPN',18e-6))-(at('TOPP',11e-6)-at('TOPN',11e-6));checks=[check('Actual MSB CDAC differential step is nominal 1.2V',abs(delta-1.2)<.005,delta)]
    elif target=='VCM':checks=[check('Loaded resistor reference near 0.9V',abs(at('VCM')-.9)<.01,at('VCM'))]
    elif target=='BIAS':checks=[check('Diode-connected MOS establishes a finite bias',.2<at('BIAS')<1.2,at('BIAS'))]
    elif target=='ota':checks=[check('Actual OTA tracks unity-feedback input (functional 20mV bound)',abs(at('OUT')-at('INP'))<.02,at('OUT')-at('INP'))]
    elif target=='static':checks=[check('Positive differential input produces a CMOS HIGH',at('OUT')>1.44,at('OUT'))]
    elif target=='dynamic':checks=[check('Positive 100uV differential resolves dynamic comparator',at('OUTP')>1.44 and at('OUTN')<.36,at('OUTP')-at('OUTN'))]
    elif target=='integrator':checks=[check('Real second integrator has the expected negative ramp direction',at('OUT',18e-6)<at('OUT',8e-6),at('OUT',18e-6)-at('OUT',8e-6))]
    elif target=='pipeline16_subadc':checks=[check('SubADC within ±VREF/4 produces thermometer 01',at('LOW')>1.44 and at('HIGH')<.36,[at('LOW'),at('HIGH')])]
    elif target=='pipeline16_mdac':checks=[check('Real SC half-MDAC produces nominal gain 2 (functional 50mV bound)',abs(at('OUT')-1.05)<.05,at('OUT'))]
    elif target=='pipeline16_stage':checks=[check('Real differential stage gain approximately 2 (functional 50mV bound)',abs(at('OUTP')-at('OUTN')-.3)<.05,at('OUTP')-at('OUTN'))]
    elif target=='pipeline16_flash':checks=[check('Final flash captures thermometer 011',at('Q0')>1.44 and at('Q1')>1.44 and at('Q2')<.36,[at('Q0'),at('Q1'),at('Q2')])]
    finish(run,p,folder,dict(checks=checks,scope='Standalone block with explicitly declared bias, load and clocks. Functional block criterion only; not a sixteen-bit ADC accuracy test.'),dict(block_context=target,frames=None),tool='ngspice')


def execute(server,run,p,folder,manifest,params):
    folder=Path(folder);kind=p['design_template']['id']
    config=A.settings({**p['testbench'],**{k:params[k]for k in native.TESTBENCH if k in params}});p={**p,'testbench':config}
    if config['analysis']!='tran':raise EDAError('ADC16_ANALYSIS','ADC16 replay fixtures require transient analysis; no AC/DC result is substituted.')
    if kind in('sar16_controller','sdm16_filter','pipeline16_align')and params.get('post_layout'):raise EDAError('ADC16_DIGITAL_PEX','Digital replay does not model extracted parasitics or transistor delay. Use pre-layout logical verification.')
    root_to_core={'sar_adc16':'sar16_analog','sigma_delta16':'sdm16_modulator','pipeline_adc16':'pipeline16_analog'}
    if kind in root_to_core:
        if params.get('post_layout'):raise EDAError('ADC16_FULL_PEX','Full ADC mask/interface extraction is not qualified. Inspect explicit block or core geometry first.')
        original=A.schematic(kind,p['design_template']['parameters'])
        if not matches_binding(p['schematic'],original):raise EDAError('ADC16_BINDING','Edited full mixed hierarchy needs explicit native analog/RTL re-binding; no unedited substitute is simulated.')
        ir=A.schematic(root_to_core[kind],p['design_template']['parameters']);p={**p,'cell':root_to_core[kind],'schematic':ir,'ports':ir['ports']}
    else:ir=p['schematic']
    if kind in ('sar_adc16','sar16_analog'):return sar(server,run,p,folder,manifest,params,ir)
    if kind in ('sigma_delta16','sdm16_modulator'):return sdm(server,run,p,folder,manifest,params,ir)
    if kind in ('pipeline_adc16','pipeline16_analog'):return pipeline(server,run,p,folder,manifest,params,ir)
    if kind in('sar16_controller','sdm16_filter','pipeline16_align'):return digital_block(server,run,p,folder,manifest)
    return block(server,run,p,folder,manifest,params,ir)
