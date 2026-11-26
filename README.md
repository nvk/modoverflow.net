# MODOVERFLOW

[modoverflow.net](https://modoverflow.net) — the music site for MODOVERFLOW.

Static HTML, CSS, and JavaScript in `docs/`. GitHub Pages serves `master`, `/docs`.
There is no production dependency or build step. Fonts are self-hosted; their
licenses are in `docs/assets/fonts/`. The wire sculpture is drawn on canvas and
reacts to the playing audio. There are no analytics, third-party scripts, or uploads.

## Add music

1. Put web-ready MP3, M4A, Ogg, or WAV files in `docs/music/`.
2. Add entries to `docs/tracks.json`, in playback order:

```json
[
  {
    "title": "Your track title",
    "src": "music/your-track.mp3",
    "detail": "Release name · 2026",
    "duration": 237
  }
]
```

`title` and `src` are required. `detail` and `duration` (seconds) are optional.
The player reads the actual duration when a track loads. Commit and push to
`master` to publish. Only add recordings intended for public release.

For audio hosted elsewhere, use a direct HTTPS audio URL; that host must send
an `Access-Control-Allow-Origin` header allowing this site (or `*`). A streaming
service's web page URL is not a playable audio file. Keep individual Git files
under GitHub's 100 MB limit; compressed audio is preferable to large masters.

An empty catalog shows the coming-soon state. Visitors can open local audio
files to try the player; those files are never uploaded or saved by the site.
Local files are added to the current session and cleared on reload.

## Preview and check

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory docs
```

Open `http://127.0.0.1:4173`. Test tooling is optional for editing the site:

```sh
npm ci
npx playwright install chromium
npm test
```

The browser tests exercise real audio decoding/playback, seeking, queue advance,
repeat and volume controls, failure recovery, keyboard handling, responsive
layouts, and reduced motion. Generated audio fixtures exist only in tests.
The manual **Browser checks** GitHub Actions workflow runs the same checks and
captures desktop/mobile screenshots. It can also run when the local environment
does not permit browser processes. No workflow runs on every content edit.

## Player controls

- Space: play / pause.
- Left / right: seek five seconds.
- M: mute / unmute.
- Standard keyboard behavior is preserved when a button, link, or slider is focused.
- Track repeat, previous / next, native Media Session controls, and a motion
  pause switch are available. Reduced-motion preferences start the sculpture still.

The custom domain is recorded in `docs/CNAME`. Enable HTTPS enforcement in the
repository's Pages settings after GitHub provisions its certificate.
