"""Plot recorded native measurements and fit an offline two-point trim study.
The fit never changes RTL, raw words or the original raw FAIL verdicts.
"""
import hashlib,json,math,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'workers/eda'))
import adc16 as A,native
import matplotlib;matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
OUT=ROOT/'examples/adc16-lab';OUT.mkdir(parents=True,exist_ok=True)
RUNTIME=ROOT/'.runtime/adc16/native'
labels=['low','quarter','mid','three-quarter','high'];points=[]
for label in labels:
 folder=RUNTIME/('sigma_delta16-tt-strong-ref-'+label);run=json.loads((folder/'run.json').read_text(encoding='utf-8'));project=json.loads((folder/'source-project.json').read_text(encoding='utf-8'))
 points.append(dict(input_V=project['design_template']['parameters']['input_V'],raw_mean=run['measurements']['mean_code'],raw_error_LSB=run['measurements']['dc_error_LSB'],run_id=run['id'],netlist_sha256=hashlib.sha256((folder/'analog.spice').read_bytes()).hexdigest()))
assert len({p['netlist_sha256']for p in points})==1,'Calibration cannot cross circuit revisions.'
low,high=points[0],points[-1];gain=((high['input_V']-low['input_V'])/1.8*65536)/(high['raw_mean']-low['raw_mean']);offset=low['input_V']/1.8*65536-gain*low['raw_mean']
for p in points:
 p.update(role='calibration'if p in(low,high)else'held-out',trimmed_mean=gain*p['raw_mean']+offset)
 p['trimmed_error_LSB']=p['trimmed_mean']-p['input_V']/1.8*65536
trim=dict(edition='Resistor Indust',scope='Offline affine study of recorded mean words at TT/27C/1.8V. Not applied to RTL, not per-code INL/DNL, noise or manufacturing evidence.',gain=gain,offset_codes=offset,held_out_max_error_LSB=max(abs(p['trimmed_error_LSB'])for p in points if p['role']=='held-out'),points=points)
(OUT/'trim-study.json').write_text(json.dumps(trim,indent=2)+'\n')
plt.rcParams.update({'font.size':10,'axes.grid':True,'grid.alpha':.2})
fig,ax=plt.subplots(1,2,figsize=(12,4),layout='constrained')
ax[0].plot([p['input_V']for p in points],[p['raw_error_LSB']for p in points],'o-',label='Actual untrimmed mean')
held=[p for p in points if p['role']=='held-out'];ax[0].plot([p['input_V']for p in held],[p['trimmed_error_LSB']for p in held],'s--',label='Offline trim: held-out only')
ax[0].axhline(0,color='gray',lw=.7);ax[0].set(xlabel='Input (V)',ylabel='Mean code error (nominal LSB)',title='Sigma-delta: measured DC error');ax[0].legend(fontsize=8)
sar=json.loads((RUNTIME/'sar_adc16-tt-directed-seven/adc16-verification.json').read_text(encoding='utf-8'))
ax[1].bar(range(len(sar['frames'])),[r['error_codes']for r in sar['frames']],color='#376c83')
ax[1].set_xticks(range(len(sar['frames'])),[f'{r["input_differential_V"]:.6f}'for r in sar['frames']],rotation=35,ha='right');ax[1].set(xlabel='Differential input (V)',ylabel='Actual code error (LSB)',title='SAR: native retained-charge decisions')
fig.suptitle('Resistor Indust ADC16 references — deterministic DC, no silicon ENOB claim');fig.savefig(OUT/'dc-characterization.png',dpi=160);plt.close(fig)
pipe=RUNTIME/'pipeline_adc16-tt-bounded-24-cycles';samples=json.loads((pipe/'stage-samples.json').read_text(encoding='utf-8'));report=json.loads((pipe/'adc16-verification.json').read_text(encoding='utf-8'))
fig,ax=plt.subplots(2,1,figsize=(12,6),layout='constrained',height_ratios=[2,1])
image=ax[0].imshow(np.array(samples['stages']).T,aspect='auto',origin='lower',interpolation='nearest',vmin=0,vmax=3,cmap='viridis')
ax[0].set(xlabel='Actual half-cycle index',ylabel='SC MDAC stage',title='Native fourteen-stage thermometer words (00 / 01 / 11)');fig.colorbar(image,ax=ax[0],ticks=[0,1,2,3],label='Raw thermometer word')
frames=report['frames'];ax[1].step([r['half_cycle']for r in frames],[r['code']for r in frames],where='mid',label='Actual aligned output');ax[1].axhline(frames[0]['expected_code'],color='gray',ls='--',label='Ideal DC code');ax[1].set(xlabel='Half-cycle index',ylabel='Output code',title='0.15V DC, 100kS/s; ten filled output words');ax[1].legend()
fig.savefig(OUT/'pipeline-native.png',dpi=160);plt.close(fig)
# Compare the current emitted analog circuit with the immutable recorded input,
# rather than claiming every historical Python source file is current.
compat=[]
for name,core in [('sar_adc16-tt-directed-seven','sar16_analog'),('sigma_delta16-tt-strong-ref-mid','sdm16_modulator'),('pipeline_adc16-tt-bounded-24-cycles','pipeline16_analog')]:
 folder=RUNTIME/name;p=json.loads((folder/'source-project.json').read_text(encoding='utf-8'));ir=A.schematic(core,p['design_template']['parameters']);current=native.emit(ir,core,ir['ports']).encode();recorded=(folder/'analog.spice').read_bytes()
 compat.append(dict(run=name,current_analog_netlist_sha256=hashlib.sha256(current).hexdigest(),recorded_analog_netlist_sha256=hashlib.sha256(recorded).hexdigest(),equal=current==recorded))
assert all(p['equal']for p in compat),'Analog source differs: rerun the changed circuit.'
(OUT/'source-compatibility.json').write_text(json.dumps(dict(edition='Resistor Indust',scope='Exact emitted analog netlist bytes only; original source manifests and revision IDs remain in each run.',comparisons=compat),indent=2)+'\n')
print(json.dumps(dict(held_out_trim_error=trim['held_out_max_error_LSB'],source_netlists_equal=all(p['equal']for p in compat))))
