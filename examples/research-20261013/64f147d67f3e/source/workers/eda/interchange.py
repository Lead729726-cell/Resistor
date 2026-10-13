"""Native file interchange. Uploaded data is never an executable recipe.

KLayout's LEF/DEF reader owns physical geometry; the conservative SPICE/CDL
reader owns a lossless text document plus an explicit connectivity AST. Neither
reader proves foundry signoff or proprietary database compatibility.
"""
from __future__ import annotations
import base64
import copy
import hashlib
import json
import math
from pathlib import Path
import re
import shlex
import tempfile
import unicodedata
import uuid
import klayout.db as k
import geometry as geo
from geometry import EDAError
import commercial_results

S=None
MAX_FILE=16*1024*1024
MAX_TOTAL=32*1024*1024
MAX_NETLIST=2*1024*1024
LAYOUT_EXT={'.gds','.gds2','.oas','.oasis'}
NET_EXT={'.cdl','.spice','.spi','.sp','.cir','.ckt','.lib','.mod'}
OPTION_KEYS={'source_tool','top_cell','netlist_top','dbu_um','lef_files','macro_files','layer_map','allow_unmapped_layers','netlist_file','library_section','results'}
NAME=re.compile(r'[A-Za-z0-9_][A-Za-z0-9_.!-]{0,159}\Z')
CELL=re.compile(r'[A-Za-z_][A-Za-z0-9_.$!:/-]{0,159}\Z')
SAFE_NET=re.compile(r'(?:0|[A-Za-z0-9_][A-Za-z0-9_.$!:/\[\]<>+-]{0,159})\Z')

def configure(server):
    global S
    S=server

def sha(value):return hashlib.sha256(value).hexdigest()

def safe_filename(name):
    return isinstance(name,str) and 1<=len(name)<=160 and name==name.strip() and not name.startswith('.') and not name.endswith('.') and not any(ord(c)<32 or ord(c)==127 or c in '/\\<>:"|?*{}[];$\'`' for c in name) and name.split('.',1)[0].upper() not in {'CON','PRN','AUX','NUL',*[f'COM{i}' for i in range(1,10)],*[f'LPT{i}' for i in range(1,10)]}

