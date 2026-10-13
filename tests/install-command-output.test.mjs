import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {run} from '../apps/desktop/update-install.mjs';

test('native installer waits for trailing stdout after process exit before checking bundle identifier',async()=>{
 const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>{};
 const pending=run('/usr/libexec/PlistBuddy',[],{spawnImpl:()=>child});
 child.emit('exit',0);child.stdout.emit('data',Buffer.from('org.register.'));child.stdout.emit('data',Buffer.from('eda\n'));child.emit('close',0);
 assert.equal(await pending,'org.register.eda\n');
});
test('nonzero close preserves installer failure even after partial stdout',async()=>{
 const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>{};
 const pending=run('/usr/libexec/PlistBuddy',[],{spawnImpl:()=>child});
 child.stdout.emit('data',Buffer.from('partial'));child.emit('exit',1);child.emit('close',1);
 await assert.rejects(pending,/PlistBuddy \/ 1/);
});
