"""Plot only exported native masks and measured pre/post vectors."""
import json,sys
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
from matplotlib.path import Path as PlotPath
from matplotlib.patches import PathPatch
import klayout.db as k
root=Path('/workspace/examples/bounded-sar');e=json.loads((root/'evidence.json').read_text())
assert len(e['rows'])==8 and all(r['all_executed_pass'] for r in e['rows'])
plt.style.use('dark_background')
fig,axs=plt.subplots(2,4,figsize=(16,8),layout='constrained')
colors={(64,20):'#675171',(65,20):'#597763',(66,20):'#bb6960',(68,20):'#83a5d4',(69,20):'#ac74ad',(70,20):'#d5a267',(71,20):'#65c8c8'}
for ax,row in zip(axs.flat,e['rows']):
    l=k.Layout();l.read(str(root/row['reference']/(row['reference']+'.gds')));c=l.cell(row['reference'])
    for layer,color in colors.items():
        li=l.find_layer(*layer)
        if li is None:continue
        region=k.Region(c.begin_shapes_rec(li));region.merge()
        polygons=[]
        for poly in region.each():
            if not poly.holes():polygons.append([(p.x*l.dbu,p.y*l.dbu) for p in poly.each_point_hull()]);continue
            vertices=[];codes=[]
            for index,ring in enumerate([list(poly.each_point_hull()),*[list(poly.each_point_hole(i)) for i in range(poly.holes())]]):
                points=[(p.x*l.dbu,p.y*l.dbu) for p in ring]
                signed=sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(points,points[1:]+points[:1]))
                if (signed>0)!=(index==0):points.reverse()
                vertices.extend(points+[points[0]]);codes.extend([PlotPath.MOVETO]+[PlotPath.LINETO]*(len(points)-1)+[PlotPath.CLOSEPOLY])
            ax.add_patch(PathPatch(PlotPath(vertices,codes),facecolor=color,edgecolor='none',alpha=.6,rasterized=True))
        if polygons:ax.add_collection(PolyCollection(polygons,facecolors=color,edgecolors='none',alpha=.6,rasterized=True))
    ax.add_patch(plt.Rectangle((0,0),1000,1000,fill=False,linestyle='--',linewidth=1,color='#c9d6e4'))
    ax.set(xlim=(-15,1015),ylim=(-15,1015),aspect='equal',xlabel='X (µm)',ylabel='Y (µm)')
    a=row['envelope'];ax.set_title(row['reference']+'\n'+f"{a['used_width_um']:.2f} × {a['used_height_um']:.2f} µm",fontsize=10)
fig.suptitle('Actual SKY130 GDS masks inside a 1 mm² envelope · pads/package excluded',fontsize=14)
fig.savefig(root/'layouts.png',dpi=160);plt.close(fig)
folder=root/'sar8_analog';fig,axs=plt.subplots(4,1,figsize=(12,9),sharex=True,layout='constrained')
for stage,color in [('pre','#89b5ef'),('post','#edbd79')]:
    waves={w['name']:w for w in json.loads((folder/(stage+'-waveforms.json')).read_text())}
    for ax,name in zip(axs,['TOP','COMP','reference_current','CODE']):
        w=waves[name];points=[(x*1e6,y) for x,y in zip(w['x'],w['y']) if x<=56e-6]
        if name=='CODE':ax.step([p[0] for p in points],[p[1] for p in points],where='post',label=stage,color=color,linewidth=1,marker='o',markersize=3)
        else:ax.plot([p[0] for p in points],[p[1] for p in points],label=stage,color=color,linewidth=1)
        ax.set_ylabel(name+'\n'+w['unit']);ax.grid(alpha=.15)
axs[0].set_title('Measured SAR charge residue, restored comparator, reference current and replayed CODE')
axs[0].legend();axs[-1].set_xlabel('Native analog bridge time (µs) · digital logic replay excludes transistor timing')
fig.savefig(root/'sar-waveforms.png',dpi=160);plt.close(fig)
print('Rendered actual masks and measured vectors')
