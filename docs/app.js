import { createVisualizer } from './visualizer.js';

const $ = (id) => document.getElementById(id);
const audio = $('audio');
const queue = [];
const localURLs = new Set();
const visualizer = createVisualizer($('signal'), $('waveform'), audio);
let current = -1;
let selection = 0;
let previousVolume = 0.75;
let pendingPlay = false;
const time = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '—:—';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
};
const announce = (message) => { $('announcement').textContent = message; };
const showError = (message = '') => {
  $('player-error').textContent = message;
  $('player-error').hidden = !message;
};

function syncPlayback() {
  const playing = !audio.paused && !audio.ended;
  document.body.classList.toggle('is-playing', playing);
  $('play').setAttribute('aria-label', playing ? 'Pause' : 'Play');
  if (current >= 0) $('player-state').textContent = playing ? 'NOW PLAYING' : 'READY TO PLAY';
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  queue.forEach((track, index) => {
    const row = $('queue').children[index]?.querySelector('button');
    if (!row) return;
    row.setAttribute('aria-current', String(index === current));
    row.setAttribute('aria-label', `${playing && index === current ? 'Pause' : 'Play'} ${track.title}`);
    row.querySelector('.track-number').textContent = index === current && playing ? 'Ⅱ' : String(index + 1).padStart(2, '0');
  });
}

function updatePosition() {
  const duration = audio.duration;
  const valid = Number.isFinite(duration) && duration > 0;
  $('seek').disabled = !valid;
  $('seek').value = valid ? String(Math.round(audio.currentTime / duration * 1000)) : '0';
  $('seek').setAttribute('aria-valuetext', `${time(audio.currentTime)} of ${time(duration)}`);
  $('elapsed').textContent = time(audio.currentTime);
  $('duration').textContent = time(duration);
  if (valid && 'mediaSession' in navigator && navigator.mediaSession.setPositionState) {
    try { navigator.mediaSession.setPositionState({ duration, playbackRate: audio.playbackRate, position: Math.min(audio.currentTime, duration) }); } catch { /* Optional OS integration. */ }
  }
  visualizer.drawWaveform();
}

function renderQueue() {
  $('queue').replaceChildren();
  queue.forEach((track, index) => {
    const li = document.createElement('li');
    li.className = 'track-row';
    const button = document.createElement('button');
    button.className = 'track-button';
    button.type = 'button';
    const number = document.createElement('span');
    number.className = 'track-number';
    number.setAttribute('aria-hidden', 'true');
    const description = document.createElement('span');
    const title = document.createElement('span');
    title.className = 'track-name';
    title.textContent = track.title;
    const detail = document.createElement('span');
    detail.className = 'track-meta';
    detail.textContent = track.local ? 'Local file' : track.detail || '';
    description.append(title, detail);
    const duration = document.createElement('span');
    duration.className = 'track-time';
    duration.textContent = time(track.duration);
    button.append(number, description, duration);
    button.addEventListener('click', () => {
      if (current === index) togglePlay();
      else selectTrack(index, true);
    });
    li.append(button);
    $('queue').append(li);
  });
  $('empty-queue').hidden = queue.length > 0;
  $('track-count').textContent = String(queue.length).padStart(2, '0');
  $('queue-note').hidden = !queue.some((track) => track.local);
  $('previous').disabled = queue.length < 2;
  $('next').disabled = queue.length < 2;
  syncPlayback();
}

async function playCurrent() {
  if (current < 0 || pendingPlay) return;
  const attempt = selection;
  pendingPlay = true;
  showError();
  $('player-state').textContent = 'LOADING';
  // Both calls start in the user's gesture, including on mobile Safari.
  visualizer.connectAudio();
  try {
    await audio.play();
    if (attempt === selection) syncPlayback();
  } catch (error) {
    if (attempt !== selection || error.name === 'AbortError') return;
    syncPlayback();
    $('player-state').textContent = 'PLAYBACK STOPPED';
    showError(error.name === 'NotAllowedError'
      ? 'Playback was blocked by your browser. Press play to try again.'
      : 'This track could not be played. Try another track or an MP3, M4A, or WAV file.');
  } finally {
    if (attempt === selection) pendingPlay = false;
  }
}

