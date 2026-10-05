"""Locked, local SKY130A profile. Display heights are illustrative, never process thickness."""
import hashlib
import json
import os
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(os.environ.get('PDK_ROOT', '/foss/pdks')) / 'sky130A'
MAGIC_RC = ROOT / 'libs.tech/magic/sky130A.magicrc'
TECH = ROOT / 'libs.tech/magic/sky130A.tech'
SETUP = ROOT / 'libs.tech/netgen/sky130A_setup.tcl'
MODEL = ROOT / 'libs.tech/ngspice/sky130.lib.spice'
CELL = 'sky130_fd_sc_hd__inv_1'
IMAGE = 'hpretl/iic-osic-tools@sha256:92961478ad3c4f508efb42d9ccdba12ab262eb42a14926d2bd49862230ba8521'

def sha(path):
    p = Path(path)
    if not p.is_file(): return None
    h = hashlib.sha256()
    with p.open('rb') as f:
        for chunk in iter(lambda: f.read(1048576), b''): h.update(chunk)
    return h.hexdigest()

def capabilities():
    available = all(p.is_file() for p in (MODEL, MAGIC_RC, TECH, SETUP))
    return {'id': 'sky130A', 'available': available, 'path': str(ROOT),
            'version': 'd400e26845538beaeb7cc5fdb9bfc06c30ea27cb',
            'capabilities': {k: available for k in ('simulation','drc','lvs','pex','mos_pcell')},
            'supported_devices': ['sky130_fd_pr__nfet_01v8','sky130_fd_pr__pfet_01v8_hvt'],
            'supported_corners':['tt','ff','ss'] if available else [],
            'supported_analyses':['tran','dc','ac','op'] if available else [],
            'supported_vias':['via1','via2'] if available else [],
            'supported_templates':['inverter','mosfet','wire','current_mirror','differential_pair'] if available else [],
            'experiment_scope':{'algorithms':['grid','random','tpe'],'device':'single-MOS nf=m=1','max_trials':16,'max_concurrent':2,'wall_time_s':[60,1800],'gates':['Magic DRC','Netgen LVS','ngspice DC']} if available else None,
            'xschem_bridge_scope':'flat public MOS/R/C/source symbols; native hierarchical SPICE separately verified',
            'pex_scope': {'connectivity': available, 'ground_capacitance':available,'coupling_capacitance':available,'distributed_resistance':available},
            'limits': ['Public Magic drc(full) deck; no foundry signoff.', 'MOS PCell parameter regeneration is tested for nf=1, m=1.', 'Inverter uses fixed public inv_1 layout; schematic edits require explicit layout work and revalidation.', 'No TCAD or physically sourced process reconstruction stack.']}

def provenance():
    node = ROOT / '.config/nodeinfo.json'
    return {'pdk_id':'sky130A','image':IMAGE,'nodeinfo':json.loads(node.read_text()) if node.is_file() else None,
            'files':{str(p):sha(p) for p in (MODEL,TECH,MAGIC_RC,SETUP,ROOT/'libs.tech/magic/sky130A.tcl')},
            'upstream_url':'https://github.com/RTimothyEdwards/open_pdks', 'variant':'sky130A'}

def layers(layout):
    styles={}
    lyp=ROOT/'libs.tech/klayout/tech/sky130A.lyp'
    if lyp.is_file():
        for e in ET.parse(lyp).getroot().iter('properties'):
            source=e.findtext('source','').split('@')[0]
            if '/' in source:
                try: styles[tuple(map(int,source.split('/')))]=(e.findtext('name','').split(' - ')[0],e.findtext('fill-color','#999999'))
                except ValueError: pass
    defaults={(64,20):'nwell',(65,20):'active',(66,20):'poly',(67,20):'li1',(67,44):'mcon',(68,20):'met1',(68,44):'via1',(69,20):'met2',(69,44):'via2',(70,20):'met3',(71,20):'met4',(72,20):'met5',(93,44):'licon',(94,20):'nsdm',(95,20):'psdm'}
    heights={64:0.0,65:0.2,66:0.45,93:0.7,67:0.95,68:1.5,69:2.1,70:2.7,71:3.3,72:3.9,94:0.05,95:0.08}
    out=[]
    for idx in layout.layer_indices():
        info=layout.get_info(idx); key=(info.layer,info.datatype)
        name,color=styles.get(key,(defaults.get(key,f'GDS {key[0]}/{key[1]}'),'#8999b0'))
        out.append({'id':f'{key[0]}/{key[1]}','name':name,'gds':list(key),'color':color,'opacity':0.65,
                    'z_display_um':heights.get(key[0],1.0),'thickness_display_um':0.12,'source':'illustrative',
                    'physical_z_um':None,'physical_thickness_um':None,
                    'material':'mask','style_source':'pdk' if key in styles else 'illustrative'})
    return sorted(out,key=lambda x:(x['z_display_um'],x['gds']))
