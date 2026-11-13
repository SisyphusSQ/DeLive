import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fireEvent, userEvent, within } from 'storybook/test'
import { WorkspacePreview } from './WorkspacePreview'
import { meeting } from '../review/fixtures'
import { Select } from '../../components/ui/Select'

const meta = { title: 'DeLive/核心工作台', component: WorkspacePreview, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof WorkspacePreview>
export default meta
type Story = StoryObj<typeof meta>
export const FullPreview: Story = { name: '00 全页面 · 从这里开始', args: { initialConfigured: true } }
export const Topics: Story = { name: '主题 · 列表与整理', args: { initialView: 'topics', initialConfigured: true } }
export const TopicDetail: Story = { name: '主题 · 会议详情', args: { initialView: 'topics', initialTopic: 'storybook-topic', initialConfigured: true } }
export const EmptyTopic: Story = { name: '主题 · 尚无会议', args: { initialView: 'topics', initialTopic: 'storybook-learning' } }
export const AiSettings: Story = { name: '设置 · AI 与模型', args: { initialView: 'settings', initialSettings: 'ai', initialConfigured: true } }
export const StorageSettings: Story = { name: '设置 · 私有临时存储', args: { initialView: 'settings', initialSettings: 'storage' } }
export const OpenApi: Story = { name: '设置 · 开放 API', args: { initialView: 'settings', initialSettings: 'openApi' } }
export const Backup: Story = { name: '设置 · 备份与恢复', args: { initialView: 'settings', initialSettings: 'backup' } }
export const BackupFailure: Story = { name: '设置 · 备份失败', args: { initialView: 'settings', initialSettings: 'backup', initialOperationFails: true } }
export const Data: Story = { name: '设置 · 数据与诊断', args: { initialView: 'settings', initialSettings: 'data' } }
export const About: Story = { name: '设置 · 关于与更新', args: { initialView: 'settings', initialSettings: 'about' } }
export const Review: Story = { name: '回顾 · 完整工作台', args: { initialView: 'review', initialConfigured: true } }
export const LocalRuntime: Story = { name: '设置 · 本地模型准备', args: { initialView: 'settings', initialEngine: '本地 whisper.cpp' } }
export const Loading: Story = { name: '启动 · 正在读取', args: { initialShell: 'loading' } }
export const LoadFailed: Story = { name: '启动 · 读取失败', args: { initialShell: 'loadFailed' } }
export const Restoring: Story = { name: '启动 · 恢复中', args: { initialShell: 'restoring' } }
export const RestoreFailed: Story = { name: '启动 · 恢复未完成', args: { initialShell: 'restoreFailed' } }
export const Recording: Story = { name: '录制 · 来源与实时稿' }
export const Reconnect: Story = { name: '录制 · 转写中断', args: { initialCapture: 'reconnecting', initialConfigured: true } }
export const Recovery: Story = { name: '录制 · 中断恢复', args: { initialCapture: 'interrupted', fileOnly: true } }
export const Files: Story = { name: '文件 · 来源与配置', args: { initialView: 'file' } }
export const Tasks: Story = { name: '文件 · 待保存和清理', args: { initialView: 'file', initialConfigured: true, initialTask: 'awaitingSave', fileOnly: true } }
export const Settings: Story = { name: '设置 · 转写、存储和 AI', args: { initialView: 'settings' } }
export const Appearance: Story = { name: '设置 · 外观', args: { initialView: 'settings', initialSettings: 'appearance' } }
export const RecordingBaseline: Story = { name: '录制 · 正式组件基线', args: { baseline: true } }
export const FilesBaseline: Story = { name: '文件 · 正式组件基线', args: { initialView: 'file', baseline: true } }
export const SettingsBaseline: Story = { name: '设置 · 正式组件基线', args: { initialView: 'settings', baseline: true } }

export const SelectLayout: Story = {
  name: '自检 · 下拉定位、键盘与滚动',
  render: () => <div className="workspace-preview" style={{ padding: 20 }}>
    <div data-testid="select-scroll-area" style={{ overflow: 'auto', flex: 1 }}>
      <div style={{ minHeight: '140dvh', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'space-between', padding: 12 }}>
        <Select aria-label="顶部菜单" value="第一项"><option>第一项</option><option>第二项</option></Select>
        <Select aria-label="底部短菜单" value="第一项"><option>第一项</option><option disabled>不可选</option><option>最后一项</option></Select>
      </div>
    </div>
  </div>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement), screen = within(canvasElement.ownerDocument.body)
    const top = canvas.getByRole('combobox', { name: '顶部菜单' })
    await userEvent.click(top)
    let menu = screen.getByRole('listbox')
    await expect(Math.abs(menu.getBoundingClientRect().top - top.getBoundingClientRect().bottom - 4)).toBeLessThan(2)
    await expect(getComputedStyle(menu).fontSize).toBe(getComputedStyle(top).fontSize)
    await userEvent.keyboard('{Escape}')
    await expect(top).toHaveFocus()
    const bottom = canvas.getByRole('combobox', { name: '底部短菜单' })
    await new Promise<void>(resolve => {
      canvas.getByTestId('select-scroll-area').addEventListener('scroll', () => resolve(), { once: true })
      bottom.scrollIntoView({ block: 'end' })
    })
    await userEvent.click(bottom)
    menu = screen.getByRole('listbox')
    await expect(Math.abs(bottom.getBoundingClientRect().top - menu.getBoundingClientRect().bottom - 4)).toBeLessThan(2)
    await userEvent.keyboard('{ArrowDown}')
    await expect(menu).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: '最后一项' }).id)
    await userEvent.keyboard('{Enter}')
    await expect(bottom).toHaveFocus()
    await userEvent.click(bottom)
    menu = screen.getByRole('listbox')
    fireEvent.scroll(menu)
    await expect(menu).toBeVisible()
    fireEvent.scroll(canvas.getByTestId('select-scroll-area'))
    await expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    canvasElement.dataset.selectLayout = 'passed'
  },
}

