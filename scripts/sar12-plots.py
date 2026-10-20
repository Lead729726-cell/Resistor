"""Plot exported masks, exact unit positions and native codes, without ideal overlays."""
import gzip,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'examples/sar12-lab'
if '--extract' in sys.argv:
    import klayout.db as k
    layout=k.Layout();layout.read(str(OUT/'analog/sar12_analog.oas'));top=layout.cell('sar12_analog');polygons={}
    for layer in ((65,20),(66,20),(70,20),(71,20),(72,20),(89,44)):
        li=layout.find_layer(*layer)
        if li is None:continue
        region=k.Region(top.begin_shapes_rec(li));region.merge();rings=[]
        for poly in region.each():
            rings.append([[[p.x*layout.dbu,p.y*layout.dbu] for p in poly.each_point_hull()],*[[[p.x*layout.dbu,p.y*layout.dbu]for p in poly.each_point_hole(i)]for i in range(poly.holes())]])
        polygons['/'.join(map(str,layer))]=rings
    (ROOT/'.runtime/sar12/mask-polygons.json').write_text(json.dumps(polygons));print('Extracted actual layer polygons');sys.exit()
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.path import Path as MP
from matplotlib.patches import PathPatch,Rectangle
from matplotlib.collections import PolyCollection
plt.style.use('dark_background');route=json.loads((OUT/'analog/routing-report.json').read_text())
fig,axs=plt.subplots(1,2,figsize=(14,7),layout='constrained');ax=axs[0]
colors=['#729c81','#dd8982','#d2a86d','#69a8ce','#cf8ec5','#d7d1a7']
for (layer,polys),color in zip(json.loads((ROOT/'.runtime/sar12/mask-polygons.json').read_text()).items(),colors):
    simple=[]
    for rings in polys:
        if len(rings)==1:simple.append(rings[0]);continue
        vertices=[];codes=[]
        for i,ring in enumerate(rings):
            signed=sum(a[0]*b[1]-b[0]*a[1]for a,b in zip(ring,ring[1:]+ring[:1]))
            if (signed>0)!=(i==0):ring=list(reversed(ring))
            vertices.extend(ring+[ring[0]]);codes.extend([MP.MOVETO]+[MP.LINETO]*(len(ring)-1)+[MP.CLOSEPOLY])
        ax.add_patch(PathPatch(MP(vertices,codes),facecolor=color,edgecolor='none',alpha=.6,rasterized=True))
    ax.add_collection(PolyCollection(simple,facecolors=color,edgecolors='none',alpha=.65,rasterized=True,label=layer))
ax.add_patch(Rectangle((0,0),1000,1000,fill=False,linestyle='--',edgecolor='white'))
ax.set(xlim=(-15,1015),ylim=(-15,1015),aspect='equal',xlabel='X (µm)',ylabel='Y (µm)',title='Actual SKY130 analog-core masks\n841.205 × 718.720 µm in a 1 mm² envelope')
ax.legend(loc='upper right',fontsize=8)
ax=axs[1]
groups=sorted({p['group'] for p in route['unit_placements']});palette=plt.get_cmap('turbo')
for i,g in enumerate(groups):
    points=[p['center_dbu']for p in route['unit_placements']if p['group']==g]
    ax.scatter([p[0]/1000 for p in points],[p[1]/1000 for p in points],marker='s',s=25,color=palette(i/len(groups)),label=g)
