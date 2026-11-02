// Isolated development integration: synthetic oscillators, no physical capture or cloud calls.
const { app, BrowserWindow, ipcMain, session } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')
const root = path.resolve(__dirname, '..')
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'delive-recording-ui-'))
app.setPath('userData', profile)
const { registerRecordingIpc } = require('../dist-electron/electron/recordingIpc')
const { registerTrustedWindow } = require('../dist-electron/electron/ipcSecurity')
const { registerSafeStorageIpc } = require('../dist-electron/electron/safeStorageIpc')
registerRecordingIpc(ipcMain)
registerSafeStorageIpc(ipcMain)
for (const [name, result] of Object.entries({ 'get-app-version': '2.3.0-beta.2', 'window-is-maximized': false, 'get-auto-launch': false, 'get-proxy-port': 0, 'lang:change': null, 'caption-update-style': null, 'caption-clear': null, 'caption-get-status': {visible:false}, 'caption-update-text': null, 'check-for-updates': null })) ipcMain.handle(name, () => result)
let win
let failed = false
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function run() {
  await app.whenReady()
  // Block every network request. The compiled UI and audio worklet load from file: only.
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^https?:|^wss?:/.test(details.url) }))
  win = new BrowserWindow({ width: 1280, height: 1000, show: false, webPreferences: { preload: path.join(root, 'dist-electron/electron/preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } })
  win.webContents.on('console-message', (event, level, message) => console.log('[renderer]', event.message || message))
  registerTrustedWindow(() => win)
  await win.loadFile(path.join(root, 'frontend/dist/index.html'))
  const js = source => win.webContents.executeJavaScript(source, true)
  for (let i = 0; i < 100; i++) {
    if (await js("Boolean(document.querySelector('[aria-label=\"录音来源与原音存储\"]'))")) break
    await delay(100)
  }
  await js("[...document.querySelectorAll('button')].find(e => e.textContent.trim() === '知道了')?.click()")
  if (process.argv.includes('--visual-only')) {
    win.showInactive()
    await js("[...document.querySelectorAll('button')].find(e => e.textContent.includes('原音存储与恢复')).click()")
    await js("document.querySelector('[aria-label=\"录音来源与原音存储\"]').scrollIntoView({block:'center'})")
    await delay(500)
    fs.writeFileSync(path.join(root, 'tmp/evidence/682-ui-visible.png'), (await win.webContents.capturePage()).toPNG())
    console.log('Visual capture only; no audio or cloud calls.')
    return
  }
  await js(`window.syntheticContexts = []; window.syntheticTracks = [];
    async function synthetic(hz) {
      const ctx = new AudioContext({sampleRate:48000});
      const osc = ctx.createOscillator(); osc.frequency.value = hz;
      const gain = ctx.createGain(); gain.gain.value = 0.2;
      const dst = ctx.createMediaStreamDestination();
      osc.connect(gain).connect(dst); osc.start(); await ctx.resume();
      window.syntheticContexts.push(ctx); window.syntheticTracks.push(dst.stream.getAudioTracks()[0]);
      return dst.stream;
    }
    navigator.mediaDevices.getDisplayMedia = () => synthetic(440);
    navigator.mediaDevices.getUserMedia = () => synthetic(880);
    const label = [...document.querySelectorAll('label')].find(e => e.textContent.includes('仅录音'));
    if (!label) throw new Error('local-only control missing');
    label.querySelector('input').click();
  `)
  await delay(100)
  await js(`const start = [...document.querySelectorAll('button')].find(e => e.textContent.includes('开始录制')); if (!start) throw new Error('start missing'); start.click()`)
  await delay(2300)
  let list = await js('window.electronAPI.recording.list()')
  assert.equal(list.length, 1); assert.equal(list[0].status, 'recording')
  assert(list[0].blocks.length >= 1, 'incremental persistence while recording')
  // End only one source: the system track and local archive must keep running.
  await js("window.syntheticTracks[1].dispatchEvent(new Event('ended'))")
  await delay(600)
  assert(await js("document.body.textContent.includes('来源已结束')"))
  // Exercise actual device-change handler and graph recreation with a visible gap.
  await js("navigator.mediaDevices.dispatchEvent(new Event('devicechange'))")
  await delay(2100)
  await js(`const stop = [...document.querySelectorAll('button')].find(e => e.textContent.includes('停止录制')); if (!stop) throw new Error('stop missing'); stop.click()`)
  await delay(1200)
  list = await js('window.electronAPI.recording.list()')
  assert.equal(list[0].status, 'completed')
  assert(list[0].durationMs > 3500)
  assert(list[0].blocks.every(b => b.tracks.length === 3))
  assert(list[0].events.some(e => e.message === 'microphone: ended'))
  await js("[...document.querySelectorAll('button')].find(e => e.textContent.includes('原音存储与恢复')).click()")
  await delay(200)
  fs.mkdirSync(path.join(root, 'tmp/evidence'), { recursive: true })
  await js("document.querySelector('[aria-label=\"录音来源与原音存储\"]').scrollIntoView({block:'center'})")
  await delay(100)
  fs.writeFileSync(path.join(root, 'tmp/evidence/682-ui.png'), (await win.webContents.capturePage()).toPNG())
  const audio = await js(`window.electronAPI.recording.readBlock('${list[0].sessionId}',0,'mix')`)
  assert.equal(Buffer.from(audio).toString('ascii', 0, 4), 'RIFF')
  // Missing ASR configuration must leave the physical recording lifecycle independent.
  await js("[...document.querySelectorAll('label')].find(e => e.textContent.includes('仅录音')).querySelector('input').click()")
  await delay(100)
  await js("[...document.querySelectorAll('button')].find(e => e.textContent.includes('开始录制')).click()")
  await delay(1600)
  const withoutKey = await js('window.electronAPI.recording.list()')
  assert(withoutKey.some(a => a.status === 'recording' && a.blocks.length > 0))
  assert(await js("document.body.textContent.includes('转写未连接')"))
  await js("[...document.querySelectorAll('button')].find(e => e.textContent.includes('停止录制')).click()")
  await delay(700)
  // A quota smaller than already-used storage must stop before the next committed block.
  await js("window.electronAPI.recording.configure(1)")
  await js("[...document.querySelectorAll('button')].find(e => e.textContent.includes('开始录制')).click()")
  await delay(2200)
  const quotaResult = await js('window.electronAPI.recording.list()')
  assert(quotaResult.some(a => a.status === 'interrupted'))
  assert(!quotaResult.some(a => a.status === 'recording'))
  assert(await js("document.body.textContent.includes('配额')"))
  await js("window.electronAPI.recording.configure(0)")
  await js("[...document.querySelectorAll('button')].find(e => e.textContent.includes('开始录制')).click()")
  await delay(1500)
  const beforeCrash = (await js('window.electronAPI.recording.list()')).find(a => a.status === 'recording')
  assert(beforeCrash && beforeCrash.blocks.length > 0)
  win.webContents.forcefullyCrashRenderer()
  await delay(300)
  await win.reload()
  await delay(800)
  const reopened = await js('window.electronAPI.recording.list()')
  assert(reopened.some(a => a.sessionId === list[0].sessionId && a.status === 'completed'))
  assert(reopened.some(a => a.sessionId === beforeCrash.sessionId && a.status === 'interrupted' && a.blocks.length > 0))
  console.log(JSON.stringify({ status: 'PASS', machine: os.hostname(), electron: process.versions.electron, source: 'synthetic 440/880 Hz oscillators; mediaDevices test doubles; network denied', blocks: list[0].blocks.length, durationMs: list[0].durationMs, checks: ['local-only UI', 'dual-source WAV persistence', 'source ended', 'device change', 'stop flush', 'reload', 'ASR unavailable', 'quota failure', 'renderer crash recovery', 'no network'] }, null, 2))
}
run().catch(error => { failed = true; console.error(error) }).finally(() => {
  win?.destroy()
  fs.rmSync(profile, { recursive: true, force: true })
  app.exit(failed ? 1 : 0)
})
setTimeout(() => { console.error('Integration timeout'); app.exit(1) }, 30000).unref()
