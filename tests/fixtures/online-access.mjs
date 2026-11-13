import {createOnlineAcknowledgment,ONLINE_ACCESS_POLICY_VERSION} from '../../platform/licensing/online-access-policy.mjs';
// Synthetic self-declaration for isolated provider fixtures, never user state.
export const fixtureOnlineAcknowledgment=(now=Date.now())=>createOnlineAcknowledgment({edition:'edu',policy_version:ONLINE_ACCESS_POLICY_VERSION,age_14_or_over:true},now);
export const fixtureOnlineOptions={edition:'edu',assertOnlineAccess:async()=>fixtureOnlineAcknowledgment()};
