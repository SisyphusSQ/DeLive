import { dialog, shell, systemPreferences, type BrowserWindow } from 'electron'

export async function ensureRecordingPermissions(
  sources: { system: boolean; microphone: boolean },
  window: BrowserWindow | null,
): Promise<string | null> {
  if (process.platform !== 'darwin') return null
  let missing: 'screen' | 'microphone' | null = null
  if (sources.system && ['denied', 'restricted'].includes(systemPreferences.getMediaAccessStatus('screen'))) {
    missing = 'screen'
  } else if (sources.microphone) {
    let status = systemPreferences.getMediaAccessStatus('microphone')
    if (status === 'not-determined') {
      status = await systemPreferences.askForMediaAccess('microphone') ? 'granted' : 'denied'
    }
    if (status !== 'granted') missing = 'microphone'
  }
  // First-time screen consent is requested by desktopCapturer when the picker loads.
  if (!missing) return null
  const screen = missing === 'screen'
  const message = screen ? '需要录屏与系统录音权限' : '需要麦克风权限'
  const detail = screen
    ? '请在“隐私与安全 → 录屏与系统录音”的上方列表中允许 DeLive SQ。仅开启“仅系统录音”不足以选择屏幕或窗口。\n\n如果开关已经开启但仍提示无权限，请关闭后重新开启；更新应用可能使旧授权失效。按系统提示完全退出并重新打开应用，再开始录制。'
    : '请在“隐私与安全 → 麦克风”中允许 DeLive SQ。如果开关已经开启但仍提示无权限，请关闭后重新开启，并按系统提示重新打开应用。'
  const options: Electron.MessageBoxOptions = {
    type: 'warning', title: '录音权限未开启', message, detail,
    buttons: ['打开系统设置', '取消'], defaultId: 0, cancelId: 1, noLink: true,
  }
  const result = window && !window.isDestroyed()
    ? await dialog.showMessageBox(window, options)
    : await dialog.showMessageBox(options)
  if (result.response === 0) {
    await shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${screen ? 'Privacy_ScreenCapture' : 'Privacy_Microphone'}`)
  }
  return `${message}，开启后请重新打开应用并重试。`
}
