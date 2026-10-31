import test from 'node:test';
import assert from 'node:assert/strict';
import {readEduRoute,eduHash,readEduResume,eduRouteLabel} from '../packages/ui/src/edu-navigation';
import {validateLeagueConfiguration} from '../packages/ui/src/league-connection';
test('Edu starts at the mode junction and round-trips seven design pages and the in-app league',()=>{
 assert.deepEqual(readEduRoute(eduHash({mode:'workbook'})),{mode:'workbook'});assert.equal(eduRouteLabel({mode:'workbook'}),'첫 회로 실험 워크북');
 for(const hash of ['', '#design/0','#design/8','#design/2?x=1','#invalid'])assert.deepEqual(readEduRoute(hash),{mode:'home'});
 for(let step=1;step<=7;step++)assert.deepEqual(readEduRoute(eduHash({mode:'design',step})),{mode:'design',step});
 assert.deepEqual(readEduRoute('#quiz/league'),{mode:'quiz',panel:'league'});assert.deepEqual(readEduRoute('#quiz'),{mode:'quiz',panel:'questions'});
 assert.equal(eduHash({mode:'design',step:99}),'#design/7');assert.equal(eduHash({mode:'design',step:NaN}),'#design/1');
});

test('resume data is a validated Edu screen pointer, never an engine verification or auto-open instruction',()=>{
 const r={schema_version:1,edition:'edu',hash:'#design/6',updated_at:'2026-10-19T00:00:00Z'};
 assert.deepEqual(readEduResume({...r,verified:true}),r);assert.equal(eduRouteLabel(readEduRoute(r.hash)),'설계 6/7 · 재해석·비교');
 for(const patch of [{edition:'indust'},{schema_version:2},{hash:'#home'},{hash:'#quiz'},{hash:'#design/8'},{hash:'https://example.com'},{updated_at:'bad'}])assert.equal(readEduResume({...r,...patch}),null);
});
test('published league discovery requires Edu schema, stable identity and bounded HTTPS endpoint',()=>{
 const c={schema_version:1,edition:'edu',endpoint:'https://league.example/api/league',identity_namespace:'resistor-edu-public'};
 assert.equal(validateLeagueConfiguration(c).identity_namespace,c.identity_namespace);
 for(const patch of [{schema_version:2},{edition:'indust'},{endpoint:'http://127.0.0.1/api/league'},{endpoint:'https://user:password@league.example/api/league'},{endpoint:'https://league.example/rpc'},{identity_namespace:'bad / value'}])assert.throws(()=>validateLeagueConfiguration({...c,...patch}));
});

test('project dashboard deep links select one lesson and survive reload, resume and step changes',()=>{
 const lessonId='2e053569-8076-40dc-8016-7056dbbc2c61';assert.deepEqual(readEduRoute('#projects'),{mode:'projects'});
 for(let step=1;step<=7;step++){const r={mode:'design' as const,step,lessonId};assert.deepEqual(readEduRoute(eduHash(r)),r);assert(readEduResume({schema_version:1,edition:'edu',hash:eduHash(r),updated_at:'2026-10-19T00:00:00Z'}));}
 for(const id of ['../../outside','a'.repeat(36),'bad','2e053569-8076-40dc-8016-7056dbbc2c61/extra'])assert.deepEqual(readEduRoute('#design/2/lesson/'+id),{mode:'home'});
});
