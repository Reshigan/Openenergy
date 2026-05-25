# Consolidated Energy Cockpit — Product Video Design

> **Goal:** Produce a 15-minute corporate product video, with American-female voiceover, demonstrating each platform role to a United Nations + Global ESCO Network audience. Output: 11 modular MP4 files (intro + 9 role clips + outro) plus a stitched 15:00 master. Fully auto-generated; regeneratable when the product changes.
>
> **Audience:** United Nations · Global ESCO Network · LTM Energy commercial counterparties (DFIs, pension funds, banks, corporates, carbon buyers, regulators).
>
> **Continuous use:** the video is the company's product-demo asset for the next 18+ months. Modular outputs let sales send a single role segment for targeted prospects.

---

## 1. Brand & visual identity

Locked from `Consolidated_Energy_Cockpit_Corporate_2.pdf` (the corporate deck):

| Element | Locked value |
|---|---|
| Product name on camera | **Consolidated Energy Cockpit**, *powered by the Open Energy Platform* |
| Company brand | **LTM Energy** — *Managed Energy Solutions* |
| Primary color | Deep navy `#0f1c2e` (chrome, headings) |
| Accent color | Emerald `#1a7a3a` / `#0a6b3a` (CTA, KPI highlights) |
| Tertiary accent | Warm gold `#c89432` (alignment / regulation badges) |
| Typography | Inter-family sans-serif (deck uses Inter or near-equivalent) |
| Whitespace | Abundant — institutional / FT-style restraint |
| Mandatory taglines | *"We don't sell electricity — we build the infrastructure layer that makes renewable energy markets work."* · *"Stripe · Visa · AWS — for renewable energy markets."* · *"Mandate meets execution. Let's break the barrier together."* |

## 2. Audience & tone

- **Register:** *FT Explainer / Bloomberg Quicktake.* Warm, clear, lightly authoritative. Inviting, not lecturing.
- **Pace:** ~150 words per minute for V/O (industry standard for explainer video).
- **Value-first per beat:** every role segment answers, in order, **(a) the pain in the world today** → **(b) what this role does in the Cockpit** → **(c) the value to them + the value to the industry**.
- **What we avoid:** marketing-ese, stock-music swells, flashing transitions, emojis in chrome, "Coming soon" tiles on camera, mocked figures presented as real.

## 3. Storyline — 15:00, 6 acts

The spine is the **1:59:30 marathon / market barrier** metaphor from the deck (Kipchoge, 12 Oct 2019). *"A human barrier fell. A market barrier still stands. The Cockpit is how we break it."*

| Act | Time | Beat |
|---|---|---|
| 1. The barrier | 1:00 | Cold open on "1:59:30". Human barrier fell. Market barrier still stands. *Thesis stated.* |
| 2. The mandate | 1:30 | ERA 2024 cap removal → R2.23tn IRP 2025 → ~9–13 GW pipeline → SDG 7 & 13. *Capital is ready; markets are not.* |
| 3. The platform | 1:30 | LTM credentials (15s · Teebus 69.5 GWh). Six engines (45s). Five-layer architecture (30s). |
| 4. **The roles** | 9:00 | Main body — see §4 |
| 5. The economics | 1:30 | ~40% lower all-in · 15–20yr certainty · IRP/NERSA/Climate Act alignment |
| 6. Mandate meets execution | 0:30 | Vision · Vehicle · Impact. Partner lockup. *"Let's break the barrier together."* |
| **Total** | **15:00** | |

## 4. Role coverage — Act 4 breakdown (9:00)

Weighted to match the deck's emphasis (ecosystem & stakeholder diagrams put 6 roles forward; the platform supports 9).

| Tier | Roles | Time each | Subtotal |
|---|---|---|---|
| **Primary trio** *(commercial spine)* | IPP Developer · Trader · Offtaker | 75s | 3:45 |
| **Credibility trio** *(institutional confidence)* | Regulator · Carbon Fund · Lender / Financier | 65s | 3:15 |
| **Operations trio** *(the rails)* | Grid Operator · Platform Admin · Support | 40s | 2:00 |
| **Total Act 4** | | | **9:00** |

### Per-role beat pattern (mandatory)

Every role segment follows three beats, in this order:

1. **The pain** (~15s) — what is broken in the world today for this role.
2. **The workflow** (~35–45s) — concrete on-screen demonstration of what they do in the Cockpit.
3. **The value** (~10–15s) — what they get + what the industry gets when this role uses the Cockpit.

