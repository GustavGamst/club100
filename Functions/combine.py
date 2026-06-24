#!/usr/bin/env python3
import csv
import subprocess
import os


# parser = argparse.ArgumentParser()
# parser.add_argument('-shoutouts', type=str, default=os.path.join(os.path.curdir, 'prepared_shoutouts'),
#                     help='Input shoutouts folder')
# parser.add_argument('-tracks', type=str, default=os.path.join(os.path.curdir, 'prepared_tracks'),
#                     help='Input tracks folder')
# parser.add_argument('-output', type=str, default=os.path.join(os.path.curdir, 'klub.mp3'),
#                     help='Output file')

# args = parser.parse_args()

# if not os.path.exists(args.shoutouts) or not os.path.exists(args.tracks):
#     exit(1)

def combine(songs_csv = "klub.csv", prep_shoutout_path = "prepared_shoutouts", prep_tracks_path = "prepared_tracks",
            output_name = "klub", file_format = "mp3", with_shoutouts = True, shoutout_after = False):
    """
    Combines songs and shoutouts.
    shoutout_after=False (default): [shout_i, track_i, ...] — shoutout announces the track
    shoutout_after=True:            [track_i, shout_i, ...] — shoutout plays after the track
    Missing shoutout files are silently skipped.
    """
    print("Putting the elements together...")

    output = output_name + "." + file_format
    inputs = []
    count = 0

    with open(songs_csv, 'rt') as csvfile:
        rows = list(csv.reader(csvfile, delimiter=',', quotechar='"'))

    for i in range(1, len(rows) + 1):
        track_file = os.path.join(prep_tracks_path, str(i) + '.wav')
        shout_file = os.path.join(prep_shoutout_path, str(i) + '.wav') if with_shoutouts else None

        if shoutout_after:
            if os.path.exists(track_file):
                inputs += ['-i', track_file]; count += 1
            if shout_file and os.path.exists(shout_file):
                inputs += ['-i', shout_file]; count += 1
        else:
            if shout_file and os.path.exists(shout_file):
                inputs += ['-i', shout_file]; count += 1
            if os.path.exists(track_file):
                inputs += ['-i', track_file]; count += 1

    if count == 0:
        raise RuntimeError("No audio files found to combine.")

    filter_ = ''.join(f'[{a}:0]' for a in range(count)) + f'concat=n={count}:v=0:a=1[out]'

    process = subprocess.Popen(
        ['ffmpeg', '-y', *inputs, '-filter_complex', filter_, '-map', '[out]', output],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    _, stderr = process.communicate()
    if process.returncode != 0:
        raise RuntimeError(f"ffmpeg combine failed:\n{stderr.decode()}")