export const LongTopicLayout: Story = {
  name: '自检 · 长名称与详情滚动',
  args: { initialView: 'topics' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement), screen = within(canvasElement.ownerDocument.body)
    const name = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwx'
    await userEvent.click(await canvas.findByRole('button', { name: '新建主题' }))
    const dialog = within(screen.getByRole('dialog', { name: '新建主题' }))
    fireEvent.change(dialog.getByLabelText('主题名称'), { target: { value: name } })
    fireEvent.change(dialog.getByLabelText('主题说明'), { target: { value: '长主题说明。'.repeat(30) } })
    await userEvent.click(dialog.getByRole('button', { name: '保存主题' }))
    const open = canvas.getByRole('button', { name: new RegExp(`📝 ${name}`) })
    open.scrollIntoView({ block: 'end' })
    await userEvent.click(open)
    const page = canvas.getByRole('region', { name: '主题工作台' })
    await expect(page.scrollTop).toBe(0)
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth + 1)
    await expect(canvas.getByRole('heading', { name: `📝 ${name}` })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: /^回顾$/ }))
    await userEvent.click(canvas.getByRole('button', { name: '会议信息' }))
    fireEvent.change(canvas.getByLabelText('会议标题'), { target: { value: name.repeat(2) } })
    await userEvent.click(canvas.getByRole('button', { name: '保存会议信息' }))
    for (const container of canvasElement.querySelectorAll('.notebook-scroll, .notes-list-scroll')) {
      await expect(container.scrollWidth).toBeLessThanOrEqual(container.clientWidth + 1)
    }
    canvasElement.dataset.longTopicLayout = 'passed'
  },
}

