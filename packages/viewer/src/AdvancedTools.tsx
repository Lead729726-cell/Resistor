import { useState } from 'react';
import type { LayoutCommand, Scene } from '@mos/contracts';
import { decimalCoordinate } from './geometry';

export function parsePoints(text: string, minimum = 2): [string, string][] {
  const points = text.trim().split(/\n|;/).filter(Boolean).map(line => {
    const values = line.trim().split(/[,\s]+/);
    if (values.length !== 2) throw new Error('각 꼭짓점은 X,Y DBU 정수 한 쌍입니다.');
    return values.map(value => String(decimalCoordinate(value))) as [string, string];
  });
  if (points.length < minimum) throw new Error(`최소 ${minimum}개 꼭짓점이 필요합니다.`);
  return points;
}
function parseHoles(text: string): [string, string][][] {
  if (!text.trim()) return [];
  const rings = JSON.parse(text);
  if (!Array.isArray(rings)) throw new Error('Holes는 JSON ring 배열입니다.');
  return rings.map(ring => {
    if (!Array.isArray(ring) || ring.length < 3) throw new Error('Hole ring은 최소 3개 점입니다.');
    return ring.map(point => {
      if (!Array.isArray(point) || point.length !== 2 || point.some(value => typeof value !== 'string')) throw new Error('Hole DBU 좌표는 decimal string 쌍입니다.');
      return point.map(value => String(decimalCoordinate(value))) as [string, string];
    });
  });
}

