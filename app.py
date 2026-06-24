from flask import Flask, render_template, request, jsonify, send_file, Response
import os, json, re, subprocess, datetime, threading, queue, uuid
import yt_dlp
from Functions.dl_new import download_song

app = Flask(__name__)


def get_track_id(url):
    if url.startswith("local:"):
        return url[6:]
    if "soundcloud" in url:
        return url.rstrip("/").split("/")[-1].split("?")[0]
    if "v=" in url:
        return url.split("v=")[-1].split("&")[0]
    return url.rstrip("/").split("/")[-1].split("?")[0]


def _sanitize_id(name):
    base = re.sub(r'[^a-z0-9_\-]', '_', name.lower()).strip('_')
    return base[:40] or uuid.uuid4().hex[:8]


def load_all_songs():
    songs = {}
    if not os.path.exists("song_info"):
        return songs
    for filename in sorted(os.listdir("song_info")):
        if not filename.endswith(".json"):
            continue
        try:
            with open(f"song_info/{filename}") as f:
                song = json.load(f)
            if "track_id" not in song:
                # Derive from filename (info_<id>.json) or URL
                if filename.startswith("info_"):
                    song["track_id"] = filename[5:-5]
                else:
                    song["track_id"] = get_track_id(song["url"])
            songs[song["url"]] = song
        except Exception:
            pass
    return songs


def load_state():
    if os.path.exists("state.json"):
        with open("state.json") as f:
            state = json.load(f)
        # back-compat: add shoutout keys if missing
        state.setdefault("shoutout_list", [])
        state.setdefault("shoutout_bench", [])
        return state
    return {"list": [], "bench": [], "shoutout_list": [], "shoutout_bench": []}


def save_state(state):
    with open("state.json", "w") as f:
        json.dump(state, f, indent=2)


def load_shoutout_meta():
    if os.path.exists("shoutout_meta.json"):
        with open("shoutout_meta.json") as f:
            return json.load(f)
    return []


def save_shoutout_meta(meta):
    with open("shoutout_meta.json", "w") as f:
        json.dump(meta, f, indent=2)


def sync_shoutout_meta():
    meta = load_shoutout_meta()
    if os.path.exists("shoutouts"):
        existing = set(
            f for f in os.listdir("shoutouts")
            if f.endswith((".wav", ".webm", ".ogg", ".mp4"))
        )
    else:
        existing = set()
    meta_files = {s["filename"] for s in meta}
    for f in existing - meta_files:
        meta.append({"filename": f, "label": f.rsplit(".", 1)[0]})
    meta = [s for s in meta if s["filename"] in existing]
    save_shoutout_meta(meta)
    return meta


@app.route("/")
def index():
    songs = load_all_songs()
    state = load_state()

    list_songs = [songs[url] for url in state["list"] if url in songs]
    bench_songs = [songs[url] for url in state["bench"] if url in songs]

    known_songs = set(state["list"] + state["bench"])
    for url, song in songs.items():
        if url not in known_songs:
            bench_songs.append(song)

    meta = sync_shoutout_meta()
    meta_map = {s["filename"]: s for s in meta}

    sh_list = [meta_map[f] for f in state["shoutout_list"] if f in meta_map]
    sh_bench = [meta_map[f] for f in state["shoutout_bench"] if f in meta_map]

    known_sh = set(state["shoutout_list"] + state["shoutout_bench"])
    for s in meta:
        if s["filename"] not in known_sh:
            sh_bench.append(s)

    return render_template("index.html",
        list_songs=list_songs,
        bench_songs=bench_songs,
        shoutout_list=sh_list,
        shoutout_bench=sh_bench,
    )


