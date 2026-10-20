"""Bounded 16-bit four-bank SAR array using the shared real-PCell router."""
import re
from collections import defaultdict
import sar12_physical
from geometry import EDAError
UNIT=re.compile(r'([PN])_BANK([0-3])_(B[0-3]|DUMMY)_U(\d+)\.C_UNIT(?::p0)?$')


def array_plan(devices):
    groups=defaultdict(list);rest=[]
    for d in devices:
        m=UNIT.search(d['id'])
        if m and d['kind']=='capacitor':groups[tuple(m.groups()[:3])].append((int(m[4]),d))
        else:rest.append(d)
    if sum(map(len,groups.values()))!=244:raise EDAError('SAR16_ARRAY','Four differential 4-bit banks require exactly 244 unit capacitors and six bridges.')
    rows=[[]for _ in range(16)];seen=set()
    for bank in range(4):
      for side in('P','N'):
        index=2*bank+(side=='N');indices=[index,15-index]
        pairs=[((0,c),(1,15-c))for c in range(16)]
        pairs.sort(key=lambda pair:(abs(pair[0][1]-7.5),pair))
        cursor=1
        if bank==3:
            units=sorted(groups.get((side,str(bank),'DUMMY'),[]))
            if len(units)!=2:raise EDAError('SAR16_ARRAY','The lowest bank needs its two actual dummy units.')
            for(_,d),(r,c)in zip(units,pairs[0]):rows[indices[r]].append((c,d,(side,'BANK'+str(bank),'DUMMY')));seen.add(d['id'])
        elif groups.get((side,str(bank),'DUMMY')):raise EDAError('SAR16_ARRAY','Higher banks receive the bridge equivalent, no physical dummy.')
        for bit in range(4):
            count=2<<bit;units=sorted(groups.get((side,str(bank),'B'+str(bit)),[]));selected=pairs[cursor:cursor+count//2];cursor+=count//2
            if len(units)!=count:raise EDAError('SAR16_ARRAY','Actual binary unit multiplicity changed.')
            for(_,d),(r,c)in zip(units,[p for pair in selected for p in pair]):
                if d['id']in seen:raise EDAError('SAR16_ARRAY','Duplicate physical unit identity.')
                seen.add(d['id']);rows[indices[r]].append((c,d,(side,'BANK'+str(bank),'B'+str(bit))))
    if len(seen)!=244:raise EDAError('SAR16_ARRAY','Unplaced real unit remains.')
    return[sorted(row,key=lambda x:x[0])for row in rows],rest


def physical(folder,ir,cell_name,ports,limits):
    return sar12_physical.physical(folder,ir,cell_name,ports,limits,planner=array_plan,unit_count=244,bridge_count=6,array_grid=(16,16),algorithm='sar16-four-bank-inversion-pairs-m3-m4-v1',packing_passes=5,trunk_pitch=2500,logic_rail_pitch=3600)
