import path from 'node:path';
import {prepareLeagueSite} from '../platform/league/site.mjs';
const args=process.argv.slice(2),option=name=>{const i=args.indexOf('--'+name);return i<0?undefined:args[i+1];};
if(!option('endpoint'))throw Error('Pass --endpoint https://public-league.example/api/league');
const result=await prepareLeagueSite({buildDirectory:path.resolve(option('build')||'dist'),targetDirectory:path.resolve(option('out')||'.runtime/league-site'),endpoint:option('endpoint'),identityNamespace:option('identity-namespace')||'resistor-edu-public-20261016'});
console.log(JSON.stringify(result));
