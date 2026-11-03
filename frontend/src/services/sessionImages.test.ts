import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, readFile, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
vi.mock('electron',()=>({app:{},nativeImage:{createFromBuffer:(b:Buffer)=>({isEmpty:()=>b.length<20,getSize:()=>({width:10,height:10})})}}))
import { SessionImageStore } from '../../../electron/sessionImages'
import { imageDataUrl } from './sessionImages'
import { validateSessionImages } from '../../../shared/sessionImages'
let dir:string, store:SessionImageStore
const png=Buffer.from([137,80,78,71,13,10,26,10,...new Array(30).fill(0)])
beforeEach(async()=>{dir=await mkdtemp(path.join(os.tmpdir(),'delive-images-'));store=new SessionImageStore(dir)})
afterEach(async()=>{vi.unstubAllGlobals();await rm(dir,{recursive:true,force:true})})
describe('managed image originals',()=>{
  it('copies bytes, reopens by stable relative path, validates metadata and removes only selected assets',async()=>{
    const a=await store.import('s',png,'../source.png'), b=await store.import('s',png,'b.png')
    expect(a.name).toBe('source.png')
    vi.stubGlobal('window',{electronAPI:{sessionImages:{read:async()=>new Uint8Array([0])}}})
    await expect(imageDataUrl('s',{...a,atMs:0,caption:''})).rejects.toThrow('校验不匹配')
    expect(await new SessionImageStore(dir).read('s',a.assetPath)).toEqual(png)
    expect(validateSessionImages([{...a,atMs:123,caption:'note'}],'s')).toHaveLength(1)
    await store.remove('s',a.assetPath)
    await expect(store.read('s',a.assetPath)).rejects.toThrow()
    expect(await store.read('s',b.assetPath)).toEqual(png)
    const orphan=await store.import('s',png,'orphan.png')
    await store.cleanupUnreferenced({s:[b.assetPath]})
    await expect(store.read('s',orphan.assetPath)).rejects.toThrow()
    expect(await store.read('s',b.assetPath)).toEqual(png)
    await store.removeSession('s')
    await store.removeSession('s')
  })
  it('rejects invalid formats, corrupt data, traversal and symlinks without modifying external files',async()=>{
    await expect(store.import('s',Buffer.from('text'),'wrong.png')).rejects.toThrow('仅支持')
    await expect(store.import('s',png.subarray(0,8),'broken.png')).rejects.toThrow('损坏')
    await expect(store.import('../escape',png,'x.png')).rejects.toThrow('编号')
    const outside=path.join(dir,'outside');await writeFile(outside,'preserve')
    await expect(new SessionImageStore(outside).import('s',png,'disk-failure.png')).rejects.toThrow()
    const a=await store.import('s',png,'x.png');await rm(path.join(dir,a.assetPath));await symlink(outside,path.join(dir,a.assetPath))
    await expect(store.read('s',a.assetPath)).rejects.toThrow('符号链接')
    await expect(store.remove('s',a.assetPath)).rejects.toThrow('符号链接')
    expect(await readFile(outside,'utf8')).toBe('preserve')
    expect(()=>validateSessionImages([{...a,assetPath:'../outside',atMs:0,caption:''}],'s')).toThrow('元数据')
  })
})
