const http=require('http'),fs=require('fs/promises'),os=require('os'),path=require('path'),assert=require('assert/strict');
const {s3UploadArchive,s3DownloadArchive,s3List,s3Upload,s3Download}=require('../dist-electron/electron/cloudBackup/s3Provider');
const {webdavUploadArchive,webdavDownloadArchive,webdavList,webdavUpload,webdavDownload}=require('../dist-electron/electron/cloudBackup/webdavProvider');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'delive-backup-providers-')),files=new Map();
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost'),key=decodeURIComponent(url.pathname);
  if(req.method==='PUT'){const parts=[];for await(const part of req)parts.push(part);files.set(key,Buffer.concat(parts));res.setHeader('ETag','"fixture"');res.end();return}
  if(req.method==='PROPFIND'){res.statusCode=207;res.setHeader('Content-Type','application/xml');res.end('<D:multistatus xmlns:D="DAV:">'+[...files].filter(([k])=>k.startsWith('/dav/')).map(([k,v])=>`<D:response><D:href>${k}</D:href><D:getcontentlength>${v.length}</D:getcontentlength><D:getlastmodified>Tue, 03 Nov 2026 06:00:00 GMT</D:getlastmodified></D:response>`).join('')+'</D:multistatus>');return}
  if(url.searchParams.has('list-type')){res.setHeader('Content-Type','application/xml');res.end('<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><IsTruncated>false</IsTruncated>'+[...files].filter(([k])=>k.startsWith('/bucket/')).map(([k,v])=>`<Contents><Key>${k.slice(8)}</Key><Size>${v.length}</Size><LastModified>2026-11-03T06:00:00.000Z</LastModified></Contents>`).join('')+'</ListBucketResult>');return}
  if(files.has(key)){const value=files.get(key);res.setHeader('Content-Length',value.length);res.end(value);return}res.statusCode=404;res.end();
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const url='http://127.0.0.1:'+server.address().port,s3={endpoint:url,region:'us-east-1',bucket:'bucket',prefix:'backups',accessKeyId:'fixture',secretAccessKey:'fixture',forcePathStyle:true},dav={url:url+'/dav',basePath:'',username:'fixture',password:'fixture'},source=path.join(dir,'source'),bytes=Buffer.alloc(3*1024*1024,63);await fs.writeFile(source,bytes);
  const skey=await s3UploadArchive(s3,source,'full.delive',()=>{});await s3DownloadArchive(s3,skey,path.join(dir,'s3'));assert.deepEqual(await fs.readFile(path.join(dir,'s3')),bytes);assert.equal((await s3List(s3)).files[0].size,bytes.length);
  const dkey=await webdavUploadArchive(dav,source,'full.delive');await webdavDownloadArchive(dav,dkey,path.join(dir,'dav'));assert.deepEqual(await fs.readFile(path.join(dir,'dav')),bytes);assert.equal((await webdavList(dav)).files[0].size,bytes.length);
  const oldS=await s3Upload(s3,'{"legacy":true}'),oldD=await webdavUpload(dav,'{"legacy":true}');assert.equal((await s3Download(s3,oldS.key)).data,'{"legacy":true}');assert.equal((await webdavDownload(dav,oldD.key)).data,'{"legacy":true}');
  console.log(JSON.stringify({ok:true,checks:['S3 binary roundtrip','WebDAV binary roundtrip','size listing','legacy JSON both providers']}));
 }finally{await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
