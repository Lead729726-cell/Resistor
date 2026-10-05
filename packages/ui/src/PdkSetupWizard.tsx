import { useEffect, useRef, useState } from 'react';
import { rpc, type AnalysisInspection, type AnalysisPort, type AnalysisSetup, type PdkManifest, type PdkProfile, type PdkValidation, type Project, type Run, type Scene, type SetupCheck } from '@mos/contracts';
import WavePlot from './WavePlot';
import './pdk-setup.css';

type Transport = typeof rpc;
interface Props {
  project?: Project | null;
  source?: { buffer: ArrayBuffer; name: string; topCell?: string; settings?: AnalysisSetup };
  transport?: Transport;
  shared?: boolean;
  readOnly?: boolean;
  engineUnavailableReason?: string;
  onOpenWorkspace?: () => void;
  onConfigured?: (project: Project) => void | Promise<void>;
  onRun?: (run: Run) => void | Promise<void>;
  onResult?: (run: Run, scene: Scene) => void | Promise<void>;
}
const blankManifest = (): PdkManifest => ({ schema_version: 1, id: 'my-process', name: 'My process', version: '', root: '', magic_rc: '', magic_tech: '', netgen_setup: '', model_file: '', model_mode: 'lib', corners: ['tt'], spice_scale: 1e-6, layer_file: '' });
const blankSettings = (cell = ''): AnalysisSetup => ({ profile_id: '', top_cell: cell, corner: 'tt', temperature_C: 27, ports: [], analysis: 'op', pex: false, start_V: 0, end_V: 1.8, step_V: .05, duration_s: 10e-9, step_s: 10e-12 });
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const active = (run: Run) => run.execution_status === 'running' || run.execution_status === 'queued';
const bytesBase64 = (buffer: ArrayBuffer) => { let text = ''; const bytes = new Uint8Array(buffer); for (let i = 0; i < bytes.length; i += 32768) text += String.fromCharCode(...bytes.subarray(i, i + 32768)); return btoa(text); };
const download = (value: unknown, name: string) => { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })), anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
const stamp = (project: Project | null | undefined, profile: string, cell: string, fingerprint: string) => `${project?.id}/${project?.revision}/${profile}/${fingerprint}/${cell}`;

function Checks({ checks }: { checks?: SetupCheck[] }) {
  return <div className="pdk-checks">{checks?.map((check, index) => <div key={`${check.name}-${index}`} data-check-status={check.status}><span className={`status ${check.status === 'warning' ? 'stale' : check.status}`}>{check.status.toUpperCase()}</span><strong>{check.name}</strong><span>{check.message}</span></div>)}</div>;
}
function validateManifest(value: unknown): PdkManifest {
  if (!value || typeof value !== 'object') throw new Error('PDK manifest JSON 객체가 필요합니다.');
  const candidate = value as PdkManifest;
  if (candidate.schema_version !== 1 || typeof candidate.id !== 'string' || !candidate.id.trim() || typeof candidate.name !== 'string' || typeof candidate.version !== 'string'
    || !['lib', 'include', 'sky130-subset'].includes(candidate.model_mode) || !Array.isArray(candidate.corners) || !candidate.corners.length || !candidate.corners.every(corner => typeof corner === 'string') || !Number.isFinite(candidate.spice_scale) || candidate.spice_scale <= 0) throw new Error('Manifest의 ID / version / model_mode / corners / spice_scale 형식을 확인하세요.');
  for (const key of ['root', 'magic_rc', 'magic_tech', 'netgen_setup', 'model_file', 'layer_file'] as const) if (candidate[key] !== undefined && typeof candidate[key] !== 'string') throw new Error(`${key}는 경로 문자열이어야 합니다.`);
  return candidate;
}
export function readAnalysisSetup(value: unknown): AnalysisSetup {
  if (!value || typeof value !== 'object') throw new Error('AnalysisSetup JSON 객체가 필요합니다.');
  const candidate = value as AnalysisSetup;
  if (typeof candidate.profile_id !== 'string' || typeof candidate.top_cell !== 'string' || typeof candidate.corner !== 'string' || !Number.isFinite(candidate.temperature_C) || !['op', 'dc', 'tran'].includes(candidate.analysis)
    || typeof candidate.pex !== 'boolean' || !Array.isArray(candidate.ports) || candidate.ports.some(port => !port || typeof port.name !== 'string' || !['ground', 'voltage', 'floating'].includes(port.mode) || !Number.isFinite(port.dc_V))) throw new Error('설정 JSON의 profile / cell / analysis / port 조건이 올바르지 않습니다.');
  if (candidate.reference_spice !== undefined && typeof candidate.reference_spice !== 'string') throw new Error('reference_spice는 SPICE 텍스트여야 합니다.');
  for (const key of ['start_V', 'end_V', 'step_V', 'duration_s', 'step_s'] as const) if (candidate[key] !== undefined && !Number.isFinite(candidate[key])) throw new Error(`${key}는 유한 숫자여야 합니다.`);
  const fields = ['profile_id', 'profile_hash', 'top_cell', 'corner', 'temperature_C', 'ports', 'analysis', 'sweep_port', 'start_V', 'end_V', 'step_V', 'duration_s', 'step_s', 'pex', 'reference_spice'] as const;
  return Object.fromEntries(fields.filter(key => candidate[key] !== undefined).map(key => [key, candidate[key]])) as unknown as AnalysisSetup;
}

