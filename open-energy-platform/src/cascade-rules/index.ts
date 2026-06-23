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
import { registerUnderservedInboxRules } from './underserved-inboxes';
import { registerPpaDeliveryShortfallRules } from './ppa-delivery-shortfall';
import { registerPtwWoInteractionRules } from './ptw-wo-interactions';
import { registerTariffRepriceRules } from './tariff-reprice';
import { registerPredictiveMaintenanceRules } from './predictive-maintenance';
import { registerWarrantySupplyRules } from './warranty-supply';
import { registerDefaultFreezeRules } from './default-freeze';
import { registerOnboardingProvisioningRules } from './onboarding-provisioning';
import { registerDealEngineRules } from './deal-engine';
import { registerKycGateRules } from './kyc-gate';
import { registerSandboxSeedRules } from './sandbox-seed';
import { registerProjectFundingOfferRules } from './project-funding-offers';

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
registerUnderservedInboxRules();
registerPpaDeliveryShortfallRules();
registerPtwWoInteractionRules();
registerTariffRepriceRules();
registerPredictiveMaintenanceRules();
registerWarrantySupplyRules();
registerDefaultFreezeRules();
registerOnboardingProvisioningRules();
registerDealEngineRules();
registerKycGateRules();
registerSandboxSeedRules();
registerProjectFundingOfferRules();

export { registerTradingSafetyRules, registerLifecycleSequencingRules, registerTradeSettlementRules, registerContractLifecycleRules, registerIppLifecycleRules, registerOnaOperationsRules, registerEsgEventRules, registerRegulatorActionRules, registerGridDispatchRules, registerTraderMarginRules, registerLenderCovenantRules, registerCarbonEventRules, registerRegulatorInboxRules, registerOfftakerProcurementRules, registerUnderservedInboxRules, registerPpaDeliveryShortfallRules, registerPtwWoInteractionRules, registerTariffRepriceRules, registerPredictiveMaintenanceRules, registerWarrantySupplyRules, registerDefaultFreezeRules, registerOnboardingProvisioningRules, registerDealEngineRules, registerKycGateRules, registerSandboxSeedRules, registerProjectFundingOfferRules };
