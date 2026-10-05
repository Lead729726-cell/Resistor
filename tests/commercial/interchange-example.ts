// Builds an original synthetic example package and parser evidence. No engine.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseCadenceTechfile,exportCompatBundle,exportNormalizedPdk,exportCadenceLayerMap,parseMappedResultText} from '../../packages/importer/src/index';
import type {ResultTableSchema} from '../../packages/importer/src/index';
const dir=new URL('./interchange/',import.meta.url),read=(name:string)=>readFileSync(new URL(name,dir),'utf8');
const output=new URL('./example-package/',dir);mkdirSync(output,{recursive:true});
const report=parseCadenceTechfile(read('fixture.tf'),'fixture.tf',{displayDrf:read('display.drf'),streamMap:read('fixture.layermap')});
for(const [name,text] of Object.entries({'display-pdk.json':exportNormalizedPdk(report),'compatibility-bundle.json':exportCompatBundle(report),'stream.layermap':exportCadenceLayerMap(report),'imported-current.json':JSON.stringify(parseMappedResultText(read('currents.csv'),JSON.parse(read('example-schema.json')) as ResultTableSchema,{revision:0}).currentFlow,null,2)+'\n'}))writeFileSync(new URL(name,output),text);
const hash=(path:URL)=>createHash('sha256').update(readFileSync(path)).digest('hex');
const files=['fixture.tf','fixture.layermap','display.drf','cds.lib','lib.defs','fixture.cdl','currents.csv','synopsys.tf','example-schema.json'];
writeFileSync(new URL('manifest.json',output),JSON.stringify({schema_version:1,synthetic:true,purpose:'Parser and display example only. No simulated/vendor-verified/foundry/signoff result.',sources:files.map(name=>({name,sha256:hash(new URL(name,dir))})),native_execution:false,vendor_verified:false},null,2)+'\n');
const shipped=new URL('../../examples/interchange/',import.meta.url);mkdirSync(shipped,{recursive:true});
for(const name of files)writeFileSync(new URL(name,shipped),read(name));
for(const name of ['display-pdk.json','compatibility-bundle.json','stream.layermap','imported-current.json','manifest.json'])writeFileSync(new URL(name,shipped),readFileSync(new URL(name,output)));
const nativeTest=readFileSync(new URL('../../workers/eda/test_interchange.py',import.meta.url),'utf8');
for(const [constant,name] of [['LEF','tiny.lef'],['DEF','tiny.def']]){const match=new RegExp(`^${constant}='''([\\s\\S]*?)'''`,'m').exec(nativeTest);if(!match)throw new Error(`Native verified ${constant} fixture missing`);writeFileSync(new URL(name,shipped),match[1]);}
const map=/^MAP=(\[.*\])$/m.exec(nativeTest);if(!map)throw new Error('Native verified MAP fixture missing');writeFileSync(new URL('layer-map.json',shipped),JSON.stringify(JSON.parse(map[1].replace(/'/g,'"')),null,2)+'\n');
const cleanCdl=read('fixture.cdl').replace(/\.INCLUDE[^\n]*\n\.control\n[\s\S]*?\.endc\n/i,'');writeFileSync(new URL('demo.cdl',shipped),cleanCdl);
const shippedNames=[...files,'display-pdk.json','compatibility-bundle.json','stream.layermap','imported-current.json','tiny.lef','tiny.def','layer-map.json','demo.cdl'];writeFileSync(new URL('manifest.json',shipped),JSON.stringify({schema_version:1,synthetic:true,purpose:'Original synthetic grammar fixtures and display example. LEF/DEF copies exactly the independent actual KLayout regression inputs. No vendor output/simulation/foundry/signoff claim.',files:shippedNames.map(name=>({name,sha256:hash(new URL(name,shipped))})),native_lef_def_fixture_source:'workers/eda/test_interchange.py (constants only; no test module import/execution)',native_fixture_source_sha256:hash(new URL('../../workers/eda/test_interchange.py',import.meta.url)),vendor_verified:false},null,2)+'\n');
console.log('Created examples/interchange and tests/commercial/interchange/example-package (synthetic parser demonstration)');
