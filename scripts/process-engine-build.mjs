import {build} from 'esbuild';
await build({entryPoints:['scripts/process-run.ts'],outfile:'dist/process-engine.mjs',bundle:true,platform:'node',target:'node24',format:'esm',legalComments:'linked'});
