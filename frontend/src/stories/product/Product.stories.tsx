import { useEffect, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fireEvent, userEvent, waitFor, within } from 'storybook/test'
import App from '../../App'
import { preparePreview } from '../review/preparePreview'
import { meetings } from '../review/fixtures'
import { saveSessions, saveSettings, saveTopics } from '../../utils/storage'
import { getDefaultSettings } from '../../utils/storageShared'
import { useUIStore, type WorkspaceView, type SettingsSection } from '../../stores/uiStore'
import { useTopicStore } from '../../stores/topicStore'

function Product({ view = 'live', section = 'provider', updates = false }: { view?: WorkspaceView; section?: SettingsSection; updates?: boolean }) {
  const [ready, setReady] = useState(false), [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void (async () => {
      await preparePreview()
      document.title = 'DeLive · 正式组件隔离验收'
      // Real product components, isolated browser storage and blocked desktop/network operations.
      window.electronAPI = { ...window.electronAPI, onApiGetSessions: () => () => {}, onApiGetSessionDetail: () => () => {}, onApiSearchSessions: () => () => {}, onApiGetTopics: () => () => {}, onApiGetTags: () => () => {}, onApiGetRecordingStatus: () => () => {}, apiUpdateOpenApiConfig: () => {}, getAppVersion: async () => '2.3.0-sq.2' } as typeof window.electronAPI
      const updateListeners = new Set<(info: { version: string }) => void>()
      Object.assign(window.electronAPI!, {
        supportsAutoUpdate: updates,
        onCheckingForUpdate: () => () => {}, onUpdateAvailable: () => () => {}, onUpdateDownloaded: () => () => {}, onUpdateError: () => () => {}, onDownloadProgress: () => () => {},
        onUpdateNotAvailable: (callback: (info: { version: string }) => void) => { updateListeners.add(callback); return () => updateListeners.delete(callback) },
        checkForUpdates: async () => { updateListeners.forEach(callback => callback({ version: '2.3.0-sq.2' })); return { success: true, version: '2.3.0-sq.2' } },
      })
      saveSettings({ ...getDefaultSettings(), aiPostProcess: { enabled: false }, autoCheckUpdate: false })
      saveTopics([{ id: 'product-topic', name: '产品与设计', emoji: '💡', description: '持续整理设计讨论与会议记录。', createdAt: 1, updatedAt: 1 }])
      await saveSessions(meetings.map(meeting => ({ ...meeting, topicId: 'product-topic' })))
      localStorage.setItem('delive_last_seen_version', '2.3.0')
      useTopicStore.setState({ selectedTopicId: null, activeTopicId: null })
      useUIStore.setState({ currentView: view, settingsSection: section, settingsOrigin: null, reviewSessionId: view === 'review' ? meetings[0].id : null, reviewOriginTopicId: null })
      if (active) setReady(true)
    })().catch(cause => { if (active) setError(String(cause)) })
    return () => { active = false }
  }, [view, section, updates])
  return error ? <p role="alert">{error}</p> : ready ? <App /> : <p role="status">准备正式组件隔离验收…</p>
}

const meta = { title: 'DeLive/正式工作台', component: Product, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof Product>
export default meta
type Story = StoryObj<typeof meta>
export const Workspace: Story = {}
export const Topics: Story = { args: { view: 'topics' } }
export const Settings: Story = { args: { view: 'settings' } }
export const Review: Story = { args: { view: 'review' } }
export const Files: Story = { args: { view: 'file' } }
export const OpenApi: Story = { args: { view: 'settings', section: 'openApi' } }
export const Backup: Story = { args: { view: 'settings', section: 'cloudBackup' } }
export const Navigation: Story = {
  name: '自检 · 主题与正式回顾往返', args: { view: 'topics' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement), screen = within(document.body)
    await userEvent.click(await canvas.findByRole('button', { name: /💡 产品与设计/ }, { timeout: 15000 }))
    await userEvent.type(canvas.getByRole('textbox'), '不存在的会议')
    await expect(canvas.getByRole('textbox')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: '清除搜索' }))
    await userEvent.click(canvas.getByRole('button', { name: /让会议记录，更好读一点/ }))
    await expect(canvas.getByRole('button', { name: '返回主题' })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: '返回主题' }))
    await waitFor(() => expect(canvas.getByRole('heading', { name: '💡 产品与设计' })).toBeVisible())
    await userEvent.click(canvas.getByRole('button', { name: '编辑主题' }))
    const dialog = within(screen.getByRole('dialog', { name: '编辑主题' }))
    fireEvent.change(dialog.getByLabelText('主题名称'), { target: { value: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwx' } })
    await userEvent.click(dialog.getByRole('button', { name: /^保存$/ }))
    await expect(screen.queryByRole('dialog', { name: '编辑主题' })).not.toBeInTheDocument()
    const page = canvasElement.querySelector('.app-page-scroll')!
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth + 1)
    await userEvent.click(canvas.getByRole('button', { name: '录制新内容' }))
    await expect(useTopicStore.getState().activeTopicId).toBe('product-topic')
    await expect(useUIStore.getState().currentView).toBe('live')
    canvasElement.dataset.productNavigation = 'passed'
  },
}

