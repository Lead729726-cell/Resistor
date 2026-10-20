"""Native RTL/gate/CMOS replay: exhaustive pipeline, directed SAR, CIC overflow/reset."""
import hashlib, json, os, random, subprocess, sys, time
from pathlib import Path
from types import SimpleNamespace
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'workers/eda'))
import adc16_digital as D
OUT=ROOT/'.runtime/adc16/digital';OUT.mkdir(parents=True,exist_ok=True)
manifest={'edition':'Resistor Indust','commands':[],'scope':'Digital logic only; independent stimuli are not analog ADC measurements.'}
def process(run,folder,argv,name,manifest,timeout=120):
 t=time.monotonic();r=subprocess.run(argv,cwd=folder,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=600)
 (folder/(name+'.log')).write_text(r.stdout);manifest['commands'].append(dict(argv=argv,returncode=r.returncode,elapsed_s=time.monotonic()-t))
 if r.returncode:raise RuntimeError(name+': '+r.stdout[-1500:])
 return r.stdout
server=SimpleNamespace(process=process);results={}
def folder(name):
 f=OUT/name;f.mkdir(exist_ok=True);return f
inputs=[D.pipeline_digits((i+.5)/32768-1)for i in range(65536)]
# True per-stage delayed sample identity, including invalid bubbles and malformed words.
stages=[];flashes=[];valids=[]
for t in range(len(inputs)+14):
 stages.append([inputs[t-j][0][j]if 0<=t-j<len(inputs)else 0 for j in range(14)])
 flashes.append(inputs[t-14][1]if 0<=t-14<len(inputs)else 0);valids.append(int(t<len(inputs)))
rows=D.pipeline_replay(server,{'artifacts':{}},folder('pipeline-exhaustive'),manifest,stages,flashes,valids)
assert [c for _,c,v,e in rows if v]==list(range(65536));results['pipeline_all_codes']=65536
stages=[[1]*14 for _ in range(80)];flashes=[3]*80;valids=[int(i%3!=0)for i in range(80)]
stages[16][0]=2;flashes[40]=2
rows=D.pipeline_replay(server,{'artifacts':{}},folder('pipeline-malformed-bubbles'),manifest,stages,flashes,valids)
assert sum(e for _,_,_,e in rows)==2;results['pipeline_error_flags']=2
rng=random.Random(729726);bits=[];resets=[]
for density in(0,1,64,128,192,255,256):
 bits.append(0);resets.append(1)
 bits.extend(int((i*density)%256<density)for i in range(8*256));resets.extend([0]*(8*256))
bits.extend(rng.randrange(2)for _ in range(8192));resets.extend([0]*8192)
frames=D.filter_replay(server,{'artifacts':{}},folder('cic3-overflow-reset'),manifest,bits,resets);results['cic_samples']=len(bits);results['cic_output_words']=len(frames)
codes=list(dict.fromkeys([0,1,2,32767,32768,32769,65534,65535,*range(0,65536,127)]));decisions=[];frames=[]
for f,code in enumerate(codes):
 accepted=0
 for bit in reversed(range(16)):
  trial=accepted+(1<<bit);decision=int(code>=trial);decisions.append([f,bit,trial,1.8*decision,1.8*(1-decision),0,0,0,decision])
  if decision:accepted=trial
 frames.append(dict(frame=f,code=code))
D.sar_replay(server,{'artifacts':{}},folder('sar-directed'),manifest,decisions,frames);results['sar_directed_codes']=len(codes)
manifest.update(results=results,pass_=True,source_sha256={f.name:hashlib.sha256(f.read_bytes()).hexdigest()for f in(ROOT/'workers/eda/rtl').glob('*16*')})
(OUT/'verification.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps(results))
