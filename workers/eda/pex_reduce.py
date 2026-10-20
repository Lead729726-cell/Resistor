"""Exact bounded resistor-network reduction; original native PEX is immutable.

Only unobserved resistor-only nodes are eliminated. Every MOS,
modelled passive, capacitor, declared logical net and port node is retained.
No capacitance threshold, fitted model or fabricated parasitic is used.
"""
from collections import defaultdict,deque
import heapq
import hashlib,json,math,re
from pathlib import Path
import digital_units
from geometry import EDAError

SCALES={'':1,'t':1e12,'g':1e9,'meg':1e6,'k':1e3,'m':1e-3,'u':1e-6,'n':1e-9,'p':1e-12,'f':1e-15}
def number(token,*,allow_zero=False):
    m=re.fullmatch(r'([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)([A-Za-z]*)',token)
    if not m or m[2].lower() not in SCALES:return None
    v=float(m[1])*SCALES[m[2].lower()]
    return v if math.isfinite(v) and (v>0 or allow_zero and v==0) else None

def reduce_text(text,protected=()):
    keep={n.lower() for n in protected};edges={};adj=defaultdict(set);others=[];names=set();start=None;finish=None
    # This adapter accepts one flat top. Multiple subcircuits are never mixed.
    for line in text.splitlines():
        f=line.split()
        if f and f[0].lower()=='.subckt':
            if start is not None:raise EDAError('UNSUPPORTED_REDUCTION','Series reduction requires one flat extracted subcircuit.')
            start=line;keep.update(n.lower() for n in f[2:]);continue
        if f and f[0].lower().startswith('.ends'):finish=line;continue
        if f:names.add(f[0].lower())
        value=number(f[3]) if len(f)==4 and re.fullmatch(r'[Rr]\S+',f[0]) else None
        if value is not None:
            key=f[0].lower();a,b=f[1].lower(),f[2].lower()
            if key in edges:raise EDAError('PARSER_FAILED','Duplicate resistor identifier in extracted network.')
            edges[key]=(f[1],f[2],value,line);adj[a].add(key);adj[b].add(key)
        else:
            others.append(line)
            # Conservative: any non-R token is protected, including model
            # parameters. Thus unsupported syntax cannot expose its nodes.
            if f and not f[0].startswith(('*','.')):keep.update(v.lower() for v in f[1:])
    if start is None or finish is None:raise EDAError('PARSER_FAILED','Flat extracted top is missing.')
    initial=len(edges);queue=deque(n for n,v in adj.items() if len(v)==2 and n not in keep);removed=0;serial=0;loops=0
    while queue:
        node=queue.popleft()
        if node in keep or len(adj[node])!=2:continue
        ids=sorted(adj[node]);e1,e2=(edges[i] for i in ids)
        # A self-loop is retained; it does not form a valid two-node chain.
        if e1[0].lower()==e1[1].lower() or e2[0].lower()==e2[1].lower():continue
        a=e1[1] if e1[0].lower()==node else e1[0];b=e2[1] if e2[0].lower()==node else e2[0]
        value=e1[2]+e2[2]
        if not math.isfinite(value):raise EDAError('EXTRACTION_INVALID','Equivalent resistance overflow; original network retained.')
        for key in ids:
            p,q,_,_=edges.pop(key);adj[p.lower()].discard(key);adj[q.lower()].discard(key)
        removed+=1
        if a.lower()==b.lower():loops+=1
        else:
            while True:
                key=f'rseries_equiv_{serial}';serial+=1
                if key not in names:break
            names.add(key);edges[key]=(a,b,value,f'{key} {a} {b} {value:.17g}');adj[a.lower()].add(key);adj[b.lower()].add(key)
        for n in (a.lower(),b.lower()):
            if n not in keep and len(adj[n])==2:queue.append(n)
    # Exact star-mesh elimination also handles contact-sheet resistor grids.
    # Positive conductances give the Schur complement g_ij=g_i*g_j/sum(g).
    # Bound degree/fill; nodes that exceed the limit remain in the circuit.
    pairs={};conductance={};adj2=defaultdict(set)
    def add(a,b,g):
        a,b=sorted((a.lower(),b.lower()))
        if a==b:return
        pair=(a,b);conductance[pair]=conductance.get(pair,0)+g;adj2[a].add(b);adj2[b].add(a)
    for a,b,value,_ in edges.values():add(a,b,1/value)
    heap=[(len(v),n) for n,v in adj2.items() if n not in keep and len(v)<=8];heapq.heapify(heap);mesh_removed=0
    while heap:
        degree,node=heapq.heappop(heap)
        if node in keep or node not in adj2 or len(adj2[node])!=degree or degree>8:continue
        if len(conductance)+degree*(degree-1)//2>100000:continue
        neighbours=sorted(adj2[node]);gs=[conductance[tuple(sorted((node,n)))] for n in neighbours];total=sum(gs)
        if not math.isfinite(total) or total<=0:continue
        contributions=[(a,b,gs[i]*gs[j]/total) for i,a in enumerate(neighbours) for j,b in enumerate(neighbours) if j>i]
        if any(not math.isfinite(g) or g<=0 for _,_,g in contributions):continue
        for n in neighbours:conductance.pop(tuple(sorted((node,n))));adj2[n].remove(node)
        adj2.pop(node);mesh_removed+=1
        for a,b,g in contributions:add(a,b,g)
        for n in neighbours:
            if n not in keep and len(adj2[n])<=8:heapq.heappush(heap,(len(adj2[n]),n))
    edges={}
    for (a,b),g in sorted(conductance.items()):
        while f'rmesh_equiv_{serial}' in names:serial+=1
        key=f'rmesh_equiv_{serial}';serial+=1;names.add(key);value=1/g
        if not math.isfinite(value) or value<=0:raise EDAError('EXTRACTION_INVALID','Exact network reduction generated an unrepresentable positive resistance.')
        edges[key]=(a,b,value,f'{key} {a} {b} {value:.17g}')
    # Original non-resistor device statements are exactly preserved, merely
    # relocated inside the same top definition for deterministic output.
    pre=[line for line in others if not line.split() or line.lstrip().startswith('*')]
    body=[line for line in others if line not in pre]
    output='\n'.join([*pre,start,*body,*[e[3] for key,e in sorted(edges.items())],finish])+'\n'
    return output,{'method':'exact-resistor-star-mesh-v2','resistors_before':initial,'resistors_after':len(edges),'eliminated_unobserved_nodes':removed+mesh_removed,'passive_closed_loops_removed':loops,'capacitors_changed':0,'protected_nodes':len(keep),'max_elimination_degree':8,'max_fill_edges':100000,'approximation':False}

def prepare(project,source,folder):
    source=Path(source);text=source.read_text();flat=digital_units.flattened(project['schematic'])
    protected=set(project['ports'])|{n for d in flat['devices'] for n in d['pins'].values()}
    reduced,report=reduce_text(text,protected)
    dest=Path(folder)/'pex-simulation.spice';dest.write_text(reduced)
    report.update(original_path=str(source),original_sha256=hashlib.sha256(text.encode()).hexdigest(),simulation_path=str(dest),simulation_sha256=hashlib.sha256(reduced.encode()).hexdigest(),implementation_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),scope='Original PEX retained. Ports, logical nets and every capacitive/device terminal preserved; no spatial RC map is inferred.')
    audit=Path(folder)/'pex-reduction.json';audit.write_text(json.dumps(report,indent=2)+'\n')
    return dest,audit,report
