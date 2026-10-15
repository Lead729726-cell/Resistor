import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {structuredStatus} from './structured-ai.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(v=>{const i=v.indexOf('=');return [v.slice(0,i),v.slice(i+1)];}));
if(!args['--workspace']||!args['--credential-workspace'])throw Error('Usage: npm run study:link -- --workspace=<Edu private workspace> --credential-workspace=<existing authorized credential workspace>');
const workspace=path.resolve(args['--workspace']),source=path.resolve(args['--credential-workspace']);
if(workspace===source)throw Error('Use the separate Edu workspace; never migrate or copy Industry data.');
const status=await structuredStatus(source);if(!status.configured)throw Error('Existing credential is not configured.');
const directory=path.join(workspace,'.runtime/education/study');await mkdir(directory,{recursive:true});
// Exclusive creation preserves any existing authorized link.
await writeFile(path.join(directory,'provider.json'),JSON.stringify({schema_version:1,edition:'edu',credential_workspace:source,mode:'reference-only'},null,2)+'\n',{mode:0o600,flag:'wx'});
console.log(JSON.stringify({edition:'edu',configured:true,credential_copied:false,study_budget_usd:0,shared_budget_usd:status.budget_usd,automatic_calls:false}));
