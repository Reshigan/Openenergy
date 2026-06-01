# W132 I18N — SHIP BRIEF

PHASE E WAVE 2 OF 5. SA national rollout requires multi-language. Foundation + 5 SA locales + machine-seeded with native-review flags.

## Stack
`react-i18next` v14 + `i18next` v23 + `i18next-http-backend` + `i18next-browser-languagedetector` + `i18next-icu` for plural rules. Existing 84-line `pages/src/i18n/index.ts` (en-ZA/af/zu flat dicts) REPLACED in place; `LocalePicker.tsx` shimmed to re-export `LanguageSwitcher.tsx` so single import site keeps working.

## 5 locales
`en` (canonical, hand-edited), `af`, `zu`, `xh`, `st`. Legacy `en-ZA` localStorage alias resolves to `en` via migration shim.

## Namespace structure (6 × 5 = 30 JSON files)
```
pages/src/locales/{en,af,zu,xh,st}/{common,nav,workstations,actions,errors,regulator}.json
```

## RTL readiness (architecture only — no RTL locales shipped)
- `<html lang dir>` set on every `languageChanged` event via DIR map (all 5 = ltr; future ar/he flips)
- Logical-property aliases added to signature.css (`--oe-inline-start/end` aliased to left/right)
- Tailwind logical-property plugin entry added; full sweep deferred to codemod queue

## Translation source — "machine-seed-with-flag"
- en hand-edited canonical
- af/zu/xh/st seeded by `scripts/i18n-translate-with-ai.ts` invoking `env.AI` (`@cf/meta/m2m100-1.2b`) on missing keys OR when en source-hash changes
- Each machine entry: `{ "value": "...", "__needs_review": true, "__source_hash": "<sha1>", "__seeded_at": "..." }`
- Build step compacts metadata to plain strings; git keeps metadata for native-speaker review
- Reviewer deletes `__needs_review` to "bless"
- Build-time cache: `pages/src/locales/cache/{lang}.json` checked into git
- CI fails if cache stale vs en source hashes (`npm run i18n:check`)

## Workers AI integration
- Reuse existing `env.AI` binding (see `src/utils/ai.ts:277-283`)
- Per-string prompt: system="Translate UI string en→{target}. Preserve {{placeholders}} + HTML verbatim. Output ONLY translation."
- Falls back to en + `__fallback: true` on AI failure (never blocks build)
- Run via `wrangler dev --remote --local-protocol=https` or admin-gated Worker route (AI binding not in plain node)

## Files to create
| Path | Purpose |
|---|---|
| `pages/src/i18n/index.ts` | Init + detector chain (qs→ls→nav→en) + Suspense + exports useLocale/useT/t/setLocale |
| `pages/src/i18n/useT.ts` | Hook wrapping useTranslation with namespace defaults |
| `pages/src/i18n/format.ts` | formatZAR/formatNumber/formatDate — Intl with `{locale}-ZA` then en-ZA fallback |
| `pages/src/locales/{en,af,zu,xh,st}/{common,nav,workstations,actions,errors,regulator}.json` | 30 namespace files |
| `pages/src/locales/cache/{af,zu,xh,st}.json` | Build-time AI cache (committed) |
| `pages/src/components/ui/LanguageSwitcher.tsx` | Header dropdown with native names + "machine-translated" hint on non-en |
| `scripts/i18n-extract.ts` | Codemod extracts JSX text + placeholder/title/label/aria-label literals → coverage report |
| `scripts/i18n-translate-with-ai.ts` | Fans en → af/zu/xh/st via AI binding; idempotent on source hash |
| `scripts/i18n-check.ts` | CI parity check: every en key exists in all 4 other locales |
| `tests/i18n-extraction.test.ts` | vitest — codemod fixtures: JSX extraction, ICU preservation, useT-skip, schema |

## Files to modify
| Path | Edit |
|---|---|
| `pages/package.json` | Add 5 i18n deps + 3 npm scripts (i18n:extract/translate/check) |
| `pages/src/main.tsx` | Import `./i18n` before App; Suspense wrap; document.documentElement.lang/dir |
| `pages/src/App.tsx` | Replace inline formatZAR; add LanguageSwitcher to FioriShell header |
| `pages/src/components/LocalePicker.tsx` | Re-export LanguageSwitcher shim (preserves single import site) |
| `pages/src/components/launch/LaunchBoardShell.tsx` | Demo conversion — chrome strings routed via useT('workstations') |
| `pages/src/components/launch/WorkstationShell.tsx` | Same |
| 8 wave-tabs (1/persona) | Chrome strings only; codemod queue captures rest |
| `src/index.ts` | `readAcceptLanguage` middleware sets `c.set('locale', …)` |
| `src/utils/server-t.ts` (NEW) | serverT(c,key,vars?) for errors/regulator namespaces only — NOT 2343 route literals |

## Acceptance
- LanguageSwitcher visible everywhere, persists to localStorage['oe.locale'], html lang/dir reflects
- 5 locales render LaunchBoardShell + WorkstationShell with ZERO "missingKey" warnings
- `npm run i18n:check` passes
- `i18n-coverage-report.json` lists remaining ~280 .tsx files for follow-on
- formatZAR(1234567) → "R 1 234 567" (en-ZA), "R 1 234 567,00" (af-ZA), other locales fall back to en-ZA via Intl
- Currency symbol pinned to "R" (not Intl ZAR variants)

## NO cron, NO migration
i18n is build-time + runtime. No `[triggers]` change. State in localStorage only.

## Verify
```bash
npm run check && npm run check:pages
npm test
npm run i18n:check
npm run test:browser
```
Playwright `tests/browser/i18n-locales.spec.ts`: per locale → navigate `/launch/admin?lang={locale}` → assert html[lang], chrome string changed, no missingKey console.

## Commit message
`feat(w132): i18n foundation — 5 SA languages (en/af/zu/xh/st), Workers AI seed translation, machine-flagged for native review`

## Out-of-scope (future)
- 6 remaining SA official langs (nso/tn/ts/ve/ss/nr)
- Native-speaker review pass (queue in JSON metadata)
- Full ICU plural fluency beyond defaults
- RTL CSS sweep (~280 components)
- Full 2343 server-route error literal conversion

## Gotchas
- TS1382: namespace JSON imports use `with { type: "json" }` single-line — codemod must emit exactly
- Protected tree: skip `pages/src/ux-alternatives/` + `pages/src/components/signature/__preview__/`
- login_or_cached FULL email (admin@openenergy.co.za, NOT admin) — burns rate-limit on 400
- Demo password `Demo@2024!` exact
- CF edge cache: `_headers` `no-store` on `/*` or repeat visitors see stale strings
- Hono basePath param collision: mount middleware globally BEFORE route table, NOT under path-with-param
- JWT roles suffixed (ipp_developer, grid_operator, carbon_fund) — i18n layer doesn't care, but Playwright matrix must use full suffixed emails
- `installSastClock()` in main.tsx — verify formatDate hits SAST clock not shadowed by Intl
- AI binding only in Worker runtime — translation script must run via `wrangler dev --remote` not plain tsx
