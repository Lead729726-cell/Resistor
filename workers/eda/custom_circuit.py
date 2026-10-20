"""Explicit source circuits: actual OP/transient with bounded numeric excitation."""
from pathlib import Path
import re
import native,design_tools,conversion,source_stimulus
from geometry import EDAError

def prepare(p):
    resolved=conversion.resolved(p['schematic'])
    if any(d['kind']=='block' for d in resolved['devices']):
        import digital_units
        resolved.setdefault('ports',p['ports']);resolved=digital_units.flattened(resolved)
        if len(resolved['devices'])>4096:raise EDAError('CUSTOM_ANALYSIS_LIMIT','Custom hierarchical analysis supports at most 4096 primitives.')
    return {**p,'schematic':resolved}

def extracted_terminal_nodes(netlist,ports):
    # Distributed PEX replaces a logical node by distinct terminal nodes.
    # Read their actual names; never choose one or average them as the original.
    nodes=set(ports);active=False
    for row in Path(netlist).read_text().splitlines():
        f=row.split()
        if not f:continue
        if f[0].lower()=='.subckt':
            if active:raise EDAError('CUSTOM_PEX_HIERARCHY','Custom PEX trace requires a flat extracted top.')
            active=True;continue
        if f[0].lower().startswith('.ends'):active=False;continue
        if active and f[0][0].upper()=='X':
            i=next((i for i,v in enumerate(f[1:],1) if '=' in v),len(f));nodes.update(f[1:i-1])
    nodes.discard('0')
    if not nodes or len(nodes)>256:raise EDAError('CUSTOM_ANALYSIS_LIMIT','Custom PEX trace supports up to 256 actual primitive terminals and ports.')
    return sorted(nodes)

def declared_ports(netlist,cell,expected):
    # Magic may reorder ports. A positional subcircuit call must follow the
    # actual included declaration, while preserving the named external nets.
    text=re.sub(r'\r?\n[ \t]*\+[ \t]*',' ',Path(netlist).read_text())
    rows=re.findall(r'^[ \t]*\.subckt[ \t]+'+re.escape(cell)+r'(?:[ \t]+([^\n]*))?$',text,re.M|re.I)
    actual=rows[0].split() if len(rows)==1 else []
    if len(actual)!=len(expected) or len(set(actual))!=len(actual) or set(actual)!=set(expected):
        raise EDAError('PORT_MISMATCH','Included custom netlist ports differ from declared project ports.',{'expected':expected,'actual':actual})
    return actual

def spice_tb(p,folder,settings,netlist):
    analysis=settings['analysis']
    if analysis not in ('op','tran'):raise EDAError('CUSTOM_ANALYSIS','Direct custom-circuit analysis supports OP and PULSE/PWL/DC transient. Use port analysis setup for sweeps or AC.')
    sources=[d for d in p['schematic']['devices'] if d['kind'] in ('voltage','current')]
    sources+=p.get('conversion',{}).get('external_sources',[])
    if not sources:raise EDAError('EXPLICIT_BIAS_REQUIRED','입력·전원 소스를 배치하거나 해석 설정에서 포트 바이어스를 지정하세요. 임의의 전원을 넣지 않습니다.')
    if not any('0' in d['pins'].values() for d in sources):raise EDAError('EXPLICIT_GROUND_REQUIRED','GND(0)에 연결된 명시적 전원·입력 기준이 필요합니다.')
    source_stimulus.check_resolution(sources,settings)
    nodes=extracted_terminal_nodes(netlist,p['ports']) if settings.get('post_layout') else sorted({n for d in p['schematic']['devices'] for n in d['pins'].values() if n!='0'})
    if not nodes or len(nodes)>256:raise EDAError('CUSTOM_ANALYSIS_LIMIT','Custom numerical trace supports 1..256 actual nets.')
    if analysis=='tran' and any(d.get('stimulus') for d in sources) and settings['duration_s']/settings['step_s']*len(nodes)>2000000:raise EDAError('TRANSIENT_TRACE_LIMIT','Dynamic runs support at most 2 million nominal voltage samples; shorten duration, reduce scope or use an adequate larger time step.')
    modeled=any(d.get('model') for d in p['schematic']['devices'])
    deck=design_tools.supported_model_deck(folder,settings['corner']) if modeled else None
    actual_ports=declared_ports(netlist,p['cell'],p['ports'])
    lines=['Resistor explicit custom flat circuit',*([f'.include "{deck.as_posix()}"'] if deck else []),'.options scale=1e-6',f'.include "{Path(netlist).as_posix()}"',f'.temp {settings["temperature_C"]}', 'XU '+' '.join(actual_ports)+' '+p['cell']]
    for i,d in enumerate(p.get('conversion',{}).get('external_sources',[])):
        lines.append(('V' if d['kind']=='voltage' else 'I')+f'EXTERNAL{i} {d["pins"]["+"]} {d["pins"]["-"]} '+source_stimulus.emission(d))
    vectors=['v('+ (n if n in p['ports'] else 'xu.'+n)+')' for n in nodes]
    lines+=['.control','set wr_singlescale','set wr_vecnames','op' if analysis=='op' else f'tran {settings["step_s"]:.12g} {settings["duration_s"]:.12g} 0 {settings["step_s"]:.12g}']
    if analysis=='op':lines+=['let resistor_op_index = 0','setscale resistor_op_index']
    lines+=['wrdata waveform.dat '+' '.join(vectors),'write waveform.raw','quit','.endc','.end']
    return '\n'.join(lines)+'\n',nodes,['V']*len(nodes),'point' if analysis=='op' else 's','operating point' if analysis=='op' else 'time'
