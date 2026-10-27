// Fixed server-side roles. A missing model never silently falls back to another.
// Standard text rates, USD / million tokens; checked against the model catalog.
export const ASSISTANT_MODELS=Object.freeze({
  decision:Object.freeze({model:'gpt-6-luna',input:0.10,output:0.50,checked:'2026-10-27'}),
  execution:Object.freeze({model:'gpt-6.1-sol',input:2,output:10,checked:'2026-10-27'})
});
export function rolePricing(role='decision'){
  if(!Object.hasOwn(ASSISTANT_MODELS,role))throw Error('Unsupported assistant model role.');
  return ASSISTANT_MODELS[role];
}
