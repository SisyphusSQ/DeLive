import { useEffect, useState } from 'react'
import type { TranscriptSession } from '../../types'
import { inputFingerprint, type AiInputStamp } from '../../services/aiSessionContext'
import { timestamp } from '../../utils/reviewVersions'
import { useSettingsStore } from '../../stores/settingsStore'

export function AiStaleNotice({ session, result, correction = false }: { session: TranscriptSession; result?: AiInputStamp; correction?: boolean }) {
  const preference = useSettingsStore(s => s.settings.aiPostProcess?.preferCorrectedText) || 'auto'
  const [stale, setStale] = useState(false)
  useEffect(() => {
    let active = true
    if (!result) { setStale(false); return }
    void inputFingerprint(session, correction ? 'original' : preference).then(current => {
      if (active) setStale(!result.inputFingerprint || result.inputFingerprint !== current)
    }).catch(() => { if (active) setStale(true) })
    return () => { active = false }
  }, [session, result, correction, preference])
  return <>{stale ? <p role="status" className="my-2 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">此结果使用的文字版本、图片或说明与当前材料不一致（或旧结果没有来源记录），请重新生成。</p> : null}<div className="flex flex-wrap gap-2 text-xs">{result?.imageIds?.map(id => { const image = session.images?.find(i=>i.id===id); return image ? <a key={id} className="text-primary underline" href={`#image-${id}`}>图片依据 · {timestamp(image.atMs)} · {image.caption || image.name}</a> : <span key={id}>原图片已移除</span> })}</div></>
}
