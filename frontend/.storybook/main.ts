import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  stories: ['../src/stories/**/*.stories.tsx'],
  framework: '@storybook/react-vite',
  core: { disableTelemetry: true },
  async viteFinal(config) {
    // Preview has no connection to the desktop app or its local API proxy.
    config.server = { ...config.server, proxy: {} }
    config.build = { ...config.build, rollupOptions: {} }
    return config
  },
}
export default config
