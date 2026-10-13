"""Measurements of actual transient samples, never idealized digital output traces."""
import bisect
import math
from geometry import EDAError


def validate_wave(wave):
    x,y=wave.get('x',[]),wave.get('y',[])
    if not isinstance(x,list) or not isinstance(y,list) or not x or len(x)!=len(y):raise EDAError('INVALID_WAVEFORM','Actual waveform arrays must be nonempty and have equal lengths.')
    if any(isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) for v in x+y) or any(a>b for a,b in zip(x,x[1:])):raise EDAError('INVALID_WAVEFORM','Transient samples must be finite and time ordered.')


def value_at(wave,t):
    x,y=wave['x'],wave['y']
    # SPICE decimal text and computed cycle endpoints can differ by a few ULPs.
    # This only snaps numeric roundoff at the bounds, never a missing interval.
    tolerance=8*max(math.ulp(t),math.ulp(x[0]),math.ulp(x[-1]))
    if t<x[0] and x[0]-t<=tolerance:return y[0]
    if t>x[-1] and t-x[-1]<=tolerance:return y[-1]
    if t<x[0] or t>x[-1]:return None
    j=bisect.bisect_right(x,t)-1
    if x[j]==t or j==len(x)-1:return y[j]
    return y[j]+(y[j+1]-y[j])*(t-x[j])/(x[j+1]-x[j])


def window(wave,a,b):
    left,right=value_at(wave,a),value_at(wave,b)
    if b<=a or left is None or right is None:return []
    lo,hi=bisect.bisect_right(wave['x'],a),bisect.bisect_left(wave['x'],b)
    return [(a,left),*zip(wave['x'][lo:hi],wave['y'][lo:hi]),(b,right)]


def stable(wave,wanted,a,b,supply):
    points=window(wave,a,b)
    return bool(points) and all(v<=.3*supply if wanted==0 else v>=.7*supply for _,v in points)


def settling(waves,expected,edge,end,supply):
    """Last sampled invalid logic before a stable tail; a sampled bound, not STA."""
    delays=[]
    for name,bit in expected.items():
        points=window(waves[name],edge,end)
        if not points:return None
        bad=[i for i,(_,v) in enumerate(points) if not (v<=.3*supply if bit==0 else v>=.7*supply)]
        if bad and bad[-1]==len(points)-1:return None
        delays.append(points[bad[-1]+1][0]-edge if bad else 0.0)
    return max(delays,default=0.0)


def supply_metrics(wave,a,b,supply):
    points=window(wave,a,b)
    if not points:return {'available':False,'reason':'Supply-current trace does not cover the complete interval.'}
    charge=sum((j-i)*(x+y)/2 for (i,x),(j,y) in zip(points,points[1:]))
    mean=charge/(b-a);peak=max(v for _,v in points);minimum=min(v for _,v in points)
    return {'available':True,'start_s':a,'end_s':b,'energy_J':charge*supply,'average_current_A':mean,'peak_current_A':peak,'minimum_current_A':minimum,'average_power_W':mean*supply,'source':'actual -i(VDD), signed trapezoidal integration; constant testbench VDD'}
