import { useEffect, useRef, useState } from 'react';
import { rpc, type AnalysisInspection, type AnalysisPort, type AnalysisSetup, type PdkManifest, type PdkProfile, type PdkValidation, type Project, type Run, type Scene, type SetupCheck } from '@mos/contracts';
import WavePlot from './WavePlot';
import './pdk-setup.css';
import './pdk-guided.css';

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
  const [cursor, setCursor] = useState(0);
  const index = Math.min(cursor, Math.max(0, (checks?.length || 0) - 1)), check = checks?.[index];
  if (!check) return <p className="pdk-setup-note">아직 실행된 검사가 없습니다.</p>;
  return <><div className="pdk-checks"><div data-check-status={check.status}><span className={`status ${check.status === 'warning' ? 'stale' : check.status}`}>{check.status.toUpperCase()}</span><strong>{check.name}</strong><span>{check.message}</span></div></div><div className="pdk-page-nav"><button className="button small" disabled={index === 0} onClick={() => setCursor(index - 1)}>이전 검사</button><span>{index + 1} / {checks?.length}</span><button className="button small" disabled={index + 1 === checks?.length} onClick={() => setCursor(index + 1)}>다음 검사</button></div></>;

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
  const [depth, setDepth] = useState<'manifest-identity' | 'manifest-decks' | 'manifest-models' | 'files' | 'transfer' | 'pdk-checks' | 'inspection-checks' | 'labels' | 'inspection-log' | 'run-log' | 'provenance' | null>(null);
  const [portCursor, setPortCursor] = useState(0);
  const [runKind, setRunKind] = useState<'simulation' | 'drc' | 'lvs' | 'pex'>('simulation');
  const pageHeading = useRef<HTMLHeadingElement>(null);
  const pageBody = useRef<HTMLDivElement>(null);
  useEffect(() => { pageHeading.current?.focus({ preventScroll: true }); pageBody.current?.scrollTo({ top: 0 }); }, [step, depth]);
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
  const profileIntentRef = useRef({ selectedProfile, manifest, manifestEdit, projectId: suppliedProject?.id ?? project?.id });
  profileIntentRef.current = { selectedProfile, manifest, manifestEdit, projectId: suppliedProject?.id ?? project?.id };
  const callbackRef = useRef({ onRun, onResult }); callbackRef.current = { onRun, onResult };
  const profile = profiles.find(item => item.id === selectedProfile);
  const fingerprint = validation?.fingerprint || validation?.profile?.fingerprint || profile?.fingerprint || '';
  const validProfile = !!validation?.valid && (validation.profile?.id || selectedProfile) === selectedProfile && !manifestEdit;
  const freshInspection = !!inspection && inspectionStamp === stamp(project, selectedProfile, settings.top_cell, fingerprint);
  const saved = !!project?.analysis_setup && !dirty && project.analysis_setup.profile_id === selectedProfile && !!fingerprint && project.analysis_setup.profile_hash === fingerprint;
  const forbidden = readOnly || !!busy || !!engineUnavailableReason;
  const update = (patch: Partial<AnalysisSetup>) => { setSettings(current => ({ ...current, ...patch })); setDirty(true); };
  const action = async (name: string, work: () => Promise<void>) => { setBusy(name); setError(''); try { await work(); } catch (cause) { if (live.current) setError(errorMessage(cause)); } finally { if (live.current) setBusy(''); } };

  useEffect(() => { live.current = true; if (engineUnavailableReason) return; let canceled = false; const intent = profileIntentRef.current;
    void transport<PdkProfile[]>('pdk.list_profiles').then(next => { if (canceled || profileIntentRef.current.projectId !== intent.projectId) return; setProfiles(next);
      // A delayed catalog response may populate the menu, but must not replace a draft or a later user selection.
      const currentIntent = profileIntentRef.current;
      if (currentIntent.manifestEdit || currentIntent.selectedProfile !== intent.selectedProfile || currentIntent.manifest !== intent.manifest) return;
      const chosen = next.find(item => item.id === intent.selectedProfile) || next.find(item => item.built_in && item.available !== false) || next[0];
      if (chosen) { setSelectedProfile(chosen.id); setManifest(chosen.manifest); setSettings(current => ({ ...current, profile_id: chosen.id, corner: chosen.manifest.corners.includes(current.corner) ? current.corner : chosen.manifest.corners[0] || '' })); }
    }).catch(cause => { if (!canceled && profileIntentRef.current.projectId === intent.projectId) setError(`${errorMessage(cause)} · 해석에는 실행 중인 native EDA worker가 필요합니다. 뷰어 기능은 계속 사용할 수 있습니다.`); });
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
    setJobs(current => [...current.filter(item => item.id !== run.id), run]); setSelectedJob(run.id); await onRun?.(run); setStep(8); setDepth(null); setNotice(`실제 ${kind} job이 시작되었습니다. 결과와 로그를 확인하세요.`);
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
  const importSetup = (file: File) => void action('설정 JSON 읽는 중', async () => { if (file.size > 2 * 1024 * 1024) throw new Error('설정 JSON 제한은 2 MiB입니다.'); const value = JSON.parse(await file.text()); const next = readAnalysisSetup(value.settings ?? value); const parsedManifest = value.manifest ? validateManifest(value.manifest) : undefined; setSettings(next); setSelectedProfile(next.profile_id); setValidation(null); setInspection(null); setDirty(true); if (parsedManifest) { setManifest(parsedManifest); setCornerText(parsedManifest.corners.join(', ')); setManifestEdit(!profiles.some(item => item.id === parsedManifest.id)); } setNotice('입력 설정을 가져왔습니다. PDK와 추출 포트를 검증한 후 저장하세요. 자동 실행하지 않습니다.'); });
  const available = validation?.profile?.capabilities || profile?.capabilities || {};
  const biasMissing = !settings.ports.some(port => port.mode === 'ground');
  const dcPorts = settings.ports.filter(port => port.mode === 'voltage');
  const canDefaultMos = inspection?.ports.length === 4 && ['B', 'D', 'S', 'G'].every(name => inspection.ports.includes(name));
  const titles = ['PDK 선택', 'PDK 리소스 검증', 'GDS와 top cell', '포트 연결', '해석 방식', '실행 조건', 'LVS 비교 회로', '설정 검토와 저장', '실행과 결과'];
  const descriptions = ['해석할 공정을 먼저 선택하세요.', '선택한 기술 파일과 모델을 실제 worker에서 확인합니다.', '분석할 레이아웃과 최상위 셀을 정합니다.', '한 포트씩 기준 접지와 외부 전압을 연결하세요.', '해석 종류, 모델 코너와 온도를 정합니다.', '선택한 해석에 필요한 범위만 입력합니다.', 'LVS를 실행할 때 비교할 원본 회로를 준비합니다. 지금 건너뛰어도 됩니다.', '지금까지의 입력을 확인한 뒤 명시적으로 저장합니다.', '저장한 조건으로 해석을 시작하고 실제 결과를 확인합니다.'];
  const depthTitles = { 'manifest-identity': 'PDK 기본 정보', 'manifest-decks': '추출·검증 기술 파일', 'manifest-models': 'SPICE 모델과 단위', files: 'PDK 파일 가져오기', transfer: '설정 파일 관리', 'pdk-checks': 'PDK 검사 상세', 'inspection-checks': '포트 검사 상세', labels: '추출된 layout label', 'inspection-log': '포트 검사 로그', 'run-log': '실행 로그', provenance: '실행 근거와 원본 파일' };
  const manifestPages = ['manifest-identity', 'manifest-decks', 'manifest-models'] as const;
  const manifestPage = depth ? manifestPages.indexOf(depth as typeof manifestPages[number]) : -1;
  const editDisabled = !manifestEdit || shared || readOnly || !!busy;
  const selectedPortIndex = Math.min(portCursor, Math.max(0, settings.ports.length - 1)), selectedPort = settings.ports[selectedPortIndex];
  const nextReason = step === 0 && !selectedProfile && !manifestEdit ? '사용할 PDK를 선택하거나 새 PDK를 작성하세요.'
    : step === 1 && !validProfile ? '실제 PDK 리소스 검증을 통과한 뒤 계속하세요.'
    : step === 2 && !freshInspection ? '현재 top cell의 실제 포트 검사를 먼저 실행하세요.'
    : step === 3 && biasMissing ? '기준이 될 Ground 포트를 하나 이상 지정하세요.'
    : step === 4 && (!settings.corner || !Number.isFinite(settings.temperature_C)) ? '모델 코너와 유효한 온도를 입력하세요.'
    : step === 5 && settings.analysis === 'dc' && (!dcPorts.some(port => port.name === settings.sweep_port) || !Number.isFinite(settings.start_V) || !Number.isFinite(settings.end_V) || !Number.isFinite(settings.step_V) || !settings.step_V) ? 'DC sweep 전압 포트와 유효한 범위를 입력하세요.'
    : step === 5 && settings.analysis === 'tran' && (!(settings.duration_s! > 0) || !(settings.step_s! > 0) || settings.step_s! > settings.duration_s!) ? '시간 간격은 0보다 크고 전체 시간 이하여야 합니다.'
    : step === 7 && !saved ? '검증하고 해석 설정을 저장한 뒤 실행 단계로 이동하세요.' : '';
  const manifestFields = (keys: readonly ('id' | 'name' | 'version' | 'root' | 'magic_rc' | 'magic_tech' | 'netgen_setup' | 'model_file' | 'layer_file')[]) => keys.map(key => <label key={key}><span>{({ id: 'Profile ID', name: '표시 이름', version: 'Version / commit', root: 'PDK root', magic_rc: 'Magic rc / extraction', magic_tech: 'Magic technology', netgen_setup: 'Netgen LVS setup', model_file: 'SPICE model file', layer_file: 'Layer display file' })[key]}</span><input aria-label={`PDK ${key}`} data-testid={`pdk-manifest-${key}`} value={manifest[key] || ''} disabled={editDisabled} onChange={event => { setManifest(current => ({ ...current, [key]: event.target.value })); setValidation(null); }} placeholder={key === 'root' ? '/foss/pdks/... 또는 업로드 package root' : ''}/></label>);
  const inspectProfile = () => setDepth('manifest-identity');
  const newProfile = () => { setManifest(blankManifest()); setCornerText('tt'); setManifestEdit(true); setSelectedProfile(''); setValidation(null); setManifestName(''); setPackageFile(null); setDepth('manifest-identity'); };
  const copyProfile = () => { if (!profile) return; setManifest({ ...profile.manifest, id: `${profile.id}-custom` }); setSelectedProfile(''); setValidation(null); setManifestEdit(true); setDepth('manifest-identity'); };
  const canRun = !forbidden && saved && validProfile && !!available[runKind] && (runKind !== 'lvs' || !!settings.reference_spice?.trim());

  return <div className="pdk-setup-wizard pdk-guided" data-testid="pdk-setup-wizard" data-step={step} data-depth={depth || 'main'} onKeyDown={event => { if (event.key === 'Escape' && depth) { event.preventDefault(); event.stopPropagation(); setDepth(null); } }}>
    <header className="pdk-guided-heading">
      <div className="pdk-guided-position">{depth ? <button className="text-button" data-testid="pdk-guided-depth-back" onClick={() => setDepth(null)}>← {titles[step]}로</button> : <span>PDK·GDS 설정 · {step + 1} / {titles.length}</span>}<span>{project?.name || source?.name || '새 해석 설정'}</span></div>
      <h3 ref={pageHeading} tabIndex={-1} data-testid="pdk-guided-title">{depth ? depthTitles[depth] : titles[step]}</h3>
      <p>{depth ? '입력은 앞뒤로 이동해도 유지됩니다.' : descriptions[step]}</p>
      {!depth && <progress aria-label="PDK 설정 화면 위치" max={titles.length} value={step + 1}/>}
    </header>
    {error && <div className="inline-error" role="alert" data-testid="pdk-setup-error">{error}</div>}
    {busy && <div className="pdk-setup-progress" role="status">{busy}…</div>}
    <div className="pdk-setup-content" ref={pageBody}>
      {engineUnavailableReason && <div className="pdk-engine-required" role="alert"><strong>해석 엔진 연결 필요</strong><p>{engineUnavailableReason}</p>{onOpenWorkspace && <button className="button primary small" onClick={onOpenWorkspace}>공동 설계 열어 로그인</button>}</div>}
      {depth === 'manifest-identity' && <div className="pdk-manifest-grid">{manifestFields(['id', 'name', 'version', 'root'])}</div>}
      {depth === 'manifest-decks' && <><div className="pdk-manifest-grid">{manifestFields(['magic_rc', 'magic_tech', 'netgen_setup', 'layer_file'])}</div><p className="pdk-setup-note">Layer display는 표시용입니다. 추출·LVS에는 worker가 지원하는 실제 기술 파일이 필요합니다.</p></>}
      {depth === 'manifest-models' && <><div className="pdk-manifest-grid">{manifestFields(['model_file'])}<label>Model include mode<select aria-label="PDK model mode" value={manifest.model_mode} disabled={editDisabled} onChange={event => { setManifest(current => ({ ...current, model_mode: event.target.value as PdkManifest['model_mode'] })); setValidation(null); }}><option value="lib">.lib · corner</option><option value="include">.include</option><option value="sky130-subset">검증된 SKY130 subset</option></select></label><label>Model corners · 쉼표로 구분<input aria-label="PDK corners" value={cornerText} disabled={editDisabled} onChange={event => { setCornerText(event.target.value); setManifest(current => ({ ...current, corners: event.target.value.split(',').map(value => value.trim()).filter(Boolean) })); setValidation(null); }}/></label><label>SPICE geometry scale<input aria-label="PDK spice scale" type="number" step="any" value={manifest.spice_scale} disabled={editDisabled} onChange={event => { setManifest(current => ({ ...current, spice_scale: Number(event.target.value) })); setValidation(null); }}/></label></div><p className="pdk-setup-note">실행 가능한 Magic / Netgen deck은 검증 리소스와 byte hash가 일치해야 합니다. 입력 완료와 공정 지원 검증은 별개입니다.</p></>}
      {depth === 'files' && <><div className="pdk-guided-file"><label className="button pdk-file-button">Manifest JSON 선택<input data-testid="pdk-manifest-file" aria-label="PDK manifest 파일" type="file" accept=".json" disabled={shared || readOnly || !!busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void action('Manifest 읽는 중', async () => { if (file.size > 1024 * 1024) throw new Error('Manifest 제한은 1 MiB입니다.'); const parsed = validateManifest(JSON.parse(await file.text())); setManifest(parsed); setCornerText(parsed.corners.join(', ')); setManifestName(file.name); setManifestEdit(true); setSelectedProfile(''); setValidation(null); }); }}/></label><p>{manifestName || '1 MiB 이하의 PDK manifest'}</p></div><div className="pdk-guided-file"><label className="button pdk-file-button">PDK package ZIP 선택<input data-testid="pdk-package-file" aria-label="PDK package ZIP 파일" type="file" accept=".zip" disabled={shared || readOnly || !!busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file && (!file.name.toLowerCase().endsWith('.zip') || file.size > 16 * 1024 * 1024)) { setError('16 MiB 이하의 .zip 파일을 선택하세요.'); return; } setPackageFile(file || null); setValidation(null); }}/></label><p>{packageFile ? `${packageFile.name} · ${(packageFile.size / 1024).toFixed(1)} KiB` : '선택 사항 · 최대 16 MiB'}</p></div><p className="pdk-setup-note">파일 선택만으로 서버에 등록하지 않습니다. 다음 검증 화면의 등록 버튼에서 전송합니다.</p><button className="button small" onClick={() => download(manifest, `${manifest.id || 'pdk'}.manifest.json`)}>현재 Manifest 저장</button></>}
      {depth === 'transfer' && <div className="pdk-guided-file"><label className="button pdk-file-button">설정 JSON 열기<input data-testid="pdk-setup-import" aria-label="해석 설정 JSON 파일" type="file" accept=".json" disabled={readOnly || !!busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) importSetup(file); }}/></label><button className="button" data-testid="pdk-setup-export" onClick={() => download({ schema_version: 1, kind: 'register-analysis-setup', settings, manifest: profile?.manifest || manifest, profile_fingerprint: validation?.fingerprint || profile?.fingerprint, source_name: source?.name || project?.name, saved_project_revision: project?.revision }, `${project?.cell || 'layout'}.analysis-setup.json`)}>설정 JSON 저장</button><button className="button" data-testid="pdk-setup-reset" disabled={!project?.analysis_setup || !!busy} onClick={reset}>저장 값으로 재설정</button></div>}
      {depth === 'pdk-checks' && <Checks checks={validation?.checks || profile?.checks}/>}
      {depth === 'inspection-checks' && <Checks checks={inspection?.checks}/>}
      {depth === 'labels' && <p className="pdk-setup-note">{inspection?.labels.join(', ') || 'Label 없음'}</p>}
      {depth === 'inspection-log' && <pre className="pdk-job-logs" data-testid="pdk-inspection-log">{inspection?.log_text || '아직 검사 로그가 없습니다.'}</pre>}
      {depth === 'run-log' && <pre className="pdk-job-logs" data-testid="pdk-job-logs">{logs || '아직 실행 로그가 없습니다.'}</pre>}
      {depth === 'provenance' && run && <><p className="pdk-setup-note">{run.manifest_path}</p><pre className="pdk-job-logs">{JSON.stringify({ measurements: run.measurements, parasitics: run.parasitics, artifacts: run.artifacts, revision: run.revision }, null, 2)}</pre><button className="button" onClick={() => download(run, `analysis-run-${run.id}.json`)}>실제 결과 JSON 저장</button></>}
      {!depth && step === 0 && <>
        <div className="pdk-profile-select"><label>설치된 PDK profile<select data-testid="pdk-profile-select" aria-label="설치된 PDK profile" value={selectedProfile} disabled={!!busy || !!engineUnavailableReason} onChange={event => chooseProfile(event.target.value)}><option value="">선택하세요</option>{profiles.map(item => <option key={item.id} value={item.id}>{item.name} · {item.version}{item.built_in ? ' · built-in' : ''}{item.available === false ? ' · 리소스 미완료' : ''}</option>)}</select></label><button className="button small" disabled={!!busy || !!engineUnavailableReason} onClick={() => setRefreshId(value => value + 1)}>목록 새로 읽기</button></div>
        <div className="pdk-guided-summary"><strong>{manifestEdit ? `${manifest.name || '새 PDK'} · 작성 중` : profile?.name || '공정 선택 필요'}</strong><p>{manifestEdit ? '작성한 정보는 아직 등록되지 않았습니다.' : '기술 파일과 SPICE 모델은 다음 화면에서 실제 검증합니다.'}</p></div>
        <div className="pdk-guided-actions"><button className="button" data-testid="pdk-open-manifest" disabled={!!busy || (!profile && !manifestEdit)} onClick={inspectProfile}>기술 파일 {manifestEdit ? '이어서 작성' : '살펴보기'} →</button><button className="button" data-testid="pdk-new-profile" disabled={shared || readOnly || !!busy || !!engineUnavailableReason} onClick={newProfile}>새 PDK 작성 →</button><button className="button" data-testid="pdk-open-files" disabled={shared || readOnly || !!busy} onClick={() => setDepth('files')}>PDK 파일 가져오기 →</button></div>
        {profile && <button className="text-button" disabled={shared || readOnly || !!busy} onClick={copyProfile}>이 Profile의 사본으로 작성</button>}
        {shared && <p className="pdk-setup-note">공유 서버의 설치 profile을 사용합니다. 새 PDK 등록은 서버 관리자 설정에서 진행하세요.</p>}
      </>}
      {!depth && step === 1 && <>
        <div className="pdk-guided-summary"><strong>{manifest.name || selectedProfile}</strong><p>{manifestEdit ? '작성한 Profile을 서버에 등록하고 실제 리소스를 검사합니다.' : '설치된 경로, 기술 파일과 모델 지원 여부를 확인합니다.'}</p></div>
        <div className="pdk-setup-actions">{manifestEdit ? <button className="button primary" data-testid="pdk-register" disabled={forbidden || shared} onClick={register}>Profile 등록 / 검사</button> : <button className="button primary" data-testid="pdk-validate" disabled={!selectedProfile || !!busy || !!engineUnavailableReason} onClick={validate}>실제 PDK 리소스 검증</button>}</div>
        <p className="pdk-guided-verdict" data-testid="pdk-validation-state">{validProfile ? '실제 리소스 검증 통과' : validation ? '검증 미통과 · 상세 원인을 확인하세요.' : '미실행 · 검증 버튼을 눌러 확인하세요.'}</p>
        {validation?.fingerprint && <code className="pdk-fingerprint">Fingerprint · {validation.fingerprint}</code>}
        {(validation || profile?.checks?.length) && <button className="button small" onClick={() => setDepth('pdk-checks')}>검사 근거와 오류 확인 →</button>}
      </>}
      {!depth && step === 2 && <>
        <div className="pdk-guided-summary"><strong>{project?.name || source?.name || 'GDS를 먼저 선택하세요'}</strong><p>{project ? `r${project.revision} · ${project.id}` : source ? `${(source.buffer.byteLength / 1024).toFixed(1)} KiB · 원본 유지` : '분석할 프로젝트 또는 원본 GDS가 필요합니다.'}</p></div>
        {!project && <><p className="pdk-setup-note">아래 버튼은 원본 GDS를 worker에 업로드하고 별도 해석 프로젝트를 만듭니다. 최대 16 MiB입니다.</p><button className="button primary" data-testid="pdk-import-gds" disabled={!source || forbidden} onClick={importSource}>엔진으로 GDS 가져오기</button></>}
        <label className="pdk-cell-field">추출할 top cell{inspection ? <select aria-label="분석 top cell" data-testid="pdk-top-cell" value={settings.top_cell} disabled={forbidden} onChange={event => update({ top_cell: event.target.value })}>{inspection.top_cells.map(cell => <option key={cell} value={cell}>{cell}</option>)}</select> : <input aria-label="분석 top cell" data-testid="pdk-top-cell" value={settings.top_cell} disabled={forbidden} onChange={event => update({ top_cell: event.target.value })} placeholder="원본 GDS top cell"/>}</label>
        <button className="button primary" data-testid="pdk-inspect" disabled={!project || !validProfile || forbidden} onClick={inspect}>실제 GDS 추출 포트 검사</button>
        {inspection && <><p className={`pdk-inspection-summary ${freshInspection ? '' : 'stale'}`} data-testid="pdk-inspection-status">{freshInspection ? `현재 설계에서 ${inspection.ports.length}개 포트 추출됨` : 'STALE · profile / cell / revision이 바뀌었습니다. 다시 검사하세요.'}</p><div className="pdk-guided-actions"><button className="button small" onClick={() => setDepth('inspection-checks')}>검사 상세 →</button><button className="button small" onClick={() => setDepth('labels')}>Layout label →</button><button className="button small" onClick={() => setDepth('inspection-log')}>검사 로그 →</button></div></>}
      </>}
      {!depth && step === 3 && <>
        {!inspection && <p className="pdk-setup-note">이전 화면에서 실제 추출 포트 검사를 실행하세요.</p>}
        {inspection && !freshInspection && <p className="pdk-required-hint">포트 검사 결과가 오래되었습니다. 이전 화면에서 다시 검사하세요.</p>}
        {canDefaultMos && <button className="button small" data-testid="pdk-mos-bias-preset" disabled={forbidden || !freshInspection} onClick={() => update({ ports: settings.ports.map(port => ({ ...port, mode: port.name === 'B' || port.name === 'S' ? 'ground' : 'voltage', dc_V: port.name === 'D' ? 1.8 : port.name === 'G' ? .9 : 0 })), sweep_port: 'G' })}>B / D / S / G에 MOS 바이어스 제안 적용</button>}
        {selectedPort && <><div className="pdk-guided-port"><span>포트 {selectedPortIndex + 1} / {settings.ports.length}</span><h4>{selectedPort.name}</h4><div className="pdk-analysis-grid"><label>연결 방식<select aria-label={`${selectedPort.name} 바이어스 방식`} data-testid={`pdk-port-mode-${selectedPort.name}`} value={selectedPort.mode} disabled={forbidden} onChange={event => update({ ports: settings.ports.map((item, i) => i === selectedPortIndex ? { ...item, mode: event.target.value as AnalysisPort['mode'] } : item) })}><option value="floating">Floating · 외부 전원 없음</option><option value="ground">Ground · 기준 접지</option><option value="voltage">Voltage · DC 전원</option></select></label><label>DC 전압 (V)<input aria-label={`${selectedPort.name} 바이어스 전압`} data-testid={`pdk-port-voltage-${selectedPort.name}`} type="number" step="any" value={selectedPort.mode === 'ground' ? 0 : selectedPort.dc_V} disabled={forbidden || selectedPort.mode !== 'voltage'} onChange={event => update({ ports: settings.ports.map((item, i) => i === selectedPortIndex ? { ...item, dc_V: Number(event.target.value) } : item) })}/></label></div></div><div className="pdk-page-nav"><button className="button small" data-testid="pdk-port-previous" disabled={selectedPortIndex === 0} onClick={() => setPortCursor(selectedPortIndex - 1)}>이전 포트</button><span>{selectedPort.name}</span><button className="button small" data-testid="pdk-port-next" disabled={selectedPortIndex + 1 >= settings.ports.length} onClick={() => setPortCursor(selectedPortIndex + 1)}>다음 포트</button></div></>}
        {inspection && biasMissing && <p className="pdk-required-hint" data-testid="pdk-ground-required">Ground 포트를 명시해야 합니다. 임의 포트나 전압원을 추가하지 않습니다.</p>}
      </>}
      {!depth && step === 4 && <div className="pdk-analysis-grid"><label>Analysis<select aria-label="추출 GDS analysis" data-testid="pdk-analysis" value={settings.analysis} disabled={forbidden} onChange={event => update({ analysis: event.target.value as AnalysisSetup['analysis'] })}><option value="op">OP · Operating point</option><option value="dc">DC · Voltage sweep</option><option value="tran">Transient · DC 입력의 시간 응답</option></select></label><label>Model corner<select aria-label="추출 GDS model corner" data-testid="pdk-corner" value={settings.corner} disabled={forbidden} onChange={event => update({ corner: event.target.value })}>{(profile?.manifest.corners || manifest.corners).map(corner => <option key={corner} value={corner}>{corner}</option>)}</select></label><label>Temperature (°C)<input aria-label="추출 GDS temperature" type="number" step="any" value={settings.temperature_C} disabled={forbidden} onChange={event => update({ temperature_C: Number(event.target.value) })}/></label></div>}
      {!depth && step === 5 && <><div className="pdk-analysis-grid">
        {settings.analysis === 'dc' && <><label>Sweep voltage port<select aria-label="DC sweep port" data-testid="pdk-sweep-port" value={settings.sweep_port || ''} disabled={forbidden} onChange={event => update({ sweep_port: event.target.value })}><option value="">Voltage 포트를 선택하세요</option>{dcPorts.map(port => <option key={port.name} value={port.name}>{port.name}</option>)}</select></label>{(['start_V', 'end_V', 'step_V'] as const).map(key => <label key={key}>{({ start_V: 'Sweep start (V)', end_V: 'Sweep end (V)', step_V: 'Sweep step (V)' })[key]}<input aria-label={`DC ${key}`} data-testid={`pdk-${key}`} type="number" step="any" disabled={forbidden} value={settings[key] ?? ''} onChange={event => update({ [key]: event.target.value ? Number(event.target.value) : undefined })}/></label>)}</>}
        {settings.analysis === 'tran' && <>{(['duration_s', 'step_s'] as const).map(key => <label key={key}>{key === 'duration_s' ? 'Transient duration (ns)' : 'Transient step (ps)'}<input aria-label={`GDS ${key}`} type="number" step="any" disabled={forbidden} value={settings[key] === undefined ? '' : Number((settings[key]! / (key === 'duration_s' ? 1e-9 : 1e-12)).toPrecision(10))} onChange={event => update({ [key]: event.target.value ? Number(event.target.value) * (key === 'duration_s' ? 1e-9 : 1e-12) : undefined })}/></label>)}</>}
        </div>{settings.analysis === 'op' && <p className="pdk-setup-note">OP는 지정한 DC 바이어스에서 동작점을 계산합니다. 추가 시간·전압 범위 입력은 없습니다.</p>}<label className="pdk-guided-toggle"><input data-testid="pdk-use-pex" type="checkbox" checked={settings.pex} disabled={forbidden || !available.pex} onChange={event => update({ pex: event.target.checked })}/>실제 PEX netlist로 분석</label>{settings.analysis === 'tran' && <p className="pdk-setup-note">Transient는 지정한 DC 전원으로 시작합니다. PULSE / 시간 자극과 AC 해석은 이 추출 분석 흐름에서 지원하지 않습니다.</p>}</>}
      {!depth && step === 6 && <div className="pdk-reference"><label className="button pdk-file-button">LVS reference SPICE 선택<input data-testid="pdk-reference-file" aria-label="LVS reference SPICE 파일" type="file" accept=".spice,.cir,.sp,.txt" disabled={forbidden} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void action('Reference SPICE 읽는 중', async () => { if (file.size > 512 * 1024) throw new Error('Reference SPICE 제한은 512 KiB입니다.'); update({ reference_spice: await file.text() }); setReferenceName(file.name); }); }}/></label><p>{referenceName || (settings.reference_spice ? '설정에 저장된 reference SPICE' : '선택 사항 · LVS 실행에 필요') }</p><textarea aria-label="LVS reference SPICE 텍스트" value={settings.reference_spice || ''} placeholder="실제 .subckt 회로 · 최대 512 KiB" disabled={forbidden} onChange={event => update({ reference_spice: event.target.value || undefined })}/><p className="pdk-setup-note">외부 실행 지시, .control 또는 파일 경로는 허용하지 않습니다.</p></div>}
      {!depth && step === 7 && <><div className="pdk-guided-summary"><strong>{settings.top_cell || 'Top cell 미지정'}</strong><p>{profile?.name || selectedProfile} · {settings.corner} · {settings.temperature_C} °C</p><p>{settings.analysis.toUpperCase()} · {settings.pex ? 'PEX netlist' : '회로 추출 netlist'} · 포트 {settings.ports.length}개</p><p>Ground: {settings.ports.filter(port => port.mode === 'ground').map(port => port.name).join(', ') || '미지정'}</p></div><p className="pdk-setup-note">저장은 입력 조건을 검증하고 프로젝트 revision에 반영합니다. 엔진 해석은 다음 화면의 실행 버튼에서 시작합니다.</p><button className="button primary" data-testid="pdk-save-setup" disabled={!project || !validProfile || !freshInspection || forbidden} onClick={save}>검증하고 해석 설정 저장</button>{biasMissing && <p className="pdk-required-hint">Ground 입력 필요 · 저장 시 실제 검증</p>}</>}
      {!depth && step === 8 && <>
        <div className="pdk-analysis-grid"><label>실행할 작업<select aria-label="PDK 실행할 작업" value={runKind} disabled={!!busy} onChange={event => setRunKind(event.target.value as typeof runKind)}><option value="simulation">추출 + {settings.analysis.toUpperCase()} 해석</option><option value="drc">DRC</option><option value="lvs">LVS</option><option value="pex">PEX</option></select></label></div><div className="pdk-run-actions"><button className="button primary" data-testid={runKind === 'simulation' ? 'pdk-run-analysis' : `pdk-run-${runKind}`} disabled={!canRun} onClick={() => start(runKind)}>실제 {runKind === 'simulation' ? `추출 + ${settings.analysis.toUpperCase()}` : runKind.toUpperCase()} 실행</button></div>
        {!saved && <p className="pdk-setup-note">현재 입력을 먼저 검증하고 저장하세요. 실행에는 저장된 AnalysisSetup만 사용됩니다.</p>}{saved && !validProfile && <p className="pdk-required-hint">현재 PDK 리소스를 다시 검증한 뒤 실행하세요.</p>}{validProfile && !available[runKind] && <p className="pdk-required-hint">이 Profile에서 {runKind === 'simulation' ? '해석' : runKind.toUpperCase()} 리소스가 지원되지 않습니다. PDK 검증 상세에서 원인을 확인하세요.</p>}{runKind === 'lvs' && !settings.reference_spice?.trim() && <p className="pdk-required-hint">LVS 비교 회로를 저장해야 실행할 수 있습니다.</p>}
        {!run && <p className="pdk-guided-verdict" data-testid="pdk-no-result">미실행 · 아직 실제 해석 결과가 없습니다.</p>}
        {run && <><label className="pdk-cell-field">확인할 실행 결과<select aria-label="PDK 실행 결과 선택" value={run.id} onChange={event => setSelectedJob(event.target.value)}>{jobs.map(item => <option key={item.id} value={item.id}>{item.kind} · r{item.revision} · {item.id.slice(0, 10)} · {item.execution_status}</option>)}</select></label><div className="pdk-result-details" data-testid="pdk-job-row" data-run-id={run.id}><span className={`status ${active(run) ? 'running' : run.execution_status === 'completed' ? run.analysis_result : 'failed'}`}>{run.execution_status} · {run.analysis_result}</span>{(run.freshness === 'stale' || project && run.revision !== project.revision) && <span className="status stale">STALE</span>}<span>{run.message || '실제 worker 결과'}</span>{active(run) && <button className="button small danger" data-testid="pdk-cancel-job" disabled={readOnly || !!busy} onClick={() => void action('Job 취소 요청 중', async () => { const next = await transport<Run>('job.cancel', { run_id: run.id }); setJobs(current => current.map(item => item.id === next.id ? next : item)); await onRun?.(next); })}>Job 취소</button>}</div>{run.waveforms?.length ? <div className="pdk-wave-results"><WavePlot run={run}/></div> : null}{run.current_flow && <p className="pdk-setup-note">실제 {run.current_flow.branches.length}개 branch 전류 · 위치가 검증되지 않은 branch는 수치로 표시합니다.</p>}<div className="pdk-guided-actions"><button className="button small" onClick={() => setDepth('run-log')}>실행 로그 →</button><button className="button small" onClick={() => setDepth('provenance')}>원본 결과·실행 근거 →</button></div></>}
      </>}
    </div>
    <footer className="pdk-guided-footer">
      <div className="pdk-setup-state" data-testid="pdk-setup-state"><span>{dirty ? '저장하지 않은 입력' : project?.analysis_setup ? `저장된 해석 조건 · r${project.revision}` : '설정 미저장'}</span><small role="status">{notice}</small></div>
      {manifestPage >= 0 ? <div className="pdk-page-nav"><button className="button" data-testid="pdk-manifest-back" disabled={!!busy} onClick={() => setDepth(manifestPage ? manifestPages[manifestPage - 1] : null)}>← {manifestPage ? '이전' : '돌아가기'}</button><span>{manifestPage + 1} / 3</span><button className="button primary" data-testid="pdk-manifest-next" disabled={!!busy} onClick={() => { if (manifestPage < 2) setDepth(manifestPages[manifestPage + 1]); else { setDepth(null); setStep(1); } }}>{manifestPage < 2 ? '다음 →' : '검증 화면으로 →'}</button></div>
      : depth ? <button className="button" data-testid="pdk-depth-done" disabled={!!busy} onClick={() => setDepth(null)}>← {titles[step]}로 돌아가기</button>
      : <><div className="pdk-guided-utility"><button className="text-button" data-testid="pdk-settings-files" onClick={() => setDepth('transfer')}>설정 파일 관리 →</button>{jobs.length > 0 && step !== 8 && <button className="text-button" onClick={() => setStep(8)}>기존 실행 결과 →</button>}</div>{nextReason && <p className="pdk-guided-next-hint" data-testid="pdk-next-reason">{nextReason}</p>}<div className="pdk-page-nav"><button className="button" data-testid="pdk-back" disabled={step === 0 || !!busy} onClick={() => setStep(value => value - 1)}>← 이전</button><span>{step + 1} / {titles.length}</span><button className="button primary" data-testid="pdk-next" disabled={step === titles.length - 1 || !!busy || !!nextReason} onClick={() => setStep(value => value + 1)}>{step === 6 ? '검토하기 →' : step === 7 ? '실행 화면으로 →' : '다음 →'}</button></div></>}
    </footer>
  </div>;
}
