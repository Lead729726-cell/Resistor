import {runNative} from './native-worker.mjs';

const limits = Object.freeze({
  'pdk-extract':120000, 'python-extract':120000, 'klayout-extract':120000,
  'ngspice-extract':120000, 'ngspice-configure':180000, 'ngspice-compile':600000,
  'ngspice-install':120000, 'klayout-probe':20000, 'ngspice-probe':20000,
});

export function nativePreparationLimit(phase,{platform=process.platform,arch=process.arch}={}) {
  if(!Object.hasOwn(limits,phase))throw Error('Unknown native preparation phase.');
  // The first uncached Intel CI build timed out in preparation after 775 s.
  // Compilation is suspected, not proven by that old unlabelled error. Give
  // only this build-time compiler a bounded 20 min; runtime/QA limits stay fixed.
  return phase==='ngspice-compile'&&platform==='darwin'&&arch==='x64'?1200000:limits[phase];
}

export async function runPreparationPhase(phase,executable,args,options={},dependencies={}) {
  const {run=runNative,log=message=>console.log(message),now=()=>performance.now(),platform=process.platform,arch=process.arch}=dependencies;
  const timeout=nativePreparationLimit(phase,{platform,arch}),started=now();
  // Only allowlisted phase names and timing are logged, never arguments/env.
  const report=status=>log(JSON.stringify({native_preparation:phase,status,elapsed_ms:Math.max(0,Math.round(now()-started)),timeout_ms:timeout}));
  report('started');
  try {
    const result=await run(executable,args,{...options,timeout});report('completed');return result;
  } catch(cause) {
    report('failed');
    throw new Error(`Native preparation phase ${phase} failed after ${Math.max(0,Math.round(now()-started))} ms (limit ${timeout} ms).`,{cause});
  }
}
