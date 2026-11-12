// Compiled UI + production preload/IPC/task manager/IndexedDB. Cloud and keychain are isolated doubles.
// No credential discovery; no actual cloud traffic. Profile and artifacts contain synthetic data only.
const { app,BrowserWindow,ipcMain,session,safeStorage }=require('electron')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto')
const root=path.resolve(__dirname,'..'),evidence=path.join(root,'tmp/evidence/too-706'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'delive-file-ui-'))
app.setPath('userData',profile)
const {registerTrustedWindow}=require('../dist-electron/electron/ipcSecurity')
const recording=require('../dist-electron/electron/recordingIpc').registerRecordingIpc(ipcMain)
require('../dist-electron/electron/safeStorageIpc').registerSafeStorageIpc(ipcMain)
require('../dist-electron/electron/fileTranscription/fileTaskIpc').registerFileTaskIpc(ipcMain,recording.owner)
const {S3TemporaryAudioStore}=require('../dist-electron/electron/fileTranscription/s3TemporaryStore')
const {VolcFileService}=require('../dist-electron/electron/fileTranscription/volcFileService')
let submits=0,queries=[],removed=0
S3TemporaryAudioStore.prototype.upload=async function(key,file,signal,progress){progress(fs.statSync(file).size);await delay(80)}
S3TemporaryAudioStore.prototype.signedUrl=async()=> 'https://fixture.invalid/synthetic-signature'
S3TemporaryAudioStore.prototype.remove=async()=>{removed++}
VolcFileService.prototype.submit=async()=>{submits++;if(submits===1)throw new Error('lost synthetic response');return {code:'20000000'}}
VolcFileService.prototype.query=async(id)=>{queries.push(id);return {code:'20000000',raw:{audio_info:{duration:1000},result:{text:'独立会后稿',utterances:[{text:'独立会后稿',start_time:100,end_time:800,additions:{speaker:'1'}}]}}}}
ipcMain.handle('complete-backup:pendingRestore', () => null)
ipcMain.handle('session-images:cleanup', () => undefined)
for(const [name,value]of Object.entries({'get-app-version':'2.3.0-beta.2','window-is-maximized':false,'get-auto-launch':false,'get-proxy-port':0,'lang:change':null,    'check-for-updates':null}))ipcMain.handle(name,()=>value)
const delay=ms=>new Promise(r=>setTimeout(r,ms))
let win
async function main(){
 await app.whenReady()
 fs.mkdirSync(evidence,{recursive:true})
 const actualKeychain=safeStorage.isEncryptionAvailable()
 // Independent in-memory encryption double, never a product fallback.
 const key=crypto.randomBytes(32)
 safeStorage.isEncryptionAvailable=()=>true
 safeStorage.encryptString=value=>{const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data])}
 safeStorage.decryptString=value=>{const cipher=crypto.createDecipheriv('aes-256-gcm',key,value.subarray(0,12));cipher.setAuthTag(value.subarray(12,28));return Buffer.concat([cipher.update(value.subarray(28)),cipher.final()]).toString('utf8')}
 session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:/^https?:|^wss?:/.test(details.url)}))
 win=new BrowserWindow({width:1400,height:1100,show:false,webPreferences:{preload:path.join(root,'dist-electron/electron/preload.js'),contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}})
 registerTrustedWindow(()=>win)
 win.webContents.on('console-message',e=>{if(e.level==='error')console.log('[renderer]',e.message)})
 const js=code=>win.webContents.executeJavaScript(code,true)
 const click=async(text,selector='button')=>{assert(await js(`(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.includes(${JSON.stringify(text)}));el?.click();return !!el})()`),'button '+text);await delay(150)}
 const screenshot=async name=>fs.writeFileSync(path.join(evidence,name+'.png'),(await win.webContents.capturePage()).toPNG())
 const readSessions=`new Promise((resolve,reject)=>{const o=indexedDB.open('delive-app');o.onsuccess=()=>{const db=o.result,r=db.transaction('sessions').objectStore('sessions').getAll();r.onsuccess=()=>{resolve(r.result);db.close()};r.onerror=()=>reject(r.error)}})`
 await win.loadFile(path.join(root,'frontend/dist/index.html'));await delay(700)
 await js("localStorage.setItem('delive_last_seen_version','2.3.0')");win.reload();await delay(700)
 win.showInactive();await delay(100)
 assert(await js("!('captionToggle' in electronAPI) && ![...document.querySelectorAll('aside button')].some(button=>button.textContent.includes('字幕'))"))
 await screenshot('settings')
 await js("document.querySelector('aside .lucide-mic').closest('button').click()");await delay(150)
 await click('开始录制')
 assert(await js("document.body.textContent.includes('请配置火山 API Key 或 APP ID + Access Token')"))
 assert.equal((await js('electronAPI.recording.list()')).length,0)
 win.webContents.send('toggle-recording')
 await delay(100)
 assert.equal((await js('electronAPI.recording.list()')).length,0)
 await js("document.querySelector('[aria-label=录音来源与原音存储]').scrollIntoView({block:'end'})")
 await screenshot('live')
 await js("document.querySelectorAll('[role=alert] button').forEach(button=>button.click())")
 await js("document.querySelector('aside .lucide-file-audio').closest('button').click()");await delay(150)
 await click('导入文件')
 await click('火山')
 const options=await js("[...document.querySelectorAll('[role=dialog] button')].map(button=>button.textContent)")
 assert(options.some(text=>text.includes('火山')) && options.some(text=>text.includes('OpenAI')) && options.some(text=>text.includes('SenseVoice')) && options.some(text=>text.includes('whisper.cpp')))
 assert(!options.some(text=>/Soniox|Groq|60db/.test(text)))
 await screenshot('file-providers')
 await js("document.querySelector('[role=dialog] button[aria-label]').click()");await delay(100)
 await screenshot('file-missing-config')
 safeStorage.isEncryptionAvailable=()=>false
 await assert.rejects(js('electronAPI.fileTasks.configure({})'),/安全存储/)
 assert(!fs.existsSync(path.join(profile,'file-transcription-config.enc')))
 safeStorage.isEncryptionAvailable=()=>true
 await js(`localStorage.setItem('delive_last_seen_version','2.3.0');localStorage.setItem('desktoplive_settings',JSON.stringify({currentVendor:'volc',languageHints:['zh'],providerConfigs:{volc:{apiKey:'synthetic-volc-key'}}}));`)
 await js(`(async()=>{await electronAPI.recording.begin('fixture-session');await electronAPI.recording.append('fixture-session',{startMs:0,sampleRate:16000,tracks:{mix:new Int16Array(16000).fill(1000).buffer}});await electronAPI.recording.finish('fixture-session',false);
 await new Promise((resolve,reject)=>{const o=indexedDB.open('delive-app');o.onsuccess=()=>{const db=o.result,t=db.transaction('sessions','readwrite');t.objectStore('sessions').put({id:'fixture-session',schemaVersion:3,title:'合成会议',date:'2026-11-02',time:'00:00',createdAt:Date.now(),updatedAt:Date.now(),transcript:'保留实时原稿',segments:[{text:'保留实时原稿',startMs:0,endMs:1000,speakerId:'live:0'}],speakers:[{id:'live:0',label:'说话人 1',displayName:'已确认姓名'}],correction:{status:'done',mode:'quick',correctedText:'保留人工校对'},audioRecordingId:'fixture-session',duration:1000,status:'completed'});t.oncomplete=()=>{db.close();resolve()};t.onerror=()=>reject(t.error)}})})()`)
 await win.reload();await delay(900)
 async function openFile(){
  await js("document.querySelector('aside .lucide-file-audio').closest('button').click()");await delay(200)
  assert(await js("!!document.querySelector('[aria-label=标准文件转写任务]')"))
 }
 await openFile()
 await click('存储设置')
 const entries={'HTTPS endpoint':'https://fixture.invalid','区域':'fixture','私有桶':'fixture','Access Key ID':'synthetic-s3-access','Secret Access Key':'synthetic-s3-secret'}
 for(const[label,value]of Object.entries(entries))await js(`(()=>{const el=[...document.querySelectorAll('label')].find(e=>e.textContent.trim()===${JSON.stringify(label)})?.querySelector('input');if(!el)throw new Error('input missing');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`)
 await click('加密保存配置')
 assert(await js("document.body.textContent.includes('已配置')"))
 const enc=fs.readFileSync(path.join(profile,'file-transcription-config.enc'))
 assert(!enc.includes('synthetic-s3-secret'))
 await click('返回文件转写')
 await js("document.querySelector('[aria-label=选择会议原音]').click()")
 await click('合成会议','[role=option]')
 await click('转写并校正')
 await click('确认提交（可能计费）')
 await delay(2300)
 assert(await js("document.body.textContent.includes('提交结果未知')"))
 const first=(await js('electronAPI.fileTasks.list()'))[0]
 assert.equal(first.status,'submission-unknown');assert.equal(submits,1);assert.equal(removed,0)
 await win.reload();await delay(700);await openFile()
 await click('查询 / 继续查询')
 await delay(500)
 assert.equal(submits,1);assert.deepEqual(queries,[first.taskId]);assert.equal(removed,1)
 assert(await js("document.body.textContent.includes('已清理确认') && document.body.textContent.includes('会后稿已保存')"))
 const saved=(await js(readSessions))[0]
 assert(saved.versions.some(version=>version.kind==='post-meeting'));assert.equal(saved.transcript,'保留实时原稿');assert.equal(saved.correction.correctedText,'保留人工校对');assert.equal(saved.speakers[0].displayName,'已确认姓名')
 assert.equal(saved.versions.find(version=>version.kind==='post-meeting').speakerMapping,undefined)
 await js("document.querySelector('[aria-label=标准文件转写任务]').scrollIntoView({block:'center'})")
 win.showInactive();await delay(100)
 await screenshot('file-completed')
 await click('打开校正版')
 await click('导出当前版本')
 const exports=await js("[...document.querySelectorAll('[aria-label=当前版本导出选项] button')].map(button=>[button.textContent,button.disabled])")
 assert(exports.some(([label, disabled])=>label==='SRT' && !disabled))
 assert(exports.some(([label, disabled])=>label==='VTT' && !disabled))
 await screenshot('review-export')
 await openFile()
 await click('导入文件')
 // Exercise actual file drop decoding, normalization, archive, submit and result persistence.
 await js(`(()=>{const data=new ArrayBuffer(32044),v=new DataView(data),write=(p,s)=>[...s].forEach((c,i)=>v.setUint8(p+i,c.charCodeAt(0)));write(0,'RIFF');v.setUint32(4,32036,true);write(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);write(36,'data');v.setUint32(40,32000,true);for(let n=0;n<16000;n++)v.setInt16(44+n*2,Math.sin(n/16000*440*Math.PI*2)*1000,true);
 const dt=new DataTransfer();dt.items.add(new File([data],'synthetic-import.wav',{type:'audio/wav'}));const input=document.querySelector('input[type=file]');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}))})()`)
 await delay(200);await click('开始转录')
 await delay(3000)
 assert.equal(submits,2)
 const jobs=await js('electronAPI.fileTasks.list()'),imported=jobs.find(j=>j.id!==first.id)
 assert(imported);assert.equal(imported.status,'queued')
 await click('查询 / 继续查询');await delay(500)
 await win.reload();await delay(800)
 const reopened=await js(readSessions)
 assert.equal(reopened.length,2);assert(reopened.every(s=>s.versions.some(v=>v.kind==='post-meeting')))
 const audio=await js('electronAPI.recording.list()');assert.equal(audio.length,2)
 const disk=fs.readdirSync(path.join(profile,'file-transcription-jobs')).filter(n=>n.endsWith('.json')).map(n=>fs.readFileSync(path.join(profile,'file-transcription-jobs',n),'utf8')).join('')
 assert(!/synthetic-signature|synthetic-volc-key|synthetic-s3-secret/.test(disk))
 const report={status:'PASS',actualKeychain,credentialTest:'AES encryption double in isolated harness; real keychain success NOT_RUN',checks:['safeStorage unavailable rejects persistence','default provider and four active options','missing credentials block button and shortcut','private storage configuration UI and production IPC','original SRT/VTT in Review','unknown submit persists across renderer restart','same task query, no resubmit','independent versions preserve live/correction/names','confirmed cleanup','actual WAV file import through UI','native recording and IndexedDB reopen'],tasks:2,submits,queries:queries.length,removed}
 fs.writeFileSync(path.join(evidence,'file-integration.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report))
}
main().then(()=>{win?.destroy();app.quit()}).catch(async error=>{console.error(error);if(win)console.log(await win.webContents.executeJavaScript('document.body.innerText.slice(0,4000)'));win?.destroy();app.exit(1)})
