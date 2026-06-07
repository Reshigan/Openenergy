// Layer A rule-registry barrel. Importing this module self-registers every
// cascade rule (index.ts imports it once at boot). Tests that reset the
// registry call the individual register*() functions directly.
import { registerTradingSafetyRules } from './trading-safety';
import { registerLifecycleSequencingRules } from './lifecycle-sequencing';
import { registerTradeSettlementRules } from './trade-settlement';
import { registerContractLifecycleRules } from './contract-lifecycle';
import { registerIppLifecycleRules } from './ipp-lifecycle';
import { registerOnaOperationsRules } from './ona-operations';
import { registerEsgEventRules } from './esg-events';
import { registerRegulatorActionRules } from './regulator-actions';
import { registerGridDispatchRules } from './grid-dispatch';
import { registerTraderMarginRules } from './trader-margin';
import { registerLenderCovenantRules } from './lender-covenant';
import { registerCarbonEventRules } from './carbon-events';
import { registerRegulatorInboxRules } from './regulator-inbox';
import { registerOfftakerProcurementRules } from './offtaker-procurement';

registerTradingSafetyRules();
registerLifecycleSequencingRules();
registerTradeSettlementRules();
registerContractLifecycleRules();
registerIppLifecycleRules();
registerOnaOperationsRules();
registerEsgEventRules();
registerRegulatorActionRules();
registerGridDispatchRules();
registerTraderMarginRules();
registerLenderCovenantRules();
registerCarbonEventRules();
registerRegulatorInboxRules();
registerOfftakerProcurementRules();

export { registerTradingSafetyRules, registerLifecycleSequencingRules, registerTradeSettlementRules, registerContractLifecycleRules, registerIppLifecycleRules, registerOnaOperationsRules, registerEsgEventRules, registerRegulatorActionRules, registerGridDispatchRules, registerTraderMarginRules, registerLenderCovenantRules, registerCarbonEventRules, registerRegulatorInboxRules, registerOfftakerProcurementRules };
