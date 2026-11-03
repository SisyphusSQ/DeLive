import { afterEach, expect, it, vi } from 'vitest'
import { queueImageRemoval, flushImageRemovals } from './imageCleanup'
import type { TranscriptSession } from '../types'
afterEach(()=>vi.unstubAllGlobals())
it('retries only explicit unreferenced deletions, retaining failed cleanup across restart',async()=>{
  const data=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v)})
  const remove=vi.fn().mockRejectedValueOnce(new Error('disk busy')).mockResolvedValue(undefined),removeSession=vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('window',{electronAPI:{sessionImages:{remove,removeSession}}})
  const assetPath='s/11111111-1111-1111-1111-111111111111.png'
  queueImageRemoval({sessionId:'s',assetPath})
  await flushImageRemovals([{id:'s',images:[{assetPath}]} as TranscriptSession]);expect(remove).not.toHaveBeenCalled()
  await expect(flushImageRemovals([])).rejects.toThrow('disk busy');expect(data.get('delive:image-cleanup')).toContain(assetPath)
  await flushImageRemovals([]);expect(remove).toHaveBeenCalledTimes(2);expect(data.get('delive:image-cleanup')).toBe('[]')
  expect(removeSession).not.toHaveBeenCalled()
})
