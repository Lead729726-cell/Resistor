import { useEffect, useState } from 'react';
import { rpc, type Project, type SchematicCommand } from '@mos/contracts';
import GuidedPages from './GuidedPages';

export type TestbenchDraft={projectId:string;revision:number;settings:Settings;step:number};
interface Props { draft?:TestbenchDraft;onDraft?:(draft:TestbenchDraft|null)=>void; project: Project; readOnly?: boolean; onCommand: (command: SchematicCommand) => Promise<void>; onSaved: (analysis: string) => void; }
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
export default function TestbenchEditor({ project, draft, onDraft, readOnly = false, onCommand, onSaved }: Props) {
  const adc=/^(sigma_delta(?:8|16)|sdm(?:8|16)_|sar_adc(?:8|12|16)|sar(?:8|12|16)_|pipeline(?:_adc16|16_)|adc16_)/.test(String(project.design_template?.id||''));
  const visibleFields=fields.filter(f=>!adc||!['load_F','vds_V','vbs_V'].includes(f.key)).map(f=>adc&&f.key==='duration_s'?{...f,unit:'ms',factor:1e-3,min:.016,max:20}:adc&&f.key==='step_s'?{...f,unit:'ns',factor:1e-9,min:.001,max:125}:f);
  const [settings, setSettings] = useState<Settings>(draft?.projectId===project.id?draft.settings:project.testbench || {});
  const [corners, setCorners] = useState<string[]>(['tt']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [initialRevision] = useState(draft?.projectId===project.id?draft.revision:project.revision);
  const [step,setStep]=useState(draft?.projectId===project.id?draft.step:0);
  useEffect(()=>{if(!saved)onDraft?.({projectId:project.id,revision:initialRevision,settings,step});},[settings,step,saved,project.id,initialRevision,onDraft]);
  useEffect(() => { let canceled = false; void rpc<{ supported_corners?: string[] }>('pdk.capabilities').then(capabilities => { if (!canceled && capabilities.supported_corners?.length) setCorners(capabilities.supported_corners); }).catch(cause => { if (!canceled) setError(cause instanceof Error ? cause.message : String(cause)); }); return () => { canceled = true; }; }, []);
  const invalid=visibleFields.find(field=>settings[field.key]!==undefined&&(!Number.isFinite(Number(settings[field.key]))||Number(settings[field.key])/field.factor<field.min||Number(settings[field.key])/field.factor>field.max));
  const apply = async () => { if(readOnly||busy||invalid)return;setBusy(true); setError(null); setSaved(false); try { await onCommand({ type: 'update_testbench', settings }); onSaved(String(settings.analysis || 'tran')); setSaved(true); onDraft?.(null); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); } };
  const inputs=(keys:string[])=>visibleFields.filter(field=>keys.includes(field.key)).map(field=><label key={field.key}><span>{field.name}<small>{field.unit}</small></span><input data-testid={`testbench-${field.key}`} aria-label={field.name} disabled={readOnly||busy} type="number" step="any" min={field.min} max={field.max} value={settings[field.key] === undefined ? '' : Number((Number(settings[field.key]) / field.factor).toPrecision(10))} placeholder="worker default" onChange={event => { const value = event.target.value;setSaved(false); setSettings(current => { const next = { ...current }; if (!value) delete next[field.key]; else next[field.key] = Number(value) * field.factor; return next; }); }}/></label>);
  return <div className="testbench-editor"><div className="testbench-context"><span className="tag">{project.pdk_id}</span><strong>{project.cell}</strong><span className="mono">r{project.revision}</span><span>{readOnly ? '읽기 전용' : '실제 SPICE testbench에 적용'}</span></div>{project.revision !== initialRevision && !saved && <p className="testbench-revision-note">프로젝트 revision이 바뀌었습니다. 입력은 유지됩니다. 적용 전에 현재 설계와 조건을 확인하세요.</p>}{error && <div className="inline-error" role="alert">{error}</div>}{invalid&&<p role="alert">{invalid.name}: {invalid.min}–{invalid.max} {invalid.unit} 범위의 유한한 값을 입력하세요.</p>}
    <GuidedPages id="testbench-guided" step={step} onStep={setStep} nextDisabled={busy||!!invalid} pages={[
      {title:'어떤 해석을 준비할까요?',description:'해석 종류와 공정 모델 코너를 선택합니다.',content:<div className="testbench-fields"><label><span>Analysis</span><select data-testid="testbench-analysis" disabled={readOnly||busy} value={settings.analysis || 'tran'} onChange={event => {setSaved(false);setSettings(current => ({ ...current, analysis: event.target.value as Settings['analysis'] }));}}><option value="tran">Transient</option>{!adc&&<><option value="dc">DC sweep</option><option value="ac">AC small signal</option><option value="op">Operating point</option></>}</select></label><label><span>Model corner</span><select data-testid="testbench-corner" disabled={readOnly||busy} value={settings.corner || 'tt'} onChange={event => {setSaved(false);setSettings(current => ({ ...current, corner: event.target.value }));}}>{corners.map(corner => <option key={corner} value={corner}>{corner.toUpperCase()}</option>)}</select></label></div>},
      {title:'전원과 동작 환경',description:'전원·온도와 필요한 MOS 바이어스를 설정합니다.',content:<div className="testbench-fields">{inputs(['supply_V','temperature_C','vds_V','vbs_V'])}</div>},
      {title:'관찰 시간과 출력 부하',description:'시간·간격·용량 단위를 확인하세요. 빈 값은 엔진 기본값을 사용합니다.',content:<div className="testbench-fields">{inputs(['duration_s','step_s','load_F'])}</div>},
      {title:'해석 조건 확인',description:'조건을 저장한 뒤 실행 화면에서 해석을 시작합니다.',content:<><div className="testbench-fields"><p>Analysis <strong>{settings.analysis||'tran'}</strong></p><p>Corner <strong>{String(settings.corner||'tt').toUpperCase()}</strong></p></div><table className="guided-review-table"><tbody>{visibleFields.map(field=><tr key={field.key}><th>{field.name}</th><td>{settings[field.key]===undefined?'엔진 기본값':`${Number((Number(settings[field.key])/field.factor).toPrecision(10))} ${field.unit}`}</td></tr>)}</tbody></table><p className="testbench-subset-note">검증된 공정 model과 선언된 testbench 설정을 사용합니다. 각 run manifest에 실제 설정이 저장되며 pre/post 비교는 동일 조건에서 수행해야 합니다.</p><button className="button primary full" data-testid="testbench-apply" disabled={readOnly||busy||!!invalid} onClick={()=>void apply()}>{busy?'검증 및 적용 중…':'조건 저장 / Apply'}</button>{saved&&<div className="testbench-saved" role="status">worker가 설정을 저장했습니다. 실행 화면에서 실제 analysis를 시작하세요.</div>}</>}
    ]}/>
  </div>;
}
