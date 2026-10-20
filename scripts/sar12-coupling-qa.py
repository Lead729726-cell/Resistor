"""Independent C-only versus R+C extraction audit. Never patches a solver deck."""
import hashlib,json,os,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'workers/eda'))
import sar12_metrics as M
run=sys.argv[1];source=ROOT/'.runtime/sar12/lab/.runtime/eda/runs'/run
folder=ROOT/'.runtime/sar12/coupling-audit';folder.mkdir(parents=True,exist_ok=True)
manifest=json.loads((source/'manifest.json').read_text());original=next(c['argv']for c in manifest['commands']if c['argv'][0]=='magic')
gds=source/'sar12_analog.gds';deck=folder/'capacitance-only.tcl';output=folder/'capacitance-only.spice'
deck.write_text('\n'.join(['crashbackups stop',f'gds read {{{gds}}}','load sar12_analog','select top cell','extract all','ext2spice scale off','ext2spice format ngspice','ext2spice subcircuit on','ext2spice subcircuit top on','ext2spice hierarchy off','ext2spice extresist off','ext2spice cthresh 0','ext2spice merge none',f'ext2spice -o {{{output}}}','quit -noprompt'])+'\n')
command=[*original[:-1],str(deck)];environment={**os.environ,'PDK_ROOT':str(Path(original[4]).parents[3])};r=subprocess.run(command,cwd=folder,env=environment,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=180)
(folder/'magic.log').write_text(r.stdout)
if r.returncode or not output.is_file():raise RuntimeError(r.stdout[-2000:])
def audit(file):
    lines=[];zero=0
    for line in file.read_text().splitlines():
        line=line.split('$',1)[0].rstrip()
        fields=line.split()
        if len(fields)==4 and fields[0][:1].lower()=='c' and fields[3] in ('0','0.0'):
            zero+=1;continue
        lines.append(line)
    result=M.coupling_audit('\n'.join(lines));result['zero_valued_native_records']=zero;result['total_native_capacitor_records']=result['capacitor_count']+zero
    return result
cap=audit(output);rc=audit(source/'pex.spice')
# Comparing different RC meshes by raw net names is invalid. Expose this gap
# rather than inventing lumped capacitors or a false completeness verdict.
report=dict(schema_version=1,edition='Resistor Indust',rc_run=run,source_layout_sha256=hashlib.sha256(gds.read_bytes()).hexdigest(),command=command,capacitance_only=cap,resistance_capacitance=rc,
    status='extracted-independent-decks; net-equivalence-and-per-bit-coupling-not-qualified',
    scope='Same actual GDS, zero C threshold, native Magic. Raw C counts are not directly equal after resistor segmentation. No C has been guessed, inserted, or removed to improve performance.')
report['sha256']={p.name:hashlib.sha256(p.read_bytes()).hexdigest()for p in [deck,output,folder/'magic.log',source/'pex.spice']}
(folder/'comparison.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k]for k in ['status','source_layout_sha256']}));print(json.dumps({'cap_only_C':cap['capacitor_count'],'cap_only_mutual_F':cap['mutual_capacitance_F'],'RC_C':rc['capacitor_count'],'RC_mutual_F':rc['mutual_capacitance_F']}))
