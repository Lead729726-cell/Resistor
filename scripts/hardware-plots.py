"""Scientific figures from actual retained native samples and integer-DBU mask scenes."""
import gzip,json,math,bisect
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PatchCollection
from matplotlib.patches import PathPatch
from matplotlib.path import Path as PlotPath
ROOT=Path(__file__).resolve().parents[1]/'examples/hardware-lab'
def read(file):
    p=Path(file)
    return json.loads(gzip.decompress(p.read_bytes()) if p.suffix=='.gz' else p.read_bytes())
q=read(ROOT/'qualification.json');r=next(r for r in q['runs']if r['label']=='mixed-mos-rc');folder=ROOT/'runs'/r['id']
waves=read(folder/'waveforms.json.gz');flow=read(folder/'current_flow.json.gz');wave={v['name']:v for v in waves}
current=next(b for b in flow['branches']if b['name'].startswith('HDLDRV_RC_R'))
cap=next(b for b in flow['branches']if b['name'].startswith('HDLDRV_RC_C'))
y=wave['y'];a=wave['ANALOG_OUT'];assert y['x']==a['x']==flow['x'];assert len(y['y'])==len(current['values_A'])==len(cap['values_A'])
ohm=max(abs(i-(v-o)/1000)for i,v,o in zip(current['values_A'],y['y'],a['y']));kcl=max(abs(i-j)for i,j in zip(current['values_A'],cap['values_A']))
assert ohm<1e-10 and kcl<1e-12
report={'edition':'Resistor Indust','run_id':r['id'],'samples':len(y['x']),'reference_equations':['I_R=(V_y-V_ANALOG_OUT)/1000 ohm','I_R-I_C=0 at the external RC node'],'max_ohm_residual_A':ohm,'ohm_comparison_tolerance_A':1e-10,'max_kcl_residual_A':kcl,'kcl_comparison_tolerance_A':1e-12,'comparison_scope':'Independent arithmetic on serialized actual voltages and signed terminal currents; output precision affects residual. Not full-chip verification.','peak_abs_resistor_current_A':max(map(abs,current['values_A'])),'native_current_branches':len(flow['branches']),'spatial_mapping':current['mapping'],'external_R_Ohm':1000,'external_C_F':1e-12,'external_R_times_C_s':1e-9,'combined_driver_time_constant':'not inferred; includes nonlinear MOS drive','passed':True,'manufacturing_signoff':False}
design=read(ROOT/'projects/inverter/design.json');checks=[]
def at(w,t):
    i=bisect.bisect_left(w['x'],t)
    if i==0:return w['y'][0]
    if i==len(w['x']):return w['y'][-1]
    x0,x1=w['x'][i-1:i+1];v0,v1=w['y'][i-1:i+1];return v0+(v1-v0)*(t-x0)/(x1-x0)
def logic(v):return 0 if v<=.3*1.8 else 1 if v>=.7*1.8 else None
for i,row in enumerate(design['vectors']):
    t=(i+.9)*design['step_ns']*1e-9;iv=at(wave['a'],t);ov=at(wave['y'],t);ok=logic(iv)==int(row['inputs']['a']) and logic(ov)==int(row['expect']['y']);checks.append({'vector':i,'sample_s':t,'input_V':iv,'output_V':ov,'expected_output':int(row['expect']['y']),'observed_output':logic(ov),'passed':ok})
assert all(v['passed']for v in checks);report['late_settle_logic_checks']=checks;report['logic_scope']='Eight selected late-settle TT waveform samples; not propagation-time/PVT closure.'
(ROOT/'mixed-electrical-check.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10})
fig,axs=plt.subplots(3,1,figsize=(12,8),sharex=True,constrained_layout=True);x=[v*1e9 for v in y['x']]
for name,color in [('a','#3d73b9'),('y','#bc584c')]:axs[0].plot(x,wave[name]['y'],label=name,color=color,lw=1.2)
axs[0].set_ylabel('MOS voltage / V');axs[0].legend(loc='upper right',ncol=2);axs[0].set_title('Actual SKY130 MOS output driving an ideal external RC (1 kohm, 1 pF)')
axs[1].plot(x,a['y'],label='ANALOG_OUT',color='#25866b',lw=1.4);axs[1].plot(x,[v-o for v,o in zip(y['y'],a['y'])],label='V(y) - V(ANALOG_OUT)',color='#ac7b26',lw=1);axs[1].set_ylabel('RC voltage / V');axs[1].legend(loc='upper right',ncol=2)
axs[2].plot(x,[v*1e6 for v in current['values_A']],color='#7857a4',lw=1.1,label='I_R: y -> ANALOG_OUT');axs[2].set_ylabel('Signed current / uA');axs[2].set_xlabel('Actual solver time / ns');axs[2].legend(loc='upper right')
for ax in axs:ax.grid(alpha=.2);ax.set_xlim(0,max(x))
fig.suptitle('Resistor Indust | Actual ngspice transient | '+str(len(x))+' adaptive samples\nPre-layout MOS + external ideal RC; no RC mask or manufacturing signoff',fontsize=12);fig.savefig(ROOT/'mixed-waveforms.png',dpi=155);plt.close(fig)
fig,axs=plt.subplots(1,2,figsize=(13,4),constrained_layout=True)
for ax,label in zip(axs,['inverter','assembly']):
    scene=read(ROOT/'projects'/label/'layout-scene.json.gz');colors={l['id']:l['color']for l in scene['layers']};unit=float(scene['dbu_um']);polys=[];face=[]
    for s in scene['shapes']:
        if s.get('polygon'):
            vertices=[];codes=[]
            for i,ring in enumerate([s['polygon'],*s.get('holes',[])]):
                points=[(int(x)*unit,int(y)*unit)for x,y in ring];area=sum(a[0]*b[1]-b[0]*a[1]for a,b in zip(points,points[1:]+points[:1]))
                if (area>0)!=(i==0):points.reverse()
                vertices.extend(points+[points[0]]);codes.extend([PlotPath.MOVETO]+[PlotPath.LINETO]*(len(points)-1)+[PlotPath.CLOSEPOLY])
            polys.append(PathPatch(PlotPath(vertices,codes)));face.append(colors.get(s['layer_id'],'#667788'))
    ax.add_collection(PatchCollection(polys,facecolors=face,edgecolors='none',alpha=.6));ax.autoscale();ax.set_aspect('equal');ax.set_xlabel('X / um');ax.set_ylabel('Y / um');ax.set_title(label+' | '+str(scene['total_shape_count'])+' native shapes')
fig.suptitle('Actual mask geometry | digital HDL-derived CMOS and analog/digital assembly\nDisplay colors only; assembly inter-block routes / complete LVS not established',fontsize=12);fig.savefig(ROOT/'layout-overview.png',dpi=155);plt.close(fig)
print(json.dumps(report))