def files_decode(items):
    if not isinstance(items,list) or not 1<=len(items)<=32:raise EDAError('INVALID_FILES','Provide 1..32 named files.')
    files={};names=set();total=0
    for item in items:
        if not isinstance(item,dict) or set(item)!={'name','base64'}:raise EDAError('INVALID_FILES','Each file has only name and base64.')
        name=item['name'];encoded=item['base64']
        key=unicodedata.normalize('NFC',name).casefold() if isinstance(name,str) else None
        if not safe_filename(name) or key in names:raise EDAError('UNSAFE_FILENAME','Use unique plain basenames, without paths or script metacharacters; Unicode and ordinary spaces are supported.')
        if not isinstance(encoded,str) or len(encoded)>4*((MAX_FILE+2)//3):raise EDAError('FILE_LIMIT','A file exceeds 16 MiB.')
        try:value=base64.b64decode(encoded,validate=True)
        except (ValueError,TypeError) as e:raise EDAError('INVALID_BASE64','File is not valid base64.') from e
        total+=len(value)
        if not value or len(value)>MAX_FILE or total>MAX_TOTAL:raise EDAError('FILE_LIMIT','File bundle limit is 16 MiB per file / 32 MiB total.')
        files[name]=value;names.add(key)
    return files

def options_validate(options):
    options={} if options is None else copy.deepcopy(options)
    if not isinstance(options,dict) or set(options)-OPTION_KEYS:raise EDAError('INVALID_OPTIONS','Unsupported interchange option.')
    if 'top_cell' in options and (not isinstance(options['top_cell'],str) or not CELL.fullmatch(options['top_cell'])):raise EDAError('INVALID_TOP','A supported explicit cell identifier is required.')
    if 'netlist_top' in options and (not isinstance(options['netlist_top'],str) or not CELL.fullmatch(options['netlist_top'])):raise EDAError('INVALID_TOP','A supported explicit electrical cell identifier is required.')
    if 'source_tool' in options and (not isinstance(options['source_tool'],str) or not re.fullmatch(r'[A-Za-z0-9_. -]{1,80}',options['source_tool'])):raise EDAError('INVALID_OPTIONS','source_tool is a bounded descriptive label, not a file path.')
    if 'allow_unmapped_layers' in options and not isinstance(options['allow_unmapped_layers'],bool):raise EDAError('INVALID_OPTIONS','allow_unmapped_layers must be boolean.')
    if 'dbu_um' in options:
        v=options['dbu_um']
        if isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or not 1e-6<=v<=1:raise EDAError('INVALID_DBU','dbu_um must be finite and between 0.000001 and 1 um.')
    return options

def text_decode(value,name):
    try:text=value.decode('utf-8-sig')
    except UnicodeError as e:raise EDAError('INVALID_TEXT',name+' must be UTF-8 text.') from e
    if '\0' in text:raise EDAError('INVALID_TEXT','NUL is not allowed in textual exchange files.')
    return text

def check(name,status,message):return {'name':name,'status':status,'message':message}

def logical_lines(text):
    rows=[]
    for raw in text.splitlines():
        line=raw.strip()
        if line.startswith('+'):
            if not rows or rows[-1].lstrip().startswith('*'):raise EDAError('INVALID_NETLIST','Orphan SPICE continuation.')
            rows[-1]+=' '+line[1:].strip()
        else:rows.append(line)
    return rows

def tokens(line):
    try:return shlex.split(line,posix=True,comments=False)
    except ValueError as e:raise EDAError('INVALID_NETLIST','Unclosed SPICE quoted field.') from e

def spice_document(files,options):
    """Parse safe text, preserving original files and library section scope.

    No evaluator or simulator is invoked. .include/.lib resolution can only use
    filenames in this exact bundle; exported documents retain that closure.
    """
    candidates=[name for name in files if Path(name).suffix.lower() in NET_EXT]
    root=options.get('netlist_file')
    if root is None:
        referenced=set()
        for name in candidates:
            for line in logical_lines(text_decode(files[name],name)):
                fields=tokens(line) if line and not line.startswith('*') else []
                if fields and fields[0].lower() in {'.include','.inc','.lib'} and len(fields)>=2 and fields[1] in files:referenced.add(fields[1])
        roots=[n for n in candidates if n not in referenced]
        if len(roots)!=1:raise EDAError('AMBIGUOUS_NETLIST','Select options.netlist_file for multiple circuit/library roots.',{'candidates':roots or candidates})
        root=roots[0]
    if root not in candidates:raise EDAError('MISSING_NETLIST','netlist_file must name an uploaded SPICE/CDL file.')
    if sum(len(files[n]) for n in candidates)>MAX_NETLIST:raise EDAError('NETLIST_LIMIT','Parsed electrical text is limited to 2 MiB.')
    document={'schema_version':1,'format':'cdl' if Path(root).suffix.lower()=='.cdl' else 'spice','root_file':root,'cells':[],'models':[],'global_nodes':[],'directives':[],'files':{},'sections':[],'unresolved_models':[]}
    cells={};visited=set();stack=[];losses=[]
    declared_bjt={}
    for name in candidates:
        for line in logical_lines(text_decode(files[name],name)):
            match=re.match(r'(?i)^\.model\s+(\S+)\s+(npn|pnp)(?:\s|\()',line)
            if match:declared_bjt[match[1].lower()]=match[2].lower()
    forbidden=re.compile(r'(?i)(?:\b(?:d_process|pre_osdi|osdi|codemodel|dlopen)\b|(?:file|filename)\s*=|\bfile\s*\(|`|\x00)')
    safe_directives={'.param','.parameters','.option','.options','.temp','.title','.op','.dc','.tran','.ac','.save','.print','.plot','.measure','.meas','.ic','.nodeset','.end','.global','.model','.subckt','.ends','.include','.inc','.lib','.endl'}
    families={'nmos','pmos','d','npn','pnp','r','c','l','sw','csw','njf','pjf','nmf','pmf','ltra','urc','nvdmos','pvdmos'}
    def scope_key(name,section):return (section or '')+'::'+name.lower()
    def visit(name,selected=None):
        key=(name,selected)
        if key in stack:raise EDAError('INCLUDE_CYCLE','Cyclic uploaded netlist dependency.')
        if key in visited:return
        stack.append(key);visited.add(key);text=text_decode(files[name],name);document['files'][name]=text
        active=None;current=None;lib_scope=None;seen_section=False
        for number,line in enumerate(logical_lines(text),1):
            if not line:continue
            if line.startswith('*'):
                if current and line.upper().startswith('*.PININFO'):
                    current.setdefault('pininfo',[]).extend(line.split()[1:])
                continue
            if forbidden.search(line):raise EDAError('UNSAFE_NETLIST','External file/process/code-model syntax is prohibited in uploaded circuits.')
            fields=tokens(line);head=fields[0].lower()
            if head=='.lib' and len(fields)==2 and fields[1] not in files:
                if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_-]{0,63}',fields[1]):raise EDAError('UNSAFE_INCLUDE','Library section must be a plain identifier, not an external path.')
                if lib_scope is not None:raise EDAError('INVALID_NETLIST','Nested library sections are unsupported.')
                lib_scope=fields[1];document['sections'].append({'file':name,'name':lib_scope});seen_section|=selected==lib_scope;continue
            if head=='.endl':
                if lib_scope is None or current:raise EDAError('INVALID_NETLIST','Unbalanced library section.')
                lib_scope=None;continue
            active=selected is None or lib_scope is None or selected==lib_scope
            if not active:continue
            if head in {'.include','.inc','.lib'}:
                if current is not None:raise EDAError('UNSUPPORTED_NETLIST','An include inside a .subckt needs a source dialect translator; its scope cannot be guessed.')
                if (head in {'.include','.inc'} and len(fields)!=2) or (head=='.lib' and len(fields)!=3):raise EDAError('UNSAFE_INCLUDE','Use uploaded filename plus explicit .lib section.')
                dep=fields[1]
                if not safe_filename(dep) or dep not in files or Path(dep).suffix.lower() not in NET_EXT:raise EDAError('UNSAFE_INCLUDE','All netlist dependencies must be uploaded plain basenames.')
                visit(dep,fields[2] if head=='.lib' else None);continue
            if head.startswith('.') and head not in safe_directives:raise EDAError('UNSUPPORTED_NETLIST','Unsupported or executable directive: '+head)
            if head=='.subckt':
                if current or len(fields)<2 or not CELL.fullmatch(fields[1]):raise EDAError('INVALID_NETLIST','Malformed/nested .subckt.')
                pos=next((i for i,f in enumerate(fields[2:],2) if '=' in f or f.lower() in {'params:','parameters:'}),len(fields))
                ports=fields[2:pos]
                if len(set(ports))!=len(ports) or any(not SAFE_NET.fullmatch(p) for p in ports):raise EDAError('INVALID_NETLIST','Subcircuit ports must be unique supported node tokens.')
                ident=scope_key(fields[1],lib_scope)
                if ident in cells:raise EDAError('DUPLICATE_CELL','Duplicate subcircuit in the same library scope.')
                current={'name':fields[1],'ports':ports,'parameters':fields[pos:],'devices':[],'scope':lib_scope,'source_file':name};cells[ident]=current;document['cells'].append(current);continue
            if head=='.ends':
                if current is None or (len(fields)>1 and fields[1].lower()!=current['name'].lower()):raise EDAError('INVALID_NETLIST','Unbalanced/mismatched .ends.')
                current=None;continue
            if head=='.global':
                if any(not SAFE_NET.fullmatch(v) for v in fields[1:]):raise EDAError('INVALID_NETLIST','Invalid global node token.')
                for v in fields[1:]:
                    if v not in document['global_nodes']:document['global_nodes'].append(v)
                continue
            if head=='.model':
                if len(fields)<3:raise EDAError('INVALID_NETLIST','Malformed .model.')
                family=re.split(r'\(',fields[2])[0].lower()
                if family not in families:raise EDAError('UNSUPPORTED_MODEL','Only static classic SPICE model families are accepted.')
                document['models'].append({'name':fields[1],'type':family,'scope':lib_scope,'source_file':name,'text':line});continue
            if head.startswith('.'):
                document['directives'].append({'text':line,'scope':lib_scope,'cell':current['name'] if current else None,'source_file':name});continue
            prefix=fields[0][0].upper();fields=[f for f in fields if f!='/']
            if prefix=='A':raise EDAError('UNSAFE_NETLIST','XSPICE code-model devices are prohibited.')
            counts={'M':4,'R':2,'C':2,'L':2,'V':2,'I':2,'D':2,'Q':3,'J':3,'Z':3,'E':4,'G':4,'F':2,'H':2,'S':4,'W':2,'T':4}
            if number==1 and (prefix not in counts and prefix!='X' or prefix in counts and len(fields)<counts[prefix]+2):
                document['directives'].append({'text':line,'title':True,'scope':lib_scope,'source_file':name});continue
            if prefix=='X':
                end=next((i for i,f in enumerate(fields[1:],1) if '=' in f or f.lower()=='params:'),len(fields));node_count=end-2
            elif prefix=='Q':
                positions=[i for i in (4,5) if len(fields)>i and fields[i].lower() in declared_bjt]
                if len(positions)!=1:raise EDAError('AMBIGUOUS_BJT','Three/four-terminal Q cards require one declared NPN/PNP model at the exact model position.')
                node_count=positions[0]-1
            elif prefix in counts:node_count=counts[prefix]
            else:raise EDAError('UNSUPPORTED_DEVICE','Device card is not in the supported static SPICE/CDL subset: '+fields[0])
            # CDL MOS accepts a slash before the model; remove only that separator.
            clean=[f for f in fields if f!='/'];fields=clean
            if node_count<1 or len(fields)<node_count+2:raise EDAError('INVALID_NETLIST','Incomplete device card: '+fields[0])
            nodes=fields[1:node_count+1]
            if any(not SAFE_NET.fullmatch(n) for n in nodes):raise EDAError('INVALID_NETLIST','Unsupported device node token.')
            tail=fields[node_count+1:];device={'name':fields[0],'kind':prefix,'nodes':nodes,'parameters':tail[1:],'raw':line,'source_file':name}
            if prefix in {'M','D','Q','J','Z','X','S','W'}:device['model']=tail[0]
            else:device['value']=tail[0]
            if current is None:
                current_top=next((c for c in document['cells'] if c.get('top_level') and c['scope']==lib_scope),None)
                if current_top is None:
                    current_top={'name':Path(root).stem,'ports':[],'parameters':[],'devices':[],'scope':lib_scope,'source_file':name,'top_level':True};document['cells'].append(current_top)
                target=current_top
            else:target=current
            if any(d['name'].lower()==device['name'].lower() for d in target['devices']):raise EDAError('DUPLICATE_DEVICE','Duplicate device instance in a circuit scope.')
            target['devices'].append(device)
        if current or lib_scope:raise EDAError('INVALID_NETLIST','Unclosed subcircuit/library section.')
        if selected is not None and not seen_section:raise EDAError('MISSING_LIBRARY_SECTION','Requested library section was not found: '+selected)
        stack.pop()
    visit(root,options.get('library_section'))
    referenced={d['model'].lower() for c in document['cells'] for d in c['devices'] if d['kind']=='X'}
    tops=[c['name'] for c in document['cells'] if c['name'].lower() not in referenced]
    selected=options.get('netlist_top',options.get('top_cell'))
    if selected is not None and not any(c['name']==selected for c in document['cells']):raise EDAError('UNKNOWN_TOP','Requested electrical top is absent.')
    if selected is None and len(tops)==1:selected=tops[0]
    document['top_cells']=tops;document['top_cell']=selected
    known={m['name'].lower() for m in document['models']}|{c['name'].lower() for c in document['cells']}
    document['unresolved_models']=sorted({d['model'] for c in document['cells'] for d in c['devices'] if 'model' in d and d['model'].lower() not in known})
    if document['unresolved_models']:losses.append('Model definitions are external/unresolved; model names and pin order are preserved without a simulation claim.')
    if len({(c['name'].lower()) for c in document['cells']})!=len(document['cells']):losses.append('Multiple library scopes use the same cell name; select a library_section before native circuit use.')
    return document,losses

