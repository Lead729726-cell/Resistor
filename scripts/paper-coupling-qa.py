"""Independent same-GDS C-only versus distributed-RC capacitance-matrix audit.

Only native resistors are shorted for net identification. No solver netlist is
modified. Instance terminal correspondence is required; names are not guessed.
"""
import argparse,hashlib,json,math,os,re,subprocess
from pathlib import Path
from collections import defaultdict

def number(value):
    m=re.fullmatch(r'([+\-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+\-]?\d+)?)([a-zA-Z]*)',value)
    scales={'':1,'t':1e12,'g':1e9,'meg':1e6,'k':1e3,'m':1e-3,'u':1e-6,'n':1e-9,'p':1e-12,'f':1e-15}
    if not m or m[2].lower() not in scales:raise ValueError('Unsupported native numeric value')
    value=float(m[1])*scales[m[2].lower()]
    if not math.isfinite(value) or value<0:raise ValueError('Invalid native parasitic')
    return value

def records(text):
    rows=[]
    for raw in text.splitlines():
        line=raw.split('$',1)[0].strip()
        if not line or line.startswith('*'):continue
        if line.startswith('+'):rows[-1]+=' '+line[1:].strip()
        else:rows.append(line)
    devices={};caps=[];resistors=[];ports=[]
    for row in rows:
        f=row.split()
        if f[0].lower()=='.subckt':ports=f[2:]
        elif f[0][0].upper()=='X':
            i=next((j for j,v in enumerate(f) if '=' in v),len(f));params=dict(v.split('=',1) for v in f[i:])
            devices[f[0]]={'model':f[i-1],'pins':f[1:i-1],'parameters':params}
        elif f[0][0].upper() in 'RC':
            if len(f)!=4:raise ValueError('Unexpected parasitic syntax: '+row)
            (caps if f[0][0].upper()=='C' else resistors).append((f[0],f[1],f[2],number(f[3])))
    return dict(devices=devices,caps=caps,resistors=resistors,ports=ports)

def compare(captext,rctext):
    c,r=records(captext),records(rctext);parent={}
    def root(n):
        parent.setdefault(n,n)
        if parent[n]!=n:parent[n]=root(parent[n])
        return parent[n]
    def join(a,b):
        a,b=root(a),root(b)
        if a!=b:parent[b]=a
    for _,a,b,_ in r['resistors']:join(a,b)
    if set(c['devices'])!=set(r['devices']) or set(c['ports'])!=set(r['ports']):raise ValueError('Native device/port correspondence changed; no inferred mapping')
    labels=defaultdict(set);parameter_differences=[]
    for n in r['ports']:labels[root(n)].add(n)
    for name,a in c['devices'].items():
        b=r['devices'][name]
        if a['model']!=b['model'] or len(a['pins'])!=len(b['pins']) or any(a['parameters'].get(k)!=b['parameters'].get(k) for k in ('w','l')):raise ValueError('Device identity or W/L differs: '+name)
        if a['parameters']!=b['parameters']:parameter_differences.append({'instance':name,'C_only':a['parameters'],'RC':b['parameters']})
        for original,distributed in zip(a['pins'],b['pins']):labels[root(distributed)].add(original)
    conflicts={n:sorted(v) for n,v in labels.items() if len(v)!=1}
    if conflicts:raise ValueError('Resistor component maps to conflicting native original nets: '+json.dumps(conflicts)[:1000])
    cm=defaultdict(float);rm=defaultdict(float);unknown=[];intra=0.;total=0.
    for _,a,b,value in c['caps']:
        if a!=b:cm[tuple(sorted((a,b)))]+=value
    for name,a,b,value in r['caps']:
        total+=value
        aa=next(iter(labels.get(root(a),[])),None);bb=next(iter(labels.get(root(b),[])),None)
        # SPICE global 0 is an actual fixed node, not an inferred substrate tie.
        if a=='0':aa='0'
        if b=='0':bb='0'
        if aa is None or bb is None:unknown.append({'name':name,'a':a,'b':b,'C_F':value});continue
        if aa==bb:intra+=value
        else:rm[tuple(sorted((aa,bb)))]+=value
    differences=[]
    for pair in sorted(set(cm)|set(rm)):
        a,b=cm[pair],rm[pair];differences.append({'node1':pair[0],'node2':pair[1],'C_only_F':a,'RC_lumped_F':b,'delta_F':b-a})
    norm=sum(cm.values());error=sum(abs(x['delta_F']) for x in differences);unmapped=sum(x['C_F']for x in unknown)
    return dict(native_devices=len(c['devices']),native_resistors=len(r['resistors']),cap_only_records=len(c['caps']),rc_cap_records=len(r['caps']),mapped_components=len(labels),unmapped_caps=unknown,unmapped_capacitance_F=unmapped,rc_intracomponent_capacitance_F=intra,cap_only_matrix_sum_F=norm,RC_lumped_matrix_sum_F=sum(rm.values()),matrix_absolute_difference_F=error,matrix_relative_L1=error/norm if norm else None,matrix_preserved=not unknown and error<=max(1e-18,norm*.001),largest_differences=sorted(differences,key=lambda x:abs(x['delta_F']),reverse=True)[:60],all_pairs=differences,device_parameter_differences=parameter_differences,scope='Resistor-shorted capacitance matrix identity audit, not spatial redistribution or an altered performance netlist.')

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--run',required=True);args=parser.parse_args()
    if not re.fullmatch('[a-f0-9]{32}',args.run):raise ValueError('Owned run id required')
    root=Path(__file__).resolve().parents[1];source=root/'.runtime/hardware/lab/.runtime/eda/runs'/args.run;out=root/'.runtime/paper-signoff/coupling';out.mkdir(parents=True,exist_ok=True)
    gds=source/'sar12_analog.gds';script=out/'cap-only.tcl';dest=out/'cap-only.spice';pdk=Path.home()/'.local/share/resistor/pdks/sky130A'
    script.write_text('\n'.join(['crashbackups stop',f'gds read {{{gds}}}','load sar12_analog','select top cell','extract all','ext2spice scale off','ext2spice format ngspice','ext2spice subcircuit on','ext2spice subcircuit top on','ext2spice hierarchy off','ext2spice extresist off','ext2spice cthresh 0','ext2spice merge none',f'ext2spice -o {{{dest}}}','quit -noprompt'])+'\n')
    command=[str(Path.home()/'.local/share/resistor/tools/bin/magic'),'-dnull','-noconsole','-rcfile',str(pdk/'libs.tech/magic/sky130A.magicrc'),str(script)]
    with(out/'magic.log').open('w')as log:subprocess.run(command,cwd=out,env={**os.environ,'PDK_ROOT':str(pdk.parent)},stdout=log,stderr=subprocess.STDOUT,timeout=180,check=True)
    result=compare(dest.read_text(),(source/'pex.spice').read_text());result.update(edition='Resistor Indust',run_id=args.run,source_gds_sha256=hashlib.sha256(gds.read_bytes()).hexdigest(),cap_only_sha256=hashlib.sha256(dest.read_bytes()).hexdigest(),RC_sha256=hashlib.sha256((source/'pex.spice').read_bytes()).hexdigest(),manufacturing_signoff=False)
    (out/'audit.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items()if k not in ('all_pairs','largest_differences','unmapped_caps','device_parameter_differences')}))
if __name__=='__main__':main()
