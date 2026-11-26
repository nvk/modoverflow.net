export function createVisualizer(canvas, waveform, audio) {
  const ctx = canvas.getContext('2d');
  const wave = waveform.getContext('2d');
  const motion = document.getElementById('motion');
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let paused = preference.matches;
  let context, analyser, bins;
  let width = 0, height = 0, waveWidth = 0, waveHeight = 0;
  let inView = true, phase = 0, previousFrame = 0, animation = 0, energy = 0;
  const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; schedule(); });
  observer.observe(canvas);

  function connectAudio() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!context) {
        context = new AudioContext();
        analyser = context.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.85;
        context.createMediaElementSource(audio).connect(analyser);
        analyser.connect(context.destination);
        bins = new Uint8Array(analyser.frequencyBinCount);
      }
      if (context.state === 'suspended') context.resume().catch(() => {});
    } catch { /* Native playback remains available without audio analysis. */ }
    schedule();
  }

  function size(target, painter) {
    if (!painter) return [0, 0];
    const box = target.getBoundingClientRect();
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    target.width = Math.round(box.width * scale);
    target.height = Math.round(box.height * scale);
    painter.setTransform(scale, 0, 0, scale, 0, 0);
    return [box.width, box.height];
  }

  function resize() {
    [width, height] = size(canvas, ctx);
    [waveWidth, waveHeight] = size(waveform, wave);
    drawSculpture();
    drawWaveform();
  }

  function drawSculpture() {
    if (!ctx || !width || !height) return;
    ctx.clearRect(0, 0, width, height);
    const small = width < 620;
    const scale = Math.min(width * (small ? 0.27 : 0.235), height * 0.41);
    const yaw = phase * 0.09 + 0.2;
    const tilt = 0.8 + Math.sin(phase * 0.12) * 0.14;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
    const lines = small ? 40 : 58;
    // A family of three-lobed closed curves, projected from 3D. No image assets.
    for (let strand = 0; strand < lines; strand++) {
      const offset = strand / lines * Math.PI * 2;
      const points = [];
      for (let point = 0; point <= 210; point++) {
        const t = point / 210 * Math.PI * 2;
        const r = 1 + (0.32 + energy * 0.11) * Math.cos(3 * t + offset);
        const x = r * Math.cos(2 * t), y = r * Math.sin(2 * t), z = 0.47 * Math.sin(3 * t + offset);
        const rx = x * cy + z * sy;
        const rz = -x * sy + z * cy;
        const ry = y * ct - rz * st;
        const depthAt = y * st + rz * ct;
        const perspective = 3.8 / (3.8 - depthAt);
        points.push([width * 0.5 + rx * scale * perspective, height * 0.49 + ry * scale * perspective]);
      }
      ctx.beginPath();
      points.forEach(([x,y], index) => index ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
      ctx.strokeStyle = `rgba(${179 + Math.round(28 * Math.sin(offset))},${222 + Math.round(22 * Math.cos(offset))},${85 + Math.round(17 * Math.cos(offset))},${0.32 + strand / lines * 0.38})`;
      ctx.lineWidth = small ? 0.65 : 0.72;
      ctx.stroke();
    }
    // Registration marks anchor the moving sculpture to its quiet frame.
    ctx.strokeStyle = '#515b3d';
    ctx.lineWidth = 0.7;
    for (const x of [width * 0.25, width * 0.75]) {
      const y = height * 0.5;
      ctx.beginPath();ctx.moveTo(x - 4, y);ctx.lineTo(x + 4, y);ctx.moveTo(x, y - 4);ctx.lineTo(x, y + 4);ctx.stroke();
    }
  }

  function drawWaveform() {
    if (!wave || !waveWidth) return;
    wave.clearRect(0, 0, waveWidth, waveHeight);
    const bars = Math.floor(waveWidth / 5);
    const progress = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.currentTime / audio.duration : 0;
    for (let i = 0; i < bars; i++) {
      const active = analyser && !audio.paused && !paused;
      // Idle marks are a progress texture, not a claimed waveform of a recording.
      const amplitude = active ? (bins[Math.floor(i / bars * bins.length)] / 255) : (0.1 + Math.abs(Math.sin(i * 1.73) * Math.sin(i * 0.23)) * 0.4);
      const barHeight = Math.max(2, amplitude * (waveHeight - 4));
      wave.fillStyle = i / bars <= progress && audio.currentSrc ? '#c5f467' : '#3d4631';
      wave.fillRect(i * 5, (waveHeight - barHeight) / 2, 2, barHeight);
    }
  }

  function frame(timestamp) {
    animation = 0;
    if (document.hidden || paused) return;
    if (timestamp - previousFrame < 33) { schedule(); return; }
    const elapsed = Math.min((timestamp - previousFrame) / 1000, 0.06);
    previousFrame = timestamp;
    if (analyser && !audio.paused) {
      analyser.getByteFrequencyData(bins);
      energy = bins.slice(0, 24).reduce((sum, value) => sum + value, 0) / (24 * 255);
    } else energy *= 0.95;
    phase += elapsed * (0.5 + energy * 0.6);
    if (inView) drawSculpture();
    if (!audio.paused) drawWaveform();
    schedule();
  }

  function schedule() {
    if (!animation && !paused && !document.hidden && (inView || !audio.paused)) animation = requestAnimationFrame(frame);
  }

  function updateMotion() {
    motion.setAttribute('aria-pressed', String(paused));
    motion.textContent = paused ? 'Resume motion ↻' : 'Pause motion Ⅱ';
    document.body.classList.toggle('motion-paused', paused);
    if (paused) { cancelAnimationFrame(animation); animation = 0; drawSculpture(); drawWaveform(); }
    else schedule();
  }
  motion.addEventListener('click', () => { paused = !paused; updateMotion(); });
  preference.addEventListener('change', (event) => { paused = event.matches; updateMotion(); });
  document.addEventListener('visibilitychange', schedule);
  audio.addEventListener('play', schedule);
  audio.addEventListener('pause', drawWaveform);
  new ResizeObserver(resize).observe(canvas.parentElement);
  new ResizeObserver(resize).observe(waveform.parentElement);
  updateMotion();
  resize();
  schedule();
  return { connectAudio, drawWaveform };
}
