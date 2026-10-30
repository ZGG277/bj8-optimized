"""Local experimental remix: quieter high bird calls, water, original airy music.

No provider, download, external music, or runtime synthesis. Original recordings
stay untouched. Reproduce with --recordings pointing at the existing local WAVs.
"""
from pathlib import Path
import argparse, base64, hashlib, json, subprocess
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfiltfilt, resample_poly

parser = argparse.ArgumentParser()
parser.add_argument('--recordings', type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
out = root / 'artifacts' / 'audio-cards-r2' / 'fairy-audio'
out.mkdir(parents=True, exist_ok=True)
rate, seconds = 24000, 32
frames = rate * seconds
inputs = {}

def load(name, band):
    path = args.recordings / f'{name}-excerpt.wav'
    inputs[name] = {'fileName': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
    sr, pcm = wavfile.read(path)
    x = pcm.astype(np.float64) / np.iinfo(pcm.dtype).max
    if x.ndim == 2:
        x = x.mean(axis=1)
    x = resample_poly(x, rate, sr)[:frames]
    assert len(x) == frames
    return sosfiltfilt(butter(4, band, btype='bandpass', fs=rate, output='sos'), x)

def at_rms(x, level):
    rms = np.sqrt(np.mean(x*x))
    assert rms > 1e-8
    return x * level / rms

# Keep the genuine upper bird chirps; remove most low honking/croaking energy.
# This is spectral suppression, not a claim of identifying individual species.
birds = at_rms(load('birds', [2400, 6200]), .026)
birds = .075 * np.tanh(birds / .075)
water = at_rms(load('river', [160, 6500]), .09)

t = np.arange(frames) / rate
music = np.zeros(frames)
chords = [([146.8324, 220, 329.6276], 0), ([195.9977, 293.6648, 440], 7),
          ([123.4708, 184.9972, 293.6648], 15), ([146.8324, 220, 329.6276], 23)]
for notes, start in chords:
    age = t - start
    duration = min(12, seconds - start)
    envelope = np.where((age >= 0) & (age < duration),
                        np.sin(np.pi * np.clip(age / duration, 0, 1)) ** 2, 0)
    for i, hz in enumerate(notes):
        phase = 2*np.pi*hz*age + .16*np.sin(2*np.pi*.11*age + i)
        music += envelope * (np.sin(phase) + .09*np.sin(2*phase)) / (3+i)
# A sparse, soft pentatonic phrase makes the music recognizable above water.
for start,hz in [(2,587.3295),(5,659.2551),(9,880),(12,739.9888),
                 (16,659.2551),(19,587.3295),(23,440),(26,587.3295)]:
    age=t-start
    duration=3.4
    env=np.where((age>=0)&(age<duration),np.sin(np.pi*np.clip(age/duration,0,1))**1.5,0)
    phase=2*np.pi*hz*age+.035*np.sin(2*np.pi*4.8*age)
    music+=.28*env*(np.sin(phase)+.06*np.sin(2*phase))
music=at_rms(music,.065)
mix = water + birds + music
# Cyclic crossfade: last sample joins x[1.5s], which is also the first sample.
seam = int(1.5 * rate)
cross = np.linspace(0, 1, seam, endpoint=False)
loop = mix[seam:].copy()
loop[-seam:] = mix[-seam:] * (1-cross) + mix[:seam] * cross
assert np.isfinite(loop).all() and np.max(np.abs(loop)) < 1
wavfile.write(out/'mix.wav', rate, (loop * 32767).astype(np.int16))
wavfile.write(out/'music-only.wav', rate, (music * 32767).astype(np.int16))
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(out/'mix.wav'),
                '-af', 'loudnorm=I=-23:TP=-3:LRA=7', '-ar', str(rate), '-ac', '1',
                '-c:a', 'libmp3lame', '-b:a', '40k', str(out/'fairy-birds-water-music.mp3')], check=True)
data = (out/'fairy-birds-water-music.mp3').read_bytes()
asset = root/'src/assets/ambience/park-birds-stream.json'
asset.write_text(json.dumps({'mime': 'audio/mpeg', 'base64': base64.b64encode(data).decode()}, separators=(',', ':'))+'\n')
provenance_path = root/'src/assets/ambience/provenance.json'
provenance = json.loads(provenance_path.read_text())
provenance.update({
    'title': 'Fairyland local experiment — bird chirps, river and airy music',
    'license': 'CC0-1.0 (field recordings only)',
    'processing': 'Existing 32s excerpts only; bird band 2400–6200Hz at .026 RMS with .075 soft peak limit; river 160–6500Hz at .09 RMS; original synthesized open-fifth pads and eight softly shaped pentatonic flute-like notes at .065 RMS; 1.5s cyclic crossfade; -23LUFS/-3dBTP target; 24kHz mono40kbps MP3',
    'music': {'origin': 'Deterministic original synthesis; no external music sampled',
              'script': 'scripts/render-fairy-ambience.py', 'distribution': 'Original procedural composition bundled by the author for this game'},
    'inputExcerpts': inputs,
    'outputBytes': len(data), 'outputSha256': hashlib.sha256(data).hexdigest(),
    'durationSeconds': len(loop)/rate,
    'reviewLimit': 'Suppression of low intrusive calls; species and final listening quality require human review',
})
provenance_path.write_text(json.dumps(provenance, ensure_ascii=False, indent=2)+'\n')
stats = {'outputBytes': len(data), 'outputSha256': provenance['outputSha256'],
         'durationSeconds': len(loop)/rate, 'rawPeak': float(np.max(np.abs(loop))),
         'loopSeamDelta': float(abs(loop[-1]-loop[0])),
         'componentRms': {name: float(np.sqrt(np.mean(x*x))) for name, x in [('water',water),('birds',birds),('music',music)]}}
(out/'stats.json').write_text(json.dumps(stats, indent=2)+'\n')
print(json.dumps(stats, indent=2))
