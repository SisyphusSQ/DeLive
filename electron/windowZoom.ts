import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

const MIN = 0.75, MAX = 1.5, STEP = 0.1
export function clampZoom(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(MAX, Math.max(MIN, value)) : 1
}

export function installWindowZoom(window: BrowserWindow): void {
  const file = path.join(app.getPath('userData'), 'window-zoom.json')
  let factor = 1
  try { factor = clampZoom(JSON.parse(fs.readFileSync(file, 'utf8')).factor) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('[Zoom] 无法读取缩放比例，使用 100%') }
  const apply = (direction: 'in' | 'out' | 'reset') => {
    factor = direction === 'reset' ? 1 : clampZoom(Math.round((factor + (direction === 'in' ? STEP : -STEP)) * 100) / 100)
    window.webContents.setZoomFactor(factor)
    try {
      fs.writeFileSync(file + '.tmp', JSON.stringify({ factor }), { mode: 0o600 })
      fs.renameSync(file + '.tmp', file)
    } catch (error) { console.error('[Zoom] 保存缩放比例失败', error) }
  }
  window.webContents.on('did-finish-load', () => window.webContents.setZoomFactor(factor))
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.alt || (process.platform === 'darwin' ? !input.meta || input.control : !input.control || input.meta)) return
    const direction = input.key === '+' || input.key === '=' ? 'in' : input.key === '-' ? 'out' : input.key === '0' && !input.shift ? 'reset' : null
    if (!direction) return
    event.preventDefault() // Also suppresses the menu accelerator, so a keypress changes zoom exactly once.
    apply(direction)
  })
  const menu = Menu.getApplicationMenu() || Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    { role: 'fileMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
  ])
  const replacements = {
    zoomin: { label: '放大主界面', accelerator: 'CommandOrControl+=', direction: 'in' },
    zoomout: { label: '缩小主界面', accelerator: 'CommandOrControl+-', direction: 'out' },
    resetzoom: { label: '主界面恢复 100%', accelerator: 'CommandOrControl+0', direction: 'reset' },
  } as const
  const replace = (target: Menu): MenuItemConstructorOptions[] => target.items.map((item): MenuItemConstructorOptions => {
    const role = (item.role || item.id || '').toLowerCase() as keyof typeof replacements
    const replacement = replacements[role]
    if (replacement) return { id: role, label: replacement.label, accelerator: replacement.accelerator,
      click: () => { if (!window.isDestroyed() && BrowserWindow.getFocusedWindow() === window) apply(replacement.direction) },
    }
    return { label: item.label, role: item.role, type: item.type, accelerator: item.accelerator,
      enabled: item.enabled, visible: item.visible, checked: item.checked, click: (...args) => item.click(...args),
      submenu: item.submenu ? replace(item.submenu) : undefined }
  })
  // Custom handlers preserve native zoom while restricting actions to this window and persisting changes.
  Menu.setApplicationMenu(Menu.buildFromTemplate(replace(menu)))
}
