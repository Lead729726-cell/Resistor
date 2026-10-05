"""20-MOS 4:1 transmission-gate mux; owned stimuli, real-sample logic checks.

Physical generation uses installed SKY130 PCells and independently requires DRC/LVS.
The wide, deliberately separated routing is a reference layout, not a compact cell.
"""
import bisect
import math
from pathlib import Path
import subprocess
import klayout.db as k
import geometry as G
from geometry import EDAError
import profile
import templates

PORTS = ['D0', 'D1', 'D2', 'D3', 'S0', 'S1', 'Y', 'VPWR', 'VGND']
PROTOCOL = 'mux4-gray64-v1'


def schematic(w=.65, l=.15):
    devices = []
    def mos(name, kind, drain, gate, source, x, y):
        devices.append({'id':name.lower(), 'name':name, 'kind':kind,
            'model':'sky130_fd_pr__'+('nfet_01v8' if kind=='nmos' else 'pfet_01v8_hvt'),
            'pins':{'D':drain, 'G':gate, 'S':source, 'B':'VGND' if kind=='nmos' else 'VPWR'},
            'parameters':{'w_um':w, 'l_um':l, 'nf':1, 'm':1}, 'x':x, 'y':y})
    def inverter(tag, a, b, x, y):
        mos('MP_'+tag, 'pmos', b, a, 'VPWR', x, y)
        mos('MN_'+tag, 'nmos', b, a, 'VGND', x, y+140)
    def tg(tag, a, b, enable, disable, x, y):
        mos('MP_'+tag, 'pmos', b, disable, a, x, y)
        mos('MN_'+tag, 'nmos', b, enable, a, x, y+140)
    inverter('SEL0', 'S0', 'S0B', 210, 130)
    inverter('SEL1', 'S1', 'S1B', 210, 500)
    tg('D0', 'D0', 'N01', 'S0B', 'S0', 530, 130)
    tg('D1', 'D1', 'N01', 'S0', 'S0B', 530, 500)
    tg('D2', 'D2', 'N23', 'S0B', 'S0', 850, 130)
    tg('D3', 'D3', 'N23', 'S0', 'S0B', 850, 500)
    tg('LOW', 'N01', 'MUX_RAW', 'S1B', 'S1', 1170, 130)
    tg('HIGH', 'N23', 'MUX_RAW', 'S1', 'S1B', 1170, 500)
    inverter('BUF1', 'MUX_RAW', 'BUF_N', 1490, 130)
    inverter('BUF2', 'BUF_N', 'Y', 1810, 130)
    for i, port in enumerate(PORTS):
        devices.append({'id':'port_'+port, 'name':'PORT_'+port, 'kind':'port',
            'pins':{'P':port}, 'parameters':{}, 'x':210+i*190, 'y':900})
    return {'schema_version':1, 'connectivity_mode':'explicit', 'devices':devices,
            'wires':[], 'junctions':[], 'cells':{}}