## 5. Production pipeline (all-free, all-local)

| Stage | Tooling | Key | Output |
|---|---|---|---|
| Recording | **Playwright** headed, 1920×1080 @ 30fps, deterministic seeded data | None | Silent MP4 per scene |
| Voiceover | **edge-tts** (Microsoft Edge TTS) — voice `en-US-AriaNeural` | None | WAV per scene |
| Composite | **ffmpeg** — overlay lower-thirds + voiceover + bed music | None | Scene MP4 → Role MP4 → Master MP4 |
| Captions | Generated mechanically from script timing | None | `.srt` per output |

**Voice profile:** `en-US-AriaNeural` (Microsoft neural, news-anchor register). Backup `en-US-JennyNeural` (warmer, TED-talk feel). A 30-second sample of both will be rendered in Phase 4 for a final pick.

**Music bed:** Royalty-free, sparse strings or low-key ambient. Mixed at -22 LUFS so V/O sits clearly on top. Pixabay or YouTube Audio Library — two candidate tracks pinned in script for human pick.

**Captions/SDH:** mechanically generated from V/O script + audio durations. UN-grade accessibility requirement.

## 6. Demo data — anonymized institutional

Names follow deck convention (restrained, no whimsy):

| Type | Examples |
|---|---|
| IPPs | "Solar IPP 01 — Northern Cape" · "Wind IPP 03 — Eastern Cape" · "Hydro IPP — Teebus" |
| Traders | "Counterparty A — Regional Trader" · "Counterparty B — Aggregator" |
| Offtakers | "Anchor Offtaker — C&I Mining Group" · "Industrial Offtaker — Manufacturer" |
| Funds | "Carbon Fund Alpha" · "Carbon Fund Beta" |
| Lenders | "DFI — Development Bank" · "Commercial Lender — Tier 1 Bank" |

MW / Rand / GWh figures are anchored to deck-stated realities (Teebus 9.5 MW, 69.5 GWh/yr, 18 000+ households; broader market 9–13 GW pipeline, R2.23tn IRP 2025). Per-trade figures are plausible against REIPPPP / NERSA gazette / JSE-SRL volumes.

Captured in migration `077_demo_seed_video.sql` (idempotent, additive — does not touch existing seed data).

## 7. Phase plan

Each phase has its own deliverable + commit + sign-off gate.

### Phase 1 — UI audit + demo re-seed *(starts immediately)*

**Goal:** every screen on camera reads as professional, brand-consistent, and full of plausible data.

- Build `tests/video/audit.spec.ts` — Playwright spec that logs in as each persona, walks each role's main navigation surfaces, and captures full-page screenshots to `docs/video/audit-shots/<persona>/<route-slug>.png`.
- Run against `oe.vantax.co.za` (live prod), shared admin token where needed.
- Manually review screenshots against a 13-point checklist (12 UX + 1 brand-match-to-deck axis).
- Write `docs/video/ui-audit-2026-05-25.md` — gap report, ranked by camera-impact.
- Land migration `077_demo_seed_video.sql` for any data gaps.
- Patch any high-impact UI issues that would embarrass us on camera.

**Deliverables:** audit report + migration + targeted UI fixes.

### Phase 2 — Storyline + V/O script

**Goal:** a sentence-by-sentence script with scene timing and on-screen action notes.

- Write `docs/video/script-2026-05-25.md` — full 15:00 script, scene-by-scene, with timestamps + V/O lines + on-screen action + lower-third overlay text.
- Each scene has: (a) duration, (b) Playwright route + action, (c) V/O line, (d) lower-third text.

**Deliverables:** committed script doc, ~2 500 spoken words (15 min × 150 wpm × ~1.1 buffer).

### Phase 3 — Playwright recording suite

**Goal:** a deterministic, regeneratable set of silent MP4s — one per scene.

- New Playwright project at `tests/video/` (separate config from the smoke specs to avoid CI noise).
- Config: headed, 1920×1080, 30fps, `video: 'on'`, slow motion off.
- One spec per role at `tests/video/<role>.spec.ts`.
- Each spec mirrors the script's scenes: navigate to route → wait for data → optionally interact (click tab, scroll, hover) → next scene.
- Output: `docs/video/recordings/<scene>.mp4`.

**Deliverables:** ~30–40 silent scene MP4s, one stable run.

