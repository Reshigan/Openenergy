#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════
# Phase 4 — TTS render. Reads docs/video/script-2026-05-25.md, splits by
# ## ACT N heading, and pipes each act's narrator copy (blockquote `>`
# lines, with the leading "> " stripped) into edge-tts.
#
# Voice history:
#   - V1: en-US-AriaNeural   — user feedback: "too robotic"
#   - V2: en-ZA-LeahNeural   — user feedback: "static, broken, mechanical"
#   - V3: en-US-AvaMultilingualNeural — Microsoft's most natural conversational
#         neural voice. Multilingual line carries noticeably more prosody +
#         breath than the regional neurals. Override with EDGE_TTS_VOICE if
#         a different voice should be tried.
#
# Output: media/voiceover/act-{1..6}.wav.
#
# Requires:
#   - python 3.9+
#   - pip install edge-tts  (https://github.com/rany2/edge-tts)
#   - ffmpeg (for any post-render normalisation)
#
# Free. Microsoft Edge TTS does not require an API key.
# ════════════════════════════════════════════════════════════════════════

set -euo pipefail

cd "$(dirname "$0")/../.."

SCRIPT_PATH="../docs/video/script-2026-05-25.md"
VOICE="${EDGE_TTS_VOICE:-en-US-AvaMultilingualNeural}"
# Ava-Multilingual's default cadence lands ~16:30 on this script's word
# count; +6% trims to ~15:00 without losing the conversational delivery.
RATE="${EDGE_TTS_RATE:-+6%}"
OUT_DIR="media/voiceover"

mkdir -p "$OUT_DIR"

if ! python3 -c "import edge_tts" 2>/dev/null; then
  echo "✗ edge-tts not installed. Run: pip install --user edge-tts" >&2
  exit 1
fi
EDGE_TTS=(python3 -m edge_tts)

# Split the script into per-act narrator text files, then render each one.
python3 - <<'PY'
import re, pathlib

src = pathlib.Path("../docs/video/script-2026-05-25.md").read_text()
out = pathlib.Path("media/voiceover")
out.mkdir(parents=True, exist_ok=True)

# Find each "## ACT N — ..." section.
acts = re.split(r'\n## ACT (\d+) — [^\n]+\n', src)
# acts[0] is the preamble (before Act 1); thereafter alternates id, body, id, body...
narrators = {}
for i in range(1, len(acts), 2):
    act_id = acts[i].strip()
    body = acts[i + 1]
    # Stop at the next H2 (## Total / ## TTS render plan / ## Recording cue map)
    body = re.split(r'\n## ', body, maxsplit=1)[0]
    # Extract blockquote lines (narrator copy)
    lines = []
    for ln in body.splitlines():
        m = re.match(r'^>\s?(.*)$', ln)
        if m:
            lines.append(m.group(1).rstrip())
    text = "\n\n".join([s for s in "\n".join(lines).split("\n\n") if s.strip()])
    narrators[act_id] = text
    p = out / f"act-{act_id}.txt"
    p.write_text(text)
    print(f"  · act {act_id}: {len(text.split())} words → {p}")
PY

for ACT in 1 2 3 4 5 6; do
  IN="$OUT_DIR/act-${ACT}.txt"
  OUT_WAV="$OUT_DIR/act-${ACT}.wav"
  OUT_MP3="$OUT_DIR/act-${ACT}.mp3"
  if [[ ! -s "$IN" ]]; then
    echo "✗ no text for act $ACT at $IN" >&2
    continue
  fi
  echo "▶ Rendering act $ACT with $VOICE rate=$RATE"
  # edge-tts argparse treats `-3%` as a flag, not a value. Use `--rate=<v>` form.
  "${EDGE_TTS[@]}" \
    --voice "$VOICE" \
    --rate="$RATE" \
    --file "$IN" \
    --write-media "$OUT_MP3"
  # Normalise to 48 kHz mono WAV for ffmpeg composite step.
  ffmpeg -y -loglevel error -i "$OUT_MP3" -ar 48000 -ac 1 "$OUT_WAV"
  DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT_WAV")
  echo "  · $OUT_WAV (${DUR}s)"
done

echo
echo "▶ Done. WAV duration sum:"
TOTAL=0
for w in "$OUT_DIR"/act-*.wav; do
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$w")
  TOTAL=$(echo "$TOTAL + $d" | bc -l)
done
printf "  %0.1f seconds (%0.1f min)\n" "$TOTAL" "$(echo "$TOTAL / 60" | bc -l)"