def layout_map(options):
    value=options.get('layer_map',{})
    if isinstance(value,list):
        if any(not isinstance(row,dict) or set(row)-{'name','layer','datatype','purpose'} or not {'name','layer','datatype'}<=set(row) for row in value):raise EDAError('INVALID_LAYER_MAP','Each layer row has name, layer, datatype and optional purpose.')
        suffixes={'drawing':'','pin':'.PIN','label':'.LABEL','obstruction':'.OBS','routing':'.NET','special-routing':'.SNET','via':'.GEO','outline':''}
        normalized={}
        for row in value:
            purpose=row.get('purpose','drawing')
            if purpose not in suffixes:raise EDAError('UNSUPPORTED_LAYER_PURPOSE','Unsupported layer purpose: '+str(purpose))
            suffix=suffixes[purpose];name=row['name'] if not suffix or row['name'].endswith(suffix) else row['name']+suffix
            if name in normalized:raise EDAError('INVALID_LAYER_MAP','Duplicate normalized layer name/purpose.')
            normalized[name]=[row['layer'],row['datatype']]
        value=normalized
    if not isinstance(value,dict) or len(value)>512:raise EDAError('INVALID_LAYER_MAP','layer_map must contain at most 512 named entries.')
    mapping={}
    for name,pair in value.items():
        if not isinstance(name,str) or not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_.-]{0,127}',name) or not isinstance(pair,list) or len(pair)!=2 or any(isinstance(v,bool) or not isinstance(v,int) or not 0<=v<=65535 for v in pair):raise EDAError('INVALID_LAYER_MAP','Layer mappings are names to [0..65535 layer, 0..65535 datatype].')
        mapping[name]=pair
    return mapping