@app.post("/save")
def save():
    data = request.json or {}
    save_state({
        "list":          data.get("list", []),
        "bench":         data.get("bench", []),
        "shoutout_list": data.get("shoutout_list", []),
        "shoutout_bench": data.get("shoutout_bench", []),
    })

    start_times = data.get("start_times", {})
    for url, st in start_times.items():
        tid = get_track_id(url)
        path = f"song_info/info_{tid}.json"
        if os.path.exists(path):
            with open(path) as f:
                song = json.load(f)
            new_start = float(st)
            if song.get("start_time", 0) != new_start:
                song.pop("energy", None)
            song["start_time"] = new_start
            with open(path, "w") as f:
                json.dump(song, f)

    return jsonify({"status": "ok"})


def _soundcloud_metadata(url, tid):
    import urllib.request
    try:
        oembed_url = f"https://soundcloud.com/oembed?url={urllib.request.quote(url, safe='')}&format=json"
        with urllib.request.urlopen(oembed_url, timeout=10) as r:
            data = json.load(r)
        return {
            "title": data.get("title", url),
            "thumbnail": data.get("thumbnail_url", ""),
            "url": url,
            "start_time": 0,
            "track_id": tid,
        }
    except Exception:
        return None


@app.post("/delete_song")
def delete_song():
    url = (request.json or {}).get("url", "")
    if not url:
        return jsonify({"status": "error"}), 400

    state = load_state()
    state["list"]  = [u for u in state["list"]  if u != url]
    state["bench"] = [u for u in state["bench"] if u != url]
    save_state(state)

    tid = get_track_id(url)
    for path in [f"song_info/info_{tid}.json", f"tracks/{tid}.wav"]:
        if os.path.exists(path):
            os.remove(path)

    return jsonify({"status": "ok"})


@app.post("/new_song")
def new_song():
    url = (request.json or {}).get("url", "").strip()
    if not url:
        return jsonify({"status": "error", "message": "No URL provided"}), 400

    tid = get_track_id(url)
    path = f"song_info/info_{tid}.json"

    if not os.path.exists(path):
        if "soundcloud" in url:
            song = _soundcloud_metadata(url, tid)
            if song is None:
                return jsonify({"status": "error", "message": "Could not fetch SoundCloud track info"}), 400
        else:
            opts = {"quiet": True, "skip_download": True}
            try:
                with yt_dlp.YoutubeDL(opts) as ydl:
                    info = ydl.extract_info(url, download=False)
            except Exception as exc:
                msg = str(exc).split("\n")[0]
                return jsonify({"status": "error", "message": msg}), 400
            song = {
                "title": info.get("title", url),
                "thumbnail": info.get("thumbnail", ""),
                "url": url,
                "start_time": 0,
                "track_id": tid,
            }
        os.makedirs("song_info", exist_ok=True)
        with open(path, "w") as f:
            json.dump(song, f)
    else:
        with open(path) as f:
            song = json.load(f)
        if "track_id" not in song:
            song["track_id"] = tid

    state = load_state()
    if url not in state["list"] and url not in state["bench"]:
        state["bench"].append(url)
        save_state(state)

    return jsonify({"status": "ok", "song": song})


@app.get("/audio")
def audio():
    url = request.args.get("link", "")
    tid = get_track_id(url)
    os.makedirs("tracks", exist_ok=True)
    path = os.path.join("tracks", f"{tid}.wav")
    if not os.path.exists(path):
        try:
            download_song(tid, url, "tracks")
        except Exception as exc:
            msg = str(exc).split("\n")[0]
            return jsonify({"error": msg}), 502
    if not os.path.exists(path):
        return jsonify({"error": "Download produced no file"}), 502
    return send_file(path, mimetype="audio/wav")


@app.get("/shoutout_audio")
def shoutout_audio():
    filename = os.path.basename(request.args.get("filename", ""))
    path = os.path.join("shoutouts", filename)
    if not os.path.exists(path):
        return "Not found", 404
    return send_file(path)


