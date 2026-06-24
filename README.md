# Klub 100 Maker

Træt af at sidde i Audacity og klistre lydklip sammen manuelt? Saml jeres yndlings YouTube/SoundCloud links og producér en studio-quality Klub 100 på ~10 minutter via en web-brugerflade.

## Krav

- Python 3.14+
- [uv](https://docs.astral.sh/uv/) (pakkehåndtering)
- [ffmpeg](https://ffmpeg.org/download.html) — installér separat:
  - macOS: `brew install ffmpeg`
  - Windows: `winget install ffmpeg` (eller `choco install ffmpeg` med Chocolatey)
  - Linux: `sudo apt install ffmpeg`

## Opsætning

```bash
git clone <repo-url> && cd club100
just install        # eller: uv sync
```

Start herefter webappen:

```bash
just run            # eller: uv run python app.py
```

Åbn `http://localhost:5000` i browseren.

---

## Brug af frontenden

Frontenden består af fire paneler:

| Panel | Beskrivelse |
|---|---|
| **BENCH** | Sange der er tilføjet men ikke er i Top 100 endnu |
| **TOP 100** | Den endelige liste — rækkefølgen bestemmer Klub 100 |
| **SHOUTOUTS** | Shoutouts i den rækkefølge de afspilles (én per sang) |
| **SHOUT BENCH** | Shoutouts der er indspillet/importeret men ikke placeret endnu |

### Tilføj sange

Klik **+ New Song** og indsæt ét eller flere YouTube/SoundCloud-links (ét pr. linje). Sange der allerede er tilføjet springes over. Nye sange lander i **BENCH**.

### Byg Top 100

Træk sange fra **BENCH** til **TOP 100** (drag & drop). Rækkefølgen i **TOP 100** er den endelige afspilningsrækkefølge. Nummeret (#1, #2, …) vises automatisk.

### Indstil starttidspunkt

Hvert sangkort har et **s**-felt (sekunder). Angiv det tidspunkt i sangen, hvorfra de 60 sekunder skal klippes. Klik på **▶** på kortet for at afspille og se bølgeformen — klik direkte i bølgeformen for at justere starttidspunktet visuelt.

### Slet en sang

Klik **✕** på sangkortet. Sangen og dens downloadede fil slettes permanent.

### Shoutouts

Shoutouts placeres automatisk før den sang der har samme position. Træk dem fra **SHOUT BENCH** til **SHOUTOUTS** og sorter dem i den ønskede rækkefølge.

**Indspil shoutout:** Klik **● Record** i SHOUT BENCH-panelet. Optag, stop, navngiv og gem — optagelsen konverteres automatisk til WAV.

**Trim shoutout:** Klik **✂** på et shoutout-kort for at åbne trim-modalen. Justér start/slut med sliderne, preview med **▶ Preview**, og gem med **Trim & Save**.

**Importér eksisterende filer:** Læg `.wav`-filer direkte i mappen `shoutouts/` — de dukker op automatisk i SHOUT BENCH ved næste reload.

### Energy Curve

Klik **⚡ Energy** for at se en graf over energiniveauet for sangene i Top 100. Klik **Analyze** for at beregne energy-scores (kræver at sangene er downloadet). Brug grafen til at tjekke at Klub 100 har en god kurve.

### Preview

Klik **▷ Preview** for at høre overgangene mellem sangene (slutningen af en sang → shoutout → starten af næste sang). Brug **⏮ / ⏭** til at navigere mellem overgange.

### Gem

Klik **Save** (eller vent — ændringer i rækkefølgen og starttidspunkter gemmes automatisk til `state.json`).

### Byg Klub 100

Klik **⬇ Make Klub** og konfigurér:

| Felt | Standard | Beskrivelse |
|---|---|---|
| Output name | `klub100` | Filnavn på output |
| Format | `mp3` | `mp3` eller `wav` |
| Song volume (LUFS) | `-14` | Normaliseret lydstyrke for sange |
| Shoutout volume (LUFS) | `-14` | Normaliseret lydstyrke for shoutouts |
| Fade (sekunder) | `3` | Crossfade-varighed mellem segmenter |
| Song length (sekunder) | `60` | Hvor mange sekunder der klippes fra hver sang |

Klik **Start** — et log-vindue viser fremgangen. Når bygningen er færdig, vises et **⬇ Download**-link.

---

## SoundCloud cookies (valgfrit)

Hvis downloads fra SoundCloud fejler, skal du eksportere dine browser-cookies:

```bash
just sc-cookies          # bruger Chrome som standard
just sc-cookies firefox  # eller Firefox
```

Kommandoen gemmer cookies til `sc_cookies.txt` automatisk.

For YouTube-cookies: brug en extension som [Get cookies.txt LOCALLY](https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc) og erstat `cookies.txt` med den downloadede fil.

---

## Mappestruktur

```
club100/
├── app.py              # Flask-backend
├── make_klub.py        # Byggelogik
├── Functions/          # Hjælpefunktioner (download, prepare, energy, …)
├── templates/          # HTML-frontend (index.html)
├── static/             # CSS og JS
├── song_info/          # Metadata per sang (JSON)
├── tracks/             # Downloadede WAV-filer
├── shoutouts/          # Shoutout-lydfiler
├── output/             # Færdige Klub 100-filer
├── state.json          # Aktuel liste- og bench-tilstand
└── shoutout_meta.json  # Shoutout-metadata og rækkefølge
```
