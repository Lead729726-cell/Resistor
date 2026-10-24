import test from 'node:test';
import assert from 'node:assert/strict';
import {readPreference,writePreference,removePreference,readRecentProjects} from '../packages/ui/src/ui-preferences';
test('blocked browser storage cannot interrupt project opening or preference effects',()=>{
 const blocked=()=>{throw new DOMException('Blocked','SecurityError');};
 assert.equal(readPreference('last.edu',blocked),null);
 assert.equal(writePreference('last.edu','project',blocked),false);
 assert.equal(removePreference('last.edu',blocked),false);
});
test('a full preference store preserves existing entries and reports failed persistence',()=>{
 const entries=new Map([['last.edu','saved-project'],['last','industry-project']]);
 const source=()=>({getItem:(key:string)=>entries.get(key)||null,setItem:()=>{throw new DOMException('Full','QuotaExceededError');},removeItem:(key:string)=>{entries.delete(key);}});
 assert.equal(writePreference('last.edu','new-project',source),false);
 assert.equal(readPreference('last.edu',source),'saved-project');
 assert.equal(readPreference('last',source),'industry-project');
 assert.equal(removePreference('last.edu',source),true);
 assert.equal(readPreference('last',source),'industry-project');
});
test('corrupt recent-project preferences are isolated from valid project data',()=>{
 for(const input of ['{broken','{}','42','null','"text"'])assert.deepEqual(readRecentProjects(input),[]);
 assert.deepEqual(readRecentProjects('[null,{},1,{"id":"p","name":"학습"},{"id":"bad","name":3}]'),[{id:'p',name:'학습'}]);
});
