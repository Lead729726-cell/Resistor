"""Run all separately usable ADC16 blocks with their declared native fixtures."""
import argparse, concurrent.futures, json, subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'workers/eda'))
import adc16 as A
parser=argparse.ArgumentParser();parser.add_argument('--label',default='standalone-v1');args=parser.parse_args()
skip={'sar_adc16','sar16_analog','sigma_delta16','sdm16_modulator','pipeline_adc16','pipeline16_analog'}
def run(kind):
 r=subprocess.run([sys.executable,str(ROOT/'scripts/adc16-native.py'),'--kind',kind,'--label',args.label],cwd=ROOT,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
 file=ROOT/'.runtime/adc16/native'/f'{kind}-tt-{args.label}'/'run.json';data=json.loads(file.read_text(encoding='utf-8'))if file.exists()else{}
 result=dict(kind=kind,status=data.get('execution_status','failed'),result=data.get('analysis_result','unknown'),checks=data.get('reference_verification',{}).get('checks',[]),error=data.get('error'),returncode=r.returncode)
 print(json.dumps(result),flush=True);return result
with concurrent.futures.ThreadPoolExecutor(max_workers=3)as pool:results=list(pool.map(run,[k for k in A.CATALOG if k not in skip]))
out=ROOT/'.runtime/adc16/block-verification.json';out.parent.mkdir(exist_ok=True,parents=True);out.write_text(json.dumps(dict(edition='Resistor Indust',results=results),indent=2)+'\n')
if any(r['status']!='completed'or r['result']!='pass'for r in results):sys.exit(1)
