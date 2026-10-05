import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
export const METHODS = new Set(['toolchain.doctor','project.create','project.list','project.open','project.save','project.snapshot','project.rename','project.clone','project.export_bundle','project.import_bundle','project.command_receipt','pdk.register','pdk.validate','pdk.list_devices','pdk.capabilities','layout.apply_command','layout.generate_pcell','layout.import','layout.export','schematic.apply_command','schematic.validate','schematic.export_spice','view.get_scene','view.set_display','view.pick','view.cross_probe','simulation.run','simulation.measure','simulation.compare','verification.run_drc','verification.run_lvs','extraction.run_pex','extraction.get_net_mapping','schematic.netlist_xschem','experiment.list','experiment.status','experiment.cancel','experiment.create','experiment.evaluate','experiment.compare','job.status','job.logs','job.cancel']);
for (const method of ['pdk.list_profiles', 'analysis.inspect', 'analysis.configure', 'analysis.run', 'analysis.verify']) METHODS.add(method);
for (const method of ['backend.catalog', 'backend.list_profiles', 'backend.register', 'backend.validate', 'backend.configure', 'backend.run', 'backend.read_artifact', 'backend.import_layout']) METHODS.add(method);
for (const method of ['compat.inspect','compat.import','compat.export','compat.import_results']) METHODS.add(method);
for (const method of ['database.catalog','database.list_sources','database.register','database.probe','database.list_cells','database.read','database.read_artifact','database.import']) METHODS.add(method);
for (const method of ['starter.catalog','starter.create','pvt.create','pvt.start','pvt.sources','pvt.status','pvt.list','pvt.cancel','design.catalog','design.create_template','design.routing_rules','design.route_preview','design.route_apply','design.connectivity','design.check']) METHODS.add(method);
export const IMAGE = 'hpretl/iic-osic-tools@sha256:92961478ad3c4f508efb42d9ccdba12ab262eb42a14926d2bd49862230ba8521';
for (const method of ['digital.catalog','digital.create','hierarchy.sources','hierarchy.preview','hierarchy.apply']) METHODS.add(method);
export async function runtimeConfig(workspace=process.env.MOS_WORKSPACE??process.cwd()){
  const folder=path.join(workspace,'.runtime');const file=path.join(folder,'worker.json');
  await mkdir(folder,{recursive:true});
  let config;try { config=JSON.parse(await readFile(file,'utf8')); }catch(e){if(e.code!=='ENOENT')throw e;config={url:'http://127.0.0.1:18765',token:randomBytes(32).toString('hex')};await writeFile(file,JSON.stringify(config),{mode:0o600});}
  const url=new URL(config.url);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1')throw new Error('Worker must use IPv4 loopback HTTP');
  if(typeof config.token!=='string'||config.token.length<32)throw new Error('Invalid worker session configuration');
  return {...config,workspace:path.resolve(workspace),file};
}
export async function workerRpc(config,method,params={}){
  if(!METHODS.has(method))return {ok:false,error:{code:'UNSUPPORTED_METHOD',message:`Unsupported method: ${method}`}};
  if(method==='layout.import'&&params.file_base64!==undefined){
    const decode=(text,max)=>{if(typeof text!=='string'||text.length>max*1.4)throw new Error('Layout upload size/format invalid');const bytes=Buffer.from(text,'base64');if(!bytes.length||bytes.length>max||bytes.toString('base64')!==text)throw new Error('Layout upload must be canonical base64 within the size limit');return bytes;};
    if(!['gds','oas'].includes(params.format))throw new Error('Upload GDSII or OASIS');
    const bytes=decode(params.file_base64,16*1024*1024),sidecar=params.sidecar_base64===undefined?undefined:decode(params.sidecar_base64,2*1024*1024),id=randomUUID(),filename=`layout.${params.format}`;
    const dir=path.join(config.workspace,'.runtime/eda/uploads',id);await mkdir(dir,{recursive:true});await writeFile(path.join(dir,filename),bytes);if(sidecar)await writeFile(path.join(dir,`${filename}.mos.json`),sidecar);
    params={...params,path:`/workspace/.runtime/eda/uploads/${id}/${filename}`};delete params.file_base64;delete params.sidecar_base64;delete params.format;
  }
  // Bounded large-file transfers can outlast ordinary interactive requests.
  const timeout=['project.import_bundle','project.export_bundle'].includes(method)?180000:65000;
  const response=await fetch(`${config.url}/rpc`,{method:'POST',headers:{'Content-Type':'application/json','X-MOS-Token':config.token},body:JSON.stringify({method,params}),signal:AbortSignal.timeout(timeout)});
  if(!response.ok)throw new Error(`Worker HTTP ${response.status}`);return response.json();
}