export const RecordingFlow: Story = {
  name: '自检 · 仅录音、保存与回顾',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(await canvas.findByRole('region', { name: '录制工作台' }))
    const start = page.getByRole('button', { name: '开始录制' })
    await expect(start).toBeDisabled()
    await userEvent.click(page.getByRole('radio', { name: /^仅录音$/ }))
    await userEvent.click(start)
    const dialog = within(await canvas.findByRole('dialog', { name: '选择系统声音来源' }))
    await expect(dialog.getByRole('button', { name: '使用此来源并录制' })).toBeDisabled()
    await userEvent.keyboard('{Escape}')
    await expect(start).toHaveFocus()
    await userEvent.click(start)
    await userEvent.click(dialog.getByRole('button', { name: '主显示器' }))
    await userEvent.click(dialog.getByRole('button', { name: '使用此来源并录制' }))
    await userEvent.click(page.getByRole('button', { name: '插入图片' }))
    await userEvent.click(canvas.getByRole('button', { name: /^文件$/ }))
    await userEvent.click(canvas.getByRole('button', { name: /录制中 · 返回录制/ }))
    await userEvent.click(page.getByRole('button', { name: '停止录制' }))
    await userEvent.click(await page.findByRole('button', { name: '打开已保存会议' }))
    await expect(canvas.getByText('此会议尚未转写')).toBeVisible()
    await expect(canvas.getByRole('button', { name: '播放静音原音预览' })).toBeEnabled()
    await userEvent.click(canvas.getByRole('button', { name: /^图片资料$/ }))
    await expect(canvas.getByRole('button', { name: '查看原图 录制截图' })).toBeVisible()
    const configure = canvas.getByRole('button', { name: /^配置火山凭据$/ })
    await userEvent.click(configure)
    await expect(canvas.getByRole('button', { name: '返回当前会议' })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: '返回当前会议' }))
    await expect(configure).toHaveFocus()
    await expect(canvas.getByText('此会议尚未转写')).toBeVisible()
    canvasElement.dataset.recordingFlow = 'passed'
  },
}

export const FileFlow: Story = {
  name: '自检 · 配置返回、查询原任务与稿件',
  args: { initialView: 'file', fileOnly: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const screen = within(canvasElement.ownerDocument.body)
    const files = within(await canvas.findByRole('region', { name: '文件工作台' }))
    const source = files.getByRole('combobox', { name: '选择会议原音' })
    const submit = files.getByRole('button', { name: '提交会后转写' })
    await userEvent.click(source)
    await userEvent.click(screen.getByRole('option', { name: new RegExp(meeting.title) }))
    await expect(submit).toBeDisabled()
    await userEvent.click(files.getByRole('button', { name: '配置转写服务' }))
    const settings = within(await canvas.findByRole('region', { name: '设置工作台' }))
    await userEvent.click(canvas.getByRole('button', { name: /^设置$/ }))
    await userEvent.click(settings.getByText('高级参数与本地模型', { exact: true }))
    const language = settings.getByRole('textbox', { name: '语言提示' })
    await fireEvent.change(language, { target: { value: 'zh' } })
    await userEvent.click(settings.getByRole('button', { name: '返回所选音频' }))
    const exit = within(screen.getByRole('dialog', { name: '放弃未保存的设置？' }))
    await userEvent.click(exit.getByRole('button', { name: '继续编辑' }))
    await expect(language).toHaveValue('zh')
    await fireEvent.change(settings.getByLabelText('API Key', { exact: true }), { target: { value: 'storybook-example' } })
    await userEvent.click(canvas.getByRole('checkbox', { name: '模拟保存失败' }))
    await userEvent.click(settings.getByRole('button', { name: '保存设置' }))
    await expect(settings.getByRole('alert')).toHaveTextContent('保存失败')
    await expect(settings.getByLabelText('API Key', { exact: true })).toHaveValue('storybook-example')
    await userEvent.click(canvas.getByRole('checkbox', { name: '模拟保存失败' }))
    await userEvent.click(settings.getByRole('button', { name: '保存设置' }))
    await userEvent.click(settings.getByRole('button', { name: '返回所选音频' }))
    await expect(source).toHaveTextContent(meeting.title)
    await expect(submit).toBeDisabled()
    const configureStorage = files.getByRole('button', { name: '配置私有存储' })
    await expect(configureStorage).toHaveFocus()
    await userEvent.click(configureStorage)
    const storage = within(await canvas.findByRole('region', { name: '设置工作台' }))
    for (const name of ['HTTPS Endpoint', '区域', '私有桶', '专用前缀', 'Access Key ID', 'Secret Access Key']) {
      await fireEvent.change(storage.getByLabelText(name, { exact: true }), { target: { value: name === 'HTTPS Endpoint' ? 'https://storage.example' : 'storybook-example' } })
    }
    await userEvent.click(storage.getByRole('button', { name: '保存设置' }))
    await userEvent.click(storage.getByRole('button', { name: '返回所选音频' }))
    await expect(source).toHaveTextContent(meeting.title)
    await expect(submit).toBeEnabled()
    await expect(submit).toHaveFocus()
    await expect(files.getByText(/暂无任务/)).toBeVisible()
    await userEvent.click(submit)
    await userEvent.click(screen.getByRole('button', { name: '确认提交（可能计费）' }))
    await files.findByText(/尚未确认服务端是否接收/, {}, { timeout: 6000 })
    await expect(submit).toBeDisabled()
    await userEvent.click(files.getByRole('button', { name: '查看待处理任务' }))
    await expect(files.getByRole('heading', { name: '任务列表' })).toHaveFocus()
    await userEvent.click(canvas.getByRole('button', { name: /^回顾$/ }))
    const review = within(canvas.getByRole('region', { name: '回顾工作台' }))
    await expect(review.getByText(/尚未确认服务端是否接收/)).toBeVisible()
    await userEvent.click(review.getByRole('button', { name: '查询 / 继续查询' }))
    await userEvent.click(canvas.getByRole('button', { name: /^文件$/ }))
    await userEvent.click(files.getByRole('button', { name: '查询 / 继续查询' }))
    await userEvent.click(files.getByRole('button', { name: '重试保存 / 本地合并' }))
    await userEvent.click(files.getByRole('combobox', { name: '筛选任务' }))
    await userEvent.click(screen.getByRole('option', { name: '已完成' }))
    await userEvent.click(files.getByRole('button', { name: '打开会后稿' }))
    await expect(review.getByRole('heading', { name: meeting.title })).toBeVisible()
    await expect(review.getAllByText('说话人 1', { exact: true })[0]).toBeVisible()
    await userEvent.click(review.getByRole('button', { name: '定位 00:12' }))
    await expect(await review.findByText(/^(已定位|正在播放)$/)).toBeVisible()
    await expect(review.getByRole('slider', { name: '预览播放位置' })).toHaveValue('12000')
    await userEvent.click(review.getByRole('button', { name: /^导出$/ }))
    await expect(review.getByRole('button', { name: /^SRT$/ })).toBeEnabled()
    canvasElement.dataset.fileFlow = 'passed'
  },
}