def chosen_names(options,key,files,extensions):
    value=options.get(key,[n for n in files if Path(n).suffix.lower() in extensions])
    if not isinstance(value,list) or len(set(value))!=len(value) or any(not isinstance(n,str) or n not in files or Path(n).suffix.lower() not in extensions for n in value):raise EDAError('INVALID_DEPENDENCY',key+' must list uploaded matching file names in order.')
    return value

def def_connections(text):
    result={};ports=[]
    match=re.search(r'(?is)\bPINS\s+\d+\s*;(.*?)\bEND\s+PINS\b',text)
    if match:
        for item in re.finditer(r'(?s)(?:^|;)\s*-\s+(\S+)(.*?)(?=;)',match[1]+';'):
            net=re.search(r'\+\s+NET\s+(\S+)',item[2],re.I);ports.append({'name':item[1],'net':net[1] if net else None})
    for section in ('NETS','SPECIALNETS'):
        match=re.search(r'(?is)\b'+section+r'\s+\d+\s*;(.*?)\bEND\s+'+section+r'\b',text)
        if not match:continue
        for record in re.split(r';',match[1]):
            head=re.match(r'\s*-\s+(\S+)',record)
            if not head:continue
            connection_text=record.split('+',1)[0]
            for inst,pin in re.findall(r'\(\s*([^\s()]+)\s+([^\s()]+)\s*\)',connection_text):
                if inst=='PIN':continue
                if inst not in result:result[inst]={}
                if pin in result[inst] and result[inst][pin]!=head[1]:raise EDAError('INVALID_DEF','A component pin is bound to multiple DEF nets.')
                result[inst][pin]=head[1]
    return result,ports

def physical(files,options,folder):
    defs=[n for n in files if Path(n).suffix.lower()=='.def'];lefs=chosen_names(options,'lef_files',files,{'.lef','.tlef'});macros=chosen_names(options,'macro_files',files,LAYOUT_EXT)
    native_files=[n for n in files if Path(n).suffix.lower() in LAYOUT_EXT and n not in options.get('macro_files',[])]
    layout=k.Layout();source=None;mapping={};losses=[];connections={};ports=[]
    if defs or lefs:
        if len(defs)>1:raise EDAError('AMBIGUOUS_LAYOUT','Only one DEF design is accepted per import.')
        if defs and not lefs:raise EDAError('MISSING_LEF','A DEF import requires an explicit uploaded LEF technology/macro closure.')
        mapping=layout_map(options)
        if not mapping and not options.get('allow_unmapped_layers'):raise EDAError('MISSING_LAYER_MAP','LEF/DEF requires an explicit layer_map; automatic layer numbers require an explicit opt-in.')
        # Never resolve external layout references from LEF/DEF text.
        for name in lefs+defs:
            text=text_decode(files[name],name)
            if re.search(r'(?i)\b(?:HISTORY|PROPERTYDEFINITIONS)\b',text):losses.append(name+': textual history/custom properties are retained in source but not treated as executable or foundry rules.')
            if re.search(r'(?i)\b(?:LIBRARY|FILENAME)\s+["\']?[/\\]',text):raise EDAError('UNSAFE_DEPENDENCY','External layout references are unsupported; upload all macros explicitly.')
        source=defs[0] if defs else lefs[-1]
        config=k.LEFDEFReaderConfiguration();config.read_lef_with_def=False;config.lef_files=[str(folder/n) for n in lefs if n!=source];config.macro_layout_files=[str(folder/n) for n in macros]
        # Public LEFs commonly carry FOREIGN even when only an abstract was
        # uploaded. Mode 0 would silently replace those abstracts by empty cells.
        config.macro_resolution_mode=0 if macros else 1
        config.paths_relative_to_cwd=False;config.dbu=options.get('dbu_um',0.001);config.create_other_layers=True
        config.net_property_name=2;config.pin_property_name=4;config.instance_property_name=5
        config.produce_pins=True;config.produce_lef_pins=True;config.produce_labels=True;config.produce_lef_labels=True;config.produce_obstructions=True;config.produce_routing=True;config.produce_special_routing=True;config.produce_via_geometry=True
        config.lef_pins_suffix='.PIN';config.pins_suffix='.PIN';config.labels_suffix='.LABEL';config.lef_labels_suffix='.LABEL';config.routing_suffix='.NET';config.special_routing_suffix='.SNET';config.obstructions_suffix='.OBS';config.via_geometry_suffix='.GEO'
        lm=k.LayerMap()
        for index,(name,pair) in enumerate(mapping.items()):lm.map(name+':'+str(pair[0])+'/'+str(pair[1]),index)
        config.layer_map=lm;load=k.LoadLayoutOptions();load.lefdef_config=config
        try:layout.read(str(folder/source),load)
        except RuntimeError as e:raise EDAError('LAYOUT_PARSE_FAILED',str(e)[:2048]) from e
        # Read with all layers first, then reject omissions rather than discard geometry.
        unmapped=[]
        for li in layout.layer_indices():
            info=layout.get_info(li);base=info.name.rsplit('.',1)[0]
            if info.name and info.name not in mapping and base not in mapping:unmapped.append(info.name)
        if unmapped and not options.get('allow_unmapped_layers'):raise EDAError('UNMAPPED_LAYERS','Explicit mapping is incomplete; no geometry has been imported.',{'layers':sorted(set(unmapped))})
        if unmapped:losses.append('Automatic non-foundry layer numbers were explicitly accepted: '+', '.join(sorted(set(unmapped))))
        if defs:
            connections,ports=def_connections(text_decode(files[source],source))
            for cell in layout.each_cell():
                for inst in cell.each_inst():
                    label=inst.property(5)
                    if label in connections:inst.set_property(6,json.dumps(connections[label],sort_keys=True))
                    if inst.cell.bbox().empty():raise EDAError('UNRESOLVED_MACRO','An instantiated macro has no imported geometry: '+inst.cell.name)
        if macros:losses.append('Explicit uploaded macro GDS/OAS cells retain their native layer numbers; DEF terminal bindings are source metadata, not a transistor extraction.')
        # Macro outlines and obstructions are LEF abstractions, never transistor masks.
        losses.append('LEF abstracts, placements and routed DEF geometry are real imported data; they do not contain transistor masks or signoff process rules.')
    elif native_files:
        if len(native_files)!=1:raise EDAError('AMBIGUOUS_LAYOUT','Choose one GDS/OAS layout; use macro_files only with LEF/DEF.')
        source=native_files[0]
        try:layout.read(str(folder/source))
        except RuntimeError as e:raise EDAError('LAYOUT_PARSE_FAILED',str(e)[:2048]) from e
    else:return None,None
    tops=[c.name for c in layout.top_cells()];selected=options.get('top_cell')
    if selected is not None and layout.cell(selected) is None:raise EDAError('UNKNOWN_TOP','Requested physical top cell is absent.')
    if selected is None and len(tops)==1:selected=tops[0]
    info=layout_summary(layout,selected)
    info.update(source_file=source,top_cells=tops,selected_top=selected,pin_bindings=connections,ports=ports,layer_map=mapping,losses=losses)
    return layout,info

