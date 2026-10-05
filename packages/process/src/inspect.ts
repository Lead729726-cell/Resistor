import { PROCESS_LIMITS, centre, cross, dot, sub, tetVolume, validateVolume, type ProcessVolume, type Vec3 } from './model';
export interface ProcessCriteria { min_thickness_um:number; min_coverage_ratio:number;by_material?:Record<string,{min_thickness_um:number;min_coverage_ratio:number}> }
export interface ProcessFace { nodes:[number,number,number]; cell:number; neighbor?:number }
export interface ProcessIssue { kind:'thin'|'low-coverage'|'uncovered'|'unknown';cell:number;cell_id:string;material_id:number;thickness_um:number|null;coverage_ratio:number|null }
export interface ProcessInspection {
  kind:'register-process-inspection';criteria:ProcessCriteria;inspected_cells:number;film_cells:number;
  assessed_film_cells:number;unknown_thickness_cells:number;unknown_coverage_cells:number;
  min_thickness_um:number|null;min_coverage_ratio:number|null;issues:ProcessIssue[];
  voids:{cells:number[];closed:boolean;volume_um3:number}[];faces:ProcessFace[];
  domain_volume_um3:number;mesh_volume_um3:number;unmeshed_volume_um3:number;
  complete_input:boolean;scope:'device'|'roi';status:'findings'|'incomplete'|'reviewed-input';
  source_kind:ProcessVolume['provenance']['kind'];physical_prediction:false;overlap_pairs_checked:number;
}
export const FACE_NODES=[[1,2,3],[0,3,2],[0,1,3],[0,2,1]] as const;
const EDGES=[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]] as const;
/** Separating-axis test includes all tetrahedral faces and edge cross products. Touching is permitted. */
export function tetraOverlap(a:Vec3[],b:Vec3[]) {
  const origin=a[0];a=a.map(p=>sub(p,origin));b=b.map(p=>sub(p,origin));
  const axes=[...a.map((_,i)=>cross(sub(a[FACE_NODES[i][1]],a[FACE_NODES[i][0]]),sub(a[FACE_NODES[i][2]],a[FACE_NODES[i][0]]))),...b.map((_,i)=>cross(sub(b[FACE_NODES[i][1]],b[FACE_NODES[i][0]]),sub(b[FACE_NODES[i][2]],b[FACE_NODES[i][0]])))];
  for(const [i,j] of EDGES)for(const [k,l] of EDGES)axes.push(cross(sub(a[j],a[i]),sub(b[l],b[k])));
  const tolerance=Math.max(...[...a,...b].map(p=>Math.hypot(...p)))*1e-10;
  for(const axis of axes){const length=Math.hypot(...axis);if(length<1e-24)continue;const n=axis.map(v=>v/length) as Vec3,ap=a.map(p=>dot(p,n)),bp=b.map(p=>dot(p,n));if(Math.min(Math.max(...ap),Math.max(...bp))-Math.max(Math.min(...ap),Math.min(...bp))<=tolerance)return false;}
  return true;
}
export function inspectVolume(input:ProcessVolume,criteria:ProcessCriteria):ProcessInspection {
  const volume=validateVolume(input);
  if(!Number.isFinite(criteria.min_thickness_um)||criteria.min_thickness_um<0||!Number.isFinite(criteria.min_coverage_ratio)||criteria.min_coverage_ratio<0||criteria.min_coverage_ratio>1)throw new Error('최소 두께는 0 이상, 피복률 기준은 0~100%이어야 합니다.');
  const materials=new Map(volume.materials.map(m=>[m.id,m]));
  for(const [id,limits] of Object.entries(criteria.by_material||{}))if(!materials.has(Number(id))||!Number.isFinite(limits.min_thickness_um)||limits.min_thickness_um<0||!Number.isFinite(limits.min_coverage_ratio)||limits.min_coverage_ratio<0||limits.min_coverage_ratio>1)throw new Error('재료별 검토 기준이 잘못됐습니다.');
  const boxes=volume.cells.map((cell,index)=>{const p=cell.vertices.map(i=>volume.points_um[i]);return {index,lo:[0,1,2].map(axis=>Math.min(...p.map(v=>v[axis]))),hi:[0,1,2].map(axis=>Math.max(...p.map(v=>v[axis])))};}).sort((a,b)=>a.lo[0]-b.lo[0]);
  let overlapPairs=0;const active:typeof boxes=[];
  for(const box of boxes){for(let i=active.length-1;i>=0;i--)if(active[i].hi[0]<=box.lo[0])active.splice(i,1);
    for(const other of active){if([1,2].some(axis=>other.hi[axis]<=box.lo[axis]||box.hi[axis]<=other.lo[axis]))continue;
      if(++overlapPairs>PROCESS_LIMITS.overlap_pairs)throw new Error('Mesh 중첩 검사 예산을 초과했습니다. 해상도/범위를 명시적으로 줄이세요. 부분 검사를 전체 통과로 표시하지 않습니다.');
      if(tetraOverlap(volume.cells[box.index].vertices.map(i=>volume.points_um[i]),volume.cells[other.index].vertices.map(i=>volume.points_um[i])))throw new Error(`사면체의 내부 부피가 겹칩니다: ${volume.cells[box.index].id} / ${volume.cells[other.index].id}`);
    }active.push(box);
  }
  const faceMap=new Map<string,ProcessFace[]>(),adjacency:number[][]=volume.cells.map(()=>[]),exterior=new Set<number>();
  let meshVolume=0;
  volume.cells.forEach((cell,index)=>{
    meshVolume+=tetVolume(cell.vertices.map(i=>volume.points_um[i]));
    FACE_NODES.forEach((indices,opposite)=>{const nodes=indices.map(i=>cell.vertices[i]) as [number,number,number],p=nodes.map(i=>volume.points_um[i]);
      if(dot(cross(sub(p[1],p[0]),sub(p[2],p[0])),sub(volume.points_um[cell.vertices[opposite]],p[0]))>0)[nodes[1],nodes[2]]=[nodes[2],nodes[1]];
      const key=[...nodes].sort((a,b)=>a-b).join(':'),entries=faceMap.get(key)||[];entries.push({nodes,cell:index});if(entries.length>2)throw new Error('한 face를 세 cell 이상이 공유하는 non-manifold mesh입니다.');faceMap.set(key,entries);
    });
  });
  const faces:ProcessFace[]=[];
  for(const entries of faceMap.values()){
    if(entries.length===1){faces.push(entries[0]);exterior.add(entries[0].cell);}
    else {const [a,b]=entries;adjacency[a.cell].push(b.cell);adjacency[b.cell].push(a.cell);
      if(volume.cells[a.cell].material_id!==volume.cells[b.cell].material_id)faces.push({...a,neighbor:b.cell},{...b,neighbor:a.cell});
    }
  }
  const issues:ProcessIssue[]=[],thickness:number[]=[],coverage:number[]=[];let film=0,unknownThickness=0,unknownCoverage=0;
  volume.cells.forEach((cell,index)=>{const material=materials.get(cell.material_id)!;if(material.role!=='film')return;film++;
    const limits=criteria.by_material?.[String(material.id)]||criteria;
    const ratio=cell.thickness_um!==null&&material.nominal_thickness_um!==undefined?cell.thickness_um/material.nominal_thickness_um:null;
    const issue=(kind:ProcessIssue['kind'])=>issues.push({kind,cell:index,cell_id:cell.id,material_id:cell.material_id,thickness_um:cell.thickness_um,coverage_ratio:ratio});
    if(cell.thickness_um===null){unknownThickness++;issue('unknown');}else {thickness.push(cell.thickness_um);if(cell.thickness_um===0)issue('uncovered');if(cell.thickness_um<limits.min_thickness_um)issue('thin');}
    if(ratio===null)unknownCoverage++;else {coverage.push(ratio);if(ratio<limits.min_coverage_ratio)issue('low-coverage');}
  });
  const seen=new Set<number>(),voids:ProcessInspection['voids']=[];
  volume.cells.forEach((cell,index)=>{if(materials.get(cell.material_id)!.role!=='void'||seen.has(index))return;
    const members:number[]=[],queue=[index];seen.add(index);let open=false,size=0;
    for(let head=0;head<queue.length;head++){const current=queue[head];members.push(current);open ||= exterior.has(current);size+=tetVolume(volume.cells[current].vertices.map(i=>volume.points_um[i]));
      for(const neighbor of adjacency[current])if(!seen.has(neighbor)&&materials.get(volume.cells[neighbor].material_id)!.role==='void'){seen.add(neighbor);queue.push(neighbor);}
    }voids.push({cells:members,closed:!open,volume_um3:size});
  });
  const [lo,hi]=volume.scope.domain_um,domainVolume=(hi[0]-lo[0])*(hi[1]-lo[1])*(hi[2]-lo[2]),unmeshed=Math.max(0,domainVolume-meshVolume);
  if(unmeshed<=domainVolume*1e-7)for(const entries of faceMap.values())if(entries.length===1){const nodes=entries[0].nodes.map(i=>volume.points_um[i]);if(![0,1,2].some(axis=>[lo[axis],hi[axis]].some(bound=>nodes.every(p=>Math.abs(p[axis]-bound)<=Math.max(1e-12,(hi[axis]-lo[axis])*1e-9)))))throw new Error('Domain을 채운 mesh의 내부에 접합되지 않은 face가 있습니다. Conforming mesh로 export하세요.');}
  const complete=volume.scope.kind==='device'&&unmeshed<=domainVolume*1e-7&&unknownThickness===0&&unknownCoverage===0&&film>0;
  const findings=issues.some(issue=>issue.kind!=='unknown')||voids.some(v=>v.closed);
  return {kind:'register-process-inspection',criteria:{...criteria},inspected_cells:volume.cells.length,film_cells:film,assessed_film_cells:thickness.length,unknown_thickness_cells:unknownThickness,unknown_coverage_cells:unknownCoverage,min_thickness_um:thickness.length?Math.min(...thickness):null,min_coverage_ratio:coverage.length?Math.min(...coverage):null,issues,voids,faces,domain_volume_um3:domainVolume,mesh_volume_um3:meshVolume,unmeshed_volume_um3:unmeshed,complete_input:complete,scope:volume.scope.kind,status:findings?'findings':complete?'reviewed-input':'incomplete',source_kind:volume.provenance.kind,physical_prediction:false,overlap_pairs_checked:overlapPairs};
}
export interface ProcessSection {cell:number;points:Vec3[]}
/** Exact linear tetra/plane intersections, not a single-valued height map. */
export function sectionVolume(volume:ProcessVolume,axis:0|1|2,position:number):ProcessSection[] {
  if(!Number.isFinite(position))throw new Error('단면 좌표가 유한해야 합니다.');
  const result:ProcessSection[]=[],tolerance=Math.max(1e-12,(volume.scope.domain_um[1][axis]-volume.scope.domain_um[0][axis])*1e-10);
  volume.cells.forEach((cell,index)=>{const vertices=cell.vertices.map(i=>volume.points_um[i]),points:Vec3[]=[];
    const add=(p:Vec3)=>{if(!points.some(q=>Math.hypot(...sub(p,q))<=tolerance))points.push(p);};
    vertices.forEach(p=>{if(Math.abs(p[axis]-position)<=tolerance)add([...p]);});
    for(const [a,b] of EDGES){const p=vertices[a],q=vertices[b],u=p[axis]-position,v=q[axis]-position;if(u*v<0){const t=u/(u-v);add([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1]),p[2]+t*(q[2]-p[2])]);}}
    if(points.length<3)return;
    const other=[0,1,2].filter(i=>i!==axis),mid=other.map(i=>points.reduce((sum,p)=>sum+p[i],0)/points.length);
    points.sort((a,b)=>Math.atan2(a[other[1]]-mid[1],a[other[0]]-mid[0])-Math.atan2(b[other[1]]-mid[1],b[other[0]]-mid[0]));result.push({cell:index,points});
  });return result;
}
export function processCsv(volume:ProcessVolume,report:ProcessInspection) {
  const quote=(v:unknown)=>`"${String(v??'').replaceAll('"','""')}"`;
  const header=['cell_id','material_id','material','role','region','x_um','y_um','z_um','thickness_um','coverage_ratio','issues','scope','source_kind'];
  const issues=new Map<number,string[]>();report.issues.forEach(issue=>issues.set(issue.cell,[...(issues.get(issue.cell)||[]),issue.kind]));
  return [header.join(','),...volume.cells.map((cell,index)=>{const material=volume.materials.find(m=>m.id===cell.material_id)!;return [cell.id,cell.material_id,material.name,material.role,cell.region,...centre(volume,index),cell.thickness_um,cell.thickness_um!==null&&material.nominal_thickness_um?cell.thickness_um/material.nominal_thickness_um:null,(issues.get(index)||[]).join('|'),volume.scope.kind,volume.provenance.kind].map(quote).join(',');})].join('\n');
}
