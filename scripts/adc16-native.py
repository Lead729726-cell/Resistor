"""Run one real ADC16 native experiment in an owned, isolated evidence folder."""
import argparse, hashlib, json, os, re, subprocess, sys, time, uuid
from pathlib import Path
from types import SimpleNamespace
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'workers/eda'))
os.environ.setdefault('PDK_ROOT',str(Path.home()/'.local/share/resistor/pdks'))
import adc16 as A, design_tools, native


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--kind',choices=list(A.CATALOG),required=True)
    parser.add_argument('--corner',choices=['tt','ss','ff'],default='tt');parser.add_argument('--input',type=float)
    parser.add_argument('--mode',type=int,default=4);parser.add_argument('--label',default='baseline');parser.add_argument('--duration',type=float)
    args=parser.parse_args()
    if not re.fullmatch('[A-Za-z0-9_-]{1,80}',args.label):raise ValueError('Bounded evidence label required')
    folder=ROOT/'.runtime/adc16/native'/f'{args.kind}-{args.corner}-{args.label}';folder.mkdir(parents=True,exist_ok=True)
    if (folder/'run.json').exists():raise ValueError('This evidence label already has a result. Use a new --label; previous success/failure artifacts are preserved.')
    A.populate_catalog();values=A.CATALOG[args.kind]['parameter_defaults'].copy()
    if args.input is not None:values['input_V'if args.kind=='sigma_delta16'else'input_differential_V']=args.input
    if args.kind=='sar_adc16':values['test_mode']=args.mode
    values=A.parameters(args.kind,values);settings=A.recommended_settings(args.kind,values)
    settings.update(corner=args.corner,temperature_C={'tt':27,'ss':125,'ff':-40}[args.corner])
    if args.duration:settings.update(duration_s=args.duration,step_s=max(settings['step_s'],args.duration/180000))
    settings=A.settings(settings)
    p={'id':uuid.uuid4().hex,'revision':1,'cell':args.kind,'schematic':A.schematic(args.kind,values),
       'design_template':{'id':args.kind,'parameters':values},'testbench':settings}
    run={'id':uuid.uuid4().hex,'project_id':p['id'],'revision':1,'artifacts':{}};manifest={'edition':'Resistor Indust','commands':[],'settings':dict(settings),
       'source_sha256':{f.name:hashlib.sha256(f.read_bytes()).hexdigest()for f in (ROOT/'workers/eda').glob('*.py')},'parameters':values}
    def process(run,folder,command,name,manifest,timeout=120):
        started=time.monotonic();file=folder/(name+'.log')
        try:
            with file.open('w')as log:r=subprocess.run(command,cwd=folder,stdout=log,stderr=subprocess.STDOUT,timeout=timeout,env={**os.environ,'OMP_NUM_THREADS':'1','NGSPICE_NUM_THREADS':'1'})
        except subprocess.TimeoutExpired:
            manifest['commands'].append({'argv':command,'returncode':None,'elapsed_s':time.monotonic()-started,'timeout':True})
            raise
        text=file.read_text(encoding='utf-8');manifest['commands'].append({'argv':command,'returncode':r.returncode,'elapsed_s':time.monotonic()-started})
        if r.returncode:raise RuntimeError(name+': '+text[-2200:])
        return text
    started=time.monotonic()
    try:
        A.execute(SimpleNamespace(process=process,design_tools=design_tools),run,p,folder,manifest,{})
        run['execution_status']='completed'
    except Exception as error:
        run.update(execution_status='failed',analysis_result='unknown',error=str(error));raise
    finally:
        run['elapsed_s']=time.monotonic()-started
        (folder/'run.json').write_text(json.dumps(run,indent=2,allow_nan=False)+'\n')
        (folder/'manifest.json').write_text(json.dumps(manifest,indent=2,allow_nan=False)+'\n')
        (folder/'source-project.json').write_text(json.dumps(p,indent=2,allow_nan=False)+'\n')
        print(json.dumps({k:run.get(k)for k in('id','execution_status','analysis_result','error','elapsed_s','measurements')}),flush=True)


if __name__=='__main__':main()