export const AppearanceFlow: Story = {
  name: '自检 · 八种配色、明暗和命令面板',
  args: { initialView: 'settings', initialSettings: 'appearance' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const screen = within(canvasElement.ownerDocument.body)
    const root = canvasElement.ownerDocument.documentElement
    const appearance = within(await canvas.findByRole('region', { name: '外观' }))
    const mode = appearance.getByRole('combobox', { name: '明暗模式' })
    const palette = appearance.getAllByRole('button').filter(button => button.title)
    await expect(palette).toHaveLength(8)
    const originalMode = mode.textContent?.trim() ?? '跟随系统'
    const originalColor = palette.find(button => button.querySelector('.lucide-check'))
    for (const name of ['浅色', '深色']) {
      await userEvent.click(mode)
      await userEvent.click(screen.getByRole('option', { name }))
      await expect(root.classList.contains('dark')).toBe(name === '深色')
      const values = new Set<string>()
      for (const color of palette) {
        await userEvent.click(color)
        await expect(color.querySelector('.lucide-check')).toBeTruthy()
        values.add(getComputedStyle(root).getPropertyValue('--primary').trim())
      }
      await expect(values.size).toBe(8)
    }
    if (originalColor) await userEvent.click(originalColor)
    await userEvent.click(mode)
    await userEvent.click(screen.getByRole('option', { name: originalMode }))
    const command = canvas.getByRole('button', { name: /命令面板/ })
    await userEvent.click(command)
    await expect(canvas.getByRole('dialog', { name: '命令面板' })).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect(command).toHaveFocus()
    await userEvent.click(command)
    const dialog = within(canvas.getByRole('dialog', { name: '命令面板' }))
    await userEvent.click(dialog.getByRole('button', { name: /^文件$/ }))
    await expect(canvas.getByRole('heading', { name: '文件转写' })).toBeVisible()
    canvasElement.dataset.appearanceFlow = 'passed'
  },
}

