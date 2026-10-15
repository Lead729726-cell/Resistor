"""Bounded numeric independent-source stimuli. Never accept SPICE expressions."""
import math
from geometry import EDAError

def number(value):
    if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value):
        raise EDAError('INVALID_STIMULUS','Stimulus fields must be finite JSON numbers in SI units.')
    return float(value)

def validate(value):
    if not isinstance(value,dict):raise EDAError('INVALID_STIMULUS','Use a structured PULSE or PWL source.')
    kind=value.get('kind')
    if kind=='pulse':
        fields={'kind','low','high','delay_s','rise_s','fall_s','width_s','period_s'}
        if set(value)!=fields:raise EDAError('INVALID_STIMULUS','PULSE needs low/high, delay, rise, fall, width and period.')
        v={k:number(n) if k!='kind' else n for k,n in value.items()}
        if any(abs(v[k])>1000 for k in ('low','high')) or v['low']==v['high']:raise EDAError('INVALID_STIMULUS','Pulse levels must differ and be within ±1000 V/A; model validity is separate.')
        if not 0<=v['delay_s']<=.001 or any(not 1e-12<=v[k]<=.001 for k in ('rise_s','fall_s','width_s','period_s')):
            raise EDAError('INVALID_STIMULUS','Times use seconds: delay 0..1ms; positive edges/width/period 1ps..1ms.')
        if v['rise_s']+v['width_s']+v['fall_s']>v['period_s']*(1+1e-12):raise EDAError('INVALID_STIMULUS','Period must include rise + high plateau width + fall.')
        return v
    if kind=='pwl':
        if set(value)!={'kind','points'} or not isinstance(value['points'],list) or not 2<=len(value['points'])<=2048:raise EDAError('INVALID_STIMULUS','PWL needs 2..2048 [seconds, V/A] points.')
        points=[]
        for point in value['points']:
            if not isinstance(point,list) or len(point)!=2:raise EDAError('INVALID_STIMULUS','PWL point is [seconds, V/A].')
            t,v=map(number,point)
            if not 0<=t<=.001 or abs(v)>1000 or points and t<=points[-1][0]:raise EDAError('INVALID_STIMULUS','PWL times must increase strictly within 0..1ms, levels within ±1000 V/A.')
            points.append([t,v])
        if points[0][0]!=0:raise EDAError('INVALID_STIMULUS','PWL must explicitly start at time zero. Final value is held, not repeated.')
        return {'kind':'pwl','points':points}
    raise EDAError('INVALID_STIMULUS','Only numeric PULSE and nonrepeating PWL are supported.')

def emission(device):
    dc=float(device['parameters'].get('dc',0));v=device.get('stimulus')
    if v is None:return f'{dc:.12g}' # byte-compatible legacy DC netlists
    v=validate(v)
    if v['kind']=='pulse':wave='PULSE('+' '.join(f'{v[k]:.12g}' for k in ('low','high','delay_s','rise_s','fall_s','width_s','period_s'))+')'
    else:wave='PWL('+' '.join(f'{n:.12g}' for p in v['points'] for n in p)+')'
    return f'DC {dc:.12g} '+wave

def check_resolution(devices,settings):
    if settings['analysis']!='tran':return
    for d in devices:
        if not d.get('stimulus'):continue
        v=validate(d['stimulus'])
        if v['kind']=='pulse' and max(0,settings['duration_s']-v['delay_s'])/v['period_s']>1024:raise EDAError('STIMULUS_LIMIT','At most 1024 pulse periods per transient run; shorten duration or increase period.')
        edges=[v['rise_s'],v['fall_s'],v['width_s']] if v['kind']=='pulse' else [b[0]-a[0] for a,b in zip(v['points'],v['points'][1:]) if a[1]!=b[1]]
        if edges and settings['step_s']>min(edges)/5*(1+1e-12):raise EDAError('STIMULUS_UNDERSAMPLED',f'{d.get("name","source")}: maximum time step must be ≤ shortest source transition/5; decrease step_s.')

def timing_recipe(value):
    fields={'schema_version','input','output','polarity','low_V','high_V','start_s','end_s','settle_s','max_delay_s','max_rise_s','max_fall_s','minimum_cycles'}
    if not isinstance(value,dict) or set(value)!=fields or value['schema_version']!=1 or isinstance(value['schema_version'],bool):raise EDAError('INVALID_TIMING_CHECK','Use a complete version 1 timing recipe.')
    import native
    if any(not isinstance(value[k],str) or len(value[k])>128 or not native.NET.fullmatch(value[k]) for k in ('input','output')) or value['input']==value['output'] or value['polarity'] not in ('same','inverting'):
        raise EDAError('INVALID_TIMING_CHECK','Choose distinct actual voltage signals and same/inverting polarity.')
    v={k:number(n) if k in fields-{'schema_version','input','output','polarity'} else n for k,n in value.items()}
    if not -1000<=v['low_V']<v['high_V']<=1000 or not 0<=v['start_s']<v['end_s']<=.001:raise EDAError('INVALID_TIMING_CHECK','Require ordered voltage levels and a nonempty time interval within 0..1ms.')
    if any(not 1e-12<=v[k]<=.001 for k in ('settle_s','max_delay_s','max_rise_s','max_fall_s')) or not 1<=v['minimum_cycles']<=64 or int(v['minimum_cycles'])!=v['minimum_cycles']:
        raise EDAError('INVALID_TIMING_CHECK','Positive limits/settling 1ps..1ms and 1..64 minimum cycles are required.')
    v['minimum_cycles']=int(v['minimum_cycles']);return v
