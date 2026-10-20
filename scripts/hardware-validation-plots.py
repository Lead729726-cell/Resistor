"""Scientific figure from retained actual ngspice data, with signed source current."""
import gzip,json
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
root=Path('examples/hardware-validation')
q=json.loads((root/'qualification.json').read_text(encoding='utf-8'))
fig,axes=plt.subplots(3,2,figsize=(13,8),sharex=True,layout='constrained')
for row,(corner,temp) in enumerate([('tt',27),('ss',125),('ff',-40)]):
    for stage,style in [('pre','--'),('post','-')]:
        item=next(r for r in q['runs'] if r['label']==f'routed/analog-{corner}-{stage}')
        run=json.loads(gzip.decompress((root/'runs'/item['id']/'run.json.gz').read_bytes()))
        wave=next(w for w in run['waveforms'] if w['name']=='ANALOG_OUT')
        axes[row,0].plot(np.array(wave['x'])*1e9,wave['y'],style,label=stage+'-layout',lw=1.4)
        if stage=='pre':
            drive=next(w for w in run['waveforms'] if w['name']=='a')
            axes[row,0].plot(np.array(drive['x'])*1e9,drive['y'],color='#858b98',alpha=.5,lw=.8,label='actual input')
        branch=next(b for b in run['current_flow']['branches'] if b['id']=='testbench/VEXTERNAL0')
        axes[row,1].plot(np.array(run['current_flow']['x'])*1e9,np.array(branch['values_A'])*1e6,style,label=stage+'-layout',lw=1.1)
    axes[row,0].set(title=f'{corner.upper()} / {temp} C | MOS + physical RC',ylabel='Voltage (V)')
    axes[row,1].set(title='Signed VDD source current (+ to -)',ylabel='Current (uA)')
    for ax in axes[row]:ax.grid(alpha=.2);ax.legend(fontsize=8,loc='best');ax.set_xlim(0,450)
for ax in axes[-1]:ax.set_xlabel('Time (ns)')
fig.suptitle('Resistor Indust | Actual ngspice pre-layout / native Magic PEX',fontsize=15)
fig.savefig(root/'pre-post-waveforms.png',dpi=160)
print(json.dumps({'image':str(root/'pre-post-waveforms.png'),'actual_runs':6,'spatial_current_mapping':'not inferred','manufacturing_signoff':False}))