export const TaskRecovery: Story = {
  name: '自检 · 清理未确认与来源已删除',
  args: { initialView: 'file', initialConfigured: true, initialTask: 'cleanupFailed' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const screen = within(canvasElement.ownerDocument.body)
    const files = within(await canvas.findByRole('region', { name: '文件工作台' }))
    const source = files.getByRole('combobox', { name: '选择会议原音' })
    const submit = files.getByRole('button', { name: '提交会后转写' })
    await userEvent.click(source)
    await userEvent.click(screen.getByRole('option', { name: new RegExp(meeting.title) }))
    await expect(submit).toBeDisabled()
    await userEvent.click(files.getByRole('button', { name: '查看待处理任务' }))
    await expect(files.getByRole('combobox', { name: '筛选任务' })).toHaveTextContent('需处理')
    await userEvent.click(files.getByRole('button', { name: '打开校正版' }))
    const review = within(canvas.getByRole('region', { name: '回顾工作台' }))
    const version = review.getByRole('combobox', { name: '查看预览稿件' })
    await userEvent.click(version)
    await userEvent.click(screen.getByRole('option', { name: /^实时稿$/ }))
    await userEvent.click(canvas.getByRole('button', { name: /^文件$/ }))
    await userEvent.click(files.getByRole('button', { name: '打开校正版' }))
    await expect(version).toHaveTextContent('自动校正版')

    await userEvent.click(version)
    await userEvent.click(screen.getByRole('option', { name: /^实时稿$/ }))
    await userEvent.click(review.getByRole('button', { name: '编辑文字与说话人' }))
    const paragraph = review.getByRole('textbox', { name: '第 1 段正文' })
    await fireEvent.change(paragraph, { target: { value: '还没保存的录制稿' } })
    await userEvent.click(canvas.getByRole('button', { name: /^文件$/ }))
    await userEvent.click(files.getByRole('button', { name: '打开校正版' }))
    await expect(version).toHaveTextContent('实时稿')
    await expect(paragraph).toHaveValue('还没保存的录制稿')

    await userEvent.click(review.getByRole('button', { name: /^会议信息$/ }))
    await userEvent.click(review.getByRole('button', { name: '删除会议' }))
    await userEvent.click(screen.getByRole('button', { name: '删除预览会议' }))
    await userEvent.click(canvas.getByRole('button', { name: /^文件$/ }))
    await expect(files.queryByRole('button', { name: '打开校正版' })).not.toBeInTheDocument()
    await expect(files.getByText('来源会议已删除，仍可处理原任务。')).toBeVisible()
    await userEvent.click(files.getByRole('button', { name: '重试清理' }))
    await expect(files.getByText(/转写已完成，但来源会议已删除/)).toBeVisible()
    await expect(files.queryByRole('button', { name: '打开校正版' })).not.toBeInTheDocument()
    await userEvent.click(source)
    await expect(screen.queryByRole('option', { name: new RegExp(meeting.title) })).not.toBeInTheDocument()
    await userEvent.keyboard('{Escape}')

    // Simulate a result reaching the original task after its source was removed.
    await userEvent.click(canvas.getByRole('combobox', { name: '任务状态预览' }))
    await userEvent.click(screen.getByRole('option', { name: '任务 · 转写中' }))
    await userEvent.click(files.getByRole('button', { name: '查看待处理任务' }))
    await userEvent.click(files.getByRole('button', { name: '查询 / 继续查询' }))
    await userEvent.click(files.getByRole('combobox', { name: '筛选任务' }))
    await userEvent.click(screen.getByRole('option', { name: '需处理' }))
    await expect(files.getByText(/转写已完成，但来源会议已删除/)).toBeVisible()
    await expect(files.queryByRole('button', { name: '重试保存 / 本地合并' })).not.toBeInTheDocument()
    canvasElement.dataset.taskRecovery = 'passed'
  },
}


