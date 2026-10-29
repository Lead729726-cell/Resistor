"""Plot retained native samples; optional QA tooling, not an engine dependency."""
import json
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

root=Path(__file__).resolve().parent.parent
base=root/'examples/duet-afe'
report=json.loads((root/'docs/evidence/auto-design-20261029/qualification.json').read_text(encoding='utf-8'))
native=json.loads((root/'docs/evidence/duet-afe-20261029/native.json').read_text(encoding='utf-8'))
ac=np.loadtxt(base/'ai-candidates/selected-ac-waveform.dat',skiprows=1)
tran=np.loadtxt(base/'ai-candidates/selected-tran-waveform.dat',skiprows=1)
best=next(c for c in report['candidates'] if c['index']==report['selected_candidate_index'])
nominal=report['candidates'][0]
get=lambda c,m:next(t['observed'] for t in c['targets'] if t['metric']==m)
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'axes.spines.top':False,'axes.spines.right':False,'axes.grid':True,'grid.alpha':.2})
fig,axes=plt.subplots(2,2,figsize=(11,7.5),constrained_layout=True)
fig.suptitle('DUET-AFE | actual SKY130 / ngspice schematic results',fontsize=16,weight='bold')
ax=axes[0,0]
for i,name,color in [(1,'Slow path','#2458a6'),(2,'Fast path','#b05916')]:ax.semilogx(ac[:,0],20*np.log10(np.maximum(ac[:,i],1e-12)),label=name,color=color)
ax.set(xlim=(100,1e6),ylim=(-35,15),xlabel='Frequency (Hz)',ylabel='Closed-loop gain (dB)',title='A. Selected candidate: AC transfer')
ax.legend(loc='lower left')
ax=axes[0,1];mask=(tran[:,0]>=.0004)&(tran[:,0]<=.0006)
for i,name,color in [(1,'Input','#6b7280'),(3,'Slow','#2458a6'),(4,'Fast','#b05916')]:ax.plot(tran[mask,0]*1e6,tran[mask,i],label=name,color=color,linewidth=1)
ax.set(xlabel='Time (us)',ylabel='Voltage (V)',title='B. Actual 5kHz + 50kHz response');ax.legend(ncols=3,fontsize=9)
ax=axes[1,0]
conditions=[('tt',1.8,27),('ss',1.6,85),('ff',1.8,-40)]
base_p=[];best_p=[]
for corner,supply,temp in conditions:
    base_p.append(next(r['measurements']['supply_power_W']*1e6 for r in native['runs'] if r['condition']==dict(corner=corner,supply_V=supply,temperature_C=temp,analysis='op')))
    best_p.append(get(best,'supply_power_W')*1e6 if corner=='tt' else next(r['measurements']['supply_power_W']*1e6 for r in report['extra_pvt'] if r['condition']==dict(corner=corner,supply_V=supply,temperature_C=temp,analysis='op')))
x=np.arange(3);ax.bar(x-.18,base_p,.36,label='30k / 5pF',color='#7e94b2');ax.bar(x+.18,best_p,.36,label='40k / 8pF',color='#2458a6')
ax.set(xticks=x,xticklabels=['TT / 1.8V / 27C','SS / 1.6V / 85C','FF / 1.8V / -40C'],ylabel='DC supply power (uW)',title='C. Three sampled MOS PVT conditions',ylim=(0,530));ax.legend(fontsize=9)
ax=axes[1,1];ax.axis('off');ax.set_title('D. Nominal comparison (1.8V, TT, 27C)',loc='left')
cells=[]
for label,key,scale,fmt in [('Gain (V/V)','slow_gain_V_per_V',1,'.4f'),('Slow -3dB (kHz)','slow_bandwidth_Hz',.001,'.3f'),('Fast -3dB (kHz)','fast_bandwidth_Hz',.001,'.3f'),('DC power (uW)','supply_power_W',1e6,'.2f')]:cells.append([label,format(get(nominal,key)*scale,fmt),format(get(best,key)*scale,fmt)])
table=ax.table(cellText=cells,colLabels=['Measurement','30k / 5pF','40k / 8pF'],loc='upper left',cellLoc='right',colWidths=[.47,.25,.25]);table.auto_set_font_size(False);table.set_fontsize(10);table.scale(1,1.7)
ax.text(.02,.28,f"DC power reduction: {report['dc_power_reduction_vs_first']*100:.2f}%\nMeasured after AI parameter selection; not a guaranteed optimum.",transform=ax.transAxes,fontsize=10)
fig.supxlabel('Ideal R/C and external stimulus/load; no extracted layout, noise, mismatch or foundry signoff.',fontsize=9)
for ext in ('png','svg','pdf'):fig.savefig(base/('measured-results.'+ext),dpi=180)
print(json.dumps({'files':['measured-results.png','measured-results.svg','measured-results.pdf'],'data_source':'retained native ngspice samples','selected_candidate':best['index']+1}))