@app.post("/save_shoutout")
def save_shoutout_route():
    filename = os.path.basename(request.args.get("filename", ""))
    if not filename:
        ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"shoutout_{ts}.webm"
    os.makedirs("shoutouts", exist_ok=True)
    raw_path = os.path.join("shoutouts", filename)
    with open(raw_path, "wb") as f:
        f.write(request.data)

    # Convert to WAV via ffmpeg
    wav_filename = filename.rsplit(".", 1)[0] + ".wav"
    wav_path = os.path.join("shoutouts", wav_filename)
    result = subprocess.run(
        ["ffmpeg", "-y", "-i", raw_path, wav_path],
        capture_output=True,
    )
    if result.returncode == 0 and os.path.exists(wav_path):
        os.remove(raw_path)
        final_filename = wav_filename
    else:
        final_filename = filename

    label = final_filename.rsplit(".", 1)[0]
    meta = load_shoutout_meta()
    meta.append({"filename": final_filename, "label": label})
    save_shoutout_meta(meta)

    state = load_state()
    if final_filename not in state["shoutout_list"] and final_filename not in state["shoutout_bench"]:
        state["shoutout_bench"].append(final_filename)
        save_state(state)

    return jsonify({"status": "ok", "filename": final_filename, "label": label})


@app.post("/rename_shoutout")
def rename_shoutout():
    data = request.json or {}
    meta = load_shoutout_meta()
    for s in meta:
        if s["filename"] == data.get("filename"):
            s["label"] = data.get("label", s["label"])
    save_shoutout_meta(meta)
    return jsonify({"status": "ok"})


@app.post("/trim_shoutout")
def trim_shoutout():
    data = request.json or {}
    filename = os.path.basename(data.get("filename", ""))
    try:
        start = float(data.get("start", 0))
        end   = float(data.get("end",   0))
    except (TypeError, ValueError):
        return jsonify({"status": "error", "message": "Invalid times"}), 400

    if not filename or end <= start:
        return jsonify({"status": "error", "message": "Invalid parameters"}), 400

    path = os.path.join("shoutouts", filename)
    if not os.path.exists(path):
        return jsonify({"status": "error", "message": "File not found"}), 404

    tmp_path = path + ".trimtmp.wav"
    result = subprocess.run(
        ["ffmpeg", "-y", "-i", path, "-ss", str(start), "-to", str(end), tmp_path],
        capture_output=True,
    )
    if result.returncode == 0 and os.path.exists(tmp_path):
        os.replace(tmp_path, path)
        return jsonify({"status": "ok"})

    if os.path.exists(tmp_path):
        os.remove(tmp_path)
    return jsonify({"status": "error", "message": "ffmpeg failed"}), 500


@app.post("/delete_shoutout")
def delete_shoutout():
    filename = os.path.basename((request.json or {}).get("filename", ""))
    if filename:
        path = os.path.join("shoutouts", filename)
        if os.path.exists(path):
            os.remove(path)
        save_shoutout_meta([s for s in load_shoutout_meta() if s["filename"] != filename])
        state = load_state()
        state["shoutout_list"] = [f for f in state["shoutout_list"] if f != filename]
        state["shoutout_bench"] = [f for f in state["shoutout_bench"] if f != filename]
        save_state(state)
    return jsonify({"status": "ok"})


@app.post("/reorder_shoutouts")
def reorder_shoutouts():
    order = (request.json or {}).get("order", [])
    meta = load_shoutout_meta()
    meta_map = {s["filename"]: s for s in meta}
    new_meta = [meta_map[f] for f in order if f in meta_map]
    for s in meta:
        if s["filename"] not in order:
            new_meta.append(s)
    save_shoutout_meta(new_meta)
    return jsonify({"status": "ok"})


_build_jobs: dict[str, queue.Queue] = {}
_energy_jobs: dict[str, queue.Queue] = {}


