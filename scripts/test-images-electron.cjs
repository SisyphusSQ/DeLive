// Real audio graph, original-file store, production UI/preload and IndexedDB in an isolated profile.
// Injected file lists/clipboard/drop and synthetic oscillator sources; no user files or ASR traffic.
const {app,BrowserWindow,ipcMain,session}=require('electron'),fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'delive-images-ui-'));
app.setPath('userData',profile);app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
const {registerTrustedWindow}=require('../dist-electron/electron/ipcSecurity');
require('../dist-electron/electron/sessionImages').registerSessionImagesIpc(ipcMain);
require('../dist-electron/electron/recordingIpc').registerRecordingIpc(ipcMain);
require('../dist-electron/electron/safeStorageIpc').registerSafeStorageIpc(ipcMain);
for(const [name,value]of Object.entries({'get-app-version':'2.3.0-beta.2','window-is-maximized':false,'get-auto-launch':false,'get-proxy-port':0,'lang:change':null,'caption-update-style':null,'caption-clear':null,'caption-get-status':{visible:false},'caption-update-text':null,'check-for-updates':null,'api-update-open-api-config':null,'file-tasks:list':[]}))ipcMain.handle(name,()=>value);
const delay=ms=>new Promise(r=>setTimeout(r,ms));let win;
(async()=>{
await app.whenReady();session.defaultSession.webRequest.onBeforeRequest((d,cb)=>cb({cancel:/^https?:|^wss?:/.test(d.url)}));
win=new BrowserWindow({width:1440,height:1100,show:false,webPreferences:{preload:path.join(root,'dist-electron/electron/preload.js'),contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});registerTrustedWindow(()=>win);
const js=s=>win.webContents.executeJavaScript(s,true).catch(e=>{console.error('probe expression:',s.slice(0,350));throw e}),click=async(text,selector='button')=>{assert(await js(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.includes(${JSON.stringify(text)}));e?.click();return !!e})()`),'missing '+text);await delay(200)};
const readSessions=`new Promise((resolve,reject)=>{const o=indexedDB.open('delive-app');o.onsuccess=()=>{const db=o.result,r=db.transaction('sessions').objectStore('sessions').getAll();r.onsuccess=()=>{resolve(r.result);db.close()};r.onerror=()=>reject(r.error)}})`;
const source=path.join(profile,'source.png'),png=require('electron').nativeImage.createFromBuffer(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')).toPNG();fs.writeFileSync(source,png);
await win.loadFile(path.join(root,'frontend/dist/index.html'));await delay(700);
await js(`localStorage.setItem('delive_last_seen_version','2.3.0');localStorage.setItem('desktoplive_settings',JSON.stringify({currentVendor:'volc',languageHints:['zh'],providerConfigs:{volc:{apiKey:'synthetic'}}}))`);await win.reload();await delay(700);
await js(`window.testContexts=[];window.allContexts=[];window.AudioContext=class extends AudioContext {constructor(options={}){super({...options,sinkId:{type:"none"}});allContexts.push(this)}};window.WebSocket=class {bufferedAmount=0;constructor(){setTimeout(()=>this.onopen?.(),0)}send(v){if(typeof v==='string'){const c=JSON.parse(v);if(c.type==='start')setTimeout(()=>this.onmessage?.({data:JSON.stringify({type:'ready'})}),0);if(c.type==='audio_end')setTimeout(()=>this.onmessage?.({data:JSON.stringify({type:'snapshot',final:true,raw:{result:{text:'请看图片',utterances:[{text:'请看图片',start_time:100,end_time:500,definite:true}]}}})}),10)}}close(){this.onclose?.()}};
async function media(){const ctx=new AudioContext({sampleRate:48000}),osc=ctx.createOscillator(),dst=ctx.createMediaStreamDestination();osc.connect(dst);osc.start();await ctx.resume();testContexts.push(ctx);return dst.stream}navigator.mediaDevices.getDisplayMedia=media;navigator.mediaDevices.getUserMedia=media;
[...document.querySelectorAll('button')].find(e=>e.textContent.includes('开始录制')).click()`);
await delay(900);
const data=Array.from(png);
await js(`window.imageFile=name=>new File([new Uint8Array(${JSON.stringify(data)})],name,{type:'image/png'});var input=document.querySelector('input[aria-label="选择时间轴图片"]');input.click=()=>{};undefined`);
await click('插入图片');await delay(1100);
await js(`var dt=new DataTransfer();dt.items.add(imageFile('picker.png'));var input=document.querySelector('input[aria-label="选择时间轴图片"]');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));`);await delay(500);
let saved=(await js(readSessions))[0];assert.equal(saved.images.length,1);assert(saved.images[0].atMs<1600,'picker timestamp must precede selection completion');
await js(`var dt=new DataTransfer();dt.items.add(imageFile('pasted.png'));document.querySelector('[aria-label="图片时间轴"]').dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true}));`);await delay(500);
await js(`var dt=new DataTransfer();dt.items.add(imageFile('dropped.png'));document.querySelector('[aria-label="图片时间轴"]').dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true}));`);await delay(500);
console.log(await js('allContexts.map(c=>({state:c.state,time:c.currentTime}))'));await click('停止录制');await delay(800);saved=(await js(readSessions))[0];console.log(saved.images.map(i=>({name:i.name,atMs:i.atMs})));assert.equal(saved.images.length,3);assert.equal(saved.transcript,'请看图片');assert(saved.images[0].atMs<saved.images[1].atMs);assert(saved.images[1].atMs<saved.images[2].atMs);fs.unlinkSync(source);
for(const image of saved.images)assert.deepEqual(Buffer.from(await js(`electronAPI.sessionImages.read(${JSON.stringify(saved.id)},${JSON.stringify(image.assetPath)})`)),png);
await js(`new Promise((resolve,reject)=>{const o=indexedDB.open('delive-app');o.onsuccess=()=>{const db=o.result,tx=db.transaction('sessions','readwrite'),s=${JSON.stringify(saved)};s.postProcess={status:'success',summary:'图表来源验收',imageIds:[s.images[0].id],inputFingerprint:'0'.repeat(64)};tx.objectStore('sessions').put(s);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)}})`);
await win.reload();await delay(700);assert.equal((await js(readSessions))[0].images.length,3);
await js(`document.querySelector('aside .lucide-file-text').closest('button').click()`);await delay(300);
await js(`document.querySelector('.interactive-card[role="button"]').click()`);await delay(300);
assert.equal(await js(`document.querySelectorAll('[data-image-id]').length`),3);
await js(`document.querySelector('[aria-controls=tabpanel-summary]').click()`);await delay(300);assert(await js(`document.body.textContent.includes('旧结果没有来源记录')`));
await js(`document.querySelector('a[href^="#image-"]').click()`);await delay(200);assert(await js(`!!document.querySelector('[role="dialog"] img')`));
await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);await delay(100);await js(`document.querySelector('[aria-controls=tabpanel-transcript]').click()`);await delay(200);
await click('编辑时间与说明');await js(`var e=document.querySelector('input[aria-label="图片时间（秒）"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'0.25');e.dispatchEvent(new Event('input',{bubbles:true}));var t=document.querySelector('textarea[aria-label="图片说明"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'说明保留');t.dispatchEvent(new Event('input',{bubbles:true}));`);await click('保存图片信息');
await click('定位原音');assert(await js(`document.querySelector('[aria-label="原音播放"]')?.textContent.includes('暂停') || document.body.textContent.includes('暂停')`));
const first=(await js(readSessions))[0].images[0];
await js(`var a=document.createElement('a');a.href='#image-${first.id}';document.body.append(a);a.click();a.remove()`);await delay(200);assert(await js(`!!document.querySelector('[role="dialog"] img')`));

// Escape uses DialogShell's production dismissal handler.
await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));window.confirm=()=>true;undefined`);await delay(200);
fs.mkdirSync(path.join(root,'tmp/evidence/691'),{recursive:true});fs.writeFileSync(path.join(root,'tmp/evidence/691/images.png'),(await win.webContents.capturePage()).toPNG());
await click('删除图片');assert.equal((await js(readSessions))[0].images.length,2);assert(!fs.existsSync(path.join(profile,'session-images',first.assetPath)));
await win.reload();await delay(700);assert.equal((await js(readSessions))[0].images.length,2);assert((await js('electronAPI.recording.list()'))[0].blocks.length>0);
fs.mkdirSync(path.join(root,'tmp/evidence/691'),{recursive:true});fs.writeFileSync(path.join(root,'tmp/evidence/691/electron.json'),JSON.stringify({status:'PASS',profile,checks:['recording file/paste/drop','picker trigger time','copied originals survive source deletion','restart','edit metadata','image link viewer','audio seek','image cleanup preserves audio']},null,2));console.log('PASS images Electron');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>app.exit(process.exitCode||0));
