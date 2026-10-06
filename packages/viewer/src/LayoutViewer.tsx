import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import type { CurrentFlow, LayoutCommand, Marker, Scene } from '@mos/contracts';
import { clipRange, decimalCoordinate, deltaUm, isPickable, manhattanPoints, pointSurvivesClip, sceneFrame, selectedNet, snappedDelta } from './geometry';
import type { LayerDisplay, LocalFrame, ViewerDisplay } from './geometry';
import {drawingPoint,appendDrawingPoint,drawingCommand,conductorLayers,type DrawTool} from './drawing';
import type {DecimalPoint} from './geometry';
import { polygonShape } from './mesh';
import { BatchedScene, scopedScene } from './batching';
import { extrusionCap } from './caps';
import type { ExtractedMapping, ViewerCursor, ViewerFocus, ViewerPresence } from './collaboration';
import { branchCurrent,currentDirection,currentPath,flowStatus,formatCurrent,projectedCurrent,sampleIndex } from './current';
import { CurrentFlowPanel } from './CurrentFlowPanel';
import { AdvancedTools } from './AdvancedTools';
import './viewer.css';

export interface LayoutViewerProps {
  scene: Scene | null;
  mode: '2d' | '3d';
  selection: string | null;
  onSelect: (id: string | null) => void;
  onCommand: (command: LayoutCommand) => Promise<void>;
  markers?: Marker[];
  display?: ViewerDisplay;
  onDisplayChange?: (display: ViewerDisplay) => void;
  presence?: ViewerPresence[];
  onCursorMove?: (cursor: ViewerCursor | null) => void;
  focus?: ViewerFocus;
  extractedMapping?: ExtractedMapping;
  currentFlow?: CurrentFlow;
  readOnly?: boolean;
  sourceLabel?: string;
  onRequestScope?: (bounds: [string, string, string, string] | undefined, maxShapes: number) => Promise<void>;
}

interface RenderShape {
  id: string;
  layerId: string;
  layerIndex: number;
  net?: string;
  group: THREE.Group;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  outline: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
}
interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  content: THREE.Group;
  markers: THREE.Group;
  caps: THREE.Group;
  capBatch: BatchedScene | null;
  presenceGroup: THREE.Group;
  currents: THREE.Group;
  annotations: THREE.Group;
  preview: THREE.Group;
  focusBounds?: THREE.Box3;
  shapes: RenderShape[];
  batch: BatchedScene | null;
  sourceTag?: string;
  cancelBuild?: () => void;
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  controls: OrbitControls;
  frame: LocalFrame;
  extent: number;
  viewHeight: number;
  maxZ: number;
  cleanup: () => void;
  fit: (preset?: ViewerDisplay['preset'], preserveOrientation?: boolean) => void;
  setProjection: (projection: ViewerDisplay['projection']) => void;
}
interface MoveDrag { shape: RenderShape; start: THREE.Vector3; initial: THREE.Vector3; plane: THREE.Plane; dx: string; dy: string }

const DEFAULT_DISPLAY: ViewerDisplay = { projection: 'orthographic', preset: 'iso', explode: 0, clip: { axis: 'none', fraction: 1 }, layers: {} };

function disposeGroup(group: THREE.Group) {
  group.traverse(object => {
    if (object instanceof THREE.Sprite) { object.material.map?.dispose(); object.material.dispose(); }
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments || object instanceof THREE.Line) {
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => material.dispose());
    }
  });
  group.clear();
}

function displayLayer(scene: Scene, display: ViewerDisplay, layerId: string): Required<LayerDisplay> {
  const layer = scene.layers.find(item => item.id === layerId);
  const override = display.layers?.[layerId];
  return { visible: override?.visible ?? true, pickable: override?.pickable ?? true, locked: override?.locked ?? false,
    color: override?.color ?? layer?.color ?? '#8193ad', opacity: Math.max(0, Math.min(1, override?.opacity ?? layer?.opacity ?? 1)) };
}

function layerZ(scene: Scene, layerId: string, index: number, display: ViewerDisplay, _mode: '2d' | '3d') {
  const layer = scene.layers.find(item => item.id === layerId);
  // Explode is a display transform only. XY commands never include this Z offset.
  return (layer?.z_display_um ?? 0) + index * (display.explode ?? 0);
}