@app.post("/build")
def build():
    data = request.json or {}

    state = load_state()
    songs = load_all_songs()

    song_list = [songs[url] for url in state["list"] if url in songs]
    if not song_list:
        return jsonify({"error": "No songs in the Top 100 list"}), 400

    meta_map = {s["filename"]: s for s in load_shoutout_meta()}
    shoutout_list = [meta_map[f] for f in state["shoutout_list"] if f in meta_map]

    job_id = uuid.uuid4().hex[:8]
    q: queue.Queue = queue.Queue()
    _build_jobs[job_id] = q

    opts = {
        "output_name": data.get("output_name", "klub100"),
        "file_format": data.get("file_format", "mp3"),
        "song_vol":    float(data.get("song_vol", -14)),
        "so_vol":      float(data.get("so_vol", -14)),
        "fade":        int(data.get("fade", 3)),
        "song_length": int(data.get("song_length", 60)),
    }

    def run():
        try:
            from make_klub import make_club_from_app
            result = make_club_from_app(
                song_list=song_list,
                shoutout_list=shoutout_list,
                build_dir="output",
                log=lambda msg: q.put({"type": "log", "msg": msg}),
                **opts,
            )
            q.put({"type": "done", "file": os.path.basename(result)})
        except Exception as exc:
            q.put({"type": "error", "msg": str(exc)})

    threading.Thread(target=run, daemon=True).start()
    return jsonify({"job_id": job_id})


