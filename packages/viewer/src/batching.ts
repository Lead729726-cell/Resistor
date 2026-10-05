import * as THREE from 'three';
import type { Scene, SceneShape } from '@mos/contracts';
import { decimalCoordinate, deltaUm, localRing } from './geometry';
import type { LocalFrame, ViewerDisplay } from './geometry';
import { polygonShape } from './mesh';

/** Exact viewport scope. The authoritative 100k scene is retained; scope is explicit and never an LOD rewrite. */
export async function scopedScene(source: Scene, frame: LocalFrame, limit: number, aspect: number, canceled: () => boolean, progress?: (built:number,total:number)=>void, centre?:[number,number]): Promise<Scene> {
  if (source.shapes.length <= limit || limit >= 1000000) return source;
  const [left,bottom,right,top] = frame.boundsUm;
  const area = Math.max(.001,(right-left)*(top-bottom)) * Math.min(1,limit/source.shapes.length);
  const width = Math.sqrt(area * Math.max(.1,aspect)), height = area/width;
  const centreX = centre?.[0]??(left+right)/2, centreY = centre?.[1]??(bottom+top)/2;
  const scoped: SceneShape[] = [];
  for (let i=0;i<source.shapes.length && !canceled();i++) {
    const shape=source.shapes[i]; let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for (const [x,y] of shape.polygon) { const px=deltaUm(x,frame.origin[0],frame.dbuUm),py=deltaUm(y,frame.origin[1],frame.dbuUm); minX=Math.min(minX,px);minY=Math.min(minY,py);maxX=Math.max(maxX,px);maxY=Math.max(maxY,py); }
    if (maxX>=centreX-width/2 && minX<=centreX+width/2 && maxY>=centreY-height/2 && minY<=centreY+height/2 && scoped.length<limit) scoped.push(shape);
    if ((i+1)%1000===0) { progress?.(i+1,source.shapes.length);await new Promise<void>(resolve=>setTimeout(resolve,0)); }
  }
  return { ...source, shapes: scoped.length ? scoped : source.shapes.slice(0,limit) };
}

interface InstanceRecord { shape: SceneShape; x: number; y: number; index: number }
interface Batch { mesh: THREE.InstancedMesh; records: InstanceRecord[]; layerId: string; layerIndex: number; bounds: THREE.Box3; initialized: boolean }
interface CachedGeometry { geometry: THREE.BufferGeometry; uses: number }

