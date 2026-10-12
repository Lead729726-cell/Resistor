"""Publication figures from actual exported ngspice CSV and KLayout geometry."""
import csv,json,sys
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
import klayout.db as k
root=Path('/workspace/examples/analog-soc')
plt.rcParams.update({'font.size':11,'axes.grid':True,'grid.alpha':.2})
def wave(kind,stage):
    with (root/kind/(stage+'-waveforms.csv')).open() as f:
        reader=csv.reader(f);header=next(reader);rows=np.array(list(reader),dtype=float)
    return {key.split(' [')[0]:rows[:,i] for i,key in enumerate(header)}
fig,ax=plt.subplots(3,1,figsize=(13,10),layout='constrained')
for stage,style in [('pre','-'),('post','--')]:
    w=wave('soc_sensor_afe',stage);ax[0].plot(w['time_or_frequency']*1e6,w['OUT'],style,label=stage+' OUT',linewidth=1.5)
    w=wave('soc_miller_ota',stage);ax[1].semilogx(w['time_or_frequency'],20*np.log10(w['OUT_gain']),style,label=stage+' OTA')
    w=wave('soc_filter2',stage);ax[2].semilogx(w['time_or_frequency'],20*np.log10(w['OUT_gain']),style,label=stage+' filter')
ax[0].set(xlabel='Time (us)',ylabel='AFE output (V)',title='Actual sensor AFE: gain selection changes at 100 us')
ax[1].set(xlabel='Frequency (Hz)',ylabel='Open-loop gain (dB)',title='Miller OTA: actual poly/MIM core, 1 pF external load')
ax[2].set(xlabel='Frequency (Hz)',ylabel='Gain (dB)',title='Two buffered RC poles: actual pre/post response')
for a in ax:a.legend(loc='best')
fig.suptitle('Resistor Analog SoC | SKY130 TT, 27 C, 1.8 V | Native SPICE / extracted RC',fontsize=14)
fig.savefig(root/'measurements.png',dpi=150);plt.close(fig)
e=json.loads((root/'evidence.json').read_text());fig,axes=plt.subplots(7,1,figsize=(14,15),layout='constrained')
colors={64:'#55ad77',66:'#e96c72',68:'#6b97d0',69:'#a994d5',70:'#dcaf57',71:'#55bfc1'}
for ax,row in zip(axes,e['rows']):
    kind=row['reference'];layout=k.Layout();layout.read(str(root/kind/(kind+'.gds')));top=layout.top_cell();bb=top.bbox()
    for li in layout.layer_indices():
        info=layout.get_info(li)
        if info.datatype!=20 or info.layer not in colors:continue
        polygons=[]
        for s in top.shapes(li).each():
            if s.is_text():continue
            p=s.polygon if s.is_polygon() else s.path.polygon() if s.is_path() else k.Polygon(s.box) if s.is_box() else None
            if p:polygons.append([(v.x*.001,v.y*.001) for v in p.each_point_hull()])
        ax.add_collection(PolyCollection(polygons,facecolors=colors[info.layer],edgecolors='none',alpha=.8))
    ax.set(xlim=(bb.left*.001-2,bb.right*.001+2),ylim=(bb.bottom*.001-2,bb.top*.001+2),xlabel='X (um)',ylabel='Y (um)',title=kind+' | actual GDS, single-row reference')
    ax.set_aspect('equal',adjustable='datalim');ax.grid(False)
fig.suptitle('Actual SKY130 masks | diffusion / poly / M1-M4 | no illustrative geometry',fontsize=14)
fig.savefig(root/'layouts.png',dpi=130);plt.close(fig)
print('Saved actual waveform and GDS figures')
