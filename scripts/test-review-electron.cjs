// Compiled UI + production preload/IPC/task manager/IndexedDB. Cloud and keychain are isolated doubles.
// No credential discovery; no actual cloud traffic. Profile and artifacts contain synthetic data only.
const { app,BrowserWindow,ipcMain,session,safeStorage }=require('electron')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto')
const root=path.resolve(__dirname,'..'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'delive-review-ui-'))
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
for(const [name,value]of Object.entries({'get-app-version':'2.3.0-beta.2','window-is-maximized':false,'get-auto-launch':false,'get-proxy-port':0,'lang:change':null,'caption-update-style':null,'caption-clear':null,'caption-get-status':{visible:false},'caption-update-text':null,'check-for-updates':null}))ipcMain.handle(name,()=>value)
const delay=ms=>new Promise(r=>setTimeout(r,ms))
let win
async function main(){
 await app.whenReady()
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
 const readSessions=`new Promise((resolve,reject)=>{const o=indexedDB.open('delive-app');o.onsuccess=()=>{const db=o.result,r=db.transaction('sessions').objectStore('sessions').getAll();r.onsuccess=()=>{resolve(r.result);db.close()};r.onerror=()=>reject(r.error)}})`
 await win.loadFile(path.join(root,'frontend/dist/index.html'));await delay(700)
 safeStorage.isEncryptionAvailable=()=>false
 await assert.rejects(js('electronAPI.fileTasks.configure({})'),/安全存储/)
 assert(!fs.existsSync(path.join(profile,'file-transcription-config.enc')))
 safeStorage.isEncryptionAvailable=()=>true
 await js(`localStorage.setItem('delive_last_seen_version','2.3.0');localStorage.setItem('desktoplive_settings',JSON.stringify({currentVendor:'volc',languageHints:['zh'],providerConfigs:{volc:{apiKey:'synthetic-volc-key'}}}));`)

 await win.reload();await delay(800)
 await js(`
 window.testSockets=[];window.testContexts=[];
 window.WebSocket=class {
  bufferedAmount=0;
  constructor(url){if(url.includes('?'))throw new Error('credential URL');testSockets.push(this);setTimeout(()=>this.onopen?.(),0)}
  message(v){this.onmessage?.({data:JSON.stringify(v)})}
  send(v){if(typeof v!=='string'){if(!this.emitted){this.emitted=true;this.snapshot(false)}return}
   const c=JSON.parse(v);if(c.type==='start')setTimeout(()=>this.message({type:'ready'}),0);
   if(c.type==='audio_end')setTimeout(()=>this.snapshot(true),50)}
  snapshot(final){this.message({type:'snapshot',final,raw:{result:{text:'实时第一句实时第二句未知片段',utterances:[
   {text:'实时第一句',start_time:100,end_time:800,definite:final,additions:{speaker_id:'0'}},
   {text:'实时第二句',start_time:1200,end_time:1800,definite:final,additions:{speaker_id:'1'}},
   {text:'未知片段',start_time:1900,end_time:2200,definite:false}
  ]}}})}
  close(){this.onclose?.()}
 };
 async function media(hz){const ctx=new AudioContext({sampleRate:48000}),osc=ctx.createOscillator(),dst=ctx.createMediaStreamDestination();osc.frequency.value=hz;osc.connect(dst);osc.start();await ctx.resume();testContexts.push(ctx);return dst.stream}
 navigator.mediaDevices.getDisplayMedia=()=>media(440);navigator.mediaDevices.getUserMedia=()=>media(880);
 [...document.querySelectorAll('button')].find(e=>e.textContent.includes('开始录制')).click()
 `)
 await delay(2700);await click('停止录制');await delay(1200)
 const captured=(await js(readSessions))[0],meetingId=captured.id
 assert.equal(captured.transcript,'实时第一句实时第二句未知片段');assert(captured.realtime[0].status==='complete')
 const originalAudio=(await js('electronAPI.recording.list()'))[0]
 assert(originalAudio.blocks.length>=2);assert(originalAudio.blocks.every(b=>b.tracks.includes('system')&&b.tracks.includes('microphone')&&b.tracks.includes('mix')))
 async function openFile(){
  await js("document.querySelector('aside .lucide-file-audio').closest('button').click()");await delay(200)
  await click('Soniox')
  await click('火山','[role=dialog] button')
  assert(await js("!!document.querySelector('[aria-label=标准文件转写任务]')"))
 }
 await openFile()
 await click('私有临时存储配置')
 const entries={'HTTPS endpoint':'https://fixture.invalid','区域':'fixture','私有桶':'fixture','Access Key ID':'synthetic-s3-access','Secret Access Key':'synthetic-s3-secret'}
 for(const[label,value]of Object.entries(entries))await js(`(()=>{const el=[...document.querySelectorAll('label')].find(e=>e.textContent.trim()===${JSON.stringify(label)})?.querySelector('input');if(!el)throw new Error('input missing');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`)
 await click('加密保存配置')
 assert(await js("document.body.textContent.includes('已配置')"))
 const enc=fs.readFileSync(path.join(profile,'file-transcription-config.enc'))
 assert(!enc.includes('synthetic-s3-secret'))
 await click('私有临时存储配置')
 await js(`var s=document.querySelector('[aria-label=选择会议原音]');s.value=${JSON.stringify(meetingId)};s.dispatchEvent(new Event('change',{bubbles:true}))`)
 await click('提交会后转写')
 await delay(2300)
 assert(await js("document.body.textContent.includes('提交结果未知：先查询')"))
 const first=(await js('electronAPI.fileTasks.list()'))[0]
 assert.equal(first.status,'submission-unknown');assert.equal(submits,1);assert.equal(removed,0)
 await win.reload();await delay(700);await openFile()
 await click('查询 / 继续查询')
 await delay(500)
 assert.equal(submits,1);assert.deepEqual(queries,[first.taskId]);assert.equal(removed,1)
 assert(await js("document.body.textContent.includes('已清理确认') && document.body.textContent.includes('会后稿预览')"))
 const saved=(await js(readSessions))[0]
 assert.equal(saved.versions.length,2);assert.equal(saved.transcript,'实时第一句实时第二句未知片段')
 assert.equal(saved.versions[1].kind,'post-meeting');assert.equal(saved.versions[1].speakerMapping,undefined)
 await js("document.querySelector('[aria-label=标准文件转写任务]').scrollIntoView({block:'center'})")
 win.showInactive();await delay(100)
 fs.writeFileSync(path.join(root,'tmp/evidence/685-file-ui.png'),(await win.webContents.capturePage()).toPNG())

 // Edit through the review UI, then deliver another machine version to the same meeting.
 await click('打开会后稿所在会话')
 await js("window.confirm=()=>true;undefined")
 assert(await js("document.querySelector('[aria-label=当前稿内容]').textContent.includes('未知说话人')"))
 await click('校对当前稿件')
 const setInput=async(selector,value)=>js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('missing input');Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`)
 await setInput('input[aria-label^="说话人姓名 "]','人工确认甲')
 await setInput('textarea[aria-label="片段 1 文字"]','人工校对第一句')
 await js("var s=document.querySelector('[aria-label=\"片段 2 归属\"]');s.value=document.querySelector('[aria-label=\"片段 1 归属\"]').value;s.dispatchEvent(new Event('change',{bubbles:true}))")
 await click('保存为修订版本');await delay(400)
 const edited=(await js(readSessions)).find(s=>s.id===meetingId),editId=edited.selectedVersionId,edit=edited.versions.find(v=>v.id===editId)
 assert.equal(edit.kind,'edited');assert.equal(edit.speakers[0].displayName,'人工确认甲');assert.equal(edit.segments[0].text,'人工校对第一句');assert.equal(edit.segments[1].speakerId,edit.segments[0].speakerId)
 await js(`
 window.testDownloads=[];window.testBlobs=new Map();const originalURL=URL.createObjectURL.bind(URL);URL.createObjectURL=b=>{const u=originalURL(b);testBlobs.set(u,b);return u};
 HTMLAnchorElement.prototype.click=function(){if(this.download){const b=testBlobs.get(this.href);window.testDownloads.push({name:this.download,ready:b.text()})}};
 const NativeContext=window.AudioContext;window.playbackStarts=[];
 window.AudioContext=class extends NativeContext {createBufferSource(){const s=super.createBufferSource(),start=s.start.bind(s);s.start=(when,offset)=>{playbackStarts.push({when,offset,clock:this.currentTime});start(when,offset)};return s}};undefined
 `)
 for(const format of ['TXT','Markdown','SRT']){await click('导出当前版本');await click(format,'[aria-label=当前版本导出选项] button')}
 const exported=await js("Promise.all(testDownloads.map(async d=>({name:d.name,text:await d.ready})))")
 assert.equal(exported.length,3);assert(exported.every(d=>d.text.includes('人工校对第一句')&&d.text.includes('人工确认甲')&&!d.text.includes('synthetic-')))
 const srtTime=n=>new Date(Math.round(n)).toISOString().slice(11,23).replace('.',',');assert(exported.find(d=>d.name.endsWith('.srt')).text.includes(srtTime(edit.segments[0].startMs)+' --> '+srtTime(edit.segments[0].endMs)))
 await js("var s=document.querySelector('[aria-label=回放录音来源]');s.value='system';s.dispatchEvent(new Event('change',{bubbles:true}))")
 await click('人工校对第一句','[aria-label=当前稿内容] button');await delay(200)
 const playback=await js("({p:Number(document.querySelector('[data-playback-position]').dataset.playbackPosition),starts:playbackStarts})")
 assert(playback.p>=100&&playback.p<1000);assert(Math.abs(playback.starts[0].offset-edit.segments[0].startMs/1000)<0.001)
 await click('暂停')
 // Real missing-file failure on synthetic profile; restore the test asset immediately.
 const audioFolder=path.join(recording.owner(meetingId).directory,meetingId,'0'),sourceFile=path.join(audioFolder,'system.wav'),backup=fs.readFileSync(sourceFile)
 fs.unlinkSync(sourceFile)
 await click('人工校对第一句','[aria-label=当前稿内容] button');await delay(200)
 assert(await js("document.querySelector('[aria-label=原音回放]').textContent.includes('原音片段缺失')"))
 assert(!await js("[...document.querySelector('[aria-label=原音回放]').querySelectorAll('button')].some(b=>b.textContent==='暂停')"))
 fs.writeFileSync(sourceFile,backup)
 // Compare two versions and inspect actual UI layout.
 // first was the original unknown snapshot; obtain completed task version instead.
 const completedFirst=(await js('electronAPI.fileTasks.list()')).find(j=>j.id===first.id)
 await js(`var s=document.querySelector('[aria-label=对照稿件版本]');s.value=${JSON.stringify(completedFirst.version.id)};s.dispatchEvent(new Event('change',{bubbles:true}))`)
 await delay(150)
 assert(await js("document.querySelector('[aria-label=对照稿内容]').textContent.includes('独立会后稿')"))
 win.showInactive();fs.writeFileSync(path.join(root,'tmp/evidence/685-review-ui.png'),(await win.webContents.capturePage()).toPNG())
 await openFile()
 await js(`var s=document.querySelector('[aria-label=选择会议原音]');s.value=${JSON.stringify(meetingId)};s.dispatchEvent(new Event('change',{bubbles:true}))`)
 await click('提交会后转写');await delay(2200);await click('查询 / 继续查询');await delay(400)
 const afterArrival=(await js(readSessions)).find(s=>s.id===meetingId)
 assert.equal(afterArrival.selectedVersionId,editId);assert.equal(afterArrival.versions.find(v=>v.id===editId).segments[0].text,'人工校对第一句')
 const tasks=await js('electronAPI.fileTasks.list()'),latest=tasks.find(j=>j.id!==first.id)
 assert(latest&&latest.version);assert.notEqual(latest.version.speakers[0].id,completedFirst.version.speakers[0].id)
 await click('打开会后稿所在会话');await delay(200)
 await js(`var s=document.querySelector('[aria-label=当前稿件版本]');s.value=${JSON.stringify(latest.version.id)};s.dispatchEvent(new Event('change',{bubbles:true}))`)
 await delay(200)
 await js("[...document.querySelectorAll('summary')].find(e=>e.textContent.includes('人工确认跨版本')).click()")
 await js(`var s=document.querySelector('[aria-label=姓名映射来源版本]');s.value=${JSON.stringify(editId)};s.dispatchEvent(new Event('change',{bubbles:true}))`)
 await delay(100)
 await js(`var s=document.querySelector('select[aria-label^="映射 "]');s.value=${JSON.stringify(edit.speakers[0].id)};s.dispatchEvent(new Event('change',{bubbles:true}))`)
 await click('确认映射并另存版本');await delay(400)
 const mappedSession=(await js(readSessions)).find(s=>s.id===meetingId),mapped=mappedSession.versions.find(v=>v.id===mappedSession.selectedVersionId)
 assert.equal(mapped.speakerMapping.sourceVersionId,editId);assert.equal(mapped.speakers[0].displayName,'人工确认甲')
 assert.equal(mappedSession.versions.find(v=>v.id===latest.version.id).speakers[0].displayName,undefined)
 await win.reload();await delay(700)
 const reopened=(await js(readSessions)).find(s=>s.id===meetingId)
 assert.equal(reopened.selectedVersionId,mapped.id);assert.equal(reopened.versions.find(v=>v.id===editId).segments[0].text,'人工校对第一句')

 // Text-only historical session: editable without audio, no invented subtitle time.
 await js(`new Promise((resolve,reject)=>{const o=indexedDB.open('delive-app');o.onsuccess=()=>{const db=o.result,t=db.transaction('sessions','readwrite');t.objectStore('sessions').put({id:'legacy-only',title:'旧文字历史',transcript:'旧文字原稿',createdAt:1,updatedAt:1,date:'2026-01-01',time:'00:00',status:'completed'});t.oncomplete=()=>{db.close();resolve()};t.onerror=()=>reject(t.error)}})`)
 await win.reload();await delay(700)
 await js("document.querySelector('aside .lucide-file-text').closest('button').click()");await delay(150)
 await click('2026-01-01');await click('旧文字历史','[role=button]')
 assert(await js("document.querySelector('[aria-label=原音回放]').textContent.includes('没有原音')"))
 await click('校对当前稿件');await setInput('textarea[aria-label="片段 1 文字"]','旧会话人工编辑');await click('保存为修订版本');await delay(250)
 await js(`window.testDownloads=[];window.testBlobs=new Map();var originalURL=URL.createObjectURL.bind(URL);URL.createObjectURL=b=>{var u=originalURL(b);testBlobs.set(u,b);return u};HTMLAnchorElement.prototype.click=function(){if(this.download)testDownloads.push({name:this.download,ready:testBlobs.get(this.href).text()})};undefined`)
 await click('导出当前版本')
 assert(await js("[...document.querySelectorAll('[aria-label=当前版本导出选项] button')].find(e=>e.textContent==='SRT').disabled"))
 await click('TXT','[aria-label=当前版本导出选项] button');await click('导出当前版本');await click('Markdown','[aria-label=当前版本导出选项] button')
 const legacyExports=await js("Promise.all(testDownloads.map(async d=>({name:d.name,text:await d.ready})))")
 assert(legacyExports.every(d=>d.text.includes('旧会话人工编辑')&&!d.text.includes('人工确认甲')))
 await click('校对当前稿件')
 await setInput('input[aria-label="片段 1 开始秒"]','0')
 await setInput('input[aria-label="片段 1 结束秒"]','1')
 await click('保存为修订版本');await delay(200)
 await click('导出当前版本');await click('SRT','[aria-label=当前版本导出选项] button')
 const legacySrt=await js("testDownloads[testDownloads.length-1].ready")
 assert(legacySrt.includes('00:00:00,000 --> 00:00:01,000'));assert(legacySrt.includes('旧会话人工编辑'))
 await win.reload();await delay(700)
 const legacySaved=(await js(readSessions)).find(s=>s.id==='legacy-only')
 assert.equal(legacySaved.transcript,'旧文字原稿');assert.equal(legacySaved.versions.find(v=>v.id===legacySaved.selectedVersionId).text,'旧会话人工编辑')
 const report={status:'PASS',actualKeychain,kind:'synthetic dual-source capture; live WS/file HTTP/S3/keychain doubles; real AudioContext playback, native IPC, disk and IndexedDB',
 checks:['682 dual source/mix assets','683 final anonymous realtime snapshots','684 unknown submit same-ID resume','685 unknown speaker display','rename/text/attribution revision','TXT/MD/SRT match selected version','system track seek offset within 1 ms in scheduled buffer','missing file stops playback','version comparison','late post-meeting result preserves manual selection','explicit mapping creates new revision','reload preserves all versions','text-only legacy edit/reopen/TXT/MD','untimed SRT disabled until user supplies times'],
 recordingBlocks:originalAudio.blocks.length,submits,queries:queries.length,versions:reopened.versions.length,seekOffsetSeconds:playback.starts[0].offset}
 fs.writeFileSync(path.join(root,'tmp/evidence/685-electron-integration.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report))

}
main().then(()=>{win?.destroy();app.quit()}).catch(async error=>{console.error(error);if(win)console.log(await win.webContents.executeJavaScript('document.body.innerText.slice(0,4000)'));win?.destroy();app.exit(1)})
