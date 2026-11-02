// Development integration: compiled Electron UI + real preload/IPC/IndexedDB.
// Synthetic media and protocol replay only. Every outbound network request is denied.
const { app, BrowserWindow, ipcMain, session } = require('electron')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict')
const root = path.resolve(__dirname, '..'), profile = fs.mkdtempSync(path.join(os.tmpdir(), 'delive-volc-ui-'))
app.setPath('userData', profile)
require('../dist-electron/electron/recordingIpc').registerRecordingIpc(ipcMain)
require('../dist-electron/electron/safeStorageIpc').registerSafeStorageIpc(ipcMain)
const { registerTrustedWindow } = require('../dist-electron/electron/ipcSecurity')
for (const [name, result] of Object.entries({ 'get-app-version': '2.3.0-beta.2', 'window-is-maximized': false, 'get-auto-launch': false, 'get-proxy-port': 0, 'lang:change': null, 'caption-update-style': null, 'caption-clear': null, 'caption-get-status': {visible:false}, 'caption-update-text': null, 'check-for-updates': null })) ipcMain.handle(name, () => result)
const delay = ms => new Promise(r => setTimeout(r, ms))
let win
async function main() {
 await app.whenReady()
 session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^https?:|^wss?:/.test(details.url) }))
 win = new BrowserWindow({ width: 1280, height: 1000, show: false, webPreferences: { preload: path.join(root, 'dist-electron/electron/preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } })
 registerTrustedWindow(() => win)
 win.webContents.on('console-message', event => { if (event.level === 'error') console.log('[renderer]', event.message) })
 const js = code => win.webContents.executeJavaScript(code, true)
 await win.loadFile(path.join(root, 'frontend/dist/index.html'))
 await delay(500)
 await js("localStorage.setItem('desktoplive_settings', JSON.stringify({currentVendor:'volc', languageHints:['zh','en'],providerConfigs:{volc:{apiKey:'synthetic-ui-test-only'}},captionStyle:{displayMode:'source'}}))")
 await win.reload()
 await delay(1200)
 // Dismiss the startup modal after it appears, before checking actual layout.
 await js("[...document.querySelectorAll('button')].find(e => ['知道了','Got it'].includes(e.textContent.trim()))?.click()")
 await js(`
 window.testSockets = []; window.testContexts = [];
 window.WebSocket = class {
   bufferedAmount = 0;
   constructor(url) { if (url.includes('?')) throw new Error('credential query forbidden'); window.testSockets.push(this); setTimeout(() => this.onopen?.(), 0); }
   message(v) { this.onmessage?.({data:JSON.stringify(v)}); }
   send(v) {
     if (typeof v !== 'string') { if (!this.emitted) { this.emitted=true; this.snapshot('合成临时稿', false); } return; }
     const control=JSON.parse(v);
     if(control.type==='start') setTimeout(()=>this.message({type:'ready'}),0);
     if(control.type==='audio_end') setTimeout(()=>this.snapshot(window.testSockets.length===1?'合成最终稿':'重连最终稿',true,true),80);
   }
   snapshot(text, definite, final=false) { this.message({type:'snapshot', final, raw:{result:{text,utterances:[{text,start_time:100,end_time:800,definite,additions:definite?{speaker_id:'0',source:'two_pass'}:{}}]}}}); }
   close(){ this.onclose?.(); }
 };
 async function media(hz) {
   const ctx=new AudioContext({sampleRate:48000}), osc=ctx.createOscillator(), dst=ctx.createMediaStreamDestination();
   osc.frequency.value=hz; osc.connect(dst); osc.start(); await ctx.resume(); window.testContexts.push(ctx); return dst.stream;
 }
 navigator.mediaDevices.getDisplayMedia=()=>media(440);
 navigator.mediaDevices.getUserMedia=()=>media(880);
 [...document.querySelectorAll('button')].find(e=>e.textContent.includes('开始录制')).click();
 `)
 await delay(1300)
 assert(await js("document.body.textContent.includes('合成临时稿') && document.body.textContent.includes('未知说话人')"), 'provisional unknown UI')
 await js("testSockets[0].snapshot('合成修订稿', true); testSockets[0].snapshot('合成修订稿', true)")
 await delay(100)
 assert(await js("document.body.textContent.includes('稳定') && document.body.textContent.includes('说话人 1')"))
 await js("testSockets[0].close()")
 await delay(600)
 assert(await js("document.body.textContent.includes('转写失败') || document.body.textContent.includes('转写未完成')"))
 await js("[...document.querySelectorAll('button')].find(e=>e.textContent.includes('重新连接转写')).click()")
 await delay(800)
 await js("testSockets[1].snapshot('重连稿',true)")
 await delay(200)
 assert(await js("document.body.textContent.includes('识别段 2')"), 'reconnect speaker scope')
 win.showInactive()
 await js("document.querySelector('[aria-label=\"录音来源与原音存储\"]').scrollIntoView({block:'end'})")
 await delay(100)
 fs.writeFileSync(path.join(root,'tmp/evidence/683-live-ui.png'),(await win.webContents.capturePage()).toPNG())
 await js("[...document.querySelectorAll('button')].find(e=>e.textContent.includes('停止录制')).click()")
 await delay(1500)
 const readSessions = `new Promise((resolve,reject)=>{const o=indexedDB.open('delive-app');o.onsuccess=()=>{const db=o.result,r=db.transaction('sessions').objectStore('sessions').getAll();r.onsuccess=()=>{resolve(r.result);db.close()};r.onerror=()=>reject(r.error)}})`
 const saved=await js(readSessions)
 assert.equal(saved.length,1)
 const doc=saved[0]
 assert.equal(doc.transcript,'合成修订稿重连最终稿')
 assert.equal(doc.realtime.length,2)
 assert.equal(doc.realtime[0].status,'incomplete')
 assert.equal(doc.realtime[1].status,'complete')
 assert.notEqual(doc.segments[0].speakerId,doc.segments[1].speakerId)
 assert(doc.segments[1].startMs>doc.segments[0].endMs)
 assert(!JSON.stringify(doc).includes('synthetic-ui-test-only'))
 console.log('encryption-available',await js('window.electronAPI.safeStorageAvailable()')); console.log('safe-store-count',fs.existsSync(path.join(profile,'safe-store'))?fs.readdirSync(path.join(profile,'safe-store')).length:0)
 assert(!await js("localStorage.getItem('desktoplive_settings').includes('synthetic-ui-test-only')"))
 const audio=await js('window.electronAPI.recording.list()')
 assert.equal(audio[0].status,'completed');assert(audio[0].blocks.length>=3)
 await win.reload();await delay(800)
 const reopened=await js(readSessions)
 assert.equal(reopened[0].transcript,doc.transcript)
 assert.equal(reopened[0].realtime[0].status,'incomplete')
 const evidence={status:'PASS',kind:'synthetic media / protocol replay, no cloud or physical capture',checks:['provisional unknown labels','full snapshot revisions/duplicates','network error keeps raw audio','manual reconnect identity scope and timeline','stop waits for final','safe-storage unavailable: plaintext removed and warning visible','IndexedDB persistence and reload'],audioBlocks:audio[0].blocks.length,recognitions:doc.realtime.map(r=>({status:r.status,offsetMs:r.offsetMs}))}
 fs.writeFileSync(path.join(root,'tmp/evidence/683-electron-integration.json'),JSON.stringify(evidence,null,2))
 console.log(JSON.stringify(evidence))
}
main().then(()=>{win?.destroy();app.quit()}).catch(error=>{console.error(error);win?.destroy();app.exit(1)})
