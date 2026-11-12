import { useEffect, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fireEvent, userEvent, within } from 'storybook/test'
import { Moon, Sun, RotateCcw } from 'lucide-react'
import { Sidebar } from '../../components/Sidebar'
import { ReviewDeskView } from '../../components/ReviewDeskView'
import { ActionDialog } from '../../components/ActionDialog'
import { Select } from '../../components/ui/Select'
import { useUIStore } from '../../stores/uiStore'
import { colorThemes, type ColorThemeId } from '../../themes'
import { preparePreview } from './preparePreview'
import type { ReviewTab } from './NotebookInsights'
import { previewStates, type PreviewState } from './previewStates'
import { NotebookReview, type ReviewScenario } from './NotebookReview'
import './review-design.css'

const names: Record<ColorThemeId, string> = { violet: '鸢尾紫', cyan: '青蓝', rose: '玫瑰', green: '森林', amber: '琥珀', pink: '樱粉', slate: '石墨', orange: '暖橙' }

function ReviewPreview({ initial = 'proposal', scenario = 'normal', initialTab = '转录文本', initialState = 'ready' }: { initial?: 'current' | 'proposal'; scenario?: ReviewScenario; initialTab?: ReviewTab; initialState?: PreviewState }) {
  const [view, setView] = useState(initial), [ready, setReady] = useState(false), [error, setError] = useState('')
  const [collapsed, setCollapsed] = useState(initial === 'proposal'), [notice, setNotice] = useState(''), [reset, setReset] = useState(0)
  const [state, setState] = useState<PreviewState>(initialState)
  const ui = useUIStore()
  useEffect(() => {
    let active = true
    void preparePreview().then(() => { if (active) setReady(true) }).catch(e => { if (active) setError(String(e)) })
    return () => { active = false }
  }, [reset])
  const switchView = (value: 'current' | 'proposal') => { setView(value); setCollapsed(value === 'proposal') }
  return <div className="review-preview">
    <div className="design-toolbar">
      <span className="design-caption"><i />回顾页 · 设计工作台</span>
      <div className="design-views" aria-label="页面对照">
        <button aria-pressed={view === 'current'} onClick={() => switchView('current')}>01 现有页面</button>
        <button aria-pressed={view === 'proposal'} onClick={() => switchView('proposal')}>02 笔记式提案</button>
      </div>
      <span className="design-disclaimer">合成数据 · 原音为静音 · 不连接服务</span>
      <Select aria-label="状态预览" value={state} onChange={e => setState(e.target.value as PreviewState)} className="design-state">{Object.entries(previewStates).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select>
      <Select aria-label="预览配色" value={ui.colorTheme} onChange={e => ui.setColorTheme(e.target.value as ColorThemeId)} className="design-theme">{colorThemes.map(t => <option key={t.id} value={t.id}>{names[t.id]}</option>)}</Select>
      <button className="design-icon" aria-label={ui.resolvedTheme === 'light' ? '切换深色' : '切换浅色'} onClick={() => ui.setTheme(ui.resolvedTheme === 'light' ? 'dark' : 'light')}>{ui.resolvedTheme === 'light' ? <Moon size={15} /> : <Sun size={15} />}</button>
      <button className="design-icon" aria-label="重置合成预览" onClick={() => { setReady(false); setState(initialState); setReset(n => n + 1) }}><RotateCcw size={14} /></button>
    </div>
    {error ? <p role="alert">{error}</p> : !ready ? <p className="p-8">正在准备合成会议…</p> : <div className="review-stage" key={reset}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(v => !v)} currentView="review" onNavigate={() => setNotice('本次只预览回顾页，其他页面保留现有设计。')} recordingState="idle" />
      <div className="review-stage-content" style={{ marginLeft: collapsed ? 56 : 224 }}>
        {view === 'current' ? <ReviewDeskView /> : <NotebookReview scenario={scenario} initialTab={initialTab} state={state} onState={setState} />}
      </div>
    </div>}
    <ActionDialog open={!!notice} title="回顾页设计预览" description={notice} onClose={() => setNotice('')} actions={[{ label: '知道了', onClick: () => setNotice('') }]} />
  </div>
}

