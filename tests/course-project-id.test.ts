import test from 'node:test';
import assert from 'node:assert/strict';
import {newCourseProjectId} from '../packages/ui/src/course-project-id';
test('workbook uses the native UUID implementation when available',()=>{
 let fallback=false;
 const crypto={randomUUID:()=> '12345678-1234-4234-9234-123456789abc' as `${string}-${string}-${string}-${string}-${string}`,getRandomValues:<T extends ArrayBufferView|null>(array:T):T=>{fallback=true;return array;}};
 assert.equal(newCourseProjectId(crypto),'12345678-1234-4234-9234-123456789abc');assert.equal(fallback,false);
});
test('file-compatible random bytes produce RFC4122 version4 project IDs',()=>{
 let n=0;
 const crypto={getRandomValues:<T extends ArrayBufferView|null>(array:T):T=>{assert.ok(array instanceof Uint8Array);array.fill(n++);return array;}};
 assert.equal(newCourseProjectId(crypto),'00000000-0000-4000-8000-000000000000');
 assert.equal(newCourseProjectId(crypto),'01010101-0101-4101-8101-010101010101');
});
test('missing secure randomness reports unsupported browser instead of colliding IDs',()=>{
 assert.throws(()=>newCourseProjectId({} as Crypto),/프로젝트 ID/);
});
