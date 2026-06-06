// ═══════════════════════════════════════════════════════════════════════════
// Cascade-rule barrel. Importing this module (side-effect) registers every
// rule with the Layer A registry. index.ts imports it once at boot so rules
// are live before any cascade fires.
//
// Week 1: intentionally empty — the registry is a safe no-op and platform
// behaviour is unchanged. Week 2+ adds one file per interaction here, e.g.:
//   import './cod-to-drawdown';     // #1  W20 → W21/W22
//   import './algo-kill-switch';    // #2  W60 → trading block
// Each rule file calls registerCascadeRule({...}) at module scope.
// ═══════════════════════════════════════════════════════════════════════════
export {}; // no rules yet
