"""Signed conventional terminal currents measured by ngspice, never inferred from volts.

Zero-volt series sources measure a component's first-terminal current. This avoids
model-specific PMOS parameter sign conventions and includes transient terminal
displacement current. A D->S arrow is a reference direction, not a claim that all
drain current enters only the source terminal. AC phasors have no scalar direction.
"""
import hashlib
import math
from pathlib import Path
import re
import klayout.db as k
import geometry
from geometry import EDAError
import native

LIMIT=64
MODELS=set(native.MODEL_KIND)

def prepare(project,source,folder,post_layout=False):
    """Instrument a COPY of the native netlist; keep its original extraction intact."""
    lines=[]
    for line in Path(source).read_text().splitlines():
        if line.lstrip().startswith('+') and lines:lines[-1]+=' '+line.lstrip()[1:].strip()
        else:lines.append(line)
    cells={}; cell=None; output=[]
    reserved={token.lower() for line in lines for token in line.split()}
    globals={node.lower() for line in lines if line.split() and line.split()[0].lower()=='.global' for node in line.split()[1:]}
    for line in lines:
        fields=line.split()
        if fields and fields[0].lower()=='.subckt':
            cell=fields[1].lower();cells[cell]={'ports':fields[2:],'branches':[],'children':[],'resistor_edges':[]}
        if fields and fields[0].lower()=='.ends':cell=None
        if cell and len(fields)>=4 and fields[0][0].upper() in {'X','M','R','C','I','V'}:
            element=fields[0];kind=element[0].upper();model=(fields[5] if len(fields)>=6 else None) if kind=='M' else next((field for field in fields[5:] if field in MODELS),None) if kind=='X' else None
            if kind=='R':cells[cell]['resistor_edges'].append((fields[1].lower(),fields[2].lower()))
            if model or (not post_layout and kind in {'R','C','I','V'}):
                digest=hashlib.sha256((cell+'\0'+element.lower()).encode()).hexdigest()[:16]
                sense='Vregister_cf_'+digest;node='register_cf_node_'+digest
                counter=0
                while any(name.lower() in reserved for name in (sense,sense+'_source',node,node+'_source')):
                    counter+=1;digest=hashlib.sha256((cell+'\0'+element.lower()+'\0'+str(counter)).encode()).hexdigest()[:16]
                    sense='Vregister_cf_'+digest;node='register_cf_node_'+digest
                reserved.update(name.lower() for name in (sense,sense+'_source',node,node+'_source'))
                original=fields[1];last=fields[3] if model else fields[2]
                voltage_nodes=[original,last]+([fields[2],fields[4]] if model else [])
                fields[1]=node
                if model:fields[3]=node+'_source'
                output.append(' '.join(fields));output.append(f'{sense} {original} {node} 0')
                if model:output.append(f'{sense}_source {last} {node}_source 0')
                cells[cell]['branches'].append({'element':element,'sense':sense,'from':original,'to':last,'model':model,'kind':'mos' if model else kind,'voltage_nodes':voltage_nodes})
                continue
            if kind=='X' and fields[-1].lower() not in MODELS:cells[cell]['children'].append((element,fields[1:-1],fields[-1].lower()))
        output.append(line)
    dest=Path(folder)/'current-probe.spice';dest.write_text('\n'.join(output)+'\n')
    descriptors=[];warnings=[]
    flat_devices={}
    for d in project['schematic']['devices']:
        prefix={'nmos':'X','pmos':'X','resistor':'R','capacitor':'C','current':'I','voltage':'V'}.get(d['kind'])
        if prefix:flat_devices[(prefix+d['name']).lower()]=d
    def visit(cell,path,binding,stack):
        if cell in stack or len(stack)>=16:return
        definition=cells.get(cell)
        if definition is None:return
        resolve=lambda node:binding.get(node.lower(),node if node=='0' or node.lower() in globals else path+'.'+node)
        parent={}
        def root(node):
            node=node.lower();parent.setdefault(node,node)
            while parent[node]!=node:parent[node]=parent[parent[node]];node=parent[node]
            return node
        for a,b in definition['resistor_edges']:parent[root(b)]=root(a)
        for branch in definition['branches']:
            if len(descriptors)>=LIMIT-8:warnings.append('Native current-flow branch limit reached; additional branches omitted.');break
            d=flat_devices.get(branch['element'].lower()) if not stack and not post_layout else None
            if not stack and post_layout and branch['model']:
                matches=[device for device in project['schematic']['devices'] if device.get('model')==branch['model']]
                if len(matches)==1:d=matches[0]
            first,last=branch['from'],branch['to'];sense=branch['sense'];orientation=False
            if d and branch['model']:
                drain,source=d['pins']['D'],d['pins']['S']
                # Extractors can legally exchange symmetric MOS D/S. Orient to
                # native logical pins only when the actual resistor graph proves
                # a unique correspondence to those terminals (never by name guess).
                if root(drain)!=root(source):
                    if root(first)==root(drain) and root(last)==root(source):orientation=True
                    elif root(first)==root(source) and root(last)==root(drain):first,last=last,first;sense+='_source';orientation=True
            vector='i(v.'+path.lower()+'.'+sense.lower()+')'
            descriptor={'id':path+'/'+branch['element'],'name':(d['name'] if d else branch['element'])+(' drain terminal (D→S reference)' if orientation else ' native drain→source' if branch['kind']=='mos' else ' terminal 1→2'),
                        'from_net':resolve(first),'to_net':resolve(last),'mapping':'unmapped','source_vector':vector,'_save_vector':vector,'_orientation':orientation,
                        '_voltage_nodes':[resolve(node) for node in branch['voltage_nodes']]}
            if d:descriptor['device_id']=d['id']
            if branch['model']:descriptor['_model']=branch['model']
            descriptors.append(descriptor)
        for element,nodes,target in definition['children']:
            child=cells.get(target)
            if child:visit(target,path+'.'+element,{port.lower():resolve(node) for port,node in zip(child['ports'],nodes)},stack+[cell])
    top=project['cell'].lower();visit(top,'XU',{port.lower():port for port in cells.get(top,{}).get('ports',[])},[])
    if post_layout:warnings.append('Post-layout flow records eligible MOS terminal and testbench voltage branches. Distributed extracted R/C branch currents are not included; their spatial correspondence is unknown.')
    return dest,descriptors,list(dict.fromkeys(warnings))

