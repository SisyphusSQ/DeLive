// Run after build:electron. Uses isolated synthetic data only.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {RecordingStore}=require('../dist-electron/electron/recordingStore');
const {BackupEngine}=require('../dist-electron/electron/cloudBackup/backupEngine');
const {writeArchive,readArchive,parseBackupMetadata,safeBackupPath,fileHash}=require('../dist-electron/electron/cloudBackup/backupArchive');
const {QuarkProvider,redactQuarkError}=require('../dist-electron/electron/cloudBackup/quarkProvider');
const id='session-692',imageId='11111111-1111-1111-1111-111111111111',png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
(async()=>{
 assert(!redactQuarkError('{"token":"private-secret","cookie":"private-secret"}').includes('private-secret'));
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'delive-backup-'));let checks=0;
 try{
  const source=path.join(root,'source'),audio=new RecordingStore(path.join(source,'recordings'));
  audio.begin(id);audio.append(id,{startMs:0,sampleRate:48000,tracks:{mix:new Int16Array(4800).buffer}});audio.finish(id);
  await fs.mkdir(path.join(source,'session-images',id),{recursive:true});await fs.writeFile(path.join(source,'session-images',id,imageId+'.png'),png);
  const metadata={version:'3.0',schemaVersion:3,exportedAt:'2026-11-03',sessions:[{id,status:'completed',schemaVersion:5,audioRecordingId:id,images:[{id:imageId,assetPath:id+'/'+imageId+'.png',name:'fixture.png',mimeType:'image/png',bytes:png.length,sha256:crypto.createHash('sha256').update(png).digest('hex'),width:1,height:1,atMs:20,caption:'fixture',createdAt:1}]}],tags:[],topics:[],settings:{apiKey:'secret',providerConfigs:{soniox:{apiKey:'secret'}},cloudBackup:{s3:{secretAccessKey:'secret'}},openApi:{token:'secret'},captionStyle:{fontSize:24,token:'secret'},aiPostProcess:{model:'chosen',apiKey:'secret',codexPath:'/private/bin',modelAssignment:{chat:'chosen',token:'secret'}}}};
  const access={owner:()=>audio,restoreDirectory:()=>audio.directory,assertIdle:()=>{},refresh:()=>{}};
  const engine=new BackupEngine(source,access),artifact=await engine.build(JSON.stringify(metadata),true),file=path.join(engine.directory,artifact.name);
  const manifest=await readArchive(file,path.join(root,'unpack'));assert.equal(manifest.files.length,4);assert(!JSON.stringify(manifest).includes('secret'));assert(!JSON.stringify(manifest).includes('/private/bin'));checks++;
  const stripped=await engine.build(JSON.stringify(metadata),false),noAudio=await readArchive(path.join(engine.directory,stripped.name),path.join(root,'no-audio'));assert.equal(noAudio.files.length,1);checks++;
  for(const bad of ['../evil','images/../evil','audio/id/../index.json','/tmp/a'])assert.equal(safeBackupPath(bad),false);checks++;
  assert.throws(()=>parseBackupMetadata(JSON.stringify({...metadata,schemaVersion:99})));assert.throws(()=>parseBackupMetadata(JSON.stringify({...metadata,sessions:[metadata.sessions[0],metadata.sessions[0]]})));checks++;
  const bytes=await fs.readFile(file);bytes[bytes.length-1]^=1;await fs.writeFile(path.join(root,'corrupt'),bytes);await assert.rejects(readArchive(path.join(root,'corrupt'),path.join(root,'corrupt-out')),/校验/);checks++;
  await fs.writeFile(path.join(root,'truncated'),bytes.subarray(0,bytes.length-5));await assert.rejects(readArchive(path.join(root,'truncated'),path.join(root,'truncated-out')),/长度/);checks++;
  const imagePath=path.join(source,'session-images',id,imageId+'.png');await fs.rename(imagePath,imagePath+'.saved');await assert.rejects(engine.build(JSON.stringify(metadata),true));await fs.symlink(imagePath+'.saved',imagePath);await assert.rejects(engine.build(JSON.stringify(metadata),true),/符号/);await fs.unlink(imagePath);await fs.rename(imagePath+'.saved',imagePath);checks++;
  const block=path.join(audio.directory,id,'0');await fs.rename(block,path.join(root,'saved-block'));await assert.rejects(engine.build(JSON.stringify(metadata),true),/索引与分片/);await fs.rename(path.join(root,'saved-block'),block);checks++;
  const statfs=fs.statfs;fs.statfs=async()=>({bavail:0,bsize:4096});try{await assert.rejects(engine.build(JSON.stringify(metadata),true),/空间不足/);checks++}finally{fs.statfs=statfs}
  const cli=new QuarkProvider({runtimeScript:'/fixture',directory:'ai-agent/test'},root);cli.command=async()=>[{type:'list',code:0,data:{state:'partial'}},{type:'result',code:0,data:{successCount:1,fileCount:2}}];await assert.rejects(cli.upload(file,'parent',()=>{}),/没有确认/);cli.command=async()=>[{type:'result',code:0,data:{status:'READY',selected_backend:'go',runtime_path:'/unknown/v9/program'}}];await assert.rejects(cli.inspect(),/版本/);checks++;
  const dest=path.join(root,'dest'),destAudio=new RecordingStore(path.join(dest,'separate-volume'));
  const target=new BackupEngine(dest,{owner:()=>destAudio,restoreDirectory:()=>destAudio.directory,assertIdle:()=>{},refresh:()=>{}});
  const empty={...metadata,sessions:[]};const rollback=await target.build(JSON.stringify(empty),true);
  // Local rollback preparation and normal cloud preparation share the same parser and staging.
  await fs.copyFile(file,path.join(target.directory,artifact.name));await fs.writeFile(path.join(target.directory,artifact.id+'.artifact.json'),JSON.stringify(artifact));await fs.writeFile(path.join(target.directory,artifact.id+'.rollback.json'),JSON.stringify(artifact));
  let stage=await target.prepareRollback(artifact.id),token=await target.apply(stage.id,[id],rollback.id);assert.deepEqual(await target.pendingRestore(),{token});assert.equal(destAudio.read(id).durationMs,100);await target.settle(token,false);await assert.rejects(fs.access(path.join(dest,'session-images',id)));assert.equal(await target.pendingRestore(),null);checks++;
  stage=await target.prepareRollback(artifact.id);token=await target.apply(stage.id,[id],rollback.id);await target.settle(token,true);assert.equal((await fileHash(path.join(dest,'session-images',id,imageId+'.png'))).sha256,metadata.sessions[0].images[0].sha256);checks++;
  const before=await target.build(JSON.stringify(metadata),true);stage=await target.prepareRollback(artifact.id);token=await target.apply(stage.id,[id],before.id);await target.settle(token,false);await target.settle(token,false);assert.equal(destAudio.read(id).durationMs,100);checks++;
  stage=await target.prepareRollback(artifact.id);const rename=fs.rename;let injected=false;fs.rename=async(from,to)=>{if(!injected&&from.includes('assets/images')&&to===path.join(dest,'session-images',id)){injected=true;throw new Error('injected IO failure')}return rename(from,to)};try{await assert.rejects(target.apply(stage.id,[id],before.id),/injected/);assert.equal((await fileHash(path.join(dest,'session-images',id,imageId+'.png'))).sha256,metadata.sessions[0].images[0].sha256);assert.equal(await target.pendingRestore(),null);checks++}finally{fs.rename=rename}
  // Persisted unknown state must recover the same upload record, never issue a new upload.
  const original=Object.fromEntries(['inspect','directory','upload','browse','originalTask','download'].map(k=>[k,QuarkProvider.prototype[k]]));let first=true,uploads=[];
  Object.assign(QuarkProvider.prototype,{inspect:async()=>{},directory:async()=> 'parent',upload:async(_file,_parent,event,record)=>{uploads.push(record);event({data:{recordId:'original-record'}});if(first){first=false;throw new Error('connection lost')}},browse:async()=>[{fid:'cloud-fid',filename:artifact.name,size:artifact.bytes,file_type:'1'}],originalTask:async()=>{throw new Error('already saved record')},download:async(_fid,out)=>{const result=path.join(out,artifact.name);await fs.mkdir(out,{recursive:true});await fs.copyFile(file,result);return result}});
  try{const config={provider:'quark',quark:{runtimeScript:'/fixture',directory:'ai-agent/_scratch/test'}};await assert.rejects(engine.upload(config,artifact.id),/原任务/);const job=(await engine.jobs())[0];assert.equal(job.taskId,'original-record');assert.equal(job.state,'unknown');assert.equal((await engine.resume(config,job.id)).state,'complete');assert.deepEqual(uploads,[undefined,'original-record']);checks++}finally{Object.assign(QuarkProvider.prototype,original)}
  console.log(JSON.stringify({ok:true,checks}));
 }finally{await fs.rm(root,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
