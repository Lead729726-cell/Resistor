import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import type { Scene } from '../../contracts/src/index';
import { decimalCoordinate, deltaUm, isPickable, localRing, manhattanPoints, pointSurvivesClip, sceneFrame, selectedNet, snappedDelta } from '../src/geometry';
import { polygonShape } from '../src/mesh';

const layer = { id: 'm1', name: 'metal1', gds: [68, 20] as [number, number], color: '#6bbcea', opacity: 1,
  z_display_um: 1, thickness_display_um: 0.2, source: 'illustrative' as const };

test('int64 protocol offset preserves one DBU after local-origin subtraction', () => {
  const origin = 9007199254740993000n;
  const scene: Scene = { project_id: 'fixture', revision: 1, dbu_um: 0.001, source: 'fixture', layers: [layer], shapes: [
    { id: 'root/inst-a/ring', layer_id: 'm1', cell_path: 'root/inst-a', polygon: [
      [String(origin), '0'], [String(origin + 11n), '0'], [String(origin + 11n), '20'], [String(origin), '20'],
    ] },
  ] };
  const frame = sceneFrame(scene);
  assert.equal(frame.origin[0], origin + 5n);
  assert.deepEqual(localRing(scene.shapes[0].polygon, frame), [[-0.005, -0.01], [0.006, -0.01], [0.006, 0.01], [-0.005, 0.01]]);
  assert.equal(deltaUm(String(origin + 1n), origin, scene.dbu_um), 0.001);
  assert.equal(decimalCoordinate('-9223372036854775808'), -9223372036854775808n);
  assert.throws(() => deltaUm('9007199254740993', 0n, 1), /로컬 좌표/);
  assert.throws(() => decimalCoordinate('1e3'), /정수 DBU/);
});

test('hole is absent from both 2D and 3D raycasting after mirror winding', () => {
  const frame = { origin: [0n, 0n] as [bigint, bigint], dbuUm: 1, boundsUm: [-5, -5, 5, 5] as [number, number, number, number] };
  const outer: [string, string][] = [['-5', '-5'], ['5', '-5'], ['5', '5'], ['-5', '5'], ['-5', '-5']];
  const hole: [string, string][] = [['-1', '-1'], ['1', '-1'], ['1', '1'], ['-1', '1']];
  for (const reversed of [false, true]) {
    const shape = polygonShape(reversed ? [...outer].reverse() : outer, [reversed ? [...hole].reverse() : hole], frame);
    for (const geometry of [new THREE.ShapeGeometry(shape), new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false })]) {
      const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geometry, material); mesh.updateMatrixWorld();
      const caster = new THREE.Raycaster(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1));
      assert.equal(caster.intersectObject(mesh).length, 0, 'hole centre must not contain a triangulated cap');
      caster.ray.origin.set(3, 0, 5);
      assert.ok(caster.intersectObject(mesh).length > 0, 'solid part must remain pickable');
      const attributes = geometry.getAttribute('position');
      assert.ok([...attributes.array].every(Number.isFinite));
      geometry.dispose(); material.dispose();
    }
  }
});

test('hidden, locked, non-pickable and fully transparent layers are excluded', () => {
  assert.equal(isPickable({}), true);
  for (const style of [{ visible: false }, { locked: true }, { pickable: false }, { opacity: 0 }]) assert.equal(isPickable(style), false);
  assert.equal(isPickable({ opacity: 0.3 }), true);
});

test('clipping rejects GPU-discarded intersections including exploded display Z', () => {
  const bounds: [number, number, number, number] = [-5, -5, 5, 5];
  assert.equal(pointSurvivesClip([3, 0, 0], { axis: 'x', fraction: 0.5 }, bounds, 10), false);
  assert.equal(pointSurvivesClip([-3, 0, 0], { axis: 'x', fraction: 0.5 }, bounds, 10), true);
  assert.equal(pointSurvivesClip([3, 0, 0], { axis: 'x', fraction: 0.5, flip: true }, bounds, 10), true);
  assert.equal(pointSurvivesClip([0, 0, 8], { axis: 'z', fraction: 0.5 }, bounds, 10), false);
  assert.equal(pointSurvivesClip([0, 0, 2], { axis: 'z', fraction: 0.5 }, bounds, 10), true);
  assert.equal(pointSurvivesClip([3, 0, 8], { axis: 'none', fraction: 0 }, bounds, 10), true);
});

test('XY move uses the same grid delta independent of display height', () => {
  assert.equal(snappedDelta(0.017, 0.001, 5), '15');
  assert.equal(snappedDelta(-0.018, 0.001, 5), '-20');
  assert.equal(snappedDelta(0.0004, 0.001), '0');
  assert.throws(() => snappedDelta(Infinity, 0.001), /유효/);
});

test('hierarchy occurrence IDs remain distinct and Manhattan route coordinates remain strings', () => {
  const shapes = [
    { id: 'root/a/metal', layer_id: 'm1', cell_path: 'root/a', polygon: [] as [string, string][], net: 'OUT' },
    { id: 'root/b/metal', layer_id: 'm1', cell_path: 'root/b', polygon: [] as [string, string][], net: 'VDD' },
  ];
  assert.equal(selectedNet(shapes, 'root/a/metal'), 'OUT');
  assert.equal(selectedNet(shapes, 'root/b/metal'), 'VDD');
  assert.deepEqual(manhattanPoints(['9007199254740993000', '0'], ['9007199254740993010', '20']), [
    ['9007199254740993000', '0'], ['9007199254740993010', '0'], ['9007199254740993010', '20'],
  ]);
  assert.deepEqual(manhattanPoints(['0', '0'], ['0', '20']), [['0', '0'], ['0', '20']]);
  assert.throws(() => manhattanPoints(['1', '1'], ['1', '1']), /같습니다/);
});


test('exact bounded ROI keeps float32 fine DBU precise far from a huge full-design centre', () => {
  const scoped={ project_id:'bounded-precision',revision:1,dbu_um:.001,source:'fixture',layers:[],bounds:['-2000000000','0','2000000000','1000000000'],bounds_filter:['1999999000','0','2000000000','1000'],total_shape_count:100000,truncated:true,shapes:[] } as unknown as Scene;
  const frame=sceneFrame(scoped);
  assert.deepEqual(frame.origin,[1999999500n,500n]);
  const x1=deltaUm('1999999990',frame.origin[0],frame.dbuUm),x2=deltaUm('1999999991',frame.origin[0],frame.dbuUm);
  assert.ok(Math.abs((Math.fround(x2)-Math.fround(x1))-.001)<.000001,'One DBU stays distinct after GPU float32 conversion');
});
