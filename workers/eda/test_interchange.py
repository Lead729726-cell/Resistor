"""Actual KLayout/native document regression, isolated from main worker state."""
import base64
import copy
import json
import os
import re
from pathlib import Path
import tempfile
import time
import uuid
import klayout.db as k

RUN=Path('/workspace/.runtime/evidence')/('interchange-'+uuid.uuid4().hex)
RUN.mkdir(parents=True)
os.environ['MOS_STATE']=str(RUN/'state');os.environ['MOS_TOKEN']='isolated-not-a-credential'
import server as S
import interchange as I
import geometry as G

LEF='''VERSION 5.8 ;
BUSBITCHARS "[]" ;
DIVIDERCHAR "/" ;
UNITS DATABASE MICRONS 1000 ; END UNITS
MANUFACTURINGGRID 0.001 ;
LAYER M1 TYPE ROUTING ; DIRECTION HORIZONTAL ; PITCH 0.2 ; WIDTH 0.1 ; SPACING 0.1 ; END M1
MACRO INV
 CLASS CORE ; ORIGIN 0 0 ; SIZE 2 BY 1 ;
 PIN A DIRECTION INPUT ; USE SIGNAL ; PORT LAYER M1 ; RECT 0.1 0.1 0.3 0.3 ; END END A
 PIN Y DIRECTION OUTPUT ; USE SIGNAL ; PORT LAYER M1 ; RECT 1.7 0.7 1.9 0.9 ; END END Y
 OBS LAYER M1 ; RECT 0.4 0.4 1.6 0.6 ; END
END INV
END LIBRARY
'''
DEF='''VERSION 5.8 ;
DIVIDERCHAR "/" ; BUSBITCHARS "[]" ;
DESIGN CHIP ; UNITS DISTANCE MICRONS 1000 ;
DIEAREA ( 0 0 ) ( 20000 10000 ) ;
COMPONENTS 2 ;
- U1 INV + PLACED ( 1000 1000 ) N ;
- U2 INV + PLACED ( 6000 3000 ) FN ;
END COMPONENTS
PINS 2 ;
- IN + NET in + DIRECTION INPUT + USE SIGNAL + LAYER M1 ( -100 -100 ) ( 100 100 ) + PLACED ( 0 2000 ) N ;
- OUT + NET out + DIRECTION OUTPUT + USE SIGNAL + LAYER M1 ( -100 -100 ) ( 100 100 ) + PLACED ( 10000 2000 ) N ;
END PINS
NETS 3 ;
- in ( PIN IN ) ( U1 A ) + ROUTED M1 ( 0 2000 ) ( 1100 2000 ) ;
- mid ( U1 Y ) ( U2 A ) + ROUTED M1 ( 2900 2000 ) ( 5900 2000 ) ;
- out ( U2 Y ) ( PIN OUT ) + ROUTED M1 ( 4300 2000 ) ( 10000 2000 ) ;
END NETS
END DESIGN
'''
MAP=[{'name':'M1','layer':68,'datatype':20},{'name':'M1.PIN','layer':68,'datatype':16},{'name':'M1.LABEL','layer':68,'datatype':5},{'name':'M1.OBS','layer':68,'datatype':21},{'name':'M1.NET','layer':68,'datatype':20},{'name':'M1.SNET','layer':68,'datatype':20},{'name':'OUTLINE','layer':900,'datatype':0}]
CASES=[]
def case(name,fn):
    started=time.monotonic()
    try:
        value=fn();CASES.append({'name':name,'pass':True,'seconds':time.monotonic()-started,'details':value});return value
    except Exception as e:CASES.append({'name':name,'pass':False,'seconds':time.monotonic()-started,'error':repr(e)});raise
def assert_(value,message='assertion failed'):
    if not value:raise AssertionError(message)
def uploaded(files):return [{'name':n,'base64':base64.b64encode(v.encode() if isinstance(v,str) else v).decode()} for n,v in files.items()]
def args(files,options=None):return {'files':uploaded(files),'options':options or {}}
def reject(code,fn):
    try:fn()
    except G.EDAError as e:assert_(e.code==code,(e.code,code));return {'code':e.code}
    raise AssertionError('Expected '+code)

