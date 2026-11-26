import { test, expect } from '@playwright/test';

// A quiet, generated tone exercises actual browser audio decoding and playback.
// It is only test data, never included in the published site.
function wav(seconds = 30) {
  const rate = 8000;
  const count = rate * seconds;
  const buffer = Buffer.alloc(44 + count * 2);
  buffer.write('RIFF');buffer.writeUInt32LE(buffer.length - 8, 4);buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);buffer.writeUInt16LE(1, 20);buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);buffer.writeUInt32LE(rate * 2, 28);buffer.writeUInt16LE(2, 32);buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);buffer.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) buffer.writeInt16LE(Math.round(Math.sin(i / rate * Math.PI * 440 * 2) * 900), 44 + i * 2);
  return buffer;
}
const tone = wav();
const file = (name) => ({ name, mimeType: 'audio/wav', buffer: tone });
async function emptyCatalog(page) {
  await page.route('**/tracks.json', (route) => route.fulfill({ json: [] }));
}
async function localTracks(page) {
  await page.locator('#file-input').setInputFiles([file('Night_signal.wav'), file('After_hours.wav')]);
  await expect(page.locator('#duration')).toHaveText('0:30');
}
async function assertNoOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}
async function catalog(page) {
  await page.route('**/tracks.json', (route) => route.fulfill({ json: [
    { title: 'Catalog test one', src: 'music/one.wav', detail: 'Test release', duration: 1 },
    { title: 'Catalog test two', src: 'music/two.wav', duration: 1 },
  ] }));
  await page.route('**/music/*.wav', (route) => route.fulfill({ contentType: 'audio/wav', body: wav(1) }));
}

test('empty release state, local assets, desktop composition', async ({ page }, testInfo) => {
  const errors = [], external = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => { if (!request.url().startsWith('http://127.0.0.1:4173/')) external.push(request.url()); });
  await emptyCatalog(page);
  await page.goto('/');
  await expect(page.locator('#empty-queue')).toBeVisible();
  await expect(page.locator('#play')).toBeDisabled();
  await expect(page.locator('#track-count')).toHaveText('00');
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('button', { name: 'Pause motion' }).click();
  await assertNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.addStyleTag({ content: '.site-header,.hero-bottom,.motion-control{display:none}.hero{padding-top:40px}.signal-stage{height:350px;margin-top:8px}' });
  await page.screenshot({ path: testInfo.outputPath('social.png') });
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('local audio: play, pause, seek, volume, mute, repeat, queue and keyboard', async ({ page }) => {
  await emptyCatalog(page);
  await page.goto('/');
  await localTracks(page);
  await expect(page.locator('#track-count')).toHaveText('02');
  await expect(page.locator('#track-title')).toHaveText('Night signal');
  expect(await page.locator('#audio').evaluate((audio) => audio.paused)).toBe(true);
  await page.locator('#play').click();
  await expect.poll(() => page.locator('#audio').evaluate((audio) => audio.currentTime)).toBeGreaterThan(0);
  await expect(page.locator('#play')).toHaveAttribute('aria-label', 'Pause');
  await page.locator('#play').click();
  await page.locator('#seek').fill('500');
  await expect.poll(() => page.locator('#audio').evaluate((audio) => audio.currentTime)).toBeCloseTo(15, 0);
  await page.locator('#volume').fill('20');
  expect(await page.locator('#audio').evaluate((audio) => audio.volume)).toBe(0.2);
  await page.locator('#mute').click();
  expect(await page.locator('#audio').evaluate((audio) => audio.muted)).toBe(true);
  await page.locator('#mute').click();
  await page.locator('#repeat').click();
  expect(await page.locator('#audio').evaluate((audio) => audio.loop)).toBe(true);
  await page.locator('#repeat').click();
  await page.locator('#next').click();
  await expect(page.locator('#track-title')).toHaveText('After hours');
  await page.locator('#previous').click();
  await expect(page.locator('#track-title')).toHaveText('Night signal');
  await page.locator('#play').click();
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('Space');
  await expect(page.locator('#play')).toHaveAttribute('aria-label', 'Pause');
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  expect(await page.locator('#audio').evaluate((audio) => audio.currentTime)).toBeGreaterThanOrEqual(5);
  await page.keyboard.press('m');
  expect(await page.locator('#audio').evaluate((audio) => audio.muted)).toBe(true);
  await page.locator('#seek').focus();
  const before = Number(await page.locator('#seek').inputValue());
  await page.keyboard.press('ArrowRight');
  expect(Number(await page.locator('#seek').inputValue())).toBeLessThan(before + 10);
});

test('published catalog, automatic next track and end of queue', async ({ page }) => {
  await catalog(page);
  await page.goto('/');
  await expect(page.locator('#track-title')).toHaveText('Catalog test one');
  await expect(page.locator('#queue-note')).toBeHidden();
  await expect(page.locator('#duration')).toHaveText('0:01');
  await page.locator('#play').click();
  // Let real short recordings finish naturally, without mocked HTTP range seeks.
  await expect(page.locator('#track-title')).toHaveText('Catalog test two');
  await expect(page.locator('#play')).toHaveAttribute('aria-label', 'Pause');
  await expect(page.locator('#player-state')).toHaveText('END OF QUEUE');
  await expect(page.locator('#play')).toHaveAttribute('aria-label', 'Play');
});

test('broken audio reports failure and another file recovers', async ({ page }) => {
  await page.route('**/tracks.json', (route) => route.fulfill({ json: [{ title: 'Missing track', src: 'music/missing.mp3' }] }));
  await page.route('**/music/missing.mp3', (route) => route.fulfill({ status: 404, body: 'Missing' }));
  await page.goto('/');
  await expect(page.locator('#player-error')).toBeVisible();
  await localTracks(page);
  await page.locator('#play').click();
  await expect(page.locator('#play')).toHaveAttribute('aria-label', 'Pause');
  await expect(page.locator('#player-error')).toBeHidden();
});

test('catalog failure and invalid local files remain recoverable', async ({ page }) => {
  await page.route('**/tracks.json', (route) => route.fulfill({ status: 500, body: 'Unavailable' }));
  await page.goto('/');
  await expect(page.locator('#player-error')).toContainText('track list could not be loaded');
  await page.locator('#file-input').setInputFiles({ name: 'readme.txt', mimeType: 'text/plain', buffer: Buffer.from('Not audio') });
  await expect(page.locator('#player-error')).toContainText('Choose an audio file');
  await localTracks(page);
  await expect(page.locator('#player-error')).toBeHidden();
});

test('mobile layout and player at 390px and 320px', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await emptyCatalog(page);
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('button', { name: 'Pause motion' }).click();
  await assertNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true });
  await localTracks(page);
  await page.locator('#play').click();
  await expect(page.locator('#play')).toHaveAttribute('aria-label', 'Pause');
  await page.setViewportSize({ width: 320, height: 740 });
  await assertNoOverflow(page);
  await page.locator('.deck').screenshot({ path: testInfo.outputPath('mobile-player.png') });
});