@app.get("/build_stream/<job_id>")
def build_stream(job_id):
    q = _build_jobs.get(job_id)
    if not q:
        return "Job not found", 404

    def generate():
        while True:
            try:
                msg = q.get(timeout=20)
                yield f"data: {json.dumps(msg)}\n\n"
                if msg["type"] in ("done", "error"):
                    _build_jobs.pop(job_id, None)
                    break
            except queue.Empty:
                yield "data: {\"type\":\"ping\"}\n\n"

    return Response(generate(), mimetype="text/event-stream",
                    headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"})


@app.get("/energy")
def energy():
    state = load_state()
    songs = load_all_songs()
    song_list = [songs[url] for url in state["list"] if url in songs]

    scores = []
    for i, song in enumerate(song_list, 1):
        path = f"song_info/info_{song['track_id']}.json"
        cached = None
        if os.path.exists(path):
            with open(path) as f:
                cached = json.load(f).get("energy")
        scores.append({
            "pos": i,
            "title": song["title"],
            "track_id": song["track_id"],
            "energy": cached,
            "has_wav": os.path.exists(f"tracks/{song['track_id']}.wav"),
        })
    return jsonify({"scores": scores})


@app.post("/energy/analyze")
def energy_analyze():
    state = load_state()
    songs = load_all_songs()
    song_list = [songs[url] for url in state["list"] if url in songs]
    force = (request.json or {}).get("force", False)

    job_id = uuid.uuid4().hex[:8]
    q: queue.Queue = queue.Queue()
    _energy_jobs[job_id] = q

    def run():
        from Functions.energy import compute_energy_score
        for i, song in enumerate(song_list, 1):
            tid = song["track_id"]
            info_path = f"song_info/info_{tid}.json"
            wav_path = f"tracks/{tid}.wav"

            if not force and os.path.exists(info_path):
                with open(info_path) as f:
                    info = json.load(f)
                if "energy" in info:
                    continue

            if not os.path.exists(wav_path):
                continue

            try:
                start_time = float(song.get("start_time") or 0)
                score = compute_energy_score(wav_path, start_time=start_time)
                with open(info_path) as f:
                    info = json.load(f)
                info["energy"] = score
                with open(info_path, "w") as f:
                    json.dump(info, f)
                q.put({"type": "score", "pos": i, "title": song["title"],
                       "track_id": tid, "energy": score})
            except Exception as exc:
                q.put({"type": "score", "pos": i, "title": song["title"],
                       "track_id": tid, "energy": None, "error": str(exc)})

        q.put({"type": "done"})

    threading.Thread(target=run, daemon=True).start()
    return jsonify({"job_id": job_id})


@app.get("/energy_stream/<job_id>")
def energy_stream(job_id):
    q = _energy_jobs.get(job_id)
    if not q:
        return "Job not found", 404

    def generate():
        while True:
            try:
                msg = q.get(timeout=30)
                yield f"data: {json.dumps(msg)}\n\n"
                if msg["type"] == "done":
                    _energy_jobs.pop(job_id, None)
                    break
            except queue.Empty:
                yield 'data: {"type":"ping"}\n\n'

    return Response(generate(), mimetype="text/event-stream",
                    headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"})


@app.post("/upload_song")
def upload_song():
    if "file" not in request.files:
        return jsonify({"status": "error", "message": "No file provided"}), 400
    f = request.files["file"]
    if not f.filename:
        return jsonify({"status": "error", "message": "Empty filename"}), 400

    base, ext = os.path.splitext(os.path.basename(f.filename))
    tid = _sanitize_id(base)
    if os.path.exists(f"song_info/info_{tid}.json") or os.path.exists(f"tracks/{tid}.wav"):
        tid = f"{tid}_{uuid.uuid4().hex[:6]}"

    os.makedirs("tracks", exist_ok=True)
    raw_path = os.path.join("tracks", f"{tid}{ext}")
    wav_path = os.path.join("tracks", f"{tid}.wav")
    f.save(raw_path)

    if ext.lower() != ".wav":
        result = subprocess.run(["ffmpeg", "-y", "-i", raw_path, wav_path], capture_output=True)
        if result.returncode == 0 and os.path.exists(wav_path):
            os.remove(raw_path)
        else:
            os.rename(raw_path, wav_path)
    else:
        os.rename(raw_path, wav_path)

    url = f"local:{tid}"
    song = {"title": base, "thumbnail": "", "url": url, "start_time": 0, "track_id": tid}
    os.makedirs("song_info", exist_ok=True)
    with open(f"song_info/info_{tid}.json", "w") as fp:
        json.dump(song, fp)

    state = load_state()
    if url not in state["list"] and url not in state["bench"]:
        state["bench"].append(url)
        save_state(state)

    return jsonify({"status": "ok", "song": song})


@app.post("/upload_shoutout")
def upload_shoutout():
    if "file" not in request.files:
        return jsonify({"status": "error", "message": "No file provided"}), 400
    f = request.files["file"]
    if not f.filename:
        return jsonify({"status": "error", "message": "Empty filename"}), 400

    orig_name = os.path.basename(f.filename)
    base, ext = os.path.splitext(orig_name)
    os.makedirs("shoutouts", exist_ok=True)
    raw_path = os.path.join("shoutouts", orig_name)
    wav_filename = base + ".wav"
    wav_path = os.path.join("shoutouts", wav_filename)
    f.save(raw_path)

    if ext.lower() != ".wav":
        result = subprocess.run(["ffmpeg", "-y", "-i", raw_path, wav_path], capture_output=True)
        if result.returncode == 0 and os.path.exists(wav_path):
            os.remove(raw_path)
            final_filename = wav_filename
        else:
            final_filename = orig_name
    else:
        final_filename = orig_name

    label = os.path.splitext(final_filename)[0]
    meta = load_shoutout_meta()
    if not any(s["filename"] == final_filename for s in meta):
        meta.append({"filename": final_filename, "label": label})
        save_shoutout_meta(meta)

    state = load_state()
    if final_filename not in state["shoutout_list"] and final_filename not in state["shoutout_bench"]:
        state["shoutout_bench"].append(final_filename)
        save_state(state)

    return jsonify({"status": "ok", "filename": final_filename, "label": label})


@app.get("/download/<filename>")
def download_file(filename):
    path = os.path.abspath(os.path.join("output", os.path.basename(filename)))
    if not os.path.exists(path):
        return "File not found", 404
    return send_file(path, as_attachment=True)


if __name__ == "__main__":
    app.run(debug=True, threaded=True)
