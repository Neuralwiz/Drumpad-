# PULSE — Finger Drumming PWA

Touch-optimerad, mobile-first jungle-padd för iOS Safari och Android Chrome. Ren HTML/CSS/JS + Web Audio API, installerbar som Progressive Web App. Default-kitet är oldschool jungle: amen-breaks plus ~30-sekunders pads på 8 knappar.

## Kör lokalt

Web Audio och file import kräver en lokal server (inte `file://`).

```bash
# Python
python3 -m http.server 4173

# eller Node
npx --yes serve -l 4173
```

Öppna `http://localhost:4173` i telefonen (samma Wi-Fi) eller i Chrome DevTools device mode.

1. Tryck **START SESSION** (iOS kräver en gest innan ljudet låses upp).
2. Starter kits syntetiseras i webbläsaren. Default är **94 Amen** (8 knappar): Amen, Chop, Fill, Ride plus Reese/Warm/Choir/Hornet-pads på ~30 sekunder. Övriga kits: Neon Trap, Boom Bap, Techno, Acoustic.
3. På iPhone: Dela → **Lägg till på hemskärmen**. På Android: Chrome-menyn → **Installera app**.

## Deploy

Statiska filer — ingen backend.

### Netlify

```bash
npm i -g netlify-cli
netlify deploy --prod --dir .
```

Eller dra mappen till [app.netlify.com/drop](https://app.netlify.com/drop). `netlify.toml` sätter rätt headers.

### Vercel

```bash
npx vercel --yes
```

### GitHub Pages

Settings → Pages → Deploy from branch `main` / root. Repo-namn med trailing slash fungerar eftersom assets är relativa (`./css/app.css`).

HTTPS krävs för PWA, vibration och Web Share.

## Loopmasters-packs

Loopmasters har **inget öppet tredjeparts-API** för att logga in och dra samples till en annan app. Att skicka dina kontouppgifter via en inbäddad login vore osäkert och mot deras villkor. PULSE använder därför **Import Pack**:

1. Logga in på [loopmasters.com](https://www.loopmasters.com) i en vanlig webbläsare.
2. Ladda ner pack som `.zip` (eller enskilda `.wav` / `.mp3`).
3. I PULSE: **↓** → släpp zippen eller välj filer.
4. Appen auto-mappar filnamn till pads: Kick/808, Snare, Clap, Closed/Open hat, Perc, Toms, Crash/Ride, FX, Loops.

Tips för bättre mapping: behåll beskrivande namn (`Kick_808.wav`, `OHH_Room.wav`). Importerade kits sparas i sessionen (minnet). För att behålla dem: lämna fliken öppen eller exportera ditt beat som WAV.

## Spelkontroller

| Gest | Funktion |
| --- | --- |
| Multi-touch på pads | Upp till 8+ simultana slag, velocity via tryck/yta |
| Håll pad | Loop medan du håller (one-shots) |
| Loop-pads | Tap för latch on/off |
| ROLL (⟳) + håll | 16th/32nd-rolls |
| Svep vänster/höger | Byt scene A–D |
| REC + PLAY | Pattern med overdub |
| TAP | Tap tempo |
| ✎ | Pad-inspector (ADSR, filter, sends, choke) |
| ⇧ | Exportera WAV / system share (IG/TikTok) |
| QWERTY `1–4 qwer asdf zxcv` | Desktop-pads, Space = play/stop |

## Ljudmotor

- `AudioContext({ latencyHint: "interactive" })` och röstpool (32 voices)
- Per pad: sample, ADSR, LP/HP-filter kopplat till velocity, pitch, reverb/delay send
- Globalt: convolution-reverb, syncad delay, compressor, kick-sidechain
- Quantize on/off + strength, swing, metronom (ljud + LED + 16-stegs playhead)
- Choke-grupper (hats / cymbals)
- Scener A–D med egna patterns, kopiera/ångra, IndexedDB så importerade packs överlever reload

Latens beror på OS. Sikta på iOS 16+ / aktuell Chrome. Settings-panelen visar uppmätt output latency och latency compensation.

## Struktur

```
index.html
manifest.webmanifest
sw.js
css/app.css
js/audio-engine.js
js/synth-kits.js
js/importer.js
js/app.js
icons/
```
