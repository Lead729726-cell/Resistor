import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import type { Scene } from '../../contracts/src/index';
import { sceneFrame } from '../src/geometry';
import { BatchedScene } from '../src/batching';

function fixture(count: number): Scene {
  const origin = 9007199254740993000n;
  return { project_id: 'precision-fixture', revision: 1, source: 'fixture', dbu_um: .001,
    layers: [{ id: 'm1', name: 'Metal', gds: [1,0], color: '#54a5dd', opacity: 1, z_display_um: 1, thickness_display_um: .2, source: 'illustrative' }],
    shapes: Array.from({ length: count }, (_, i) => {
      const x = origin + BigInt(i % 100) * 10000n, y = BigInt(Math.floor(i / 100)) * 10000n;
      return { id: `root/array:${i}/metal`, cell_path: `root/array:${i}`, layer_id: 'm1', polygon: [[String(x),String(y)],[String(x+5000n),String(y)],[String(x+5000n),String(y+5000n)],[String(x),String(y+5000n)]] as [string,string][] };
    }) };
}
test('translation-normalized exact instance cache retains per-occurrence IDs and uses one geometry', async () => {
  const scene = fixture(1200), frame = sceneFrame(scene), batch = new BatchedScene(scene, frame, '3d');
  await batch.build();
  assert.equal(batch.stats.shapes, 1200); assert.equal(batch.stats.cachedGeometries, 1);
  assert.ok(batch.stats.batches < scene.shapes.length);
  assert.equal(batch.records.size, scene.shapes.length);
  const target = scene.shapes[333], bounds = batch.bounds(target.id);
  const centre = bounds.getCenter(new THREE.Vector3());
  const ray = new THREE.Raycaster(centre.clone().add(new THREE.Vector3(0,0,20)), new THREE.Vector3(0,0,-1));
  const hit = ray.intersectObjects(batch.pickObjects()).find(hit => batch.identify(hit)?.id === target.id);
  assert.ok(hit, 'GPU instance mapping must identify the distinct hierarchy occurrence');
  assert.equal(batch.identify(hit!)?.id, target.id);
  assert.ok(Math.abs(bounds.max.x - bounds.min.x - 5) < 1e-6);
  batch.dispose(); assert.equal(batch.records.size, 0);
});
test('layer culling, locks, hidden state and explode do not alter DBU source geometry', async () => {
  const scene = fixture(2000), original = JSON.stringify(scene.shapes), batch = new BatchedScene(scene, sceneFrame(scene), '3d');
  await batch.build();
  batch.apply({ layers: { m1: { locked: true } } }, null); assert.equal(batch.pickObjects().length, 0);
  batch.apply({ layers: { m1: { visible: false } } }, null); assert.equal(batch.pickObjects().length, 0);
  batch.apply({}, null);
  const camera = new THREE.OrthographicCamera(-5,5,5,-5,.01,1000); camera.position.set(0,0,100); camera.lookAt(0,0,0); camera.updateMatrixWorld(true);
  batch.cull(camera); assert.ok(batch.stats.culledBatches > 0);
  assert.equal(JSON.stringify(scene.shapes), original);
  batch.dispose();
});
