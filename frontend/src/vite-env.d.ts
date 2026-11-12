/// <reference types="vite/client" />

import type {
  DesktopSource as SharedDesktopSource,
  DownloadProgress as SharedDownloadProgress,
  ElectronAPI as SharedElectronAPI,
  LocalRuntimeLaunchOptions as SharedLocalRuntimeLaunchOptions,
  LocalRuntimeSnapshot as SharedLocalRuntimeSnapshot,
  LocalRuntimeStatus as SharedLocalRuntimeStatus,
  UpdateInfo as SharedUpdateInfo,
} from '../../shared/electronApi'

declare module '*.css' {
  const content: string
  export default content
}

declare global {
  const __APP_VERSION__: string
  type DesktopSource = SharedDesktopSource
  type UpdateInfo = SharedUpdateInfo
  type DownloadProgress = SharedDownloadProgress
  type LocalRuntimeStatus = SharedLocalRuntimeStatus
  type LocalRuntimeLaunchOptions = SharedLocalRuntimeLaunchOptions
  type LocalRuntimeSnapshot = SharedLocalRuntimeSnapshot

  type ElectronAPI = SharedElectronAPI

  interface Window {
    electronAPI?: SharedElectronAPI
  }
}

export {}
