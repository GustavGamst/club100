// ── STATE ─────────────────────────────────────────────────────────────────────

const wavesurfers = {};
let activeWaveId = null;
let activeShoutoutAudio = null;
let isDirty = false;

let mediaRecorder = null;
let recordedChunks = [];
let recordTimerInterval = null;
let recordSeconds = 0;
let meterAnimFrame = null;
let audioCtx = null;

// ── SORTABLE ──────────────────────────────────────────────────────────────────

Sortable.create(document.getElementById("bench-section"), {
    group: { name: "songs", pull: true, put: true },
    animation: 180,
    handle: ".drag-handle",
    ghostClass: "sortable-ghost",
    chosenClass: "sortable-chosen",
    onEnd() { updateListNumbers(); markDirty(); },
});

Sortable.create(document.getElementById("list-section"), {
    group: { name: "songs", pull: true, put: true },
    animation: 180,
    handle: ".drag-handle",
    ghostClass: "sortable-ghost",
    chosenClass: "sortable-chosen",
    onEnd() { updateListNumbers(); markDirty(); },
});

Sortable.create(document.getElementById("shoutout-list"), {
    group: { name: "shouts", pull: true, put: true },
    animation: 180,
    handle: ".drag-handle",
    ghostClass: "sortable-ghost",
    chosenClass: "sortable-chosen",
    onEnd() { updateShoutListNumbers(); markDirty(); },
});

Sortable.create(document.getElementById("shoutout-bench"), {
    group: { name: "shouts", pull: true, put: true },
    animation: 180,
    handle: ".drag-handle",
    ghostClass: "sortable-ghost",
    chosenClass: "sortable-chosen",
    onEnd() { updateShoutListNumbers(); markDirty(); },
});

// ── COUNTS + NUMBERING ────────────────────────────────────────────────────────

function updateListNumbers() {
    document.querySelectorAll("#list-section .song-card").forEach((card, i) => {
        let el = card.querySelector(".position-num");
        if (!el) {
            el = document.createElement("span");
            el.className = "position-num";
            card.querySelector(".card-main").prepend(el);
        }
        el.textContent = `#${i + 1}`;
    });
    updateCounts();
}

function updateShoutListNumbers() {
    document.querySelectorAll("#shoutout-list .shoutout-card").forEach((card, i) => {
        const el = card.querySelector(".shout-pos");
        if (el) el.textContent = `#${i + 1}`;
    });
    // Clear numbers in bench
    document.querySelectorAll("#shoutout-bench .shoutout-card").forEach(card => {
        const el = card.querySelector(".shout-pos");
        if (el) el.textContent = "";
    });
    updateCounts();
}

function updateCounts() {
    const lc = document.querySelectorAll("#list-section .song-card").length;
    const bc = document.querySelectorAll("#bench-section .song-card").length;
    const slc = document.querySelectorAll("#shoutout-list .shoutout-card").length;
    const sbc = document.querySelectorAll("#shoutout-bench .shoutout-card").length;
    document.getElementById("list-count").textContent = `${lc}/100`;
    document.getElementById("bench-count").textContent = bc;
    document.getElementById("shout-list-count").textContent = slc;
    document.getElementById("shout-bench-count").textContent = sbc;
}

// ── WAVEFORM / PLAY ───────────────────────────────────────────────────────────