def layout_summary(layout,selected=None):
    shapes=0;pins=[];nets=set();instances=[]
    flat_cache={};visiting=set()
    def count(cell,depth=0):
        key=cell.cell_index()
        if key in visiting or depth>128:raise EDAError('HIERARCHY_LIMIT','Recursive/deep hierarchy is unsupported for bounded interchange inspection.')
        if key in flat_cache:return flat_cache[key]
        visiting.add(key);value=sum(cell.shapes(li).size() for li in layout.layer_indices())
        for inst in cell.each_inst():
            value+=count(inst.cell,depth+1)*max(1,inst.cell_inst.na)*max(1,inst.cell_inst.nb)
            if value>1000000:raise EDAError('GEOMETRY_LIMIT','Interchange fingerprinting is limited to one million expanded source shapes.')
        visiting.remove(key);flat_cache[key]=value;return value
    for cell in layout.each_cell():count(cell)
    for cell in layout.each_cell():
        for inst in cell.each_inst():
            instances.append({'cell':cell.name,'macro':inst.cell.name,'name':inst.property(5),'transform':inst.cell_inst.to_s(),'pin_nets':json.loads(inst.property(6)) if inst.property(6) else {}})
        for li in layout.layer_indices():
            info=layout.get_info(li)
            for shape in cell.shapes(li).each():
                shapes+=1
                if shapes>1000000:raise EDAError('GEOMETRY_LIMIT','Native import contains over one million stored shapes.')
                if shape.property(2):nets.add(str(shape.property(2)))
                if shape.property(4):pins.append({'cell':cell.name,'name':str(shape.property(4)),'net':str(shape.property(2)) if shape.property(2) else None,'layer':[info.layer,info.datatype]})
                if len(instances)>100000 or len(pins)>100000:raise EDAError('GEOMETRY_LIMIT','Native import metadata exceeds bounded limits.')
    return {'reader':'KLayout','reader_version':k.__version__,'dbu_um':layout.dbu,'cells':[c.name for c in layout.each_cell()],'stored_shape_count':shapes,'instances':instances,'pins':pins,'nets':sorted(nets),'layers':[{'name':layout.get_info(i).name,'layer':layout.get_info(i).layer,'datatype':layout.get_info(i).datatype} for i in layout.layer_indices()], 'geometry_hash':geo.semantic_hash(layout,layout.cell(selected)) if selected else None,'hierarchy_hash':geo.hierarchy_hash(layout)}

