# Video recording suite

Phase 3 of the 15-minute product film pipeline.
See [/docs/video/script-2026-05-25.md](../../../docs/video/script-2026-05-25.md) for the full V/O script and shot map.

## Run

```bash
# 1. Start the local wrangler dev server (separate terminal)
npm run dev

# 2. Apply the demo seed if not already applied
wrangler d1 migrations apply open-energy-db --local

# 3. Record all shots
scripts/video/run-shots.sh

# 4. Record one role only
scripts/video/run-shots.sh tests/video/trader.spec.ts
```

Outputs to `media/shots/<shot-key>.webm`. Per-test webm files are 1920×1080 30 fps.

## Phase 4 & 5

```bash
# 4. Render the V/O (en-US-AriaNeural, free via Microsoft Edge TTS)
pip install edge-tts                   # one-time
scripts/video/tts-render.sh            # → media/voiceover/act-{1..6}.wav

# 5. Composite (per-act + master 15-min MP4)
scripts/video/render-master.sh         # → media/master/cec-product-film-15min.mp4
```

## Adding a shot

1. Add a `[SCREEN: <new-key>]` cue at the matching beat in `docs/video/script-2026-05-25.md`.
2. Add a `test('<new-key>', …)` to the role spec, using `shot(page, '<url>', { dwell, waitFor, interact })`.
3. Re-run `scripts/video/run-shots.sh tests/video/<role>.spec.ts`.

`dwell` matches the V/O beat duration (10–14s by default).

## Targeting prod

Set `BASE=https://oe.vantax.co.za`. Note the 10 / 5 min / IP rate limit on
`/api/auth/login` — the suite caches one token per role (9 logins total
across all specs), so a full run is safe.
