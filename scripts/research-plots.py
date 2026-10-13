"""Original research figures from recorded native measurements, never paper figures."""
import json,sys
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
version=sys.argv[1];root=Path('/workspace/examples/research-20261013')/version
gates=['cell_inv','cell_nand2','cell_nor2','cell_and2','cell_or2','cell_xor2','cell_xnor2','cell_mux2']
data=[]
for g in gates:
    rows=[]
    for drive in [1,4]:
        r=json.loads((root/g/f'x{drive}-slew0.1-load4e-14/pre.json').read_text())
        if r['execution_status']!='completed' or r['analysis_result']!='pass':raise RuntimeError('No qualified native matrix value: '+g)
        rows.append(r)
    data.append(rows)
fig,axes=plt.subplots(2,1,figsize=(11,8),layout='constrained');x=np.arange(len(gates))
for index,(name,color) in enumerate([('X1','#477797'),('X4','#b47843')]):
    axes[0].bar(x+(index-.5)*.35,[d[index]['measurements']['timing_characterization']['max_propagation_s']*1e9 for d in data],.35,label=name,color=color)
    axes[1].bar(x+(index-.5)*.35,[d[index]['measurements']['research_metrics']['supply']['average_power_W']*1e6 for d in data],.35,label=name,color=color)
for a in axes:a.set_xticks(x,[g[5:].upper() for g in gates]);a.grid(axis='y',alpha=.18);a.legend();a.spines[['top','right']].set_visible(False)
axes[0].set_ylabel('Worst observed propagation (ns)');axes[1].set_ylabel('Mean VDD-only power (uW)')
fig.suptitle('Measured SKY130 cell drive tradeoffs | TT, 27 C, 1.8 V | 40 fF load, 0.1 ns full-swing input',fontsize=11)
fig.text(.01,-.015,'Sensitized actual input/output edges. Owned truth/arc stimulus; external input-driver power excluded. Source '+version,fontsize=9)
fig.savefig(root/'drive-tradeoffs.png',dpi=180,bbox_inches='tight');plt.close(fig)
out=Path('/workspace/platform/download-site/research-assets');out.mkdir(exist_ok=True)
fig,axes=plt.subplots(1,2,figsize=(11,4),layout='constrained')
psrr=json.loads((root/'chip_ldo/default/psrr.json').read_text())
native=Path('/workspace/.runtime/eda/runs')/psrr['run_id']/'waveform.dat'
rows=np.loadtxt(native,skiprows=1);gain=rows[:,1]
if np.any(gain<=0):raise RuntimeError('No infinite rejection figure from a zero gain.')
axes[0].semilogx(rows[:,0],-20*np.log10(gain),color='#477797');axes[0].set(xlabel='Frequency (Hz)',ylabel='Positive PSRR rejection (dB)',title='LDO: ideal output C, light resistive load');axes[0].grid(alpha=.2)
labels=['500','5000','15000','50000'];margins=[]
for value in labels:
    f=root/'soc_miller_ota'/('default' if value=='5000' else 'nulling-'+value)/'pre.json'
    margins.append(json.loads(f.read_text())['measurements']['phase_margin_deg'])
axes[1].bar(labels,margins,color=['#477797' if m>45 else '#a35454' for m in margins]);axes[1].axhline(45,color='#a35454',linestyle='--',label='45 degree minimum');axes[1].set(xlabel='Nulling resistance (ohm)',ylabel='Measured phase margin (degree)',title='OTA compensation: passing and failing choices');axes[1].legend(fontsize=8)
fig.savefig(root/'power-stability.png',dpi=180);plt.close(fig)
print(json.dumps({'source_version':version,'figures':['drive-tradeoffs.png','power-stability.png']}))
