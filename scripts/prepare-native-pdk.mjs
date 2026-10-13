// Curate only the public SKY130 installation. Never package operator/user PDKs.
import {readFile,writeFile,mkdir,cp,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {runNative} from './native-worker.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function prepareNativePdk({workspace=process.cwd(),source=process.env.REGISTER_PUBLIC_PDK_SOURCE,archive=process.env.REGISTER_PUBLIC_PDK_ARCHIVE}={}){
  const out=path.join(workspace,'release/native-public-pdks');await mkdir(out,{recursive:true});
  if(source){
    for(const relative of ['libs.tech/ngspice','libs.ref/sky130_fd_pr/spice','libs.tech/magic','libs.tech/netgen','libs.tech/klayout','libs.ref/sky130_fd_sc_hd/gds','.config'])await cp(path.join(source,'sky130A',relative),path.join(out,'sky130A',relative),{recursive:true,dereference:true});
    const rc=path.join(out,'sky130A/libs.tech/magic/sky130A.magicrc'),original=await readFile(rc,'utf8');
    // This optional image-specific keyboard hook is unrelated to device rules.
    // Record the exact relocation so its changed deck hash remains auditable.
    const portable=original.replace(/^source \/foss\/tools\/osic-multitool\/iic-magic-bindkeys\s*$/m,'# Resistor native: image-only optional keyboard hook omitted.');
    await writeFile(rc,portable);
    await mkdir(path.join(out,'licenses'),{recursive:true});await cp(path.join(workspace,'examples/sky130/LICENSE-APACHE-2.0.txt'),path.join(out,'licenses/SKY130-APACHE-2.0.txt'));await cp(path.join(workspace,'examples/sky130/NOTICE.txt'),path.join(out,'licenses/SKY130-NOTICE.txt'));
    await writeFile(path.join(out,'provenance.json'),JSON.stringify({schema_version:1,source:'installed-public-SKY130A',open_pdks_commit:'d400e26845538beaeb7cc5fdb9bfc06c30ea27cb',upstream:'https://github.com/RTimothyEdwards/open_pdks',relocations:[{file:'sky130A/libs.tech/magic/sky130A.magicrc',original_sha256:hash(Buffer.from(original)),portable_sha256:hash(Buffer.from(portable)),change:'Remove OSIC-only optional keyboard source; retain model, technology and device generation rules.'}],private_pdk_included:false},null,2)+'\n');
  }else if(archive){
    const lock=JSON.parse(await readFile(new URL('./native-pdk-lock.json',import.meta.url),'utf8'));
    const bytes=await readFile(archive);if(hash(bytes)!==lock.sha256)throw Error('Public native PDK archive checksum mismatch.');await runNative('tar',['-xf',path.resolve(archive),'-C',out],{timeout:120000});
  }else{
    const lock=JSON.parse(await readFile(new URL('./native-pdk-lock.json',import.meta.url),'utf8')),cache=path.join(workspace,'.runtime/native-downloads');await mkdir(cache,{recursive:true});
    const file=path.join(cache,'sky130-native-v1.tar.gz');let bytes;try{bytes=await readFile(file);}catch(e){if(e.code!=='ENOENT')throw e;}
    if(!bytes||hash(bytes)!==lock.sha256){const response=await fetch(lock.url,{signal:AbortSignal.timeout(180000)});if(!response.ok)throw Error('Public native PDK archive unavailable: '+response.status);bytes=Buffer.from(await response.arrayBuffer());if(hash(bytes)!==lock.sha256)throw Error('Public native PDK archive checksum mismatch.');await writeFile(file,bytes);}
    await runNative('tar',['-xf',file,'-C',out],{timeout:120000});
  }
  // Validate this is the declared public resource tree, not a private process.
  const node=JSON.parse(await readFile(path.join(out,'sky130A/.config/nodeinfo.json'),'utf8'));if(node.node!=='sky130A'||node['foundry-name']!=='SkyWater')throw Error('Unexpected public PDK node metadata.');
  await readFile(path.join(out,'sky130A/libs.tech/ngspice/sky130.lib.spice'));await readFile(path.join(out,'sky130A/libs.tech/magic/sky130A.tech'));
  return out;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(await prepareNativePdk());
