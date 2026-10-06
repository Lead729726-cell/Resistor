import {isLocalWorkbench} from '@mos/contracts';
import { useEffect, useRef, useState } from 'react';
import { localRpc, type BackendSetup, type AnalysisSetup, type CurrentFlow, type Layer, type Project, type Run, type Scene } from '@mos/contracts';
import { LayoutViewer, DesignReviewPanel, type ViewerFocus, type ViewerDisplay } from '@mos/viewer';
import { applyPdk, parseCurrentFlow, parseGds, parsePdkLayers } from '@mos/importer';
import sky130Profile from '../../../adapters/pdks/sky130/display.json';
import PdkSetupWizard, { readAnalysisSetup } from './PdkSetupWizard';
import CurrentPathEditor from './CurrentPathEditor';
import CommercialBackendPanel, { readBackendSetup } from './CommercialBackendPanel';
import InterchangePanel from './InterchangePanel';
import NativeDatabasePanel from './NativeDatabasePanel';
import ProcessPanel, { readProcessDocument, type ProcessDocument } from './ProcessPanel';
import Brand from './Brand';
import AppearanceControl from './AppearanceControl';
import './styles.css';
import './standalone.css';

type Pdk = ReturnType<typeof parsePdkLayers>;
type ImportedScene = Scene & { top_cell?: string; top_cells?: string[]; import_notes?: string[]; gds_fingerprint?: string };
type Bounds = [string, string, string, string];
interface ViewerBundle {
  schema_version: 1;
  kind: 'register-view';
  name: string;
  saved_at: string;
  scene: ImportedScene;
  pdk?: Pdk | null;
  currentFlow?: CurrentFlow | null;
  display?: ViewerDisplay;
  topCell?: string;
  sourceName?: string;
  sourceGdsBase64?: string;
  analysisSetup?: AnalysisSetup;
  backendSetup?: BackendSetup;
  originalInputGdsBase64?: string;
  originalInputName?: string;
  processDocument?: ProcessDocument;
}
const DEFAULT_DISPLAY: ViewerDisplay = { projection: 'orthographic', preset: 'iso', explode: 0, clip: { axis: 'none', fraction: 1 }, layers: {} };
const integer = (value: unknown): value is string => typeof value === 'string' && /^-?\d+$/.test(value) && value.length <= 32;
const point = (value: unknown): value is [string, string] => Array.isArray(value) && value.length === 2 && value.every(integer);
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const shortBytes = (bytes: number) => bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MiB` : `${(bytes / 1024).toFixed(1)} KiB`;

function validateLayer(value: unknown): value is Layer {
  return object(value) && typeof value.id === 'string' && typeof value.name === 'string' && Array.isArray(value.gds) && value.gds.length === 2 && value.gds.every(v => Number.isInteger(v) && Number(v) >= 0)
    && typeof value.color === 'string' && /^#[0-9a-f]{6}$/i.test(value.color) && typeof value.opacity === 'number' && value.opacity >= 0 && value.opacity <= 1
    && typeof value.z_display_um === 'number' && Number.isFinite(value.z_display_um) && typeof value.thickness_display_um === 'number' && Number.isFinite(value.thickness_display_um) && value.thickness_display_um >= 0
    && ['illustrative', 'pdk', 'published_reference', 'user'].includes(String(value.source));
}

/** A reopened JSON file is data, and must satisfy the same decimal-coordinate boundary as GDS imports. */
function validateScene(value: unknown): asserts value is ImportedScene {
  if (!object(value) || typeof value.project_id !== 'string' || !Number.isSafeInteger(value.revision) || typeof value.dbu_um !== 'number' || !Number.isFinite(value.dbu_um) || value.dbu_um <= 0
    || !['pdk', 'fixture', 'imported'].includes(String(value.source)) || !Array.isArray(value.layers) || value.layers.length > 4096 || !value.layers.every(validateLayer)
    || !Array.isArray(value.shapes) || value.shapes.length > 200000) throw new Error('유효한 Register scene이 아닙니다. 단위, layer, 좌표 형식을 확인하세요.');
  const layers = new Set(value.layers.map(layer => layer.id));
  if (layers.size !== value.layers.length) throw new Error('중복 layer ID가 있습니다.');
  for (const key of ['top_cell', 'gds_fingerprint'] as const) if (value[key] !== undefined && typeof value[key] !== 'string') throw new Error('GDS source metadata가 올바르지 않습니다.');
  for (const key of ['top_cells', 'import_notes'] as const) if (value[key] !== undefined && (!Array.isArray(value[key]) || !value[key].every(item => typeof item === 'string'))) throw new Error('GDS source 목록이 올바르지 않습니다.');
  for (const key of ['total_shape_count', 'returned_shape_count', 'grid_dbu'] as const) if (value[key] !== undefined && (!Number.isSafeInteger(value[key]) || Number(value[key]) < 0)) throw new Error('Scene 개수 / grid metadata가 올바르지 않습니다.');
  const ids = new Set<string>();
  for (const shape of value.shapes) {
    if (!object(shape) || typeof shape.id !== 'string' || ids.has(shape.id) || !layers.has(String(shape.layer_id)) || typeof shape.cell_path !== 'string'
      || !Array.isArray(shape.polygon) || shape.polygon.length < 3 || shape.polygon.length > 100000 || !shape.polygon.every(point)
      || (shape.holes !== undefined && (!Array.isArray(shape.holes) || !shape.holes.every(hole => Array.isArray(hole) && hole.length >= 3 && hole.every(point))))) throw new Error('Scene의 polygon / layer / ID가 올바르지 않습니다.');
    for (const key of ['net', 'device_id', 'instance_id'] as const) if (shape[key] !== undefined && typeof shape[key] !== 'string') throw new Error('Scene 형상 metadata는 문자열이어야 합니다.');
    ids.add(shape.id);
  }
  for (const key of ['bounds', 'bounds_filter'] as const) {
    if (value[key] != null && (!Array.isArray(value[key]) || value[key].length !== 4 || !value[key].every(integer))) throw new Error('Scene 표시 범위는 정수 DBU 문자열이어야 합니다.');
    const box = value[key];
    if (Array.isArray(box) && (BigInt(box[0]) > BigInt(box[2]) || BigInt(box[1]) > BigInt(box[3]))) throw new Error('Scene 표시 범위 순서가 올바르지 않습니다.');
  }
  if (value.cells !== undefined && (!Array.isArray(value.cells) || !value.cells.every(cell => object(cell) && typeof cell.name === 'string' && Array.isArray(cell.bbox) && cell.bbox.length === 4 && cell.bbox.every(integer)))) throw new Error('Cell 목록이 올바르지 않습니다.');
  if (value.instances !== undefined && (!Array.isArray(value.instances) || !value.instances.every(instance => object(instance) && typeof instance.id === 'string' && typeof instance.cell_name === 'string' && typeof instance.cell_path === 'string' && typeof instance.parent_cell === 'string' && point(instance.position)
    && typeof instance.rotation === 'number' && Number.isFinite(instance.rotation) && typeof instance.mirror === 'boolean' && (instance.bbox === undefined || Array.isArray(instance.bbox) && instance.bbox.length === 4 && instance.bbox.every(integer))
    && (instance.array === undefined || object(instance.array) && Number.isSafeInteger(instance.array.columns) && Number(instance.array.columns) > 0 && Number.isSafeInteger(instance.array.rows) && Number(instance.array.rows) > 0 && integer(instance.array.dx) && integer(instance.array.dy))))) throw new Error('Instance 목록이 올바르지 않습니다.');
  if (value.labels !== undefined && (!Array.isArray(value.labels) || !value.labels.every(label => object(label) && typeof label.id === 'string' && typeof label.layer_id === 'string' && typeof label.cell_path === 'string' && typeof label.text === 'string' && point(label.position)))) throw new Error('Text label 목록이 올바르지 않습니다.');
  if (value.pins !== undefined && (!Array.isArray(value.pins) || !value.pins.every(pin => object(pin) && typeof pin.id === 'string' && typeof pin.name === 'string' && typeof pin.layer_id === 'string' && typeof pin.cell_path === 'string' && Array.isArray(pin.box) && pin.box.length === 4 && pin.box.every(integer)))) throw new Error('Pin 목록이 올바르지 않습니다.');
}

function validateDisplay(value: unknown, layers: Layer[]): ViewerDisplay {
  if (!object(value)) return DEFAULT_DISPLAY;
  const presets = ['iso', 'top', 'front', 'side'];
  const overrides: ViewerDisplay['layers'] = {};
  if (object(value.layers)) for (const layer of layers) {
    const item = value.layers[layer.id];
    if (object(item)) overrides[layer.id] = {
      ...(typeof item.visible === 'boolean' ? { visible: item.visible } : {}), ...(typeof item.pickable === 'boolean' ? { pickable: item.pickable } : {}), ...(typeof item.locked === 'boolean' ? { locked: item.locked } : {}),
      ...(typeof item.color === 'string' && /^#[0-9a-f]{6}$/i.test(item.color) ? { color: item.color } : {}), ...(typeof item.opacity === 'number' && Number.isFinite(item.opacity) ? { opacity: Math.max(0, Math.min(1, item.opacity)) } : {})
    };
  }
  const clip = object(value.clip) ? value.clip : {};
  return { projection: value.projection === 'perspective' ? 'perspective' : 'orthographic', preset: presets.includes(String(value.preset)) ? value.preset as ViewerDisplay['preset'] : 'iso',
    explode: typeof value.explode === 'number' && Number.isFinite(value.explode) ? Math.max(0, Math.min(10, value.explode)) : 0,
    clip: { axis: ['x', 'y', 'z'].includes(String(clip.axis)) ? clip.axis as 'x' | 'y' | 'z' : 'none', fraction: typeof clip.fraction === 'number' && Number.isFinite(clip.fraction) ? Math.max(0, Math.min(1, clip.fraction)) : 1, flip: clip.flip === true }, layers: overrides,
    ...(typeof value.highlightNet === 'string' || value.highlightNet === null ? { highlightNet: value.highlightNet } : {}),
    ...(typeof value.showLabels === 'boolean' ? { showLabels: value.showLabels } : {}), ...(typeof value.showPins === 'boolean' ? { showPins: value.showPins } : {}),
    ...(typeof value.renderLimit === 'number' && Number.isSafeInteger(value.renderLimit) && value.renderLimit > 0 ? { renderLimit: Math.min(100000, value.renderLimit) } : {}),
    ...(typeof value.resolutionScale === 'number' && Number.isFinite(value.resolutionScale) ? { resolutionScale: Math.max(.5, Math.min(2, value.resolutionScale)) } : {}),
    ...(point(value.scopeCentre) ? { scopeCentre: value.scopeCentre } : {}) };
}

function base64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let result = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) result += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(result);
}
function decodeBase64(value: string): ArrayBuffer {
  if (value.length > 90 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('저장된 원본 GDS 데이터가 올바르지 않거나 64 MiB를 넘습니다.');
  const raw = atob(value), bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}
function boundedSnapshot(scene: ImportedScene, bounds: Bounds | undefined, maxShapes: number): ImportedScene {
  const limits = bounds?.map(BigInt);
  const shapes = limits ? scene.shapes.filter(shape => {
    const x = shape.polygon.map(p => BigInt(p[0])), y = shape.polygon.map(p => BigInt(p[1]));
    return x.some(v => v >= limits[0]) && x.some(v => v <= limits[2]) && y.some(v => v >= limits[1]) && y.some(v => v <= limits[3]);
  }) : scene.shapes;
  return { ...scene, shapes: shapes.slice(0, maxShapes), returned_shape_count: Math.min(shapes.length, maxShapes), total_shape_count: scene.total_shape_count ?? scene.shapes.length,
    truncated: scene.truncated || shapes.length > maxShapes, bounds_filter: bounds ?? null };
}

export default function StandaloneViewer({ onExit }: { onExit: () => void }) {
  const [sourceScene, setSourceScene] = useState<ImportedScene | null>(null);
  const [scene, setScene] = useState<ImportedScene | null>(null);
  const [pdk, setPdk] = useState<Pdk | null>(null);
  const [currentFlow, setCurrentFlow] = useState<CurrentFlow | null>(null);
  const [currentName, setCurrentName] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [sourceBytes, setSourceBytes] = useState(0);
  const gds = useRef<ArrayBuffer | null>(null);
  const sequence = useRef(0);
  const [topCell, setTopCell] = useState('');
  const [maxShapes, setMaxShapes] = useState(2000);
  const [bounds, setBounds] = useState<Bounds>(['', '', '', '']);
  const [activeBounds, setActiveBounds] = useState<Bounds | undefined>();
  const [mode, setMode] = useState<'2d' | '3d'>('3d');
  const [display, setDisplay] = useState<ViewerDisplay>(DEFAULT_DISPLAY);
  const [selection, setSelection] = useState<string | null>(null);
  const [viewerFocus, setViewerFocus] = useState<ViewerFocus | undefined>();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('GDS 파일을 선택하면 로컬에서 표시됩니다.');
  const [includeSource, setIncludeSource] = useState(true);
  const [bindConfirmed, setBindConfirmed] = useState(false);
  const [modal, setModal] = useState<'setup' | 'path' | 'backend' | 'interchange' | 'native-database' | 'design-review' | 'process' | null>(null);
  const [processDocument,setProcessDocument] = useState<ProcessDocument|null>(null);
  const [analysisProject, setAnalysisProject] = useState<Project | null>(null);
  const [analysisRun, setAnalysisRun] = useState<Run | null>(null);
  const [portableSetup, setPortableSetup] = useState<AnalysisSetup | undefined>();
  const [portableBackend, setPortableBackend] = useState<BackendSetup | undefined>();
  const originalInput = useRef<{ buffer: ArrayBuffer; name: string } | null>(null);
  const remoteOnly = !window.mos && !isLocalWorkbench();
  useEffect(() => { document.title = '레지스터 · Local GDS Viewer'; }, []);
  useEffect(() => () => { sequence.current++; }, []);

  const execute = async (label: string, work: () => Promise<void>) => {
    setError(''); setBusy(label);
    try { await work(); } catch (e) { setError(message(e)); } finally { setBusy(''); }
  };
  const updateScene = (next: ImportedScene, nextPdk: Pdk | null = pdk) => {
    setSourceScene(next); setScene(nextPdk ? applyPdk(next, nextPdk) : next); setSelection(null); setViewerFocus(undefined);
  };
  const readFile = async (file: File, maximum: number) => {
    if (!file.size) throw new Error('빈 파일입니다.');
    if (file.size > maximum * 1024 * 1024) throw new Error(`이 파일은 ${maximum} MiB 제한을 넘습니다.`);
    return await file.arrayBuffer();
  };
  const openGds = (file: File) => void execute('GDS 읽는 중', async () => {
    if (!/\.gds(ii)?$/i.test(file.name)) throw new Error('.gds 또는 .gdsii 파일을 선택하세요. OASIS는 이 로컬 GDS 뷰어에서 지원하지 않습니다.');
    const id = ++sequence.current, buffer = await readFile(file, 64);
    const next = parseGds(buffer, { maxShapes });
    if (id !== sequence.current) return;
    gds.current = buffer; setSourceName(file.name); setSourceBytes(file.size); setTopCell(next.top_cell || next.cells?.[0]?.name || ''); setActiveBounds(undefined); setBounds(['', '', '', '']);
    setCurrentFlow(null); setCurrentName(''); setBindConfirmed(false); setDisplay(DEFAULT_DISPLAY); updateScene(next);
    setAnalysisProject(null); setAnalysisRun(null); setPortableSetup(undefined); setPortableBackend(undefined); setProcessDocument(null); originalInput.current = null;
    setNotice(`${file.name} · ${next.shapes.length.toLocaleString()}개 형상 표시 · 전류 결과는 별도 파일로 가져오세요.`);
  });
  const openPdk = (file: File) => void execute('PDK layer 읽는 중', async () => {
    if (!/\.(lyp|json)$/i.test(file.name)) throw new Error('KLayout .lyp 또는 layer stack .json을 선택하세요.');
    const buffer = await readFile(file, 8), parsed = parsePdkLayers(new TextDecoder().decode(buffer), file.name);
    if (!parsed.layers.length) throw new Error('PDK 파일에 사용할 layer 정의가 없습니다.');
    setPdk(parsed); if (sourceScene) setScene(applyPdk(sourceScene, parsed)); setDisplay(current => ({ ...current, layers: {} }));
    setNotice(`${parsed.name} · ${parsed.layers.length}개 layer 정의를 불러왔습니다.`);
  });
  const openCurrent = (file: File) => void execute('전류 결과 읽는 중', async () => {
    if (!scene) throw new Error('GDS 또는 뷰어 파일을 먼저 여세요.');
    const buffer = await readFile(file, 32), parsed = parseCurrentFlow(new TextDecoder().decode(buffer), scene);
    setCurrentFlow(parsed); setCurrentName(file.name); setBindConfirmed(false); setNotice(`${file.name} · 가져온 ${parsed.branches.length}개 branch의 실제 수치`);
  });
  const openBundle = (file: File) => void execute('뷰어 파일 읽는 중', async () => {
    const id = ++sequence.current, buffer = await readFile(file, 192), bundle: unknown = JSON.parse(new TextDecoder().decode(buffer));
    if (!object(bundle)) throw new Error('Register 뷰어 JSON 객체가 필요합니다.');
    validateScene(bundle.scene);
    const nextPdk: Pdk | null = bundle.pdk == null ? null : object(bundle.pdk) && typeof bundle.pdk.id === 'string' && typeof bundle.pdk.name === 'string' && Array.isArray(bundle.pdk.layers) && bundle.pdk.layers.every(validateLayer)
      ? { id: bundle.pdk.id, name: bundle.pdk.name, layers: bundle.pdk.layers, notes: Array.isArray(bundle.pdk.notes) ? bundle.pdk.notes.filter((note): note is string => typeof note === 'string') : [], ...(bundle.pdk.compact_default_stack === true ? { compact_default_stack: true } : {}) } : null;
    if (bundle.pdk != null && !nextPdk) throw new Error('저장된 PDK layer 정의가 올바르지 않습니다.');
    const nextFlowData = bundle.currentFlow ?? bundle.current_flow;
    const nextFlow = nextFlowData == null ? null : parseCurrentFlow(JSON.stringify(nextFlowData), bundle.scene);
    const nextSetup = bundle.analysisSetup === undefined ? undefined : readAnalysisSetup(bundle.analysisSetup);
    const nextProcess = bundle.processDocument === undefined ? null : readProcessDocument(bundle.processDocument);
    const nextBackend = bundle.backendSetup === undefined ? undefined : readBackendSetup(bundle.backendSetup);
    const original = typeof bundle.sourceGdsBase64 === 'string' ? decodeBase64(bundle.sourceGdsBase64) : null;
    // Keep exported scene identity and revision intact; an external parser must not relabel result provenance.
    if (original) parseGds(original, { topCell: typeof bundle.topCell === 'string' ? bundle.topCell : bundle.scene.top_cell, maxShapes: 1 });
    if (id !== sequence.current) return;
    gds.current = original; originalInput.current = typeof bundle.originalInputGdsBase64 === 'string' ? { buffer: decodeBase64(bundle.originalInputGdsBase64), name: typeof bundle.originalInputName === 'string' ? bundle.originalInputName : 'original-input.gds' } : null; setPdk(nextPdk); setCurrentFlow(nextFlow); setCurrentName(nextFlow ? file.name : ''); setBindConfirmed(false);
    setSourceName(typeof bundle.sourceName === 'string' ? bundle.sourceName : typeof bundle.name === 'string' ? bundle.name : file.name); setSourceBytes(original?.byteLength || file.size);
    setTopCell(typeof bundle.topCell === 'string' ? bundle.topCell : bundle.scene.top_cell || bundle.scene.cells?.[0]?.name || ''); setDisplay(validateDisplay(bundle.display, bundle.scene.layers));
    setActiveBounds(bundle.scene.bounds_filter ?? undefined); setBounds(bundle.scene.bounds_filter ?? ['', '', '', '']); updateScene(bundle.scene, nextPdk);
    setNotice(original ? `${file.name} · 원본 GDS와 표시 설정을 복원했습니다.` : `${file.name} · 저장된 scene snapshot을 복원했습니다. 다른 cell / 미포함 형상은 원본 GDS가 필요합니다.`);
    setAnalysisProject(null); setAnalysisRun(null); setPortableSetup(nextSetup); setPortableBackend(nextBackend); setProcessDocument(nextProcess);
  });
  const scope = async (nextBounds: Bounds | undefined, limit: number, cell = topCell) => {
    if (!sourceScene) return;
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('표시 개수는 양의 정수여야 합니다.');
    limit = Math.min(limit, 100000);
    if (nextBounds && (!nextBounds.every(integer) || BigInt(nextBounds[0]) >= BigInt(nextBounds[2]) || BigInt(nextBounds[1]) >= BigInt(nextBounds[3]))) throw new Error('범위는 x₁ < x₂, y₁ < y₂인 정수 DBU 문자열이어야 합니다.');
    const next = gds.current ? parseGds(gds.current, { topCell: cell, maxShapes: limit, bounds: nextBounds }) : boundedSnapshot(sourceScene, nextBounds, limit);
    if (cell !== topCell) { setAnalysisProject(null); setAnalysisRun(null); setPortableSetup(undefined); setPortableBackend(undefined); setCurrentFlow(current => current ? { ...current, freshness: 'stale', notes: [...(current.notes || []), 'Top cell이 바뀌었습니다. 원본 결과의 경로 연결은 보류됩니다.'] } : null); }
    else if (analysisProject && gds.current) { next.project_id = analysisProject.id; next.revision = analysisProject.revision; }
    // Scene-only snapshots cannot recover geometry outside their exported subset.
    if (gds.current) setSourceScene(next);
    setScene(pdk ? applyPdk(next, pdk) : next); setMaxShapes(limit); setActiveBounds(nextBounds); setBounds(nextBounds ?? ['', '', '', '']); setTopCell(cell); setSelection(null);
    setNotice(`${next.shapes.length.toLocaleString()}개 형상 표시${next.truncated ? ' · 원본의 일부 범위' : ''}${!gds.current ? ' · 저장된 snapshot 안에서 조회' : ''}`);
  };
  const requestScope = async (nextBounds: Bounds | undefined, limit: number) => {
    setBusy('표시 범위 가져오는 중'); setError('');
    try { await scope(nextBounds, limit); } catch (e) { setError(message(e)); throw e; } finally { setBusy(''); }
  };
  const exportBundle = () => void execute('뷰어 파일 저장 중', async () => {
    if (!scene) return;
    const bundle: ViewerBundle = { schema_version: 1, kind: 'register-view', name: sourceName || 'Register layout', saved_at: new Date().toISOString(), scene, pdk, currentFlow, display, topCell, sourceName, ...(processDocument ? {processDocument} : {}), analysisSetup: analysisProject?.analysis_setup || portableSetup, backendSetup: analysisProject?.backend_setup || portableBackend,
      ...(includeSource && gds.current ? { sourceGdsBase64: base64(gds.current) } : {}), ...(includeSource && originalInput.current ? { originalInputGdsBase64: base64(originalInput.current.buffer), originalInputName: originalInput.current.name } : {}) };
    const blob = new Blob([JSON.stringify(bundle)], { type: 'application/json' }), url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${(sourceName || 'layout').replace(/\.(gdsii|gds|json)$/i, '').replace(/[^\p{L}\p{N}._-]/gu, '_')}.register-view.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice(`뷰어 파일 저장 · ${shortBytes(blob.size)} · scene / PDK / 전류 결과 / 표시 설정`);
  });
  const bindFlow = () => {
    if (!currentFlow || !scene || !bindConfirmed) return;
    setCurrentFlow({ ...currentFlow, source: 'imported', project_id: scene.project_id, revision: scene.revision, branches: currentFlow.branches.map(branch => ({ ...branch, device_id: undefined, mapping: branch.path_dbu && branch.mapping !== 'unmapped' ? 'user_path' : 'unmapped' })), notes: [...(currentFlow.notes || []), `사용자가 현재 GDS에 경로를 연결했습니다. 원본 project=${currentFlow.project_id || '(없음)'}, revision=${currentFlow.revision}. 원본 layout/hash 검증 안 됨. 원본 단자 대응은 사용자 표시 경로로 전환했습니다.`] });
    setBindConfirmed(false); setNotice('사용자 연결을 적용했습니다. 원본 layout 일치와 물리적 경로는 검증되지 않았습니다.');
  };
  const applySky130 = () => void execute('SKY130 layer 적용 중', async () => {
    const parsed = parsePdkLayers(JSON.stringify(sky130Profile), 'sky130.json');
    parsed.notes = [...new Set([...parsed.notes, ...(sky130Profile.notes || [])])];
    setPdk(parsed); if (sourceScene) setScene(applyPdk(sourceScene, parsed)); setDisplay(current => ({ ...current, layers: {} }));
    setNotice('공개 SKY130 layer 이름과 색을 적용했습니다. 3D 높이는 표시용입니다.');
  });
  const selected = scene?.shapes.find(shape => shape.id === selection);
  const matchedFlow = !!scene && !!currentFlow && currentFlow.freshness !== 'stale' && currentFlow.revision === scene.revision && (!currentFlow.project_id || currentFlow.project_id === scene.project_id);
  const onSetupResult = async (run: Run, nativeScene: Scene) => { setAnalysisRun(run); if (run.current_flow) { setCurrentFlow({ ...run.current_flow, freshness: run.execution_status === 'completed' && run.analysis_result === 'pass' ? run.freshness : 'stale' }); setCurrentName(`실제 ${run.tool || run.current_flow.source} · ${run.id.slice(0, 10)}`); } updateScene({ ...nativeScene, top_cell: (analysisProject?.active_backend === 'commercial' ? analysisProject.backend_setup?.top_cell : analysisProject?.analysis_setup?.top_cell) || analysisProject?.cell || topCell, top_cells: sourceScene?.top_cells, import_notes: sourceScene?.import_notes, gds_fingerprint: sourceScene?.gds_fingerprint }); setNotice(`실제 ${run.kind} 결과 · ${run.execution_status} / ${run.analysis_result} · r${run.revision}`); };
  const roots = sourceScene?.top_cells || [], cells = sourceScene?.cells || [];
  const importNotes = sourceScene?.import_notes || [];
  const fileInput = (label: string, testId: string, accept: string, callback: (file: File) => void, disabled = false) => <label className={`sv-file-button${disabled || busy ? ' disabled' : ''}`}><span>{label}</span><input aria-label={label} data-testid={testId} type="file" accept={accept} disabled={disabled || !!busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) callback(file); }}/></label>;

  return <main className="standalone-viewer" data-testid="standalone-viewer" data-ready="true">
    <header className="sv-header"><Brand viewer/><span className="sv-local-badge">● 브라우저 로컬</span><div className="sv-header-actions"><AppearanceControl/><button className="button small" data-testid="viewer-exit" onClick={onExit}>설계 workspace</button></div></header>
    <div className="sv-topbar"><button className="button small" data-testid="viewer-process" disabled={!!busy} onClick={() => setModal('process')}>공정 3D</button><button className="button small" data-testid="viewer-native-database" disabled={!!busy} onClick={() => setModal('native-database')}>원본 DB 읽기</button><button className="button small" data-testid="viewer-design-review" disabled={!scene || !!busy} onClick={() => setModal('design-review')}>설계 검토</button><button className="button primary small" data-testid="viewer-interchange" disabled={!!busy} onClick={() => setModal('interchange')}>EDA 파일 호환</button>{fileInput('GDS 파일 열기', 'viewer-gds-input', '.gds,.gdsii', openGds)}{fileInput('PDK layer 가져오기', 'viewer-pdk-input', '.lyp,.json', openPdk)}{fileInput('전류 결과 가져오기', 'viewer-current-input', '.json', openCurrent, !scene)}{fileInput('뷰어 파일 열기', 'viewer-bundle-input', '.json,.register-view.json', openBundle)}<button className="button small" data-testid="viewer-pdk-setup" disabled={!!busy} onClick={() => setModal('setup')}>PDK·해석 설정</button><button className="button small" data-testid="viewer-commercial-backend" disabled={!!busy} onClick={() => setModal('backend')}>상용 Backend</button><span/><button className="button primary small" data-testid="viewer-export" disabled={!scene || !!busy} onClick={exportBundle}>뷰어 파일 저장</button></div>
    {(error || busy) && <div className={`sv-alert ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'} data-testid="viewer-status">{error || `${busy}…`}{error && <button aria-label="오류 닫기" onClick={() => setError('')}>×</button>}</div>}
    <div className="sv-body"><aside className="sv-sidebar">
      <section><h2>LAYOUT SOURCE</h2>{scene ? <><div className="sv-source-name" title={sourceName}>{sourceName}</div><dl><div><dt>File</dt><dd>{shortBytes(sourceBytes)}</dd></div><div><dt>DBU</dt><dd>{scene.dbu_um} µm</dd></div><div><dt>표시 형상</dt><dd data-testid="viewer-shape-count">{scene.shapes.length.toLocaleString()} / {(scene.total_shape_count ?? scene.shapes.length).toLocaleString()}</dd></div><div><dt>Layer</dt><dd>{scene.layers.length}</dd></div><div><dt>Source identity</dt><dd title={scene.project_id}>{scene.project_id.slice(0, 14)} · r{scene.revision}</dd></div></dl><label className="sv-field">Top cell<select aria-label="GDS top cell" data-testid="viewer-top-cell" value={topCell} disabled={!gds.current || !!busy} onChange={event => { const cell = event.target.value; void execute('Cell 여는 중', () => scope(undefined, maxShapes, cell)); }}>{cells.map(cell => <option key={cell.name} value={cell.name}>{roots.includes(cell.name) ? '◇ ' : ''}{cell.name}</option>)}</select></label>{!gds.current && <p className="sv-note">저장된 scene snapshot입니다. 다른 cell과 저장 범위 밖의 형상은 원본 GDS를 열어 조회하세요.</p>}</> : <p className="sv-note">.gds / .gdsii 파일을 열면 layer와 cell 구조를 읽습니다. 서버 연결 없이 파일을 처리합니다.</p>}</section>
      <section><h2>DISPLAY SCOPE <span>DBU</span></h2><label className="sv-field">표시 개수<select aria-label="뷰어 표시 개수" data-testid="viewer-shape-limit" value={maxShapes} disabled={!scene || !!busy} onChange={event => void execute('표시 범위 갱신 중', () => scope(activeBounds, Number(event.target.value)))}>{[500, 2000, 10000, 50000, 100000].map(limit => <option key={limit} value={limit}>{limit.toLocaleString()}</option>)}</select></label><div className="sv-bounds">{['x₁', 'y₁', 'x₂', 'y₂'].map((label, index) => <label key={label}>{label}<input aria-label={`GDS 범위 ${label}`} disabled={!scene || !!busy} value={bounds[index]} placeholder="DBU" onChange={event => setBounds(current => current.map((value, i) => i === index ? event.target.value : value) as Bounds)}/></label>)}</div><div className="sv-scope-actions"><button className="button small" data-testid="viewer-scope-apply" disabled={!scene || !!busy} onClick={() => void execute('영역 읽는 중', () => scope(bounds, maxShapes))}>영역 적용</button><button className="button small" disabled={!scene || !!busy} onClick={() => void execute('전체 범위 읽는 중', () => scope(undefined, maxShapes))}>전체 범위</button></div><p className="sv-note">표시 범위와 개수만 바뀝니다. 원본 GDS 파일은 수정하지 않습니다. 로컬 표시 상한은 100,000개입니다.</p></section>
      <section><h2>PDK LAYERS</h2><button className="button small" data-testid="viewer-sky130" disabled={!!busy} onClick={applySky130}>SKY130 레이어 적용</button>{pdk ? <><div className="sv-source-name" style={{ marginTop: 12 }}>{pdk.name}</div><p className="sv-note">GDS layer / datatype에 색과 표시 높이를 연결합니다. 모델·DRC deck은 실행하지 않습니다.</p>{pdk.notes?.map((note, i) => <p className="sv-note" key={i}>{note}</p>)}<button className="button small" disabled={!!busy} onClick={() => { setPdk(null); if (sourceScene) setScene(sourceScene); setDisplay(current => ({ ...current, layers: {} })); }}>Layer 설정 제거</button></> : <p className="sv-note">PDK .lyp 또는 layer stack .json을 선택하세요. 기본 3D 높이는 구분을 위한 표시값입니다.</p>}</section>
      <section><h2>PORTABLE VIEW</h2><label className="sv-checkbox"><input type="checkbox" checked={includeSource} disabled={!gds.current && !originalInput.current} onChange={event => setIncludeSource(event.target.checked)}/>원본 GDS를 뷰어 파일에 포함</label><p className="sv-note">포함하면 재개방 후 cell과 범위를 다시 조회할 수 있습니다. 미포함 파일에는 현재 표시된 형상만 저장됩니다.</p></section>
    </aside><div className="sv-workspace"><div className="sv-view-tabs" role="tablist" aria-label="Layout 보기"><button role="tab" aria-selected={mode === '2d'} data-testid="viewer-tab-2d" className={mode === '2d' ? 'active' : ''} onClick={() => setMode('2d')}>Layout 2D</button><button role="tab" aria-selected={mode === '3d'} data-testid="viewer-tab-3d" className={mode === '3d' ? 'active' : ''} onClick={() => setMode('3d')}>Layout 3D</button><span>READ ONLY · LOCAL FILE</span></div>
      <div className="sv-viewport">{scene ? <LayoutViewer scene={scene} mode={mode} selection={selection} onSelect={setSelection} onCommand={async () => { throw new Error('로컬 파일 뷰어는 읽기 전용입니다.'); }} display={display} onDisplayChange={setDisplay} sourceLabel={analysisProject?.interchange_layout?.reader === 'native-database' ? 'Native DB 읽기 snapshot' : '가져온 GDS · 로컬 파일'} readOnly focus={viewerFocus} onRequestScope={requestScope} currentFlow={currentFlow || undefined}/> : <div className="sv-empty"><svg viewBox="0 0 64 64" width="64" height="64" fill="none" aria-hidden="true"><path d="M32 6 57 20 32 34 7 20 32 6Zm-25 25 25 14 25-14M7 42l25 14 25-14" stroke="currentColor" strokeWidth="1.3"/></svg><span>LOCAL LAYOUT INSPECTION</span><h1>GDS를 열고 구조를 살펴보세요.</h1><p>PDK layer 색과 높이를 적용하고, 2D·3D에서 확대·회전·단면을 확인하세요.</p>{fileInput('GDS 파일 선택', 'viewer-empty-gds-input', '.gds,.gdsii', openGds)}<small>설치된 EDA 도구나 로그인 없이 이 기기에서 처리됩니다.</small></div>}</div>
      <div className="sv-bottom-info"><div><span className="sv-dot"/><span data-testid="viewer-notice">{notice}</span></div><p>GDS에는 전류 / 시뮬레이션 결과가 포함되지 않습니다. 가져온 결과의 수치와 경로만 표시합니다.</p>{importNotes.length > 0 && <details><summary>GDS 읽기 참고 · {importNotes.length}</summary>{importNotes.map((note, i) => <p key={i}>{note}</p>)}</details>}</div>
    </div><aside className="sv-inspector"><section><h2>SELECTION</h2>{selected ? <><dl><div><dt>ID</dt><dd title={selected.id}>{selected.id}</dd></div><div><dt>Cell</dt><dd title={selected.cell_path}>{selected.cell_path}</dd></div><div><dt>Layer</dt><dd>{scene?.layers.find(layer => layer.id === selected.layer_id)?.name || selected.layer_id}</dd></div><div><dt>Vertices</dt><dd>{selected.polygon.length}</dd></div><div><dt>Net</dt><dd>{selected.net || '메타데이터 없음'}</dd></div></dl><p className="sv-note">레이아웃을 클릭해 형상을 선택합니다. GDS 자체의 net 연결성은 추론하지 않습니다.</p></> : <div className="sv-selection-empty"><span>＋</span><p>형상을 클릭하면 cell, layer와 좌표를 확인할 수 있습니다.</p></div>}</section>
      <section><h2>CURRENT RESULTS</h2>{currentFlow ? <><div className="sv-source-name" title={currentName}>{currentName}</div><dl><div><dt>Source</dt><dd data-testid="viewer-current-source">{currentFlow.source} · {analysisRun && analysisRun.id === currentFlow.run_id && analysisRun.workflow !== 'imported-results' ? '실제 worker job' : '외부 파일 · 엔진 실행 없음'}</dd></div><div><dt>Analysis</dt><dd>{currentFlow.analysis}</dd></div><div><dt>Samples</dt><dd>{currentFlow.x.length.toLocaleString()} · {currentFlow.x_unit}</dd></div><div><dt>Branches</dt><dd>{currentFlow.branches.length}</dd></div><div><dt>Supplied paths</dt><dd>{currentFlow.branches.filter(branch => branch.path_dbu?.length && branch.mapping !== 'unmapped').length}</dd></div><div><dt>Revision</dt><dd>{currentFlow.revision}</dd></div></dl><div className={`sv-provenance ${matchedFlow ? '' : 'mismatch'}`} data-testid="viewer-current-provenance">{matchedFlow ? 'Identity / revision 일치 · 경로 원본 검증은 파일의 provenance를 확인하세요.' : 'Layout identity / revision 불일치 또는 STALE · 수치만 확인 가능하며 경로 표시를 보류합니다.'}</div>{!matchedFlow && <div className="sv-bind"><label className="sv-checkbox"><input data-testid="viewer-bind-confirm" type="checkbox" checked={bindConfirmed} onChange={event => setBindConfirmed(event.target.checked)}/>이 GDS에 전류 경로 연결</label><p className="sv-note">사용자 연결입니다. 원본 GDS와 해시가 일치한다고 검증하거나 물리 경로를 계산하지 않습니다.</p><button className="button small" data-testid="viewer-bind-current" disabled={!bindConfirmed || !!busy || currentFlow.freshness === 'stale'} onClick={bindFlow}>명시적으로 연결</button></div>}{currentFlow.geometry_linkage === 'unverified' && <p className="sv-note" data-testid="viewer-geometry-unverified">전류와 GDS의 물리적 대응 미검증 · {currentFlow.input_origin || '출처 연결 미지정'}. 사용자 표시 경로는 실제 물리 연결을 검증하지 않습니다.</p>}{currentFlow.notes?.map((note, i) => <p className="sv-note" key={i}>{note}</p>)}<button className="button small" data-testid="viewer-current-path" disabled={!currentFlow.branches.length} onClick={() => setModal('path')}>전류 경로 편집</button><button className="button small" onClick={() => { setCurrentFlow(null); setCurrentName(''); }}>결과 제거</button></> : <><p className="sv-note">실제 branch 전류 JSON을 가져오면 시간·DC sweep sample과 부호 있는 전류를 확인할 수 있습니다.</p><p className="sv-note">화살표는 파일에 명시된 경로에서만 표시합니다. GDS만으로 전류를 만들지 않습니다.</p></>}</section>
      {scene && <section><h2>LOADED LAYERS</h2><div className="sv-layer-summary">{scene.layers.map(layer => <div key={layer.id}><i style={{ background: layer.color }}/><span title={layer.name}>{layer.name}</span><code>{layer.gds.join('/')}</code></div>)}</div></section>}
    </aside></div><footer className="sv-footer"><span>{analysisProject ? '원본 로컬 유지 · 명시적 native 해석' : '로컬 파일 · 서버 전송 없음'}</span><span>{scene ? `${topCell} · ${scene.truncated ? '부분 표시' : '범위 읽기 완료'}` : 'GDS / PDK / Current JSON'}</span><span>Conventional current · 3D 높이의 출처는 layer 설정 참조</span></footer>
    {modal && <div className="modal-overlay"><div className={`modal ${modal === 'process' ? 'process-modal' : modal === 'native-database' ? 'native-database-modal' : modal === 'design-review' ? 'design-review-modal' : modal === 'interchange' ? 'interchange-modal' : modal === 'backend' ? 'commercial-backend-modal' : modal === 'setup' ? 'pdk-setup-modal' : ''}`} role="dialog" aria-modal="true" aria-labelledby="viewer-modal-title"><div className="modal-header"><h2 id="viewer-modal-title">{modal === 'process' ? '공정 3D · 홀 / 단차 / 다층 검토' : modal === 'native-database' ? '원본 DB · 실제 Reader / View' : modal === 'design-review' ? '설계 검토 · 검색 / 거리 / 북마크 / 비교' : modal === 'interchange' ? '다른 EDA 파일 가져오기 / 내보내기' : modal === 'backend' ? '상용 Backend 설정 / 실행' : modal === 'setup' ? 'PDK·GDS 해석 설정' : '전류 표시 경로 편집'}</h2><button className="icon-button" aria-label="닫기" onClick={() => setModal(null)}>×</button></div>{modal === 'process' ? <ProcessPanel scene={scene} document={processDocument} onDocument={setProcessDocument} context={scene ? {project_id:scene.project_id,revision:scene.revision} : undefined}/> : modal === 'native-database' ? <NativeDatabasePanel project={analysisProject} transport={localRpc} engineUnavailableReason={remoteOnly ? '로컬 표시 모드입니다. 실제 원본 DB 조회는 공동 설계에 로그인하고 operator가 바인딩한 source에서 실행하세요. 자동 인증 / 파일 전송은 하지 않습니다.' : undefined} onOpenWorkspace={onExit} onProject={(next, nextScene) => { if (gds.current && !originalInput.current) originalInput.current = { buffer: gds.current, name: sourceName }; gds.current = null; setAnalysisProject(next); setTopCell(next.cell); setSourceName(`${next.cell} · native DB read snapshot`); setSourceBytes(0); setActiveBounds(undefined); setBounds(['', '', '', '']); updateScene({ ...nextScene, top_cell: next.cell }); setCurrentFlow(current => current ? { ...current, freshness: 'stale' } : current); setNotice(`실제 원본 읽기 geometry · ${next.cell} · r${next.revision}. 원본 로컬 GDS는 별도 보존됩니다.`); }}/> : modal === 'design-review' ? <div className="design-review-host"><DesignReviewPanel scene={scene} selection={selection} onSelect={setSelection} onFocus={focus => setViewerFocus(current => ({ ...focus, sequence: (current?.sequence || 0) + 1 }))} currentFlow={currentFlow} waveforms={analysisRun?.id === currentFlow?.run_id ? analysisRun?.waveforms : undefined} resultContext={{ project_id: analysisRun?.project_id, revision: analysisRun?.revision, source: analysisRun?.tool, freshness: analysisRun?.freshness, run_id: analysisRun?.id }}/></div> : modal === 'interchange' ? <InterchangePanel project={analysisProject} scene={scene} source={gds.current ? { buffer: gds.current, name: sourceName } : undefined} transport={localRpc} engineUnavailableReason={remoteOnly ? '이 웹 뷰어는 파일을 브라우저에서 읽습니다. Native 변환 / 프로젝트 적용은 공동 설계에 로그인한 뒤 실행하세요. 파일은 자동 전송하지 않습니다.' : undefined} onOpenWorkspace={onExit} onLayers={next => { setPdk(next); if (sourceScene) setScene(applyPdk(sourceScene, next)); setDisplay(current => ({ ...current, layers: {} })); }} onLocalLayout={(next, input) => { sequence.current++; gds.current = input.buffer; setSourceName(input.name); setSourceBytes(input.buffer.byteLength); setTopCell(next.top_cell); setActiveBounds(undefined); setBounds(['', '', '', '']); updateScene(next); setCurrentFlow(null); setCurrentName(''); setAnalysisProject(null); setAnalysisRun(null); setPortableSetup(undefined); setPortableBackend(undefined); originalInput.current = null; setNotice('EDA 교환 GDS를 로컬에서 표시합니다.'); }} onCurrent={(next, name) => { setCurrentFlow(next); setCurrentName(name); setBindConfirmed(false); }} onProject={(next, nextScene, inputs) => { if (gds.current && !originalInput.current) originalInput.current = { buffer: gds.current, name: sourceName }; const source = !inputs?.some(file => /\.def$/i.test(file.name)) ? inputs?.find(file => /\.gds(ii)?$/i.test(file.name)) : undefined; gds.current = source?.buffer || null; setSourceName(source?.name || `${next.cell} · native EDA interchange`); setSourceBytes(inputs?.reduce((sum, file) => sum + file.buffer.byteLength, 0) || 0); setAnalysisProject(next); setTopCell(next.cell); setActiveBounds(undefined); setBounds(['', '', '', '']); updateScene({ ...nextScene, top_cell: next.cell }); setCurrentFlow(current => current ? { ...current, freshness: 'stale' } : current); }} onNativeProject={setAnalysisProject} onRun={run => { setAnalysisRun(run); setAnalysisProject(current => current?.id === run.project_id ? { ...current, runs: [...current.runs.filter(item => item.id !== run.id), run] } : current); if (run.current_flow) { setCurrentFlow({ ...run.current_flow, freshness: run.execution_status === 'completed' && run.analysis_result === 'pass' ? run.freshness : 'stale' }); setCurrentName(`가져온 ${run.tool || 'EDA'} 결과 · ${run.id.slice(0, 10)}`); } }}/> : modal === 'backend' ? <CommercialBackendPanel project={analysisProject} source={gds.current ? { buffer: gds.current, name: sourceName, topCell, settings: portableBackend } : undefined} transport={localRpc} engineUnavailableReason={remoteOnly ? '이 웹 뷰어는 로컬 표시 모드입니다. 상용 Backend는 공동 설계에 로그인하고 공유 프로젝트에서 연결하세요. 자동 인증 / 파일 업로드는 하지 않습니다.' : undefined} onOpenWorkspace={onExit} onConfigured={next => { setAnalysisProject(next); setPortableBackend(next.backend_setup); setPortableSetup(next.analysis_setup); setCurrentFlow(current => current && (current.project_id !== next.id || current.revision !== next.revision) ? { ...current, freshness: 'stale' } : current); }} onRun={run => { setAnalysisRun(run); setCurrentFlow(current => current?.run_id === run.id && current.freshness !== (run.execution_status === 'completed' && run.analysis_result === 'pass' ? run.freshness : 'stale') ? { ...current, freshness: run.execution_status === 'completed' && run.analysis_result === 'pass' ? run.freshness : 'stale' } : current); setAnalysisProject(current => current?.id === run.project_id ? { ...current, runs: [...current.runs.filter(item => item.id !== run.id), run] } : current); }} onResult={onSetupResult} onLayoutImported={(next, nextScene, file) => { if (gds.current && !originalInput.current) originalInput.current = { buffer: gds.current, name: sourceName }; const exported = decodeBase64(file.base64); const parsed = /\.gds(ii)?$/i.test(file.name) ? parseGds(exported, { topCell: next.cell, maxShapes: 1 }) : null; gds.current = parsed ? exported : null; setSourceName(file.name); setSourceBytes(exported.byteLength); setAnalysisProject(next); updateScene({ ...nextScene, top_cell: next.cell, top_cells: parsed?.top_cells, import_notes: parsed?.import_notes }); setTopCell(next.cell); setCurrentFlow(current => current ? { ...current, freshness: 'stale' } : current); setNotice('실제 내보낸 GDS/OAS를 표시합니다. 원본 입력 GDS는 뷰어 파일에 별도로 유지됩니다.'); }}/> : modal === 'setup' ? <PdkSetupWizard project={analysisProject} source={gds.current ? { buffer: gds.current, name: sourceName, topCell, settings: portableSetup } : undefined} transport={localRpc} engineUnavailableReason={remoteOnly ? '이 웹 뷰어는 브라우저 로컬 모드입니다. 실제 분석은 공동 설계에 로그인하고 공유 프로젝트의 PDK·해석 설정에서 실행하세요. 파일은 자동 전송하지 않습니다.' : undefined} onOpenWorkspace={onExit} onConfigured={next => { setAnalysisProject(next); setPortableSetup(next.analysis_setup); setTopCell(next.analysis_setup?.top_cell || next.cell); setCurrentFlow(current => current && (current.project_id !== next.id || current.revision !== next.revision) ? { ...current, freshness: 'stale' } : current); }} onRun={run => { setAnalysisRun(run); setCurrentFlow(current => current?.run_id === run.id && current.freshness !== (run.execution_status === 'completed' && run.analysis_result === 'pass' ? run.freshness : 'stale') ? { ...current, freshness: run.execution_status === 'completed' && run.analysis_result === 'pass' ? run.freshness : 'stale' } : current); setAnalysisProject(current => current?.id === run.project_id ? { ...current, runs: [...current.runs.filter(item => item.id !== run.id), run] } : current); }} onResult={onSetupResult}/> : currentFlow && scene ? <CurrentPathEditor flow={currentFlow} scene={scene} onChange={setCurrentFlow}/> : <p>실제 전류 결과가 필요합니다.</p>}</div></div>}
  </main>;
}

export { StandaloneViewer };







