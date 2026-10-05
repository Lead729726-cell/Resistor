import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { extrusionCap, scanIntervals } from '../src/caps';

const frame = { origin: [0n, 0n] as [bigint, bigint], dbuUm: 1, boundsUm: [-5, -5, 5, 5] as [number, number, number, number] };
const shape = { id: 'ring', layer_id: 'metal', cell_path: 'top', polygon: [['-5', '-5'], ['5', '-5'], ['5', '5'], ['-5', '5']] as [string, string][],
  holes: [[['-1', '-1'], ['1', '-1'], ['1', '1'], ['-1', '1']]] as [string, string][][] };
test('computed vertical intersection cap leaves a real polygon hole open', () => {
  const geometry = extrusionCap(shape, frame, 'x', 0, 2, 1)!;
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); mesh.updateMatrixWorld();
  const ray = new THREE.Raycaster(new THREE.Vector3(5, 0, 2.5), new THREE.Vector3(-1, 0, 0));
  assert.equal(ray.intersectObject(mesh).length, 0, 'the hole interval must not be filled');
  ray.ray.origin.set(5, 3, 2.5); assert.ok(ray.intersectObject(mesh).length > 0);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) assert.equal(position.getX(i), 0, 'cap vertices lie on the actual clipping plane');
  geometry.dispose();
});
test('horizontal cap triangulation retains holes and stays inside displayed thickness', () => {
  const geometry = extrusionCap(shape, frame, 'z', 2.5, 2, 1)!;
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); mesh.updateMatrixWorld();
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1));
  assert.equal(ray.intersectObject(mesh).length, 0);
  ray.ray.origin.set(3, 0, 5); assert.ok(ray.intersectObject(mesh).length > 0);
  assert.equal(extrusionCap(shape, frame, 'z', 4, 2, 1), null);
  assert.equal(extrusionCap(shape, frame, 'x', -5, 2, 1), null);
  geometry.dispose();
});
test('concave scan produces disjoint filled intervals independent of winding', () => {
  const ring: [number, number][] = [[0,0],[4,0],[4,1],[1,1],[1,3],[4,3],[4,4],[0,4]];
  assert.deepEqual(scanIntervals([ring], 'x', 2), [[0,1],[3,4]]);
  assert.deepEqual(scanIntervals([[...ring].reverse()], 'x', 2), [[0,1],[3,4]]);
});
