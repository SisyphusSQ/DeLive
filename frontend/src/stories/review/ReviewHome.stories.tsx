import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { ReviewHomePreview } from './ReviewHomePreview'

const meta = {
  title: 'DeLive/回顾页',
  component: ReviewHomePreview,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ReviewHomePreview>

export default meta
type Story = StoryObj<typeof meta>

export const HomeDirectory: Story = { name: '回顾首页 · 会议目录' }

export const HeatmapDetails: Story = {
  name: '回顾首页 · 热力图悬停',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const toggle = await canvas.findByRole('button', { name: '活动概览' })
    if (toggle.getAttribute('aria-expanded') === 'false') await userEvent.click(toggle)
    const heatmap = await canvas.findByRole('region', { name: '活动概览' })
    const body = within(canvasElement.ownerDocument.body)
    const recorded = within(heatmap).getAllByRole('button', { name: /次录制/ })[0]
    const empty = heatmap.querySelector('.review-home-calendar span.review-home-day')!

    await userEvent.hover(recorded)
    const details = await body.findByRole('tooltip')
    await expect(details).toHaveTextContent(/\d+年\d+月\d+日/)
    await expect(details).toHaveTextContent(/\d+ 次录制.+(?:小时|分钟)/)
    await userEvent.unhover(recorded)
    await waitFor(() => expect(body.queryByRole('tooltip')).not.toBeInTheDocument())

    await userEvent.hover(empty)
    await expect(await body.findByRole('tooltip')).toHaveTextContent('无录制')
    await userEvent.unhover(empty)
  },
}
