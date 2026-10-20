"""Revision-bound multi-language digital design, native jobs and editable CMOS bridge."""
import copy, hashlib, json, math, re, shutil, uuid
from pathlib import Path
import klayout.db as k
import native, digital_units as D, profile, physical_library, floorplan, c_hardware
import geometry as G
import runtime_resources
from geometry import EDAError

S=None
IDENT=re.compile(r'[A-Za-z_][A-Za-z0-9_]{0,63}\Z')
LANGS={'verilog':('.v',),'systemverilog':('.sv',),'vhdl':('.vhd','.vhdl'),'c':('.c',),'spice':('.sp','.spice','.cir'),'rtlil':('.il',),'blif':('.blif',),'data':('.mem','.hex')}
LIMITS={'files':32,'source_bytes':1048576,'vectors':512,'gates':20000,'physical_primitives':512,'trace_events':100000}
RESERVED_FILES={'gates.v','vhdl-generated.v','c-generated.v','vector_tb.sv','simcells.v','oracle.c','reference.spice','testbench.spice','supported-tt.spice'}

def configure(server):
    global S
    S=server

def digest(v):return hashlib.sha256(json.dumps(v,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()
def ident(v):
    if not isinstance(v,str) or not IDENT.fullmatch(v) or v in ('VPWR','VGND','resistor_vector_tb'):raise EDAError('HDL_NAME','Use a bounded HDL identifier; VPWR/VGND are reserved physical supplies.')
    return v
def keys(v,allowed):
    if not isinstance(v,dict) or set(v)-set(allowed):raise EDAError('HDL_PARAMETER','Unknown HDL request fields.')

def validate(spec):
    keys(spec,('top','files','vectors','step_ns','vhdl_entity','chip_limits'))
    top=ident(spec.get('top'));files=spec.get('files');total=0;names=set();out=[]
    if not isinstance(files,list) or not 1<=len(files)<=LIMITS['files']:raise EDAError('HDL_FILES','Provide 1..32 source files.')
    for f in files:
        keys(f,('name','language','text'));name=f.get('name');lang=f.get('language');text=f.get('text')
        if lang not in LANGS or not isinstance(name,str) or not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_.-]{0,95}',name) or not name.lower().endswith(LANGS[lang]) or '..' in name or name.casefold() in names:raise EDAError('HDL_FILE_NAME','Use unique local filenames with the selected language extension; no directories.')
        if name.casefold() in RESERVED_FILES:raise EDAError('HDL_FILE_NAME','This filename is reserved for native runner outputs. Rename the input file in the source editor: '+name)
        if not isinstance(text,str) or '\0' in text:raise EDAError('HDL_SOURCE','Source must be UTF-8 text without NUL.')
        names.add(name.casefold());total+=len(text.encode());out.append(dict(f))
    if total>LIMITS['source_bytes']:raise EDAError('HDL_SIZE','Combined source exceeds 1 MiB.')
    for f in out:
        t=f['text'];lang=f['language']
        if lang in ('verilog','systemverilog'):
            t=re.sub(r'/\*.*?\*/|//[^\n]*','',t,flags=re.S)
            if re.search(r'`include',t):raise EDAError('HDL_INCLUDE','Add source files to the project instead of filesystem `include directives.')
            for task in re.findall(r'\$([A-Za-z_][A-Za-z0-9_]*)',t):
                if task not in ('clog2','bits','signed','unsigned','readmemh','readmemb'):raise EDAError('HDL_TASK','Design sources cannot execute system/file/testbench tasks: $'+task)
            for name in re.findall(r'\$readmem[hb]\s*\(\s*"([^"]+)"',t):
                if name.casefold() not in names or '/' in name or '\\' in name:raise EDAError('HDL_INCLUDE','Memory initialization must reference a supplied local data file.')
            if len(re.findall(r'\$readmem[hb]\s*\(',t))!=len(re.findall(r'\$readmem[hb]\s*\(\s*"[^"]+"',t)):raise EDAError('HDL_INCLUDE','Memory filenames must be constant local strings.')
        if lang=='vhdl' and re.search(r'\b(file|foreign)\b',re.sub(r'--[^\n]*','',t),re.I):raise EDAError('HDL_IO','VHDL filesystem and foreign-code bindings are not design inputs.')
        if lang=='blif' and re.search(r'^\s*\.(include|search)\b',t,re.M|re.I):raise EDAError('HDL_INCLUDE','BLIF external files are unsupported.')
    kinds={f['language'] for f in out}-{'data'}
    if not kinds:raise EDAError('HDL_SOURCE','Data files initialize a design; include at least one HDL/C/SPICE source.')
    if ('c' in kinds or 'spice' in kinds) and (len(kinds)!=1 or len(out)!=1):raise EDAError('HDL_LANGUAGE','C hardware and flat SPICE imports each require one file; HDL sources may be combined.')
    step=spec.get('step_ns',10)
    if isinstance(step,bool) or not isinstance(step,(float,int)) or not math.isfinite(step) or not 1<=step<=10000:raise EDAError('HDL_STEP','Vector step must be 1..10000 ns.')
    vectors=spec.get('vectors',[])
    if not isinstance(vectors,list) or len(vectors)>LIMITS['vectors']:raise EDAError('HDL_VECTORS','At most 512 vectors.')
    for row in vectors:
        keys(row,('inputs','expect'))
        if not isinstance(row.get('inputs'),dict) or not isinstance(row.get('expect',{}),dict):raise EDAError('HDL_VECTORS','Each vector needs inputs and an optional expect object.')
        for name,value in {**row['inputs'],**row.get('expect',{})}.items():
            ident(name)
            if not isinstance(value,str) or not re.fullmatch(r'(?:[0-9]+|0[xX][0-9a-fA-F]+|0[bB][01]+)',value) or len(value)>80:raise EDAError('HDL_VALUE','Use unsigned decimal/0x/0b strings, preserving wide integer precision.')
    return {'top':top,'files':out,'step_ns':step,'vectors':copy.deepcopy(vectors),'chip_limits':floorplan.specification(floorplan.policy(spec.get('chip_limits',{'width_um':1000,'height_um':1000,'max_area_um2':1000000,'edge_um':10}))),**({'vhdl_entity':ident(spec['vhdl_entity'])} if spec.get('vhdl_entity') else {})}

def catalog():
    tools={n:{'available':bool(shutil.which(n))} for n in ('yosys','iverilog','vvp','ghdl','gcc','ngspice','magic','openroad')}
    try:import pycparser;tools['pycparser']={'available':True,'version':pycparser.__version__}
    except ImportError:tools['pycparser']={'available':False}
    return {'schema_version':1,'tools':tools,'languages':list(LANGS),'limits':LIMITS,'external_frontends':{'SystemC/C++':'Export synthesizable Verilog from a separately licensed/installed HLS frontend.','Chisel/SpinalHDL':'Import emitted Verilog/SystemVerilog.','Bluespec':'Import compiler-generated Verilog.','Verilog-AMS':'Analog/mixed behavioral models require a separately configured compatible simulator; not silently accepted as RTL.'},'scope':'Native synthesis/vector simulation; bounded public SKY130 CMOS reference layout, not industrial timing closure or foundry signoff.'}

def create(params):
    keys(params,('name','design','command_id'));spec=validate(params.get('design'));name=params.get('name','HDL '+spec['top'])
    if not isinstance(name,str) or not name.strip() or len(name)>128 or not params.get('command_id'):raise EDAError('HDL_NAME','A project name and command_id are required.')
    def action():
        p=S.create({'example':'schematic','name':name});l=S.load_layout(p);old=p['revision'];p.update(revision=p['next_revision'],next_revision=p['next_revision']+1,undo_stack=[old],hdl_design=spec)
        return S.commit(p,l,parent=old)
    return S.mutate('hdl.create',params,action)

def save(params):
    keys(params,('project_id','expected_revision','command_id','design'));spec=validate(params.get('design'))
    if 'expected_revision' not in params or not params.get('command_id'):raise EDAError('HDL_REVISION','Revision and command_id required.')
    def action():
        p=S.get_project(params['project_id']);l=S.load_layout(p);old=p['revision'];p.update(revision=p['next_revision'],next_revision=p['next_revision']+1,undo_stack=p.get('undo_stack',[])+[old],redo_stack=[],hdl_design=spec);return S.commit(p,l,parent=old)
    return S.mutate('hdl.save',params,action)

def new_assembly(params):
    keys(params,('name','top','chip_limits','command_id'));top=ident(params.get('top','SOC_TOP'));limits=floorplan.policy(params.get('chip_limits'))
    if not params.get('command_id'):raise EDAError('HDL_REVISION','Creating an assembly requires a command_id.')
    name=params.get('name','Mixed-signal SoC')
    if not isinstance(name,str) or not name.strip() or len(name)>128:raise EDAError('HDL_NAME','Assembly name is required, up to 128 characters.')
    def action():
        p=S.create({'example':'schematic','name':name});l=S.load_layout(p);l.cell(p['cell']).name=top;old=p['revision']
        p.update(cell=top,ports=['VPWR','VGND'],schematic={**D.cell(['VPWR','VGND']),'cells':{}},chip_limits=limits,revision=p['next_revision'],next_revision=p['next_revision']+1,undo_stack=[old],mixed_signal={'kind':'hierarchical-assembly','inter_block_routing':'not-run','combined_verification':'not-run'})
        return S.commit(p,l,parent=old)
    return S.mutate('hdl.new_assembly',params,action)

def start(params):
    keys(params,('project_id','expected_revision','action'))
    with S.LOCK:
        p=S.get_project(params['project_id'])
        if params.get('expected_revision')!=p['revision']:raise EDAError('REVISION_CONFLICT','Save/reload the current revision before running.')
        validate(p.get('hdl_design'));action=params.get('action')
        if action not in ('simulate','synthesize','physical'):raise EDAError('HDL_ACTION','Select simulate, synthesize or physical.')
        rid=uuid.uuid4().hex;folder=S.STATE/'runs'/rid;folder.mkdir(parents=True)
        shutil.copyfile(S.snapshot_dir(p)/'layout.oas',folder/'input.oas');S.dump(folder/'project.json',p)
        run={'id':rid,'project_id':p['id'],'kind':'hdl-'+action,'revision':p['revision'],'execution_status':'queued','analysis_result':'unknown','freshness':'current','input_signature':S.input_signature(),'artifacts':{},'manifest_path':str(folder/'manifest.json')}
        S.put_run(run);S.POOL.submit(S.execute_job,run,p,{'_hdl':{'action':action}},folder);return run

def yosys_ir(data,top):
    mod=data['modules'][top];ports=mod['ports'];cells=D.make_library();buf=D.cell(['A','Y','VPWR','VGND'])
    D.block(buf,cells,'INV','I0',{'A':'A','Y':'N'});D.block(buf,cells,'INV','I1',{'A':'N','Y':'Y'});cells['BUF']=buf
    for kind,base,inv in [('OR2','NAND2',True),('NOR2','AND2',True),('XNOR2','XOR2',False)]:
        c=D.cell(['A','B','Y','VPWR','VGND'])
        if inv:
            D.block(c,cells,'INV','IA',{'A':'A','Y':'NA'});D.block(c,cells,'INV','IB',{'A':'B','Y':'NB'});D.block(c,cells,base,'G',{'A0':'NA','A1':'NB','Y':'Y'} if base=='NAND2' else {'A':'NA','B':'NB','Y':'Y'})
        else:D.block(c,cells,base,'G',{'A':'A','B':'B','Y':'N'});D.block(c,cells,'INV','I',{'A':'N','Y':'Y'})
        cells[kind]=c
    physical_ports=[];mapping={};names=set()
    for name,port in ports.items():
        ident(name)
        if port['direction'] not in ('input','output'):raise EDAError('HDL_INOUT','Tri-state/inout ports need an explicit I/O-cell adapter.')
        width=len(port['bits'])
        if not 1<=width<=256:raise EDAError('HDL_WIDTH','Editable CMOS bridge supports ports of 1..256 bits.')
        mapping[name]=[name if width==1 else name+'_'+str(port.get('offset',0)+(width-1-i if port.get('upto',0) else i)) for i in range(width)]
        for n in mapping[name]:
            if n in names:raise EDAError('HDL_ALIAS','Port bit names collide after scalarization.')
            names.add(n);physical_ports.append(n)
    ir=D.cell(physical_ports+['VPWR','VGND']);nets={}
    for name,port in ports.items():
        if port['direction']=='input':
            for bit,n in zip(port['bits'],mapping[name]):
                if not isinstance(bit,int) or bit in nets:raise EDAError('HDL_ALIAS','Duplicate/constant input alias needs an explicit wrapper.')
                nets[bit]=n
    def net(bit):
        if bit=='0':return 'VGND'
        if bit=='1':return 'VPWR'
        if not isinstance(bit,int):raise EDAError('HDL_UNKNOWN','Unresolved X/Z cannot become a physical logic constant.')
        return nets.get(bit,'N_'+str(bit))
    if len(mod.get('cells',{}))>LIMITS['gates']:raise EDAError('HDL_GATE_LIMIT','Synthesis exceeds editable gate limit.')
    translations={'$_NOT_':('INV',{'A':'A','Y':'Y'}),'$_BUF_':('BUF',{'A':'A','Y':'Y'}),'$_AND_':('AND2',{'A':'A','B':'B','Y':'Y'}),'$_NAND_':('NAND2',{'A':'A0','B':'A1','Y':'Y'}),'$_OR_':('OR2',{'A':'A','B':'B','Y':'Y'}),'$_NOR_':('NOR2',{'A':'A','B':'B','Y':'Y'}),'$_XOR_':('XOR2',{'A':'A','B':'B','Y':'Y'}),'$_XNOR_':('XNOR2',{'A':'A','B':'B','Y':'Y'}),'$_MUX_':('MUX2',{'A':'A','B':'B','S':'S','Y':'Y'}),'$_DFF_P_':('DFF',{'C':'CLK','D':'D','Q':'Q'})}
    unsupported=sorted({c['type'] for c in mod.get('cells',{}).values()}-set(translations))
    if unsupported:raise EDAError('HDL_CELL_UNSUPPORTED','No verified editable CMOS mapping for: '+', '.join(unsupported)+'. Use synchronous active-high registers or an explicit wrapper; source and native synthesized artifacts remain retained.')
    for i,c in enumerate(mod.get('cells',{}).values()):
        kind,pins=translations[c['type']];D.block(ir,cells,kind,'G'+str(i),{dst:net(c['connections'][src][0]) for src,dst in pins.items()})
    for name,port in ports.items():
        if port['direction']=='output':
            for i,(bit,dst) in enumerate(zip(port['bits'],mapping[name])):D.block(ir,cells,'BUF','OUT_'+name+'_'+str(i),{'A':net(bit),'Y':dst})
    used=set()
    def retain(node):
        for d in node['devices']:
            if d['kind']=='block' and d['cell_name'] not in used:used.add(d['cell_name']);retain(cells[d['cell_name']])
    retain(ir);ir['cells']={name:c for name,c in cells.items() if name in used}
    # These are our verified CMOS library ports, not guessed user HDL names.
    for node in [ir,*ir['cells'].values()]:
        for device in node['devices']:
            if device['kind']=='block':device['pin_roles']={pin:'power' if pin in ('VPWR','VGND') else 'output' if pin in ('Y','Q') else 'input' for pin in device['pins']}
    check=native.validate(ir)
    if not check['valid']:raise EDAError('HDL_GRAPH','Synthesized CMOS graph failed validation.',check)
    return ir,mapping

def parse_vcd(text):
    scale=1e-9;decl={};events={};time=0.;header=True
    match=re.search(r'\$timescale\s+(\d+)\s*(s|ms|us|ns|ps|fs)\s+\$end',text)
    if match:scale=int(match[1])*{'s':1,'ms':1e-3,'us':1e-6,'ns':1e-9,'ps':1e-12,'fs':1e-15}[match[2]]
    for line in text.splitlines():
        f=line.split()
        if not f:continue
        if f[0]=='$var':
            if len(decl)>2048:raise EDAError('HDL_TRACE_LIMIT','VCD signal limit exceeded.')
            decl.setdefault(f[3],{'name':f[4],'width':int(f[2])});events.setdefault(f[3],[])
        if f[0]=='$enddefinitions':header=False
        if header:continue
        if line.startswith('#'):time=int(line[1:])*scale
        elif line[0] in '01xXzZ':
            code=line[1:].strip();value=line[0].lower()
            if code in events:events[code].append([time,value])
        elif line[0] in 'bB' and len(f)==2:
            if f[1] in events:events[f[1]].append([time,f[0][1:].lower()])
    if sum(map(len,events.values()))>LIMITS['trace_events']:raise EDAError('HDL_TRACE_LIMIT','VCD event limit exceeded; raw file retained.')
    return [{**d,'events':events[c],'end_s':time} for c,d in decl.items() if events[c]]

def simulate(run,spec,ports,folder,manifest,files,cinfo=None):
    rows=copy.deepcopy(spec['vectors'])
    if not rows:raise EDAError('HDL_VECTORS','Provide actual input vectors; no default PASS or invented stimulus.')
    inputs={n:p for n,p in ports.items() if p['direction']=='input'};outputs={n:p for n,p in ports.items() if p['direction']=='output'}
    def val(s,w):
        v=int(s,16 if s.lower().startswith('0x') else 2 if s.lower().startswith('0b') else 10)
        if v>=1<<w:raise EDAError('HDL_VALUE','Value does not fit the actual synthesized port width.')
        return v
    for row in rows:
        if set(row['inputs'])!=set(inputs) or set(row.get('expect',{}))-set(outputs):raise EDAError('HDL_VECTORS','Supply every input for every vector and only known output names in expect.')
        for n,v in {**row['inputs'],**row.get('expect',{})}.items():val(v,len(ports[n]['bits']))
    if cinfo:
        body=cinfo['c_source']+'\n#include <stdio.h>\n_Static_assert(sizeof(unsigned int)==4,"Host oracle requires 32-bit unsigned int");\nint main(void){\n'
        for row in rows:body+='printf("%u\\n", (unsigned)'+spec['top']+'('+','.join(str(val(row['inputs'][n],32))+'u' for n in cinfo['inputs'])+'));\n'
        (folder/'oracle.c').write_text(body+'return 0;}\n');S.process(run,folder,['gcc','-std=c11','-O0','oracle.c','-o','oracle'],'gcc-oracle-compile',manifest)
        log=S.process(run,folder,[str(folder/'oracle')],'gcc-oracle',manifest);oracle=log.strip().splitlines()
        if len(oracle)!=len(rows):raise EDAError('C_ORACLE','Unexpected GCC oracle output.')
        for row,value in zip(rows,oracle):
            if 'result' in row.get('expect',{}) and val(row['expect']['result'],32)!=int(value):raise EDAError('C_EXPECTATION','User expectation disagrees with independently compiled C.')
            row.setdefault('expect',{})['result']=value
    lines=['`timescale 1ns/1ps','module resistor_vector_tb;']
    for n,p in ports.items():lines.append(('reg' if p['direction']=='input' else 'wire')+' ['+str(len(p['bits'])-1)+':0] '+n+';')
    lines+=[spec['top']+' dut('+','.join('.'+n+'('+n+')' for n in ports)+');','initial begin','$dumpfile("digital.vcd"); $dumpvars(1,resistor_vector_tb);']
    checks=0
    for i,row in enumerate(rows):
        lines.extend(n+' = '+str(len(inputs[n]['bits']))+"'h"+format(val(v,len(inputs[n]['bits'])),'x')+';' for n,v in row['inputs'].items())
        lines.append('#'+str(spec['step_ns'])+';')
        for n,v in row.get('expect',{}).items():
            lines.append('if ('+n+' !== '+str(len(outputs[n]['bits']))+"'h"+format(val(v,len(outputs[n]['bits'])),'x')+') $fatal(1,"vector '+str(i)+' output '+n+' mismatch or X/Z");');checks+=1
    lines+=['$display("RESISTOR_VECTOR_COMPLETE checks='+str(checks)+'"); $finish;','end','endmodule'];(folder/'vector_tb.sv').write_text('\n'.join(lines)+'\n')
    S.process(run,folder,['iverilog','-g2012','-s','resistor_vector_tb','-o','digital.vvp',*files,'vector_tb.sv'],'iverilog',manifest)
    log=S.process(run,folder,['vvp','digital.vvp'],'vvp',manifest)
    if 'RESISTOR_VECTOR_COMPLETE checks='+str(checks) not in log:raise EDAError('HDL_INCOMPLETE','Simulator did not confirm completion.')
    if (folder/'digital.vcd').stat().st_size>32*1024*1024:raise EDAError('HDL_TRACE_LIMIT','VCD exceeds 32 MiB; original retained, no partial analysis PASS.')
    traces=parse_vcd((folder/'digital.vcd').read_text());S.dump(folder/'digital-traces.json',traces)
    run.update(analysis_result='pass' if checks else 'unknown',measurements={'vectors':len(rows),'assertions':checks,'c_oracle_checked':bool(cinfo),'scope':'Actual source-level/native-translated digital vectors, not transistor timing or physical signoff.'})
    return traces,checks

def execute(run,p,folder,manifest,request):
    spec=validate(p['hdl_design']);action=request['action'];top=spec['top'];cinfo=None;files=[]
    manifest['hdl_source_hash']=digest(spec);manifest['hdl_tools']={}
    def require(name):
        exe=shutil.which(name)
        if not exe:raise EDAError('TOOL_MISSING','Install/connect '+name+'; no replacement result is generated.')
        manifest['hdl_tools'][name]={'path':exe,'sha256':profile.sha(exe)}
        if name!='magic':manifest['hdl_tools'][name]['version']=S.process(run,folder,[exe,'-V' if name in ('yosys','iverilog','vvp') else '--version'],name+'-version',manifest,timeout=20)[:1600]
    for f in spec['files']:(folder/f['name']).write_text(f['text'],encoding='utf-8')
    if spec['files'][0]['language']=='spice':
        import conversion
        parsed=conversion.parse_extracted(spec['files'][0]['text'],top)
        if not parsed['ready'] or parsed['losses']:raise EDAError('SPICE_IMPORT','Flat SPICE contains unsupported devices/directives or parameter losses.',parsed['issues']+parsed['losses'])
        ir=parsed['schematic'];mapping={n:[n] for n in ir['ports']};ports={n:{'direction':'unknown','bits':[i]} for i,n in enumerate(ir['ports'])}
        if action=='simulate':raise EDAError('SPICE_SETUP_REQUIRED','Apply the imported circuit, configure explicit analog sources/testbench, then run native Simulation. A SPICE port direction is not guessed.')
        run['tool']='Native SPICE parser'
    else:
        require('yosys')
        vhdl=[f['name'] for f in spec['files'] if f['language']=='vhdl']
        if vhdl:
            require('ghdl');dest=folder/'vhdl-generated.v';S.process(run,folder,['ghdl','--synth','--std=08','--out=verilog',*vhdl,'-e',spec.get('vhdl_entity',top)],'ghdl-synthesis',manifest,stdout_path=dest);files.append(dest.name)
        cfile=next((f for f in spec['files'] if f['language']=='c'),None)
        if cfile:
            cinfo=c_hardware.lower(cfile['text'],top);(folder/'c-generated.v').write_text(cinfo['verilog']);files.append('c-generated.v')
        files.extend(f['name'] for f in spec['files'] if f['language'] in ('verilog','systemverilog'))
        script=['read_verilog -sv '+f for f in files]
        script.extend('read_'+('ilang' if f['language']=='rtlil' else 'blif')+' '+f['name'] for f in spec['files'] if f['language'] in ('rtlil','blif'))
        script+=['hierarchy -check -top '+top,'proc','flatten','synth -top '+top+' -noabc','dffunmap','abc -g simple','clean','check -assert','write_json synthesized.json','write_verilog -noattr gates.v']
        (folder/'synthesis.ys').write_text('\n'.join(script)+'\n');S.process(run,folder,['yosys','-s','synthesis.ys'],'yosys',manifest,timeout=180)
        if (folder/'synthesized.json').stat().st_size>32*1024*1024:raise EDAError('HDL_GATE_LIMIT','Synthesized graph exceeds the 32 MiB analysis limit; native output retained.')
        data=json.loads((folder/'synthesized.json').read_text());ports=data['modules'][top]['ports']
        if len(data['modules'][top].get('cells',{}))>LIMITS['gates'] or len(ports)>128 or sum(len(v['bits']) for v in ports.values())>8192:raise EDAError('HDL_GATE_LIMIT','Design exceeds 20000 gates, 128 top ports or 8192 port bits; partition the design or use an external implementation backend.')
        for n,port in ports.items():
            ident(n)
            if port['direction'] not in ('input','output') or not 1<=len(port['bits'])<=256:raise EDAError('HDL_WIDTH','Vector bridge supports scalar/packed input/output ports of 1..256 bits; explicit I/O-cell adapters are required for inout.')
        run['tool']='Yosys'+(' + GHDL' if vhdl else '')+(' + C uint32 frontend' if cinfo else '')
        if action=='simulate':
            require('iverilog');require('vvp')
            if cinfo:require('gcc')
            # RTLIL/BLIF have no native Icarus source; use their actual mapped gates.
            if not files:files=['gates.v','simcells.v'];src=runtime_resources.yosys_simcells()
            if files==['gates.v','simcells.v']:
                if not src.is_file():raise EDAError('TOOL_MISSING','Yosys simcells.v is required for gate-level simulation.')
                shutil.copyfile(src,folder/'simcells.v')
            traces,checks=simulate(run,spec,ports,folder,manifest,files,cinfo);report={'source_hash':digest(spec),'action':action,'ports':ports,'traces':traces,'assertions':checks,'verification_scope':run['measurements']['scope'],'manufacturing_signoff':False};S.dump(folder/'hdl-report.json',report);run['artifacts'].update(hdl_report=str(folder/'hdl-report.json'),vcd=str(folder/'digital.vcd'));run['message']='Actual digital vector execution completed; '+str(checks)+' output assertions.';return
        ir,mapping=yosys_ir(data,top)
    flat=D.flattened(ir);report={'source_hash':digest(spec),'action':action,'top':top,'ports':ports,'port_mapping':mapping,'gate_instances':len(ir['devices']),'primitive_count':len(flat['devices']),'chip_limits':spec['chip_limits'],'manufacturing_signoff':False,'physical_verification':{'drc':'not-run','lvs':'not-run','pex':'not-run'},'layout_generated':False,'physical_scope':'Public SKY130 reference MOS placement/routing; not standard-cell place-and-route, timing closure or signoff.'}
    preview=k.Layout();preview.dbu=.001;preview.create_cell(top)
    if action=='physical':
        require('magic')
        if len(flat['devices'])>LIMITS['physical_primitives']:raise EDAError('PHYSICAL_LIMIT','Native reference routing is limited to 512 MOS/passive primitives; partition larger digital blocks or connect an external P&R backend.')
        preview=physical_library.physical(folder/'generator',flat,top,ir['ports'],spec['chip_limits']);report.update(layout_generated=True,bounds_dbu=[preview.cell(top).bbox().left,preview.cell(top).bbox().bottom,preview.cell(top).bbox().right,preview.cell(top).bbox().top],envelope=floorplan.enforce(preview,top,spec['chip_limits']))
    G.assign_ids(preview);S.dump(folder/'schematic.json',ir);preview.write(str(folder/'preview.oas'));(folder/'reference.spice').write_text(native.emit(ir,top,ir['ports']))
    report.update(schematic_sha256=profile.sha(folder/'schematic.json'),layout_sha256=profile.sha(folder/'preview.oas'));report['preview_hash']=digest(report);S.dump(folder/'hdl-report.json',report)
    run.update(analysis_result='unknown',measurements={'gate_instances':report['gate_instances'],'primitive_count':report['primitive_count'],'layout_generated':report['layout_generated']},message='Actual native '+action+' complete; review the derived graph before applying. Electrical checks/signoff not run.')
    run['artifacts'].update(hdl_report=str(folder/'hdl-report.json'),reference_spice=str(folder/'reference.spice'),preview_layout=str(folder/'preview.oas'))

def result(params):
    keys(params,('project_id','run_id'));r=S.get_run(params['run_id'])
    if r['project_id']!=params['project_id'] or not r['kind'].startswith('hdl-') or r['execution_status']!='completed':raise EDAError('HDL_RESULT','Read the actual completed run for this project.')
    folder=S.STATE/'runs'/r['id'];report=json.loads((folder/'hdl-report.json').read_text())
    if report['action']!='simulate':
        check={key:v for key,v in report.items() if key!='preview_hash'}
        if digest(check)!=report['preview_hash'] or profile.sha(folder/'preview.oas')!=report['layout_sha256'] or profile.sha(folder/'schematic.json')!=report['schematic_sha256']:raise EDAError('ARTIFACT_CHANGED','HDL preview artifacts changed.')
    value={'run':r,'report':report}
    if report['action']!='simulate':
        l=k.Layout();l.read(str(folder/'preview.oas'));p=S.get_project(r['project_id']);ir=json.loads((folder/'schematic.json').read_text())
        view={**p,'cell':report['top'],'schematic':ir,'ports':ir['ports'],'revision':r['revision']};value['scene']=G.scene(l,view,profile.layers(l),{'max_shapes':2000})
    return value

def analog_test(params):
    keys(params,('project_id','expected_revision','command_id','output','resistance_Ohm','capacitance_F'))
    p=S.get_project(params['project_id']);spec=validate(p.get('hdl_design'));meta=p.get('hdl_implementation',{})
    if params.get('expected_revision')!=p['revision'] or not params.get('command_id') or not meta.get('port_mapping') or digest(spec)!=meta.get('source_hash'):raise EDAError('HDL_BRIDGE','Apply a current derived CMOS graph before creating an analog interface test.')
    if not spec['vectors']:raise EDAError('HDL_VECTORS','Provide digital input vectors before creating the analog test.')
    output=params.get('output');available=[n for n in p['ports'] if n not in ('VPWR','VGND')]
    if output not in available:raise EDAError('HDL_BRIDGE','Select an actual scalar physical output port.')
    # The synthesis report, not a name heuristic, owns port directions.
    ports=meta.get('ports')
    if not isinstance(ports,dict) or digest(p['schematic'])!=meta.get('schematic_hash'):raise EDAError('HDL_BRIDGE','Derived schematic changed or port provenance is absent. Configure its analog testbench explicitly, or reapply a reviewed fresh synthesis.')
    inputs={n:v for n,v in ports.items() if v['direction']=='input'}
    outputs=[bit for n,v in ports.items() if v['direction']=='output' for bit in meta['port_mapping'][n]]
    if output not in outputs:raise EDAError('HDL_BRIDGE','RC interface must connect to a synthesized output, not an input/power port.')
    resistance=native.num(params.get('resistance_Ohm',1000));cap=native.num(params.get('capacitance_F',1e-12))
    if not 1<=resistance<=1e9 or not 1e-15<=cap<=1e-6:raise EDAError('HDL_BRIDGE','R must be 1..1e9 Ω, C 1 fF..1 µF.')
    def action():
        ir=copy.deepcopy(p['schematic']);step=spec['step_ns']*1e-9;duration=(len(spec['vectors'])+1)*step
        if duration>1e-3:raise EDAError('HDL_BRIDGE','Reduce vector count/step to fit the native 1 ms transient limit.')
        if 'ANALOG_OUT' in p['ports'] or any(d['name'].startswith('HDLDRV_') for d in ir['devices']):raise EDAError('HDL_BRIDGE','This project already contains an interface; select the original derived graph.')
        def add(kind,name,a,b,parameters,stimulus=None):
            d={'id':uuid.uuid4().hex,'name':'HDLDRV_'+name,'kind':kind,'pins':{'+':a,'-':b},'parameters':parameters,'x':100+(len(ir['devices'])%6)*220,'y':120+(len(ir['devices'])//6)*180}
            if stimulus:d['stimulus']=stimulus
            ir['devices'].append(d)
        add('voltage','VDD','VPWR','0',{'dc':1.8});add('voltage','GND','VGND','0',{'dc':0})
        for n,port in inputs.items():
            width=len(port['bits'])
            for i,bitname in enumerate(meta['port_mapping'][n]):
                values=[]
                for row in spec['vectors']:
                    if set(row['inputs'])!=set(inputs):raise EDAError('HDL_VECTORS','Every bridge vector must drive every synthesized input.')
                    raw=row['inputs'][n];v=int(raw,16 if raw.lower().startswith('0x') else 2 if raw.lower().startswith('0b') else 10)
                    if v>=1<<width:raise EDAError('HDL_VALUE','Input does not fit its port width.')
                    values.append(1.8*((v>>i)&1))
                points=[[0,values[0]]];previous=values[0]
                for j,v in enumerate(values[1:],1):
                    if v!=previous:points.extend([[j*step,previous],[j*step+min(step/10,1e-9),v]])
                    previous=v
                points.append([duration,previous]);add('voltage',bitname,bitname,'VGND',{'dc':values[0]},{'kind':'pwl','points':points})
        add('resistor','RC_R',output,'ANALOG_OUT',{'value':resistance});add('capacitor','RC_C','ANALOG_OUT','VGND',{'value':cap});ir['ports']=[*p['ports'],'ANALOG_OUT']
        valid=native.validate(ir)
        if not valid['valid']:raise EDAError('HDL_BRIDGE','Analog interface graph failed validation.',valid)
        nextp=S.create({'example':'schematic','name':p['name']+' · mixed RC'});old=nextp['revision'];l=S.load_layout(p)
        nextp.update(cell=p['cell'],schematic=ir,ports=ir['ports'],example='converted',revision=nextp['next_revision'],next_revision=nextp['next_revision']+1,undo_stack=[old],testbench=native.testbench({'analysis':'tran','duration_s':duration,'step_s':max(1e-12,min(step/100,min(step/10,1e-9)/10)),'supply_V':1.8}),hdl_design=copy.deepcopy(spec),mixed_signal={'source_project':p['id'],'source_revision':p['revision'],'source_hash':digest(spec),'output':output,'analog_output':'ANALOG_OUT','R_Ohm':resistance,'C_F':cap,'tau_s':resistance*cap,'physical_interface_complete':False,'simulation':'actual MOS plus ideal external RC, not event-driven HDL/analog co-simulation','layout_status':'Digital geometry preserved; external stimulus and ideal RC have no physical mask. Route/convert analog interface before LVS/PEX.'})
        return S.commit(nextp,l,parent=old)
    return S.mutate('hdl.analog_test',params,action)

def apply(params):
    keys(params,('project_id','expected_revision','command_id','run_id','preview_hash','approved'))
    if params.get('approved') is not True or 'expected_revision' not in params or not params.get('command_id'):raise EDAError('APPROVAL_REQUIRED','Review the generated graph and geometry, then approve this exact revision.')
    def action():
        value=result({'project_id':params['project_id'],'run_id':params['run_id']});r=value['run'];report=value['report'];p=S.get_project(params['project_id'])
        if report['action']=='simulate' or r['freshness']!='current' or not report.get('preview_hash') or report.get('preview_hash')!=params.get('preview_hash') or digest(p.get('hdl_design'))!=report['source_hash']:raise EDAError('STALE_PREVIEW','Source/revision/engine changed; rerun and review a fresh preview.')
        folder=S.STATE/'runs'/r['id'];ir=json.loads((folder/'schematic.json').read_text());l=k.Layout();l.read(str(folder/'preview.oas'));old=p['revision']
        p.update(cell=p['hdl_design']['top'],schematic=ir,ports=ir['ports'],example='converted',source='pdk',revision=p['next_revision'],next_revision=p['next_revision']+1,undo_stack=p.get('undo_stack',[])+[old],redo_stack=[],layout_parameter_policy='reference-layout-independent-edit',hdl_implementation={'source_hash':report['source_hash'],'run_id':r['id'],'source_revision':old,'preview_hash':report['preview_hash'],'port_mapping':report['port_mapping'],'layout_generated':report['layout_generated'],'verification':'not-run'})
        p['hdl_implementation']['outputs']=[bit for n,v in report['ports'].items() if v['direction']=='output' for bit in report['port_mapping'][n]]
        p['hdl_implementation'].update(ports=report['ports'],schematic_hash=digest(ir))
        p['chip_limits']=report['chip_limits']
        for key in ('design_template','digital_unit','analysis_setup','backend_setup','active_backend','interchange_layout','interchange_netlist'):p.pop(key,None)
        return S.commit(p,l,parent=old)
    return S.mutate('hdl.apply',params,action)

def artifact(params):
    keys(params,('project_id','run_id','name'));r=S.get_run(params['run_id']);name=params.get('name')
    if r['project_id']!=params['project_id'] or not r['kind'].startswith('hdl-') or name not in ('digital.vcd','gates.v','reference.spice','hdl-report.json'):raise EDAError('HDL_ARTIFACT','Select an actual published HDL artifact for this project.')
    folder=S.STATE/'runs'/r['id'];file=folder/name
    if not file.is_file() or file.stat().st_size>2*1024*1024:raise EDAError('HDL_ARTIFACT','Artifact is absent or exceeds the 2 MiB text download limit; original remains in the native run folder.')
    manifest=json.loads((folder/'manifest.json').read_text());expected=next((v for n,v in manifest.get('artifacts',{}).items() if Path(n).name==name),None)
    if expected!=profile.sha(file):raise EDAError('ARTIFACT_CHANGED','Original artifact hash no longer matches the run manifest.')
    return {'filename':name,'text':file.read_text(),'sha256':expected}

def rpc(method,params):
    if method=='hdl.catalog':keys(params,());return catalog()
    if method=='hdl.create':return create(params)
    if method=='hdl.save':return save(params)
    if method=='hdl.run':return start(params)
    if method=='hdl.result':return result(params)
    if method=='hdl.apply':return apply(params)
    if method=='hdl.analog_test':return analog_test(params)
    if method=='hdl.artifact':return artifact(params)
    if method=='hdl.new_assembly':return new_assembly(params)
    raise EDAError('UNKNOWN_METHOD','Unknown HDL operation.')