function formatTime(s) {
    const m = Math.floor(s / 60);
    return `${m}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

function togglePlay(button) {
    const card = button.closest(".song-card");
    const url = card.dataset.url;
    const trackId = card.dataset.trackId;
    const waveId = "wave-" + trackId;
    const startTime = parseFloat(card.querySelector(".start-time").value || 0);
    const waveRow = card.querySelector(".wave-row");
    const timerEl = card.querySelector(".timer");

    // Stop previously active track
    if (activeWaveId && activeWaveId !== waveId) {
        const prev = wavesurfers[activeWaveId];
        if (prev) prev.pause();
        const prevId = activeWaveId.replace("wave-", "");
        const prevCard = document.querySelector(`[data-track-id="${prevId}"]`);
        if (prevCard) {
            prevCard.querySelector(".play-btn").textContent = "▶";
            prevCard.querySelector(".wave-row").style.display = "none";
        }
        activeWaveId = null;
    }

    if (!wavesurfers[waveId]) {
        waveRow.style.display = "block";
        button.textContent = "…";
        button.disabled = true;

        wavesurfers[waveId] = WaveSurfer.create({
            container: "#" + waveId,
            waveColor: "#4c1d95",
            progressColor: "#7c3aed",
            height: 56,
            normalize: true,
            barWidth: 2,
            barGap: 1,
            barRadius: 1,
        });

        wavesurfers[waveId].load("/audio?link=" + encodeURIComponent(url));

        wavesurfers[waveId].on("ready", () => {
            button.disabled = false;
            button.textContent = "⏸";
            wavesurfers[waveId].setTime(startTime);
            wavesurfers[waveId].play();
            activeWaveId = waveId;
        });

        wavesurfers[waveId].on("audioprocess", () => {
            timerEl.textContent = `${formatTime(wavesurfers[waveId].getCurrentTime())} / ${formatTime(wavesurfers[waveId].getDuration())}`;
        });

        wavesurfers[waveId].on("finish", () => {
            button.textContent = "▶";
            activeWaveId = null;
        });

        wavesurfers[waveId].on("error", (err) => {
            button.textContent = "▶";
            button.disabled = false;
            waveRow.style.display = "none";
            delete wavesurfers[waveId];
            const title = card.querySelector(".song-title");
            const prev = title.title;
            title.title = "Could not load audio — SoundCloud streaming may be unavailable for this track";
            title.style.color = "var(--danger)";
            setTimeout(() => { title.style.color = ""; title.title = prev; }, 4000);
        });
    } else {
        const ws = wavesurfers[waveId];
        if (ws.isPlaying()) {
            ws.pause();
            button.textContent = "▶";
            waveRow.style.display = "none";
            activeWaveId = null;
        } else {
            waveRow.style.display = "block";
            ws.setTime(startTime);
            ws.play();
            button.textContent = "⏸";
            activeWaveId = waveId;
        }
    }
}

// ── SAVE ──────────────────────────────────────────────────────────────────────

function markDirty() {
    isDirty = true;
    const el = document.getElementById("save-status");
    el.textContent = "Unsaved changes";
    el.className = "status-unsaved";
    document.getElementById("save-btn").classList.add("btn-dirty");
}

function saveOrder() {
    const list  = Array.from(document.querySelectorAll("#list-section .song-card")).map(c => c.dataset.url);
    const bench = Array.from(document.querySelectorAll("#bench-section .song-card")).map(c => c.dataset.url);
    const shoutout_list  = Array.from(document.querySelectorAll("#shoutout-list .shoutout-card")).map(c => c.dataset.filename);
    const shoutout_bench = Array.from(document.querySelectorAll("#shoutout-bench .shoutout-card")).map(c => c.dataset.filename);

    const start_times = {};
    document.querySelectorAll(".song-card").forEach(card => {
        start_times[card.dataset.url] = parseFloat(card.querySelector(".start-time").value || 0);
    });

    const el = document.getElementById("save-status");
    document.getElementById("save-btn").textContent = "Saving…";

    fetch("/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ list, bench, shoutout_list, shoutout_bench, start_times }),
    })
    .then(r => r.json())
    .then(data => {
        document.getElementById("save-btn").textContent = "Save";
        if (data.status === "ok") {
            isDirty = false;
            el.textContent = "Saved ✓";
            el.className = "status-saved";
            document.getElementById("save-btn").classList.remove("btn-dirty");
            setTimeout(() => { if (!isDirty) el.textContent = ""; }, 2500);
        } else {
            el.textContent = "Save failed";
            el.className = "status-error";
        }
    })
    .catch(() => {
        document.getElementById("save-btn").textContent = "Save";
        el.textContent = "Save failed";
        el.className = "status-error";
    });
}

document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        saveOrder();
    }
});

// ── ADD NEW SONG ──────────────────────────────────────────────────────────────

function addNewSong() {
    document.getElementById("new-song-modal").style.display = "flex";
    const ta = document.getElementById("new-song-urls");
    ta.value = "";
    document.getElementById("new-song-progress").style.display = "none";
    document.getElementById("new-song-progress").textContent = "";
    const submitBtn = document.getElementById("new-song-submit-btn");
    submitBtn.disabled = false;
    submitBtn.textContent = "Add Songs";
    document.getElementById("new-song-close-btn").textContent = "Cancel";
    setTimeout(() => ta.focus(), 50);
}

function closeNewSongModal() {
    document.getElementById("new-song-modal").style.display = "none";
}

async function submitBulkSongs() {
    const ta = document.getElementById("new-song-urls");
    const urls = ta.value.split(/\n/)
        .map(l => l.trim())
        .filter(l => l.length > 0 && /^https?:\/\//.test(l));

    if (urls.length === 0) {
        document.getElementById("new-song-progress").style.display = "block";
        document.getElementById("new-song-progress").textContent = "No valid URLs found.";
        return;
    }

    const existingUrls = new Set(
        Array.from(document.querySelectorAll(".song-card")).map(c => c.dataset.url)
    );

    const toAdd = urls.filter(u => !existingUrls.has(u));
    const skipped = urls.length - toAdd.length;

    const submitBtn = document.getElementById("new-song-submit-btn");
    const progress = document.getElementById("new-song-progress");
    submitBtn.disabled = true;
    progress.style.display = "block";

    if (toAdd.length === 0) {
        progress.textContent = `All ${skipped} song${skipped !== 1 ? "s" : ""} already added — nothing to do.`;
        submitBtn.disabled = false;
        document.getElementById("new-song-close-btn").textContent = "Close";
        return;
    }

    let added = 0, failed = 0;

    for (let i = 0; i < toAdd.length; i++) {
        const url = toAdd[i];
        progress.textContent = `Adding ${i + 1} / ${toAdd.length}…`;
        try {
            const r = await fetch("/new_song", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url }),
            });
            const data = await r.json();
            if (data.status === "ok") {
                appendSongCard(data.song);
                added++;
            } else {
                failed++;
                progress.textContent = `Error (${i + 1}/${toAdd.length}): ${data.message}`;
            }
        } catch {
            failed++;
        }
    }

    if (added > 0) {
        updateCounts();
        markDirty();
    }

    const parts = [`Added ${added}`];
    if (skipped > 0) parts.push(`${skipped} already existed`);
    if (failed > 0) parts.push(`${failed} failed`);
    progress.textContent = parts.join(" · ");

    submitBtn.disabled = false;
    submitBtn.textContent = "Add More";
    document.getElementById("new-song-close-btn").textContent = "Close";

    if (failed === 0) {
        setTimeout(() => closeNewSongModal(), 1500);
    }
}

function appendSongCard(song) {
    const li = document.createElement("li");
    li.className = "song-card";
    li.dataset.url = song.url;
    li.dataset.trackId = song.track_id;
    li.innerHTML = `
        <div class="card-main">
            <span class="position-num"></span>
            <span class="drag-handle" title="Drag to reorder">⠿</span>
            ${song.thumbnail
                ? `<img class="thumb" src="${escHtml(song.thumbnail)}" alt="" loading="lazy">`
                : `<div class="thumb thumb-empty">♪</div>`}
            <span class="song-title" title="${escHtml(song.title)}">${escHtml(song.title)}</span>
            <div class="controls">
                <label class="start-wrap" title="Start time in seconds">
                    <input type="number" class="start-time" value="${song.start_time || 0}" min="0" onchange="markDirty()">
                    <span class="unit">s</span>
                </label>
                <button class="btn-icon play-btn" onclick="togglePlay(this)">▶</button>
                <button class="btn-icon btn-danger delete-song-btn" onclick="deleteSong(this)" title="Remove song">✕</button>
            </div>
        </div>
        <div class="wave-row" style="display:none">
            <div class="waveform" id="wave-${escHtml(song.track_id)}"></div>
            <span class="timer">0:00 / 0:00</span>
        </div>
    `;
    document.getElementById("bench-section").appendChild(li);
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── DELETE SONG ───────────────────────────────────────────────────────────────

function deleteSong(button) {
    const card = button.closest(".song-card");
    const url = card.dataset.url;
    const title = card.querySelector(".song-title").textContent;
    if (!confirm(`Remove "${title}" from the bench?`)) return;

    fetch("/delete_song", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
    }).then(r => r.json()).then(data => {
        if (data.status === "ok") {
            const waveId = "wave-" + card.dataset.trackId;
            if (wavesurfers[waveId]) { wavesurfers[waveId].destroy(); delete wavesurfers[waveId]; }
            card.remove();
            updateCounts();
            markDirty();
        }
    });
}

// ── SHOUTOUTS ─────────────────────────────────────────────────────────────────

function playShoutout(button) {
    const card = button.closest(".shoutout-card");
    const filename = card.dataset.filename;

    if (activeShoutoutAudio) {
        activeShoutoutAudio.pause();
        document.querySelectorAll(".shoutout-card .play-btn").forEach(b => b.textContent = "▶");
        if (activeShoutoutAudio._card === card) {
            activeShoutoutAudio = null;
            return;
        }
    }

    const audio = new Audio("/shoutout_audio?filename=" + encodeURIComponent(filename));
    audio._card = card;
    audio.play();
    button.textContent = "⏸";
    activeShoutoutAudio = audio;
    audio.onended = () => {
        button.textContent = "▶";
        activeShoutoutAudio = null;
    };
}

function deleteShoutout(button) {
    const card = button.closest(".shoutout-card");
    const filename = card.dataset.filename;
    if (!confirm(`Delete "${filename}"?`)) return;
    fetch("/delete_shoutout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
    }).then(() => { card.remove(); updateCounts(); });
}

// Double-click label to rename
["shoutout-list", "shoutout-bench"].forEach(id => {
    document.getElementById(id).addEventListener("dblclick", e => {
        const label = e.target.closest(".shoutout-label");
        if (!label) return;
        const card = label.closest(".shoutout-card");
        const filename = card.dataset.filename;
        const original = label.textContent;
        label.contentEditable = "true";
        label.classList.add("editing");
        label.focus();
        const range = document.createRange();
        range.selectNodeContents(label);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);

        const finish = () => {
            label.contentEditable = "false";
            label.classList.remove("editing");
            const newLabel = label.textContent.trim() || original;
            label.textContent = newLabel;
            if (newLabel !== original) {
                fetch("/rename_shoutout", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ filename, label: newLabel }),
                });
            }
        };
        label.addEventListener("blur", finish, { once: true });
        label.addEventListener("keydown", e => {
            if (e.key === "Enter") { e.preventDefault(); label.blur(); }
            if (e.key === "Escape") { label.textContent = original; label.blur(); }
        }, { once: true });
    });
});

// ── RECORDING ─────────────────────────────────────────────────────────────────

function toggleRecord() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
        stopAndPrepSave();
    } else {
        document.getElementById("record-ui").style.display = "flex";
        startRecording();
    }
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recordedChunks = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
        mediaRecorder.start();

        startMeter(stream);

        recordSeconds = 0;
        clearInterval(recordTimerInterval);
        recordTimerInterval = setInterval(() => {
            recordSeconds++;
            const m = Math.floor(recordSeconds / 60);
            const s = recordSeconds % 60;
            document.getElementById("record-timer").textContent = `${m}:${s.toString().padStart(2, "0")}`;
        }, 1000);

        document.getElementById("record-status").textContent = "● Recording…";
        document.getElementById("record-btn").textContent = "■ Stop";
        document.getElementById("record-btn").classList.add("recording");
        document.getElementById("stop-btn").style.display = "inline-flex";
        document.getElementById("save-row").style.display = "none";
    } catch (err) {
        alert("Microphone access denied: " + err.message);
        document.getElementById("record-ui").style.display = "none";
    }
}

function startMeter(stream) {
    stopMeter();
    audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const fill = document.getElementById("meter-fill");

    function tick() {
        analyser.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        fill.style.width = Math.min(100, (avg / 255) * 100 * 3) + "%"; // ×3 so speech shows clearly
        meterAnimFrame = requestAnimationFrame(tick);
    }
    tick();
}

function stopMeter() {
    if (meterAnimFrame) { cancelAnimationFrame(meterAnimFrame); meterAnimFrame = null; }
    if (audioCtx) { audioCtx.close(); audioCtx = null; }
    const fill = document.getElementById("meter-fill");
    if (fill) fill.style.width = "0%";
}

function stopAndPrepSave() {
    if (!mediaRecorder) return;
    clearInterval(recordTimerInterval);
    stopMeter();

    // onstop fires after all ondataavailable events — stream tracks are kept alive until then
    mediaRecorder.onstop = () => {
        // Stop the mic stream only after all encoded data has been flushed
        mediaRecorder.stream.getTracks().forEach(t => t.stop());
        document.getElementById("record-status").textContent = "Done. Name and save below.";
        document.getElementById("record-btn").textContent = "● Record";
        document.getElementById("record-btn").classList.remove("recording");
        document.getElementById("stop-btn").style.display = "none";
        document.getElementById("save-row").style.display = "flex";
        document.getElementById("record-name").focus();
    };

    mediaRecorder.stop();
    // Do NOT stop stream tracks here — wait for onstop
}

async function confirmSave() {
    const rawLabel = document.getElementById("record-name").value.trim() || `shoutout_${Date.now()}`;
    const safeLabel = rawLabel.replace(/[^a-z0-9_\-]/gi, "_");
    const mimeType = recordedChunks[0]?.type || "audio/webm";
    const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "webm";
    const filename = `${safeLabel}.${ext}`;

    const blob = new Blob(recordedChunks, { type: mimeType });
    const res = await fetch(`/save_shoutout?filename=${encodeURIComponent(filename)}`, {
        method: "POST",
        headers: { "Content-Type": mimeType },
        body: blob,
    });
    const data = await res.json();
    if (data.status === "ok") {
        appendShoutoutCard(data.filename, data.label);
        discardRecording();
        updateCounts();
        markDirty();
    }
}

function discardRecording() {
    stopMeter();
    recordedChunks = [];
    document.getElementById("record-ui").style.display = "none";
    document.getElementById("record-name").value = "";
    document.getElementById("record-timer").textContent = "0:00";
    document.getElementById("record-status").textContent = "Ready";
    document.getElementById("save-row").style.display = "none";
    document.getElementById("stop-btn").style.display = "none";
}

function appendShoutoutCard(filename, label) {
    const li = document.createElement("li");
    li.className = "shoutout-card";
    li.dataset.filename = filename;
    li.innerHTML = `
        <span class="position-num shout-pos"></span>
        <span class="drag-handle">⠿</span>
        <span class="shoutout-label">${escHtml(label)}</span>
        <div class="controls">
            <button class="btn-icon play-btn" onclick="playShoutout(this)">▶</button>
            <button class="btn-icon trim-btn" onclick="openTrimModal(this)" title="Trim">✂</button>
            <button class="btn-icon btn-danger" onclick="deleteShoutout(this)" title="Delete">✕</button>
        </div>
    `;
    document.getElementById("shoutout-bench").appendChild(li);
}

// ── TRIM SHOUTOUT ─────────────────────────────────────────────────────────────

const trim = { filename: null, ws: null, duration: 0, previewInterval: null };

function openTrimModal(button) {
    const card = button.closest(".shoutout-card");
    trim.filename = card.dataset.filename;
    const label = card.querySelector(".shoutout-label").textContent;
    document.getElementById("trim-modal-title").textContent = `TRIM: ${label}`;
    document.getElementById("trim-save-btn").disabled = true;
    document.getElementById("trim-save-btn").textContent = "Trim & Save";
    document.getElementById("trim-preview-btn").disabled = true;
    document.getElementById("trim-start-val").textContent = "…";
    document.getElementById("trim-end-val").textContent = "…";
    document.getElementById("trim-duration-val").textContent = "…";
    document.getElementById("trim-region").style.left = "0%";
    document.getElementById("trim-region").style.width = "100%";
    document.getElementById("trim-modal").style.display = "flex";
    loadTrimWaveform();
}

function closeTrimModal() {
    document.getElementById("trim-modal").style.display = "none";
    stopTrimPreview();
    if (trim.ws) { trim.ws.destroy(); trim.ws = null; }
    trim.filename = null;
    trim.duration = 0;
}

function loadTrimWaveform() {
    if (trim.ws) { trim.ws.destroy(); trim.ws = null; }
    document.getElementById("trim-waveform").innerHTML = "";

    trim.ws = WaveSurfer.create({
        container: "#trim-waveform",
        waveColor: "#4c1d95",
        progressColor: "#7c3aed",
        height: 80,
        normalize: true,
        barWidth: 2,
        barGap: 1,
        barRadius: 1,
        interact: false,
    });

    trim.ws.load(`/shoutout_audio?filename=${encodeURIComponent(trim.filename)}`);

    trim.ws.on("ready", () => {
        trim.duration = trim.ws.getDuration();
        const s = document.getElementById("trim-start");
        const e = document.getElementById("trim-end");
        s.max = trim.duration; s.step = 0.01; s.value = 0;
        e.max = trim.duration; e.step = 0.01; e.value = trim.duration;
        updateTrimUI();
        document.getElementById("trim-save-btn").disabled = false;
        document.getElementById("trim-preview-btn").disabled = false;
    });
}

function updateTrimUI() {
    const start = parseFloat(document.getElementById("trim-start").value);
    const end   = parseFloat(document.getElementById("trim-end").value);
    document.getElementById("trim-start-val").textContent    = start.toFixed(2) + "s";
    document.getElementById("trim-end-val").textContent      = end.toFixed(2) + "s";
    document.getElementById("trim-duration-val").textContent = Math.max(0, end - start).toFixed(2) + "s";
    if (trim.duration > 0) {
        document.getElementById("trim-region").style.left  = (start / trim.duration * 100) + "%";
        document.getElementById("trim-region").style.width = (Math.max(0, end - start) / trim.duration * 100) + "%";
    }
}

function onTrimStartChange() {
    const s = document.getElementById("trim-start");
    const e = document.getElementById("trim-end");
    if (parseFloat(s.value) >= parseFloat(e.value)) s.value = Math.max(0, parseFloat(e.value) - 0.05);
    updateTrimUI();
}

function onTrimEndChange() {
    const s = document.getElementById("trim-start");
    const e = document.getElementById("trim-end");
    if (parseFloat(e.value) <= parseFloat(s.value)) e.value = Math.min(trim.duration, parseFloat(s.value) + 0.05);
    updateTrimUI();
}

function previewTrim() {
    if (!trim.ws || !trim.duration) return;
    stopTrimPreview();
    const start = parseFloat(document.getElementById("trim-start").value);
    const end   = parseFloat(document.getElementById("trim-end").value);
    trim.ws.setTime(start);
    trim.ws.play();
    trim.previewInterval = setInterval(() => {
        if (!trim.ws) { clearInterval(trim.previewInterval); return; }
        if (trim.ws.getCurrentTime() >= end) {
            trim.ws.pause();
            clearInterval(trim.previewInterval);
            trim.previewInterval = null;
        }
    }, 50);
}

function stopTrimPreview() {
    if (trim.previewInterval) { clearInterval(trim.previewInterval); trim.previewInterval = null; }
    if (trim.ws && trim.ws.isPlaying()) trim.ws.pause();
}

async function saveTrim() {
    const start = parseFloat(document.getElementById("trim-start").value);
    const end   = parseFloat(document.getElementById("trim-end").value);
    if (end <= start) return;
    stopTrimPreview();
    const btn = document.getElementById("trim-save-btn");
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
        const r = await fetch("/trim_shoutout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: trim.filename, start, end }),
        });
        const data = await r.json();
        if (data.status === "ok") {
            btn.textContent = "Saved ✓";
            setTimeout(() => closeTrimModal(), 800);
        } else {
            btn.textContent = "Error";
            btn.disabled = false;
        }
    } catch {
        btn.textContent = "Error";
        btn.disabled = false;
    }
}

// ── BUILD ─────────────────────────────────────────────────────────────────────

function openBuild() {
    document.getElementById("build-modal").style.display = "flex";
    document.getElementById("build-log").style.display = "none";
    document.getElementById("build-log").textContent = "";
    document.getElementById("build-download").style.display = "none";
    document.getElementById("build-start-btn").disabled = false;
    document.getElementById("build-start-btn").textContent = "Start";
}

function closeBuild() {
    document.getElementById("build-modal").style.display = "none";
}

function startBuild() {
    const btn = document.getElementById("build-start-btn");
    btn.disabled = true;
    btn.textContent = "Building…";

    const log = document.getElementById("build-log");
    log.style.display = "block";
    log.textContent = "";
    document.getElementById("build-download").style.display = "none";

    const opts = {
        output_name: document.getElementById("b-name").value.trim() || "klub100",
        file_format: document.getElementById("b-format").value,
        song_vol:    parseFloat(document.getElementById("b-svol").value),
        so_vol:      parseFloat(document.getElementById("b-sovol").value),
        fade:        parseInt(document.getElementById("b-fade").value),
        song_length: parseInt(document.getElementById("b-len").value),
    };

    fetch("/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts),
    })
    .then(r => r.json())
    .then(data => {
        if (data.error) {
            appendLog("ERROR: " + data.error, "error");
            btn.disabled = false;
            btn.textContent = "Start";
            return;
        }
        listenBuild(data.job_id);
    })
    .catch(err => {
        appendLog("Network error: " + err, "error");
        btn.disabled = false;
        btn.textContent = "Start";
    });
}

function listenBuild(jobId) {
    const es = new EventSource(`/build_stream/${jobId}`);
    es.onmessage = e => {
        const msg = JSON.parse(e.data);
        if (msg.type === "ping") return;
        if (msg.type === "log") {
            appendLog(msg.msg);
        } else if (msg.type === "done") {
            appendLog("✓ " + msg.msg, "success");
            es.close();
            const dl = document.getElementById("build-download");
            dl.href = `/download/${encodeURIComponent(msg.file)}`;
            dl.textContent = `⬇ Download ${msg.file}`;
            dl.style.display = "inline-block";
            document.getElementById("build-start-btn").textContent = "Done";
        } else if (msg.type === "error") {
            appendLog("ERROR: " + msg.msg, "error");
            es.close();
            document.getElementById("build-start-btn").disabled = false;
            document.getElementById("build-start-btn").textContent = "Retry";
        }
    };
    es.onerror = () => {
        appendLog("Connection lost.", "error");
        es.close();
    };
}

function appendLog(text, cls) {
    const log = document.getElementById("build-log");
    const line = document.createElement("div");
    line.textContent = text;
    if (cls) line.className = "log-" + cls;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
}

// ── PREVIEW ───────────────────────────────────────────────────────────────────

const PREVIEW_END_OFFSET = 48;   // seek to start_time + this (so last 12s of the 60s clip)
const PREVIEW_END_WINDOW = 12;   // seconds to play at end of song
const PREVIEW_START_WINDOW = 10; // seconds to play at start of next song
const FADE_OUT_DURATION = 4;     // seconds over which end fades out
const FADE_IN_DURATION = 3;      // seconds over which start fades in

const pv = {
    active: false,
    transitions: [],
    index: 0,
    audio: null,
    ticker: null,
};

function buildTransitions() {
    const songCards = Array.from(document.querySelectorAll("#list-section .song-card"));
    const shoutCards = Array.from(document.querySelectorAll("#shoutout-list .shoutout-card"));
    if (songCards.length < 2) return [];

    return songCards.slice(0, -1).map((card, i) => {
        const next = songCards[i + 1];
        const shout = shoutCards[i] || null;
        return {
            songTitle: card.querySelector(".song-title").textContent,
            songUrl:   card.dataset.url,
            songStart: parseFloat(card.querySelector(".start-time").value || 0),
            shoutout:  shout ? {
                filename: shout.dataset.filename,
                label:    shout.querySelector(".shoutout-label").textContent,
            } : null,
            nextTitle: next.querySelector(".song-title").textContent,
            nextUrl:   next.dataset.url,
            nextStart: parseFloat(next.querySelector(".start-time").value || 0),
        };
    });
}

function startPreview() {
    const transitions = buildTransitions();
    if (!transitions.length) {
        alert("Add at least 2 songs to the Top 100 list to preview transitions.");
        return;
    }

    // Stop anything currently playing
    if (activeWaveId) {
        wavesurfers[activeWaveId]?.pause();
        const prevCard = document.querySelector(`[data-track-id="${activeWaveId.replace("wave-", "")}"]`);
        if (prevCard) {
            prevCard.querySelector(".play-btn").textContent = "▶";
            prevCard.querySelector(".wave-row").style.display = "none";
        }
        activeWaveId = null;
    }
    if (activeShoutoutAudio) {
        activeShoutoutAudio.pause();
        document.querySelectorAll(".shoutout-card .play-btn").forEach(b => b.textContent = "▶");
        activeShoutoutAudio = null;
    }

    pv.transitions = transitions;
    pv.index = 0;
    pv.active = true;

    document.getElementById("preview-bar").style.display = "flex";
    document.getElementById("preview-btn").textContent = "■ Stop Preview";
    document.getElementById("preview-btn").onclick = stopPreview;
    document.body.classList.add("preview-open");

    runTransition();
}

function stopPreview() {
    pv.active = false;
    if (pv.audio) { pv.audio.pause(); pv.audio = null; }
    clearInterval(pv.ticker);

    document.getElementById("preview-bar").style.display = "none";
    document.getElementById("preview-btn").textContent = "▷ Preview";
    document.getElementById("preview-btn").onclick = startPreview;
    document.body.classList.remove("preview-open");
    document.getElementById("pv-fill").style.width = "0%";
}

function prevTransition() {
    if (pv.index > 0) {
        if (pv.audio) pv.audio.pause();
        clearInterval(pv.ticker);
        pv.index--;
        runTransition();
    }
}

function nextTransition() {
    if (pv.index < pv.transitions.length - 1) {
        if (pv.audio) pv.audio.pause();
        clearInterval(pv.ticker);
        pv.index++;
        runTransition();
    } else {
        stopPreview();
    }
}

async function runTransition() {
    const t = pv.transitions[pv.index];
    if (!t || !pv.active) return;

    updatePreviewNav();
    renderTransitionInfo(t);

    // 1 — Song ending
    setPhase("song-end", "Song ending…");
    await playSegment(
        `/audio?link=${encodeURIComponent(t.songUrl)}`,
        t.songStart + PREVIEW_END_OFFSET,
        PREVIEW_END_WINDOW,
        "fade-out"
    );
    if (!pv.active) return;

    // 2 — Shoutout (if any)
    if (t.shoutout) {
        setPhase("shoutout", `Shoutout: ${t.shoutout.label}`);
        await playSegment(
            `/shoutout_audio?filename=${encodeURIComponent(t.shoutout.filename)}`,
            0, null, "none"
        );
    }
    if (!pv.active) return;

    // 3 — Next song start
    setPhase("song-start", "Next song starting…");
    await playSegment(
        `/audio?link=${encodeURIComponent(t.nextUrl)}`,
        t.nextStart,
        PREVIEW_START_WINDOW,
        "fade-in"
    );
    if (!pv.active) return;

    // Auto-advance
    if (pv.index < pv.transitions.length - 1) {
        pv.index++;
        runTransition();
    } else {
        stopPreview();
    }
}

function playSegment(src, startOffset, maxDuration, fadeType) {
    return new Promise(resolve => {
        if (!pv.active) { resolve(); return; }

        clearInterval(pv.ticker);
        const audio = new Audio(src);
        audio.preload = "auto";
        pv.audio = audio;

        let actualSeek = startOffset;
        let started = false;

        const timeout = setTimeout(() => { if (!started) resolve(); }, 20000);

        audio.addEventListener("loadedmetadata", () => {
            actualSeek = Math.min(startOffset, Math.max(0, audio.duration - 0.5));
            audio.currentTime = actualSeek;
            audio.volume = fadeType === "fade-in" ? 0 : 1;
            audio.play()
                .then(() => {
                    started = true;
                    clearTimeout(timeout);
                    startTicker();
                })
                .catch(() => { clearTimeout(timeout); resolve(); });
        }, { once: true });

        audio.addEventListener("error", () => { clearTimeout(timeout); resolve(); }, { once: true });
        audio.addEventListener("ended", () => { clearInterval(pv.ticker); resolve(); }, { once: true });

        function startTicker() {
            pv.ticker = setInterval(() => {
                if (!pv.active) {
                    clearInterval(pv.ticker);
                    audio.pause();
                    resolve();
                    return;
                }

                const elapsed = Math.max(0, audio.currentTime - actualSeek);
                const duration = maxDuration ?? (audio.duration - actualSeek);

                // Progress bar
                document.getElementById("pv-fill").style.width =
                    Math.min(100, (elapsed / Math.max(0.01, duration)) * 100) + "%";

                // Volume ramping
                if (fadeType === "fade-out") {
                    const fadeStart = duration - FADE_OUT_DURATION;
                    audio.volume = elapsed < fadeStart
                        ? 1
                        : Math.max(0, 1 - (elapsed - fadeStart) / FADE_OUT_DURATION);
                } else if (fadeType === "fade-in") {
                    audio.volume = Math.min(1, elapsed / FADE_IN_DURATION);
                }

                if (elapsed >= duration) {
                    clearInterval(pv.ticker);
                    audio.pause();
                    resolve();
                }
            }, 50);
        }
    });
}

function setPhase(phase, label) {
    document.querySelectorAll(".pv-seg").forEach(el => el.classList.remove("active"));
    const map = { "song-end": "pv-seg-end", "shoutout": "pv-seg-shout", "song-start": "pv-seg-next" };
    const el = document.getElementById(map[phase]);
    if (el) el.classList.add("active");
    document.getElementById("pv-phase").textContent = label;
    document.getElementById("pv-fill").style.width = "0%";
}

function renderTransitionInfo(t) {
    const shortTitle = str => str.length > 30 ? str.slice(0, 28) + "…" : str;
    document.getElementById("pv-seg-end").textContent = shortTitle(t.songTitle);
    const shoutEl = document.getElementById("pv-seg-shout");
    if (t.shoutout) {
        shoutEl.textContent = `[ ${t.shoutout.label} ]`;
        shoutEl.classList.remove("pv-no-shout");
    } else {
        shoutEl.textContent = "[ — ]";
        shoutEl.classList.add("pv-no-shout");
    }
    document.getElementById("pv-seg-next").textContent = shortTitle(t.nextTitle);
}

function updatePreviewNav() {
    const i = pv.index;
    const total = pv.transitions.length;
    document.getElementById("pv-pos").textContent = `${i + 1} / ${total}`;
    document.getElementById("pv-prev").disabled = i === 0;
    document.getElementById("pv-next").disabled = i === total - 1;
}

// ── ENERGY ────────────────────────────────────────────────────────────────────

let energyChart = null;
let energyData = [];

function openEnergy() {
    document.getElementById("energy-modal").style.display = "flex";
    loadCachedEnergy();
}

function closeEnergy() {
    document.getElementById("energy-modal").style.display = "none";
}

function setEnergyStatus(msg) {
    document.getElementById("energy-status").textContent = msg;
}

function loadCachedEnergy() {
    setEnergyStatus("Loading…");
    fetch("/energy")
        .then(r => r.json())
        .then(({ scores }) => {
            energyData = scores;
            renderEnergyChart();

            const toAnalyze = scores.filter(s => s.energy === null && s.has_wav).length;
            const noWav     = scores.filter(s => s.energy === null && !s.has_wav).length;
            const btn = document.getElementById("energy-analyze-btn");

            if (toAnalyze > 0) {
                btn.style.display = "inline-flex";
                btn.disabled = false;
                btn.textContent = `Analyze (${toAnalyze} songs)`;
                setEnergyStatus(noWav > 0 ? `${noWav} songs not yet downloaded — play them first.` : "");
            } else if (noWav > 0) {
                btn.style.display = "none";
                setEnergyStatus(`${noWav} songs not yet downloaded — play them to enable analysis.`);
            } else {
                btn.style.display = "none";
                setEnergyStatus("");
            }
        })
        .catch(() => setEnergyStatus("Failed to load energy data."));
}

function renderEnergyChart() {
    const ctx = document.getElementById("energy-chart").getContext("2d");
    if (energyChart) energyChart.destroy();

    energyChart = new Chart(ctx, {
        type: "line",
        data: {
            labels: energyData.map(s => s.pos),
            datasets: [{
                data: energyData.map(s => s.energy),
                borderColor: "#f59e0b",
                backgroundColor: "rgba(245, 158, 11, 0.08)",
                borderWidth: 2.5,
                pointRadius: energyData.map(s => s.energy !== null ? 3 : 0),
                pointBackgroundColor: "#f59e0b",
                pointHoverRadius: 6,
                tension: 0.35,
                fill: true,
                spanGaps: true,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: "#15151f",
                    borderColor: "#2a2a3f",
                    borderWidth: 1,
                    titleColor: "#f59e0b",
                    bodyColor: "#e2e8f0",
                    callbacks: {
                        title: items => energyData[items[0].dataIndex]?.title ?? "",
                        label: item => item.parsed.y !== null
                            ? `Energy: ${item.parsed.y.toFixed(1)}`
                            : "Not analyzed",
                    },
                },
            },
            scales: {
                y: {
                    min: 1, max: 5,
                    ticks: { stepSize: 1, color: "#5a6480" },
                    grid: { color: "#1d1d2e" },
                    border: { color: "#2a2a3f" },
                },
                x: {
                    ticks: { maxTicksLimit: 25, color: "#5a6480" },
                    grid: { color: "#1d1d2e" },
                    border: { color: "#2a2a3f" },
                    title: { display: true, text: "Position", color: "#5a6480", font: { size: 10 } },
                },
            },
        },
    });
}

function startEnergyAnalysis(force = false) {
    const btn = document.getElementById("energy-analyze-btn");
    const reBtn = document.getElementById("energy-reanalyze-btn");
    btn.disabled = true;
    reBtn.disabled = true;
    const total = force
        ? energyData.filter(s => s.has_wav).length
        : energyData.filter(s => s.energy === null && s.has_wav).length;
    let done = 0;

    if (force) energyData.forEach(s => { s.energy = null; });
    renderEnergyChart();

    fetch("/energy/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force }) })
        .then(r => r.json())
        .then(({ job_id }) => {
            const es = new EventSource(`/energy_stream/${job_id}`);
            es.onmessage = e => {
                const msg = JSON.parse(e.data);
                if (msg.type === "ping") return;
                if (msg.type === "score" && msg.energy !== null) {
                    done++;
                    btn.textContent = `Analyzing… ${done}/${total}`;
                    const entry = energyData.find(s => s.track_id === msg.track_id);
                    if (entry) entry.energy = msg.energy;
                    renderEnergyChart();
                } else if (msg.type === "done") {
                    es.close();
                    btn.style.display = "none";
                    reBtn.disabled = false;
                    setEnergyStatus("Analysis complete.");
                }
            };
            es.onerror = () => {
                es.close();
                btn.disabled = false;
                reBtn.disabled = false;
                btn.textContent = "Retry";
                setEnergyStatus("Disconnected.");
            };
        })
        .catch(() => {
            btn.disabled = false;
            reBtn.disabled = false;
            btn.textContent = "Retry";
        });
}

// ── INIT ──────────────────────────────────────────────────────────────────────

updateListNumbers();
updateShoutListNumbers();
