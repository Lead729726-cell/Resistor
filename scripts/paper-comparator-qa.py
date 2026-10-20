"""Actual MOS comparator common-mode/PVT and explicit 0.5fF skew sensitivity.

Controlled sensitivity injection is not random mismatch/Monte Carlo yield.
"""
import concurrent.futures,copy,hashlib,json,os,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'workers/eda'))
os.environ.setdefault('PDK_ROOT',str(Path.home()/'.local/share/resistor/pdks'))
import sar12,native,design_tools
OUT=ROOT/'.runtime/paper-signoff/comparator';OUT.mkdir(parents=True,exist_ok=True)
LSB=2*1.2/4096

def main():
    p=sar12.schematic('sar12_comparator');jobs=[]
    for variant,node in [('nominal',None),('qp_plus_0p5fF','QP'),('qn_plus_0p5fF','QN')]:
        ir=copy.deepcopy(p)
        if node:ir['cells']['SAR12_LATCH']['devices'].append({'id':'SENSITIVITY','name':'SENSITIVITY','kind':'capacitor','pins':{'+':node,'-':'VGND'},'parameters':{'value':.5e-15},'x':0,'y':0})
        model=OUT/(variant+'.spice');model.write_text(native.emit(ir,'CMP',ir['ports']))
        for corner,temp in [('tt',27),('ss',125),('ff',-40)]:
            models=OUT/corner;models.mkdir(exist_ok=True);deck=design_tools.supported_model_deck(models,corner)
            for cm in [.75,.9,1.05,1.2,1.35,1.5]:
                for n,d in enumerate([-8,-4,-2,-1,-.5,-.25,0,.25,.5,1,2,4,8]):
                    folder=OUT/f'{variant}-{corner}-{cm:.2f}-{n:02d}';folder.mkdir(exist_ok=True);difference=d*LSB
                    text=f'''Comparator sensitivity, actual nominal PDK MOS; no ideal decision source
.include "{deck}"
.include "{model}"
.option sparse scale=1e-6 method=gear maxord=2 reltol=1e-5
.temp {temp}
VDD VPWR 0 1.8
VGND VGND 0 0
VINP INP 0 {cm+difference/2:.17g}
VINN INN 0 {cm-difference/2:.17g}
VEVAL EVAL 0 PULSE(0 1.8 2u 1n 1n 700n 2u)
XU INP INN EVAL OUTP OUTN VPWR VGND CMP
.control
set num_threads=1
set wr_singlescale
set wr_vecnames
tran 2n 2.6u 0 2n
wrdata result.dat v(OUTP) v(OUTN) v(INP) v(INN) v(EVAL)
quit
.endc
.end
'''
                    (folder/'testbench.spice').write_text(text);jobs.append((folder,variant,corner,temp,cm,d,difference))
    def execute(job):
        folder,variant,corner,temp,cm,d,difference=job
        with(folder/'ngspice.log').open('w')as log:r=subprocess.run(['ngspice','-b','testbench.spice'],cwd=folder,stdout=log,stderr=subprocess.STDOUT,timeout=60,env={**os.environ,'OMP_NUM_THREADS':'1'})
        text=(folder/'ngspice.log').read_text();valid=r.returncode==0 and 'timestep too small'not in text.lower() and (folder/'result.dat').is_file()
        row=None
        if valid:
            rows=[list(map(float,l.split())) for l in (folder/'result.dat').read_text().splitlines()[1:]if l.strip()]
            row=next((r for r in reversed(rows) if r[0]<=2.55e-6),None);valid=row is not None and row[5]>1.7
        resolved=valid and ((row[1]>1.44 and row[2]<.36)or(row[2]>1.44 and row[1]<.36))
        return dict(variant=variant,corner=corner,temperature_C=temp,common_mode_V=cm,differential_LSB=d,differential_V=difference,execution='completed'if valid else'failed',resolved=bool(resolved),decision=int(row[1]>row[2])if resolved else None,OUTP_V=row[1]if row else None,OUTN_V=row[2]if row else None,sample_s=row[0]if row else None,folder=folder.name)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:results=list(pool.map(execute,jobs))
    summaries=[]
    for variant in ['nominal','qp_plus_0p5fF','qn_plus_0p5fF']:
      for corner in ['tt','ss','ff']:
       for cm in [.75,.9,1.05,1.2,1.35,1.5]:
        rows=[r for r in results if r['variant']==variant and r['corner']==corner and r['common_mode_V']==cm];low=[r['differential_V']for r in rows if r['decision']==0];high=[r['differential_V']for r in rows if r['decision']==1];bracket=[max(low),min(high)]if low and high and max(low)<min(high)else None
        summaries.append(dict(variant=variant,corner=corner,common_mode_V=cm,offset_bracket_V=bracket,bracket_width_LSB=(bracket[1]-bracket[0])/LSB if bracket else None,unresolved_points=sum(not r['resolved']for r in rows),large_signal_polarity_correct=all(r['resolved']and r['decision']==int(r['differential_V']>0)for r in rows if abs(r['differential_LSB'])==8)))
    report={'edition':'Resistor Indust','native_runs':len(results),'sample_delay_after_eval_s':.55e-6,'LSB_V':LSB,'injected_skew_F':.5e-15,'results':results,'summaries':summaries,'source_hashes':{f:hashlib.sha256((ROOT/'workers/eda'/f).read_bytes()).hexdigest()for f in ['sar12.py','native.py']},'scope':'Actual pre-layout MOS transient with source ideal R/C bias and 0.5fF explicit sensitivity variant on the latch QP/QN. No random mismatch, noise, silicon offset yield or full-ADC performance claimed.','manufacturing_signoff':False}
    (OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'runs':len(results),'engine_failures':sum(r['execution']=='failed'for r in results),'unresolved_points':sum(not r['resolved']for r in results),'groups':len(summaries),'large_signal_failing_groups':[r for r in summaries if not r['large_signal_polarity_correct']]}))
if __name__=='__main__':main()