def add_testbench_voltage_branches(lines,branches):
    """i(V) is positive into the source's + node and out of its - node; no negation."""
    for line in lines:
        fields=line.split()
        if len(fields)>=4 and fields[0][0].upper()=='V' and len(branches)<LIMIT:
            branches.append({'id':'testbench/'+fields[0],'name':fields[0]+' source (+→−)',
                             'from_net':fields[1],'to_net':fields[2],'mapping':'unmapped','source_vector':'i('+fields[0]+')'})

def voltage_probes(branches,folder):
    """Actual native branch/pin node names, including resolved hierarchy bindings."""
    import json
    probes=[];omitted=[];seen=set()
    for branch in branches:
        for node in [branch['from_net'],branch['to_net'],*branch.get('_voltage_nodes',[])]:
            if node.lower() in seen:continue
            seen.add(node.lower())
            if len(probes)>=256 or not re.fullmatch(r'[A-Za-z0-9_.$:]+',node):
                omitted.append(node);continue
            probes.append({'net':node,'source_vector':'defined-ground-reference' if node=='0' else 'v('+node+')'})
    metadata={'schema_version':1,'probes':probes,'omitted_nets':omitted,
              'scope':'Voltage at instrumented native branch endpoints and MOS gate/body nodes, maximum 256 unique nodes; not all extracted RC nodes.'}
    (Path(folder)/'voltage-probes.json').write_text(json.dumps(metadata,indent=2))
    return probes

def instrument_control(deck,branches,save_vectors=None,voltage_probes=None):
    if not branches:return deck
    lines=deck.splitlines();index=next(i for i,line in enumerate(lines) if line.strip()=='.control')
    selected=['all'] if save_vectors is None else list(save_vectors)
    selected += [branch.get('_save_vector',branch['source_vector']) for branch in branches]
    selected += [probe['source_vector'] for probe in voltage_probes or [] if probe['net']!='0']
    lines.insert(index+1,'save '+' '.join(dict.fromkeys(selected)))
    end=next(i for i,line in enumerate(lines) if line.strip()=='quit')
    extra=[f'let register_flow_{i} = {branch["source_vector"]}' for i,branch in enumerate(branches)]
    extra+=['wrdata current-flow.dat '+' '.join(f'register_flow_{i}' for i in range(len(branches)))]
    if voltage_probes:
        extra += [f'let register_voltage_{i} = '+('0*register_flow_0' if probe['net']=='0' else probe['source_vector']) for i,probe in enumerate(voltage_probes)]
        extra += ['wrdata node-voltages.dat '+' '.join(f'register_voltage_{i}' for i in range(len(voltage_probes)))]
    lines[end:end]=extra
    return '\n'.join(lines)+'\n'

