import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const source=path.resolve(process.argv[2]||'product'),edition=process.argv[3],version=process.argv[4];
if(!['edu','indust'].includes(edition)||!/^\d+\.\d+\.\d+$/.test(version))throw Error('Expected product directory, edition and release version.');
const identity=JSON.parse(await readFile(path.join(source,'product-edition.json'),'utf8'));
if(identity.edition!==edition)throw Error('Refusing to rebrand another edition source.');
const sourceRevision=execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim();
if(!/^[0-9a-f]{40}$/.test(sourceRevision))throw Error('Expected a complete source revision.');
const files=['scripts/package.mjs','scripts/prepare-native-runtime.mjs','scripts/edition-native-release.mjs','scripts/edition-native-qa.mjs','scripts/edition-install.cjs','scripts/windows-arm-installer.mjs'];
const hashes={};for(const file of files){const b=await readFile(file);hashes[file]=createHash('sha256').update(b).digest('hex');await mkdir(path.dirname(path.join(source,file)),{recursive:true});await copyFile(file,path.join(source,file));}
const pkgFile=path.join(source,'package.json'),pkg=JSON.parse(await readFile(pkgFile,'utf8')),sourceVersion=pkg.version;pkg.version=version;await writeFile(pkgFile,JSON.stringify(pkg,null,2)+'\n');
const lockFile=path.join(source,'package-lock.json'),lock=JSON.parse(await readFile(lockFile,'utf8'));lock.version=version;if(lock.packages?.[''])lock.packages[''].version=version;await writeFile(lockFile,JSON.stringify(lock,null,2)+'\n');
await mkdir(path.join(source,'.runtime'),{recursive:true});await writeFile(path.join(source,'.runtime/edition-build-overlay.json'),JSON.stringify({schema_version:1,edition,source_revision:sourceRevision,source_version:sourceVersion,release_version:version,build_helpers_sha256:hashes},null,2)+'\n');
console.log(JSON.stringify({edition,source_version:sourceVersion,version,shared_build_helpers:files.length}));