def main():
    global project,prepared
    prepared=case('actual native LEF DEF geometry + pins + names',lambda:I.prepare(args({'tech.lef':LEF,'design.def':DEF},{'layer_map':MAP})))
    info=prepared['report']['layout'];case('actual property bindings and mirrored placements',lambda:verify_physical(prepared))
    project=S.create({'name':'Interchange regression','example':'fixture'})
    params={**args({'tech.lef':LEF,'design.def':DEF},{'layer_map':MAP}),'project_id':project['id'],'expected_revision':project['revision'],'command_id':'layout-import'}
    imported=case('native immutable receipt layout import',lambda:I.rpc('compat.import',params));project=imported['project']
    case('exact receipt replay no new revision',lambda:assert_(I.rpc('compat.import',params)['project']['revision']==project['revision']))
    case('stable source pin/net properties after OAS snapshot',lambda:verify_physical({'layout':S.load_layout(project),'report':I.prepare(args({'tech.lef':LEF,'design.def':DEF},{'layer_map':MAP}))['report']}))
    case('GDS export reread preserves DBU/hierarchy/geometry',lambda:roundtrip('gds'))
    case('OAS export reread preserves semantic geometry + properties',lambda:roundtrip('oas'))
    case('slash colon cell names preserve native name with safe export basename',unsafe_cell_basename)
    case('explicit manufacturing DBU conversion',lambda:assert_(abs(I.prepare(args({'tech.lef':LEF,'design.def':DEF},{'layer_map':MAP,'dbu_um':0.002}))['layout'].cell('CHIP').bbox().width()*0.002-prepared['layout'].cell('CHIP').bbox().width()*prepared['layout'].dbu)<1e-6))
    case('unmapped layer fail closed',lambda:reject('UNMAPPED_LAYERS',lambda:I.prepare(args({'tech.lef':LEF,'design.def':DEF},{'layer_map':[{'name':'M2','layer':69,'datatype':20}]}))))
    case('missing explicit layer map',lambda:reject('MISSING_LAYER_MAP',lambda:I.prepare(args({'tech.lef':LEF,'design.def':DEF}))))
    case('DEF missing LEF closure',lambda:reject('MISSING_LEF',lambda:I.prepare(args({'design.def':DEF},{'layer_map':MAP}))))
    case('basename traversal rejection',lambda:reject('UNSAFE_FILENAME',lambda:I.prepare(args({'../outside.gds':b'x'}))))
    case('case collision rejection',lambda:reject('UNSAFE_FILENAME',lambda:I.prepare({'files':uploaded({'a.lef':LEF,'A.lef':LEF})})))
    case('Korean basenames and quoted closure safely supported',unicode_names)
    case('Tcl and quoted path metacharacters rejected',lambda:reject('UNSAFE_FILENAME',lambda:I.prepare(args({'evil};exec marker.lef':LEF}))))
    case('RPC rejects unbounded server file references',lambda:reject('INVALID_REQUEST',lambda:I.rpc('compat.inspect',{**args({'a.lef':LEF}),'path':'/etc/passwd'})))
    case('invalid binary layout rejected by native reader',lambda:reject('LAYOUT_PARSE_FAILED',lambda:I.prepare(args({'bad.gds':b'not-gds'}))))
    case('raw OA NDM truthful converter requirement',lambda:assert_(not I.prepare(args({'database.ndm':b'opaque proprietary'}))['report']['supported']))
    case('public SKY130 actual tech/macro LEF and DEF',public_sky130)
    case('explicit purpose rows distinguish drawing and pin mapping',purpose_rows)
    case('actual uploaded GDS macro replaces FOREIGN geometry',macro_substitution)
    case('all eight DEF orientations retained through native OAS',orientations)
    case('actual scene component pins receive instance-specific nets',scene_bindings)
    case('unresolved DEF macro fails rather than empty placeholder',lambda:reject('UNRESOLVED_MACRO',lambda:I.prepare(args({'tech.lef':LEF,'design.def':DEF.replace('INV + PLACED','MISSING + PLACED')},{'layer_map':MAP}))))
    circuit={
      'top.cdl':'''* exported CDL with declared pins, model scope and wrapped MOS
.GLOBAL VDD! VSS!
.include "cells.spi"
.SUBCKT TOP IN OUT VDD! VSS!
*.PININFO IN:I OUT:O VDD!:B VSS!:B
XINV IN OUT VDD! VSS! INV W=2u
.ENDS TOP
.END
''',
      'cells.spi':'''* cells
.model NF NMOS (level=1 vto=0.5 kp=100u)
.model PF PMOS (level=1 vto=-0.5 kp=50u)
.subckt INV A Y VP VN
MN Y A VN VN NF
+ W=2u L=1u
MP Y A VP VP PF W=4u L=1u
.ends INV
'''}
    parsed=case('actual CDL SPICE closure ordered pins exact model names',lambda:I.prepare(args(circuit)))
    case('CDL scopes pin direction + model exact case preserved',lambda:assert_(parsed['netlist']['cells'][0]['name']=='INV' and parsed['netlist']['cells'][0]['devices'][0]['model']=='NF' and parsed['netlist']['cells'][1]['pininfo']==['IN:I','OUT:O','VDD!:B','VSS!:B']))
    case('electrical document apply preserves actual original layout',lambda:import_circuit(circuit))
    case('CDL export preserves source bytes and closure',lambda:assert_({f['name']:base64.b64decode(f['base64']).decode() for f in I.export({'project_id':project['id'],'format':'cdl'})['files']}==circuit))
    case('ordinary raw layout import clears obsolete compatibility reference',raw_import_reset)
    case('library scopes remain distinct + explicit section selection',library_scope)
    case('outside include rejected',lambda:reject('UNSAFE_INCLUDE',lambda:I.prepare(args({'bad.spi':'.include "/etc/passwd"\n'}))))
    case('continued external lib rejected',lambda:reject('UNSAFE_INCLUDE',lambda:I.prepare(args({'bad.spi':'.lib "outside.spi"\n+ tt\n'}))))
    case('control script rejected no execution',lambda:reject('UNSUPPORTED_NETLIST',lambda:I.prepare(args({'bad.spi':'.control\nshell touch marker\n.endc\n'}))))
    case('XSPICE process models rejected',lambda:reject('UNSAFE_NETLIST',lambda:I.prepare(args({'bad.spi':'.model evil d_process(command="foo")\n'}))))
    case('node ordering preserved across wrapped subckt',lambda:assert_(I.prepare(args({'x.spi':'.subckt X B S\n+ G D\nM1 D G S B NM W=2u L=1u\n.ends X\n'}))['netlist']['cells'][0]['ports']==['B','S','G','D']))
    case('known four-terminal BJT retains substrate before model',lambda:assert_(I.prepare(args({'q.spi':'.model NMOD NPN (bf=100)\n.subckt BJT C B E S\nQ1 C B E S NMOD\n.ends BJT\n'}))['netlist']['cells'][0]['devices'][0]['nodes']==['C','B','E','S']))
    case('ambiguous external BJT terminal count rejected',lambda:reject('AMBIGUOUS_BJT',lambda:I.prepare(args({'q.spi':'.subckt BJT C B E S\nQ1 C B E S UNKNOWN_MODEL\n.ends BJT\n'}))))
    case('native-only bare layout cannot invent electrical export',bare_export)
    case('imported signed external current samples actual parser no solver claim',import_results)
    case('imported result receipt + revision freshness',result_freshness)
    case('explicit uA and ns units converted to SI with immutable hashes',prefixed_results)
    case('imported artifact SHA boundary rejects changed bytes',artifact_hash)
    case('unsafe result context execution claims rejected',lambda:reject('INVALID_RESULTS',lambda:I.prepare_results(args({'data.csv':'x,i\n0,1\n'},{'results':{'operation':'simulation','outputs':{'currents':'data.csv'},'context':{'layout_sha256':'invented'}}}))))
    case('stale import revision precondition rejects',lambda:reject('REVISION_CONFLICT',lambda:I.rpc('compat.import',{**args(circuit),'project_id':project['id'],'expected_revision':1,'command_id':'stale-command'})))

