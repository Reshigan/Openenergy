#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════
# Teaser-cut TTS — single-pass render of docs/video/teaser-2026-05-26.md
# into one ~5:00 WAV (media/voiceover/teaser.wav). All blockquote lines
# in narrator order, no per-act splitting (the composite ffmpeg does the
# tpad to audio duration once at the end).
# ════════════════════════════════════════════════════════════════════════

set -euo pipefail

cd "$(dirname "$0")/../.."

SCRIPT_PATH="../docs/video/teaser-2026-05-26.md"
VOICE="${EDGE_TTS_VOICE:-en-ZA-LeahNeural}"
RATE="${EDGE_TTS_RATE:-+4%}"
OUT_DIR="media/voiceover"

mkdir -p "$OUT_DIR"

if ! python3 -c "import edge_tts" 2>/dev/null; then
  echo "✗ edge-tts not installed. Run: pip install --user edge-tts" >&2
  exit 1
fi

python3 - <<PY
import re, pathlib
src = pathlib.Path("$SCRIPT_PATH").read_text()
lines = []
for ln in src.splitlines():
    m = re.match(r'^>\s?(.*)$', ln)
    if m:
        lines.append(m.group(1).rstrip())
text = "\n\n".join([s for s in "\n".join(lines).split("\n\n") if s.strip()])
out = pathlib.Path("$OUT_DIR/teaser.txt")
out.write_text(text)
print(f"  · teaser: {len(text.split())} words → {out}")
PY

IN="$OUT_DIR/teaser.txt"
OUT_MP3="$OUT_DIR/teaser.mp3"
OUT_WAV="$OUT_DIR/teaser.wav"

echo "▶ Rendering teaser with $VOICE rate=$RATE"
python3 -m edge_tts \
  --voice "$VOICE" \
  --rate="$RATE" \
  --file "$IN" \
  --write-media "$OUT_MP3"

ffmpeg -y -loglevel error -i "$OUT_MP3" -ar 48000 -ac 1 "$OUT_WAV"
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT_WAV")
printf "  · %s (%.1fs / %.2f min)\n" "$OUT_WAV" "$DUR" "$(echo "$DUR / 60" | bc -l)"
