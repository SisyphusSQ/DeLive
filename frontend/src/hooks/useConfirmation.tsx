import { useEffect, useRef, useState } from 'react'
import { ActionDialog } from '../components/ActionDialog'

export function useConfirmation() {
  const [message,setMessage]=useState('')
  const pending=useRef<(confirmed:boolean)=>void>()
  useEffect(()=>()=>{pending.current?.(false)},[])
  const finish=(value:boolean)=>{pending.current?.(value);pending.current=undefined;setMessage('')}
  return {
    confirm: (text:string) => new Promise<boolean>(resolve=>{pending.current?.(false);pending.current=resolve;setMessage(text)}),
    dialog: <ActionDialog open={!!message} title="请确认" description={message} onClose={()=>finish(false)} actions={[{label:'取消',onClick:()=>finish(false)},{label:'确认',variant:'primary',onClick:()=>finish(true)}]}/>,
  }
}
