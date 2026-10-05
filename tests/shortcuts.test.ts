import test from 'node:test';
import assert from 'node:assert/strict';
import {deleteDesignKey} from '../packages/ui/src/shortcuts';
const key=(key:string,extra={})=>({key,ctrlKey:false,metaKey:false,altKey:false,...extra});
test('Mac Delete key is Backspace; modified text deletion never deletes circuit objects',()=>{
  assert(deleteDesignKey(key('Backspace'),true));assert(!deleteDesignKey(key('Backspace'),false));assert(deleteDesignKey(key('Delete'),false));
  for(const modifier of ['ctrlKey','metaKey','altKey'])assert(!deleteDesignKey(key('Backspace',{[modifier]:true}),true));
});