export const TopicsFlow: Story = {
  name: '自检 · 主题编辑、会议衔接与删除',
  args: { initialView: 'topics', initialConfigured: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement), screen = within(canvasElement.ownerDocument.body)
    const page = within(await canvas.findByRole('region', { name: '主题工作台' }))
    await userEvent.click(page.getByRole('button', { name: /产品设计.*场会议/ }))
    await userEvent.click(page.getByRole('button', { name: /一次关于留白的设计讨论/ }))
    await expect(canvas.getByRole('heading', { name: '一次关于留白的设计讨论' })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: '返回主题资料' }))
    await userEvent.click(page.getByRole('button', { name: '编辑主题' }))
    const editor = within(screen.getByRole('dialog', { name: '编辑主题' }))
    await fireEvent.change(editor.getByRole('textbox', { name: '主题名称' }), { target: { value: '产品设计与阅读' } })
    await userEvent.click(editor.getByRole('button', { name: '保存主题' }))
    await userEvent.click(page.getByRole('button', { name: '在此主题录制' }))
    await expect(canvas.getByRole('combobox', { name: '录制专题' })).toHaveTextContent('产品设计与阅读')
    await userEvent.click(canvas.getByRole('button', { name: /^主题$/ }))
    await userEvent.click(page.getByRole('button', { name: new RegExp(meeting.title) }))
    await userEvent.click(canvas.getByRole('button', { name: /^会议信息$/ }))
    await expect(canvas.getByRole('combobox', { name: '所属专题' })).toHaveTextContent('产品设计与阅读')
    await userEvent.click(canvas.getByRole('button', { name: '返回主题资料' }))
    await userEvent.click(page.getByRole('button', { name: /^删除主题$/ }))
    await userEvent.click(screen.getByRole('button', { name: '确认删除主题' }))
    await userEvent.click(canvas.getByRole('button', { name: /^回顾$/ }))
    await expect(canvas.getByRole('heading', { name: meeting.title })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: /^会议信息$/ }))
    await userEvent.click(canvas.getByRole('button', { name: /^会议信息$/ }))
    await expect(canvas.getByRole('combobox', { name: '所属专题' })).toHaveTextContent('不归入专题')
    canvasElement.dataset.topicsFlow = 'passed'
  },
}

export const UtilitiesFlow: Story = {
  name: '自检 · 备份恢复、数据导入与更新',
  args: { initialView: 'settings', initialSettings: 'backup' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement), screen = within(canvasElement.ownerDocument.body)
    const settings = within(await canvas.findByRole('region', { name: '设置工作台' }))
    await userEvent.click(settings.getByRole('button', { name: '立即备份' }))
    await userEvent.click(screen.getByRole('button', { name: '确认备份' }))
    await expect(await settings.findByText('上传结果尚未确认')).toBeVisible()
    await expect(settings.getByRole('button', { name: '立即备份' })).toBeDisabled()
    await userEvent.click(settings.getByRole('button', { name: '检查 / 继续原任务' }))
    await expect(await settings.findByText('本次会议备份')).toBeVisible()
    await userEvent.click(settings.getAllByRole('button', { name: /^恢复$/ })[0])
    const restore = within(await screen.findByRole('dialog', { name: '恢复备份' }))
    await userEvent.click(restore.getByRole('button', { name: '覆盖恢复' }))
    await userEvent.click(screen.getByRole('button', { name: '确认覆盖恢复' }))
    await expect(await settings.findByText('本地恢复回退包')).toBeVisible()
    await userEvent.click(settings.getByRole('button', { name: /^数据管理$/ }))
    await userEvent.click(settings.getByRole('button', { name: '导入会话 JSON' }))
    const importing = within(screen.getByRole('dialog', { name: '导入会话数据' }))
    await userEvent.click(importing.getByRole('button', { name: '选择示例 JSON' }))
    await userEvent.click(importing.getByRole('button', { name: '确认导入示例' }))
    await expect(await settings.findByText(/导入完成（模拟）/)).toBeVisible()
    await userEvent.click(settings.getByRole('button', { name: /^关于$/ }))
    await userEvent.click(settings.getByRole('button', { name: '检查更新' }))
    await userEvent.click(await settings.findByRole('button', { name: '下载更新' }))
    await userEvent.click(await settings.findByRole('button', { name: '重启并安装' }))
    await userEvent.click(screen.getByRole('button', { name: /^取消$/ }))
    await expect(settings.getByText('示例更新已准备好。')).toBeVisible()
    canvasElement.dataset.utilitiesFlow = 'passed'
  },
}

