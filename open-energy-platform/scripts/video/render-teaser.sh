#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════
# Teaser composite. Reads SHOTS list (from teaser-2026-05-26.md cue map),
# concatenates the captures into one silent 1080p MP4, then muxes against
# media/voiceover/teaser.wav. Output: media/master/cec-teaser-5min.mp4.
# ════════════════════════════════════════════════════════════════════════

set -euo pipefail

cd "$(dirname "$0")/../.."

SCRIPT_PATH="../docs/video/teaser-2026-05-26.md"
SHOTS_DIR="media/shots"
VO="media/voiceover/teaser.wav"
OUT="media/master/cec-teaser-5min.mp4"
WORK="media/master/_work"

mkdir -p "$(dirname "$OUT")" "$WORK"

if [[ ! -f "$VO" ]]; then
  echo "✗ missing $VO — run tts-teaser.sh first" >&2
  exit 1
fi

# Per-shot trim — same logic as render-master.sh, inlined.
TRIM_MIN="${VIDEO_TRIM_MIN:-2}"
TRIM_MAX="${VIDEO_TRIM_MAX:-12}"
TRIM_THRESH_BYTES="${VIDEO_TRIM_THRESH:-30000}"

probe_trim() {
  local f="$1"
  local tmp; tmp=$(mktemp /tmp/oe-trim.XXXXXX)
  local kfs
  kfs=$(ffprobe -loglevel error -select_streams v:0 \
        -read_intervals "%+${TRIM_MAX}" \
        -show_frames -show_entries frame=pict_type,best_effort_timestamp_time \
        -of csv "$f" 2>/dev/null \
        | awk -F, '$3=="I"{print $2}')
  for off in $kfs; do
    if awk -v o="$off" -v m="$TRIM_MAX" 'BEGIN{exit !(o>m)}'; then break; fi
    ffmpeg -nostdin -loglevel quiet -y -ss "$off" -i "$f" -frames:v 1 \
      -f mjpeg "$tmp" 2>/dev/null || true
    local sz; sz=$(wc -c < "$tmp" 2>/dev/null || echo 0)
    if (( sz > TRIM_THRESH_BYTES )); then
      if awk -v o="$off" -v m="$TRIM_MIN" 'BEGIN{exit !(o<m)}'; then
        off="$TRIM_MIN"
      fi
      rm -f "$tmp"; echo "$off"; return 0
    fi
  done
  rm -f "$tmp"; echo "$TRIM_MIN"
}

# Pull every [SCREEN: key,key,...] cue in document order.
python3 - <<PY > "$WORK/teaser-shots.txt"
import re, pathlib
src = pathlib.Path("$SCRIPT_PATH").read_text()
keys = []
for m in re.finditer(r'\[SCREEN:\s*([^\]]+)\]', src):
    for k in m.group(1).split(','):
        k = k.strip()
        if k:
            keys.append(k)
for k in keys:
    print(k)
PY

LIST="$WORK/teaser-list.txt"
: > "$LIST"
while read -r k; do
  src="$SHOTS_DIR/${k}.webm"
  if [[ ! -f "$src" ]]; then
    echo "  ⚠ missing shot: $k (skipping)" >&2
    continue
  fi
  abs=$(cd "$(dirname "$src")" && pwd)/$(basename "$src")
  trim=$(probe_trim "$src")
  echo "  · $k trim=${trim}s" >&2
  echo "file '$abs'" >> "$LIST"
  echo "inpoint $trim" >> "$LIST"
done < "$WORK/teaser-shots.txt"

VIDEO_SEG="$WORK/teaser-video.mp4"
ffmpeg -nostdin -y -loglevel error -f concat -safe 0 -i "$LIST" \
  -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30" \
  -c:v libx264 -preset medium -crf 22 -pix_fmt yuv420p -an "$VIDEO_SEG"

AUD_DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$VO")

# Pad with clone-frame to audio duration; mux with VO.
ffmpeg -nostdin -y -loglevel error -i "$VIDEO_SEG" -i "$VO" \
  -filter_complex "[0:v]tpad=stop_mode=clone:stop_duration=${AUD_DUR},setpts=PTS-STARTPTS[v]" \
  -map "[v]" -map 1:a:0 \
  -t "$AUD_DUR" \
  -c:v libx264 -preset medium -crf 22 -pix_fmt yuv420p \
  -c:a aac -b:a 160k -ar 48000 -ac 2 \
  "$OUT"

OUT_DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT")
printf "\n▶ Teaser: %s (%.1fs / %.2f min)\n" "$OUT" "$OUT_DUR" "$(echo "$OUT_DUR / 60" | bc -l)"
