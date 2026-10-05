import { readFile,mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { compareResolution,inspectVolume,simulateRecipe,stageVolume,volumeVtu,volumeVtuSettings,RECIPE_LIMITS } from '../packages/process/src/index';
const args=process.argv.slice(2),allowed=new Set(['--recipe','--out','--compare']);
for(let i=0;i<args.length;i++){if(!allowed.has(args[i]))throw new Error('지원 인수: --recipe <JSON> --out <directory> [--compare]');if(args[i]!=='--compare')i++;}
const value=(key:string)=>{const i=args.indexOf(key);if(i<0||!args[i+1]||args[i+1].startsWith('--'))throw new Error(`${key} 값이 필요합니다.`);return args[i+1];};
const input=await readFile(path.resolve(value('--recipe')));if(input.length>RECIPE_LIMITS.bytes)throw new Error('Recipe 상한은 32 MiB입니다.');
const recipe=JSON.parse(input.toString('utf8'));
const run=await (args.includes('--compare')?compareResolution(recipe):simulateRecipe(recipe));
const directory=path.join(path.resolve(value('--out')),`process-${run.recipe_sha256.slice(0,12)}-${Date.now()}`);
await mkdir(directory,{recursive:true});
const files:{name:string;sha256:string;bytes:number}[]=[];
const save=async(name:string,text:string)=>{const bytes=Buffer.from(text);await writeFile(path.join(directory,name),bytes,{flag:'wx'});files.push({name,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});};
await save('run.json',JSON.stringify(run,null,2));
for(let i=0;i<run.stages.length;i++){
  const prefix=`stage-${String(i).padStart(2,'0')}`,volume=stageVolume(run,i),inspection=inspectVolume(volume,{min_thickness_um:.03,min_coverage_ratio:.5});
  await save(`${prefix}.process.json`,JSON.stringify(volume));await save(`${prefix}.vtu`,volumeVtu(volume));await save(`${prefix}.vtu-setup.json`,JSON.stringify(volumeVtuSettings(volume),null,2));await save(`${prefix}.inspection.json`,JSON.stringify(inspection));
}
const receipt={engine:run.engine,input_sha256:createHash('sha256').update(input).digest('hex'),recipe_sha256:run.recipe_sha256,stages:run.stages.length,kinematic_prediction:true,calibrated_physical_prediction:false,foundry_signoff:false,files};
await save('receipt.json',JSON.stringify(receipt,null,2));
console.log(JSON.stringify({directory,engine:run.engine,stages:run.stages.length,recipe_sha256:run.recipe_sha256,kinematic_prediction:true,calibrated_physical_prediction:false,foundry_signoff:false}));
