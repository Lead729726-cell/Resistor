export function macBuildOptions(args=[]) {
  if(args.includes('--arm64')&&args.includes('--x64'))throw Error('Select one architecture or omit both to build both.');
  const revisions=args.filter(arg=>arg.startsWith('--revision='));
  if(revisions.length>1||revisions.length&&args.includes('--repair'))throw Error('Select a single Mac build revision.');
  const revision=revisions.length?Number(revisions[0].slice('--revision='.length)):args.includes('--repair')?2:1;
  if(!Number.isSafeInteger(revision)||revision<1||revision>999)throw Error('Mac build revision must be an integer from 1 to 999.');
  return {architectures:args.includes('--arm64')?['arm64']:args.includes('--x64')?['x64']:['arm64','x64'],revision,suffix:revision===1?'':`-r${revision}`};
}
