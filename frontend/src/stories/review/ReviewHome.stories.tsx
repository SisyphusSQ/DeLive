import type { Meta, StoryObj } from '@storybook/react-vite'
import { ReviewHomePreview } from './ReviewHomePreview'

const meta = {
  title: 'DeLive/回顾页',
  component: ReviewHomePreview,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ReviewHomePreview>

export default meta
type Story = StoryObj<typeof meta>

export const HomeDirectory: Story = { name: '回顾首页 · 会议目录' }
