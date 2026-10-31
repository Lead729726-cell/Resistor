"""Render retained actual ngspice traces; optional plotting dependencies only."""
import json
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

root=Path(__file__).resolve().parents[1];dest=root/'examples/ivr'
report=json.loads((root/'docs/evidence/ivr-20261031/native.json').read_text(encoding='utf-8'))
assert report['completed'] and report['all_directed_criteria_passed']
t=np.loadtxt(dest/'tran-waveform.dat',skiprows=1);ac=np.loadtxt(dest/'ac-waveform.dat',skiprows=1)
plt.rcParams.update({'font.size':10,'axes.titlesize':12,'figure.facecolor':'white','axes.grid':True,'grid.alpha':.2,'axes.spines.top':False})
fig,axes=plt.subplots(2,2,figsize=(12.4,8.6));blue='#1967b3';green='#008875';orange='#bc6c15'
ax=axes[0,0]
for col,label,color in [(1,'VIN',orange),(2,'VOUT',blue),(4,'Enable',green)]:ax.plot(t[:,0]*1e6,t[:,col],label=label,color=color,lw=1.3,alpha=.85)
ax.axhline(1.2,color='#777',ls=':',lw=1,label='1.2 V target');ax.set(xlabel='Time (us)',ylabel='Voltage (V)',title='Startup, input step, disable and restart');ax.legend(loc='lower left',fontsize=8,ncol=2)
ax=axes[0,1];sel=(t[:,0]>=35e-6)&(t[:,0]<=95e-6)
ax.plot(t[sel,0]*1e6,t[sel,2],color=blue,label='Measured VOUT');ax.axhline(1.2,color='#777',ls=':',lw=1);ax.set(xlabel='Time (us)',ylabel='VOUT (V)',title='20 -> 200 -> 20 uA resistive load test')
other=ax.twinx();other.plot(t[sel,0]*1e6,t[sel,9]*1e6,color=orange,ls='--',lw=1,label='Measured load current');other.set_ylabel('Load current (uA)',color=orange);other.grid(False)
ax=axes[1,0];ax.semilogx(ac[:,0],-20*np.log10(ac[:,1]),color=blue);ax.set(xlabel='Frequency (Hz)',ylabel='PSRR (dB)',title='Closed-loop supply ripple rejection, light load');ax.set_xlim(10,1e8)
ax=axes[1,1];ax.axis('off');rows=[]
for corner in ['tt','ss','ff']:
 op=next(r for r in report['runs'] if r['condition']['corner']==corner and r['condition']['analysis']=='op')
 tr=next(r for r in report['runs'] if r['condition']['corner']==corner and r['condition']['analysis']=='tran');m=tr['measurements'];c=tr['condition']
 rows.append([f"{corner.upper()} / {c['supply_V']} V / {c['temperature_C']} C",f"{op['measurements']['output_V']:.4f}",f"{m['load_step_undershoot_V']*1e3:.2f}",f"{m['load_settle_2pct_s']*1e6:.2f}",f"{m['heavy_power_stage_efficiency']*100:.2f}"])
table=ax.table(cellText=rows,colLabels=['MOS condition','DC VOUT\n(V)','Dip\n(mV)','2% settle\n(us)','Heavy eta\n(%)'],cellLoc='center',colWidths=[.37,.16,.15,.16,.16],loc='center');table.auto_set_font_size(False);table.set_fontsize(8);table.scale(1,2.25)
for (row,col),cell in table.get_celld().items():
 cell.set_edgecolor('#d0d8df')
 if row==0:cell.set_facecolor('#e8eef5')
ax.set_title('Actual OP / AC / transient: 9 completed runs',pad=18)
fig.suptitle('Resistor Indust | IVR-LDO: self-biased 1.8 V -> 1.2 V rail',fontsize=16,y=.98)
fig.text(.5,.015,'Actual SKY130 MOS / ngspice samples. Ideal R/C, external VREF and enable. Three combined MOS corners only.\nEfficiency includes DUT VDD current; external reference/driver power excluded. No loop-margin, PEX or manufacturing signoff.',ha='center',fontsize=9,color='#46525f')
fig.tight_layout(rect=(0,.065,1,.95))
for ext in ['png','svg','pdf']:fig.savefig(dest/('measured-results.'+ext),dpi=180)
print('Created examples/ivr/measured-results.{png,svg,pdf} from retained native traces.')