def prepare(params):
    files=files_decode(params.get('files'));options=options_validate(params.get('options'));entries=[]
    for name,value in files.items():
        supported=Path(name).suffix.lower() in NET_EXT|LAYOUT_EXT|{'.lef','.tlef','.def'}
        entries.append({'name':name,'bytes':len(value),'sha256':sha(value),'format':Path(name).suffix.lower().lstrip('.'),'status':'supported' if supported else 'requires-converter','capabilities':['native-layout'] if Path(name).suffix.lower() in LAYOUT_EXT|{'.lef','.tlef','.def'} else ['electrical-document'] if Path(name).suffix.lower() in NET_EXT else [],'warnings':[] if supported else ['No direct native decoder for this file.']})
    report={'schema_version':1,'files':entries,'warnings':[],'kind':'unsupported','checks':[],'losses':[],'supported':False,'native_execution':False,'source_tool':options.get('source_tool')}
    with tempfile.TemporaryDirectory(prefix='register-interchange-') as tmp:
        folder=Path(tmp)
        for name,value in files.items():(folder/name).write_bytes(value)
        layout,physical_info=physical(files,options,folder)
        netlist=None
        if any(Path(n).suffix.lower() in NET_EXT for n in files):netlist,losses=spice_document(files,options);report['losses']+=losses
        if physical_info:
            report.update(kind='layout',layout=physical_info,top_cells=physical_info['top_cells'],selected_top=physical_info['selected_top']);report['losses']+=physical_info.pop('losses')
            report['checks'].append(check('native_layout','pass','Actual KLayout reader parsed geometry, hierarchy and source properties.'))
        if netlist:
            report.update(kind='layout+netlist' if physical_info else 'netlist',netlist={key:value for key,value in netlist.items() if key!='files'})
            if not physical_info:report.update(top_cells=netlist['top_cells'],selected_top=netlist['top_cell'])
            report['checks'].append(check('electrical_document','pass','Safe static SPICE/CDL cards and uploaded dependency closure parsed; original model names and ordered ports retained.'))
        unsupported=[n for n in files if Path(n).suffix.lower() not in NET_EXT|LAYOUT_EXT|{'.lef','.tlef','.def'}]
        if unsupported:report['losses'].append('Unsupported input files are retained only as data: '+', '.join(unsupported));report['checks'].append(check('unsupported_files','warning','Raw OA, Milkyway, NDM, SKILL/Tcl and proprietary binary result/database files require vendor exporters or SDKs.'))
        report['supported']=bool(layout is not None or netlist is not None)
        report['validated_native']=report['supported']
        if physical_info:report['dbu_um']=layout.dbu;report['layer_map']=[{'name':name,'layer':pair[0],'datatype':pair[1]} for name,pair in physical_info['layer_map'].items()]
        if netlist:report['circuits']=[{'name':c['name'],'pins':c['ports'],'devices':len(c['devices']),'instances':sum(d['kind']=='X' for d in c['devices'])} for c in netlist['cells']]
        if report['supported'] and not report.get('selected_top'):report['checks'].append(check('top_selection','warning','Select an explicit top cell before applying this multi-top document.'))
        report['checks'].append(check('foundry_signoff','warning','Import proves file decoding only; no licensed vendor execution or foundry signoff is claimed.'))
        report['warnings']=report['losses']+[v['message'] for v in report['checks'] if v['status']=='warning']
    return {'files':files,'options':options,'report':report,'layout':layout,'netlist':netlist}

def layer_palette(layout,project):
    palette=['#62b6ff','#f6c358','#85df9a','#de88ef','#ee806f','#88cddd'];layers=[]
    for index,li in enumerate(layout.layer_indices()):
        info=layout.get_info(li);layers.append({'id':f'{info.layer}/{info.datatype}','name':info.name or f'GDS {info.layer}/{info.datatype}','gds':[info.layer,info.datatype],'color':palette[index%len(palette)],'opacity':0.65,'z_display_um':0.1+index*0.12,'thickness_display_um':0.05,'source':'illustrative','physical_z_um':None,'physical_thickness_um':None,'material':'mask','style_source':'exchange'})
    return layers

def apply_import(params,prepared,observed_revision):
    p=S.get_project(params['project_id'])
    if p['revision']!=observed_revision:raise EDAError('REVISION_CONFLICT','Project changed while files were being decoded.')
    report=prepared['report'];options=prepared['options'];l=prepared['layout']
    if not report['supported']:raise EDAError('UNSUPPORTED_FORMAT','No native supported layout/circuit data found.',report)
    if not report.get('selected_top'):raise EDAError('AMBIGUOUS_TOP','Choose options.top_cell before importing.',{'top_cells':report.get('top_cells',[])})
    if l is None:l=S.load_layout(p)
    previous=p['revision'];p.update(revision=p['next_revision'],next_revision=p['next_revision']+1,undo_stack=p.get('undo_stack',[])+[previous],redo_stack=[])
    p.pop('analysis_setup',None);p.pop('backend_setup',None);p.pop('active_backend',None);p.pop('testbench',None);p.pop('design_template',None);p.pop('pvt_point',None);p.pop('native_database',None)
    if prepared['layout'] is not None:
        p.update(cell=report['selected_top'],source='fixture',example='fixture',ports=[v['name'] for v in report['layout'].get('ports',[])],grid_dbu=1,schematic={'devices':[],'wires':[],'junctions':[]},interchange_layout={'schema_version':1,'source_files':report['files'],'layer_map':options.get('layer_map',{}),'reader':'KLayout','geometry_binding':'unverified'})
        p.pop('interchange_netlist',None)
    if prepared['netlist'] is not None:
        p.update(interchange_netlist=prepared['netlist'],schematic={'devices':[],'wires':[],'junctions':[]},source='fixture',example='fixture')
    p['interchange_report']=report
    result=S.commit(p,l,previous)
    folder=S.snapshot_dir(result)/'interchange';folder.mkdir(exist_ok=True)
    for name,value in prepared['files'].items():(folder/name).write_bytes(value)
    S.dump(folder/'report.json',report)
    return {'project':result,'report':report}

