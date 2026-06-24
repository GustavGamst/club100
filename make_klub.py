import os
import shutil
import subprocess
import pandas as pd
import time
import argparse
from pathlib import Path
#from ffmpeg import FFmpeg, Progress

# Options to set
ydl_opts = {
    'quiet': True,  # Suppress download messages
    'skip_download': True,  # Do not download the video, just get the info
    'cookiefile': 'love_2025/www.youtube.com_cookies.txt',  # Path to your cookies.txt
}

def check_progress(path, check_desc):
    r = True
    if os.path.exists(path):
        inp = input(f"A {check_desc} already exists at {path} do you want to overwrite? [y/n] \n")
        if inp.lower() == "n":
            r = False
        elif inp.lower() != "y":
            print("Please chose either y or n")
            check_progress(path, check_desc)
    else:
        Path(path).mkdir(parents=True)
    return r


def make_club(club_folder, club_file, n_songs = 100, output_name = "klub", shoutout_type = "none", song_vol = -14, so_vol = -14, 
                fade = 3, song_length = 60, file_format = "mp3", files_to_keep = None):
    """
    Makes a club 100
    -------------------------------------------------------------
    club_folder = the folder in which the club xlsx is placed \n
    club_file = either an xlsx file with the "Sange" and "Shoutout" sheets or csv with the songs. Can also pass a list of csv's, where the first element is the name of the csv for the songs and the second is csv with shoutouts \n
    n_songs = the length of the club 100 \n
    shoutout_type = a string defining the type of shoutout, choices are "none", "link" and "own" \n
    song_vol = the song volume in LUFS (-70 to -5) \n
    so_vol = the shoutout volume in LUFS (-70 to -5) \n
    fade = the number of seconds to fade each song \n
    song_length = length of each song, kan be set to "varying" if song_csv contains the column "sluttidspunkt (i sek)" \n
    file_format = the file format of the output file \n
    files_to_keep = the folders to keep as a list of strings. Options are "song_folder", "prep_song_folder", "shoutout_folder", "prep_shoutout_folder", "song_csv", "shoutout_csv", "all", None
    """
    # initialisation
    t0 = time.time()
    print("Beginning to make the Club 100...")
    song_csv = club_folder+"/Songs.csv"
    shoutout_csv = club_folder+"/Shoutouts.csv"
    song_folder = club_folder+"/songs"
    shoutout_folder = club_folder + "/shoutouts"
    prep_song_folder = club_folder + "/prepared_songs"
    prep_shoutout_folder = club_folder + "/prepared_shoutouts"




    if files_to_keep is None:
        files_to_keep = []

    diff_song_length = True if song_length == "varying" else False

    
    # Assertions - make sure everything is good to go
    if (shoutout_type == "own") & (not os.path.exists(shoutout_folder)):
        raise AssertionError(f"To use own shoutouts, please place them in a folder called 'shoutouts' in your wanted club folder: {club_folder}")
    # if not all(elem in folder_names for elem in files_to_keep):
    #     raise AssertionError("Please make sure you specified the file/folder to keep correctly")
    if not os.path.exists(club_folder+"/"+club_file):
        raise AssertionError(f"Something is wrong with the club folder/file as {club_folder}/{club_file}")
        
    # Check whether some process has already been done to speed up
    dl_songs = check_progress(song_folder, "song folder")
    dl_so = False if shoutout_type in ["own", "none"] else check_progress(shoutout_folder, "shoutout folder")
    prep_songs = check_progress(prep_song_folder, "prepared_songs folder")
    prep_so = check_progress(prep_shoutout_folder, "prepared_shoutouts folder")
    ##imports
    from Functions.combine import combine
    print("Checking that everything is in order...")
    if dl_songs or dl_so:
        from Functions.dl import download_all
        from Functions.dl_new import download_all_songs
    if dl_songs:
        from Functions.prepare_csv import create_song_csv, mix_song_pos
    if dl_so:
        from Functions.prepare_csv import create_shoutout_csv
    if prep_songs:
        from Functions.prepare_track import prepare_all_tracks
    if prep_so:
        from Functions.prepare_shoutout import prepare_all_shoutouts
        from Functions.prepare_csv import get_trim_vals
    
    # prepare csv's and download
    if dl_songs:
        filename, file_extension = os.path.splitext(club_file)
        if type(club_file) == list:
            create_song_csv(file_name = club_folder+"/"+club_file[0], csv_name= song_csv, n_songs = n_songs, diff_song_length = diff_song_length)
            #mix_song_pos(song_csv = song_csv, diff_song_length = diff_song_length)
            if (len(club_file) == 2) & (dl_so):
                create_shoutout_csv(file_name=club_folder+"/"+club_file[1], csv_name= shoutout_csv, n_shoutouts = n_songs)
                from Functions.prepare_csv import arrange_shoutout_csv
                arrange_shoutout_csv(song_csv=song_csv, shoutout_csv=shoutout_csv, diff_song_length=diff_song_length)
                download_all(dl_path = shoutout_folder, csv_name=shoutout_csv)
        else:
            create_song_csv(file_name = club_folder+"/"+club_file, csv_name = song_csv, n_songs=n_songs, diff_song_length = diff_song_length)

        ## Download songs
        #mix_song_pos(song_csv = song_csv, diff_song_length = diff_song_length)
        #download_all(dl_path=song_folder, csv_name=song_csv)
        download_all_songs(csv_name = club_folder+"/"+club_file, output_format = "wav", output_folder = song_folder)

        # check if the songs are downloaded correctly
        # if len([name for name in os.listdir(song_folder) if os.path.isfile(name)]) != 100:
        #     print("some songs were not downloaded correctly, trying to download again")
        #     missing = True
        # times = 0
        # while missing:
        #     #wait 5 seconds
        #     print("waiting 5 seconds to try again")
        #     time.sleep(5)
        #     #find songs that were not downloaded, all files are named 1.wav, 2.wav etc.
        #     downloaded_songs = [int(os.path.splitext(f)[0].split('.')[0]) for f in os.listdir(song_folder) if os.path.isfile(os.path.join(song_folder, f))]
        #     missing_songs = [i for i in range(1, n_songs+1) if i not in downloaded_songs]
        #     #download the missing songs
        #     download_all(dl_path=song_folder, csv_name=song_csv, subset=missing_songs)
        #     #check if all songs are downloaded
        #     times += 1
        #     if len([name for name in os.listdir(song_folder) if os.path.isfile(name)]) == 100:
        #         missing = False
        #     elif times == 10:
        #         raise AssertionError("Some songs were not downloaded correctly, please try again")
        #     else:
        #         print("some songs were not downloaded correctly, trying to download again")

            
    if (shoutout_type == "link") & (type(club_file) != list) & dl_so:
        create_shoutout_csv(club_folder+"/"+club_file, n_shoutouts=n_songs, shoutout_sheet="Shoutouts", csv_name = shoutout_csv)
        from Functions.prepare_csv import arrange_shoutout_csv
        arrange_shoutout_csv(song_csv=song_csv, shoutout_csv=shoutout_csv, diff_song_length=diff_song_length)
        download_all(dl_path = shoutout_folder, csv_name=shoutout_csv)

    # prepare tracks
    if prep_songs:
        if diff_song_length:
            song_length = get_trim_vals(song_csv)
        prepare_all_tracks(songs_csv=song_csv, input = song_folder, output = prep_song_folder, t = song_vol, f = fade, length = song_length)

    # prepare shoutouts
    files_to_keep = []
    with_shoutouts = True if (shoutout_type == "link" or shoutout_type == "own") else False
    if prep_so:
        if shoutout_type == "own":
            files_to_keep.append(shoutout_folder)
        
        if with_shoutouts:
            trim_vals = get_trim_vals(csv=shoutout_csv) if shoutout_type == "link" else None
            prepare_all_shoutouts(songs_csv=song_csv, input = shoutout_folder, output = prep_shoutout_folder, t = so_vol, trim_vals = trim_vals)


    # combine the tracks and shoutouts
    combine(songs_csv= song_csv, prep_shoutout_path = prep_shoutout_folder, prep_tracks_path = prep_song_folder, output_name = club_folder+"/"+output_name, file_format = file_format, with_shoutouts = with_shoutouts)

    # Remove unwanted folders
    if (files_to_keep != "all") & (files_to_keep != ["all"]):
        folder_names = ["song_folder", "prep_song_folder", "shoutout_folder", "prep_shoutout_folder", "song_csv", "shoutout_csv"]
        folder_paths = [song_folder, prep_song_folder, shoutout_folder, prep_shoutout_folder, song_csv, shoutout_csv]
        file_dict = dict(zip(folder_names, folder_paths))
        for f in files_to_keep:
            del file_dict[f]

        for fpath in file_dict.values():
            if os.path.isfile(fpath):
                os.remove(fpath)
            if os.path.isdir(fpath):
                shutil.rmtree(fpath)
    
    print(f"Club was made in {int(time.time()-t0)} seconds")
    print(f"Your club is ready and placed at {club_folder}/{output_name}.{file_format}, enjoy!")

    