def apply_terminal_paths(project,layout,branches):
    # MUX PCells carry device IDs on their actual layout shapes. Resolve each
    # named contact within that device's active diffusion and LI geometry.
    # Body/gate labels with the same net are excluded by the diffusion test;
    # missing or ambiguous contacts remain unmapped. Post-layout native X IDs
    # remain unmapped until their individual logical identity is proved.
    if (project.get('source')=='pdk' and project.get('example')=='mux4'
        and project.get('design_template',{}).get('layout_status')=='generated-public-core'
        and not project.get('viewer_only') and not project.get('import_metadata')):
        top=layout.cell(project['cell']); active=layout.find_layer(65,20)
        labels=layout.find_layer(67,5); metal=layout.find_layer(67,20)
        if top is None or any(li is None for li in (active,labels,metal)):return
        devices={d['id']:d for d in project['schematic']['devices'] if d['kind'] in ('nmos','pmos')}
        for branch in branches:
            d=devices.get(branch.get('device_id'))
            if d is None or not branch.get('_orientation'):continue
            pin_points={}
            for pin in ('D','S'):
                candidates=[]
                for label in top.shapes(labels).each():
                    if not label.is_text() or label.property(3)!=d['id'] or label.text.string!=d['pins'][pin]:continue
                    point=label.text.trans.disp
                    def contains(li):
                        return any(poly is not None and poly.inside(point) for poly in
                            (geometry.shape_poly(s) for s in top.shapes(li).each() if s.property(3)==d['id']))
                    if contains(active) and contains(metal):candidates.append([str(point.x),str(point.y)])
                if len(candidates)==1:pin_points[pin]=candidates[0]
            if set(pin_points)=={'D','S'} and pin_points['D']!=pin_points['S']:
                branch.update(path_dbu=[pin_points['D'],pin_points['S']],layer_id='67/20',mapping='device_terminals')
        return
    # The generated single MOS has actual named D/S contact labels. Match those
    # source labels and drawing geometry; canvas coordinates are never used.
    if project.get('source')!='pdk' or project.get('example')!='mosfet' or project.get('viewer_only') or project.get('import_metadata'):return
    anchors={}
    top=layout.cell(project['cell'])
    for li in layout.layer_indices():
        info=layout.get_info(li)
        if info.datatype!=5:continue
        drawing=layout.find_layer(info.layer,20)
        if drawing is None:continue
        for shape in top.shapes(li).each():
            if not shape.is_text() or shape.text.string not in {'D','S'}:continue
            point=shape.text.trans.disp
            if any(poly is not None and poly.inside(point) for poly in (geometry.shape_poly(s) for s in top.shapes(drawing).each())):
                anchors.setdefault(shape.text.string,[]).append((point.x,point.y,f'{info.layer}/20'))
    if any(len(anchors.get(pin,[]))!=1 for pin in ('D','S')):return
    drain,source=anchors['D'][0],anchors['S'][0]
    for branch in branches:
        if branch.get('device_id')=='mn1' and branch.get('_model')=='sky130_fd_pr__nfet_01v8' and branch.get('_orientation'):
            branch.update(path_dbu=[[str(drain[0]),str(drain[1])],[str(source[0]),str(source[1])]],mapping='device_terminals')
            if drain[2]==source[2]:branch['layer_id']=drain[2]

def read(folder,project,analysis,xunit,branches,layout):
    path=Path(folder)/'current-flow.dat'
    if not path.is_file():raise EDAError('CURRENT_FLOW_FAILED','ngspice did not produce requested signed current vectors; logs retained.')
    data=[]
    for line in path.read_text().splitlines()[1:]:
        try:row=[float(value) for value in line.split()]
        except ValueError:raise EDAError('PARSER_FAILED','Current-flow data contains a nonnumeric row.')
        if len(row)!=len(branches)+1 or any(not math.isfinite(value) for value in row):raise EDAError('PARSER_FAILED','Unexpected or nonfinite signed current-flow columns.')
        data.append(row)
    if not data:raise EDAError('PARSER_FAILED','Signed current-flow data contains no actual samples.')
    apply_terminal_paths(project,layout,branches)
    for index,branch in enumerate(branches):
        branch['values_A']=[row[index+1] for row in data]
        for key in list(branch):
            if key.startswith('_'):branch.pop(key)
    result={'schema_version':1,'source':'ngspice','analysis':analysis,'x':[row[0] for row in data],'x_unit':xunit,'branches':branches,'convention':'conventional','revision':project['revision']}
    metadata=Path(folder)/'voltage-probes.json'
    if metadata.is_file():
        import json
        info=json.loads(metadata.read_text());probes=info['probes']
        if probes:
            path=Path(folder)/'node-voltages.dat'
            if not path.is_file():raise EDAError('VOLTAGE_PROBE_FAILED','No requested native node-voltage data. Engine log retained.')
            voltages=[]
            for line in path.read_text().splitlines()[1:]:
                try:row=[float(v) for v in line.split()]
                except ValueError:raise EDAError('PARSER_FAILED','Node voltage data has a nonnumeric row.')
                if len(row)!=len(probes)+1 or any(not math.isfinite(v) for v in row):raise EDAError('PARSER_FAILED','Unexpected node voltage columns or nonfinite values.')
                voltages.append(row)
            if len(voltages)!=len(data) or any(not math.isclose(a[0],b[0],rel_tol=1e-12,abs_tol=1e-30) for a,b in zip(voltages,data)):
                raise EDAError('VOLTAGE_AXIS_MISMATCH','Node voltages and currents do not share the same actual simulation axis.')
            result['node_voltages']=[{**probe,'values_V':[row[i+1] for row in voltages]} for i,probe in enumerate(probes)]
        result['voltage_probe_scope']=info['scope'];result['omitted_voltage_nets']=info['omitted_nets']
    return result

METHOD='Actual zero-volt series sense-source current into each component first terminal; MOS arrows use D→S as drain-terminal reference, including transient displacement current. For extracted symmetric MOS D/S exchanges, the native resistor graph must prove correspondence before selecting the sense source at the logical D terminal; source terminal current is never approximated by negating a different terminal current. Testbench i(V) is positive +→− without negation. Negative samples reverse the reference direction. Paths connect verified named contact anchors and are not reconstructed conductor streamlines.'
