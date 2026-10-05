import { useEffect, useState } from 'react';
import { rpc, type Project, type SchematicCommand } from '@mos/contracts';

interface Props { project: Project; readOnly?: boolean; onCommand: (command: SchematicCommand) => Promise<void>; onSaved: (analysis: string) => void; }
type Settings = NonNullable<Project['testbench']>;
const fields = [
  { key: 'supply_V', name: 'Supply / 전원', unit: 'V', factor: 1, min: .1, max: 1.8 },
  { key: 'temperature_C', name: 'Temperature', unit: '°C', factor: 1, min: -40, max: 125 },
  { key: 'duration_s', name: 'Transient duration', unit: 'ns', factor: 1e-9, min: .001, max: 1e6 },
  { key: 'step_s', name: 'Transient step', unit: 'ps', factor: 1e-12, min: .001, max: 1e9 },
  { key: 'load_F', name: 'Output load', unit: 'fF', factor: 1e-15, min: 0, max: 1e6 },
  { key: 'vds_V', name: 'MOS Vds bias', unit: 'V', factor: 1, min: 0, max: 1.8 },
  { key: 'vbs_V', name: 'MOS Vbs bias', unit: 'V', factor: 1, min: -1.8, max: 0 },
] as const;
export default function TestbenchEditor({ project, readOnly = false, onCommand, onSaved }: Props) {
  const [settings, setSettings] = useState<Settings>(project.testbench || {});
  const [corners, setCorners] = useState<string[]>(['tt']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [initialRevision] = useState(project.revision);
  useEffect(() => { let canceled = false; void rpc<{ supported_corners?: string[] }>('pdk.capabilities').then(capabilities => { if (!canceled && capabilities.supported_corners?.length) setCorners(capabilities.supported_corners); }).catch(cause => { if (!canceled) setError(cause instanceof Error ? cause.message : String(cause)); }); return () => { canceled = true; }; }, []);
  const apply = async () => { setBusy(true); setError(null); setSaved(false); try { await onCommand({ type: 'update_testbench', settings }); onSaved(String(settings.analysis || 'tran')); setSaved(true); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); } };
  return <div className="testbench-editor"><div className="testbench-context"><span className="tag">{project.pdk_id}</span><strong>{project.cell}</strong><span className="mono">r{project.revision}</span><span>{readOnly ? '읽기 전용' : '실제 SPICE testbench에 적용'}</span></div>{project.revision !== initialRevision && !saved && <p className="testbench-revision-note">프로젝트 revision이 바뀌었습니다. 입력은 유지됩니다. 적용 전에 현재 설계와 조건을 확인하세요.</p>}{error && <div className="inline-error" role="alert">{error}</div>}<div className="testbench-fields"><label><span>Analysis</span><select data-testid="testbench-analysis" disabled={readOnly} value={settings.analysis || 'tran'} onChange={event => setSettings(current => ({ ...current, analysis: event.target.value as Settings['analysis'] }))}><option value="tran">Transient</option><option value="dc">DC sweep</option><option value="ac">AC small signal</option><option value="op">Operating point</option></select></label><label><span>Model corner</span><select data-testid="testbench-corner" disabled={readOnly} value={settings.corner || 'tt'} onChange={event => setSettings(current => ({ ...current, corner: event.target.value }))}>{corners.map(corner => <option key={corner} value={corner}>{corner.toUpperCase()}</option>)}</select></label>{fields.map(field => <label key={field.key}><span>{field.name}<small>{field.unit}</small></span><input data-testid={`testbench-${field.key}`} aria-label={field.name} disabled={readOnly} type="number" step="any" min={field.min} max={field.max} value={settings[field.key] === undefined ? '' : Number((Number(settings[field.key]) / field.factor).toPrecision(10))} placeholder="worker default" onChange={event => { const value = event.target.value; setSettings(current => { const next = { ...current }; if (!value) delete next[field.key]; else next[field.key] = Number(value) * field.factor; return next; }); }}/></label>)}</div><p className="testbench-subset-note">검증된 공정 model과 선언된 testbench 설정을 사용합니다. 각 run manifest에 실제 설정이 저장되며 pre/post 비교는 동일 조건에서 수행해야 합니다.</p><button className="button primary full" data-testid="testbench-apply" disabled={readOnly || busy} onClick={() => void apply()}>{busy ? '검증 및 적용 중…' : 'Testbench 적용'}</button>{saved && <div className="testbench-saved" role="status">worker가 설정을 저장했습니다. Simulation에서 실제 analysis를 실행하세요.</div>}</div>;
}
