import test from 'node:test';
import assert from 'node:assert/strict';
import {validateInstalledProduct} from '../apps/desktop/update-install.mjs';
test('Indust product migration accepts legacy common archives and explicitly identified Indust packages',()=>{
 const base={name:'resistor-eda',version:'0.27.0'};
 validateInstalledProduct({...base,productName:'Resistor'},'0.27.0');
 for(const productName of ['Resistor','Resistor Industry','Resistor Indust'])validateInstalledProduct({...base,productName},'0.27.0',{schema_version:1,edition:'indust'});
});
test('another edition, ambiguous product, malformed identity and wrong version never install',()=>{
 const base={name:'resistor-eda',productName:'Resistor Indust',version:'0.27.0'};
 assert.throws(()=>validateInstalledProduct(base,'0.27.0'));
 for(const marker of [{schema_version:1,edition:'edu'},{schema_version:9,edition:'indust'},{schema_version:1,edition:'other'}])assert.throws(()=>validateInstalledProduct(base,'0.27.0',marker));
 assert.throws(()=>validateInstalledProduct({...base,productName:'Resistor Edu'},'0.27.0',{schema_version:1,edition:'indust'}));
 assert.throws(()=>validateInstalledProduct({...base,name:'other'},'0.27.0',{schema_version:1,edition:'indust'}));
 assert.throws(()=>validateInstalledProduct(base,'0.28.0',{schema_version:1,edition:'indust'}));
});