function togglePlay() {
  if (current < 0) return;
  if (!audio.paused || pendingPlay) {
    pendingPlay = false;
    audio.pause();
    syncPlayback();
  } else playCurrent();
}

function selectTrack(index, autoplay = false) {
  if (!queue[index]) return;
  selection += 1;
  pendingPlay = false;
  audio.pause();
  current = index;
  const track = queue[index];
  showError();
  $('track-title').textContent = track.title;
  $('track-detail').textContent = track.local ? 'Local file' : track.detail || '';
  const artwork = $('track-artwork');
  artwork.hidden = !track.artwork;
  artwork.parentElement.classList.toggle('has-artwork', Boolean(track.artwork));
  artwork.onerror = () => {
    artwork.hidden = true;
    artwork.parentElement.classList.remove('has-artwork');
  };
  if (track.artwork) artwork.src = track.artwork;
  else artwork.removeAttribute('src');
  $('player-state').textContent = 'READY TO PLAY';
  $('play').disabled = false;
  $('repeat').disabled = false;
  // Remote audio hosts must allow CORS for the audio-reactive visualization.
  audio.crossOrigin = 'anonymous';
  audio.src = track.src;
  audio.load();
  updatePosition();
  syncPlayback();
  if ('mediaSession' in navigator && 'MediaMetadata' in window) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.local ? '' : 'modoverflow.net', artwork: track.artwork ? [{ src: track.artwork }] : [] });
  }
  announce(`${track.title} selected`);
  if (autoplay) playCurrent();
}

function stepTrack(direction) {
  if (queue.length < 2) return;
  if (direction < 0 && audio.currentTime > 3) {
    seekTo(0);
    return;
  }
  selectTrack((current + direction + queue.length) % queue.length, true);
}

function seekTo(position) {
  if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
  audio.currentTime = Math.min(Math.max(position, 0), audio.duration);
  updatePosition();
}

function syncVolume() {
  $('volume').value = String(Math.round((audio.muted ? 0 : audio.volume) * 100));
  const silent = audio.muted || audio.volume === 0;
  $('mute').setAttribute('aria-pressed', String(silent));
  $('mute').setAttribute('aria-label', silent ? 'Unmute' : 'Mute');
}

function toggleMute() {
  if (audio.volume === 0) {
    audio.volume = previousVolume || 0.75;
    audio.muted = false;
  } else audio.muted = !audio.muted;
  syncVolume();
}

$('play').addEventListener('click', togglePlay);
$('previous').addEventListener('click', () => stepTrack(-1));
$('next').addEventListener('click', () => stepTrack(1));
$('repeat').addEventListener('click', () => {
  audio.loop = !audio.loop;
  $('repeat').setAttribute('aria-pressed', String(audio.loop));
  announce(audio.loop ? 'Repeat on' : 'Repeat off');
});
$('seek').addEventListener('input', () => seekTo(Number($('seek').value) / 1000 * audio.duration));
$('volume').addEventListener('input', () => {
  const volume = Number($('volume').value) / 100;
  if (volume > 0) previousVolume = volume;
  audio.volume = volume;
  audio.muted = false;
  syncVolume();
});
$('mute').addEventListener('click', toggleMute);
$('open-files').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', (event) => {
  const files = Array.from(event.target.files || []);
  const accepted = files.filter((file) => file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac|opus)$/i.test(file.name));
  if (!accepted.length) {
    if (files.length) showError('Choose an audio file such as MP3, M4A, or WAV.');
    event.target.value = '';
    return;
  }
  const firstNew = queue.length;
  for (const file of accepted) {
    const src = URL.createObjectURL(file);
    localURLs.add(src);
    queue.push({ title: file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' '), src, local: true });
  }
  renderQueue();
  selectTrack(firstNew, false);
  // File selection loads the track; the visible play control starts audio.
  $('play').focus({ preventScroll: true });
  announce(`${accepted.length} ${accepted.length === 1 ? 'track' : 'tracks'} added. Ready to play.`);
  if (accepted.length < files.length) showError('Some files were skipped because they were not audio files.');
  event.target.value = '';
});

