module.exports=async configuration=>{
 if(configuration.hash!=='sha256')throw Error('Official Windows signing requires SHA-256.');
 const {windowsSigningPolicy}=await import('./signing-policy.mjs');
 if(windowsSigningPolicy().mode==='none')throw Error('Trusted signing hook requires an explicit signing policy.');
 const {signWindowsFile}=await import('./windows-signing.mjs');
 await signWindowsFile(configuration.path);
};