function niceScale(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  return (normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1) * magnitude;
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function LayoutViewer(props: LayoutViewerProps) {
  const { scene, mode, selection, markers = [] } = props;
  const sourceShapeCount = scene?.total_shape_count ?? scene?.shapes.length ?? 0;
  const largeScene = sourceShapeCount >= 5000;
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const propsRef = useRef(props); propsRef.current = props;
  const [internalDisplay, setInternalDisplay] = useState<ViewerDisplay>(DEFAULT_DISPLAY);
  const display = props.display ?? internalDisplay;
  const displayRef = useRef(display); displayRef.current = display;
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('도형 선택 · 드래그 회전/이동 · 휠 확대');
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [tool, setTool] = useState<'select' | 'move' | DrawTool>('select');
  const toolRef = useRef(tool); toolRef.current = tool;
  const [editor, setEditor] = useState<'none' | 'move' | 'box' | 'route'>('none');
  const [editLayer, setEditLayer] = useState('');
  const [fields, setFields] = useState({ x1: '0', y1: '0', x2: '1000', y2: '1000', width: '200', dx: '0', dy: '0', net: '' });
  const [draft,setDraft]=useState<DecimalPoint[]>([]),[drawCursor,setDrawCursor]=useState<DecimalPoint|null>(null),[drawOrder,setDrawOrder]=useState<'x-first'|'y-first'>('x-first');
  const drawRef=useRef({points:draft,cursor:drawCursor,layer:editLayer,width:fields.width,net:fields.net,order:drawOrder});drawRef.current={points:draft,cursor:drawCursor,layer:editLayer,width:fields.width,net:fields.net,order:drawOrder};
  const drawHistory=useRef<number[]>([]);
  function clearDrawing(){drawHistory.current=[];drawRef.current.points=[];setDraft([]);setDrawCursor(null);if(stageRef.current)disposeGroup(stageRef.current.preview);}
  function chooseTool(next:typeof tool){clearDrawing();setTool(next);toolRef.current=next;setEditor('none');setError(null);setNote(next==='box'?'대각선 모서리 두 점 클릭 → 저장 · Esc 취소':next==='polygon'?'꼭짓점 클릭 → Enter 또는 시작점 클릭으로 완료 · Backspace 이전 점':next==='route'?'점 클릭으로 배선 경로 지정 → Enter 완료 · Space 꺾임 변경':'선택 · 휠 확대 · 드래그 이동');stageRef.current?.renderer.domElement.focus();}
  async function finishDrawing(points=drawRef.current.points){
    const source=propsRef.current.scene,kind=toolRef.current;if(!source||!['box','polygon','route'].includes(kind)||pendingRef.current||propsRef.current.readOnly)return;
    const d=drawRef.current,style=displayLayer(source,displayRef.current,d.layer);
    if(style.locked||!style.visible){setError('선택 레이어의 표시·잠금 설정을 확인하세요.');return;}
    try{const command=drawingCommand(kind as DrawTool,d.layer,points,source.grid_dbu??1,d.width,d.net);if(await execute(command))clearDrawing();}
    catch(cause){setError(cause instanceof Error?cause.message:String(cause));}
  }
  useEffect(()=>{clearDrawing();},[scene,mode,editLayer,props.readOnly]);
  useEffect(()=>{
    const stage=stageRef.current;if(!stage||!scene)return;disposeGroup(stage.preview);
    if(!['box','polygon','route'].includes(tool)||!draft.length)return;
    const kind=tool as DrawTool,points=drawCursor?appendDrawingPoint(draft,drawCursor,kind,drawOrder):draft;
    const line=(ring:DecimalPoint[],close=false)=>{if(ring.length<2)return;const vertices=ring.map(([x,y])=>new THREE.Vector3(deltaUm(x,stage.frame.origin[0],scene.dbu_um),deltaUm(y,stage.frame.origin[1],scene.dbu_um),stage.maxZ+.01));if(close)vertices.push(vertices[0].clone());const geometry=new THREE.BufferGeometry().setFromPoints(vertices);const mesh=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:hostRef.current?getComputedStyle(hostRef.current).getPropertyValue('--accent').trim()||'#49cbd6':'#49cbd6',depthTest:false}));mesh.renderOrder=1000;stage.preview.add(mesh);};
    try{
      if(kind==='box'&&points.length>=2){const [a,b]=points;line([a,[b[0],a[1]],b,[a[0],b[1]]],true);}
      else {line(points,kind==='polygon');if(kind==='route'){const width=decimalCoordinate(fields.width);if(width>0n&&width%2n===0n){const h=width/2n;for(let i=1;i<points.length;i++){const a=points[i-1].map(decimalCoordinate),b=points[i].map(decimalCoordinate);const o=a[0]===b[0]?[h,0n]:[0n,h];line([[String(a[0]+o[0]),String(a[1]+o[1])],[String(b[0]+o[0]),String(b[1]+o[1])],[String(b[0]-o[0]),String(b[1]-o[1])],[String(a[0]-o[0]),String(a[1]-o[1])]],true);}}}}
    }catch{/* Invalid input stays a draft; the typed command validator reports it on finish. */}
  },[draft,drawCursor,drawOrder,fields.width,tool,scene]);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [buildProgress, setBuildProgress] = useState<{ built: number; total: number } | null>(null);
  const [capsBuilding, setCapsBuilding] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [flowIndex,setFlowIndex]=useState(0),[flowPlaying,setFlowPlaying]=useState(false),[flowVisible,setFlowVisible]=useState(true),[flowScale,setFlowScale]=useState(1),[flowBranchId,setFlowBranchId]=useState<string|null>(null);
  const [flowLabels,setFlowLabels]=useState<{id:string;text:string;position:THREE.Vector3;color:string}[]>([]);
  const flowLabelsRef=useRef(flowLabels);flowLabelsRef.current=flowLabels;
  const flowLabelRefs=useRef(new Map<string,HTMLSpanElement>());
  const [buildReady, setBuildReady] = useState(0);
  const scaleBarRef = useRef<HTMLSpanElement>(null);
  const scaleLabelRef = useRef<HTMLSpanElement>(null);
  const viewInfoRef = useRef<HTMLSpanElement>(null);
  const dragRef = useRef<MoveDrag | null>(null);
  const focusRequestRef=useRef<string|undefined>(undefined);
  const peerLabelRefs = useRef(new Map<string, HTMLSpanElement>());

  function updateDisplay(patch: Partial<ViewerDisplay>) {
    const next = { ...display, ...patch };
    setInternalDisplay(next);
    props.onDisplayChange?.(next);
  }
  function updateLayer(id: string, patch: LayerDisplay) {
    updateDisplay({ layers: { ...display.layers, [id]: { ...display.layers?.[id], ...patch } } });
  }
  async function requestScope(bounds: [string,string,string,string] | undefined, limit: number) {
    if (!propsRef.current.onRequestScope || pendingRef.current) return;
    pendingRef.current=true;setPending(true);setError(null);
    try { await propsRef.current.onRequestScope(bounds,limit);setNote('현재 영역의 정확한 worker geometry를 가져왔습니다.'); }
    catch(cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { pendingRef.current=false;setPending(false); }
  }
  async function requestCameraScope() {
    const stage=stageRef.current, source=propsRef.current.scene; if(!stage||!source)return;
    const plane=new THREE.Plane(new THREE.Vector3(0,0,1),-stage.controls.target.z), ray=new THREE.Raycaster();
    const points:THREE.Vector3[]=[];
    for(const x of [-1,1]) for(const y of [-1,1]) { ray.setFromCamera(new THREE.Vector2(x,y),stage.camera);const point=ray.ray.intersectPlane(plane,new THREE.Vector3());if(point)points.push(point); }
    if(points.length!==4) { setError('XY 영역을 가져오려면 위 또는 입체 보기를 사용하세요.');return; }
    const xs=points.map(point=>point.x/source.dbu_um),ys=points.map(point=>point.y/source.dbu_um);
    const local=[Math.floor(Math.min(...xs)),Math.floor(Math.min(...ys)),Math.ceil(Math.max(...xs)),Math.ceil(Math.max(...ys))];
    if(local.some(value=>!Number.isSafeInteger(value))) { setError('현재 카메라 영역이 안전한 DBU 변환 범위를 초과합니다.');return; }
    const bounds=local.map((value,index)=>String(stage.frame.origin[index%2]+BigInt(value))) as [string,string,string,string];
    await requestScope(bounds,displayRef.current.renderLimit??2000);
  }
  async function focusInstance(id:string,fetch=true) {
    const stage=stageRef.current, source=propsRef.current.scene;if(!stage||!source)return;
    const instance=source.instances?.find(instance=>instance.id===id);
    if(!instance?.bbox) { setNote('이 instance의 실제 worker bbox가 없습니다.');return; }
    const [x1,y1,x2,y2]=instance.bbox;
    if(decimalCoordinate(x1)>decimalCoordinate(x2)||decimalCoordinate(y1)>decimalCoordinate(y2)){setNote('이 instance에는 표시할 도형이 없습니다.');return;}
    stage.focusBounds=new THREE.Box3(new THREE.Vector3(deltaUm(x1,stage.frame.origin[0],source.dbu_um),deltaUm(y1,stage.frame.origin[1],source.dbu_um),0),new THREE.Vector3(deltaUm(x2,stage.frame.origin[0],source.dbu_um),deltaUm(y2,stage.frame.origin[1],source.dbu_um),stage.maxZ));
    stage.fit(undefined,true);
    if(fetch&&propsRef.current.onRequestScope)await requestScope(instance.bbox,displayRef.current.renderLimit??2000);
  }
  function focusShape(id:string) {
    const stage=stageRef.current, source=propsRef.current.scene;if(!stage||!source)return;
    propsRef.current.onSelect(id);
    const shape=source.shapes.find(shape=>shape.id===id);if(!shape)return;
    const x=shape.polygon.map(point=>decimalCoordinate(point[0])),y=shape.polygon.map(point=>decimalCoordinate(point[1]));
    const min=(values:bigint[])=>values.reduce((a,b)=>a<b?a:b),max=(values:bigint[])=>values.reduce((a,b)=>a>b?a:b);
    const bbox:[string,string,string,string]=[String(min(x)),String(min(y)),String(max(x)),String(max(y))];
    const index=source.layers.findIndex(layer=>layer.id===shape.layer_id),bottom=layerZ(source,shape.layer_id,index,displayRef.current,mode),thickness=source.layers[index]?.thickness_display_um??0;
    stage.focusBounds=new THREE.Box3(new THREE.Vector3(deltaUm(bbox[0],stage.frame.origin[0],source.dbu_um),deltaUm(bbox[1],stage.frame.origin[1],source.dbu_um),bottom),new THREE.Vector3(deltaUm(bbox[2],stage.frame.origin[0],source.dbu_um),deltaUm(bbox[3],stage.frame.origin[1],source.dbu_um),bottom+thickness));
    stage.fit(undefined,true);
    if(stage.batch&&!stage.batch.records.has(id)) {
      updateDisplay({scopeCentre:[String((min(x)+max(x))/2n),String((min(y)+max(y))/2n)]});
      if(propsRef.current.onRequestScope)void requestScope(bbox,displayRef.current.renderLimit??2000);
    }
  }
  async function execute(command: LayoutCommand) {
    if (propsRef.current.readOnly) { setError('읽기 전용 설계: 편집 기능이 비활성화되어 있습니다.'); return false; }
    if (pendingRef.current) return false;
    const source = propsRef.current.scene;
    if(source&&'layer_id' in command&&displayLayer(source,displayRef.current,command.layer_id).locked){setError('잠긴 레이어입니다. 레이어 잠금을 해제한 뒤 편집하세요.');return false;}
    if (source && (command.type === 'move_shape' || command.type === 'delete_shape')) {
      const shape = source.shapes.find(item => item.id === command.id);
      if (shape && displayLayer(source, displayRef.current, shape.layer_id).locked) {
        setError('잠긴 레이어입니다. 레이어 잠금을 해제한 뒤 편집하세요.');
        return false;
      }
    }
    pendingRef.current = true; setPending(true); setError(null);
    try {
      await propsRef.current.onCommand(command);
      setNote('worker가 명령을 저장했습니다. DRC는 검증 실행 후 확인하세요.');return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));return false;
    } finally { pendingRef.current = false; setPending(false); }
  }

  useEffect(()=>{if(tool==='route'&&!conductorLayers.has(editLayer))setEditLayer(scene?.layers.find(l=>conductorLayers.has(l.id))?.id??'');},[tool,editLayer,scene]);
  useEffect(() => {
    if (scene && !scene.layers.some(layer => layer.id === editLayer)) setEditLayer((tool==='route'?scene.layers.find(l=>conductorLayers.has(l.id)):scene.layers[0])?.id ?? '');
  }, [scene, editLayer,tool]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    setError(null);
    const canvas = document.createElement('canvas');
    canvas.className = 'mos-viewer-canvas';
    canvas.setAttribute('aria-label', mode === '2d' ? '정수 DBU 레이아웃 2D 뷰' : '실제 레이아웃 레이어 3D 뷰');
    canvas.tabIndex = 0;
    const context = canvas.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: true });
    if (!context) { setError('WebGL2를 사용할 수 없습니다. GPU 가속과 그래픽 드라이버를 확인하세요. WebGPU backend는 아직 지원하지 않습니다.'); return; }
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, preserveDrawingBuffer: true }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const applyAppearance = () => {
      const color = getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim() || '#0a1424';
      renderer.setClearColor(color);
      canvas.dataset.appearanceBackground = color;
    };
    applyAppearance();
    renderer.localClippingEnabled = true;
    host.appendChild(canvas);
    const world = new THREE.Scene();
    const content = new THREE.Group(); content.name = 'authoritative-layout-display';
    const markerGroup = new THREE.Group(); markerGroup.name = 'verification-markers';
    const caps = new THREE.Group(); caps.name = 'computed-layout-intersection-caps';
    const presenceGroup = new THREE.Group(); presenceGroup.name = 'remote-selection-overlays';
    const currents=new THREE.Group();currents.name='source-mapped-conventional-current';
    const annotations = new THREE.Group(); annotations.name = 'actual-layout-labels-and-pins';
    const preview=new THREE.Group();preview.name='unsubmitted-drawing-preview';
    world.add(preview,content, markerGroup, caps, presenceGroup, annotations,currents, new THREE.AmbientLight('#ffffff', 1.35));
    const light = new THREE.DirectionalLight('#d9eaff', 2.1); light.position.set(3, -4, 10); world.add(light);
    const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.001, 1e6);
    camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true; controls.dampingFactor = 0.1;
    controls.enableRotate = mode === '3d';
    controls.screenSpacePanning = true;
    controls.mouseButtons = { LEFT: mode === '2d' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    const stage: Stage = { renderer, scene: world, content, markers: markerGroup, caps, capBatch: null, presenceGroup, annotations,currents,preview, shapes: [], batch: null, camera, controls,
      frame: { origin: [0n, 0n], dbuUm: 0.001, boundsUm: [-1, -1, 1, 1] }, extent: 10, viewHeight: 13, maxZ: 1,
      cleanup: () => {}, fit: () => {}, setProjection: () => {} };
    stageRef.current = stage;
    const resize = () => {
      const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      if (stage.camera instanceof THREE.PerspectiveCamera) stage.camera.aspect = width / height;
      else {
        const half = stage.viewHeight / 2;
        stage.camera.left = -half * width / height; stage.camera.right = half * width / height;
        stage.camera.top = half; stage.camera.bottom = -half;
      }
      stage.camera.updateProjectionMatrix();
      // setSize clears the drawing buffer. Paint immediately so resize/capture cannot expose a blank frame.
      renderer.render(world, stage.camera);
    };
    stage.fit = (preset, preserveOrientation = false) => {
      const source = propsRef.current.scene;
      if (source) for (const shape of stage.shapes) {
        const layer = source.layers[shape.layerIndex];
        const style = displayLayer(source, displayRef.current, shape.layerId);
        shape.group.visible = style.visible && style.opacity > 0;
        shape.group.position.z = layerZ(source, shape.layerId, shape.layerIndex, displayRef.current, mode) + (mode === '2d' ? layer.thickness_display_um : 0);
      }
      stage.content.updateMatrixWorld(true);
      const bounds = stage.focusBounds?.clone() ?? stage.batch?.bounds() ?? new THREE.Box3();
      if (!stage.focusBounds) for (const shape of stage.shapes) if (shape.group.visible) bounds.union(new THREE.Box3().setFromObject(shape.mesh));
      if (bounds.isEmpty()) bounds.set(new THREE.Vector3(-1, -1, 0), new THREE.Vector3(1, 1, 1));
      const size = bounds.getSize(new THREE.Vector3());
      const target = bounds.getCenter(new THREE.Vector3());
      const previousDirection = stage.camera.position.clone().sub(stage.controls.target).normalize();
      const chosen = mode === '2d' ? 'top' : preset ?? displayRef.current.preset ?? 'iso';
      const vector = preserveOrientation && mode === '3d' ? previousDirection : chosen === 'top' ? new THREE.Vector3(0, 0, 1) : chosen === 'front' ? new THREE.Vector3(0, -1, 0) : chosen === 'side' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(1.1, -1.4, 1.2).normalize();
      const aspect = Math.max(0.01, host.clientWidth / Math.max(1, host.clientHeight));
      const radius = Math.max(0.001, size.length() / 2);
      const field = stage.camera instanceof THREE.PerspectiveCamera ? Math.atan(Math.tan(THREE.MathUtils.degToRad(stage.camera.fov / 2)) * Math.min(1, aspect)) : Math.PI / 4;
      const distance = radius / Math.sin(field) * 1.2;
      if (!preserveOrientation || mode === '2d') stage.camera.up.set(0, chosen === 'top' ? 1 : 0, chosen === 'top' ? 0 : 1);
      stage.camera.position.copy(target).addScaledVector(vector, distance);
      stage.camera.near = Math.max(0.000001, distance / 1e5); stage.camera.far = distance * 100;
      if (stage.camera instanceof THREE.OrthographicCamera) stage.camera.zoom = 1;
      stage.controls.target.copy(target); stage.controls.update(); stage.camera.updateMatrixWorld(true);
      let projectedWidth = 0, projectedHeight = 0;
      const projected = new THREE.Box3();
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        projected.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(stage.camera.matrixWorldInverse));
      }
      projectedWidth = projected.max.x - projected.min.x;
      projectedHeight = projected.max.y - projected.min.y;
      stage.viewHeight = Math.max(0.01, projectedHeight, projectedWidth / aspect) * 1.18;
      resize();
    };
    stage.setProjection = projection => {
      const isPerspective = stage.camera instanceof THREE.PerspectiveCamera;
      if ((projection === 'perspective') === isPerspective) return;
      const next = projection === 'perspective' ? new THREE.PerspectiveCamera(40, 1, 0.001, 1e6) : new THREE.OrthographicCamera(-5, 5, 5, -5, 0.001, 1e6);
      next.position.copy(stage.camera.position); next.up.copy(stage.camera.up);
      next.near = stage.camera.near; next.far = stage.camera.far;
      const target = stage.controls.target.clone();
      stage.controls.dispose(); stage.camera = next;
      stage.controls = new OrbitControls(next, canvas); stage.controls.target.copy(target);
      stage.controls.enableDamping = true; stage.controls.enableRotate = mode === '3d';
      stage.controls.screenSpacePanning = true;
      stage.controls.mouseButtons = { LEFT: mode === '2d' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
      stage.controls.update(); resize();
      stage.fit(undefined, true);
    };
    const observer = new ResizeObserver(resize); observer.observe(host); resize(); stage.fit();
    const appearanceObserver = new MutationObserver(() => {
      applyAppearance();
      const styles = getComputedStyle(document.documentElement);
      currents.traverse(item => { if (item instanceof THREE.ArrowHelper) item.setColor(styles.getPropertyValue(item.userData.direction === 'reverse' ? '--yellow' : '--green').trim() || (item.userData.direction === 'reverse' ? '#ffd37a' : '#6bf5be')); });
      renderer.render(world, stage.camera);
    });
    appearanceObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-skin'] });
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let down: [number, number] | null = null;
    function setRay(event: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      raycaster.setFromCamera(pointer, stage.camera);
    }
    function pick(event: PointerEvent): RenderShape | { id: string; layerIndex: number } | undefined {
      const source = propsRef.current.scene;
      if (!source) return;
      setRay(event);
      if (stage.batch) {
        const candidates = raycaster.intersectObjects(stage.batch.pickObjects(), false).filter(hit =>
          pointSurvivesClip([hit.point.x, hit.point.y, hit.point.z], displayRef.current.clip, stage.frame.boundsUm, stage.maxZ))
          .map(hit => ({ hit, shape: stage.batch!.identify(hit) })).filter(item => !!item.shape);
        if (!candidates.length) return;
        const closest = candidates[0].hit.distance;
        return candidates.filter(item => item.hit.distance - closest <= Math.max(1e-7, stage.frame.dbuUm * .001))
          .sort((a, b) => b.shape!.layerIndex - a.shape!.layerIndex || a.shape!.id.localeCompare(b.shape!.id))[0].shape;
      }
      const objects = stage.shapes.filter(shape => isPickable(displayLayer(source, displayRef.current, shape.layerId))).map(shape => shape.mesh);
      const candidates: { shape: RenderShape; distance: number }[] = [];
      for (const hit of raycaster.intersectObjects(objects, false)) {
        if (!pointSurvivesClip([hit.point.x, hit.point.y, hit.point.z], displayRef.current.clip, stage.frame.boundsUm, stage.maxZ)) continue;
        const shape = stage.shapes.find(shape => shape.mesh === hit.object);
        if (shape) candidates.push({ shape, distance: hit.distance });
      }
      if (!candidates.length) return;
      // Multiple GDS purposes can share a display surface. Resolve float32 cap ties identically in 2D and 3D.
      const closest = Math.min(...candidates.map(item => item.distance));
      return candidates.filter(item => item.distance - closest <= Math.max(1e-7, stage.frame.dbuUm * 0.001))
        .sort((a, b) => b.shape.layerIndex - a.shape.layerIndex || a.shape.id.localeCompare(b.shape.id))[0].shape;
    }
    const pointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if(['box','polygon','route'].includes(toolRef.current)){event.preventDefault();event.stopImmediatePropagation();down=[event.clientX,event.clientY];canvas.focus({preventScroll:true});return;}
      down = [event.clientX, event.clientY];
      canvas.focus({ preventScroll: true });
      if (toolRef.current !== 'move' || pendingRef.current || propsRef.current.readOnly) return;
      const shape = pick(event);
      if (!shape) return;
      propsRef.current.onSelect(shape.id);
      if (!('group' in shape)) { setNote('대규모 instance 선택: 이동 값 명령으로 정수 DBU를 편집하세요.'); return; }
      setRay(event);
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -shape.group.position.z);
      const start = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
      if (!start) return;
      dragRef.current = { shape, start, initial: shape.group.position.clone(), plane, dx: '0', dy: '0' };
      canvas.setPointerCapture(event.pointerId);
    };
    function canvasPoint(event:PointerEvent):DecimalPoint|null{
      const source=propsRef.current.scene;if(!source)return null;setRay(event);const p=raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),0),new THREE.Vector3());if(!p)return null;
      return drawingPoint(p.x,p.y,stage.frame,source.grid_dbu??1);
    }
    let lastCursor = 0;
    const pointerMove = (event: PointerEvent) => {
      const source = propsRef.current.scene;
      if(['box','polygon','route'].includes(toolRef.current)&&!pendingRef.current){try{setDrawCursor(canvasPoint(event));}catch(cause){setError(String(cause));}}
      if (source && propsRef.current.onCursorMove && performance.now() - lastCursor > 45) {
        lastCursor = performance.now(); setRay(event);
        const selected = source.shapes.find(shape => shape.id === propsRef.current.selection);
        const index = source.layers.findIndex(layer => layer.id === selected?.layer_id);
        const z = index >= 0 ? layerZ(source, source.layers[index].id, index, displayRef.current, mode) : 0;
        const point = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -z), new THREE.Vector3());
        if (point) try {
          propsRef.current.onCursorMove({ x: String(stage.frame.origin[0] + decimalCoordinate(snappedDelta(point.x, source.dbu_um, source.grid_dbu ?? 1))),
            y: String(stage.frame.origin[1] + decimalCoordinate(snappedDelta(point.y, source.dbu_um, source.grid_dbu ?? 1))), ...(selected ? { layer_id: selected.layer_id } : {}) });
        } catch { /* Off-range display cursor is not a geometry command. */ }
      }
      const drag = dragRef.current;
      if (!drag || !propsRef.current.scene) return;
      setRay(event);
      const current = raycaster.ray.intersectPlane(drag.plane, new THREE.Vector3());
      if (!current) return;
      try {
        const grid = propsRef.current.scene.grid_dbu ?? 1;
        drag.dx = snappedDelta(current.x - drag.start.x, stage.frame.dbuUm, grid);
        drag.dy = snappedDelta(current.y - drag.start.y, stage.frame.dbuUm, grid);
        drag.shape.group.position.x = drag.initial.x + Number(drag.dx) * stage.frame.dbuUm;
        drag.shape.group.position.y = drag.initial.y + Number(drag.dy) * stage.frame.dbuUm;
        setNote(`이동 미리보기: ΔX ${drag.dx}, ΔY ${drag.dy} DBU · 놓으면 worker 명령 제출`);
      } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    };
    const cancelDrag = () => {
      const drag = dragRef.current;
      if (drag) drag.shape.group.position.copy(drag.initial);
      dragRef.current = null; down = null;
    };
    const pointerUp = (event: PointerEvent) => {
      if(event.button!==0)return;
      if(['box','polygon','route'].includes(toolRef.current)){
        event.preventDefault();event.stopImmediatePropagation();const start=down;down=null;
        if(!start||Math.hypot(event.clientX-start[0],event.clientY-start[1])>5||pendingRef.current||propsRef.current.readOnly)return;
        try{const p=canvasPoint(event),d=drawRef.current;if(!p)return;const kind=toolRef.current as DrawTool;
          if(kind==='polygon'&&d.points.length>=3&&p[0]===d.points[0][0]&&p[1]===d.points[0][1]){void finishDrawing();return;}
          const next=appendDrawingPoint(d.points,p,kind,d.order);if(next.length===d.points.length)return;drawHistory.current.push(d.points.length);d.points=next;setDraft(next);setDrawCursor(p);if(kind==='box'&&next.length===2)void finishDrawing(next);
        }catch(cause){setError(cause instanceof Error?cause.message:String(cause));}return;
      }
      const drag = dragRef.current;
      if (drag) {
        drag.shape.group.position.copy(drag.initial); dragRef.current = null;
        if (drag.dx !== '0' || drag.dy !== '0') void execute({ type: 'move_shape', id: drag.shape.id, dx: drag.dx, dy: drag.dy });
        down = null; return;
      }
      if (!down || Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 5) { down = null; return; }
      down = null;
      propsRef.current.onSelect(pick(event)?.id ?? null);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { cancelDrag();clearDrawing();setError(null);setNote('그리기를 취소했습니다.');setTool('select');toolRef.current='select'; propsRef.current.onSelect(null); }
      if(['box','polygon','route'].includes(toolRef.current)&&!pendingRef.current){
        if(event.key==='Enter'){event.preventDefault();event.stopPropagation();void finishDrawing();}
        if(event.key==='Backspace'){event.preventDefault();event.stopPropagation();const count=drawHistory.current.pop()??0;drawRef.current.points=drawRef.current.points.slice(0,count);setDraft(drawRef.current.points);}
        if(event.code==='Space'&&toolRef.current==='route'){event.preventDefault();setDrawOrder(order=>order==='x-first'?'y-first':'x-first');}
      }
      if (event.key.toLowerCase() === 'f') { stage.focusBounds=undefined; stage.fit(); }
    };
    const contextLost = (event: Event) => { event.preventDefault(); setError('WebGL2 context가 중단되었습니다. 화면을 다시 열거나 GPU 드라이버를 확인하세요. 설계는 worker에 보존됩니다.'); };
    const pointerLeave = () => propsRef.current.onCursorMove?.(null);
    canvas.addEventListener('pointerdown', pointerDown,true);
    canvas.addEventListener('pointermove', pointerMove);
    canvas.addEventListener('pointerup', pointerUp,true);
    canvas.addEventListener('pointercancel', cancelDrag);
    canvas.addEventListener('keydown', keydown);
    canvas.addEventListener('webglcontextlost', contextLost);
    canvas.addEventListener('pointerleave', pointerLeave);
    let animation = 0, lastInfo = 0;
    const render = (time: number) => {
      stage.controls.enabled = toolRef.current !== 'move';
      stage.controls.update();
      stage.batch?.cull(stage.camera);
      stage.capBatch?.cull(stage.camera);
      renderer.render(world, stage.camera);
      for (const peer of propsRef.current.presence ?? []) {
        const label = peerLabelRefs.current.get(peer.peerId);
        if (!label || !peer.cursor || !propsRef.current.scene) { if (label) label.hidden = true; continue; }
        try {
          const source = propsRef.current.scene;
          const index = source.layers.findIndex(layer => layer.id === peer.cursor!.layer_id);
          const z = index >= 0 ? layerZ(source, source.layers[index].id, index, displayRef.current, mode) + source.layers[index].thickness_display_um : 0;
          const point = new THREE.Vector3(deltaUm(peer.cursor.x, stage.frame.origin[0], source.dbu_um), deltaUm(peer.cursor.y, stage.frame.origin[1], source.dbu_um), z);
          const projected = point.project(stage.camera);
          label.hidden = projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1;
          label.style.transform = `translate(${(projected.x + 1) * host.clientWidth / 2}px,${(1 - projected.y) * host.clientHeight / 2}px)`;
        } catch { label.hidden = true; }
      }
      for(const item of flowLabelsRef.current) {
        const label=flowLabelRefs.current.get(item.id);if(!label)continue;
        const projected=item.position.clone().project(stage.camera);
        label.hidden=projected.z< -1||projected.z>1||Math.abs(projected.x)>1||Math.abs(projected.y)>1;
        label.style.transform=`translate(${(projected.x+1)*host.clientWidth/2}px,${(1-projected.y)*host.clientHeight/2}px)`;
      }
      if (time - lastInfo > 160) {
        lastInfo = time;
        const height = Math.max(1, host.clientHeight);
        const umPerPixel = stage.camera instanceof THREE.OrthographicCamera ? (stage.camera.top - stage.camera.bottom) / stage.camera.zoom / height :
          2 * stage.camera.position.distanceTo(stage.controls.target) * Math.tan(THREE.MathUtils.degToRad(stage.camera.fov / 2)) / height;
        const scale = niceScale(umPerPixel * 90);
        if (scaleBarRef.current) scaleBarRef.current.style.width = `${Math.max(1, scale / umPerPixel)}px`;
        if (scaleLabelRef.current) scaleLabelRef.current.textContent = scale >= 1000 ? `${+(scale / 1000).toPrecision(3)} mm` : `${+scale.toPrecision(3)} µm`;
        if (viewInfoRef.current) viewInfoRef.current.textContent = stage.batch ? `WebGL2 · ${stage.batch.stats.shapes.toLocaleString()} exact shapes · ${renderer.info.render.calls} draw calls · ${stage.batch.stats.culledBatches} tiles culled` : `WebGL2 · ${renderer.info.render.triangles.toLocaleString()} triangles · ${stage.shapes.filter(shape => shape.group.visible).length} shapes`;
      }
      animation = window.requestAnimationFrame(render);
    };
    animation = window.requestAnimationFrame(render);
    stage.cleanup = () => {
      window.cancelAnimationFrame(animation); observer.disconnect(); appearanceObserver.disconnect(); stage.controls.dispose();
      cancelDrag(); stage.cancelBuild?.(); if (stage.batch) { content.remove(stage.batch.group); stage.batch.dispose(); stage.batch = null; }
      if (stage.capBatch) { caps.remove(stage.capBatch.group); stage.capBatch.dispose(); stage.capBatch = null; }
      disposeGroup(content); disposeGroup(markerGroup); disposeGroup(caps); disposeGroup(presenceGroup); disposeGroup(annotations);disposeGroup(currents);disposeGroup(preview);
      canvas.removeEventListener('pointerdown', pointerDown,true); canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', pointerUp,true); canvas.removeEventListener('pointercancel', cancelDrag);
      canvas.removeEventListener('keydown', keydown); canvas.removeEventListener('webglcontextlost', contextLost);
      canvas.removeEventListener('pointerleave', pointerLeave);
      renderer.dispose(); renderer.forceContextLoss(); canvas.remove(); stageRef.current = null;
    };
    return stage.cleanup;
  }, [mode]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !scene) return;
    const sourceScope=(scene as Scene & {bounds_filter?:[string,string,string,string]|null}).bounds_filter?.join(',')??'';
    const sourceTag = `${scene.project_id}:${scene.revision}:${mode}:${display.renderLimit ?? 2000}:${display.scopeCentre?.join(',')??''}:${scene.shapes.length}:${scene.shapes[0]?.id}:${scene.shapes.at(-1)?.id}:${sourceScope}`;
    if (stage.sourceTag === sourceTag) return;
    if (!stage.sourceTag?.startsWith(`${scene.project_id}:`)) stage.focusBounds=undefined;
    stage.sourceTag = sourceTag;
    try {
      stage.cancelBuild?.(); stage.cancelBuild=undefined;
      if (stage.batch) { stage.content.remove(stage.batch.group); stage.batch.dispose(); stage.batch = null; }
      disposeGroup(stage.content); stage.shapes = [];
      const previousFrame=stage.frame,nextFrame=sceneFrame(scene);
      if(stage.focusBounds) {
        if(previousFrame.dbuUm===nextFrame.dbuUm)stage.focusBounds.translate(new THREE.Vector3(deltaUm(String(previousFrame.origin[0]),nextFrame.origin[0],scene.dbu_um),deltaUm(String(previousFrame.origin[1]),nextFrame.origin[1],scene.dbu_um),0));
        else stage.focusBounds=undefined;
      }
      stage.frame = nextFrame;
      const [x1, y1, x2, y2] = stage.frame.boundsUm;
      stage.extent = Math.max(x2 - x1, y2 - y1, 0.01);
      stage.content.userData = { project_id: scene.project_id, revision: scene.revision, dbu_um: scene.dbu_um,
        origin_dbu: stage.frame.origin.map(String), units: 'micrometre', warning: 'Display extrusion only. Not a physical process model or layout interchange.' };
      if (largeScene) {
        let canceled = false;
        stage.cancelBuild = () => { canceled=true;stage.batch?.dispose(); };
        setBuildProgress({ built: 0, total: scene.shapes.length });
        void (async () => {
          const sourceTagAtBuild=stage.sourceTag;
          const centre=displayRef.current.scopeCentre?.map((value,index)=>deltaUm(value,stage.frame.origin[index],scene.dbu_um)) as [number,number]|undefined;
          const scoped = scene.truncated && scene.shapes.length<=(displayRef.current.renderLimit??2000) ? scene : await scopedScene(scene,stage.frame,displayRef.current.renderLimit??2000,Math.max(.5,hostRef.current!.clientWidth/Math.max(1,hostRef.current!.clientHeight)),()=>canceled||stage.sourceTag!==sourceTagAtBuild,(built,total)=>{if(!canceled&&stage.sourceTag===sourceTagAtBuild)setBuildProgress({built,total});},centre);
          if(canceled||stage.sourceTag!==sourceTagAtBuild||stageRef.current!==stage) return;
          const batch = new BatchedScene(scoped, stage.frame, mode); stage.batch = batch; stage.content.add(batch.group);
          await batch.build((built, total) => { if (stageRef.current === stage && stage.batch === batch) setBuildProgress({ built, total }); });
          if (stageRef.current !== stage || stage.batch !== batch || canceled) return;
          batch.apply(displayRef.current, propsRef.current.selection);
          stage.maxZ = Math.max(.001, ...scene.layers.map((layer, index) => layerZ(scene, layer.id, index, displayRef.current, mode) + layer.thickness_display_um));
          stage.setProjection(mode === '2d' ? 'orthographic' : displayRef.current.projection); stage.fit();
          stage.renderer.domElement.dataset.geometryBuildMs = String(batch.stats.buildMs);
          stage.renderer.domElement.dataset.geometryCacheCount = String(batch.stats.cachedGeometries);
          stage.renderer.domElement.dataset.spatialBatchCount = String(batch.stats.batches);
          stage.renderer.domElement.dataset.totalShapes = String(sourceShapeCount);
          stage.renderer.domElement.dataset.visibleShapes = String(batch.stats.shapes);
          setBuildReady(value=>value+1);
          setBuildProgress(null); setNote(`정확한 표시 영역 ${batch.stats.shapes.toLocaleString()} / 원본 ${sourceShapeCount.toLocaleString()} 도형 · ${batch.stats.cachedGeometries} mesh cache · ${batch.stats.batches} spatial batches · ${batch.stats.buildMs.toFixed(0)} ms build`);
        })().catch(cause => { if (stageRef.current === stage) { setError(String(cause)); setBuildProgress(null); } });
        return;
      }
      setBuildProgress(null);
      for (const shape of scene.shapes) {
        const layerIndex = scene.layers.findIndex(layer => layer.id === shape.layer_id);
        if (layerIndex < 0) throw new Error(`정의되지 않은 layer ${shape.layer_id}: ${shape.id}`);
        const layer = scene.layers[layerIndex];
        const polygon = polygonShape(shape.polygon, shape.holes, stage.frame);
        const geometry = mode === '2d' ? new THREE.ShapeGeometry(polygon) :
          new THREE.ExtrudeGeometry(polygon, { depth: Math.max(0.00001, layer.thickness_display_um), bevelEnabled: false, steps: 1 });
        const material = new THREE.MeshStandardMaterial({ color: layer.color, side: THREE.DoubleSide, roughness: 0.65, metalness: 0.05, transparent: true,
          opacity: layer.opacity, depthWrite: layer.opacity >= 1, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
        const mesh = new THREE.Mesh(geometry, material); mesh.name = shape.id;
        mesh.userData = { stable_id: shape.id, cell_path: shape.cell_path, layer_id: shape.layer_id, net: shape.net ?? null, device_id: shape.device_id ?? null };
        const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: layer.color, transparent: true, opacity: 0.45 }));
        const group = new THREE.Group(); group.name = `occurrence:${shape.id}`; group.add(mesh, outline); stage.content.add(group);
        stage.shapes.push({ id: shape.id, layerId: shape.layer_id, layerIndex, net: shape.net, group, mesh, outline });
      }
      stage.maxZ = Math.max(0.001, ...scene.layers.map((layer, index) => layerZ(scene, layer.id, index, displayRef.current, mode) + layer.thickness_display_um));
      stage.setProjection(mode === '2d' ? 'orthographic' : displayRef.current.projection);
      stage.fit();
      setError(null);
      stage.renderer.domElement.dataset.totalShapes=String(sourceShapeCount);
      stage.renderer.domElement.dataset.visibleShapes=String(scene.shapes.length);
      setBuildReady(value=>value+1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }, [scene, mode, display.renderLimit, display.scopeCentre?.join(',')]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !scene) return;
    const maxZ = Math.max(0.001, ...scene.layers.map((layer, index) => layerZ(scene, layer.id, index, display, mode) + layer.thickness_display_um));
    stage.maxZ = maxZ;
    let planes: THREE.Plane[] = [];
    if (display.clip && display.clip.axis !== 'none') {
      const { axis, fraction, flip } = display.clip;
      const [low, high] = clipRange(axis, stage.frame.boundsUm, maxZ);
      const threshold = low + (high - low) * Math.max(0, Math.min(1, fraction));
      const normal = new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0).multiplyScalar(flip ? 1 : -1);
      planes = [new THREE.Plane(normal, flip ? -threshold : threshold)];
    }
    const net = display.highlightNet;
    stage.batch?.apply(display, selection, planes);
    for (const shape of stage.shapes) {
      const layer = displayLayer(scene, display, shape.layerId);
      shape.group.visible = layer.visible && layer.opacity > 0;
      // The 2D footprint sits on the same top surface as 3D so a shared Z clip has the same layer meaning.
      shape.group.position.z = layerZ(scene, shape.layerId, shape.layerIndex, display, mode) + (mode === '2d' ? scene.layers[shape.layerIndex].thickness_display_um : 0);
      const selected = shape.id === selection, highlighted = net != null && shape.net === net;
      const opacity = layer.opacity * (net != null && !highlighted && !selected ? 0.16 : 1);
      shape.mesh.material.color.set(layer.color);
      shape.mesh.material.opacity = opacity; shape.mesh.material.depthWrite = opacity >= 1;
      shape.mesh.material.emissive.set(selected ? '#64d7ff' : highlighted ? '#4ba3b5' : '#000000');
      shape.mesh.material.emissiveIntensity = selected ? 0.4 : 0.12;
      shape.mesh.material.clippingPlanes = planes;
      shape.outline.material.color.set(selected ? '#e5fbff' : highlighted ? '#8ff9e0' : layer.color);
      shape.outline.material.opacity = selected || highlighted ? 1 : 0.38 * opacity;
      shape.outline.material.clippingPlanes = planes;
      shape.mesh.material.needsUpdate = true; shape.outline.material.needsUpdate = true;
    }
    stage.setProjection(mode === '2d' ? 'orthographic' : display.projection ?? 'orthographic');
  }, [scene, mode, display, selection]);

  useEffect(() => {
    stageRef.current?.fit(undefined, true);
  }, [display.explode]);
  useEffect(()=>{
    const stage=stageRef.current;if(!stage)return;
    const scale=Math.max(.5,Math.min(1.5,display.resolutionScale??(largeScene?.75:1)));
    stage.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2)*scale);
    stage.renderer.domElement.dataset.resolutionScale=String(scale);
  },[display.resolutionScale,largeScene,mode]);

  useEffect(()=>{setFlowIndex(0);setFlowPlaying(false);setFlowBranchId(null);},[props.currentFlow]);
  useEffect(()=>{
    if(!flowPlaying||!props.currentFlow||props.currentFlow.x.length<2)return;
    const count=props.currentFlow.x.length,timer=window.setInterval(()=>setFlowIndex(index=>(index+1)%count),200);
    return ()=>window.clearInterval(timer);
  },[flowPlaying,props.currentFlow]);
  function focusCurrent(id:string) {
    const stage=stageRef.current,source=propsRef.current.scene,flow=propsRef.current.currentFlow;if(!stage||!source||!flow||!flowStatus(flow,source).active)return;
    const branch=flow.branches.find(branch=>branch.id===id);if(!branch?.path_dbu||branch.mapping==='unmapped')return;
    setFlowBranchId(id);
    const deviceShape=branch.device_id?source.shapes.find(shape=>shape.device_id===branch.device_id):undefined;
    if(deviceShape)propsRef.current.onSelect(deviceShape.id);
    const layerIndex=source.layers.findIndex(layer=>layer.id===branch.layer_id),z=layerIndex>=0?layerZ(source,branch.layer_id!,layerIndex,displayRef.current,mode)+source.layers[layerIndex].thickness_display_um+.003:0;
    const bounds=new THREE.Box3();for(const [x,y]of branch.path_dbu)bounds.expandByPoint(new THREE.Vector3(deltaUm(x,stage.frame.origin[0],source.dbu_um),deltaUm(y,stage.frame.origin[1],source.dbu_um),z));
    if(!bounds.isEmpty()){bounds.expandByScalar(Math.max(.02,stage.extent*.01));stage.focusBounds=bounds;stage.fit(undefined,true);}
  }
  useEffect(()=>{
    const stage=stageRef.current;if(!stage)return;disposeGroup(stage.currents);setFlowLabels([]);
    stage.renderer.domElement.dataset.currentArrowCount='0';stage.renderer.domElement.dataset.currentSample=String(flowIndex);
    const flow=props.currentFlow;if(!flow||!scene||!flowVisible||!flowStatus(flow,scene).active)return;
    const index=sampleIndex(flow,flowIndex),peak=flow.branches.filter(branch=>!flowBranchId||branch.id===flowBranchId).reduce((maximum,branch)=>Math.max(maximum,Math.abs(branchCurrent(branch,index)??0)),0),labels:typeof flowLabels=[];
    const [low,high]=display.clip&&display.clip.axis!=='none'?clipRange(display.clip.axis,stage.frame.boundsUm,stage.maxZ):[0,0];
    const threshold=low+(high-low)*(display.clip?.fraction??1),axis=display.clip?.axis,planes=axis&&axis!=='none'?[new THREE.Plane(new THREE.Vector3(axis==='x'?1:0,axis==='y'?1:0,axis==='z'?1:0).multiplyScalar(display.clip?.flip?1:-1),display.clip?.flip?-threshold:threshold)]:[];
    let arrows=0;
    for(const branch of flow.branches) {
      if(flowBranchId&&branch.id!==flowBranchId)continue;
      try {
        const value=branchCurrent(branch,index),path=currentPath(branch,value,stage.frame);if(!path||!peak)continue;
        const layerIndex=scene.layers.findIndex(layer=>layer.id===branch.layer_id);
        if(branch.layer_id&&layerIndex<0)continue;
        if(branch.layer_id){const style=displayLayer(scene,display,branch.layer_id);if(!style.visible||style.opacity<=0)continue;}
        const z=layerIndex>=0?layerZ(scene,branch.layer_id!,layerIndex,display,mode)+scene.layers[layerIndex].thickness_display_um+.003:0;
        const token=currentDirection(value)==='reverse'?'--yellow':'--green';
        const fallback=currentDirection(value)==='reverse'?'#ffd37a':'#6bf5be';
        const color=getComputedStyle(document.documentElement).getPropertyValue(token).trim()||fallback;
        for(let i=1;i<path.length;i++) {
          const start=new THREE.Vector3(path[i-1][0],path[i-1][1],z),end=new THREE.Vector3(path[i][0],path[i][1],z),direction=end.clone().sub(start),length=direction.length();if(length===0)continue;
          const arrowLength=length*Math.min(1,Math.abs(value!)/peak*flowScale);if(arrowLength<=0)continue;
          const arrow=new THREE.ArrowHelper(direction.normalize(),start,arrowLength,color,Math.min(arrowLength*.25,stage.extent*.025*flowScale),Math.min(arrowLength*.1,stage.extent*.009*flowScale));
          for(const material of [arrow.line.material,arrow.cone.material])for(const item of Array.isArray(material)?material:[material]){item.depthTest=false;item.clippingPlanes=planes;item.transparent=true;item.opacity=.96;}
          arrow.name=`current:${branch.id}:${i}`;arrow.renderOrder=110;arrow.line.renderOrder=110;arrow.cone.renderOrder=110;
          arrow.userData={branch_id:branch.id,source_vector:branch.source_vector,amperes:value,convention:'conventional',mapping:branch.mapping,direction:currentDirection(value),sample:index};stage.currents.add(arrow);arrows++;
        }
        const middle=Math.max(1,Math.ceil((path.length-1)/2)),position=new THREE.Vector3((path[middle-1][0]+path[middle][0])/2,(path[middle-1][1]+path[middle][1])/2,z);
        if(pointSurvivesClip([position.x,position.y,position.z],display.clip,stage.frame.boundsUm,stage.maxZ))labels.push({id:branch.id,text:`${branch.name} · ${formatCurrent(value)}`,position,color:`var(${token},${fallback})`});
      }catch{ /* Invalid imported paths remain table-only; never infer a replacement. */ }
    }
    setFlowLabels(labels);stage.renderer.domElement.dataset.currentArrowCount=String(arrows);
  },[props.currentFlow,scene,mode,flowIndex,flowVisible,flowScale,flowBranchId,display.layers,display.explode,display.clip,buildReady]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !scene || !props.focus) return;
    const { shapeId, cellPath,instanceId } = props.focus;
    if(instanceId) { const key=`${scene.project_id}:${scene.revision}:${props.focus.sequence}:${instanceId}`,fetch=focusRequestRef.current!==key;focusRequestRef.current=key;void focusInstance(instanceId,fetch);return; }
    if(stage.batch&&((shapeId&&!stage.batch.records.has(shapeId))||(cellPath&&stage.batch.bounds(undefined,cellPath).isEmpty()))) {
      const target=scene.shapes.find(shape=>(shapeId?shape.id===shapeId:true)&&(cellPath?shape.cell_path.startsWith(cellPath):true));
      if(target) {
        const points=target.polygon.map(([x,y])=>[decimalCoordinate(x),decimalCoordinate(y)]);
        const xs=points.map(point=>point[0]),ys=points.map(point=>point[1]);
        const min=(values:bigint[])=>values.reduce((a,b)=>a<b?a:b),max=(values:bigint[])=>values.reduce((a,b)=>a>b?a:b);
        const centre:[string,string]=[String((min(xs)+max(xs))/2n),String((min(ys)+max(ys))/2n)];
        if(centre.join(',')!==displayRef.current.scopeCentre?.join(',')) updateDisplay({scopeCentre:centre});
      }
      return;
    }
    const bounds = stage.batch?.bounds(shapeId, cellPath) ?? new THREE.Box3();
    if (!stage.batch) {
      const ids = new Set(scene.shapes.filter(shape => (shapeId ? shape.id === shapeId : true) && (cellPath ? shape.cell_path.startsWith(cellPath) : true)).map(shape => shape.id));
      for (const shape of stage.shapes) if (ids.has(shape.id)) bounds.union(new THREE.Box3().setFromObject(shape.mesh));
    }
    if (!bounds.isEmpty()) { stage.focusBounds = bounds; stage.fit(undefined, true); }
  }, [props.focus?.sequence, scene, buildReady]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    disposeGroup(stage.presenceGroup);
    for (const peer of props.presence ?? []) {
      if (!peer.selection) continue;
      const small = stage.shapes.find(shape => shape.id === peer.selection);
      const large = stage.batch?.records.get(peer.selection);
      const geometry = small?.mesh.geometry ?? large?.batch.mesh.geometry;
      if (!geometry || !scene) continue;
      const style=displayLayer(scene,display,small?.layerId??large!.record.shape.layer_id);if(!style.visible||style.opacity<=0)continue;
      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: peer.color, depthTest: false, transparent: true, opacity: .95 }));
      outline.material.clippingPlanes=small?.mesh.material.clippingPlanes??(large?.batch.mesh.material as THREE.MeshLambertMaterial|undefined)?.clippingPlanes??[];
      if (small) outline.position.copy(small.group.position);
      else if (large) { const matrix = new THREE.Matrix4(); large.batch.mesh.getMatrixAt(large.record.index, matrix); outline.applyMatrix4(matrix); outline.position.z += large.batch.mesh.position.z; }
      outline.name = `peer:${peer.peerId}:${peer.selection}`; outline.renderOrder = 101; stage.presenceGroup.add(outline);
    }
    stage.renderer.domElement.dataset.peerOutlineCount=String(stage.presenceGroup.children.length);
  }, [props.presence?.map(peer => `${peer.peerId}:${peer.selection}:${peer.color}`).join('|'), scene, display.explode, display.layers, display.clip, mode, buildReady]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !scene) return;
    disposeGroup(stage.annotations);
    const text = (value: string, x: number, y: number, z: number, color: string, stableId: string) => {
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 72;
      const context = canvas.getContext('2d')!; context.font = '36px sans-serif'; context.textBaseline = 'middle';
      context.fillStyle = '#0b1722cc'; context.fillRect(0,0,canvas.width,canvas.height); context.fillStyle = color; context.fillText(value,12,36,488);
      const texture = new THREE.CanvasTexture(canvas), material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
      const sprite = new THREE.Sprite(material); sprite.position.set(x,y,z); sprite.scale.set(stage.extent * .15,stage.extent * .021,1); sprite.renderOrder = 99;
      sprite.name = `label:${stableId}`; sprite.userData = { stable_id: stableId, source: 'actual-worker-label' }; stage.annotations.add(sprite);
    };
    if (display.showLabels !== false) for (const label of scene.labels ?? []) {
      const style = displayLayer(scene,display,label.layer_id), index = scene.layers.findIndex(layer => layer.id === label.layer_id);
      if (!style.visible || style.opacity <= 0 || index < 0) continue;
      const z = layerZ(scene,label.layer_id,index,display,mode) + scene.layers[index].thickness_display_um;
      const x = deltaUm(label.position[0],stage.frame.origin[0],scene.dbu_um), y = deltaUm(label.position[1],stage.frame.origin[1],scene.dbu_um);
      if (pointSurvivesClip([x,y,z],display.clip,stage.frame.boundsUm,stage.maxZ)) text(label.text,x,y,z,style.color,label.id);
    }
    if (display.showPins !== false) for (const pin of scene.pins ?? []) {
      const style = displayLayer(scene,display,pin.layer_id), index = scene.layers.findIndex(layer => layer.id === pin.layer_id);
      if (!style.visible || style.opacity <= 0 || index < 0) continue;
      const [x1,y1,x2,y2] = pin.box, z = layerZ(scene,pin.layer_id,index,display,mode) + scene.layers[index].thickness_display_um + .001;
      const a = [deltaUm(x1,stage.frame.origin[0],scene.dbu_um),deltaUm(y1,stage.frame.origin[1],scene.dbu_um)], b = [deltaUm(x2,stage.frame.origin[0],scene.dbu_um),deltaUm(y2,stage.frame.origin[1],scene.dbu_um)];
      const points = [[a[0],a[1]],[b[0],a[1]],[b[0],b[1]],[a[0],b[1]],[a[0],a[1]]].map(([x,y]) => new THREE.Vector3(x,y,z));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({ color:'#9eeaff',depthTest:false }));
      if (display.clip && display.clip.axis!=='none') {
        const {axis,fraction,flip}=display.clip, [low,high]=clipRange(axis,stage.frame.boundsUm,stage.maxZ), threshold=low+(high-low)*fraction;
        line.material.clippingPlanes=[new THREE.Plane(new THREE.Vector3(axis==='x'?1:0,axis==='y'?1:0,axis==='z'?1:0).multiplyScalar(flip?1:-1),flip?-threshold:threshold)];
      }
      line.name = `pin:${pin.id}`; line.renderOrder=98; stage.annotations.add(line);
      if (pin.name && pointSurvivesClip([(a[0]+b[0])/2,(a[1]+b[1])/2,z],display.clip,stage.frame.boundsUm,stage.maxZ)) text(pin.name,(a[0]+b[0])/2,(a[1]+b[1])/2,z,'#b7f5ff',pin.id);
    }
    stage.renderer.domElement.dataset.annotationCount=String(stage.annotations.children.length);
  }, [scene, mode, display.showLabels, display.showPins, display.layers, display.explode, display.clip?.axis, display.clip?.fraction, display.clip?.flip, buildReady]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !scene) return;
    let canceled = false;
    if (stage.capBatch) { stage.caps.remove(stage.capBatch.group); stage.capBatch.dispose(); stage.capBatch = null; }
    disposeGroup(stage.caps);
    const clip = display.clip;
    if (mode !== '3d' || !clip || clip.axis === 'none') { setCapsBuilding(false); return; }
    const axis = clip.axis;
    const capShapes=largeScene?scene.shapes.filter(shape=>stage.batch?.records.has(shape.id)):scene.shapes;
    const [low, high] = clipRange(axis, stage.frame.boundsUm, stage.maxZ);
    const threshold = low + (high - low) * clip.fraction;
    setCapsBuilding(true);
    const timer = window.setTimeout(() => { void (async () => {
      if (axis === 'z' && largeScene) {
        const layers = scene.layers.filter((layer, index) => {
          const bottom = layerZ(scene, layer.id, index, display, mode), style = displayLayer(scene, display, layer.id);
          return style.visible && threshold > bottom + 1e-9 && threshold < bottom + layer.thickness_display_um - 1e-9;
        }).map(layer => ({ ...layer, z_display_um: threshold - layer.thickness_display_um }));
        const ids = new Set(layers.map(layer => layer.id));
        const capSource = { ...scene, layers, shapes: capShapes.filter(shape => ids.has(shape.layer_id)) };
        const batch = new BatchedScene(capSource, stage.frame, '2d'); stage.capBatch = batch; stage.caps.add(batch.group);
        await batch.build(); if (canceled) return;
        batch.apply({ ...display, explode: 0, clip: { axis: 'none', fraction: 1 } }, null);
      } else for (let i = 0; i < capShapes.length && !canceled; i++) {
        const shape = capShapes[i], index = scene.layers.findIndex(layer => layer.id === shape.layer_id);
        const layer = scene.layers[index], style = displayLayer(scene, display, shape.layer_id);
        if (!style.visible || style.opacity <= 0) continue;
        const geometry = extrusionCap(shape, stage.frame, axis, threshold, layerZ(scene, layer.id, index, display, mode), layer.thickness_display_um);
        if (!geometry) continue;
        const material = new THREE.MeshStandardMaterial({ color: style.color, side: THREE.DoubleSide, roughness: .65, transparent: style.opacity < 1, opacity: style.opacity, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
        const cap = new THREE.Mesh(geometry, material); cap.name = `computed-cap:${shape.id}`;
        cap.userData = { stable_id: shape.id, source: 'polygon-extrusion-intersection', axis, threshold_display_um: threshold };
        stage.caps.add(cap);
        if (i % 1000 === 0) await new Promise<void>(resolve => window.setTimeout(resolve, 0));
      }
      if (!canceled) setCapsBuilding(false);
    })().catch(cause => { if (!canceled) { setError(String(cause)); setCapsBuilding(false); } }); }, 90);
    return () => { canceled = true; window.clearTimeout(timer); if (stage.capBatch) { stage.caps.remove(stage.capBatch.group); stage.capBatch.dispose(); stage.capBatch = null; } };
  }, [scene, mode, display.clip?.axis, display.clip?.fraction, display.clip?.flip, display.explode, display.layers, buildReady]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !scene) return;
    disposeGroup(stage.markers);
    for (const marker of markers) {
      const [x1, y1, x2, y2] = marker.bbox;
      const left = deltaUm(x1, stage.frame.origin[0], scene.dbu_um), right = deltaUm(x2, stage.frame.origin[0], scene.dbu_um);
      const bottom = deltaUm(y1, stage.frame.origin[1], scene.dbu_um), top = deltaUm(y2, stage.frame.origin[1], scene.dbu_um);
      const index = scene.layers.findIndex(layer => layer.id === marker.layer_id);
      const z = index >= 0 ? layerZ(scene, marker.layer_id!, index, display, mode) + scene.layers[index].thickness_display_um + 0.004 : stage.maxZ + 0.004;
      const geometry = new THREE.BufferGeometry().setFromPoints([[left, bottom], [right, bottom], [right, top], [left, top], [left, bottom]].map(([x, y]) => new THREE.Vector3(x, y, z)));
      const material = new THREE.LineBasicMaterial({ color: '#ff6374', depthTest: false });
      const box = new THREE.Line(geometry, material); box.name = `marker:${marker.id}`; box.renderOrder = 100;
      stage.markers.add(box);
    }
  }, [scene, markers, display.explode, mode]);

  const submitEdit = () => {
    try {
      const coord = (value: string) => String(decimalCoordinate(value));
      if (editor === 'move' && selection) void execute({ type: 'move_shape', id: selection, dx: coord(fields.dx), dy: coord(fields.dy) });
      if (editor === 'box') void execute({ type: 'add_box', layer_id: editLayer, box: [coord(fields.x1), coord(fields.y1), coord(fields.x2), coord(fields.y2)], ...(fields.net ? { net: fields.net } : {}) });
      if (editor === 'route') void execute({ type: 'add_route', layer_id: editLayer, points: manhattanPoints([coord(fields.x1), coord(fields.y1)], [coord(fields.x2), coord(fields.y2)]), width: coord(fields.width), ...(fields.net ? { net: fields.net } : {}) });
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const capture = () => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.renderer.render(stage.scene, stage.camera);
    stage.renderer.domElement.toBlob(blob => {
      if (blob) { triggerDownload(blob, `mos-layout-${scene?.revision ?? 'view'}.png`); setNote('현재 viewport PNG 저장. 레이어 표와 UI 문구는 PNG에 포함되지 않습니다.'); }
      else setError('PNG 생성에 실패했습니다.');
    }, 'image/png');
  };
  const exportMesh = async () => {
    const stage = stageRef.current;
    if (!stage) return;
    try {
      const exportGroup = new THREE.Group(); exportGroup.name = stage.content.name; exportGroup.userData = stage.content.userData;
      if (stage.batch) {
        if (stage.batch.stats.shapes > 20000) throw new Error('20,000 도형 초과 GLB 확장은 이 메모리 profile에서 지원하지 않습니다. GDS/OASIS를 사용하거나 더 작은 cell을 선택하세요.');
        exportGroup.add(stage.batch.group.clone());
      }
      for (const shape of stage.shapes.filter(shape => shape.group.visible)) {
        const mesh = shape.mesh.clone(); mesh.position.copy(shape.group.position); exportGroup.add(mesh);
      }
      // 1 display unit is 1 µm. glTF units are metres, so scale geometry at the export root.
      exportGroup.scale.setScalar(1e-6);
      const result = await new GLTFExporter().parseAsync(exportGroup, { binary: true, onlyVisible: true });
      if (!(result instanceof ArrayBuffer)) throw new Error('GLB binary 출력 생성에 실패했습니다.');
      triggerDownload(new Blob([result], { type: 'model/gltf-binary' }), `mos-display-${scene?.revision ?? 'view'}.glb`);
      setNote('GLB는 표시용 레이어 extrusion입니다. physical stack, GDS/OASIS 원본 또는 TCAD 모델이 아닙니다.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const selectNet = scene ? selectedNet(scene.shapes, selection) : null;
  const clipActive = display.clip?.axis !== undefined && display.clip.axis !== 'none';
  const input = (name: keyof typeof fields, label: string) => <label key={name}>{label}<input value={fields[name]} onChange={event => setFields({ ...fields, [name]: event.target.value })} inputMode={name === 'net' ? 'text' : 'numeric'} /></label>;

  return <div className={`mos-viewer mos-viewer-${mode}${paletteOpen ? ' mos-viewer-has-palette' : ''}`} data-testid={`layout-viewer-${mode}`} data-tool={tool}>
    <div className="mos-viewer-toolbar">
      <div className="mos-toolgroup">
        <button className={tool === 'select' ? 'active' : ''} onClick={() => chooseTool('select')} title="도형 선택, orbit/pan">선택</button>
        <button className={tool === 'move' ? 'active' : ''} disabled={!scene || pending || props.readOnly} onClick={() => { chooseTool('move'); setNote('도형을 XY 방향으로 드래그하세요. 표시 Z 높이는 설계 명령에 포함되지 않습니다.'); }} title={props.readOnly ? '읽기 전용 설계 · 편집 기능 비활성화' : 'XY grid 이동 미리보기 → typed worker 명령'}>XY 이동</button>
        {mode==='2d'&&(['box','polygon','route'] as const).map(kind=><button key={kind} data-testid={`layout-draw-${kind}`} aria-pressed={tool===kind} className={tool===kind?'active':''} disabled={!scene||pending||props.readOnly} onClick={()=>chooseTool(kind)}>{kind==='box'?'사각형':kind==='polygon'?'다각형':'배선 그리기'}</button>)}
        <button onClick={() => { if (stageRef.current) stageRef.current.focusBounds = undefined; stageRef.current?.fit(); }} title="전체 맞춤 (F)">맞춤</button>
      </div>
      <div className="mos-toolgroup">
        {(['top', 'front', 'side', 'iso'] as const).map(preset => <button key={preset} disabled={mode === '2d' && preset !== 'top'} onClick={() => { updateDisplay({ preset }); stageRef.current?.fit(preset); }}>{({ top: '위', front: '앞', side: '옆', iso: '입체' })[preset]}</button>)}
        <select aria-label="카메라 투영" value={mode === '2d' ? 'orthographic' : display.projection ?? 'orthographic'} disabled={mode === '2d'} onChange={event => updateDisplay({ projection: event.target.value as ViewerDisplay['projection'] })}><option value="orthographic">정사영</option><option value="perspective">원근</option></select>
      </div>
      <div className="mos-toolgroup mos-toolgroup-end">
        <button onClick={() => setPaletteOpen(!paletteOpen)} aria-expanded={paletteOpen}>레이어</button>
        <button disabled={!scene || !!error} onClick={capture}>PNG</button>
        <button disabled={!scene || mode !== '3d' || clipActive || !!error} onClick={() => void exportMesh()} title={clipActive ? 'clipping shader를 실제 잘린 GLB mesh로 내보내는 기능은 지원하지 않습니다. 단면을 끄세요.' : '표시용 extrusion mesh. GDS/OASIS는 프로젝트 교환 메뉴를 사용하세요.'}>GLB</button>
      </div>
    </div>
    {mode==='2d'&&['box','polygon','route'].includes(tool)&&<div className="mos-drawing-toolbar" aria-label="레이아웃 그리기 설정">
      <label>레이어<select aria-label="그리기 레이어" value={editLayer} disabled={pending} onChange={e=>setEditLayer(e.target.value)}>{scene?.layers.filter(l=>tool!=='route'||conductorLayers.has(l.id)).map(l=><option key={l.id} value={l.id}>{l.name} · {l.id}</option>)}</select></label>
      {tool==='route'&&<><label>폭 DBU<input aria-label="그리기 배선 폭" value={fields.width} disabled={pending} onChange={e=>setFields({...fields,width:e.target.value})}/></label><button disabled={pending} onClick={()=>setDrawOrder(o=>o==='x-first'?'y-first':'x-first')}>{drawOrder==='x-first'?'X → Y':'Y → X'} · Space</button></>}
      <label>Net<input aria-label="그리기 Net" value={fields.net} disabled={pending} onChange={e=>setFields({...fields,net:e.target.value})}/></label>
      <button data-testid="layout-draw-finish" disabled={pending||props.readOnly||draft.length<(tool==='polygon'?3:2)} onClick={()=>void finishDrawing()}>완료 · Enter</button><button disabled={pending} onClick={()=>chooseTool('select')}>취소 · Esc</button>
      <span data-testid="layout-drawing-status">{draft.length} points · grid {scene?.grid_dbu??1} DBU{drawCursor?` · X ${drawCursor[0]} Y ${drawCursor[1]}`:''} · 미저장 미리보기 / DRC 미실행</span>
    </div>}
    <div className="mos-viewer-stage">
      <div ref={hostRef} className="mos-viewer-host" />
      {flowLabels.map(item=><span key={item.id} className="mos-current-label" style={{color:item.color}} ref={element=>{if(element)flowLabelRefs.current.set(item.id,element);else flowLabelRefs.current.delete(item.id);}}>{item.text}</span>)}
      {(props.presence ?? []).map(peer => <span className="mos-viewer-peer" key={peer.peerId} ref={element => { if (element) peerLabelRefs.current.set(peer.peerId, element); else peerLabelRefs.current.delete(peer.peerId); }} style={{ color: peer.color }} hidden={!peer.cursor}>↖ {peer.name}</span>)}
      {!scene && <div className="mos-viewer-empty">레이아웃을 불러오면 정수 polygon을 표시합니다.</div>}
      {buildProgress && <div className="mos-viewer-build" role="status">정확한 geometry 준비 {buildProgress.built.toLocaleString()} / {buildProgress.total.toLocaleString()} <button onClick={() => { stageRef.current?.cancelBuild?.(); setBuildProgress(null); setNote('mesh 준비 취소됨. 설계 원본은 변경되지 않았습니다.'); }}>표시 준비 취소</button></div>}
      <div className="mos-viewer-view-label"><strong>{mode === '2d' ? 'LAYOUT 2D' : 'LAYER STACK 3D'}</strong><span>{props.sourceLabel ?? (scene?.source === 'pdk' ? 'PDK layout' : '교육용 fixture geometry')} · rev {scene?.revision ?? '—'}</span></div>
      {mode === '3d' && <div className="mos-viewer-stack-note">표시용 수직 extrusion · 공정 단면 / TCAD 아님<br />{scene?.layers.every(layer => layer.source !== 'illustrative') ? '높이 출처는 레이어 표에서 확인' : '레이어 높이 illustrative'}</div>}
      {paletteOpen && scene && <div className="mos-viewer-palette" aria-label="레이어 표시와 선택 설정">
        <div className="mos-palette-heading"><span>LAYERS</span><span>표시 · 선택 · 잠금</span></div>
        {scene.layers.map((layer, index) => {
          const style = displayLayer(scene, display, layer.id);
          return <div className="mos-layer-row" key={layer.id} data-layer={layer.id}>
            <input className="mos-layer-color" type="color" aria-label={`${layer.name} 색상`} value={/^#[0-9a-f]{6}$/i.test(style.color) ? style.color : '#8193ad'} onChange={event => updateLayer(layer.id, { color: event.target.value })} />
            <div className="mos-layer-name"><strong>{layer.name}</strong><small title={layer.source}>GDS {layer.gds.join('/')} · 표시 Z {layerZ(scene, layer.id, index, display, mode).toFixed(2)} µm</small>{layer.source!=='illustrative' && <small title={`실제 source: ${layer.source}`}>{layer.material ? `${layer.material} · ` : ''}{Number.isFinite(layer.physical_z_um) ? `physical Z ${layer.physical_z_um} µm · ` : ''}{Number.isFinite(layer.physical_thickness_um) ? `physical 두께 ${layer.physical_thickness_um} µm` : ''}</small>}</div>
            <input type="checkbox" aria-label={`${layer.name} 표시`} checked={style.visible} onChange={event => updateLayer(layer.id, { visible: event.target.checked })} />
            <input type="checkbox" aria-label={`${layer.name} 선택 허용`} checked={style.pickable} onChange={event => updateLayer(layer.id, { pickable: event.target.checked })} />
            <button className={style.locked ? 'active' : ''} aria-label={`${layer.name} 잠금`} aria-pressed={style.locked} onClick={() => updateLayer(layer.id, { locked: !style.locked })}>{style.locked ? '●' : '○'}</button>
            <input className="mos-layer-opacity" type="range" min="0" max="1" step="0.05" aria-label={`${layer.name} 투명도`} value={style.opacity} onChange={event => updateLayer(layer.id, { opacity: Number(event.target.value) })} />
          </div>;
        })}
      </div>}
      <div className="mos-viewer-scale"><span ref={scaleBarRef} className="mos-scale-bar" /><span ref={scaleLabelRef}>µm</span><small>{display.projection === 'perspective' && mode === '3d' ? 'target 평면 기준' : 'XY / view scale'}</small></div>
      <div className="mos-viewer-renderinfo"><span ref={viewInfoRef}>WebGL2</span></div>
    </div>
    <div className="mos-viewer-controls">
      {mode === '3d' && <label className="mos-viewer-slider">분해 <input aria-label="레이어 분해 간격" type="range" min="0" max="3" step="0.05" value={display.explode ?? 0} onChange={event => updateDisplay({ explode: Number(event.target.value) })} /><span>{(display.explode ?? 0).toFixed(2)} µm/layer</span></label>}
      <label>단면 <select aria-label="단면 축" value={display.clip?.axis ?? 'none'} onChange={event => updateDisplay({ clip: { ...display.clip, axis: event.target.value as 'none' | 'x' | 'y' | 'z', fraction: display.clip?.fraction ?? 1 } })}><option value="none">없음</option><option value="x">X</option><option value="y">Y</option>{mode === '3d' && <option value="z">Z</option>}</select></label>
      {clipActive && <><input aria-label="단면 위치" type="range" min="0" max="1" step="0.01" value={display.clip?.fraction ?? 1} onChange={event => updateDisplay({ clip: { ...display.clip!, fraction: Number(event.target.value) } })} /><button onClick={() => updateDisplay({ clip: { ...display.clip!, flip: !display.clip?.flip } })}>방향 반전</button><small className="mos-clip-warning">{mode === '2d' ? 'XY footprint clipping' : capsBuilding ? '교차 cap 계산 중…' : 'polygon 교차 cap'}</small></>}
      <button disabled={!selectNet && !display.highlightNet} className={display.highlightNet ? 'active' : ''} onClick={() => updateDisplay({ highlightNet: display.highlightNet ? null : selectNet })}>Net 강조</button>
      <button className={display.showLabels !== false ? 'active' : ''} onClick={() => updateDisplay({ showLabels: display.showLabels === false })}>Labels</button>
      <button className={display.showPins !== false ? 'active' : ''} onClick={() => updateDisplay({ showPins: display.showPins === false })}>Pins</button>
      {scene && largeScene && <><label>화면 해상도<select aria-label="대규모 화면 해상도" value={display.resolutionScale??.75} onChange={event=>updateDisplay({resolutionScale:Number(event.target.value)})}><option value={.75}>75% · 성능</option><option value={1}>100%</option><option value={1.5}>150% · 선명도</option></select></label><label>정확한 표시 영역<select aria-label="대규모 표시 도형 상한" value={display.renderLimit??2000} onChange={event=>{const limit=Number(event.target.value);updateDisplay({renderLimit:limit});if(props.onRequestScope)void requestScope(undefined,limit);}}><option value={1000}>표시 영역 ≤1,000</option><option value={2000}>표시 영역 ≤2,000</option><option value={5000}>표시 영역 ≤5,000</option><option value={20000}>표시 영역 ≤20,000</option><option value={1000000}>전체 · GPU 부하 증가</option></select></label>{props.onRequestScope && <button disabled={pending} onClick={()=>void requestCameraScope()}>현재 화면 영역 가져오기</button>}<small>{scene.shapes.length.toLocaleString()} 수신 / 전체 {sourceShapeCount.toLocaleString()}{scene.truncated ? ' · 제한 표시' : ''}</small></>}
      {!!scene?.instances?.length&&<select aria-label="실제 계층 instance로 이동" value="" onChange={event=>void focusInstance(event.target.value)}><option value="">Hierarchy · {scene.instances.length} instances</option>{scene.instances.map(instance=><option value={instance.id} key={instance.id}>{instance.cell_name}{instance.array?` [${instance.array.columns}×${instance.array.rows}]`:''} · {instance.id}</option>)}</select>}
      {props.extractedMapping && <select aria-label="실제 추출 RC cross probe" disabled={props.extractedMapping.revision !== scene?.revision} value="" onChange={event => {
        const element = props.extractedMapping!.elements.find(element => element.id === event.target.value), id = element?.shape_ids?.find(id => scene?.shapes.some(shape => shape.id === id));
        if (id) focusShape(id);
        else setNote(`실제 ${element?.id ?? 'RC'}: layout shape mapping 없음 · source ${props.extractedMapping!.source}`);
      }}><option value="">PEX {props.extractedMapping.revision !== scene?.revision ? 'STALE' : 'RC'} · {props.extractedMapping.elements.length}</option>{props.extractedMapping.elements.map(element => <option key={element.id} value={element.id}>{element.id}: {element.value} {element.unit} · {element.nodes.join(' ↔ ')}</option>)}</select>}
      <button disabled={!selection || pending || props.readOnly} title={props.readOnly ? '읽기 전용 설계 · 편집 기능 비활성화' : undefined} onClick={() => setEditor(editor === 'move' ? 'none' : 'move')}>이동 값</button>
      <button disabled={!scene || pending || props.readOnly} title={props.readOnly ? '읽기 전용 설계 · 편집 기능 비활성화' : undefined} onClick={() => setEditor(editor === 'box' ? 'none' : 'box')}>Box 추가</button>
      <button disabled={!scene || pending || props.readOnly} title={props.readOnly ? '읽기 전용 설계 · 편집 기능 비활성화' : undefined} onClick={() => setEditor(editor === 'route' ? 'none' : 'route')}>배선 추가</button>
      <button disabled={!scene || props.readOnly} title={props.readOnly ? '읽기 전용 설계 · 편집 기능 비활성화' : undefined} onClick={() => setAdvancedOpen(!advancedOpen)}>Polygon / Cell 도구</button>
    </div>
    {props.currentFlow&&<CurrentFlowPanel flow={props.currentFlow} scene={scene} index={flowIndex} playing={flowPlaying} visible={flowVisible} scale={flowScale} branchId={flowBranchId} onIndex={setFlowIndex} onPlaying={setFlowPlaying} onVisible={setFlowVisible} onScale={setFlowScale} onBranch={setFlowBranchId} onFocus={focusCurrent}/>}
    {props.currentFlow&&flowBranchId&&scene&&stageRef.current&&flowStatus(props.currentFlow,scene).active&&(()=>{const branch=props.currentFlow!.branches.find(branch=>branch.id===flowBranchId),vector=branch?projectedCurrent(branch,branchCurrent(branch,sampleIndex(props.currentFlow!,flowIndex)),stageRef.current!.frame):null;return vector?<div className="mos-current-projection">선택 경로 첫 구간의 전류 투영(유도 표시): Iₓ {formatCurrent(vector.x_A)} · Iᵧ {formatCurrent(vector.y_A)}</div>:null;})()}
    {advancedOpen && scene && <AdvancedTools scene={scene} selection={selection} onCommand={async command=>{await execute(command);}} pending={pending} readOnly={props.readOnly} onClose={() => setAdvancedOpen(false)}/>}
    {editor !== 'none' && <div className="mos-viewer-edit" aria-label="정수 DBU 편집 명령">
      <strong>{editor === 'move' ? 'XY 이동' : editor === 'box' ? 'Box' : 'Manhattan route'} · DBU 정수</strong>
      {editor === 'move' ? <>{input('dx', 'ΔX')}{input('dy', 'ΔY')}</> : <><label>레이어<select value={editLayer} onChange={event => setEditLayer(event.target.value)}>{scene?.layers.map(layer => <option key={layer.id} value={layer.id}>{layer.name}</option>)}</select></label>{input('x1', 'X₁')}{input('y1', 'Y₁')}{input('x2', 'X₂')}{input('y2', 'Y₂')}{editor === 'route' && input('width', '폭')}{input('net', 'Net')}</>}
      <button disabled={pending || props.readOnly || (editor === 'move' && !selection)} onClick={submitEdit}>{pending ? 'worker 저장 중…' : '명령 적용'}</button><button onClick={() => setEditor('none')}>닫기</button>
    </div>}
    <div className="mos-viewer-status" role="status"><span>{error ? <span className="mos-viewer-error">{error}</span> : pending ? '정수 DBU command 처리 중…' : note}</span><span>{selection ? `ID ${selection}` : '선택 없음'}</span></div>
  </div>;
}
