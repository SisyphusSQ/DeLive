// Isolated SDK contract exercise. Loopback HTTP fixture only, synthetic credentials/data.
const http = require('node:http'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict')
const { S3TemporaryAudioStore } = require('../dist-electron/electron/fileTranscription/s3TemporaryStore')
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'delive-s3-fixture-')), calls=[]
let objectExists=false, versioned=false, partial=true
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1'),key=url.pathname.replace('/fixture/','')
 calls.push(req.method+' '+(url.searchParams.has('versioning')?'versioning':url.searchParams.has('uploads')?'multipart-list-or-start':url.searchParams.has('uploadId')?'multipart-part-or-finish':key))
 assert(req.headers.authorization?.includes('synthetic-access'))
 for await(const _chunk of req){}
 res.setHeader('content-type','application/xml')
 if(req.method==='GET'&&url.searchParams.has('versioning')) return res.end('<VersioningConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">'+(versioned?'<Status>Enabled</Status>':'')+'</VersioningConfiguration>')
 if(req.method==='POST'&&url.searchParams.has('uploads')) return res.end('<InitiateMultipartUploadResult><Bucket>fixture</Bucket><Key>'+key+'</Key><UploadId>fixture-upload</UploadId></InitiateMultipartUploadResult>')
 if(req.method==='PUT'){res.setHeader('ETag','"fixture-etag"');objectExists=true;return res.end()}
 if(req.method==='POST'&&url.searchParams.has('uploadId')) {objectExists=true;return res.end('<CompleteMultipartUploadResult><Bucket>fixture</Bucket><Key>'+key+'</Key><ETag>"fixture-etag"</ETag></CompleteMultipartUploadResult>')}
 if(req.method==='GET'&&url.searchParams.has('uploads')) return res.end('<ListMultipartUploadsResult><IsTruncated>false</IsTruncated>'+(partial?'<Upload><Key>task/audio.wav</Key><UploadId>crashed-part</UploadId></Upload>':'')+'</ListMultipartUploadsResult>')
 if(req.method==='DELETE'&&url.searchParams.has('uploadId')){partial=false;res.statusCode=204;return res.end()}
 if(req.method==='DELETE'){objectExists=false;res.statusCode=204;return res.end()}
 if(req.method==='HEAD'){res.statusCode=objectExists?200:404;return res.end()}
 res.statusCode=400;res.end()
})
async function main(){
 await new Promise(r=>server.listen(0,'127.0.0.1',r))
 const store=new S3TemporaryAudioStore({endpoint:'http://127.0.0.1:'+server.address().port,region:'fixture',bucket:'fixture',prefix:'task',forcePathStyle:true,accessKeyId:'synthetic-access',secretAccessKey:'synthetic-secret',urlTtlSeconds:86400})
 try{
  const file=path.join(dir,'audio.wav');fs.writeFileSync(file,Buffer.alloc(17*1024*1024,3))
  let uploaded=0;await store.upload('task/audio.wav',file,new AbortController().signal,n=>uploaded=n)
  assert.equal(uploaded,fs.statSync(file).size)
  const signed=new URL(await store.signedUrl('task/audio.wav',86400))
  assert.equal(signed.searchParams.get('X-Amz-Expires'),'86400');assert(signed.searchParams.has('X-Amz-Signature'))
  assert.equal(signed.pathname,'/fixture/task/audio.wav')
  await store.remove('task/audio.wav');assert.equal(objectExists,false);assert.equal(partial,false)
  versioned=true;await assert.rejects(store.upload('task/audio.wav',file,new AbortController().signal,()=>{}),/版本控制/)
  const report={status:'PASS',fixture:'loopback HTTP, fake keys, 17 MiB synthetic bytes',checks:['SDK multipart upload/progress','24-hour SigV4 URL without persistence','abort orphan multipart','delete then HEAD 404','reject versioned buckets'],requests:calls}
  fs.writeFileSync(path.join(__dirname,'../tmp/evidence/684-s3-integration.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report))
 }finally{store.close();server.close();fs.rmSync(dir,{recursive:true,force:true})}
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1})