def export(params):
    p=S.get_project(params['project_id']);fmt=params.get('format');options=options_validate(params.get('options'));files=[]
    if fmt in {'gds','oas'}:
        l=S.load_layout(p);suffix='gds' if fmt=='gds' else 'oas'
        with tempfile.TemporaryDirectory(prefix='register-export-') as tmp:
            dest=Path(tmp)/('layout.'+suffix);l.write(str(dest));value=dest.read_bytes()
        if len(value)>MAX_FILE:raise EDAError('EXPORT_LIMIT','Inline exchange export exceeds 16 MiB; use native layout.export path for larger layouts.')
        basename=p['cell'] if safe_filename(p['cell']) else 'layout';files=[{'name':basename+'.'+suffix,'base64':base64.b64encode(value).decode()}]
        report={'schema_version':1,'kind':'layout','supported':True,'selected_top':p['cell'],'layout':layout_summary(l,p['cell']),'checks':[check('native_writer','pass','Actual KLayout writer emitted '+fmt.upper()+'.')],'losses':['GDS does not encode a process stack or prove circuit correspondence.'],'native_execution':False}
    elif fmt in {'cdl','spice'}:
        document=p.get('interchange_netlist')
        if document:
            for name,text in document['files'].items():files.append({'name':name,'base64':base64.b64encode(text.encode()).decode()})
            report={'schema_version':1,'kind':'netlist','supported':True,'netlist':{key:value for key,value in document.items() if key!='files'},'checks':[check('preserved_electrical_document','pass','Original safe SPICE/CDL text and dependency names exported without model/pin reordering.')],'losses':['Format conversion does not rewrite vendor dialects; original electrical syntax and file extensions are preserved.'],'native_execution':False}
        else:
            if not p.get('schematic',{}).get('devices'):raise EDAError('NO_ELECTRICAL_REFERENCE','A bare layout has no electrical netlist to export; import a real circuit document or extract with a compatible PDK.')
            text=S.native.emit(p['schematic'],p['cell'],p.get('ports',[]));basename=p['cell'] if safe_filename(p['cell']) else 'circuit';name=basename+'.'+('cdl' if fmt=='cdl' else 'spice');files=[{'name':name,'base64':base64.b64encode(text.encode()).decode()}]
            report={'schema_version':1,'kind':'netlist','supported':True,'checks':[check('native_schematic','pass','Actual saved typed schematic exported in classic SPICE syntax.')],'losses':['CDL export uses the common classic SPICE subset, without proprietary layout annotations.'],'native_execution':False}
    else:raise EDAError('UNSUPPORTED_FORMAT','Export format must be gds, oas, cdl or spice.')
    report['warnings']=report['losses'];report['validated_native']=True
    report['files']=[{'name':item['name'],'format':Path(item['name']).suffix.lstrip('.'),'status':'supported','capabilities':['native-export'],'warnings':[],'sha256':sha(base64.b64decode(item['base64'])),'bytes':len(base64.b64decode(item['base64']))} for item in files]
    return {'files':files,'report':report}

def decorate_scene(layout,project,scene):
    if not project.get('interchange_layout'):return scene
    bindings={}
    for cell in layout.each_cell():
        for inst in cell.each_inst():
            value=inst.property(6)
            try:pins=json.loads(value) if isinstance(value,str) else {}
            except (ValueError,TypeError):pins={}
            if not isinstance(pins,dict):pins={}
            bindings[str(inst.property(1))]={'source_instance_name':str(inst.property(5)) if inst.property(5) else None,'pin_nets':pins}
    for item in scene.get('instances',[]):
        metadata=bindings.get(item['id'].rsplit('/@',1)[-1],{})
        if metadata.get('source_instance_name'):item.update(metadata)
    for pin in scene.get('pins',[]):
        tail=pin['cell_path'].rsplit('/',1)[-1].rsplit(':',2)
        if len(tail)==3:
            metadata=bindings.get(tail[1],{});net=metadata.get('pin_nets',{}).get(pin['name'])
            if isinstance(net,str):pin.update(net=net,net_scope=pin['cell_path'].rsplit('/',1)[0],binding_source='def-component-pin')
    scene['interchange_source']={'reader':'KLayout','native_execution':False,'physical_stack':'unknown'}
    return scene

def read_artifact(params):
    run=S.get_run(params['run_id'])
    if run.get('workflow')!='imported-results':raise EDAError('NOT_FOUND','Not an imported result artifact.')
    key=params.get('key');source=run.get('artifacts',{}).get(key)
    if key not in commercial_results.ROLES or not source:raise EDAError('NOT_FOUND','Only declared uploaded result roles can be read.')
    path=Path(source);folder=S.STATE/'runs'/run['id']
    if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(folder.resolve()) or path.stat().st_size>MAX_FILE:raise EDAError('UNSAFE_ARTIFACT_PATH','Uploaded artifact is unavailable or outside its run.')
    value=path.read_bytes();expected=run.get('imported_source',{}).get('files',{}).get(path.name,{}).get('sha256')
    if sha(value)!=expected:raise EDAError('ARTIFACT_CHANGED','Immutable uploaded result file changed.')
    return {'name':path.name,'base64':base64.b64encode(value).decode(),'mime':'text/plain'}

def prepare_results(params):
    files=files_decode(params.get('files'));options=options_validate(params.get('options'));spec=options.get('results')
    if not isinstance(spec,dict) or set(spec)-{'operation','outputs','context'} or spec.get('operation') not in {'simulation','drc','lvs','pex'}:raise EDAError('INVALID_RESULTS','Explicit results operation, outputs and parser context are required.')
    outputs=spec.get('outputs');context=spec.get('context',{})
    if not isinstance(outputs,dict) or not outputs or set(outputs)-commercial_results.ROLES or any(name not in files for name in outputs.values()) or not isinstance(context,dict):raise EDAError('INVALID_RESULTS','Result roles must reference uploaded files only.')
    allowed={'formats','wave_schema','current_schema','column_schema','analysis','measurements','tool_id','convention'}
    if set(context)-allowed:raise EDAError('INVALID_RESULTS','Only explicit numeric format/column metadata is accepted; execution and geometry claims are authoritative.')
    normalize_result_units(context)
    return {'files':files,'spec':spec}