const meta = { title: 'DeLive/回顾页', component: ReviewPreview, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof ReviewPreview>
export default meta
type Story = StoryObj<typeof meta>
export const Current: Story = { name: '01 现有页面 · 正式组件', args: { initial: 'current' } }
export const Proposal: Story = { name: '02 笔记式提案', args: { initial: 'proposal' } }
export const Untimed: Story = { name: '03 历史稿 · 无逐句时间', args: { initial: 'proposal', scenario: 'untimed' } }
export const Empty: Story = { name: '04 空稿与缺失原音', args: { initial: 'proposal', scenario: 'empty' } }
export const LongTitle: Story = { name: '05 长标题与窄窗', args: { initial: 'proposal', scenario: 'long' } }
export const Interactions: Story = {
  name: '06 交互自检', args: { initial: 'proposal' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const review = await canvas.findByRole('button', { name: '审阅 2 处待确认' }, { timeout: 15000 })
    await userEvent.click(review)
    await expect(await canvas.findByRole('region', { name: '逐句审阅' })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: '采用会后建议' }))
    await expect(canvas.getByRole('button', { name: '审阅 1 处待确认' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: '定位 03:16' })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: '退出审阅' }))
    useUIStore.getState().setTheme('light')
    await userEvent.click(await canvas.findByRole('button', { name: '切换深色' }))
    await expect(document.documentElement).toHaveClass('dark')
    await userEvent.click(canvas.getByRole('button', { name: '切换浅色' }))
    for (const theme of colorThemes) {
      await userEvent.click(canvas.getByRole('combobox', { name: '预览配色' }))
      await userEvent.click(within(document.body).getByRole('option', { name: names[theme.id] }))
      await expect(canvas.getByRole('combobox', { name: '预览配色' })).toHaveTextContent(names[theme.id])
    }
    useUIStore.getState().setColorTheme('violet')
    canvasElement.dataset.selfCheck = 'passed'
  },
}

export const Summary: Story = { name: '07 摘要 · 会议笔记', args: { initialTab: '摘要' } }
export const Chat: Story = { name: '08 对话 · 原文引用', args: { initialTab: '对话' } }
export const MindMap: Story = { name: '09 思维导图 · 主题脉络', args: { initialTab: '思维导图' } }
export const InsightInteractions: Story = {
  name: '10 页签交互自检', args: { initialTab: '摘要' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const task = await canvas.findByRole('checkbox', { name: '整理回顾页参考与设计稿' }, { timeout: 15000 })
    await userEvent.click(task)
    await expect(task).toBeChecked()
    await userEvent.click(canvas.getByRole('button', { name: '对话' }))
    await userEvent.click(canvas.getByRole('button', { name: '接下来要做哪些事？' }))
    await expect(canvas.getByText(/会议没有为每项工作明确负责人/)).toBeVisible()
    await fireEvent.change(canvas.getByRole('textbox', { name: '向会议提问' }), { target: { value: '新的问题' } })
    await userEvent.click(canvas.getByRole('button', { name: '发送问题' }))
    await expect(canvas.getByText(/暂时不能回答新的问题/)).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: '思维导图' }))
    const branch = canvas.getByRole('button', { name: /把空间交还给正文/ })
    await userEvent.click(branch)
    await expect(branch).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(branch)
    await userEvent.click(canvas.getByRole('button', { name: '紧凑的会议列表' }))
    const detail = canvas.getByRole('complementary', { name: '导图原文引用' })
    await userEvent.click(within(detail).getByRole('button', { name: '查看原文 00:38' }))
    await expect(canvas.getByRole('button', { name: /^播放第 2 段/ })).toHaveFocus()
    await userEvent.click(canvas.getByRole('button', { name: '摘要' }))
    await expect(canvas.getByRole('checkbox', { name: '整理回顾页参考与设计稿' })).toBeChecked()
    canvasElement.dataset.insightCheck = 'passed'
  },
}

export const Unconfigured: Story = { name: '11 AI 未配置', args: { initialTab: '摘要', initialState: 'unconfigured' } }
export const Generating: Story = { name: '12 AI 生成中', args: { initialTab: '对话', initialState: 'generating' } }
export const Failed: Story = { name: '13 AI 失败与重试', args: { initialTab: '思维导图', initialState: 'failed' } }
export const Stale: Story = { name: '14 资料变化与过期内容', args: { initialTab: '摘要', initialState: 'stale' } }
export const SaveFailed: Story = { name: '15 保存失败与草稿保护', args: { initialState: 'saveFailed' } }
export const TaskUnknown: Story = { name: '16 转写提交结果未知', args: { initialState: 'unknown' } }
export const AwaitingSave: Story = { name: '17 结果待保存与清理', args: { initialState: 'awaitingSave' } }
export const ImagesOnly: Story = { name: '18 仅图片 · 仍可使用 AI', args: { scenario: 'imagesOnly' } }

