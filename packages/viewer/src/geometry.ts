import type { Scene, SceneShape } from '@mos/contracts';

export type DecimalPoint = [string, string];
export interface LocalFrame {
  origin: [bigint, bigint];
  dbuUm: number;
  boundsUm: [number, number, number, number];
}

/** Never convert an absolute design coordinate to Number. Only origin-relative deltas enter the GPU. */
export function decimalCoordinate(value: string): bigint {
  if (!/^-?\d+$/.test(value)) throw new Error(`정수 DBU 좌표가 필요합니다: ${value}`);
  return BigInt(value);
}

export function deltaUm(value: string, origin: bigint, dbuUm: number): number {
  const delta = decimalCoordinate(value) - origin;
  if (delta > BigInt(Number.MAX_SAFE_INTEGER) || delta < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error('표시 범위가 안전한 로컬 좌표 범위를 넘습니다. 더 작은 cell/영역을 여세요.');
  }
  return Number(delta) * dbuUm;
}

export function sceneFrame(scene: Scene): LocalFrame {
  if (!Number.isFinite(scene.dbu_um) || scene.dbu_um <= 0) throw new Error('유효한 DBU 단위가 필요합니다.');
  const bounds=(scene as Scene & {bounds_filter?:[string,string,string,string]|null}).bounds_filter ?? (!scene.truncated?scene.bounds:undefined);
  if (bounds) {
    const [minX,minY,maxX,maxY] = bounds.map(decimalCoordinate);
    if (minX > maxX || minY > maxY) throw new Error('Scene bbox가 올바르지 않습니다.');
    const origin: [bigint,bigint] = [(minX+maxX)/2n,(minY+maxY)/2n];
    return { origin,dbuUm:scene.dbu_um,boundsUm:[deltaUm(String(minX),origin[0],scene.dbu_um),deltaUm(String(minY),origin[1],scene.dbu_um),deltaUm(String(maxX),origin[0],scene.dbu_um),deltaUm(String(maxY),origin[1],scene.dbu_um)] };
  }
  let minX: bigint | undefined, minY: bigint | undefined, maxX: bigint | undefined, maxY: bigint | undefined;
  // A truncated response has no full-design-origin precision guarantee; keep the frame local to received polygons.
  for (const shape of scene.shapes) {
    for (const [x, y] of shape.polygon) {
      const bx = decimalCoordinate(x), by = decimalCoordinate(y);
      minX = minX === undefined || bx < minX ? bx : minX;
      minY = minY === undefined || by < minY ? by : minY;
      maxX = maxX === undefined || bx > maxX ? bx : maxX;
      maxY = maxY === undefined || by > maxY ? by : maxY;
    }
  }
  if (minX === undefined || minY === undefined || maxX === undefined || maxY === undefined) {
    return { origin: [0n, 0n], dbuUm: scene.dbu_um, boundsUm: [-1, -1, 1, 1] };
  }
  const origin: [bigint, bigint] = [(minX + maxX) / 2n, (minY + maxY) / 2n];
  return {
    origin, dbuUm: scene.dbu_um,
    boundsUm: [deltaUm(String(minX), origin[0], scene.dbu_um), deltaUm(String(minY), origin[1], scene.dbu_um),
      deltaUm(String(maxX), origin[0], scene.dbu_um), deltaUm(String(maxY), origin[1], scene.dbu_um)],
  };
}

export function localRing(ring: DecimalPoint[], frame: LocalFrame): [number, number][] {
  const points = ring.map(([x, y]) => [deltaUm(x, frame.origin[0], frame.dbuUm), deltaUm(y, frame.origin[1], frame.dbuUm)] as [number, number]);
  if (points.length > 1 && points[0][0] === points.at(-1)![0] && points[0][1] === points.at(-1)![1]) points.pop();
  if (points.length < 3) throw new Error('polygon에는 최소 3개의 서로 다른 꼭짓점이 필요합니다.');
  return points;
}

/** A preview delta is display-only. The command stays integer DBU and is validated by the worker. */
export function snappedDelta(valueUm: number, dbuUm: number, gridDbu = 1): string {
  if (!Number.isFinite(valueUm) || dbuUm <= 0 || !Number.isSafeInteger(gridDbu) || gridDbu < 1) {
    throw new Error('유효하지 않은 이동 또는 grid입니다.');
  }
  const value = Math.round(valueUm / dbuUm / gridDbu) * gridDbu;
  if (!Number.isSafeInteger(value)) throw new Error('이동 거리가 정수 명령 범위를 넘습니다.');
  return String(value);
}

export interface LayerDisplay {
  visible?: boolean;
  pickable?: boolean;
  locked?: boolean;
  color?: string;
  opacity?: number;
}
export interface ClipDisplay { axis: 'none' | 'x' | 'y' | 'z'; fraction: number; flip?: boolean }
export interface ViewerDisplay {
  projection?: 'orthographic' | 'perspective';
  preset?: 'iso' | 'top' | 'front' | 'side';
  explode?: number;
  clip?: ClipDisplay;
  layers?: Record<string, LayerDisplay>;
  highlightNet?: string | null;
  resolutionScale?: number;
  showLabels?: boolean;
  showPins?: boolean;
  renderLimit?: number;
  scopeCentre?: [string,string];
}

export function isPickable(layer: LayerDisplay): boolean {
  return layer.visible !== false && layer.pickable !== false && layer.locked !== true && (layer.opacity ?? 1) > 0;
}

export function clipRange(axis: ClipDisplay['axis'], bounds: [number, number, number, number], maxZ: number): [number, number] {
  if (axis === 'x') return [bounds[0], bounds[2]];
  if (axis === 'y') return [bounds[1], bounds[3]];
  return [0, Math.max(0.001, maxZ)];
}

export function pointSurvivesClip(point: [number, number, number], clip: ClipDisplay | undefined, bounds: [number, number, number, number], maxZ: number): boolean {
  if (!clip || clip.axis === 'none') return true;
  const [min, max] = clipRange(clip.axis, bounds, maxZ);
  const threshold = min + (max - min) * Math.max(0, Math.min(1, clip.fraction));
  const value = point[clip.axis === 'x' ? 0 : clip.axis === 'y' ? 1 : 2];
  return clip.flip ? value >= threshold - 1e-8 : value <= threshold + 1e-8;
}

export function manhattanPoints(start: DecimalPoint, end: DecimalPoint): DecimalPoint[] {
  for (const value of [...start, ...end]) decimalCoordinate(value);
  const corner: DecimalPoint = [end[0], start[1]];
  const points = [start];
  if (corner[0] !== start[0]) points.push(corner);
  if (end[1] !== start[1]) points.push(end);
  if (points.length < 2) throw new Error('배선 시작점과 끝점이 같습니다.');
  return points;
}

export function selectedNet(shapes: SceneShape[], id: string | null): string | null {
  return shapes.find(shape => shape.id === id)?.net ?? null;
}