def normalize_result_units(context):
    """Explicit imported column units only; immutable file bytes stay untouched."""
    converted=copy.deepcopy(context);records=[]
    units={'A':('A',1),'mA':('A',1e-3),'uA':('A',1e-6),'µA':('A',1e-6),'nA':('A',1e-9),'pA':('A',1e-12),
           'V':('V',1),'mV':('V',1e-3),'uV':('V',1e-6),'µV':('V',1e-6),
           's':('s',1),'ms':('s',1e-3),'us':('s',1e-6),'µs':('s',1e-6),'ns':('s',1e-9),'ps':('s',1e-12),'point':('point',1),'1':('point',1)}
    for key in ('wave_schema','current_schema','column_schema'):
        schema=converted.get(key)
        if schema is None:continue
        if not isinstance(schema,dict):raise EDAError('INVALID_RESULTS','Column schema must be an object.')
        for category,specs in [('x',[schema.get('x')]),('signals',schema.get('signals',[])),('branches',schema.get('branches',[]))]:
            if not isinstance(specs,list):raise EDAError('INVALID_RESULTS','Column specifications must be arrays.')
            for index,item in enumerate(specs):
                if not isinstance(item,dict) or item.get('unit') not in units:raise EDAError('UNSUPPORTED_UNIT','Provide explicit supported SI/prefixed units; no unit is inferred.')
                original=item['unit'];unit,factor=units[original]
                if category=='branches' and unit!='A':raise EDAError('UNSUPPORTED_UNIT','Signed current columns must declare A/mA/uA/nA/pA.')
                item['unit']=unit;records.append({'schema':key,'kind':category,'index':index,'id':item.get('id'),'name':item.get('name'),'from_unit':original,'to_unit':unit,'factor':factor})
    return converted,records

def scale_result(parsed,records):
    def scale(values,factor):
        out=[v*factor for v in values]
        if any(not math.isfinite(v) for v in out):raise EDAError('INVALID_RESULTS','Unit conversion overflowed a finite scalar.')
        return out
    for wave in parsed.get('waveforms',[]):
        schema='wave_schema' if any(r['schema']=='wave_schema' for r in records) else 'column_schema'
        axis=next((r for r in records if r['schema']==schema and r['kind']=='x'),None)
        value=next((r for r in records if r['schema']==schema and r['kind']=='signals' and r['name']==wave['name']),None)
        if axis:wave['x']=scale(wave['x'],axis['factor'])
        if value:wave['y']=scale(wave['y'],value['factor'])
    flow=parsed.get('current_flow')
    if flow:
        schema='current_schema' if any(r['schema']=='current_schema' for r in records) else 'column_schema'
        axis=next((r for r in records if r['schema']==schema and r['kind']=='x'),None)
        if axis:flow['x']=scale(flow['x'],axis['factor'])
        for branch in flow['branches']:
            value=next((r for r in records if r['schema']==schema and r['kind']=='branches' and r['id']==branch['id']),None)
            if value:branch['values_A']=scale(branch['values_A'],value['factor'])
    return parsed

def build_results(params,prepared,observed_revision):
    p=S.get_project(params['project_id'])
    if p['revision']!=observed_revision:raise EDAError('REVISION_CONFLICT','Project changed while result files were being decoded.')
    rid=uuid.uuid4().hex;folder=S.STATE/'runs'/rid;folder.mkdir(parents=True)
    files=prepared['files'];spec=prepared['spec']
    for name,value in files.items():(folder/name).write_bytes(value)
    context,conversions=normalize_result_units(spec.get('context',{}));context.update(project_id=p['id'],run_id=rid,revision=p['revision'],geometry_binding=False,geometry_linkage='unverified',execution_status='completed')
    parsed=scale_result(commercial_results.parse_results(spec['operation'],folder,spec['outputs'],context),conversions)
    run={'id':rid,'project_id':p['id'],'revision':p['revision'],'kind':spec['operation'],'workflow':'imported-results','native_execution':False,'execution_status':'completed','analysis_result':'unknown','freshness':'current','started_at':S.now(),'ended_at':S.now(),'input_signature':'immutable-import:'+sha(json.dumps({name:sha(v) for name,v in files.items()},sort_keys=True).encode()),'artifacts':{role:str(folder/name) for role,name in spec['outputs'].items()},'imported_source':{'files':{name:{'bytes':len(v),'sha256':sha(v)} for name,v in files.items()},'unit_conversions':conversions,'vendor_execution_verified':False},**parsed}
    if run.get('current_flow'):
        run['current_flow'].update(source='imported',input_origin='imported-file',geometry_linkage='unverified')
        run['current_flow']['notes'].append('Imported solver samples: Register did not execute or license-verify the source solver.')
    S.dump(folder/'manifest.json',run);(folder/'stdout.log').write_text('Imported external solver data. Register executed no native solver.\n'+run['message']+'\n');prepared['run']=run

def apply_results(params,prepared,observed_revision):
    if S.get_project(params['project_id'])['revision']!=observed_revision:raise EDAError('REVISION_CONFLICT','Project changed while result files were being decoded.')
    S.put_run(prepared['run']);return prepared['run']

def rpc(method,params):
    allowed={'compat.inspect':{'files','options'},'compat.export':{'project_id','format','options'},'compat.import':{'project_id','files','options','expected_revision','command_id'},'compat.import_results':{'project_id','files','options','expected_revision','command_id'}}
    if method not in allowed or set(params)-allowed[method]:raise EDAError('INVALID_REQUEST','Compatibility accepts uploaded basenames and declared options only, never server paths.')
    if method=='compat.inspect':return prepare(params)['report']
    if method=='compat.export':return export(params)
    if method in {'compat.import','compat.import_results'}:
        replay=S.completed_receipt(method,params)
        if replay is not None:return replay
        observed=S.get_project(params['project_id'])['revision'];prepared=prepare(params) if method=='compat.import' else prepare_results(params)
        if method=='compat.import_results':build_results(params,prepared,observed)
        return S.mutate(method,params,lambda:apply_import(params,prepared,observed) if method=='compat.import' else apply_results(params,prepared,observed))
    raise EDAError('UNSUPPORTED','Unsupported compatibility method.')
