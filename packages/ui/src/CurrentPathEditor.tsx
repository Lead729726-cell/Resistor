import { useEffect, useState } from 'react';
import type { CurrentFlow, Scene } from '@mos/contracts';
import './pdk-setup.css';

export default function CurrentPathEditor({ flow, scene, onChange }: { flow: CurrentFlow; scene: Scene; onChange: (flow: CurrentFlow) => void }) {
  const [branchId, setBranchId] = useState(flow.branches[0]?.id || '');
  const branch = flow.branches.find(item => item.id === branchId);
  const [layer, setLayer] = useState(scene.layers[0]?.id || '');
  const [path, setPath] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (!flow.branches.some(item => item.id === branchId)) setBranchId(flow.branches[0]?.id || ''); }, [flow, branchId]);
  useEffect(() => { setPath(branch?.path_dbu?.map(point => point.join(', ')).join('\n') || ''); setLayer(branch?.layer_id || scene.layers[0]?.id || ''); setConfirmed(false); setError(''); }, [branchId, flow.run_id]);
  const apply = () => { try {
    if (!branch || !confirmed) throw new Error('실제 branch 선택과 사용자 경로 확인이 필요합니다.');
    const points = path.trim().split(/[\n;]/).filter(line => line.trim()).map(line => { const values = line.trim().split(/[,\s]+/); if (values.length !== 2 || !values.every(value => /^-?\d{1,19}$/.test(value) && BigInt(value) >= -9223372036854775808n && BigInt(value) <= 9223372036854775807n)) throw new Error('각 행에는 X, Y의 signed int64 DBU 정수 두 개를 입력하세요.'); return values as [string, string]; });
    if (points.length < 2 || points.length > 4096 || points.some((point, index) => index > 0 && point[0] === points[index - 1][0] && point[1] === points[index - 1][1])) throw new Error('서로 다른 점을 2–4096개 입력하세요.');
    if (!scene.layers.some(item => item.id === layer)) throw new Error('실제 표시 layer를 선택하세요.');
    onChange({ ...flow, branches: flow.branches.map(item => item.id === branch.id ? { ...item, device_id: undefined, path_dbu: points, layer_id: layer, mapping: 'user_path' } : item), notes: [...new Set([...(flow.notes || []), `${branch.name}: 사용자가 지정한 표시 경로입니다. GDS의 물리 도통 경로·전류 밀도는 검증되지 않았습니다. 원본 ${branch.source_vector} A 샘플은 유지됩니다.`])] }); setConfirmed(false); setError('');
  } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } };
  return <div className="current-path-editor" data-testid="current-path-editor"><p className="pdk-setup-note">실제 결과 branch에 표시 경로를 연결합니다. 원본 전류 샘플·부호·출처를 보존하며, 물리적인 도통 경로를 자동 추론하지 않습니다.</p>{flow.geometry_linkage === 'unverified' && <p className="pdk-setup-note">전류와 GDS의 물리적 대응 미검증 · 사용자 표시 경로를 적용해도 이 상태는 유지됩니다.</p>}<label>전류 branch<select aria-label="경로 편집 전류 branch" data-testid="path-branch" value={branchId} onChange={event => setBranchId(event.target.value)}>{flow.branches.map(item => <option key={item.id} value={item.id}>{item.name} · {item.source_vector}</option>)}</select></label>{branch && <div className="current-path-metadata"><strong>{branch.from_net} → {branch.to_net}</strong><br/>{branch.source_vector} · {flow.source} · {flow.analysis} · r{flow.revision} · {branch.values_A.length} actual samples</div>}<label>표시 layer<select aria-label="전류 경로 layer" data-testid="path-layer" value={layer} onChange={event => { setLayer(event.target.value); setConfirmed(false); }}>{scene.layers.map(item => <option key={item.id} value={item.id}>{item.name} · {item.gds.join('/')}</option>)}</select></label><label>DBU polyline · 한 줄에 X, Y<textarea aria-label="전류 경로 DBU polyline" data-testid="path-points" value={path} placeholder={'0, 0\n1000, 0\n1000, 2000'} onChange={event => { setPath(event.target.value); setConfirmed(false); }}/></label><label className="current-path-confirm"><input type="checkbox" data-testid="path-confirm" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/>사용자 지정 표시 경로임을 확인합니다. 원본 layout 대응과 물리 도통은 검증되지 않았습니다.</label>{error && <div className="inline-error" role="alert">{error}</div>}<div className="current-path-actions"><button className="button primary" data-testid="path-apply" disabled={!branch || !confirmed} onClick={apply}>표시 경로 적용</button><button className="button" disabled={!branch} onClick={() => { onChange({ ...flow, branches: flow.branches.map(item => item.id === branch?.id ? { ...item, path_dbu: undefined, layer_id: undefined, mapping: 'unmapped' } : item) }); setPath(''); setConfirmed(false); }}>경로 제거 · 수치 유지</button></div></div>;
}

