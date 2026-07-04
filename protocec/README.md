# CEC · Concierge (prototype)

A radically simplified, conversational front door to the CEC platform. One
plain-language box gets the most elementary user to their goal — *"my bill is
too high → cleaner, cheaper supply"* — in a guided, one-decision-per-screen
flow. The full complexity stays intact: this only ever calls the **real**
backend endpoints (same ones a manual user hits), and the one sensitive action
(letter of intent) is gated behind an explicit human confirm.

**Design principle:** language *proposes*, the human *confirms*, the backend
state machine *disposes*. Free text never executes anything — it resolves to a
closed allow-list of known intents ([src/intents.ts](src/intents.ts)). Anything
unmatched falls back to suggestions, never an open-ended action.

## Run locally

```bash
npm install
npm run dev          # Vite on :5173, proxies /api/* → https://cec.vantax.co.za
```

Sign in as the worked persona (Thabo / Goldrush): `demo@goldrush.co.za` / `Demo@2024!`.

## Build + type-check

```bash
npm run check        # tsc --noEmit
npm run build        # → dist/
```

## Deploy (only after approval)

Serves the SPA and proxies `/api/*` to the live backend via its own Worker, so
all calls are same-origin (no CORS). Targets `protocec.vantax.co.za`.

```bash
npm run deploy       # vite build && wrangler deploy
```

## How it talks to the backend

Every call is same-origin `/api/*`:
- **dev** — Vite proxy ([vite.config.ts](vite.config.ts)) forwards to `cec.vantax.co.za`
- **prod** — the Worker ([worker/index.ts](worker/index.ts)) forwards to `cec.vantax.co.za`

Endpoints used (all existing, validated): `POST /api/auth/login`,
`GET/POST /api/ai/offtaker/bills`, `POST /api/ai/offtaker/optimize`,
`POST /api/ai/offtaker/loi`.

## Scope

One persona, end-to-end. The bill journey is real (live bill → AI optimise →
LOI draft). Other intents are escape hatches into the full Meridian workspace.
If the LOI draft comes back empty (cross-tenant seed gap), the UI degrades to
"interest registered" rather than faking a draft.
