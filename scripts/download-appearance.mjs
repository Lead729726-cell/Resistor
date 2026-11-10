import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// A presentation-only build preserves published tutorials, media and their
// historical engine evidence. Full tutorial generation retains its own gates.
export async function prepareDownloadAppearance(root=process.cwd()) {
  const site=path.join(root,'platform/download-site');
  const assets=[['workbench.css','workbench-site.css'],['edu-guide.css','edu-guide.css']];
  const manifestFile=path.join(site,'learning-assets.json');
  const manifest=JSON.parse(await readFile(manifestFile,'utf8'));
  const prepared=await Promise.all(assets.map(async([source,file])=>{
    const body=Buffer.from((await readFile(path.join(root,'scripts/site',source),'utf8')).replace(/\r\n/g,'\n'));
    return {file,body,sha256:createHash('sha256').update(body).digest('hex')};
  }));
  for(const {file,body,sha256} of prepared) {
    await writeFile(path.join(site,file),body);
    const entry=manifest.files.find(asset=>asset.file===file);
    if(entry) {entry.bytes=body.length;entry.sha256=sha256;}
  }
  await writeFile(manifestFile,JSON.stringify(manifest,null,2)+'\n');
  return {files:prepared.map(({file,body,sha256})=>({file,bytes:body.length,sha256})),engine_evidence_regenerated:false};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await prepareDownloadAppearance(),null,2));
}
