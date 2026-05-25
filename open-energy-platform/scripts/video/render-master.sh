#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════
# Phase 5 — Composite. Sequences per-shot webm captures + per-act WAV
# voice-over into:
#   - media/master/cec-product-film-15min.mp4 (final, H.264 + AAC, 1080p)
#   - media/master/act-{1..6}.mp4              (per-act, same encoding)
#
# Approach:
#   1. For each act, build a concat list of the shots referenced by that
#      act's [SCREEN: <key>] cues (parsed from script-2026-05-25.md).
#   2. ffmpeg concat → silent video segment.
#   3. Pad/trim that segment to match the act's WAV duration.
#   4. Mux video + audio.
#   5. Concat the six per-act muxed files into the master.
#
# Requires: ffmpeg (with libx264 + aac).
# ════════════════════════════════════════════════════════════════════════

set -euo pipefail

cd "$(dirname "$0")/../.."

SCRIPT_PATH="../docs/video/script-2026-05-25.md"
SHOTS_DIR="media/shots"
VO_DIR="media/voiceover"
OUT_DIR="media/master"

mkdir -p "$OUT_DIR" "$OUT_DIR/_work"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "✗ ffmpeg not installed" >&2
  exit 1
fi

# Parse per-act shot keys from the script.
python3 - <<'PY' > "$OUT_DIR/_work/act-shots.tsv"
import re, pathlib
src = pathlib.Path("../docs/video/script-2026-05-25.md").read_text()
acts = re.split(r'\n## ACT (\d+) — [^\n]+\n', src)
for i in range(1, len(acts), 2):
    act_id = acts[i].strip()
    body = re.split(r'\n## ', acts[i + 1], maxsplit=1)[0]
    # Collect [SCREEN: <comma,separated,keys>] cues, in order.
    shots = []
    for m in re.finditer(r'\[SCREEN:\s*([^\]]+)\]', body):
        for k in m.group(1).split(','):
            k = k.strip()
            if k:
                shots.append(k)
    print(f"{act_id}\t" + "\t".join(shots))
PY

# Per-act compose. Use FD 3 for the TSV so ffmpeg's stdin reads do not
# consume from the same stream (that would corrupt the next iteration's
# ACT_ID — we hit exactly that bug the first time around).
while IFS=$'\t' read -r -u 3 ACT_ID rest; do
  IFS=$'\t' read -r -a KEYS <<<"$rest"
  echo "▶ Act $ACT_ID — ${#KEYS[@]} shots"

  # Build a concat list, skipping missing shots gracefully.
  LIST="$OUT_DIR/_work/act-${ACT_ID}.txt"
  : > "$LIST"
  for k in "${KEYS[@]}"; do
    src="$SHOTS_DIR/${k}.webm"
    if [[ ! -f "$src" ]]; then
      echo "  ⚠ missing shot: $k (skipping)" >&2
      continue
    fi
    abs=$(cd "$(dirname "$src")" && pwd)/$(basename "$src")
    echo "file '$abs'" >> "$LIST"
  done

  if [[ ! -s "$LIST" ]]; then
    echo "  ✗ act $ACT_ID has no recorded shots — cannot compose" >&2
    continue
  fi

  # Concat the shots into a single silent 1080p MP4 segment.
  VIDEO_SEG="$OUT_DIR/_work/act-${ACT_ID}-video.mp4"
  ffmpeg -nostdin -y -loglevel error -f concat -safe 0 -i "$LIST" \
    -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30" \
    -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -an "$VIDEO_SEG"

  # Get audio + video durations.
  AUDIO="$VO_DIR/act-${ACT_ID}.wav"
  if [[ ! -f "$AUDIO" ]]; then
    echo "  ✗ missing audio: $AUDIO" >&2
    continue
  fi
  AUD_DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$AUDIO")
  VID_DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$VIDEO_SEG")

  # Pad video with clone-frame to the audio duration. The tpad expression
  # must be in the -filter_complex form so we can pin the OUTPUT duration
  # via -t (otherwise -shortest wins against tpad's clone padding when the
  # input video is shorter than the audio).
  ACT_OUT="$OUT_DIR/act-${ACT_ID}.mp4"
  ffmpeg -nostdin -y -loglevel error -i "$VIDEO_SEG" -i "$AUDIO" \
    -filter_complex "[0:v]tpad=stop_mode=clone:stop_duration=${AUD_DUR},setpts=PTS-STARTPTS[v]" \
    -map "[v]" -map 1:a:0 \
    -t "$AUD_DUR" \
    -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p \
    -c:a aac -b:a 192k -ar 48000 -ac 2 \
    "$ACT_OUT"

  OUT_DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$ACT_OUT")
  printf "  · %s (%.1fs audio, %.1fs video, %.1fs out)\n" \
    "$ACT_OUT" "$AUD_DUR" "$VID_DUR" "$OUT_DUR"

done 3< "$OUT_DIR/_work/act-shots.tsv"

# Master concat.
MASTER_LIST="$OUT_DIR/_work/master.txt"
: > "$MASTER_LIST"
for ACT_ID in 1 2 3 4 5 6; do
  f="$OUT_DIR/act-${ACT_ID}.mp4"
  if [[ -f "$f" ]]; then
    abs=$(cd "$(dirname "$f")" && pwd)/$(basename "$f")
    echo "file '$abs'" >> "$MASTER_LIST"
  fi
done

MASTER="$OUT_DIR/cec-product-film-15min.mp4"
ffmpeg -nostdin -y -loglevel error -f concat -safe 0 -i "$MASTER_LIST" \
  -c copy "$MASTER"

MASTER_DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$MASTER")
printf "\n▶ Master: %s (%.1fs, %.1f min)\n" "$MASTER" "$MASTER_DUR" "$(echo "$MASTER_DUR / 60" | bc -l)"