audio.volume = previousVolume;
audio.addEventListener('volumechange', syncVolume);
audio.addEventListener('play', syncPlayback);
audio.addEventListener('pause', syncPlayback);
audio.addEventListener('playing', syncPlayback);
audio.addEventListener('waiting', () => {
  if (!audio.paused) $('player-state').textContent = 'BUFFERING';
});
audio.addEventListener('timeupdate', updatePosition);
audio.addEventListener('durationchange', updatePosition);
audio.addEventListener('loadedmetadata', () => {
  updatePosition();
  if (queue[current]) {
    queue[current].duration = audio.duration;
    const label = $('queue').children[current]?.querySelector('.track-time');
    if (label) label.textContent = time(audio.duration);
  }
});
audio.addEventListener('error', () => {
  if (current < 0) return;
  pendingPlay = false;
  syncPlayback();
  $('player-state').textContent = 'TRACK UNAVAILABLE';
  $('seek').disabled = true;
  showError('This track could not be loaded. Try another track or an MP3, M4A, or WAV file.');
});
audio.addEventListener('ended', () => {
  if (current + 1 < queue.length) selectTrack(current + 1, true);
  else {
    syncPlayback();
    $('player-state').textContent = 'END OF QUEUE';
    announce('End of queue');
  }
});

document.addEventListener('keydown', (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (event.target.closest('input,textarea,select,button,a,[contenteditable="true"]')) return;
  if (event.code === 'Space' && current >= 0) { event.preventDefault(); togglePlay(); }
  if (event.key.toLowerCase() === 'm') toggleMute();
  if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && current >= 0) {
    event.preventDefault();
    seekTo(audio.currentTime + (event.key === 'ArrowRight' ? 5 : -5));
  }
});

if ('mediaSession' in navigator) {
  const actions = { play: playCurrent, pause: () => audio.pause(), previoustrack: () => stepTrack(-1), nexttrack: () => stepTrack(1), seekbackward: (details) => seekTo(audio.currentTime - (details.seekOffset || 10)), seekforward: (details) => seekTo(audio.currentTime + (details.seekOffset || 10)), seekto: (details) => seekTo(details.seekTime) };
  for (const [action, handler] of Object.entries(actions)) {
    try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* Browser does not support this action. */ }
  }
}

$('year').textContent = String(new Date().getFullYear());
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) localURLs.forEach((url) => URL.revokeObjectURL(url));
});

async function loadCatalog() {
  try {
    const response = await fetch('tracks.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('Catalog unavailable');
    const tracks = await response.json();
    if (!Array.isArray(tracks)) throw new Error('Invalid catalog');
    const validated = tracks.map((track) => {
      if (!track || typeof track.title !== 'string' || !track.title.trim() || typeof track.src !== 'string' || !track.src.trim()) throw new Error('Invalid track');
      const url = new URL(track.src, document.baseURI);
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Unsupported audio URL');
      let artwork;
      if (typeof track.artwork === 'string' && track.artwork.trim()) {
        try {
          const imageURL = new URL(track.artwork, document.baseURI);
          if (['https:', 'http:'].includes(imageURL.protocol)) artwork = imageURL.href;
        } catch { /* Optional artwork must not prevent audio playback. */ }
      }
      return { title: track.title, src: url.href, artwork, detail: typeof track.detail === 'string' ? track.detail : '', duration: typeof track.duration === 'number' ? track.duration : undefined };
    });
    queue.push(...validated);
    renderQueue();
    if (current < 0 && queue.length) selectTrack(0);
  } catch {
    showError('The track list could not be loaded. Reload the page or open a local audio file.');
    if (current < 0) $('player-state').textContent = 'CATALOG UNAVAILABLE';
  }
}

loadCatalog();
