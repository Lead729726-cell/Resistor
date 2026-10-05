import * as THREE from 'three';
import type { SceneShape } from '@mos/contracts';
import type { LocalFrame } from './geometry';
import { localRing } from './geometry';
import { polygonShape } from './mesh';

/** Even/odd scan of original rings: holes and concave regions produce separate filled intervals. */
export function scanIntervals(rings: [number, number][][], axis: 'x' | 'y', coordinate: number): [number, number][] {
  const cuts: number[] = [], index = axis === 'x' ? 0 : 1, other = 1 - index;
  for (const ring of rings) for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    if ((a[index] <= coordinate && b[index] > coordinate) || (b[index] <= coordinate && a[index] > coordinate)) {
      const t = (coordinate - a[index]) / (b[index] - a[index]);
      cuts.push(a[other] + (b[other] - a[other]) * t);
    }
  }
  cuts.sort((a, b) => a - b);
  const intervals: [number, number][] = [];
  for (let i = 0; i + 1 < cuts.length; i += 2) if (cuts[i + 1] - cuts[i] > 1e-10) intervals.push([cuts[i], cuts[i + 1]]);
  return intervals;
}

/** Closed cap of the displayed extrusion, computed from real layout rings; never process topology. */
export function extrusionCap(shape: SceneShape, frame: LocalFrame, axis: 'x' | 'y' | 'z', threshold: number, bottom: number, thickness: number): THREE.BufferGeometry | null {
  const top = bottom + thickness;
  if (axis === 'z') {
    if (!(threshold > bottom + 1e-9 && threshold < top - 1e-9)) return null;
    const geometry = new THREE.ShapeGeometry(polygonShape(shape.polygon, shape.holes, frame));
    geometry.translate(0, 0, threshold);
    return geometry;
  }
  const rings = [localRing(shape.polygon, frame), ...(shape.holes ?? []).map(ring => localRing(ring, frame))];
  const index = axis === 'x' ? 0 : 1;
  const coordinates = rings[0].map(point => point[index]);
  if (threshold <= Math.min(...coordinates) + 1e-9 || threshold >= Math.max(...coordinates) - 1e-9) return null;
  const intervals = scanIntervals(rings, axis, threshold);
  if (!intervals.length) return null;
  const positions: number[] = [];
  const point = (value: number, z: number) => axis === 'x' ? [threshold, value, z] : [value, threshold, z];
  for (const [left, right] of intervals) {
    const a = point(left, bottom), b = point(right, bottom), c = point(right, top), d = point(left, top);
    positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.computeVertexNormals();
  return geometry;
}
