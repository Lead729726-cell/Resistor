"""Re-run the published failing RC mesh; never re-extract a different DUT."""
import argparse,gzip,hashlib,json,re,shutil,subprocess,sys,time,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'workers/eda'))
import sar12

def digest(data):return hashlib.sha256(data).hexdigest()
def published(folder,name):
    file=folder/name
    return file.read_bytes() if file.exists() else gzip.decompress((folder/(name+'.gz')).read_bytes())
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pdk',required=True,help='Installed sky130A directory; original model hashes must match')
    parser.add_argument('--solver',choices=('sparse','klu'),default='sparse')
    parser.add_argument('--dry-run',action='store_true')
    args=parser.parse_args();pdk=Path(args.pdk).resolve()
    if any(c in pdk.as_posix()for c in '\n\r"'):raise ValueError('PDK path is not a quoted SPICE path.')
    original=ROOT/'examples/sar12-lab/runs/4b5d8c07679a4efda589d495092c2fe2'
    manifest=json.loads(published(original,'manifest.json'));models=manifest['model_files']
    old_root=next(iter(models)).split('/libs.',1)[0]
    for name,expected in models.items():
        if not name.startswith(old_root+'/'):raise ValueError('Mixed model roots are unsupported.')
        file=pdk/name[len(old_root)+1:]
        if not file.is_file() or digest(file.read_bytes())!=expected:raise ValueError('Original PDK model mismatch: '+name[len(old_root)+1:])
    mesh=published(original,'pex-simulation.spice');audit=json.loads(published(original,'pex-reduction.json'))
    if digest(mesh)!=audit['simulation_sha256']:raise ValueError('Published extracted mesh hash mismatch.')
    tb=published(original,'testbench.spice');deck=published(original,'supported-tt.spice')
    for name,data in [('testbench.spice',tb),('supported-tt.spice',deck)]:
        expected=next(v for k,v in manifest['artifacts'].items()if k.endswith('/'+name))
        if digest(data)!=expected:raise ValueError('Published source hash mismatch: '+name)
    folder=ROOT/'.runtime/sar12/reproduction'/uuid.uuid4().hex;folder.mkdir(parents=True)
    (folder/'pex-simulation.spice').write_bytes(mesh)
    (folder/'supported-tt.spice').write_text(deck.decode().replace(old_root,pdk.as_posix()),encoding='utf-8')
    text=tb.decode();includes=re.findall(r'^\.include "[^"]+"$',text,re.M)
    if len(includes)!=2:raise ValueError('Expected exactly one model deck and one immutable DUT include.')
    for prior,file in zip(includes,['supported-tt.spice','pex-simulation.spice']):text=text.replace(prior,'.include "'+(folder/file).as_posix()+'"',1)
    text=text.replace('.option klu ','.option '+args.solver+' ',1)
    (folder/'testbench.spice').write_text(text,encoding='utf-8')
    report={'edition':'Resistor Indust','solver':args.solver,'original_run':original.name,'mesh_sha256':digest(mesh),'model_files_verified':len(models),'execution_status':'not-run','scope':'Standalone native reproduction, not an engine job or manufacturing approval. Platform/tool differences can affect numerical convergence.'}
    if not args.dry_run:
        executable=shutil.which('ngspice')
        if not executable:raise RuntimeError('Install ngspice before running; no simulator is substituted.')
        report['ngspice_version']=subprocess.run([executable,'-v'],capture_output=True,text=True,timeout=20).stdout[:2000]
        started=time.monotonic()
        with(folder/'ngspice.log').open('w',encoding='utf-8')as log:
            try:r=subprocess.run([executable,'-b',str(folder/'testbench.spice')],cwd=folder,stdout=log,stderr=subprocess.STDOUT,timeout=1800);report['returncode']=r.returncode
            except subprocess.TimeoutExpired:report['returncode']=None;report['timeout_s']=1800
        log=(folder/'ngspice.log').read_text(encoding='utf-8');complete=report['returncode']==0 and 'SAR12_NATIVE_COMPLETE'in log and 'timestep too small'not in log.lower()
        report.update(execution_status='completed'if complete else'failed',elapsed_s=time.monotonic()-started)
        if complete:
            _,frames,ambiguous=sar12.parse_decisions(folder/'decisions.csv',[sar12.DEFAULTS['input_differential_V']],1.8,1.2)
            report.update(frames=frames,ambiguous_decisions=ambiguous)
    (folder/'result.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps({'folder':str(folder),**report}))
    return int(report['execution_status']=='failed')
if __name__=='__main__':raise SystemExit(main())
