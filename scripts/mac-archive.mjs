import {lstat,readdir,readlink,readFile} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {once} from 'node:events';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Zip,ZipDeflate,ZipPassThrough} from 'fflate';

// ZIP Unix attributes retain execute bits and symlinks, including Framework
// Versions/Current. Windows ZIP utilities must not flatten the .app structure.
export async function archiveMacApp({app,destination,readme,version,arch,installer=false}) {
  const output=createWriteStream(destination),finished=once(output,'finish');
  const zip=new Zip((error,data,final)=>{if(error)output.destroy(error);else{output.write(data);if(final)output.end();}});
  const hashes=[],links=[];
  const append=async(source,name)=>{
    const info=await lstat(source);
    if(info.isDirectory()){for(const child of (await readdir(source)).sort())await append(path.join(source,child),`${name}/${child}`);return;}
    if(!info.isFile()&&!info.isSymbolicLink())throw Error(`Unsupported Mac bundle entry: ${name}`);
    const entry=info.isSymbolicLink()?new ZipPassThrough(name):new ZipDeflate(name,{level:6});
    entry.os=3;entry.attrs=(info.mode&0xffff)*65536;entry.mtime=info.mtime;zip.add(entry);
    if(info.isSymbolicLink()){const target=await readlink(source);links.push([name,target]);entry.push(Buffer.from(target),true);}
    else{const hash=createHash('sha256');for await(const chunk of createReadStream(source)){hash.update(chunk);entry.push(chunk,false);if(output.writableNeedDrain)await once(output,'drain');}entry.push(new Uint8Array(),true);hashes.push([name,hash.digest('hex')]);}
  };
  await append(app,'Resistor.app');
  const extra=[
    ['Mac 설치 안내.txt',readme,0o100644],
    ['Open Viewer.command','#!/bin/zsh\nset -e\nregister_folder="${0:A:h}"\n/usr/bin/open -n "$register_folder/Resistor.app" --args --viewer\n',0o100755]
  ];
  if(installer){
    if(!/^\d+\.\d+\.\d+$/.test(version)||!['arm64','x64'].includes(arch))throw Error('Mac installer requires a version and architecture.');
    const script=(await readFile('apps/desktop/Install Resistor.command','utf8')).replaceAll('@VERSION@',version).replaceAll('@ARCH@',arch);
    extra[1][1]='#!/bin/zsh\nset -e\nregister_app="$HOME/Applications/Resistor.app"\nif [[ ! -d "$register_app" ]]; then\n  print "먼저 같은 ZIP의 Install Resistor.command로 Resistor를 설치하세요."\n  exit 1\nfi\n/usr/bin/open -n "$register_app" --args --viewer\n';
    extra.push(['Install Resistor.command',script,0o100755],['Diagnose Resistor.command',await readFile('apps/desktop/Diagnose Resistor.command','utf8'),0o100755],['BUNDLE-SYMLINKS.tsv',links.map(([name,target])=>`${name}\t${target}`).join('\n')+'\n',0o100644]);
    for(const [name,text] of extra)hashes.push([name,createHash('sha256').update(text).digest('hex')]);
    extra.push(['BUNDLE-SHA256SUMS.txt',hashes.map(([name,hash])=>`${hash}  ${name}`).join('\n')+'\n',0o100644]);
  }
  for(const [name,text,mode] of extra){const entry=new ZipDeflate(name);entry.os=3;entry.attrs=mode*65536;zip.add(entry);entry.push(Buffer.from(text),true);}
  zip.end();await finished;
}
