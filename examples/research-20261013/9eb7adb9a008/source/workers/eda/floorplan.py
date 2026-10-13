"""Integer-DBU chip envelope, enforced before every immutable revision.

An envelope is a design constraint, not a pad ring or foundry die definition.
Legacy projects without a policy are preserved unchanged.
"""
import math
from geometry import EDAError

DEFAULT = dict(width_um=1000., height_um=1000., max_area_um2=1000000., edge_um=10.)

def policy(raw=None):
    if raw is None:raw=DEFAULT
    if not isinstance(raw,dict) or set(raw)-set(DEFAULT):
        raise EDAError('INVALID_FLOORPLAN','Chip limits accept width_um, height_um, max_area_um2 and edge_um only.')
    result={**DEFAULT,**raw}
    for key,value in result.items():
        if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or value<=0:
            raise EDAError('INVALID_FLOORPLAN','Chip limits must be finite positive numbers with explicit um / um² units.')
    if not 10<=result['width_um']<=10000 or not 10<=result['height_um']<=10000 or not 100<=result['max_area_um2']<=100000000:
        raise EDAError('INVALID_FLOORPLAN','Supported chip envelopes are 10..10000um per side and 100..100000000um².')
    if result['width_um']*result['height_um']>result['max_area_um2']+1e-9:
        raise EDAError('CHIP_AREA_LIMIT','Declared chip width × height exceeds its area limit.',result)
    if 2*result['edge_um']>=min(result['width_um'],result['height_um']):
        raise EDAError('INVALID_FLOORPLAN','Edge clearance leaves no usable chip interior.')
    if any(abs(result[key]/.005-round(result[key]/.005))>1e-6 for key in ('width_um','height_um','edge_um')):
        raise EDAError('OFF_GRID','Chip envelope dimensions must lie on the 5nm grid.')
    return {'schema_version':1,**result,'origin_um':[0.,0.],'scope':'All hierarchical geometry and routes; excludes external pads/package. Public-PDK verification required.'}

def specification(value):
    return {key:value[key] for key in DEFAULT}

def inspect(layout,cell_name,value):
    value=policy(specification(value))
    cell=layout.cell(cell_name)
    if cell is None:raise EDAError('INVALID_CELL','Chip envelope root cell is absent.')
    bb=cell.bbox();unit=layout.dbu
    width=round(value['width_um']/unit);height=round(value['height_um']/unit);edge=math.ceil(value['edge_um']/unit)
    fit=bb.empty() or (bb.left>=edge and bb.bottom>=edge and bb.right<=width-edge and bb.top<=height-edge)
    used=[0.,0.] if bb.empty() else [bb.width()*unit,bb.height()*unit]
    return {'policy':value,'fits':fit,'bbox_dbu':None if bb.empty() else [str(bb.left),str(bb.bottom),str(bb.right),str(bb.top)],
            'used_width_um':used[0],'used_height_um':used[1],'used_area_um2':used[0]*used[1],
            'chip_area_um2':value['width_um']*value['height_um'],
            'minimum_envelope_um':[v+2*value['edge_um'] for v in used],
            'scope':'Actual hierarchy bbox including routes. No clipping, scaling, geometry relocation or foundry approval.'}

def enforce(layout,cell_name,value):
    result=inspect(layout,cell_name,value)
    if not result['fits']:
        raise EDAError('CHIP_ENVELOPE_EXCEEDED','Layout exceeds the chip envelope or edge clearance; revision was not committed.',result)
    return result
