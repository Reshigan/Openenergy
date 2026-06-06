// Layer A rule-registry barrel. Importing this module self-registers every
// cascade rule (index.ts imports it once at boot). Tests that reset the
// registry call the individual register*() functions directly.
import { registerTradingSafetyRules } from './trading-safety';
import { registerLifecycleSequencingRules } from './lifecycle-sequencing';
import { registerTradeSettlementRules } from './trade-settlement';
import { registerContractLifecycleRules } from './contract-lifecycle';
import { registerIppLifecycleRules } from './ipp-lifecycle';

registerTradingSafetyRules();
registerLifecycleSequencingRules();
registerTradeSettlementRules();
registerContractLifecycleRules();
registerIppLifecycleRules();

export { registerTradingSafetyRules, registerLifecycleSequencingRules, registerTradeSettlementRules, registerContractLifecycleRules, registerIppLifecycleRules };