def verify_physical(data):
    l=data['layout'];top=l.cell('CHIP');instances=list(top.each_inst());assert_(len(instances)==2)
    assert_(any(i.cell_inst.trans.is_mirror() for i in instances));assert_(sorted(i.property(5) for i in instances)==['U1','U2'])
    assert_(json.loads(next(i for i in instances if i.property(5)=='U1').property(6))=={'A':'in','Y':'mid'})
    pins=[s.property(4) for c in l.each_cell() for li in l.layer_indices() for s in c.shapes(li).each() if s.property(4)]
    nets=[s.property(2) for c in l.each_cell() for li in l.layer_indices() for s in c.shapes(li).each() if s.property(2)]
    assert_({'A','Y','IN','OUT'}<=set(pins),pins);assert_({'in','mid','out'}<=set(nets),nets)
    return {'dbu_um':l.dbu,'pins':sorted(set(pins)),'nets':sorted(set(nets)),'instances':[i.property(5) for i in instances],'shape_count':data['report']['layout']['stored_shape_count']}
def roundtrip(fmt):
    result=I.export({'project_id':project['id'],'format':fmt});parsed=I.prepare({'files':result['files']})
    original=S.load_layout(project);assert_(G.semantic_hash(original,original.cell(project['cell']))==G.semantic_hash(parsed['layout'],parsed['layout'].cell(project['cell'])));assert_(G.hierarchy_hash(original)==G.hierarchy_hash(parsed['layout']))
    if fmt=='oas':verify_physical(parsed)
    return {'sha256':result['report']['files'][0]['sha256'],'dbu_um':parsed['layout'].dbu}