def make_club_from_app(song_list, shoutout_list, build_dir="output",
                       output_name="klub100", file_format="mp3",
                       song_vol=-14, so_vol=-14, fade=3, song_length=60,
                       intro_shoutout=None, log=print):
    """
    Build a Klub 100 directly from the app's in-memory state.

    song_list     – ordered list of song dicts: {track_id, start_time, title, url}
    shoutout_list – ordered list of shoutout dicts: {filename, label}
                    shoutout i plays *after* song i (before song i+1)
    log           – callable that receives progress strings
    Returns path to the finished output file.
    """
    import csv as csv_mod
    import shutil
    from Functions.dl_new import download_song
    from Functions.prepare_track import prepare_all_tracks
    from Functions.prepare_shoutout import prepare_all_shoutouts
    from Functions.combine import combine

    os.makedirs(build_dir, exist_ok=True)

    song_in_dir   = os.path.join(build_dir, "songs")
    song_prep_dir = os.path.join(build_dir, "prepared_songs")
    shout_in_dir  = os.path.join(build_dir, "shoutouts_input")
    shout_prep_dir = os.path.join(build_dir, "prepared_shoutouts")
    songs_csv_path = os.path.join(build_dir, "songs.csv")

    for d in [song_in_dir, song_prep_dir]:
        os.makedirs(d, exist_ok=True)

    with_shoutouts = bool(shoutout_list)
    if with_shoutouts:
        os.makedirs(shout_in_dir, exist_ok=True)
        os.makedirs(shout_prep_dir, exist_ok=True)

    # ── Download any missing tracks ──────────────────────────────────────────
    log(f"Checking {len(song_list)} tracks…")
    for song in song_list:
        wav = os.path.join("tracks", f"{song['track_id']}.wav")
        if not os.path.exists(wav):
            log(f"  Downloading: {song['title']}")
            try:
                download_song(song["track_id"], song["url"], "tracks")
            except Exception as e:
                log(f"  WARNING: Could not download {song['title']}: {e}")

    # ── Symlink songs to numbered files ──────────────────────────────────────
    log("Linking song files…")
    csv_rows = []
    for i, song in enumerate(song_list, 1):
        src = os.path.abspath(os.path.join("tracks", f"{song['track_id']}.wav"))
        dst = os.path.join(song_in_dir, f"{i}.wav")
        if os.path.islink(dst) or os.path.exists(dst):
            os.remove(dst)
        if os.path.exists(src):
            os.symlink(src, dst)
        else:
            log(f"  WARNING: Track missing for #{i} {song['title']}, will be skipped")
        csv_rows.append([song["url"], song["title"], int(song.get("start_time") or 0)])

    with open(songs_csv_path, "w", newline="") as f:
        csv_mod.writer(f).writerows(csv_rows)

    # ── Symlink shoutouts to numbered files ──────────────────────────────────
    if with_shoutouts:
        log(f"Linking {len(shoutout_list)} shoutout files…")
        for i, shout in enumerate(shoutout_list, 1):
            src = os.path.abspath(os.path.join("shoutouts", shout["filename"]))
            dst = os.path.join(shout_in_dir, f"{i}.wav")
            if os.path.islink(dst) or os.path.exists(dst):
                os.remove(dst)
            if os.path.exists(src):
                os.symlink(src, dst)
            else:
                log(f"  WARNING: Shoutout missing: {shout['filename']}")

    # ── Prepare tracks ───────────────────────────────────────────────────────
    log(f"Preparing tracks (normalize to {song_vol} LUFS, {song_length}s, {fade}s fade)…")
    prepare_all_tracks(
        songs_csv=songs_csv_path,
        input=song_in_dir,
        output=song_prep_dir,
        t=song_vol,
        f=fade,
        length=song_length,
    )
    log("Tracks ready.")

    # ── Prepare shoutouts ────────────────────────────────────────────────────
    if with_shoutouts:
        log(f"Preparing shoutouts (normalize to {so_vol} LUFS)…")
        try:
            prepare_all_shoutouts(
                songs_csv=songs_csv_path,
                input=shout_in_dir,
                output=shout_prep_dir,
                t=so_vol,
            )
            log("Shoutouts ready.")
        except Exception as e:
            log(f"WARNING: Shoutout prep failed ({e}), continuing without shoutouts.")
            with_shoutouts = False

    # ── Combine ──────────────────────────────────────────────────────────────
    log("Combining into final mix…")
    output_base = os.path.join(build_dir, output_name)
    combine(
        songs_csv=songs_csv_path,
        prep_shoutout_path=shout_prep_dir,
        prep_tracks_path=song_prep_dir,
        output_name=output_base,
        file_format=file_format,
        with_shoutouts=with_shoutouts,
        shoutout_after=True,   # shoutout plays after its matching track
    )

    final = f"{output_base}.{file_format}"

    if intro_shoutout:
        intro_src = os.path.join("shoutouts", intro_shoutout["filename"])
        if os.path.exists(intro_src):
            log("Prepending intro shoutout…")
            intro_prep = os.path.join(build_dir, "_intro_prep.wav")
            subprocess.run([
                "ffmpeg", "-y", "-i", intro_src,
                "-af", f"loudnorm=I={so_vol}:TP=-1.5:LRA=11",
                intro_prep,
            ], capture_output=True)
            if os.path.exists(intro_prep):
                tmp = final + ".intro_tmp." + file_format
                r = subprocess.run([
                    "ffmpeg", "-y",
                    "-i", intro_prep, "-i", final,
                    "-filter_complex", "[0:0][1:0]concat=n=2:v=0:a=1[out]",
                    "-map", "[out]", tmp,
                ], capture_output=True)
                if r.returncode == 0 and os.path.exists(tmp):
                    os.replace(tmp, final)
                os.remove(intro_prep)

    log(f"Done! → {final}")
    return final


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='A simple script to make a club')
    parser.add_argument('-c', '--club_folder', default='Examples/Bums100', help='directory of the club folder')
    parser.add_argument('-d', '--club_file', default='Nums100.xlsx', help='Name of the club file')
    parser.add_argument('-o', '--output_name', default="Love100", help='the name of the output file')
    parser.add_argument('-f', '--file_format', default="mp3", help='the file format of the output file')
    parser.add_argument('-s', '--shoutout_type', default="none", help='the type of shoutout to use')

    args = parser.parse_args()
    
    make_club(club_folder = args.club_folder, club_file = args.club_file, n_songs = 100, 
              shoutout_type=args.shoutout_type, output_name = args.output_name, file_format = args.file_format, 
              files_to_keep="all", so_vol=-10, song_length=60, song_vol=-10)



    # make_club(club_folder, club, n_songs = n, output_name = "test_KID2", shoutout_type = "link")
    # combine(songs_csv= club_folder+"Songs.csv", prep_shoutout_path = None, prep_tracks_path = None, output_name = "test_KID2", fileformat = "mp3", with_shoutouts = True)