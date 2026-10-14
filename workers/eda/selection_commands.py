"""Bounded group edits reuse existing validated commands in one transaction."""
from geometry import EDAError

def group(command, schematic=False):
    allowed={'type','action','items' if schematic else 'ids','dx','dy','cell_name'}
    if set(command)-allowed or command.get('action') not in ('move','copy','delete'):
        raise EDAError('INVALID_SELECTION','Unsupported group action/fields.')
    if command.get('cell_name') is not None and (not isinstance(command['cell_name'],str) or not command['cell_name'] or len(command['cell_name'])>128):
        raise EDAError('INVALID_SELECTION','Cell name must be nonempty bounded text.')
    values=command.get('items' if schematic else 'ids')
    if not isinstance(values,list) or not 1<=len(values)<=1000:
        raise EDAError('SELECTION_LIMIT','A group edit requires 1..1000 explicit selected items.')
    if schematic:
        if any(not isinstance(v,dict) or set(v)!={'kind','id'} or v['kind'] not in ('device','wire','junction') for v in values):
            raise EDAError('INVALID_SELECTION','Choose device/wire/junction IDs only.')
        ids=[(v['kind'],v['id']) for v in values]
    else:ids=[('shape',v) for v in values]
    if any(not isinstance(v,str) or not v or len(v)>1024 for _,v in ids) or len(set(ids))!=len(ids):
        raise EDAError('INVALID_SELECTION','Selected IDs must be distinct bounded strings.')
    return command['action'],ids