export const SettingsGuard: Story = {
  name: '自检 · 全局离开设置与失败重试',
  args: { initialView: 'settings', initialSettings: 'openApi' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement), screen = within(canvasElement.ownerDocument.body)
    const settings = within(await canvas.findByRole('region', { name: '设置工作台' }))
    await userEvent.click(settings.getByRole('checkbox', { name: '启用开放 API' }))
    await userEvent.click(canvas.getByRole('button', { name: /^文件$/ }))
    const dialog = within(screen.getByRole('dialog', { name: '放弃未保存的设置？' }))
    await userEvent.click(dialog.getByRole('button', { name: '继续编辑' }))
    await expect(settings.getByRole('checkbox', { name: '启用开放 API' })).toBeChecked()
    await userEvent.click(canvas.getByRole('checkbox', { name: '模拟保存失败' }))
    await userEvent.click(settings.getByRole('button', { name: '保存 API 设置' }))
    await expect(settings.getByRole('alert')).toHaveTextContent('保存失败')
    await userEvent.click(canvas.getByRole('checkbox', { name: '模拟保存失败' }))
    await userEvent.click(settings.getByRole('button', { name: '保存 API 设置' }))
    await userEvent.click(settings.getByRole('button', { name: /^云端备份$/ }))
    await userEvent.click(canvas.getByRole('checkbox', { name: '模拟操作失败' }))
    await userEvent.click(settings.getByRole('button', { name: '测试连接' }))
    await expect(await settings.findByRole('alert')).toHaveTextContent('暂时不可用')
    await userEvent.click(canvas.getByRole('checkbox', { name: '模拟操作失败' }))
    await userEvent.click(settings.getByRole('button', { name: '测试连接' }))
    await expect(await settings.findByText('连接可用', { exact: true })).toBeVisible()
    canvasElement.dataset.settingsGuard = 'passed'
  },
}

export const RuntimeFlow: Story = {
  name: '自检 · 本地运行时准备与配置',
  args: { initialView: 'settings', initialEngine: '本地 whisper.cpp' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement), screen = within(canvasElement.ownerDocument.body)
    const settings = within(await canvas.findByRole('region', { name: '设置工作台' }))
    await userEvent.click(settings.getByText('高级参数与本地模型', { exact: true }))
    await userEvent.click(settings.getByRole('button', { name: '选择 Runtime 与模型' }))
    const dialog = within(screen.getByRole('dialog', { name: '本地服务与模型' }))
    await expect(dialog.getByRole('button', { name: '启动示例服务' })).toBeDisabled()
    await userEvent.click(dialog.getByRole('button', { name: '准备示例程序' }))
    await userEvent.click(dialog.getByRole('button', { name: '选择示例模型' }))
    await userEvent.click(dialog.getByRole('button', { name: '启动示例服务' }))
    await userEvent.click(dialog.getByRole('button', { name: '使用示例配置' }))
    await expect(settings.getByRole('textbox', { name: '模型路径' })).toHaveValue('/example/ggml-base.bin')
    await userEvent.click(settings.getByRole('button', { name: '保存设置' }))
    await expect(settings.getByText('已配置', { exact: true })).toBeVisible()
    canvasElement.dataset.runtimeFlow = 'passed'
  },
}

export const AudioRemoval: Story = {
  name: '自检 · 删除原音后的跨页状态',
  args: { initialConfigured: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement), screen = within(canvasElement.ownerDocument.body)
    const recording = within(await canvas.findByRole('region', { name: '录制工作台' }))
    await userEvent.click(recording.getByText('原音存储与恢复', { exact: true }))
    await userEvent.click(recording.getByRole('button', { name: '删除示例原音' }))
    await userEvent.click(screen.getByRole('button', { name: /^删除原音$/ }))
    await userEvent.click(canvas.getByRole('button', { name: /^回顾$/ }))
    await expect(canvas.queryByRole('button', { name: '播放静音原音预览' })).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: /^文件$/ }))
    await userEvent.click(canvas.getByRole('combobox', { name: '选择会议原音' }))
    await expect(screen.queryByRole('option', { name: new RegExp(meeting.title) })).not.toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    canvasElement.dataset.audioRemoval = 'passed'
  },
}
