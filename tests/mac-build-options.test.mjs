import test from 'node:test';
import assert from 'node:assert/strict';
import {macBuildOptions,nativeMacBuilderConfig} from '../scripts/mac-build-options.mjs';
test('Mac revision names preserve old previews and keep M1 and Intel distinct',()=>{
  assert.deepEqual(macBuildOptions(['--revision=3']),{architectures:['arm64','x64'],revision:3,suffix:'-r3'});
  assert.equal(macBuildOptions(['--arm64','--repair']).suffix,'-r2');
  assert.deepEqual(macBuildOptions(['--x64']).architectures,['x64']);
});
test('conflicting CPUs and malformed revisions fail before publishing an archive',()=>{
  for(const args of [['--arm64','--x64'],['--revision=0'],['--revision=3.5'],['--revision=1000'],['--revision=../bad'],['--repair','--revision=3'],['--revision=2','--revision=3']])assert.throws(()=>macBuildOptions(args));
});
test('native prepackaged Mac produces only its real architecture without modifying shared configuration',()=>{
  const config={mac:{target:[{target:'dmg',arch:['arm64','x64']},{target:'zip',arch:['arm64','x64']}]},win:{target:'nsis'}};
  for(const arch of ['arm64','x64']){const v=nativeMacBuilderConfig(config,arch);assert(v.mac.target.every(t=>t.arch.length===1&&t.arch[0]===arch));assert.deepEqual(v.win,config.win);}
  assert.equal(config.mac.target[0].arch.length,2);assert.throws(()=>nativeMacBuilderConfig(config,'other'));
});
