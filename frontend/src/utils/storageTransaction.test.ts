import { describe, expect, it } from 'vitest'
import { createTransaction } from './storageShared'

describe('durable IndexedDB transactions',()=>{
  function setup() {
    const transaction = { error: new Error('quota'), onerror:()=>{}, onabort:()=>{}, oncomplete:()=>{}, objectStore:()=>({}) }
    const db = { transaction:()=>transaction } as unknown as IDBDatabase
    return {transaction,db}
  }
  it('does not acknowledge request success before commit and reports a later abort',async()=>{
    const {transaction,db}=setup();let resolved=false
    const result=createTransaction(db,'sessions','readwrite',(_s,done)=>done('requested')).then(value=>{resolved=true;return value})
    await Promise.resolve();expect(resolved).toBe(false)
    transaction.onabort();await expect(result).rejects.toThrow('quota')
  })
  it('returns the request result only after transaction commit',async()=>{
    const {transaction,db}=setup();const result=createTransaction(db,'sessions','readwrite',(_s,done)=>done(123))
    transaction.oncomplete();expect(await result).toBe(123)
  })
})
