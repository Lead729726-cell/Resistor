import {createHash} from 'node:crypto';
import {REPOSITORY} from '../../apps/desktop/update-feed.mjs';
export const updateBody=Buffer.from('deterministic edition updater test fixture');
export const sha=b=>createHash('sha256').update(b).digest('hex');
export function editionRelease({edition='indust',version='0.23.0',target='windows-x64',body=updateBody}={}){
 const tag='editions-v'+version,slug=edition==='edu'?'Edu':'Indust',ext=target.startsWith('windows')?'exe':target.startsWith('macos')?'zip':'tar.gz',name=`Resistor-${slug}-${version}-${target}.${ext}`;
 const receipt={schema_version:1,edition,product_id:'resistor.'+edition,version,platform:target.split('-')[0],arch:target.split('-')[1],source_revision:'a'.repeat(40),build_tools_revision:'b'.repeat(40),file:name,bytes:body.length,sha256:sha(body),native_qa:{completed:true,edition,source_revision:'a'.repeat(40)}};
 const receiptBody=Buffer.from(JSON.stringify(receipt)),meta=(name,bytes)=>({name,size:bytes.length,digest:'sha256:'+sha(bytes),browser_download_url:`https://github.com/${REPOSITORY}/releases/download/${tag}/${name}`});
 return {release:{tag_name:tag,html_url:`https://github.com/${REPOSITORY}/releases/tag/${tag}`,draft:false,prerelease:true,body:'QA release fixture',assets:[meta(name,body),meta(name.replace(/\.(exe|zip|tar\.gz)$/,'.json'),receiptBody)]},receipt,receiptBody,body};
}
