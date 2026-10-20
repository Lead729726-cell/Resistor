"""Export only owned ADC16 run artifacts; no engine config, PDK models or keys."""
import gzip, hashlib, json, shutil, sys, zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'examples/adc16-lab';RUNTIME=ROOT/'.runtime/adc16';OUT.mkdir(parents=True,exist_ok=True)
def sha(data):return hashlib.sha256(data).hexdigest()
def write(file,value):
 file.parent.mkdir(parents=True,exist_ok=True);file.write_text(json.dumps(value,indent=2,allow_nan=False)+'\n')
def copy(source,target,compress=False):
 target.parent.mkdir(parents=True,exist_ok=True)
 if compress:
  with source.open('rb')as src,target.open('wb')as dest:
   with gzip.GzipFile(fileobj=dest,mode='wb',mtime=0)as archive:shutil.copyfileobj(src,archive)
 else:shutil.copyfile(source,target)
 return dict(bytes=source.stat().st_size,sha256=sha(source.read_bytes()),stored_as=str(target.relative_to(OUT)))
index=json.loads((RUNTIME/'projects/index.json').read_text(encoding='utf-8'));projects=[]
for kind,pid in index['projects'].items():
 file=RUNTIME/'projects'/f'{kind}.register.zip'
 if not file.exists():raise ValueError('Finish project export: '+kind)
 copy(file,OUT/'projects'/file.name);projects.append(dict(kind=kind,project_id=pid,inherits_engine_verdict=False))
write(OUT/'projects/index.json',dict(edition='Resistor Indust',projects=projects,import_rule='Project bundles contain no inherited engine verdicts; rerun on the imported revision.'))
selected=['sar_adc16-tt-directed-seven','pipeline_adc16-tt-bounded-24-cycles','sigma_delta16-tt-strong-ref-low','sigma_delta16-tt-strong-ref-mid','sigma_delta16-tt-strong-ref-high','sigma_delta16-tt-strong-ref-quarter','sigma_delta16-tt-strong-ref-three-quarter']
selected += [f'{item["kind"]}-tt-standalone-v1'for item in json.loads((RUNTIME/'block-verification.json').read_text(encoding='utf-8'))['results']]
native_index=[]
allowed_suffixes={'.spice','.json','.log','.csv','.mem','.v','.txt','.dat'}
for name in selected:
 source=RUNTIME/'native'/name;run=json.loads((source/'run.json').read_text(encoding='utf-8'));dest=OUT/'native'/name;files={}
 # Omit redundant display-thinned arrays; exact raw vectors and all replay
 # inputs/outputs remain, with full file hashes and engine source manifests.
 summary={k:v for k,v in run.items()if k not in('waveforms','current_flow')};write(dest/'run-summary.json',summary)
 for file in source.iterdir():
  if not file.is_file()or file.name in('run.json',)or file.suffix not in allowed_suffixes:continue
  large=file.stat().st_size>1024*1024 or file.suffix=='.dat'
  files[file.name]=copy(file,dest/(file.name+('.gz'if large else'')),large)
 write(dest/'files.json',files);native_index.append(dict(name=name,project_id=run['project_id'],run_id=run['id'],execution_status=run['execution_status'],analysis_result=run['analysis_result'],measurements=run.get('measurements',{}),checks=run.get('reference_verification',{}).get('checks',[])))
write(OUT/'native/index.json',dict(edition='Resistor Indust',runs=native_index,scope='Native MOS measurements and separate digital replays. Output bits are not measured silicon ENOB.'))
for file in[RUNTIME/'digital/verification.json',RUNTIME/'block-verification.json']:
 copy(file,OUT/'qa'/file.name)
# Include compact actual digital logs and codes. Large exhaustive code vectors
# are compressed; test stimuli are reproducible from the committed QA script.
for source in(RUNTIME/'digital').glob('*/*'):
 if source.suffix in('.log','.csv','.mem','.v'):
  large=source.stat().st_size>1024*1024;copy(source,OUT/'qa/digital'/source.parent.name/(source.name+('.gz'if large else'')),large)
physical=[];workspace=RUNTIME/'lab'
for item in index['runs']:
 run=json.loads((RUNTIME/'projects'/f'{item["id"]}.json').read_text(encoding='utf-8'));dest=OUT/'physical'/item['kind']/item['stage'];write(dest/'run.json',run);files={}
 for key,location in{**run.get('artifacts',{}),'manifest':run['manifest_path']}.items():
  if not location.startswith('/workspace/'):raise ValueError('Unexpected engine artifact path')
  file=(workspace/location[len('/workspace/'):]).resolve()
  if not file.is_relative_to(workspace.resolve()):raise ValueError('Artifact outside owned workspace')
  large=file.stat().st_size>1024*1024;files[key]=copy(file,dest/(file.name+('.gz'if large else'')),large)
 write(dest/'files.json',files);physical.append(item)
for kind,pid in index['projects'].items():
 if not kind.endswith('-physical'):continue
 source=workspace/'.runtime/eda/projects'/pid/'generator/routing-report.json'
 if source.exists():copy(source,OUT/'physical'/kind/'routing-report.json')
write(OUT/'physical/index.json',dict(edition='Resistor Indust',runs=physical,scope='Public SKY130 DRC/LVS/extraction execution only. PEX execution is not a coupled-capacitance accuracy audit or foundry signoff.'))
print(json.dumps(dict(projects=len(projects),native_runs=len(native_index),physical_runs=len(physical))))