/** Per-view cache. Translation is factored out with BigInt before sharing exact mesh geometry. */
export class BatchedScene {
  readonly group = new THREE.Group();
  readonly records = new Map<string, { batch: Batch; record: InstanceRecord }>();
  readonly batches: Batch[] = [];
  readonly cache = new Map<string, CachedGeometry>();
  readonly stats = { shapes: 0, batches: 0, cachedGeometries: 0, built: 0, total: 0, buildMs: 0, culledBatches: 0 };
  private canceled = false;
  private source: Scene;
  private frame: LocalFrame;
  private mode: '2d' | '3d';
  private display: ViewerDisplay = {};
  private selection: string | null = null;
  private colorSignature = '';
  private planes: THREE.Plane[] = [];
  private frustum = new THREE.Frustum();
  private matrix = new THREE.Matrix4();
  constructor(source: Scene, frame: LocalFrame, mode: '2d' | '3d') {
    this.source = source; this.frame = frame; this.mode = mode;
    this.stats.total = source.shapes.length;
    this.group.name = 'exact-spatial-layout-instances';
    this.group.userData = { project_id: source.project_id, revision: source.revision, dbu_um: source.dbu_um, origin_dbu: frame.origin.map(String), units: 'micrometre', exact: true };
  }
  private key(shape: SceneShape) {
    const [ax, ay] = shape.polygon[0].map(decimalCoordinate);
    const normalized = (ring: [string, string][]) => ring.map(([x, y]) => [String(decimalCoordinate(x) - ax), String(decimalCoordinate(y) - ay)] as [string, string]);
    const polygon = normalized(shape.polygon), holes = shape.holes?.map(normalized);
    const layer = this.source.layers.find(layer => layer.id === shape.layer_id)!;
    const key = JSON.stringify([this.mode, this.frame.dbuUm, this.mode === '3d' ? layer.thickness_display_um : 0, polygon, holes]);
    return { key, polygon, holes, x: deltaUm(String(ax), this.frame.origin[0], this.frame.dbuUm), y: deltaUm(String(ay), this.frame.origin[1], this.frame.dbuUm) };
  }
  async build(progress?: (built: number, total: number) => void) {
    const start = performance.now();
    const builders = new Map<string, { records: InstanceRecord[]; geometry: THREE.BufferGeometry; layerId: string; layerIndex: number }>();
    const fullBounds=this.source.bounds?.map(decimalCoordinate);
    // Tile density follows source extent even when floating origin is a tiny viewport scope.
    const extent=fullBounds?Math.max(Number(fullBounds[2]-fullBounds[0]),Number(fullBounds[3]-fullBounds[1]))*this.frame.dbuUm:Math.max(this.frame.boundsUm[2]-this.frame.boundsUm[0],this.frame.boundsUm[3]-this.frame.boundsUm[1]);
    const tileUm = Math.max(1, extent / 24);
    for (let i = 0; i < this.source.shapes.length && !this.canceled; i++) {
      const shape = this.source.shapes[i];
      const normalized = this.key(shape);
      const layerIndex = this.source.layers.findIndex(layer => layer.id === shape.layer_id);
      if (layerIndex < 0) throw new Error(`Unknown layer: ${shape.layer_id}`);
      let cached = this.cache.get(normalized.key);
      if (!cached) {
        const localFrame: LocalFrame = { origin: [0n, 0n], dbuUm: this.frame.dbuUm, boundsUm: [0, 0, 0, 0] };
        const polygon = polygonShape(normalized.polygon, normalized.holes, localFrame);
        const geometry = this.mode === '2d' ? new THREE.ShapeGeometry(polygon) : new THREE.ExtrudeGeometry(polygon, { depth: Math.max(0.00001, this.source.layers[layerIndex].thickness_display_um), bevelEnabled: false });
        cached = { geometry, uses: 0 }; this.cache.set(normalized.key, cached);
      }
      cached.uses++;
      const key = `${shape.layer_id}:${Math.floor(normalized.x / tileUm)}:${Math.floor(normalized.y / tileUm)}:${normalized.key}`;
      let builder = builders.get(key);
      if (!builder) { builder = { records: [], geometry: cached.geometry, layerId: shape.layer_id, layerIndex }; builders.set(key, builder); }
      builder.records.push({ shape, x: normalized.x, y: normalized.y, index: builder.records.length });
      this.stats.built = i + 1;
      // Bounded CPU work keeps keyboard, cancel, and camera responsive during mesh construction.
      if ((i + 1) % 1000 === 0) { progress?.(i + 1, this.source.shapes.length); await new Promise<void>(resolve => setTimeout(resolve, 0)); }
    }
    if (this.canceled) return;
    for (const builder of builders.values()) {
      const layer = this.source.layers[builder.layerIndex];
      const material = new THREE.MeshLambertMaterial({ color: layer.color, side: THREE.DoubleSide, transparent: layer.opacity < 1, opacity: layer.opacity, depthWrite: layer.opacity >= 1 });
      const mesh = new THREE.InstancedMesh(builder.geometry, material, builder.records.length);
      const matrix = new THREE.Matrix4(), color = new THREE.Color(layer.color);
      for (const record of builder.records) { mesh.setMatrixAt(record.index, matrix.makeTranslation(record.x, record.y, 0)); mesh.setColorAt(record.index, color); }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingBox(); mesh.computeBoundingSphere();
      mesh.name = `layer:${builder.layerId}:tile`; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.userData = { layer_id: builder.layerId, stable_ids: builder.records.map(record => record.shape.id), display_extrusion: true };
      const batch: Batch = { mesh, records: builder.records, layerId: builder.layerId, layerIndex: builder.layerIndex, bounds: new THREE.Box3(), initialized: false };
      this.batches.push(batch); this.group.add(mesh);
      for (const record of builder.records) this.records.set(record.shape.id, { batch, record });
      if (this.batches.length % 40 === 0) { this.apply(this.display, this.selection); await new Promise<void>(resolve => setTimeout(resolve, 0)); }
      if (this.canceled) return;
    }
    this.stats.shapes = this.source.shapes.length; this.stats.batches = this.batches.length; this.stats.cachedGeometries = this.cache.size;
    this.stats.buildMs = performance.now() - start;
    this.apply(this.display, this.selection);
    progress?.(this.stats.total, this.stats.total);
  }
  apply(display: ViewerDisplay, selection: string | null, planes?: THREE.Plane[]) {
    const previousSelection = this.selection;
    const signature = JSON.stringify([display.highlightNet, this.source.layers.map(layer => display.layers?.[layer.id]?.color ?? layer.color)]);
    const allColors = signature !== this.colorSignature;
    this.colorSignature = signature;
    this.display = display; this.selection = selection;
    if (planes) this.planes = planes;
    const color = new THREE.Color();
    for (const batch of this.batches) {
      const layer = this.source.layers[batch.layerIndex], override = display.layers?.[layer.id];
      const opacity = Math.max(0, Math.min(1, override?.opacity ?? layer.opacity));
      const z = layer.z_display_um + batch.layerIndex * (display.explode ?? 0) + (this.mode === '2d' ? layer.thickness_display_um : 0);
      const material = batch.mesh.material as THREE.MeshLambertMaterial;
      material.color.set('#ffffff');
      material.opacity = opacity; material.transparent = opacity < 1; material.depthWrite = opacity >= 1;
      material.clippingPlanes = this.planes; material.needsUpdate = true;
      batch.mesh.visible = override?.visible !== false && opacity > 0;
      batch.mesh.position.z = z;
      color.set(override?.color ?? layer.color);
      for (const record of batch.records) {
        if (!allColors && batch.initialized && record.shape.id !== selection && record.shape.id !== previousSelection) continue;
        const selected = record.shape.id === selection, netSelected = display.highlightNet != null && record.shape.net === display.highlightNet;
        const instanceColor = selected ? new THREE.Color('#b5f8ff') : netSelected ? new THREE.Color('#82f7d7') : display.highlightNet != null ? color.clone().multiplyScalar(.25) : color;
        batch.mesh.setColorAt(record.index, instanceColor);
      }
      if (batch.mesh.instanceColor) batch.mesh.instanceColor.needsUpdate = true;
      batch.initialized = true;
      batch.bounds.copy(batch.mesh.boundingBox!).translate(batch.mesh.position);
    }
    this.group.updateMatrixWorld(true);
  }
  /** Tile culling only affects rendering; exact scene and stable IDs remain available. */
  cull(camera: THREE.Camera) {
    this.frustum.setFromProjectionMatrix(this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    let count = 0;
    for (const batch of this.batches) {
      const layer = this.source.layers[batch.layerIndex], override = this.display.layers?.[layer.id];
      const visible = override?.visible !== false && (override?.opacity ?? layer.opacity) > 0;
      batch.mesh.visible = visible && this.frustum.intersectsBox(batch.bounds);
      if (visible && !batch.mesh.visible) count++;
    }
    this.stats.culledBatches = count;
  }
  pickObjects() {
    return this.batches.filter(batch => {
      const override = this.display.layers?.[batch.layerId];
      return batch.mesh.visible && override?.locked !== true && override?.pickable !== false;
    }).map(batch => batch.mesh);
  }
  identify(hit: THREE.Intersection): { id: string; layerIndex: number } | undefined {
    const batch = this.batches.find(batch => batch.mesh === hit.object);
    const record = hit.instanceId === undefined ? undefined : batch?.records[hit.instanceId];
    return record && batch ? { id: record.shape.id, layerIndex: batch.layerIndex } : undefined;
  }
  bounds(id?: string, cellPath?: string) {
    const bounds = new THREE.Box3(), matrix = new THREE.Matrix4();
    if (!id && !cellPath) for (const batch of this.batches) bounds.union(batch.bounds);
    else for (const [shapeId, { batch, record }] of this.records) {
      if ((id && id !== shapeId) || (cellPath && !record.shape.cell_path.startsWith(cellPath))) continue;
      batch.mesh.getMatrixAt(record.index, matrix);
      if (!batch.mesh.geometry.boundingBox) batch.mesh.geometry.computeBoundingBox();
      bounds.union(batch.mesh.geometry.boundingBox!.clone().applyMatrix4(matrix).translate(batch.mesh.position));
    }
    return bounds;
  }
  dispose() {
    this.canceled = true;
    for (const batch of this.batches) { (batch.mesh.material as THREE.Material).dispose(); batch.mesh.dispose(); }
    for (const cached of this.cache.values()) cached.geometry.dispose();
    this.batches.length = 0; this.cache.clear(); this.records.clear(); this.group.clear();
  }
}
