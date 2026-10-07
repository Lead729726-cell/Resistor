const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const os=require('node:os');
const fs=require('node:fs/promises');
const {configureAppIdentity}=require('../apps/desktop/identity.cjs');

test('product rename reopens the historical design directory without moving or modifying saved files',async()=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'resistor-identity-'));
  assert.equal(path.dirname(path.resolve(folder)),path.resolve(os.tmpdir()));
  try{
    const saved=path.join(folder,'레지스터','workspace','design.json');
    await fs.mkdir(path.dirname(saved),{recursive:true});
    await fs.writeFile(saved,'saved user design');
    let name,userData;
    configureAppIdentity({getPath:key=>{assert.equal(key,'appData');return folder},setName:value=>{name=value},setPath:(key,value)=>{assert.equal(key,'userData');userData=value}});
    assert.equal(name,'Resistor');
    assert.equal(await fs.readFile(path.join(userData,'workspace','design.json'),'utf8'),'saved user design');
    assert.deepEqual(await fs.readdir(folder),['레지스터']);
  }finally{await fs.rm(folder,{recursive:true,force:true})}
});

test('an explicit isolated user data override keeps its established destination',()=>{
  let destination;
  const requested=path.join(os.tmpdir(),'Resistor isolated user data');
  configureAppIdentity({getPath:()=>{throw Error('override must not inspect the default destination')},setName:()=>{},setPath:(_key,value)=>{destination=value}},{userDataOverride:requested});
  assert.equal(destination,path.resolve(requested));
});