export function AdvancedTools({ scene, selection, onCommand, readOnly, pending, onClose }: { scene: Scene; selection: string | null; onCommand: (command: LayoutCommand) => Promise<void>; readOnly?: boolean; pending?: boolean; onClose: () => void }) {
  const [tool, setTool] = useState<'polygon'|'path'|'label'|'pin'|'instance'|'transform'|'cell'>('polygon');
  const [target, setTarget] = useState(scene.cells?.[0]?.name ?? '');
  const [layer, setLayer] = useState(scene.layers.find(layer => layer.id === '68/20')?.id ?? scene.layers[0]?.id ?? '');
  const [points, setPoints] = useState('0,0\n1000,0\n1000,1000\n0,1000');
  const [holes, setHoles] = useState('');
  const [name, setName] = useState('PIN');
  const [net, setNet] = useState('');
  const [x, setX] = useState('0'), [y, setY] = useState('0'), [x2, setX2] = useState('1000'), [y2, setY2] = useState('1000');
  const [width, setWidth] = useState('200');
  const [cell, setCell] = useState(scene.cells?.find(cell => cell.name !== target)?.name ?? target);
  const [instance, setInstance] = useState(scene.shapes.find(shape => shape.id === selection)?.instance_id ?? scene.instances?.[0]?.id ?? '');
  const [instanceAction,setInstanceAction]=useState<'transform'|'copy'|'delete'>('transform');
  const [rotation, setRotation] = useState<0|90|180|270>(0), [mirror, setMirror] = useState(false);
  const [columns, setColumns] = useState('1'), [rows, setRows] = useState('1'), [stepX, setStepX] = useState('2000'), [stepY, setStepY] = useState('2000');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const field = (label: string, value: string, setter: (value: string) => void) => <label>{label}<input aria-label={label} value={value} onChange={event => setter(event.target.value)}/></label>;
  const coordinate = (value: string) => String(decimalCoordinate(value));
  const submit = async () => {
    if (readOnly) return;
    setError(''); setBusy(true);
    try {
      const common = target ? { cell_name: target } : {};
      let command: LayoutCommand;
      if (tool === 'polygon') command = { type: 'add_polygon', layer_id: layer, polygon: parsePoints(points, 3), holes: parseHoles(holes), ...(net ? { net } : {}), ...common };
      else if (tool === 'path') command = { type: 'add_path', layer_id: layer, points: parsePoints(points), width: coordinate(width), ...(net ? { net } : {}), ...common };
      else if (tool === 'label') command = { type: 'add_label', layer_id: layer, text: name, position: [coordinate(x), coordinate(y)], ...(net ? { net } : {}), ...common };
      else if (tool === 'pin') command = { type: 'add_pin', layer_id: layer, name, box: [coordinate(x),coordinate(y),coordinate(x2),coordinate(y2)], ...(net ? { net } : {}), ...common };
      else if (tool === 'instance') {
        const nc = Number(columns), nr = Number(rows);
        if (!Number.isSafeInteger(nc) || !Number.isSafeInteger(nr) || nc < 1 || nr < 1) throw new Error('Array 행/열은 양의 정수입니다.');
        command = { type: 'add_instance', cell_name: cell, ...(target ? { target_cell_name: target } : {}), position: [coordinate(x),coordinate(y)], rotation, mirror,
          ...(nc !== 1 || nr !== 1 ? { array: { columns: nc, rows: nr, dx: coordinate(stepX), dy: coordinate(stepY) } } : {}) };
      } else if (tool === 'transform') command = instanceAction==='delete'?{type:'delete_instance',id:instance}:instanceAction==='copy'?{type:'copy_instance',id:instance,dx:coordinate(x),dy:coordinate(y)}:{ type: 'transform_instance', id: instance, rotation, mirror, dx: coordinate(x), dy: coordinate(y) };
      else command = { type: 'add_cell', name };
      await onCommand(command);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  return <div className="mos-advanced-tools" aria-label="고급 정수 레이아웃 도구">
    <div className="mos-advanced-heading"><strong>LAYOUT COMMANDS · 정수 DBU</strong><select aria-label="레이아웃 도구 종류" value={tool} onChange={event => setTool(event.target.value as typeof tool)}><option value="polygon">Polygon / holes</option><option value="path">Path</option><option value="label">Label</option><option value="pin">Pin</option><option value="instance">Instance / Array</option><option value="transform">Instance transform</option><option value="cell">Cell 생성</option></select><button onClick={onClose}>도구 닫기</button></div>
    <div className="mos-advanced-fields">
      {tool !== 'cell' && tool !== 'transform' && <label>편집 cell<select aria-label="편집 cell" value={target} onChange={event => setTarget(event.target.value)}>{scene.cells?.map(cell => <option key={cell.name} value={cell.name}>{cell.name}</option>)}</select></label>}
      {['polygon','path','label','pin'].includes(tool) && <label>Layer<select aria-label="Layer" value={layer} onChange={event => setLayer(event.target.value)}>{scene.layers.map(layer => <option key={layer.id} value={layer.id}>{layer.name}</option>)}</select></label>}
      {(tool === 'polygon' || tool === 'path') && <label>꼭짓점 X,Y (줄마다 DBU)<textarea aria-label="꼭짓점 X,Y (줄마다 DBU)" value={points} onChange={event => setPoints(event.target.value)} rows={4}/></label>}
      {tool === 'polygon' && <label>Holes JSON (선택)<textarea aria-label="Holes JSON (선택)" value={holes} onChange={event => setHoles(event.target.value)} placeholder={'[[["200","200"],["800","200"],["800","800"],["200","800"]]]'} rows={4}/></label>}
      {tool === 'path' && field('Path 폭 DBU',width,setWidth)}
      {['label','pin','cell'].includes(tool) && field(tool === 'label' ? 'Label text' : tool === 'cell' ? '새 Cell 이름' : 'Pin 이름',name,setName)}
      {['polygon','path','label','pin'].includes(tool) && field('연결 Net (선택)',net,setNet)}
      {['label','pin','instance','transform'].includes(tool) && <>{field(tool === 'transform' ? 'Instance ΔX' : '배치 X',x,setX)}{field(tool === 'transform' ? 'Instance ΔY' : '배치 Y',y,setY)}</>}
      {tool === 'pin' && <>{field('Pin X₂',x2,setX2)}{field('Pin Y₂',y2,setY2)}</>}
      {tool === 'instance' && <><label>원본 Cell<select aria-label="원본 Cell" value={cell} onChange={event => setCell(event.target.value)}>{scene.cells?.map(cell => <option key={cell.name} value={cell.name}>{cell.name}</option>)}</select></label>{field('Array 열',columns,setColumns)}{field('Array 행',rows,setRows)}{field('Array ΔX DBU',stepX,setStepX)}{field('Array ΔY DBU',stepY,setStepY)}</>}
      {tool==='transform'&&<label>Instance 작업<select aria-label="Instance 작업" value={instanceAction} onChange={event=>setInstanceAction(event.target.value as typeof instanceAction)}><option value="transform">이동 / 회전 / Mirror</option><option value="copy">복사</option><option value="delete">삭제</option></select></label>}
      {tool === 'transform' && <label>Instance ID<select aria-label="Instance ID" value={instance} onChange={event => setInstance(event.target.value)}>{scene.instances?.map(instance => <option key={instance.id} value={instance.id}>{instance.cell_path} · {instance.id}</option>)}</select></label>}
      {['instance','transform'].includes(tool) && <><label>절대 회전<select aria-label="절대 회전" value={rotation} onChange={event => setRotation(Number(event.target.value) as typeof rotation)}>{[0,90,180,270].map(value => <option key={value} value={value}>{value}°</option>)}</select></label><label className="mos-mirror-field"><input type="checkbox" checked={mirror} onChange={event => setMirror(event.target.checked)}/>Mirror X축 (절대)</label></>}
      <button disabled={readOnly || pending || busy} title={readOnly ? '읽기 전용 설계 · 편집 기능 비활성화' : 'worker validation → transaction → revision'} onClick={() => void submit()}>{busy ? 'worker 저장 중…' : '고급 명령 적용'}</button>
    </div>{error && <p className="mos-viewer-error" role="alert">{error}</p>}
    <small>설계 원본은 KLayout worker입니다. 공유 cell 변경은 모든 occurrence에 반영되며 backend가 순환 계층·좌표 overflow·grid를 검증합니다.</small>
  </div>;
}
