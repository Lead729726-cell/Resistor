"""Small public SKY130 physical cores, with explicit native rule validation outside generation."""
from pathlib import Path
import subprocess
import uuid
import klayout.db as k
import geometry
import native
import profile
from geometry import EDAError

def via(folder,cell,kind='via1',width=260,height=260):
    if kind not in {'via1','via2'}: raise EDAError('UNSUPPORTED_PCELL','Verified via helper scope is via1/via2.')
    minimum=260 if kind=='via1' else 280
    if min(width,height)<minimum or max(width,height)>10000: raise EDAError('PARAMETER_RANGE',f'{kind} box must be {minimum}..10000 DBU at 1nm DBU.')
    folder.mkdir(parents=True,exist_ok=True); script=folder/'via.tcl'
    landing=''
    if kind=='via2':
        # The public helper provides enclosure but expects routing to satisfy met3.6 area.
        # An isolated reusable PCell includes a 0.5x0.5um landing pad (native DRC verified).
        padw=max(width+100,500);padh=max(height+50,500);x1=(width-padw)/2000;y1=(height-padh)/2000;x2=(width+padw)/2000;y2=(height+padh)/2000
        landing=f'box {x1:.12g}um {y1:.12g}um {x2:.12g}um {y2:.12g}um\npaint m3\n'
    script.write_text(f'load {cell}\nbox 0um 0um {width/1000:.12g}um {height/1000:.12g}um\nsky130::{kind}_draw\n{landing}save {cell}\ngds write {cell}.gds\nquit -noprompt\n')
    result=subprocess.run(['magic','-dnull','-noconsole','-rcfile',str(profile.MAGIC_RC),str(script)],cwd=folder,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=60)
    (folder/'generator.log').write_text(result.stdout)
    if result.returncode or not (folder/(cell+'.gds')).exists(): raise EDAError('ENGINE_FAILED','Public Magic via helper did not generate geometry.')
    l=k.Layout();l.read(str(folder/(cell+'.gds')));return l

def analog(backend,folder,kind):
    count=2 if kind=='current_mirror' else 3; l=k.Layout();l.dbu=.001;top=l.create_cell(kind)
    base=backend.magic_generate(folder/'mos','nfet_core');core=base.cell('nfet_core')
    v1=via(folder/'via1','via1_core','via1');v2=via(folder/'via2','via2_core','via2',280,280)
    devices=[]
    if kind=='current_mirror':
        mappings=[{'D':'REF','G':'REF','S':'VGND','B':'VGND'},{'D':'OUT','G':'REF','S':'VGND','B':'VGND'}]; rails={'REF':2400,'OUT':3400,'VGND':-3500};ports=['REF','OUT','VGND']
    else:
        mappings=[{'D':'OUTP','G':'INP','S':'TAIL','B':'VGND'},{'D':'OUTN','G':'INN','S':'TAIL','B':'VGND'},{'D':'TAIL','G':'BIAS','S':'VGND','B':'VGND'}];rails={'INP':2400,'INN':3400,'OUTP':4400,'OUTN':5400,'TAIL':6400,'BIAS':7400,'VGND':-3500};ports=['INP','INN','OUTP','OUTN','BIAS','VGND']
    def box(layer,x1,y1,x2,y2,net):
        s=top.shapes(l.layer(*layer)).insert(k.Box(x1,y1,x2,y2));s.set_property(2,net);return s
    def route(layer,points,width,net):
        s=top.shapes(l.layer(*layer)).insert(k.Path([k.Point(*p) for p in points],width));s.set_property(2,net)
    def place_via(source,cell,x,y,net):
        # Public helper's box starts at 0; center actual via cut on requested connection.
        cutlayer=source.find_layer(68 if cell=='via1_core' else 69,44); cuts=list(source.cell(cell).shapes(cutlayer).each());bb=cuts[0].bbox();t=k.Trans(x-(bb.left+bb.right)//2,y-(bb.bottom+bb.top)//2)
        for li in source.layer_indices():
            info=source.get_info(li)
            for shape in source.cell(cell).shapes(li).each():
                primitive=shape.text.transformed(t) if shape.is_text() else geometry.shape_poly(shape).transformed(t)
                new=top.shapes(l.layer(info)).insert(primitive);new.set_property(2,net)
    for i,pins in enumerate(mappings):
        cx=i*5000;trans=k.Trans(cx,0);ident='mn'+str(i+1)
        for li in base.layer_indices():
            info=base.get_info(li)
            if info.datatype==16: continue # Only declared top ports receive external pin-purpose geometry.
            for shape in core.shapes(li).each():
                if shape.is_text():
                    txt=shape.text.transformed(trans);txt.string=pins.get(txt.string,txt.string)
                    new=top.shapes(l.layer(info)).insert(txt)
                else:new=top.shapes(l.layer(info)).insert(geometry.shape_poly(shape).transformed(trans))
                new.set_property(3,ident)
                oldnet=shape.property(2)
                if oldnet in pins:new.set_property(2,pins[oldnet])
        devices.append({'id':ident,'name':ident.upper(),'kind':'nmos','model':'sky130_fd_pr__nfet_01v8','pins':pins,'parameters':{'w_um':.65,'l_um':.15,'nf':1,'m':1},'x':300+i*250,'y':250 if i<2 else 450})
        # Fan out contacted D/S metal1 to separated via1 columns. Gate begins on LI1.
        for pin,x in (('D',cx-800),('S',cx+800)):
            net=pins[pin];start=cx+(-220 if pin=='D' else 220);route((68,20),[(start,0),(x,0)],170,net);place_via(v1,'via1_core',x,0,net);route((69,20),[(x,0),(x,rails[net])],360,net);place_via(v2,'via2_core',x,rails[net],net)
        net=pins['G'];box((67,20),cx-85,515,cx+85,855,net);box((67,44),cx-85,685,cx+85,855,net);box((68,20),cx-200,570,cx+200,970,net);place_via(v1,'via1_core',cx,770,net);route((69,20),[(cx,770),(cx,rails[net])],360,net);place_via(v2,'via2_core',cx,rails[net],net)
        net=pins['B'];box((67,44),cx-85,-1195,cx+85,-1025,net);box((68,20),cx-200,-1310,cx+200,-910,net);place_via(v1,'via1_core',cx,-1110,net);route((69,20),[(cx,-1110),(cx,rails[net])],360,net);place_via(v2,'via2_core',cx,rails[net],net)
    for net,y in rails.items():
        route((70,20),[(-1500,y),((count-1)*5000+1500,y)],400,net)
        if net in ports:
            label=top.shapes(l.layer(70,5)).insert(k.Text(net,k.Trans(-1500,y)));label.set_property(2,net)
            pin=box((70,16),-1700,y-200,-1300,y+200,net);pin.set_property(4,net)
    geometry.assign_ids(l)
    return l,{'devices':devices,'wires':[],'connectivity_mode':'explicit'},ports
