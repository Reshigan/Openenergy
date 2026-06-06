// Layer A rule-registry barrel. Importing this module self-registers every
// cascade rule (index.ts imports it once at boot). Tests that reset the
// registry call the individual register*() functions directly.
import { registerTradingSafetyRules } from './trading-safety';

registerTradingSafetyRules();

export { registerTradingSafetyRules };
