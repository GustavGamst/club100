import numpy as np


def compute_energy_score(wav_path, start_time=0, duration=60):
    import librosa

    y, sr = librosa.load(wav_path, offset=float(start_time), duration=duration, sr=22050, mono=True)
    if len(y) == 0:
        return 3.0

    # RMS loudness
    rms = float(np.mean(librosa.feature.rms(y=y)))
    rms_score = float(np.clip(rms / 0.08, 0, 1))

    # Tempo — hint at 120 BPM to avoid locking onto slow subdivisions,
    # then double if the result looks like half-time (common with DnB / fast genres).
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr, start_bpm=120)
    tempo = float(np.atleast_1d(tempo)[0])
    if tempo < 100:
        tempo = min(tempo * 2, 210)
    tempo_score = float(np.clip((tempo - 70) / 110, 0, 1))  # 70 BPM → 0, 180 BPM → 1

    # Onset strength (spectral flux) — captures rhythmic density / drum busyness
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    flux_score = float(np.clip(np.mean(onset_env) / 6.0, 0, 1))

    # Spectral centroid — brightness (hi-hats, cymbals push this up)
    centroid = float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr)))
    centroid_score = float(np.clip((centroid - 800) / 3200, 0, 1))

    raw = 0.35 * tempo_score + 0.25 * rms_score + 0.25 * flux_score + 0.15 * centroid_score
    return round(1.0 + raw * 4.0, 2)
