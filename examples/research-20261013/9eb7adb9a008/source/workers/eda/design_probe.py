"""Read-only development probe. No worker state, mutation, or process launch."""
import sys
from pathlib import Path
if len(sys.argv)>2 and sys.argv[2]=='find':
    import re
    lines=Path(sys.argv[1]).read_text().splitlines()
    for i,s in enumerate(lines):
        if re.search(sys.argv[3],s):print('\n'.join(f'{j+1}: {lines[j]}' for j in range(max(0,i-7),min(len(lines),i+4))))
elif len(sys.argv)>2:
    lines=Path(sys.argv[1]).read_text().splitlines()
    a,b=map(int,sys.argv[2:4]);print('\n'.join(f'{i+1}: {s}' for i,s in enumerate(lines) if a<=i+1<=b))
else:
    root=Path('/foss/pdks/sky130A/libs.tech/magic')
    lines=(root/'sky130A.tech').read_text().splitlines()
    for i,s in enumerate(lines):
        if any(t in s for t in ('scalefactor','met1','metal1','grid','marea')) and (s.strip().split(' ')[0] in ('width','spacing','area','grid','scalefactor','marea') or 'width' in s or 'spacing' in s):
            print(f'{i+1}: {s}')
    for i,s in enumerate((root/'sky130A.tcl').read_text().splitlines()):
        if 'via1' in s or '0.14' in s or '0.005' in s:print(f'TCL {i+1}: {s}')