test('reduced motion starts still and permits explicit opt-in', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('#motion')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#motion')).toContainText('Resume motion');
  await page.locator('#motion').click();
  await expect(page.locator('#motion')).toHaveAttribute('aria-pressed', 'false');
});


test('release catalog loads and plays its packaged audio', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const response = await page.request.get('/tracks.json');
  expect(response.ok()).toBe(true);
  const [track] = await response.json();
  expect(track).toBeTruthy();
  await page.goto('/');
  await expect(page.locator('#empty-queue')).toBeHidden();
  await expect(page.locator('#track-title')).toHaveText(track.title);
  await expect(page.locator('#queue-note')).toBeHidden();
  await expect.poll(() => page.locator('#audio').evaluate((audio) => audio.duration)).toBeGreaterThan(0);
  const duration = await page.locator('#audio').evaluate((audio) => audio.duration);
  expect(Math.abs(duration - track.duration)).toBeLessThan(0.2);
  await page.locator('#play').click();
  await expect.poll(() => page.locator('#audio').evaluate((audio) => audio.currentTime)).toBeGreaterThan(0.1);
  await expect(page.locator('#play')).toHaveAttribute('aria-label', 'Pause');
  await page.locator('#play').click();
  await page.locator('#seek').fill('500');
  await expect.poll(() => page.locator('#audio').evaluate((audio) => audio.currentTime)).toBeCloseTo(duration / 2, 0);
  await expect(page.locator('#player-error')).toBeHidden();
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('button', { name: 'Pause motion' }).click();
  await assertNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('release-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await assertNoOverflow(page);
  await page.locator('.deck').screenshot({ path: testInfo.outputPath('release-mobile.png') });
  await page.setViewportSize({ width: 320, height: 740 });
  await assertNoOverflow(page);
  expect(errors).toEqual([]);
});