def unsafe_cell_basename():
    l=k.Layout();l.dbu=.001;c=l.create_cell('lib/core:top$');c.shapes(l.layer(77,0)).insert(k.Box(0,0,10,10));dest=RUN/'odd-cell.gds';l.write(str(dest));p=S.create({'name':'Odd cell name','example':'fixture'});r=I.rpc('compat.import',{**args({'odd.gds':dest.read_bytes()}),'project_id':p['id']});out=I.export({'project_id':p['id'],'format':'oas'});assert_(out['files'][0]['name']=='layout.oas');decoded=I.prepare({'files':out['files']});assert_(decoded['layout'].cell('lib/core:top$') is not None);return {'cell_name':'lib/core:top$','basename':'layout.oas'}
def raw_import_reset():
    clone=S.clone_project({'project_id':project['id'],'name':'Raw layout reset'});assert_(clone.get('interchange_netlist'));l=S.load_layout(clone);dest=RUN/'plain.oas';l.write(str(dest));result=S.mutate('layout.import',{'project_id':clone['id']},lambda:S.import_layout({'project_id':clone['id'],'path':str(dest)}));assert_(not result.get('interchange_netlist') and not result.get('interchange_layout'));return {'prior_electrical_document_cleared':True}
def public_sky130():
    root=Path('/foss/pdks/sky130A');tech=list(root.glob('libs.ref/sky130_fd_sc_hd/techlef/sky130_fd_sc_hd__nom.tlef'));macro=root/'libs.ref/sky130_fd_sc_hd/lef/sky130_fd_sc_hd.lef'
    assert_(tech and macro.is_file(),'Installed public technology/macro LEF not found')
    text=tech[0].read_text();macro_text='VERSION 5.8 ;\n'+re.search(r'(?ms)^MACRO sky130_fd_sc_hd__inv_1\b.*?^END sky130_fd_sc_hd__inv_1\s*$',macro.read_text())[0]+'\nEND LIBRARY\n';defs='''VERSION 5.8 ; DESIGN PUBLIC_TOP ; UNITS DISTANCE MICRONS 1000 ; DIEAREA ( 0 0 ) ( 10000 10000 ) ; COMPONENTS 1 ; - INV1 sky130_fd_sc_hd__inv_1 + PLACED ( 1000 1000 ) FN ; END COMPONENTS NETS 1 ; - signal ( INV1 A ) ; END NETS END DESIGN\n'''
    names=set(re.findall(r'(?mi)^\s*LAYER\s+(\S+)',text+macro_text));rows=[{'name':n,'layer':100+i,'datatype':0} for i,n in enumerate(sorted(names))]+[{'name':'OUTLINE','layer':900,'datatype':0}]
    p=I.prepare(args({'public.tlef':text,'public.lef':macro_text,'public.def':defs},{'layer_map':rows,'lef_files':['public.tlef','public.lef']}));info=p['report']['layout'];assert_(any(pin['name']=='A' for pin in info['pins']),info['pins']);assert_(any(v['macro']=='sky130_fd_sc_hd__inv_1' for v in info['instances']))
    dest=RUN/'public-sky130.oas';p['layout'].write(str(dest));return {'technology_sha256':I.sha(tech[0].read_bytes()),'macro_sha256':I.sha(macro.read_bytes()),'stored_shapes':info['stored_shape_count'],'pins':sorted({v['name'] for v in info['pins']}),'dbu_um':info['dbu_um'],'vendor_execution':False}