export const SettingsNavigation: Story = {
  name: '自检 · 设置导航与草稿保护', args: { view: 'settings' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement), screen = within(document.body)
    const nav = await canvas.findByRole('navigation', { name: '设置' }, { timeout: 15000 })
    for (const label of ['火山文件存储', 'AI 后处理', '外观', '开放 API', '云端备份', '数据管理', '关于', '服务商']) {
      await userEvent.click(within(nav).getByRole('button', { name: label }))
      await waitFor(() => expect(within(nav).getByRole('button', { name: label })).toHaveAttribute('aria-current', 'page'))
      await expect(screen.queryByRole('dialog', { name: '请确认' })).not.toBeInTheDocument()
    }
    fireEvent.change(canvas.getByLabelText('API Key', { selector: 'input' }), { target: { value: 'synthetic-draft' } })
    await userEvent.click(canvas.getByRole('button', { name: /命令面板/ }))
    await userEvent.click(screen.getByRole('option', { name: /导出/ }))
    await expect(screen.getByRole('dialog', { name: '请确认' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: /^取消$/ }))
    await expect(canvas.getByLabelText('API Key', { selector: 'input' })).toHaveValue('synthetic-draft')
    await userEvent.click(canvas.getByRole('button', { name: /命令面板/ }))
    await userEvent.click(screen.getByRole('option', { name: /导出/ }))
    await userEvent.click(screen.getByRole('button', { name: /^确认$/ }))
    await waitFor(() => expect(within(nav).getByRole('button', { name: '数据管理' })).toHaveAttribute('aria-current', 'page'))
    await userEvent.click(within(nav).getByRole('button', { name: '服务商' }))
    await expect(canvas.getByLabelText('API Key', { selector: 'input' })).toHaveValue('')
    canvasElement.dataset.productSettings = 'passed'
  },
}

export const UpdateStatus: Story = {
  name: '自检 · 更新状态回执', args: { view: 'settings', section: 'about', updates: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: '检查更新' }, { timeout: 15000 }))
    await waitFor(() => expect(canvas.getByText('已是最新版本', { selector: 'p' })).toBeVisible())
    canvasElement.dataset.productUpdates = 'passed'
  },
}

export const Controls: Story = {
  name: '自检 · 公共控件与危险操作取消',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement), screen = within(document.body)
    await userEvent.click(await canvas.findByRole('combobox', { name: '选择主题' }, { timeout: 15000 }))
    await userEvent.keyboard('{ArrowDown}{Enter}')
    await expect(useTopicStore.getState().activeTopicId).toBe('product-topic')
    await userEvent.click(canvas.getByRole('button', { name: '新建主题' }))
    const dialog = within(screen.getByRole('dialog', { name: '新建主题' }))
    await userEvent.type(dialog.getByLabelText('主题名称'), '键盘与弹窗验收')
    await userEvent.click(dialog.getByRole('button', { name: /^创建$/ }))
    await expect(useTopicStore.getState().topics.some(topic => topic.name === '键盘与弹窗验收')).toBe(true)
    await userEvent.click(canvas.getByRole('button', { name: /命令面板/ }))
    await userEvent.type(screen.getByRole('textbox', { name: '命令面板' }), 'nothing-matches')
    await userEvent.keyboard('{ArrowDown}{Enter}')
    await expect(screen.getByRole('dialog', { name: '命令面板' })).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await userEvent.click(canvas.getByRole('button', { name: /^设置$/ }))
    await userEvent.click(canvas.getByRole('button', { name: '开放 API' }))
    await userEvent.click(canvas.getByRole('switch', { name: '启用开放 API' }))
    const token = canvas.getByLabelText('访问令牌 (Token)', { selector: 'input' }) as HTMLInputElement
    const before = token.value
    await userEvent.click(canvas.getByTitle('生成随机令牌'))
    await userEvent.click(screen.getByRole('button', { name: /^取消$/ }))
    await expect(token.value).toBe(before)
    const page = canvasElement.querySelector('.app-workspace')!
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth + 1)
    canvasElement.dataset.productControls = 'passed'
  },
}

export const ImportTopics: Story = {
  name: '自检 · JSON 导入后主题立即刷新', args: { view: 'settings', section: 'dataManagement' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement), screen = within(document.body)
    await canvas.findByRole('button', { name: '导入数据' }, { timeout: 15000 })
    const backup = { version: '3.0', schemaVersion: 3, sessions: [], tags: [], settings: {}, topics: [{ id: 'imported-topic', name: '导入主题', emoji: '📚', createdAt: 1, updatedAt: 1 }] }
    fireEvent.change(canvasElement.querySelector('input[type=file]')!, { target: { files: [new File([JSON.stringify(backup)], 'synthetic.json', { type: 'application/json' })] } })
    await userEvent.click(await screen.findByRole('button', { name: '合并导入' }))
    await waitFor(() => expect(useTopicStore.getState().topics.some(topic => topic.id === 'imported-topic')).toBe(true))
    await userEvent.click(canvas.getByRole('button', { name: /^主题$/ }))
    await waitFor(() => expect(canvas.getByRole('button', { name: /📚 导入主题/ })).toBeVisible())
    await expect(useTopicStore.getState().topics.some(topic => topic.id === 'product-topic')).toBe(true)
    canvasElement.dataset.productImport = 'passed'
  },
}
