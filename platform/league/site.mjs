import path from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';

// Minimal public build: follow league entry dependencies, never copy the app,
// sourcemaps, tutorials, projects, server files or environment configuration.
export async function prepareLeagueSite({buildDirectory,targetDirectory,endpoint,identityNamespace='resistor-edu-public-20261016'}){
 const u=new URL(endpoint);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/api/league')throw Error('An HTTPS /api/league endpoint is required.');
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(identityNamespace))throw Error('Invalid stable publisher namespace.');
 const root=path.resolve(buildDirectory),target=path.resolve(targetDirectory);if(target===root)throw Error('Use a separate public staging directory.');await mkdir(path.join(target,'assets'),{recursive:true});
 const html=await readFile(path.join(root,'league.html'),'utf8'),pending=[...html.matchAll(/(?:src|href)="\.\/assets\/([A-Za-z0-9_.-]+\.(?:js|css))"/g)].map(m=>m[1]),seen=new Set();
 if(!pending.some(s=>s.startsWith('league-')))throw Error('Build the standalone league entry first.');
 while(pending.length){const name=pending.pop();if(seen.has(name))continue;seen.add(name);let text=await readFile(path.join(root,'assets',name),'utf8');text=text.replace(/\n?\/\/# sourceMappingURL=[^\r\n]*/g,'');
  if(name.endsWith('.js'))for(const m of text.matchAll(/(?:from|import)\s*(?:\()?\s*["']\.\/([A-Za-z0-9_.-]+\.js)["']/g))pending.push(m[1]);
  await writeFile(path.join(target,'assets',name),text);
 }
 await writeFile(path.join(target,'index.html'),html);await writeFile(path.join(target,'.nojekyll'),'');
 await writeFile(path.join(target,'league-config.json'),JSON.stringify({schema_version:1,edition:'edu',endpoint:u.href,identity_namespace:identityNamespace,availability:'operator-pc-and-tunnel-required'},null,2)+'\n');
 return {edition:'edu',files:seen.size+3,assets:[...seen].sort(),identity_namespace:identityNamespace};
}