def purpose_rows():
    rows=[{'name':'M1','layer':68,'datatype':20,'purpose':'drawing'},{'name':'M1','layer':68,'datatype':16,'purpose':'pin'},{'name':'M1','layer':68,'datatype':5,'purpose':'label'},{'name':'OUTLINE','layer':900,'datatype':0}]
    p=I.prepare(args({'tech.lef':LEF,'design.def':DEF},{'layer_map':rows}));assert_(any(v['datatype']==16 and v['name']=='M1.PIN' for v in p['report']['layout']['layers']));return {'pin_layer':[68,16]}
def unicode_names():
    p=I.prepare(args({'공정 기술.lef':LEF,'칩 배치.def':DEF},{'layer_map':MAP,'lef_files':['공정 기술.lef']}));assert_(p['report']['selected_top']=='CHIP')
    q=I.prepare(args({'회로 문서.cdl':'.include "소자 라이브러리.spi"\n.subckt TOP A B\nX1 A B CHILD\n.ends TOP\n','소자 라이브러리.spi':'.subckt CHILD P N\nR1 P N 1k\n.ends CHILD\n'}));assert_(q['netlist']['root_file']=='회로 문서.cdl');return {'utf8_filenames':True,'quoted_include':True}
def macro_substitution():
    l=k.Layout();l.dbu=0.002;cell=l.create_cell('INV');cell.shapes(l.layer(77,3)).insert(k.Box(0,0,1000,500));dest=RUN/'macro.gds';l.write(str(dest))
    p=I.prepare(args({'tech.lef':LEF.replace('CLASS CORE ;','CLASS CORE ; FOREIGN INV ;'),'design.def':DEF,'macro.gds':dest.read_bytes()},{'layer_map':MAP,'macro_files':['macro.gds']}))
    assert_(p['layout'].cell('INV').shapes(p['layout'].layer(77,3)).size()==1);assert_(abs(p['layout'].cell('INV').bbox().width()*p['layout'].dbu-2)<1e-6)
    return {'macro_layer':[77,3],'source_dbu_um':0.002,'destination_dbu_um':p['layout'].dbu,'pin_bindings':p['report']['layout']['pin_bindings']}
def orientations():
    rows=['N','S','W','E','FN','FS','FW','FE'];d='VERSION 5.8 ; DESIGN ROTATED ; UNITS DISTANCE MICRONS 1000 ; DIEAREA ( 0 0 ) ( 50000 50000 ) ; COMPONENTS 8 ; '+''.join(f'- U{i} INV + PLACED ( {i*4000+1000} 10000 ) {name} ; ' for i,name in enumerate(rows))+' END COMPONENTS END DESIGN\n'
    p=I.prepare(args({'tech.lef':LEF,'all.def':d},{'layer_map':MAP}));l=p['layout'];transforms={v.cell_inst.cplx_trans.to_s().split(' ')[0] for v in l.cell('ROTATED').each_inst()};assert_(len(transforms)==8,transforms)
    dest=RUN/'eight.oas';l.write(str(dest));r=k.Layout();r.read(str(dest));assert_(G.hierarchy_hash(l)==G.hierarchy_hash(r));return {'orientation_count':8,'hierarchy_hash':G.hierarchy_hash(r)}
def scene_bindings():
    scene=S.rpc('view.get_scene',{'project_id':project['id']});assert_({v['source_instance_name'] for v in scene['instances']}=={'U1','U2'});assert_({v['net'] for v in scene['pins'] if v['name']=='A'}=={'in','mid'});return {'A_instance_nets':['in','mid']}
def import_circuit(circuit):
    global project
    before=S.load_layout(project);h=G.semantic_hash(before,before.cell(project['cell']));result=I.rpc('compat.import',{**args(circuit),'project_id':project['id'],'expected_revision':project['revision'],'command_id':'circuit-import'});project=result['project'];after=S.load_layout(project);assert_(G.semantic_hash(after,after.cell(project['cell']))==h);assert_(project['interchange_netlist']['top_cell']=='TOP');return {'revision':project['revision'],'cell':project['cell'],'electrical_top':'TOP'}
def library_scope():
    a='.lib tt\n.subckt INV A Y\nR1 A Y 1k\n.ends INV\n.endl tt\n.lib ff\n.subckt INV Y A\nR1 A Y 2k\n.ends INV\n.endl ff\n'
    p=I.prepare(args({'lib.lib':a},{'library_section':'ff'}));assert_(p['netlist']['cells'][0]['ports']==['Y','A']);assert_(p['netlist']['cells'][0]['scope']=='ff');return {'scope':'ff','pins':['Y','A']}
