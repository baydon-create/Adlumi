#!/usr/bin/env python3
"""Generates the voiceover clips (vo/<id>.wav) with Piper, a free local text-to-speech engine.

Setup (one time):
  curl -L https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz | tar xz
  mkdir -p voices && curl -L https://github.com/rhasspy/piper/releases/download/v0.0.2/voice-en-us-ryan-high.tar.gz | tar xz -C voices
Then: PIPER=./piper/piper VOICE=voices/en-us-ryan-high.onnx python3 scripts/promo-video/make-voice.py
and re-render with: node scripts/promo-video/director.mjs
"""
import json, os, subprocess, pathlib

HERE = pathlib.Path(__file__).parent
PIPER = os.environ.get('PIPER', './piper/piper')
VOICE = os.environ['VOICE']
# Spoken wording where the on-screen caption would be mispronounced.
SAY = {
    '07-estimates': 'Open any ad to see estimated spend, C P M, cost per purchase and return on ad spend, '
                    'shown as honest ranges with a confidence level.',
}
for line in json.loads((HERE / 'vo' / 'lines.json').read_text()):
    out = HERE / 'vo' / f"{line['id']}.wav"
    text = SAY.get(line['id'], line['text'])
    subprocess.run([PIPER, '--model', VOICE, '--length_scale', '0.95', '--sentence_silence', '0.25', '--output_file', str(out)],
                   input=text.encode(), check=True, capture_output=True)
    print('wrote', out.name)
