"""Re-analyze immutable native Pipeline16 evidence; this does not rerun ngspice."""
import gzip,hashlib,json,sys,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'workers/eda'))
import adc16_sim as S

source=ROOT/'examples/adc16-lab/native/pipeline_adc16-tt-bounded-24-cycles'
out=ROOT/'.runtime/qa-20261024';out.mkdir(parents=True,exist_ok=True)
p=json.loads((source/'source-project.json').read_text())
period=1/p['design_template']['parameters'].get('clock_Hz',100000.)
record=json.loads((source/'stage-samples.json').read_text())
with tempfile.TemporaryDirectory() as f:
 folder=Path(f)
 with gzip.open(source/'waveform.dat.gz','rb') as compressed,(folder/'waveform.dat').open('wb') as dest:
  import shutil
  shutil.copyfileobj(compressed,dest)
 rows=S.actual_rows(folder,40,p['testbench']['duration_s'])
 levels=[];stages=[];flashes=[]
 for i in range(len(record['stages'])):
  values=[S.sample(rows,(i+.90)*period/2,j+1)for j in range(39)]
  levels.append([sum(not(x<=.36 or x>=1.44)for x in values[7+2*j:9+2*j])for j in range(14)]+[sum(not(x<=.36 or x>=1.44)for x in values[35:38])])
  stages.append([int(values[7+2*j]>=.9)+2*int(values[8+2*j]>=.9)for j in range(14)])
  flashes.append(sum(int(values[35+j]>=.9)<<j for j in range(3)))
 assert stages==record['stages'] and flashes==record['flashes'],'Native re-sampling differs from retained replay inputs.'
 outputs=[list(map(int,line.split()))for line in(source/'rtl-codes.csv').read_text().splitlines()]
 indices=[i for i,c,v,e in outputs if i>=28 and(v or e)]
 ambiguous=S.pipeline_ambiguity(levels,indices)
 result=dict(edition='Resistor Indust',source=str(source.relative_to(ROOT)),source_sha256=hashlib.sha256((source/'waveform.dat.gz').read_bytes()).hexdigest(),
             scope='Re-analysis of saved actual native trace; no new analog simulation.',raw_rows=len(rows),output_words=len(indices),
             consumed_sample_ambiguous_levels=ambiguous,resampled_words_equal_saved_native=True,pass_=ambiguous==0)
 (out/'pipeline-trace-reanalysis.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
 if ambiguous:sys.exit(1)
