import {useEffect,useState} from 'react';
import type {Scene,SceneShape,LayoutCommand} from '@mos/contracts';
import {lengthToDbu,dbuToLength} from '../../viewer/src/drawing';

function bounds(shape:SceneShape):[string,string,string,string]{
  const xs=shape.polygon.map(p=>BigInt(p[0])),ys=shape.polygon.map(p=>BigInt(p[1]));
  const min=(v:bigint[])=>v.reduce((a,b)=>a<b?a:b),max=(v:bigint[])=>v.reduce((a,b)=>a>b?a:b);
  return [min(xs),min(ys),max(xs),max(ys)].map(String) as [string,string,string,string];
}
export function ShapeInspector({shape,scene,readOnly,lockedLayers=[],onCommand}:{shape:SceneShape;scene:Scene;readOnly?:boolean;lockedLayers?:string[];onCommand:(command:LayoutCommand)=>Promise<void>}){
  const [unit,setUnit]=useState<'um'|'dbu'>('um'),[coordinates,setCoordinates]=useState<string[]>([]),[layer,setLayer]=useState(shape.layer_id),[net,setNet]=useState(shape.net??''),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [offset,setOffset]=useState(['1','1']);
  const box=bounds(shape),root=!shape.cell_path.includes('/'),editable=root&&!readOnly&&!lockedLayers.includes(shape.layer_id);
  useEffect(()=>{setCoordinates(bounds(shape).map(v=>unit==='um'?dbuToLength(v,scene.dbu_um):v));setLayer(shape.layer_id);setNet(shape.net??'');setDirty(false);setError('');},[shape.id,scene.revision]);
  const run=async(command:LayoutCommand)=>{setBusy(true);setError('');try{await onCommand(command);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
  const save=()=>{
    try{
      const b=coordinates.map(v=>lengthToDbu(v,unit,scene.dbu_um,scene.grid_dbu??1)) as [string,string,string,string];
      if(lockedLayers.includes(layer))throw Error('잠긴 레이어로 변경할 수 없습니다.');
      if(BigInt(b[0])>=BigInt(b[2])||BigInt(b[1])>=BigInt(b[3]))throw Error('X₂ > X₁, Y₂ > Y₁이어야 합니다.');
      void run({type:'update_box',id:shape.id,box:b,layer_id:layer,net});
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  };
  const transform=(copy:boolean)=>{try{const [dx,dy]=offset.map(v=>lengthToDbu(v,'um',scene.dbu_um,scene.grid_dbu??1));if(dx==='0'&&dy==='0'&&!copy)throw Error('이동할 거리를 입력하세요.');void run({type:copy?'copy_shape':'move_shape',id:shape.id,dx,dy});}catch(e){setError(e instanceof Error?e.message:String(e));}};
  return <div className="shape-inspector" data-testid="shape-inspector">
    <div className="inspector-subhead">SELECTED SHAPE <span>{shape.shape_type??'geometry'}</span></div>
    <strong>{scene.layers.find(l=>l.id===shape.layer_id)?.name??shape.layer_id}</strong>
    <dl><dt>Stable ID</dt><dd>{shape.id}</dd><dt>Cell path</dt><dd>{shape.cell_path}</dd><dt>Net</dt><dd>{shape.net||'Unmapped'}</dd><dt>Vertices</dt><dd>{shape.polygon.length}</dd><dt>크기</dt><dd>{dbuToLength(String(BigInt(box[2])-BigInt(box[0])),scene.dbu_um)} × {dbuToLength(String(BigInt(box[3])-BigInt(box[1])),scene.dbu_um)} µm</dd></dl>
    {shape.shape_type==='box'&&<><div className="inspector-subhead">사각형 속성 <select aria-label="도형 좌표 단위" value={unit} disabled={busy} onChange={e=>{try{const u=e.target.value as typeof unit;setCoordinates(coordinates.map(v=>{const dbu=lengthToDbu(v,unit,scene.dbu_um);return u==='um'?dbuToLength(dbu,scene.dbu_um):dbu;}));setUnit(u);setError('');}catch(e){setError(e instanceof Error?e.message:String(e));}}}><option value="um">µm</option><option value="dbu">DBU</option></select></div><div className="parameter-list">{['X₁','Y₁','X₂','Y₂'].map((label,i)=><label key={label}><span>{label}<small>{unit==='um'?'µm':'DBU'}</small></span><input aria-label={`사각형 ${['X1','Y1','X2','Y2'][i]}`} value={coordinates[i]??''} disabled={!editable||busy} inputMode="decimal" onChange={e=>{setCoordinates(c=>c.map((v,j)=>j===i?e.target.value:v));setDirty(true);}}/></label>)}<label><span>레이어</span><select aria-label="사각형 레이어" value={layer} disabled={!editable||busy} onChange={e=>{setLayer(e.target.value);setDirty(true);}}>{scene.layers.map(l=><option key={l.id} value={l.id} disabled={lockedLayers.includes(l.id)}>{l.name}</option>)}</select></label><label><span>Net</span><input aria-label="사각형 Net" value={net} disabled={!editable||busy} onChange={e=>{setNet(e.target.value);setDirty(true);}}/></label></div><button className="button primary full" disabled={!editable||busy||!dirty} onClick={save}>사각형 변경 적용</button></>}
    <div className="inspector-subhead">이동 · 도형 복사</div><div className="parameter-list">{['ΔX','ΔY'].map((label,i)=><label key={label}><span>{label}<small>µm</small></span><input aria-label={`도형 복사 ${i?'Y':'X'}`} inputMode="decimal" value={offset[i]} disabled={!editable||busy} onChange={e=>setOffset(v=>v.map((x,j)=>j===i?e.target.value:x))}/></label>)}</div><div className="exchange-actions"><button className="button small" disabled={!editable||busy} onClick={()=>transform(false)}>이동 적용</button><button className="button small" disabled={!editable||busy} onClick={()=>transform(true)}>도형 복사</button></div>
    {error&&<p className="inline-error" role="alert">{error}</p>}
    <div className="inspector-note">{!root?'공유 하위 셀·PCell 도형은 이 화면에서 수정하지 않습니다. 계층 셀을 명시적으로 열어 편집하세요.':'좌표는 정수 DBU·프로젝트 격자에 맞춰 저장합니다. 도형 복사는 마스크만 복사하므로 회로와 연결은 별도로 확인하세요.'}</div>
    <button className="button danger full" disabled={!editable||busy} onClick={()=>void run({type:'delete_shape',id:shape.id})}>도형 삭제 / Delete</button>
  </div>;
}
