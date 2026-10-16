import test from 'node:test';
import assert from 'node:assert/strict';
import {readEduRoute,eduHash} from '../packages/ui/src/edu-navigation';
import {validateLeagueConfiguration} from '../packages/ui/src/league-connection';
test('Edu starts at the mode junction and round-trips seven design pages and the in-app league',()=>{
 for(const hash of ['', '#design/0','#design/8','#design/2?x=1','#invalid'])assert.deepEqual(readEduRoute(hash),{mode:'home'});
 for(let step=1;step<=7;step++)assert.deepEqual(readEduRoute(eduHash({mode:'design',step})),{mode:'design',step});
 assert.deepEqual(readEduRoute('#quiz/league'),{mode:'quiz',panel:'league'});assert.deepEqual(readEduRoute('#quiz'),{mode:'quiz',panel:'questions'});
 assert.equal(eduHash({mode:'design',step:99}),'#design/7');assert.equal(eduHash({mode:'design',step:NaN}),'#design/1');
});
test('published league discovery requires Edu schema, stable identity and bounded HTTPS endpoint',()=>{
 const c={schema_version:1,edition:'edu',endpoint:'https://league.example/api/league',identity_namespace:'resistor-edu-public'};
 assert.equal(validateLeagueConfiguration(c).identity_namespace,c.identity_namespace);
 for(const patch of [{schema_version:2},{edition:'indust'},{endpoint:'http://127.0.0.1/api/league'},{endpoint:'https://user:password@league.example/api/league'},{endpoint:'https://league.example/rpc'},{identity_namespace:'bad / value'}])assert.throws(()=>validateLeagueConfiguration({...c,...patch}));
});
