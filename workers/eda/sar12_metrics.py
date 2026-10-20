"""Independent raw-code spectral and extraction audit; no DUT quantizer here."""
import cmath,math
from pathlib import Path
from collections import defaultdict
from geometry import EDAError
from pex_reduce import number

def display_trace(file,columns,max_points=12000,power_sources=None):
    file=Path(file)
    if file.stat().st_size>2*1024**3:raise EDAError('ADC_TRACE_LIMIT','Raw trace exceeds the bounded 2GiB analysis budget; split the test into smaller recorded batches.')
    with file.open() as f:next(f);count=sum(1 for line in f if line.strip())
    if not count or count>5000000:raise EDAError('ADC_TRACE_LIMIT','Use 1..5 million actual raw rows per job.')
    bucket=max(1,math.ceil(count/max(1,max_points//(2*columns))));chunk=[];selected=[];previous=None;observed=0;energy={k:0. for k in (power_sources or {})};minimum={};maximum={};start=None
    def flush():
        indices={0,len(chunk)-1}
        for col in range(1,columns):indices.update((min(range(len(chunk)),key=lambda i:chunk[i][col]),max(range(len(chunk)),key=lambda i:chunk[i][col])))
        selected.extend(chunk[i] for i in sorted(indices));chunk.clear()
    with file.open() as f:
        next(f)
        for line in f:
            if not line.strip():continue
            try:row=[float(v) for v in line.split()]
            except ValueError:raise EDAError('ADC_TRACE_INVALID','Raw trace contains non-numeric fields.')
            if len(row)!=columns or any(not math.isfinite(v) for v in row) or previous is not None and row[0]<=previous[0]:raise EDAError('ADC_TRACE_INVALID','Raw trace must have finite columns and strictly increasing actual times.')
            if start is None:start=row[0]
            for col,voltage in (power_sources or {}).items():
                minimum[col]=min(minimum.get(col,row[col]),row[col]);maximum[col]=max(maximum.get(col,row[col]),row[col])
                if previous is not None:energy[col]+=(row[0]-previous[0])*(row[col]+previous[col])*.5*voltage
            chunk.append(row);previous=row;observed+=1
            if len(chunk)>=bucket:flush()
    if chunk:flush()
    if observed!=count:raise EDAError('ADC_TRACE_CHANGED','Raw trace changed while it was independently read.')
    duration=previous[0]-start
    raw_power={str(col):{'energy_J':e,'average_power_W':e/duration if duration else None,'minimum_current_A':minimum[col],'peak_current_A':maximum[col],'source_voltage_V':power_sources[col]}for col,e in energy.items()}
    return selected,dict(raw_sample_count=count,display_sample_count=len(selected),start_s=start,end_s=previous[0],display_sampling='actual shared-axis bucket endpoints and extrema; original raw file retained',source_energy=raw_power,energy_method='signed trapezoidal integration of every raw adaptive-step sample; no clipping or display-thinned integration')

def coherent_spectrum(codes,fs,tone,bits=12):
    n=len(codes)
    if n not in (64,128,256,512,1024) or not math.isfinite(fs) or fs<=0 or not isinstance(tone,int) or not 0<tone<n//2 or math.gcd(tone,n)!=1:raise EDAError('ADC_SPECTRUM_RANGE','Use a bounded coherent sequence with explicit sample rate and coprime tone bin.')
    if any(isinstance(c,bool) or not isinstance(c,(int,float)) or not math.isfinite(c) or int(c)!=c or not 0<=c<2**bits for c in codes):raise EDAError('ADC_SPECTRUM_RANGE','Spectrum requires actual finite unsigned ADC output codes.')
    mean=math.fsum(codes)/n;values=[c-mean for c in codes];power={};amplitude={}
    for k in range(1,n//2+1):
        z=sum(x*cmath.exp(-2j*math.pi*k*i/n) for i,x in enumerate(values))/n
        power[k]=(1 if k==n//2 else 2)*abs(z)**2;amplitude[k]=(1 if k==n//2 else 2)*abs(z)
    signal=power[tone];residual=math.fsum(p for k,p in power.items() if k!=tone)
    if signal<=0 or residual<=0:raise EDAError('ADC_SPECTRUM_UNAVAILABLE','A DC or exact artificial sine cannot establish finite quantized SNDR.')
    largest=max(amplitude,key=amplitude.get)
    if largest!=tone:raise EDAError('ADC_WRONG_TONE','The measured dominant bin differs from the prescribed input tone.')
    sndr=10*math.log10(signal/residual);spur=max(a for k,a in amplitude.items() if k!=tone)
    return dict(sample_count=n,sample_rate_Hz=fs,tone_bin=tone,input_frequency_Hz=fs*tone/n,window='rectangular; coherent input',dc_code=mean,SNDR_dB=sndr,SFDR_dB=20*math.log10(amplitude[tone]/spur),ENOB_noiseless_bits=(sndr-1.76)/6.02,spectrum=[{'bin':k,'frequency_Hz':fs*k/n,'power_code2':p} for k,p in power.items()],scope='Derived only from actual deterministic output codes. Thermal/device noise, mismatch, clock jitter and silicon ENOB are excluded; no full-scale amplitude correction is applied.')

def coupling_audit(text):
    caps=[];ground=0.;mutual=0.;nets=defaultdict(float)
    for row in text.splitlines():
        f=row.split('$',1)[0].split()
        if not f or f[0].startswith(('*','.')) or f[0][0].lower()!='c':continue
        if len(f)!=4 or number(f[3],allow_zero=True) is None:raise EDAError('ADC_PEX_AUDIT','Unsupported extracted capacitor syntax; do not guess a capacitance.')
        value=number(f[3],allow_zero=True);a,b=f[1:3];g=any(v.lower() in ('0','vgnd','gnd','vss') for v in (a,b))
        caps.append({'name':f[0],'node1':a,'node2':b,'C_F':value,'grounded':g})
        if g:ground+=value
        else:mutual+=value
        nets[a]+=value;nets[b]+=value
    return dict(capacitor_count=len(caps),zero_valued_capacitors=sum(c['C_F']==0 for c in caps),ground_capacitance_F=ground,mutual_capacitance_F=mutual,largest_couplings=sorted([c for c in caps if not c['grounded']],key=lambda c:c['C_F'],reverse=True)[:30],net_incident_capacitance_F=dict(sorted(nets.items())),coupling_completeness='not-verified-against-independent-capacitance-only-extraction',scope='Tally of exactly retained native netlist capacitor records, including zero-valued native records; absence of mutual C does not establish coupling-free layout.')