def bare_export():
    p=S.create({'name':'Bare exchange','example':'fixture'});r=I.rpc('compat.import',{**args({'tech.lef':LEF,'design.def':DEF},{'layer_map':MAP}),'project_id':p['id']});return reject('NO_ELECTRICAL_REFERENCE',lambda:I.export({'project_id':r['project']['id'],'format':'spice'}))
def import_results():
    global result_params,external
    spec={'operation':'simulation','outputs':{'currents':'flow.csv'},'context':{'analysis':'dc','tool_id':'hspice','formats':{'currents':'csv'},'current_schema':{'x':{'column':'bias','unit':'V'},'branches':[{'column':'Id','id':'drain','name':'drain','from_net':'D','to_net':'S','unit':'A','source_vector':'Id'}]}}}
    result_params={**args({'flow.csv':'bias,Id\n-1,-0.001\n0,0\n1,0.001\n'},{'results':spec}),'project_id':project['id'],'expected_revision':project['revision'],'command_id':'external-result'};external=I.rpc('compat.import_results',result_params)
    assert_(external['analysis_result']=='pass',external);assert_(external['native_execution'] is False);assert_(external['current_flow']['source']=='imported');assert_(external['current_flow']['branches'][0]['values_A']==[-0.001,0,0.001]);assert_(external['current_flow']['geometry_linkage']=='unverified');assert_(not any('operator-recipe' in note for note in external['current_flow']['notes']));return {'run_id':external['id'],'native_execution':False,'samples_A':external['current_flow']['branches'][0]['values_A']}
def result_freshness():
    global project
    assert_(I.rpc('compat.import_results',result_params)['id']==external['id']);assert_(S.get_run(external['id'])['freshness']=='current')
    project=S.mutate('layout.apply_command',{'project_id':project['id']},lambda:S.edit(project['id'],{'type':'add_box','layer_id':'68/20','box':['0','0','10','10']},'layout'));assert_(S.get_run(external['id'])['freshness']=='stale');return {'after_revision':project['revision'],'freshness':'stale'}
def prefixed_results():
    text='time,current\n0,-2\n1,0\n2,2\n';spec={'operation':'simulation','outputs':{'currents':'micro.csv'},'context':{'analysis':'tran','formats':{'currents':'csv'},'current_schema':{'x':{'column':'time','unit':'ns'},'branches':[{'column':'current','id':'m','name':'m','from_net':'D','to_net':'S','unit':'uA','source_vector':'Id'}]}}}
    run=I.rpc('compat.import_results',{**args({'micro.csv':text},{'results':spec}),'project_id':project['id']});assert_(run['analysis_result']=='pass',run);assert_(run['current_flow']['branches'][0]['values_A']==[-2e-6,0,2e-6]);assert_(run['current_flow']['x']==[0,1e-9,2e-9]);assert_(run['imported_source']['files']['micro.csv']['sha256']==I.sha(text.encode()));return {'samples_A':[-2e-6,0,2e-6],'x_s':[0,1e-9,2e-9]}
def artifact_hash():
    original=I.read_artifact({'run_id':external['id'],'key':'currents'});path=Path(external['artifacts']['currents']);saved=path.read_bytes();path.write_bytes(saved+b'0,0\n')
    try:reject('ARTIFACT_CHANGED',lambda:S.rpc('backend.read_artifact',{'run_id':external['id'],'key':'currents'}))
    finally:path.write_bytes(saved)
    assert_(base64.b64decode(original['base64'])==saved);return {'sha256':I.sha(saved)}

if __name__=='__main__':
    try:main()
    finally:
        for row in CASES:
            if isinstance(row.get('details'),dict) and ('layout' in row['details'] or 'project' in row['details'] or 'files' in row['details']):row['details']={'native_metadata_recorded':True}
        for row in CASES:row['result']='pass' if row['pass'] else 'fail'
        report={'schema_version':1,'case_count':len(CASES),'passed':sum(v['pass'] for v in CASES),'cases':CASES,'raw_folder':str(RUN),'source_sha256':{n:S.profile.sha(Path('/workspace')/n) for n in ['workers/eda/interchange.py','workers/eda/server.py','workers/eda/test_interchange.py']},'vendor_execution_verified':False}
        (RUN/'evidence.json').write_text(json.dumps(report,indent=2,default=str));Path('/workspace/.runtime/evidence/interchange.json').write_text(json.dumps(report,indent=2,default=str));print(json.dumps({'cases':len(CASES),'passed':report['passed'],'raw_folder':str(RUN)}))
