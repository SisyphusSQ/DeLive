import { registerFileTaskIpc } from './fileTranscription/fileTaskIpc'
import { app, BrowserWindow, dialog, ipcMain, session, Tray, globalShortcut } from 'electron'
import { registerRecordingIpc } from './recordingIpc'
import { registerAppIpc } from './appIpc'
import { setupAutoUpdater } from './autoUpdater'
import { createDesktopSourceController, registerDesktopSourceIpc } from './desktopSource'
import { createLocalRuntimeController } from './localRuntime'
import { registerLocalRuntimeIpc } from './localRuntimeIpc'
import { createMainWindow } from './mainWindow'
import { registerAppShortcuts } from './shortcuts'
import { createAppTray, findIconPath, rebuildTrayMenu } from './tray'
import { registerUpdaterIpc } from './updaterIpc'
import { installLogInterceptor, registerDiagnosticsIpc } from './diagnosticsIpc'
import { registerTrustedWindow } from './ipcSecurity'
import { registerSafeStorageIpc } from './safeStorageIpc'
import { startVolcProxyServer, getProxyPort } from './volcProxy'
import { registerApiIpc } from './apiIpc'
import { attachApiServer } from './apiServer'
import { registerCloudBackupIpc } from './cloudBackup/cloudBackupIpc'
import { registerCodexIpc } from './codexIpc'
import { registerSessionImagesIpc } from './sessionImages'
import { refreshElectronLang, getElectronStrings } from './i18n'

installLogInterceptor()

if (process.platform === 'darwin') {
  // shortcut: Electron 40 的 CoreAudio Tap 权限失败时返回已结束音轨，升级 Electron 45 前重新评估此开关。
  app.commandLine.appendSwitch('disable-features', 'MacCatapLoopbackAudioForScreenShare')
  app.commandLine.appendSwitch('enable-features', 'ScreenCaptureKitAudio,ScreenCaptureKitStreamPickerSonoma')
}

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-features', 'PulseaudioLoopbackForScreenShare')
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

const isDev = process.env.NODE_ENV === 'development'

registerTrustedWindow(() => mainWindow)

const desktopSourceController = createDesktopSourceController({
  getMainWindow: () => mainWindow,
})

const localRuntimeController = createLocalRuntimeController()
const codexController = registerCodexIpc(ipcMain)
registerSessionImagesIpc(ipcMain)

function isAutoUpdateSupported(): boolean {
  // Fork updates stay disabled until a dedicated release source is configured.
  return false
}

function isTrayReady(): boolean {
  return tray !== null && !tray.isDestroyed()
}

function createWindow(): void {
  const windowIconPath = findIconPath()
  desktopSourceController.attachDisplayMediaHandler()
  mainWindow = createMainWindow({
    isDev,
    windowIconPath: windowIconPath || undefined,
    shouldHideToTray: () => !isQuitting && isTrayReady(),
    onClosed: () => {
      mainWindow = null
    },
  })
}

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      if (process.platform === 'darwin') app.dock?.show()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    if (!process.env.HTTPS_PROXY && !process.env.HTTP_PROXY) {
      try {
        const proxy = await session.defaultSession.resolveProxy('https://openspeech.bytedance.com')
        const match = proxy.match(/^PROXY\s+(.+)$/i)
        if (match) {
          const proxyUrl = `http://${match[1]}`
          process.env.HTTPS_PROXY = proxyUrl
          process.env.HTTP_PROXY = proxyUrl
          console.log(`[Main] 检测到系统代理: ${proxyUrl}`)
        }
      } catch {
        // ignore proxy detection failure
      }
    }

    try {
      const { server: httpServer, port: proxyPort } = await startVolcProxyServer()
      console.log(`[Main] 代理服务器运行在端口: ${proxyPort}`)
      attachApiServer({ server: httpServer })
    } catch (error) {
      // Still open the window: without it the app looks like it never started.
      // Providers that need the proxy will report connection errors instead.
      console.error('[Main] 代理服务器启动失败:', error)
      const detail = error instanceof Error ? error.message : String(error)
      dialog.showErrorBox('DeLive', getElectronStrings().proxyStartFailed(detail))
    }

    createWindow()
    tray = createAppTray({
      getMainWindow: () => mainWindow,
      onQuit: () => {
        isQuitting = true
        app.quit()
      },
    })

    registerAppShortcuts({
      getMainWindow: () => mainWindow,
      isTrayReady,
    })

    if (!isDev && isAutoUpdateSupported()) {
      setupAutoUpdater({
        getMainWindow: () => mainWindow,
        markQuitting: () => {
          isQuitting = true
        },
      })
    } else if (!isDev && process.platform === 'linux') {
      console.log('[Updater] 当前 Linux 安装方式不支持自动更新（仅 AppImage 支持）')
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  isQuitting = true
  codexController.dispose()
  globalShortcut.unregisterAll()
  void localRuntimeController.stopAll()
})

registerLocalRuntimeIpc({
  ipcMain,
  controller: localRuntimeController,
})

registerDesktopSourceIpc({
  ipcMain,
  controller: desktopSourceController,
})

registerAppIpc({
  ipcMain,
  getMainWindow: () => mainWindow,
  isTrayReady,
  hideMainWindow: () => {
    mainWindow?.hide()
  },
  minimizeMainWindow: () => {
    mainWindow?.minimize()
  },
  maximizeMainWindow: () => {
    mainWindow?.maximize()
  },
  unmaximizeMainWindow: () => {
    mainWindow?.unmaximize()
  },
  closeMainWindow: () => {
    mainWindow?.close()
  },
  isMainWindowMaximized: () => mainWindow?.isMaximized() ?? false,
})

registerUpdaterIpc({
  ipcMain,
  isDev,
  isAutoUpdateSupported,
  getMainWindow: () => mainWindow,
  markQuitting: () => {
    isQuitting = true
  },
})

registerDiagnosticsIpc({
  ipcMain,
  getMainWindow: () => mainWindow,
})

const recordingStorage = registerRecordingIpc(ipcMain)
registerFileTaskIpc(ipcMain, recordingStorage.owner)
registerSafeStorageIpc(ipcMain)
registerCloudBackupIpc(ipcMain, recordingStorage)

registerApiIpc({
  ipcMain,
  getMainWindow: () => mainWindow,
})

ipcMain.handle('get-proxy-port', () => getProxyPort())

ipcMain.handle('lang:change', (_event, lang: string) => {
  if (lang === 'zh' || lang === 'en' || lang === 'ko') {
    refreshElectronLang(lang as 'zh' | 'en' | 'ko')
  } else {
    refreshElectronLang()
  }
  if (tray && !tray.isDestroyed()) {
    rebuildTrayMenu(tray, {
      getMainWindow: () => mainWindow,
      onQuit: () => {
        isQuitting = true
        app.quit()
      },
    })
  }
})
