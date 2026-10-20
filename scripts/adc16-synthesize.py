"""Reproducible Yosys-to-editable-CMOS synthesis of all three ADC16 datapaths."""
import collections, hashlib, json, subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'workers/eda'))
import chip_references as C, digital_units as D, native


def synthesize(stem,top):
    out=ROOT/'workers/eda/rtl';rtl=out/(stem+'.v');gate=out/(stem+'_gate.v')
    folder=ROOT/'.runtime/adc16/synthesis'/stem;folder.mkdir(parents=True,exist_ok=True)
    script=f'read_verilog {rtl}; hierarchy -check -top {top}; proc; opt; memory; opt; techmap; opt; dffunmap; abc -g simple; opt_clean; check -assert; stat; write_json {folder}/yosys.json; write_verilog -noattr {gate}'
    r=subprocess.run(['yosys','-p',script],capture_output=True,text=True,timeout=180)
    (folder/'yosys.log').write_text(r.stdout+r.stderr)
    if r.returncode:raise RuntimeError((r.stdout+r.stderr)[-2000:])
    data=json.loads((folder/'yosys.json').read_text(encoding='utf-8'));lib=D.make_library(1);counts=collections.Counter();aliases=[]
    nor=C.cell(['A','B','Y','VPWR','VGND'])
    for name,kind,d,g,s in [('P0','pmos','P','A','VPWR'),('P1','pmos','Y','B','P'),('N0','nmos','Y','A','VGND'),('N1','nmos','Y','B','VGND')]:C.mos(nor,name,kind,d,g,s,.65,.15)
    lib['NOR2']=nor;orr=C.cell(nor['ports'])
    C.block(orr,'NOR','NOR2',nor['ports'],{'Y':'N'});C.block(orr,'INV','INV',lib['INV']['ports'],{'A':'N','Y':'Y'});lib['OR2']=orr
    mapping={'$_NOT_':'INV','$_AND_':'AND2','$_OR_':'OR2','$_XOR_':'XOR2','$_MUX_':'MUX2','$_DFF_P_':'DFF'}
    def pins(name,bits):return [name.upper()+(str(i)if len(bits)>1 else'') for i in range(len(bits))]
    for name,module in data['modules'].items():
        ports=[p for key,value in module['ports'].items()for p in pins(key,value['bits'])]+['VPWR','VGND'];ir=C.cell(ports);nets={'0':'VGND','1':'VPWR'}
        for direction in ('input','output'):
          for key,value in module['ports'].items():
            if value['direction']!=direction:continue
            for pin,bit in zip(pins(key,value['bits']),value['bits']):
                previous=nets.setdefault(bit,pin)
                if previous!=pin:
                    if direction!='output':raise ValueError('Input alias requires explicit binding')
                    n=len(aliases);C.block(ir,f'ALIAS_N{n}','INV',lib['INV']['ports'],{'A':previous,'Y':f'ALIAS{n}'})
                    C.block(ir,f'ALIAS_P{n}','INV',lib['INV']['ports'],{'A':f'ALIAS{n}','Y':pin});aliases.append({'module':name,'from':previous,'to':pin})
        def net(bit):
            if bit in ('x','z'):raise ValueError('Undefined constants cannot be fabricated in CMOS')
            return nets.get(bit,'N'+str(bit))
        for i,(_,g)in enumerate(sorted(module['cells'].items())):
            typ=g['type']
            if typ=='$scopeinfo':continue
            counts[typ]+=1
            if typ not in mapping:raise ValueError('Unsupported unmapped gate '+typ)
            target=mapping[typ];connections={('CLK'if key=='C'else key):net(bits[0])for key,bits in g['connections'].items()}
            C.block(ir,f'G{i}',target,lib[target]['ports'],connections)
        lib[name.upper()]=ir
    root=lib.pop(top.upper());root['cells']=lib
    validation=native.validate(root)
    if not validation['valid']:raise ValueError(validation['issues'])
    payload={'schema_version':1,'edition':'Resistor Indust','rtl_sha256':hashlib.sha256(rtl.read_bytes()).hexdigest(),
             'gate_rtl_sha256':hashlib.sha256(gate.read_bytes()).hexdigest(),'synthesizer':data['creator'],
             'gate_counts':dict(counts),'port_alias_buffers':aliases,'schematic':root}
    (out/(stem+'_cmos.json')).write_text(json.dumps(payload,indent=2)+'\n')
    print(json.dumps({'stem':stem,'gates':sum(counts.values()),'rtl_sha256':payload['rtl_sha256']}),flush=True)


if __name__=='__main__':
    for stem,top in [('sar16','sar16_controller'),('sigma_delta16','sigma_delta16_filter'),('pipeline16','pipeline16_align')]:synthesize(stem,top)