export default function PdkSetupWizard({ project: suppliedProject, source, transport = rpc, shared = false, readOnly = false, engineUnavailableReason, onOpenWorkspace, onConfigured, onRun, onResult }: Props) {
  const [step, setStep] = useState(0);
  const [project, setProject] = useState<Project | null>(suppliedProject || null);
  const [profiles, setProfiles] = useState<PdkProfile[]>([]);
  const [manifest, setManifest] = useState<PdkManifest>(blankManifest);
  const [selectedProfile, setSelectedProfile] = useState(suppliedProject?.analysis_setup?.profile_id || source?.settings?.profile_id || '');
  const [manifestEdit, setManifestEdit] = useState(false);
  const [manifestName, setManifestName] = useState('');
  const [cornerText, setCornerText] = useState('tt');
  const [packageFile, setPackageFile] = useState<File | null>(null);
  const [validation, setValidation] = useState<PdkValidation | null>(null);
  const [inspection, setInspection] = useState<AnalysisInspection | null>(null);
  const [inspectionStamp, setInspectionStamp] = useState('');
  const [settings, setSettings] = useState<AnalysisSetup>(() => readAnalysisSetup(suppliedProject?.analysis_setup || source?.settings || blankSettings(source?.topCell || suppliedProject?.cell)));
  const [dirty, setDirty] = useState(false);
  const [referenceName, setReferenceName] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('PDK 경로와 리소스를 검증한 후 실제 GDS 포트를 검사하세요.');
  const [jobs, setJobs] = useState<Run[]>(suppliedProject?.analysis_setup ? suppliedProject.runs : []);
  const [selectedJob, setSelectedJob] = useState('');
  const [logs, setLogs] = useState('');
  const [refreshId, setRefreshId] = useState(0);
  const live = useRef(true);
  const projectRef = useRef(project); projectRef.current = project;
  const callbackRef = useRef({ onRun, onResult }); callbackRef.current = { onRun, onResult };
  const profile = profiles.find(item => item.id === selectedProfile);
  const fingerprint = validation?.fingerprint || validation?.profile?.fingerprint || profile?.fingerprint || '';
  const validProfile = !!validation?.valid && (validation.profile?.id || selectedProfile) === selectedProfile && !manifestEdit;
  const freshInspection = !!inspection && inspectionStamp === stamp(project, selectedProfile, settings.top_cell, fingerprint);
  const saved = !!project?.analysis_setup && !dirty && project.analysis_setup.profile_id === selectedProfile && !!fingerprint && project.analysis_setup.profile_hash === fingerprint;
  const forbidden = readOnly || !!busy || !!engineUnavailableReason;
  const update = (patch: Partial<AnalysisSetup>) => { setSettings(current => ({ ...current, ...patch })); setDirty(true); };
  const action = async (name: string, work: () => Promise<void>) => { setBusy(name); setError(''); try { await work(); } catch (cause) { if (live.current) setError(errorMessage(cause)); } finally { if (live.current) setBusy(''); } };

  useEffect(() => { live.current = true; if (engineUnavailableReason) return; let canceled = false;
    void transport<PdkProfile[]>('pdk.list_profiles').then(next => { if (canceled) return; setProfiles(next); const chosen = next.find(item => item.id === selectedProfile) || next.find(item => item.built_in && item.available !== false) || next[0];
      if (chosen) { setSelectedProfile(chosen.id); setManifest(chosen.manifest); setSettings(current => ({ ...current, profile_id: chosen.id, corner: chosen.manifest.corners.includes(current.corner) ? current.corner : chosen.manifest.corners[0] || '' })); }
    }).catch(cause => { if (!canceled) setError(`${errorMessage(cause)} · 해석에는 실행 중인 native EDA worker가 필요합니다. 뷰어 기능은 계속 사용할 수 있습니다.`); });
    return () => { canceled = true; };
  }, [transport, engineUnavailableReason, refreshId]);
  useEffect(() => () => { live.current = false; }, []);
  useEffect(() => { setCornerText(manifest.corners.join(', ')); }, [manifest.id, selectedProfile]);
  useEffect(() => { if (!suppliedProject) return; setProject(suppliedProject); if (!dirty && suppliedProject.analysis_setup) setSettings(readAnalysisSetup(suppliedProject.analysis_setup)); }, [suppliedProject, dirty]);

  const chooseProfile = (id: string) => { const chosen = profiles.find(item => item.id === id); setSelectedProfile(id); setValidation(null); setManifestEdit(false); if (chosen) setManifest(chosen.manifest); update({ profile_id: id, profile_hash: undefined, corner: chosen?.manifest.corners[0] || '' }); setNotice('Profile이 바뀌었습니다. PDK 검증과 포트 검사를 다시 실행하세요.'); };
  const validate = () => void action('PDK 리소스 검증 중', async () => { const result = await transport<PdkValidation>('pdk.validate', selectedProfile && !manifestEdit ? { profile_id: selectedProfile } : { manifest }); setValidation(result);
    if (result.profile) setProfiles(current => [...current.filter(item => item.id !== result.profile!.id), result.profile!]);
    if (project?.analysis_setup?.profile_id === selectedProfile && (!result.valid || result.fingerprint && project.analysis_setup.profile_hash !== result.fingerprint) && jobs.length) { const statuses = await Promise.all(jobs.map(run => transport<Run>('job.status', { run_id: run.id }))); setJobs(statuses); for (const run of statuses) await onRun?.(run); }
    setNotice(result.valid ? '실제 PDK 리소스 검증을 통과했습니다. GDS 포트를 검사하세요.' : '리소스 검사에 실패한 항목이 있습니다. 경로 / 파일 / 지원 범위를 수정하세요.'); });
  const register = () => void action('PDK 등록 및 리소스 검사 중', async () => {
    if (shared) throw new Error('공유 서버 PDK 등록은 서버 관리자 설정이 필요합니다. 설치된 profile을 선택하세요.');
    const checked = validateManifest(manifest); if (packageFile && packageFile.size > 16 * 1024 * 1024) throw new Error('PDK ZIP 제한은 16 MiB입니다.');
    const next = await transport<PdkProfile>('pdk.register', { manifest: checked, ...(packageFile ? { package_base64: bytesBase64(await packageFile.arrayBuffer()) } : {}) });
    setProfiles(current => [...current.filter(item => item.id !== next.id), next]); setSelectedProfile(next.id); setManifest(next.manifest); setManifestEdit(false); setPackageFile(null); update({ profile_id: next.id, profile_hash: next.fingerprint, corner: next.manifest.corners[0] || '' });
    setValidation(await transport<PdkValidation>('pdk.validate', { profile_id: next.id })); setNotice(`등록됨 · ${next.id} · 실제 resource fingerprint ${next.fingerprint}`);
  });
  const importSource = () => void action('원본 GDS를 별도 해석 프로젝트로 가져오는 중', async () => {
    if (!source) throw new Error('원본 GDS bytes가 없습니다. 원본 GDS 파일을 다시 여세요.'); if (source.buffer.byteLength > 16 * 1024 * 1024) throw new Error('Native 업로드 제한은 16 MiB입니다. 로컬 뷰어의 64 MiB 제한과 다릅니다.');
    const created = await transport<Project>('project.create', { name: `${source.name} · 분석`, example: 'fixture' });
    const imported = await transport<Project>('layout.import', { project_id: created.id, format: 'gds', file_base64: bytesBase64(source.buffer), ...(settings.top_cell ? { top_cell: settings.top_cell } : {}) });
    setProject(imported); setInspection(null); setInspectionStamp(''); update({ top_cell: settings.top_cell || imported.cell }); await onConfigured?.(imported); setNotice('실제 KLayout이 GDS를 가져왔습니다. 원본 로컬 파일은 유지됩니다.');
  });
  const inspect = () => void action('Magic으로 추출 포트 검사 중', async () => { if (!project) throw new Error('해석 프로젝트를 먼저 가져오세요.');
    const result = await transport<AnalysisInspection>('analysis.inspect', { project_id: project.id, profile_id: selectedProfile, ...(settings.top_cell ? { top_cell: settings.top_cell } : {}) });
    setInspection(result); setInspectionStamp(stamp(project, selectedProfile, result.top_cell, fingerprint));
    update({ top_cell: result.top_cell, ports: result.ports.map(name => settings.ports.find(port => port.name === name) || { name, mode: 'floating', dc_V: 0 }) }); setNotice(`${result.ports.length}개 실제 추출 포트 · 각 포트의 ground / 바이어스를 지정하세요.`);
  });
  const save = () => void action('해석 설정 검증 및 저장 중', async () => { if (!project) throw new Error('프로젝트가 없습니다.'); if (!freshInspection) throw new Error('현재 profile / cell / revision의 포트 검사가 필요합니다.');
    const next = await transport<Project>('analysis.configure', { project_id: project.id, expected_revision: project.revision, command_id: crypto.randomUUID(), settings: { ...readAnalysisSetup(settings), profile_id: selectedProfile, profile_hash: fingerprint } });
    setProject(next); setSettings(readAnalysisSetup(next.analysis_setup || settings)); setDirty(false); setInspectionStamp(stamp(next, selectedProfile, settings.top_cell, fingerprint)); await onConfigured?.(next); setNotice(`해석 조건 저장됨 · r${next.revision} · 실행 버튼으로 실제 job을 시작하세요.`);
  });
  const start = (kind: 'simulation' | 'drc' | 'lvs' | 'pex') => void action(`${kind.toUpperCase()} job 시작 중`, async () => { if (!project || !saved) throw new Error('검사와 설정 저장을 먼저 완료하세요.');
    const run = await transport<Run>(kind === 'simulation' ? 'analysis.run' : 'analysis.verify', { project_id: project.id, expected_revision: project.revision, command_id: crypto.randomUUID(), ...(kind === 'simulation' ? {} : { kind }) });
    setJobs(current => [...current.filter(item => item.id !== run.id), run]); setSelectedJob(run.id); await onRun?.(run); setStep(4); setNotice(`실제 ${kind} job이 시작되었습니다. 결과와 로그를 확인하세요.`);
  });
  const runningIds = jobs.filter(active).map(run => run.id).join('|');
  useEffect(() => { if (!runningIds) return; let canceled = false, pending = false;
    const poll = async () => { if (pending) return; pending = true; try { const next = await Promise.all(runningIds.split('|').map(run_id => transport<Run>('job.status', { run_id }))); if (canceled) return;
      for (const run of next) { if (canceled) return; await callbackRef.current.onRun?.(run); if (canceled) return; if (!active(run) && (run.waveforms?.length || run.current_flow) && projectRef.current?.id === run.project_id) { const resultScene = await transport<Scene>('view.get_scene', { project_id: run.project_id, max_shapes: 2000 }); if (!canceled && projectRef.current?.id === run.project_id) await callbackRef.current.onResult?.(run, resultScene); } }
      // Terminal status removes this effect's running IDs. Deliver the scene first so
      // cleanup cannot cancel a completed job's current-data callback mid-request.
      if (!canceled) setJobs(current => current.map(run => next.find(item => item.id === run.id) || run));
    } catch (cause) { if (!canceled) setError(errorMessage(cause)); } finally { pending = false; } };
    void poll(); const timer = setInterval(() => void poll(), 1200); return () => { canceled = true; clearInterval(timer); };
  }, [runningIds, transport]);
  const run = jobs.find(item => item.id === selectedJob) || jobs.at(-1);
  useEffect(() => { if (!run) return; let canceled = false; const read = async () => { try { const result = await transport<{ text: string }>('job.logs', { run_id: run.id }); if (!canceled) setLogs(result.text || '아직 로그가 없습니다.'); } catch (cause) { if (!canceled) setLogs(errorMessage(cause)); } }; void read(); const timer = active(run) ? setInterval(() => void read(), 1600) : null; return () => { canceled = true; if (timer) clearInterval(timer); }; }, [run?.id, run?.execution_status, transport]);
  const reset = () => { if (!project?.analysis_setup) return; setSettings(readAnalysisSetup(project.analysis_setup)); setSelectedProfile(project.analysis_setup.profile_id); setManifest(profiles.find(item => item.id === project.analysis_setup?.profile_id)?.manifest || blankManifest()); setManifestEdit(false); setDirty(false); setValidation(null); setInspection(null); setNotice('저장된 설정으로 되돌렸습니다. 실제 리소스와 포트 검증을 다시 확인하세요.'); };
  const importSetup = (file: File) => void action('설정 JSON 읽는 중', async () => { if (file.size > 2 * 1024 * 1024) throw new Error('설정 JSON 제한은 2 MiB입니다.'); const value = JSON.parse(await file.text()); const next = readAnalysisSetup(value.settings ?? value); const parsedManifest = value.manifest ? validateManifest(value.manifest) : undefined; setSettings(next); setSelectedProfile(next.profile_id); setValidation(null); setInspection(null); setDirty(true); if (parsedManifest) { setManifest(parsedManifest); setManifestEdit(!profiles.some(item => item.id === parsedManifest.id)); } setNotice('입력 설정을 가져왔습니다. PDK와 추출 포트를 검증한 후 저장하세요. 자동 실행하지 않습니다.'); });
  const available = validation?.profile?.capabilities || profile?.capabilities || {};
  const biasMissing = !settings.ports.some(port => port.mode === 'ground');
  const dcPorts = settings.ports.filter(port => port.mode === 'voltage');
  const canDefaultMos = inspection?.ports.length === 4 && ['B', 'D', 'S', 'G'].every(name => inspection.ports.includes(name));
  const titles = ['PDK 리소스', 'GDS / Cell', '포트 바이어스', '해석 조건', '실행 / 결과'];

  return <div className="pdk-setup-wizard" data-testid="pdk-setup-wizard">
    <div className="pdk-setup-intro"><span className="tag">EXTRACTED GDS → SPICE</span><p>검증된 기술 파일로 추출하고, 실제 발견된 포트에 입력 조건을 연결합니다. PDK layer 색 파일과 해석용 model / deck을 구분합니다.</p></div>
    {engineUnavailableReason && <div className="pdk-engine-required" role="alert"><strong>해석 엔진 연결 필요</strong><p>{engineUnavailableReason}</p>{onOpenWorkspace && <button className="button primary small" onClick={onOpenWorkspace}>공동 설계 열어 로그인</button>}</div>}
    {shared && <div className="pdk-setup-note">공유 서버 설치 profile을 사용합니다. PDK 업로드·등록은 서버 관리자 설정이 필요하며, 실행은 Editor / Owner 권한이 필요합니다.</div>}
    <nav className="pdk-setup-steps" aria-label="PDK 해석 설정 단계">{titles.map((title, index) => <button key={title} className={step === index ? 'active' : ''} data-testid={`pdk-step-${index}`} onClick={() => setStep(index)}><span>{index + 1}</span>{title}</button>)}</nav>
    {error && <div className="inline-error" role="alert" data-testid="pdk-setup-error">{error}</div>}{busy && <div className="pdk-setup-progress" role="status">{busy}…</div>}
    <div className="pdk-setup-content">
    {step === 0 && <>
      <div className="pdk-profile-select"><label>설치된 PDK profile<select data-testid="pdk-profile-select" aria-label="설치된 PDK profile" value={selectedProfile} disabled={!!busy || !!engineUnavailableReason} onChange={event => chooseProfile(event.target.value)}><option value="">선택하세요</option>{profiles.map(item => <option key={item.id} value={item.id}>{item.name} · {item.version}{item.built_in ? ' · built-in' : ''}{item.available === false ? ' · 리소스 미완료' : ''}</option>)}</select></label><button className="button small" disabled={!!busy || !!engineUnavailableReason} onClick={() => setRefreshId(value => value + 1)}>목록 재시도</button><button className="button small" data-testid="pdk-new-profile" disabled={shared || readOnly || !!busy || !!engineUnavailableReason} onClick={() => { setManifest(blankManifest()); setManifestEdit(true); setSelectedProfile(''); setValidation(null); setManifestName(''); setPackageFile(null); }}>새 PDK 등록</button>{profile && <button className="button small" disabled={shared || readOnly || !!busy} onClick={() => { setManifest({ ...profile.manifest, id: `${profile.id}-custom` }); setSelectedProfile(''); setValidation(null); setManifestEdit(true); }}>Profile 사본 편집</button>}</div>
      <div className="pdk-manifest-files"><label className="button small pdk-file-button">Manifest JSON<input data-testid="pdk-manifest-file" aria-label="PDK manifest 파일" type="file" accept=".json" disabled={shared || readOnly || !!busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void action('Manifest 읽는 중', async () => { if (file.size > 1024 * 1024) throw new Error('Manifest 제한은 1 MiB입니다.'); const parsed = validateManifest(JSON.parse(await file.text())); setManifest(parsed); setCornerText(parsed.corners.join(', ')); setManifestName(file.name); setManifestEdit(true); setSelectedProfile(''); setValidation(null); }); }}/></label><span>{manifestName || '선택된 manifest 없음'}</span><label className="button small pdk-file-button">PDK package ZIP<input data-testid="pdk-package-file" aria-label="PDK package ZIP 파일" type="file" accept=".zip" disabled={shared || readOnly || !!busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file && (!file.name.toLowerCase().endsWith('.zip') || file.size > 16 * 1024 * 1024)) { setError('16 MiB 이하의 .zip 파일을 선택하세요.'); return; } setPackageFile(file || null); setValidation(null); }}/></label><span>{packageFile ? `${packageFile.name} · ${(packageFile.size / 1024).toFixed(1)} KiB` : '선택 사항 · 16 MiB'}</span></div>
      <div className="pdk-manifest-grid">{(['id', 'name', 'version', 'root', 'magic_rc', 'magic_tech', 'netgen_setup', 'model_file', 'layer_file'] as const).map(key => <label key={key}><span>{({ id: 'Profile ID', name: '표시 이름', version: 'Version / commit', root: 'PDK root', magic_rc: 'Magic rc / extraction', magic_tech: 'Magic technology', netgen_setup: 'Netgen LVS setup', model_file: 'SPICE model file', layer_file: 'Layer display file' })[key]}</span><input aria-label={`PDK ${key}`} data-testid={`pdk-manifest-${key}`} value={manifest[key] || ''} disabled={!manifestEdit || shared || readOnly || !!busy} onChange={event => { setManifest(current => ({ ...current, [key]: event.target.value })); setValidation(null); }} placeholder={key === 'root' ? '/foss/pdks/... 또는 업로드 package root' : ''}/></label>)}<label><span>Model include mode</span><select aria-label="PDK model mode" value={manifest.model_mode} disabled={!manifestEdit || shared || readOnly || !!busy} onChange={event => { setManifest(current => ({ ...current, model_mode: event.target.value as PdkManifest['model_mode'] })); setValidation(null); }}><option value="lib">.lib · corner</option><option value="include">.include</option><option value="sky130-subset">검증된 SKY130 subset</option></select></label><label><span>Model corners · 쉼표로 구분</span><input aria-label="PDK corners" value={cornerText} disabled={!manifestEdit || shared || readOnly || !!busy} onChange={event => { setCornerText(event.target.value); setManifest(current => ({ ...current, corners: event.target.value.split(',').map(value => value.trim()).filter(Boolean) })); setValidation(null); }}/></label><label><span>SPICE geometry scale</span><input aria-label="PDK spice scale" type="number" step="any" value={manifest.spice_scale} disabled={!manifestEdit || shared || readOnly || !!busy} onChange={event => { setManifest(current => ({ ...current, spice_scale: Number(event.target.value) })); setValidation(null); }}/></label></div>
      <p className="pdk-setup-note">경로는 worker의 /foss/pdks 또는 관리되는 업로드 package 내부를 사용합니다. 실행 가능한 Magic / Netgen deck은 설치된 검증 리소스와 byte hash가 일치해야 합니다. 미지원 모델·추가 include는 실제 검증 오류로 표시합니다. ZIP 등록이 공정 지원을 자동으로 보장하지 않습니다.</p>
      <div className="pdk-setup-actions">{manifestEdit ? <button className="button primary" data-testid="pdk-register" disabled={forbidden || shared} onClick={register}>Profile 등록 / 검사</button> : <button className="button primary" data-testid="pdk-validate" disabled={!selectedProfile || !!busy || !!engineUnavailableReason} onClick={validate}>실제 PDK 리소스 검증</button>}<button className="button" onClick={() => download(manifest, `${manifest.id || 'pdk'}.manifest.json`)}>Manifest 저장</button>{validation?.fingerprint && <code className="pdk-fingerprint" title={validation.fingerprint}>Fingerprint · {validation.fingerprint}</code>}</div>
      <Checks checks={validation?.checks || profile?.checks}/>
    </>}
    {step === 1 && <><div className="pdk-project-info"><span className="tag">{project ? 'NATIVE PROJECT' : 'LOCAL GDS FILE'}</span><strong>{project?.name || source?.name || 'GDS를 먼저 선택하세요'}</strong><code>{project ? `${project.id} · r${project.revision}` : source ? `${(source.buffer.byteLength / 1024).toFixed(1)} KiB · 원본 유지` : ''}</code></div>{!project && <><p className="pdk-setup-note">이 버튼은 원본 GDS를 native worker에 업로드하고 별도 해석 프로젝트를 만듭니다. 로컬 뷰어의 파일과 표시 상태는 유지됩니다. 최대 16 MiB이며 추출에는 실행 중인 EDA worker가 필요합니다.</p><button className="button primary" data-testid="pdk-import-gds" disabled={!source || forbidden} onClick={importSource}>엔진으로 GDS 가져오기</button></>}
      <label className="pdk-cell-field">추출할 top cell{inspection ? <select aria-label="분석 top cell" data-testid="pdk-top-cell" value={settings.top_cell} disabled={forbidden} onChange={event => update({ top_cell: event.target.value })}>{inspection.top_cells.map(cell => <option key={cell} value={cell}>{cell}</option>)}</select> : <input aria-label="분석 top cell" data-testid="pdk-top-cell" value={settings.top_cell} disabled={forbidden} onChange={event => update({ top_cell: event.target.value })} placeholder="원본 GDS top cell"/>}</label>
      <button className="button primary" data-testid="pdk-inspect" disabled={!project || !validProfile || forbidden} title={!validProfile ? 'PDK 리소스 검증을 먼저 통과해야 합니다.' : undefined} onClick={inspect}>실제 GDS 추출 포트 검사</button>
      {inspection && <><div className={`pdk-inspection-summary ${freshInspection ? '' : 'stale'}`} data-testid="pdk-inspection-status">{freshInspection ? '현재 profile / cell / revision의 실제 추출 결과' : 'STALE · 파일 / profile / cell / revision이 바뀌었습니다. 다시 검사하세요.'}<strong>{inspection.ports.length} ports · {inspection.labels.length} labels</strong></div><div className="pdk-extracted-ports">{inspection.ports.map(port => <code key={port}>{port}</code>)}</div><Checks checks={inspection.checks}/><details><summary>실제 layout label 목록</summary><p className="pdk-setup-note">{inspection.labels.join(', ') || 'Label 없음'}</p></details></>}
      {inspection?.log_text && <details><summary>실제 Magic 포트 검사 로그</summary><pre className="pdk-job-logs" data-testid="pdk-inspection-log">{inspection.log_text}</pre></details>}
    </>}
    {step === 2 && <><p className="pdk-setup-note">추출된 모든 포트를 정확히 한 번 지정합니다. Ground는 기준 노드, Voltage는 DC 바이어스, Floating은 외부 전원을 연결하지 않습니다. Floating 회로의 수렴 여부는 실제 ngspice가 판단합니다.</p>{!inspection && <div className="pdk-engine-required">실제 추출 포트 검사를 먼저 실행하세요.</div>}{inspection && !freshInspection && <div className="pdk-inspection-summary stale">STALE · 포트 검사를 다시 실행해야 저장할 수 있습니다.</div>}
      {canDefaultMos && <button className="button small" data-testid="pdk-mos-bias-preset" disabled={forbidden || !freshInspection} onClick={() => update({ ports: settings.ports.map(port => ({ ...port, mode: port.name === 'B' || port.name === 'S' ? 'ground' : 'voltage', dc_V: port.name === 'D' ? 1.8 : port.name === 'G' ? .9 : 0 })), sweep_port: 'G' })}>발견된 B / D / S / G에 MOS 바이어스 제안 적용</button>}
      <div className="pdk-port-table"><table><thead><tr><th>추출 포트 이름</th><th>연결 방식</th><th>DC 전압 (V)</th></tr></thead><tbody>{settings.ports.map((port, index) => <tr key={port.name}><td><code>{port.name}</code></td><td><select aria-label={`${port.name} 바이어스 방식`} data-testid={`pdk-port-mode-${port.name}`} value={port.mode} disabled={forbidden} onChange={event => update({ ports: settings.ports.map((item, i) => i === index ? { ...item, mode: event.target.value as AnalysisPort['mode'] } : item) })}><option value="floating">Floating · 미연결</option><option value="ground">Ground · 0</option><option value="voltage">Voltage · DC</option></select></td><td><input aria-label={`${port.name} 바이어스 전압`} data-testid={`pdk-port-voltage-${port.name}`} type="number" step="any" value={port.mode === 'ground' ? 0 : port.dc_V} disabled={forbidden || port.mode !== 'voltage'} onChange={event => update({ ports: settings.ports.map((item, i) => i === index ? { ...item, dc_V: Number(event.target.value) } : item) })}/></td></tr>)}</tbody></table></div>
      {inspection && biasMissing && <div className="pdk-inspection-summary stale" data-testid="pdk-ground-required">Ground 포트를 명시해야 합니다. 임의 포트나 전압원을 추가하지 않습니다.</div>}
    </>}
    {step === 3 && <><div className="pdk-analysis-grid"><label>Analysis<select aria-label="추출 GDS analysis" data-testid="pdk-analysis" value={settings.analysis} disabled={forbidden} onChange={event => update({ analysis: event.target.value as AnalysisSetup['analysis'] })}><option value="op">OP · Operating point</option><option value="dc">DC · Voltage sweep</option><option value="tran">Transient · DC 입력의 시간 응답</option></select></label><label>Model corner<select aria-label="추출 GDS model corner" data-testid="pdk-corner" value={settings.corner} disabled={forbidden} onChange={event => update({ corner: event.target.value })}>{(profile?.manifest.corners || manifest.corners).map(corner => <option key={corner} value={corner}>{corner}</option>)}</select></label><label>Temperature (°C)<input aria-label="추출 GDS temperature" type="number" step="any" value={settings.temperature_C} disabled={forbidden} onChange={event => update({ temperature_C: Number(event.target.value) })}/></label>
      {settings.analysis === 'dc' && <><label>Sweep voltage port<select aria-label="DC sweep port" data-testid="pdk-sweep-port" value={settings.sweep_port || ''} disabled={forbidden} onChange={event => update({ sweep_port: event.target.value })}><option value="">Voltage 포트를 선택하세요</option>{dcPorts.map(port => <option key={port.name} value={port.name}>{port.name}</option>)}</select></label>{(['start_V', 'end_V', 'step_V'] as const).map(key => <label key={key}>{({ start_V: 'Sweep start (V)', end_V: 'Sweep end (V)', step_V: 'Sweep step (V)' })[key]}<input aria-label={`DC ${key}`} data-testid={`pdk-${key}`} type="number" step="any" disabled={forbidden} value={settings[key] ?? ''} onChange={event => update({ [key]: event.target.value ? Number(event.target.value) : undefined })}/></label>)}</>}
      {settings.analysis === 'tran' && <>{(['duration_s', 'step_s'] as const).map(key => <label key={key}>{key === 'duration_s' ? 'Transient duration (ns)' : 'Transient step (ps)'}<input aria-label={`GDS ${key}`} type="number" step="any" disabled={forbidden} value={settings[key] === undefined ? '' : Number((settings[key]! / (key === 'duration_s' ? 1e-9 : 1e-12)).toPrecision(10))} onChange={event => update({ [key]: event.target.value ? Number(event.target.value) * (key === 'duration_s' ? 1e-9 : 1e-12) : undefined })}/></label>)}</>}
      <label className="pdk-pex-toggle"><span>기생 RC 추출</span><span><input data-testid="pdk-use-pex" type="checkbox" checked={settings.pex} disabled={forbidden || !available.pex} onChange={event => update({ pex: event.target.checked })}/>실제 PEX netlist로 분석</span></label></div><p className="pdk-setup-note">Transient는 위 표의 DC 전원으로 시작합니다. 임의 PULSE / 시간 자극은 이 설정 범위에 없습니다. AC는 복소 위상·방향 처리가 필요하여 이 추출 분석 흐름에서 지원하지 않습니다.</p>
      <div className="pdk-reference"><label className="button small pdk-file-button">LVS reference SPICE<input data-testid="pdk-reference-file" aria-label="LVS reference SPICE 파일" type="file" accept=".spice,.cir,.sp,.txt" disabled={forbidden} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void action('Reference SPICE 읽는 중', async () => { if (file.size > 512 * 1024) throw new Error('Reference SPICE 제한은 512 KiB입니다.'); update({ reference_spice: await file.text() }); setReferenceName(file.name); }); }}/></label><span>{referenceName || (settings.reference_spice ? '설정에 저장된 reference SPICE' : 'LVS에는 실제 reference 회로가 필요합니다.')}</span><textarea aria-label="LVS reference SPICE 텍스트" value={settings.reference_spice || ''} placeholder="선택 사항 · 실제 .subckt 회로" disabled={forbidden} onChange={event => update({ reference_spice: event.target.value || undefined })}/><p className="pdk-setup-note">Backend는 안전한 reference SPICE만 허용합니다. 파일 경로와 .control / 외부 실행 지시는 허용되지 않습니다.</p></div>
      <div className="pdk-setup-actions"><button className="button primary" data-testid="pdk-save-setup" disabled={!project || !validProfile || !freshInspection || forbidden} onClick={save}>검증하고 해석 설정 저장</button>{biasMissing && <span className="pdk-required-hint">Ground 입력 필요 · 저장 시 실제 검증</span>}</div>
    </>}
    {step === 4 && <><div className="pdk-run-actions"><button className="button primary" data-testid="pdk-run-analysis" disabled={forbidden || !saved || !validProfile || !available.simulation} onClick={() => start('simulation')}>실제 추출 + {settings.analysis.toUpperCase()} 실행</button>{(['drc', 'lvs', 'pex'] as const).map(kind => <button className="button" key={kind} data-testid={`pdk-run-${kind}`} disabled={forbidden || !saved || !validProfile || !available[kind] || kind === 'lvs' && !settings.reference_spice?.trim()} title={kind === 'lvs' && !settings.reference_spice?.trim() ? '설정에 reference SPICE를 저장하세요.' : !available[kind] ? '해당 profile의 실제 리소스가 지원되지 않습니다.' : undefined} onClick={() => start(kind)}>{kind.toUpperCase()}</button>)}</div>{!saved && <p className="pdk-setup-note">현재 입력을 먼저 검증하고 저장하세요. 실행에는 저장된 AnalysisSetup만 사용됩니다.</p>}
      <div className="pdk-job-list">{jobs.map(item => <button key={item.id} data-testid="pdk-job-row" data-run-id={item.id} className={run?.id === item.id ? 'selected' : ''} onClick={() => setSelectedJob(item.id)}><strong>{item.kind}</strong><code>{item.id.slice(0, 10)} · r{item.revision}</code><span className={`status ${active(item) ? 'running' : item.execution_status === 'completed' ? item.analysis_result : 'failed'}`}>{item.execution_status} · {item.analysis_result}</span>{(item.freshness === 'stale' || project && item.revision !== project.revision) && <span className="status stale">STALE</span>}</button>)}</div>
      {run && <><div className="pdk-result-details"><span>{run.message || '실제 worker 결과'}</span><code>{run.manifest_path}</code>{active(run) && <button className="button small danger" data-testid="pdk-cancel-job" disabled={readOnly || !!busy} onClick={() => void action('Job 취소 요청 중', async () => { const next = await transport<Run>('job.cancel', { run_id: run.id }); setJobs(current => current.map(item => item.id === next.id ? next : item)); await onRun?.(next); })}>Job 취소</button>}<button className="button small" onClick={() => download(run, `analysis-run-${run.id}.json`)}>실제 결과 JSON</button></div>{run.waveforms?.length ? <div className="pdk-wave-results"><WavePlot run={run}/></div> : null}{run.current_flow && <p className="pdk-setup-note">실제 {run.current_flow.branches.length}개 branch 전류가 반환되었습니다. 위치가 검증되지 않은 branch는 수치로 표시합니다. 전류 경로 편집에서 사용자 지정 표시 경로를 명시할 수 있습니다.</p>}<details className="pdk-job-artifacts"><summary>실제 artifact / resource provenance</summary><pre>{JSON.stringify({ measurements: run.measurements, parasitics: run.parasitics, artifacts: run.artifacts, revision: run.revision }, null, 2)}</pre></details><pre className="pdk-job-logs" data-testid="pdk-job-logs">{logs}</pre></>}
    </>}
    </div>
    <div className="pdk-setup-footer"><div className="pdk-setup-state" data-testid="pdk-setup-state"><span>{dirty ? '저장하지 않은 입력' : project?.analysis_setup ? `저장된 해석 조건 · r${project.revision}` : '설정 미저장'}</span><small>{notice}</small></div><label className="button small pdk-file-button">설정 JSON 열기<input data-testid="pdk-setup-import" aria-label="해석 설정 JSON 파일" type="file" accept=".json" disabled={readOnly || !!busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) importSetup(file); }}/></label><button className="button small" data-testid="pdk-setup-export" onClick={() => download({ schema_version: 1, kind: 'register-analysis-setup', settings, manifest: profile?.manifest || manifest, profile_fingerprint: validation?.fingerprint || profile?.fingerprint, source_name: source?.name || project?.name, saved_project_revision: project?.revision }, `${project?.cell || 'layout'}.analysis-setup.json`)}>설정 JSON 저장</button><button className="button small" data-testid="pdk-setup-reset" disabled={!project?.analysis_setup || !!busy} onClick={reset}>저장 값으로 재설정</button><button className="button small" disabled={step === 0} onClick={() => setStep(value => value - 1)}>이전</button><button className="button primary small" disabled={step === 4} onClick={() => setStep(value => value + 1)}>다음</button></div>
  </div>;
}