export const CoverageInteractions: Story = {
  name: '19 功能覆盖自检', args: { initialState: 'saveFailed' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement), body = within(document.body)
    await userEvent.click(await canvas.findByRole('button', { name: '编辑文字与说话人' }, { timeout: 15000 }))
    const paragraph = canvas.getByRole('textbox', { name: '第 1 段正文' })
    await fireEvent.change(paragraph, { target: { value: '未保存的合成修订' } })
    await userEvent.click(canvas.getByRole('button', { name: '保存为新修订版' }))
    await expect(paragraph).toHaveValue('未保存的合成修订')
    await expect(canvas.getByRole('button', { name: '采用此稿' })).toBeDisabled()
    await userEvent.click(canvas.getByRole('button', { name: '摘要' }))
    await userEvent.click(canvas.getByRole('button', { name: '转录文本' }))
    await expect(canvas.getByRole('textbox', { name: '第 1 段正文' })).toHaveValue('未保存的合成修订')
    await userEvent.click(canvas.getByRole('button', { name: '解除失败示例' }))
    await userEvent.click(canvas.getByRole('button', { name: '保存为新修订版' }))
    await expect(canvas.getByText('导出与 AI 仍使用会后稿')).toBeVisible()
    await expect(canvas.getByRole('button', { name: /播放第 1 段：未保存的合成修订/ })).toBeVisible()
    await expect(canvas.getByRole('button', { name: /^播放第 12 段/ })).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: '对话' }))
    await userEvent.click(canvas.getByRole('button', { name: '新建对话' }))
    const question = canvas.getByRole('textbox', { name: '向会议提问' })
    await fireEvent.change(question, { target: { value: '本地新问题' } })
    await fireEvent.keyDown(question, { key: 'Enter' })
    await expect(canvas.getByText(/暂时不能回答新的问题/)).toBeVisible()
    await userEvent.click(canvas.getByRole('combobox', { name: '历史对话' }))
    await userEvent.click(body.getByRole('option', { name: '回顾页设计决策' }))
    await expect(canvas.getByRole('button', { name: '复制第 1 个问题' })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: '思维导图' }))
    await userEvent.click(canvas.getByRole('button', { name: '编辑 Markdown' }))
    const markdown = canvas.getByRole('textbox', { name: '导图 Markdown' })
    await fireEvent.change(markdown, { target: { value: '# 合成导图\n## 保留编辑草稿' } })
    await userEvent.click(canvas.getByRole('button', { name: '转录文本' }))
    await userEvent.click(canvas.getByRole('button', { name: '思维导图' }))
    await expect(canvas.getByRole('textbox', { name: '导图 Markdown' })).toHaveValue('# 合成导图\n## 保留编辑草稿')
    await userEvent.click(canvas.getByRole('button', { name: '保存导图' }))
    await expect(canvas.getByText('已保存本次预览导图')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: '全屏' }))
    await expect(body.getByRole('dialog', { name: '全屏思维导图' })).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect(canvas.getByRole('button', { name: '全屏' })).toHaveFocus()
    canvasElement.dataset.coverageCheck = 'passed'
  },
}
export const RecoveryInteractions: Story = {
  name: '20 历史稿恢复自检', args: { scenario: 'untimed' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement), body = within(document.body)
    await userEvent.click(await canvas.findByRole('button', { name: '摘要' }, { timeout: 15000 }))
    await expect(canvas.getByRole('heading', { name: '让回顾，像读一页笔记' })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: '转录文本' }))
    await userEvent.click(canvas.getByRole('button', { name: '恢复说话人与时间轴' }))
    await userEvent.click(body.getByRole('button', { name: '创建恢复修订版' }))
    await expect(canvas.getByText('导出与 AI 仍使用历史稿')).toBeVisible()
    await expect(canvas.getByRole('button', { name: '定位 00:12' })).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: '导出' }))
    await expect(canvas.getByRole('button', { name: 'SRT' })).toBeDisabled()
    await userEvent.click(canvas.getByRole('button', { name: '取消导出' }))
    await userEvent.click(canvas.getByRole('button', { name: '采用此稿' }))
    await userEvent.click(body.getByRole('button', { name: '在预览中采用' }))
    await userEvent.click(canvas.getByRole('button', { name: '导出' }))
    await expect(canvas.getByRole('button', { name: 'SRT' })).toBeEnabled()
    canvasElement.dataset.recoveryCheck = 'passed'
  },
}
export const TaskInteractions: Story = {
  name: '21 任务与图片状态自检', args: { initialState: 'unknown' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement), body = within(document.body)
    await expect(await canvas.findByText('尚未确认服务端是否接收。先查询原任务，避免重复提交和计费。', {}, { timeout: 15000 })).toBeVisible()
    await expect(canvas.getByRole('button', { name: '重新转写原音' })).toBeDisabled()
    await userEvent.click(canvas.getByRole('button', { name: '查询 / 继续查询' }))
    await userEvent.click(canvas.getByRole('button', { name: '查询 / 继续查询' }))
    await userEvent.click(canvas.getByRole('button', { name: '重试保存 / 本地合并' }))
    await expect(canvas.getByText('会后稿已保存，自动校正版可用。本地原音保留。')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: '图片资料' }))
    await userEvent.click(canvas.getByRole('button', { name: '编辑时间与说明' }))
    await userEvent.clear(canvas.getByRole('textbox', { name: '图片说明' })); await userEvent.type(canvas.getByRole('textbox', { name: '图片说明' }), '更新后的合成草图')
    await userEvent.click(canvas.getByRole('button', { name: '保存图片信息' }))
    await userEvent.click(canvas.getByRole('button', { name: '摘要' }))
    await expect(canvas.getByText(/采用稿或图片资料已改变/)).toBeVisible()
    await userEvent.click(canvas.getByRole('combobox', { name: '状态预览' }))
    await userEvent.click(body.getByRole('option', { name: 'AI 未配置' }))
    await expect(canvas.getByRole('button', { name: '重新生成摘要' })).toBeDisabled()
    canvasElement.dataset.taskCheck = 'passed'
  },
}
