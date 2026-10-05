"""Native schematic -> public symbols -> actual headless Xschem SPICE netlisting."""
import hashlib
import json
import re
import subprocess
from pathlib import Path
import native
import profile
from geometry import EDAError

DEVICES=Path('/foss/tools/xschem/share/xschem/xschem_library/devices')
SYMBOLS={'nmos':profile.ROOT/'libs.tech/xschem/sky130_fd_pr/nfet_01v8.sym','pmos':profile.ROOT/'libs.tech/xschem/sky130_fd_pr/pfet_01v8_hvt.sym','resistor':DEVICES/'res.sym','capacitor':DEVICES/'capa.sym','voltage':DEVICES/'vsource.sym','current':DEVICES/'isource.sym'}

def pin_positions(symbol):
    result=[]
    for row in symbol.read_text().splitlines():
        m=re.match(r'B 5 ([\d.+-]+) ([\d.+-]+) ([\d.+-]+) ([\d.+-]+) \{name=([^\s}]+)',row)
        if m: result.append((m.group(5),(float(m.group(1))+float(m.group(3)))/2,(float(m.group(2))+float(m.group(4)))/2))
    return result

def netlist(p,folder):
    check=native.validate(p['schematic'])
    if not check['valid']: raise EDAError('SCHEMATIC_INVALID','Fix schematic issues before Xschem netlisting.',check)
    if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*',p['cell']) or any(not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*',port) for port in p['ports']): raise EDAError('UNSUPPORTED_NAME','Xschem bridge needs identifier cell/port names.')
    if any(d['kind']=='block' for d in p['schematic']['devices']): raise EDAError('UNSUPPORTED_HIERARCHY','This Xschem public-symbol bridge currently netlists flat cells. Native SPICE supports hierarchy.')
    folder.mkdir(parents=True,exist_ok=True); sch=folder/(p['cell']+'.sch'); rows=['v {xschem version=3.4.7 file_version=1.2}','G {}','K {}','V {}','S {}','E {}']; inputs=[]
    _,derived=native.connectivity(p['schematic']) if p['schematic'].get('connectivity_mode')=='geometric' else (None,{})
    lab=DEVICES/'lab_pin.sym'; iopin=DEVICES/'iopin.sym'
    for i,d in enumerate(sorted(p['schematic']['devices'],key=lambda d:d['id'])):
        if d['kind'] in {'ground','port'}: continue
        symbol=SYMBOLS.get(d['kind'])
        if symbol is None or not symbol.is_file(): raise EDAError('UNSUPPORTED_SYMBOL','Installed Xschem symbol mapping is unavailable.')
        inputs.append(symbol); x=i*250; y=0; pars=d['parameters']; kind=d['kind']
        props='name='+({'nmos':'X','pmos':'X','resistor':'R','capacitor':'C','voltage':'V','current':'I'}[kind])+d['name']
        if kind in {'nmos','pmos'}: props+=f' W={native.num(pars["w_um"]):.12g} L={native.num(pars["l_um"]):.12g} nf=1 mult=1'
        else: props+=f' value={native.num(pars.get("value" if kind in {"resistor","capacitor"} else "dc",0)):.12g}'
        rows.append(f'C {{{symbol}}} {x} {y} 0 0 {{{props}}}')
        pins=pin_positions(symbol)
        if len(pins)!=(4 if kind in {'nmos','pmos'} else 2): raise EDAError('SYMBOL_MISMATCH','Installed symbol pin count differs from verified mapping.')
        for j,(pin,px,py) in enumerate(pins):
            key=pin if kind in {'nmos','pmos'} else ('+' if j==0 else '-')
            net=derived.get((d['id'],key),d['pins'].get(key,d['pins'].get('1' if j==0 else '2')))
            if not net or not native.NET.fullmatch(net): raise EDAError('INVALID_NET','Xschem labels need safe explicit/derived nets.')
            rows.append(f'C {{{lab}}} {x+px:.12g} {y+py:.12g} 0 0 {{name=lab_{i}_{j} lab={net}}}')
    for i,port in enumerate(p['ports']): rows.append(f'C {{{iopin}}} {i*100} 200 0 0 {{name=p{i} lab={port}}}')
    sch.write_text('\n'.join(rows)+'\n')
    rc=folder/'xschemrc'; rc.write_text(f'source /foss/tools/xschem/share/xschem/xschemrc\nappend XSCHEM_LIBRARY_PATH :{profile.ROOT}/libs.tech/xschem\nset top_is_subckt 1\nset netlist_type spice\n')
    dest=folder/(p['cell']+'.spice'); cmd=['xschem','-x','-q','-n','-s','-r','--rcfile',str(rc),'-o',str(folder),'-N',str(dest),str(sch)]
    try: result=subprocess.run(cmd,cwd=folder,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=45)
    except subprocess.TimeoutExpired: raise EDAError('TIMEOUT','Headless Xschem netlisting exceeded 45 seconds.')
    log=folder/'xschem.log'; log.write_text(result.stdout)
    if result.returncode or not dest.is_file(): raise EDAError('XSCHEM_FAILED','Xschem did not produce a native netlist.',{'log_path':str(log)})
    text=dest.read_text()
    if not re.search(r'^\.subckt\s+'+re.escape(p['cell'])+r'\b',text,re.I|re.M): raise EDAError('XSCHEM_FAILED','Xschem output lacks the declared subcircuit.',{'log_path':str(log)})
    manifest={'source':'actual-xschem-public-symbol-netlist','project_id':p['id'],'revision':p['revision'],'argv':cmd,'returncode':result.returncode,'symbols':{str(f):profile.sha(f) for f in inputs+[lab,iopin]},'artifacts':{str(f):profile.sha(f) for f in (sch,rc,dest,log)}}
    manifest_path=folder/'manifest.json'; manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')
    return {'path':str(dest),'text':text,'schematic_path':str(sch),'log_path':str(log),'manifest_path':str(manifest_path),'source':'Xschem'}