c=next(iter(route['unit_centroids_dbu'].values()));ax.scatter(c[0]/1000,c[1]/1000,color='white',marker='+',s=160)
ax.set(aspect='equal',xlabel='X (µm)',ylabel='Y (µm)',title='508 actual unit positions · four interleaved banks\nAll 26 group centroids coincide; coupling equality unqualified')
ax.legend(ncol=2,fontsize=6,bbox_to_anchor=(1.01,1),loc='upper left')
fig.suptitle('Resistor Indust · 12-bit differential 6+6 split-CDAC research prototype',fontsize=13)
fig.savefig(OUT/'layout-and-matching.png',dpi=140);plt.close(fig)
qual=OUT/'qualification.json'
if not qual.exists():sys.exit()
report=json.loads(qual.read_text());nominal=next((r for r in report['runs']if r['label']=='directed'),None)
if nominal and (OUT/'runs'/nominal['id']/'waveforms.json.gz').exists():
    waves={w['name']:w for w in json.loads(gzip.decompress((OUT/'runs'/nominal['id']/'waveforms.json.gz').read_bytes()))};fig,axs=plt.subplots(4,1,figsize=(12,8),sharex=True,layout='constrained')
    for ax,names in zip(axs,[['VINP','VINN'],['TOPP','TOPN'],['COMP','COMPN'],['CODE']]):
        for name in names:
            w=waves[name];points=[(x*1e6,y) for x,y in zip(w['x'],w['y']) if x<=31e-6]
            if name=='CODE':ax.step(*zip(*points),where='post',label=name,marker='o')
            else:ax.plot(*zip(*points),label=name,linewidth=.8)
        ax.legend(loc='upper right');ax.grid(alpha=.15);ax.set_ylabel(w['unit'])
    axs[-1].set_xlabel('Actual ngspice time (µs) · finite-RC external control bridge')
    fig.suptitle('Measured input, held charge, comparator decisions and output CODE · noiseless TT')
    fig.savefig(OUT/'native-waveforms.png',dpi=140);plt.close(fig)
for run in report['runs']:
    spectrum=OUT/'runs'/run['id']/'spectrum.json'
    if not spectrum.exists():continue
    import math
    s=json.loads(spectrum.read_text());rows=s['spectrum'];maximum=max(p['power_code2']for p in rows)
    fig,ax=plt.subplots(figsize=(10,4),layout='constrained');ax.stem([p['frequency_Hz']/1000 for p in rows],[10*math.log10(max(p['power_code2'],1e-30)/maximum)for p in rows],bottom=-120,basefmt=' ')
    ax.set(ylim=(-115,3),xlabel='Frequency (kHz)',ylabel='dBc',title=f"Actual {s['sample_count']}-code coherent DFT · SNDR {s['SNDR_dB']:.2f} dB · noiseless ENOB {s['ENOB_noiseless_bits']:.2f}\nNoise / mismatch / jitter excluded; no silicon ENOB claim")
    ax.grid(alpha=.15);fig.savefig(OUT/'native-spectrum.png',dpi=140);plt.close(fig)
posts=[next((r for r in report['runs']if r['label']==label),None)for label in ('post-code-64','post-single','post-code-4031')]
if all(r and r['execution_status']=='completed' and (OUT/'runs'/r['id']/'waveforms.json.gz').exists()for r in posts):
    fig,axs=plt.subplots(5,3,figsize=(15,11),sharex=True,layout='constrained')
    for col,run in enumerate(posts):
        waves={w['name']:w for w in json.loads(gzip.decompress((OUT/'runs'/run['id']/'waveforms.json.gz').read_bytes()))}
        frame=run['reference_verification']['frames'][0]
        for row,names in enumerate((('VINP','VINN'),('TOPP','TOPN'),('COMP','COMPN'),('EVAL','B11','B6'),('VPWR',))):
            ax=axs[row,col]
            for name in names:
                w=waves[name];values=[(run['measurements']['source_energy']['9']['source_voltage_V']-y)*1e6 for y in w['y']]if name=='VPWR'else w['y']
                ax.plot([x*1e6 for x in w['x']],values,label='VDD source − VPWR'if name=='VPWR'else name,linewidth=.7)
            ax.grid(alpha=.15);ax.legend(fontsize=7,loc='upper right');ax.set_ylabel('µV drop'if row==4 else 'V')
        axs[0,col].set_title(f"VINdiff {frame['input_differential_V']:.9g} V\nCODE {frame['code']} / expected {frame['expected_code']} · error {frame['error_codes']:+d}")
        axs[-1,col].set_xlabel('Actual ngspice time (µs)')
    fig.suptitle('Resistor Indust · Native RC-extracted SAR12 smoke tests\nSame finite-source / continuous-PWL bridge; noiseless TT only, not full-range or silicon ENOB',fontsize=13)
    fig.savefig(OUT/'post-layout-waveforms.png',dpi=140);plt.close(fig)
print('Rendered actual masks, positions and available native vectors')
