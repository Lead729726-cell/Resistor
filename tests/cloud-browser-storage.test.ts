import test from 'node:test';
import assert from 'node:assert/strict';
import {readCloudBootstrap} from '../packages/cloud/src/browser-storage';
const keys={url:'cloud.url.edu',token:'cloud.token.edu',room:'cloud.room.edu'};
test('cloud bootstrap never combines a credential with a fallback endpoint after partial storage failure',()=>{
 const local=()=>({getItem:()=>{throw new DOMException('Blocked','SecurityError');}});
 const session=()=>({getItem:()=>{throw Error('Credentials must not be read after destination failure');}});
 assert.deepEqual(readCloudBootstrap(keys,local,session),{available:false,url:null,token:null,room:null});
});
test('a failed room read discards partial in-memory state without clearing saved keys',()=>{
 const saved=new Map([[keys.token,'qa-token'],[keys.room,'qa-room']]);
 const local=()=>({getItem:()=> 'https://example.invalid'});
 const session=()=>({getItem:(key:string)=>{if(key===keys.room)throw Error('denied');return saved.get(key)||null;}});
 assert.deepEqual(readCloudBootstrap(keys,local,session),{available:false,url:null,token:null,room:null});
 assert.equal(saved.size,2);
});
test('an intact cloud bootstrap reads only the selected edition keys',()=>{
 const values=new Map([[keys.url,'https://edu.invalid'],[keys.token,'edu-qa'],[keys.room,'edu-room'],['cloud.token','industry-qa']]);
 const source=()=>({getItem:(key:string)=>values.get(key)||null});
 assert.deepEqual(readCloudBootstrap(keys,source,source),{available:true,url:'https://edu.invalid',token:'edu-qa',room:'edu-room'});
 assert.equal(values.get('cloud.token'),'industry-qa');
});