### Phase 4 — TTS render

**Goal:** per-scene WAV files aligned to script timing.

- `scripts/video/tts-render.sh` — bash wrapper over `edge-tts --voice en-US-AriaNeural --text "..." --write-media <scene>.wav`.
- One WAV per scene.
- 30-second preview of *both* candidate voices (Aria, Jenny) for human pick.
- Captions: generated mechanically as `.srt` from script + measured WAV duration.

**Deliverables:** ~30–40 WAVs + 30–40 SRTs + voice preview.

### Phase 5 — ffmpeg composite

**Goal:** 11 modular MP4 outputs + 1 stitched master.

- `scripts/video/render-master.sh` — ffmpeg pipeline:
  1. Per scene: overlay V/O audio + lower-third PNG + bed music (sidechained ducking) on silent scene MP4 → scene MP4.
  2. Per role: concat all role scenes → `docs/video/output/role-<n>-<role>.mp4`.
  3. Concat all role MPs + intro + outro → `docs/video/output/master-15min.mp4`.
- Output: H.264, AAC, 1920×1080, 30fps, ~150 Mbps.
- 11 modular MP4s (intro + 9 role + outro) + 1 master MP4.

**Deliverables:** the video files. End of work.

## 8. Partner lockup (decision)

The deck closes with *LTM Energy · NTT DATA · Global ESCO Network · UNEP*. Without written consent to use NTT DATA / GEN / UNEP marks on a continuous-use video, the close defaults to:

- **Visual:** LTM Energy mark only.
- **Verbal:** V/O says *"in partnership with NTT DATA, the Global ESCO Network, and UN Environment Programme."*

This is reversible: once consent is obtained, the close-frame composite is a one-line flag flip and Phase 5 re-render only (~3 minutes of compute).

## 9. Quality bar — what "UN-grade" means

- No figure on camera that isn't traceable to a seed source (and the seed source is documented).
- No "Lorem ipsum", no placeholder pages, no "Coming soon" tiles visible on camera. *(Phase 1 finds and patches these.)*
- V/O: factual, gravitas-with-warmth, no marketing-ese. ~150 wpm.
- No emojis in chrome (deck uses none — platform must match).
- No flashing transitions, no stock-music swells. Restraint signals seriousness.
- Captions/SDH track on every output — UN accessibility requirement.

## 10. File layout (planned)

```
docs/
  superpowers/specs/
    2026-05-25-product-video-design.md     # this file
  video/
    ui-audit-2026-05-25.md                 # Phase 1 audit report
    script-2026-05-25.md                   # Phase 2 V/O script
    audit-shots/<persona>/<route>.png      # Phase 1 screenshots
    recordings/<scene>.mp4                 # Phase 3 silent scenes
    voiceover/<scene>.wav                  # Phase 4 V/O assets
    captions/<scene>.srt                   # Phase 4 captions
    output/
      intro.mp4                            # Phase 5 modular outputs
      role-1-ipp.mp4
      role-2-trader.mp4
      ... (9 roles)
      outro.mp4
      master-15min.mp4
open-energy-platform/
  migrations/
    077_demo_seed_video.sql                # Phase 1 data seed
  tests/
    video/
      audit.spec.ts                        # Phase 1 audit walker
      ipp.spec.ts                          # Phase 3 per-role recording specs
      trader.spec.ts
      ... (9 roles)
      playwright.config.ts                 # separate config from smoke
  scripts/
    video/
      tts-render.sh                        # Phase 4
      render-master.sh                     # Phase 5
      lower-third-make.sh                  # PNG generator for overlays
```

## 11. Open items (no blockers)

- **Voice pick** — Aria vs Jenny, resolved in Phase 4 with 30s previews.
- **Music bed pick** — two candidate tracks pinned in Phase 5, human picks.
- **Partner mark expansion** — pending user confirmation of NTT DATA / GEN / UNEP consent; safe default in §8.

## 12. Self-review

- **Placeholders:** none. Every section is concrete.
- **Internal consistency:** timings sum to 15:00 (1:00 + 1:30 + 1:30 + 9:00 + 1:30 + 0:30). Role weighting (3:45 + 3:15 + 2:00 = 9:00) matches Act 4 budget.
- **Scope:** 5 phases, each independent, each with its own gate.
- **Ambiguity:** brand, voice, demo-data convention, partner lockup all locked or have explicit safe defaults.
