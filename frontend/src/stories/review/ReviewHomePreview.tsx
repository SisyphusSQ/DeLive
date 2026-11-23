import { useEffect, useState, type CSSProperties } from 'react'
import { ActionDialog } from '../../components/ActionDialog'
import { ReviewDeskView } from '../../components/ReviewDeskView'
import { Sidebar } from '../../components/Sidebar'
import { useUIStore } from '../../stores/uiStore'
import { prepareReviewHome } from './reviewHomeFixtures'
import '../../workspace.css'
import './review-design.css'
import './review-home.css'

export function ReviewHomePreview() {
  const [collapsed, setCollapsed] = useState(true)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(false)

  useEffect(() => {
    let active = true
    void prepareReviewHome(new Date()).then(() => { if (active) setReady(true) })
      .catch((cause: unknown) => { if (active) setError(String(cause)) })
    return () => { active = false }
  }, [])

  return <div className="review-preview review-home-story">
    <div className="design-toolbar">
      <strong>回顾首页 · 正式组件</strong>
      <span className="design-disclaimer">合成数据</span>
    </div>
    {error ? <p className="p-8" role="alert">{error}</p> : !ready ? <p className="p-8" role="status">正在准备会议目录…</p> :
      <div className="review-stage app-workspace" style={{ '--review-sidebar': collapsed ? '56px' : '224px' } as CSSProperties}>
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(value => !value)} currentView="review"
          onNavigate={view => view === 'review' ? useUIStore.getState().setView('review') : setNotice(true)} recordingState="idle" />
        <div className="review-home-shell" style={{ marginLeft: 'var(--review-sidebar)' }}>
          <div className="app-workspace-bar"><div className="app-workspace-path"><span>工作台</span><span aria-hidden="true">/</span><span>回顾</span></div></div>
          <main className="review-home-main"><ReviewDeskView /></main>
        </div>
      </div>}
    <ActionDialog open={notice} title="回顾首页设计预览" description="可从目录打开示例会议，查看现有回顾详情。"
      onClose={() => setNotice(false)} actions={[{ label: '关闭', onClick: () => setNotice(false) }]} />
  </div>
}
