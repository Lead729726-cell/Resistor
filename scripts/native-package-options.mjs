import path from 'node:path';

// The curated runtime manifest covers every SDK file, including Python .o/.obj.
// Packager's default object-file and junk filters otherwise drop inventoried files.
export function nativePackageIgnore(file){
 const name='/'+String(file).replaceAll('\\','/').replace(/^\/+/, '');
 if(name==='/native-runtime'||name.startsWith('/native-runtime/'))return false;
 return /(?:^|\/)(?:\.git|\.secrets|\.runtime|node_gyp_bins)(?:\/|$)/.test(name)
  ||/\/node_modules\/\.bin(?:\/|$)/.test(name)
  ||/\/(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|\.DS_Store|Thumbs\.db|desktop\.ini)$/.test(name)
  ||/\.o(?:bj)?$/.test(name);
}
export const nativePackageCopyOptions=()=>({ignore:nativePackageIgnore,junk:false});

// Apple mach-o/loader.h: filetype is the fourth 32-bit header field.
// Relocatable compiler objects and debug/stub files remain sealed resources.
export function signableMachOHeader(bytes){
 if(bytes.length<16)return false;
 const magic=bytes.subarray(0,4).toString('hex');
 if(['cafebabe','bebafeca','cafebabf','bfbafeca'].includes(magic))return true;
 const little=['cffaedfe','cefaedfe'].includes(magic),big=['feedfacf','feedface'].includes(magic);
 return (little||big)&&[2,3,6,7,8,11,12].includes(little?bytes.readUInt32LE(12):bytes.readUInt32BE(12));
}

export function nativeArchiveCommand(archive,destination,{platform=process.platform,sevenZip=process.env.RESISTOR_7ZIP||'7z'}={}){
 const source=path.resolve(archive),output=path.resolve(destination);
 if(platform==='win32'&&source.toLowerCase().endsWith('.7z')){
  if(typeof sevenZip!=='string'||!sevenZip.trim()||/[\r\n\0]/.test(sevenZip))throw Error('A valid installed 7-Zip executable is required for the native Windows SDK.');
  return {executable:sevenZip,args:['x','-y','-o'+output,source]};
 }
 return {executable:'tar',args:['-xf',source,'-C',output]};
}
