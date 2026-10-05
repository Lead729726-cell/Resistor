import * as THREE from 'three';
import { localRing } from './geometry';
import type { LocalFrame } from './geometry';

/** Canonical winding is independent of KLayout transform/mirror occurrence winding. */
export function polygonShape(polygon: [string, string][], holes: [string, string][][] | undefined, frame: LocalFrame): THREE.Shape {
  const outer = localRing(polygon, frame).map(([x, y]) => new THREE.Vector2(x, y));
  if (!THREE.ShapeUtils.isClockWise(outer)) outer.reverse();
  const shape = new THREE.Shape(outer);
  shape.holes = (holes ?? []).map(ring => {
    const points = localRing(ring, frame).map(([x, y]) => new THREE.Vector2(x, y));
    if (THREE.ShapeUtils.isClockWise(points)) points.reverse();
    return new THREE.Path(points);
  });
  return shape;
}
