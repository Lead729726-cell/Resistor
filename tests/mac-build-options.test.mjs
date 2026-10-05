import test from 'node:test';
import assert from 'node:assert/strict';
import {macBuildOptions} from '../scripts/mac-build-options.mjs';
test('Mac revision names preserve old previews and keep M1 and Intel distinct',()=>{
  assert.deepEqual(macBuildOptions(['--revision=3']),{architectures:['arm64','x64'],revision:3,suffix:'-r3'});
  assert.equal(macBuildOptions(['--arm64','--repair']).suffix,'-r2');
  assert.deepEqual(macBuildOptions(['--x64']).architectures,['x64']);
});
test('conflicting CPUs and malformed revisions fail before publishing an archive',()=>{
  for(const args of [['--arm64','--x64'],['--revision=0'],['--revision=3.5'],['--revision=1000'],['--revision=../bad'],['--repair','--revision=3'],['--revision=2','--revision=3']])assert.throws(()=>macBuildOptions(args));
});