def physical(folder, circuit=None, cell_name='mux4', ports=None):
    folder=Path(folder); folder.mkdir(parents=True,exist_ok=True)
    bases={}
    for kind in ('nfet_01v8','pfet_01v8_hvt'):
        f=folder/kind; f.mkdir(exist_ok=True); cell='core_'+kind
        script=f/'generate.tcl'
        script.write_text(f'load {cell}\nbox 0 0 0 0\n'
            f'set pars [sky130::sky130_fd_pr__{kind}_defaults]\n'
            'dict set pars w 0.65\ndict set pars l 0.15\ndict set pars viagate 0\n'
            f'sky130::sky130_fd_pr__{kind}_draw $pars\nsave {cell}\ngds write {cell}.gds\nquit -noprompt\n')
        result=subprocess.run(['magic','-dnull','-noconsole','-rcfile',str(profile.MAGIC_RC),str(script)],
            cwd=f,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=60)
        (f/'generator.log').write_text(result.stdout)
        if result.returncode or not (f/(cell+'.gds')).is_file():
            raise EDAError('ENGINE_FAILED','Installed public MOS PCell generation failed; native log retained.')
        source=k.Layout(); source.read(str(f/(cell+'.gds')))
        anchors={s.text.string:(s.text.x,s.text.y) for li in source.layer_indices()
            for s in source.cell(cell).shapes(li).each() if s.is_text() and s.text.string in ('D','G','S','B')}
        if source.dbu!=.001 or set(anchors)!=set('DGSB'):
            raise EDAError('PDK_MAPPING_FAILED','MOS PCell DBU/terminal labels differ from the supported layout adapter.')
        bases['nmos' if kind=='nfet_01v8' else 'pmos']=(source,source.cell(cell),anchors)
    v1=templates.via(folder/'via1','via1_core','via1')
    v2=templates.via(folder/'via2','via2_core','via2',280,280)
    layout=k.Layout(); layout.dbu=.001; top=layout.create_cell(cell_name)
    ir=circuit or schematic(); mos=[d for d in ir['devices'] if d['kind'] in ('nmos','pmos')]
    ports=ports or PORTS
    signal_nets=sorted({v for d in mos for v in d['pins'].values()}-{'VPWR','VGND'})
    rail_positions={net:[] for net in signal_nets+['VGND','VPWR']}
    for i,d in enumerate(mos):
        anchors=bases[d['kind']][2]
        for pin,offset in [('D',-800),('S',800),('G',1600),('B',anchors['B'][0])]:
            rail_positions[d['pins'][pin]].append(i*6000+offset)
    spans={net:(-1800 if net in ports else min(xs)-200,max(xs)+200) for net,xs in rail_positions.items()}
    # Reuse a track only when complete metal spans, including endpoint pads,
    # are disjoint with 600nm separation. Local NAND/latch nets no longer need
    # hundreds of unused vertical tracks. Global CLK/ports keep their full span.
    track_ends=[];rails={}
    for net in sorted(signal_nets,key=lambda n:(spans[n][0],spans[n][1],n)):
        left,right=spans[net]
        track=next((j for j,end in enumerate(track_ends) if end+600<=left),len(track_ends))
        if track==len(track_ends):track_ends.append(right)
        else:track_ends[track]=right
        rails[net]=3000+track*1000
    rails.update(VGND=-4000,VPWR=-5500)
    def shape(layer,primitive,net,ident=None):
        new=top.shapes(layout.layer(*layer)).insert(primitive); new.set_property(2,net)
        if ident:new.set_property(3,ident)
    def box(layer,x1,y1,x2,y2,net):shape(layer,k.Box(x1,y1,x2,y2),net)
    def route(layer,points,width,net):shape(layer,k.Path([k.Point(*p) for p in points],width),net)
    def via(src,cell,x,y,net):
        cutlayer=src.find_layer(68 if cell=='via1_core' else 69,44)
        bb=list(src.cell(cell).shapes(cutlayer).each())[0].bbox()
        trans=k.Trans(x-(bb.left+bb.right)//2,y-(bb.bottom+bb.top)//2)
        for li in src.layer_indices():
            info=src.get_info(li)
            for s in src.cell(cell).shapes(li).each():
                shape((info.layer,info.datatype),s.text.transformed(trans) if s.is_text() else G.shape_poly(s).transformed(trans),net)
    for i, d in enumerate(mos):
        cx=i*6000; pins=d['pins']; src,cell,anchors=bases[d['kind']]; trans=k.Trans(cx,0)
        for li in src.layer_indices():
            info=src.get_info(li)
            if info.datatype==16:continue
            for s in cell.shapes(li).each():
                if s.is_text():
                    primitive=s.text.transformed(trans); primitive.string=pins.get(primitive.string,primitive.string)
                else:primitive=G.shape_poly(s).transformed(trans)
                shape((info.layer,info.datatype),primitive,pins.get(s.text.string,'') if s.is_text() else '',d['id'])
        for pin,offset in (('D',-800),('S',800)):
            px,py=anchors[pin]; x=cx+offset; net=pins[pin]
            route((68,20),[(cx+px,py),(x,py)],170,net)
            via(v1,'via1_core',x,py,net)
            route((69,20),[(x,py),(x,rails[net])],360,net)
            via(v2,'via2_core',x,rails[net],net)
        for pin in ('G','B'):
            px,py=anchors[pin]; x=cx+px; net=pins[pin]
            y=py+170 if pin=='G' else py
            if pin=='G':box((67,20),x-85,py-85,x+85,y+85,net)
            box((67,44),x-85,y-85,x+85,y+85,net)
            box((68,20),x-200,y-200,x+200,y+200,net)
            if pin=='G':
                # Gate and body anchors share X in the public PCell. A gate tied
                # to VGND/VPWR must not cross the body's M2 power track. Escape
                # in M1 first; D/S tracks are at +/-800 and body stays at X=0.
                escape=cx+1600
                route((68,20),[(x,y),(escape,y)],170,net)
                x=escape
            via(v1,'via1_core',x,y,net)
            route((69,20),[(x,y),(x,rails[net])],360,net)
            via(v2,'via2_core',x,rails[net],net)
    for net,y in rails.items():
        # An internal net only needs the span of its real fanout. Extending
        # every local NAND/DFF net across the entire CPU creates large unused
        # metal stubs and unnecessary distributed RC. Top ports retain their
        # left-edge pin landing; supply nets still reach every body contact.
        left,right=spans[net]
        route((70,20),[(left,y),(right,y)],400,net)
        if net in ports:
            shape((70,5),k.Text(net,k.Trans(-1800,y)),net)
            box((70,16),-2000,y-200,-1600,y+200,net)
    G.assign_ids(layout)
    return layout,{**ir,'devices':mos},ports


def cases():
    return [{'index':s*16+i,'select':s,'pattern':i^(i>>1),
             'expected':((i^(i>>1))>>s)&1} for s in range(4) for i in range(16)]


def stimuli(settings,parameters):
    supply=settings['supply_V']; slot=parameters['slot_ns']*1e-9; rise=parameters['rise_ns']*1e-9
    rows=cases(); sources=['VDD VPWR VGND '+format(supply,'.12g')]
    names=['D0','D1','D2','D3','S0','S1','Y','supply_current']
    vectors=['v('+n+')' for n in names[:-1]]+['-i(VDD)']
    for pin in names[:6]:
        def level(row):
            return ((row['pattern']>>int(pin[1]))&1) if pin[0]=='D' else ((row['select']>>int(pin[1]))&1)
        last=level(rows[0])*supply; points=[(0,last)]
        for row in rows[1:]:
            new=level(row)*supply
            if new!=last:
                points.extend([(row['index']*slot,last),(row['index']*slot+rise,new)])
                last=new
        points.append((len(rows)*slot,last))
        sources.append('V'+pin+' '+pin+' VGND PWL('+ ' '.join(f'{t:.12g} {v:.12g}' for t,v in points)+')')
    sources.append(f'CLOAD Y VGND {settings["load_F"]:.12g}')
    return sources,names,vectors,['V']*7+['A'],None


def verify(run,settings,parameters):
    """Require the actual input matrix and settled output window, not just final Y."""
    waves={w['name']:w for w in run.get('waveforms',[])}
    required=('D0','D1','D2','D3','S0','S1','Y','supply_current')
    if any(n not in waves for n in required):raise EDAError('MISSING_WAVEFORM','MUX verification requires all actual input/output/current traces.')
    supply=settings['supply_V']; slot=parameters['slot_ns']*1e-9
    rows=[]; delays={'rise':[],'fall':[]}; complete=True
    def interpolate(w,t):
        x,y=w['x'],w['y']; j=bisect.bisect_left(x,t)
        if j==len(x) or t<x[0]:return None
        if not j or x[j]==t:return y[j]
        return y[j-1]+(y[j]-y[j-1])*(t-x[j-1])/(x[j]-x[j-1])
    def bit(v):return 0 if v is not None and v<=.3*supply else 1 if v is not None and v>=.7*supply else None
    def crossing(w,start,end,rising):
        x,y=w['x'],w['y']; a=max(1,bisect.bisect_left(x,start)); b=bisect.bisect_right(x,end)
        for j in range(a,b):
            if (y[j-1]<supply/2<=y[j]) if rising else (y[j-1]>supply/2>=y[j]):
                return x[j-1]+(supply/2-y[j-1])*(x[j]-x[j-1])/(y[j]-y[j-1])
        return None
    expected_cases=cases()
    for row in expected_cases:
        t=(row['index']+.85)*slot; values={n:interpolate(waves[n],t) for n in required[:7]}
        actual_inputs=[bit(values[n]) for n in required[:6]]
        expected_inputs=[(row['pattern']>>i)&1 for i in range(4)]+[row['select']&1,row['select']>>1]
        w=waves['Y']; a=bisect.bisect_left(w['x'],(row['index']+.7)*slot); b=bisect.bisect_right(w['x'],(row['index']+.95)*slot)
        window=w['y'][a:b]; valid=bool(window) and all(bit(v)==row['expected'] for v in window)
        passed=actual_inputs==expected_inputs and bit(values['Y'])==row['expected'] and valid
        if any(v is None for v in values.values()):complete=False
        rows.append({**row,'sample_time_s':t,'inputs_V':values,'actual':bit(values['Y']),
            'output_min_V':min(window) if window else None,'output_max_V':max(window) if window else None,'pass':passed})
        if row['index']:
            old=expected_cases[row['index']-1]
            if old['select']==row['select'] and old['expected']!=row['expected']:
                start=row['index']*slot; end=(row['index']+1)*slot; rising=bool(row['expected'])
                ti=crossing(waves['D'+str(row['select'])],start,end,rising)
                to=crossing(waves['Y'],start,end,rising)
                if ti is not None and to is not None and to>=ti:delays['rise' if rising else 'fall'].append(to-ti)
    w=waves['supply_current']; energy=sum((b-a)*(u+v)*.5*supply for a,b,u,v in zip(w['x'],w['x'][1:],w['y'],w['y'][1:]))
    result={'schema_version':1,'protocol':PROTOCOL,'source':'actual-ngspice-input-and-output-samples',
        'expected_cases':64,'passed_cases':sum(r['pass'] for r in rows),'complete':complete,
        'pass':complete and all(r['pass'] for r in rows),'logic_low_max_V':.3*supply,'logic_high_min_V':.7*supply,
        'settled_window_fraction':[.7,.95],'rows':rows,'data_delays_s':delays,
        'stimulus_energy_J':energy,'delay_scope':'Only same-selection, single Gray data transitions; half-VDD interpolation. Not STA or hazard-free certification.'}
    run['digital_verification']=result
    m=run['measurements']; m.update(truth_cases=64,truth_passed=result['passed_cases'],truth_status='pass' if result['pass'] else 'fail',
        tpLH_max_s=max(delays['rise']) if delays['rise'] else None,tpHL_max_s=max(delays['fall']) if delays['fall'] else None,
        stimulus_energy_J=energy,stimulus_mean_power_W=energy/(w['x'][-1]-w['x'][0]),protocol=PROTOCOL)
    return result
