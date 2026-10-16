import test from 'node:test';
import assert from 'node:assert/strict';
import {classifySystem,detectSystem} from '../scripts/site/system-detection.mjs';
const cases=[
 ['Windows x64 hints',{hints:{platform:'Windows',architecture:'x86',bitness:'64',platformVersion:'19.0.0'}},'Windows 11','x64','windows-x64'],
 ['Windows ARM overrides reduced x64 UA',{userAgent:'Windows NT 10.0; Win64; x64',hints:{platform:'Windows',architecture:'arm',bitness:'64',platformVersion:'15.0.0'}},'Windows 11','arm64','windows-arm64'],
 ['Windows 10 hints',{hints:{platform:'Windows',architecture:'x86',bitness:'64',platformVersion:'10.0.0'}},'Windows 10','x64','windows-x64'],
 ['Windows 10 ARM cannot run the Windows 11 package',{hints:{platform:'Windows',architecture:'arm',bitness:'64',platformVersion:'10.0.0'}},'Windows 10','arm64',null],
 ['Reduced Windows UA does not prove native x64',{userAgent:'Windows NT 10.0; Win64; x64'},'Windows 10 / 11','unknown',null],
 ['Safari on M1 can claim Intel',{userAgent:'Macintosh; Intel Mac OS X 10_15_7',platform:'MacIntel'},'macOS','unknown',null],
 ['Apple Silicon hints',{hints:{platform:'macOS',architecture:'arm',bitness:'64',platformVersion:'15.0.0'}},'macOS 15.0.0','arm64','macos-arm64'],
 ['macOS 14 cannot run this bundled ngspice',{hints:{platform:'macOS',architecture:'arm',bitness:'64',platformVersion:'14.7.0'}},'macOS 14.7.0','arm64',null],
 ['Unknown Mac OS version needs manual confirmation',{hints:{platform:'macOS',architecture:'arm',bitness:'64'}},'macOS','arm64',null],
 ['Intel Mac hints',{hints:{platform:'macOS',architecture:'x86',bitness:'64',platformVersion:'15.0.0'}},'macOS 15.0.0','x64','macos-x64'],
 ['Linux x64',{userAgent:'X11; Linux x86_64'},'Linux','x64','linux-x64'],
 ['Linux ARM unavailable',{userAgent:'X11; Linux aarch64'},'Linux','arm64',null],
 ['ChromeOS is not a verified Linux desktop',{userAgent:'X11; CrOS x86_64',hints:{platform:'Chrome OS',architecture:'x86',bitness:'64'}},'ChromeOS','x64',null],
 ['Android',{userAgent:'Linux; Android 15; arm64'},'Android','arm64',null],
 ['iPad desktop UA',{userAgent:'Macintosh; Intel Mac OS X',platform:'MacIntel',maxTouchPoints:5},'iOS / iPadOS','unknown',null],
 ['iPhone',{userAgent:'iPhone; CPU iPhone OS 18_0'},'iOS / iPadOS','unknown',null],
 ['32-bit Windows unsupported',{hints:{platform:'Windows',architecture:'x86',bitness:'32'}},'Windows 10 / 11','x86',null],
 ['Unknown',{},'알 수 없는 OS','unknown',null],
];
for(const [label,input,os,arch,target]of cases)test(label,()=>{const r=classifySystem(input);assert.equal(r.osLabel,os);assert.equal(r.arch,arch);assert.equal(r.target,target);});
test('denied hints keep a usable manual fallback',async()=>{const r=await detectSystem({platform:'MacIntel',userAgent:'Macintosh',userAgentData:{platform:'macOS',getHighEntropyValues:async()=>{throw Error('denied');}}});assert.equal(r.target,null);assert.match(r.note,/직접|선택/);});
