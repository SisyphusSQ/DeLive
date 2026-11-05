const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

if (!process.versions.electron) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'delive-quit-'))
  const result = spawnSync(require('electron'), [__filename], {
    env: { ...process.env, DELIVE_QUIT_PROFILE: profile },
    encoding: 'utf8', timeout: 30_000,
  })
  const evidence = {
    electron: require('electron/package.json').version,
    status: result.status, signal: result.signal, error: result.error?.message,
    stdout: result.stdout, stderr: result.stderr,
  }
  const directory = path.resolve(__dirname, '../tmp/evidence/quit')
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, `electron-${evidence.electron}.json`), JSON.stringify(evidence, null, 2))
  fs.rmSync(profile, { recursive: true, force: true })
  assert.equal(result.error, undefined, 'App must quit within 30 seconds')
  assert.equal(result.signal, null, `Quit crashed: ${result.signal}; see ${directory}`)
  assert.equal(result.status, 0, `Quit failed; see ${directory}`)
  assert.match(result.stdout, /QUIT_READY/)
  assert.match(result.stdout, /QUIT_EVENT 0/)
  console.log(`PASS Electron ${evidence.electron}: actual app startup and normal app.quit()`)
} else {
  const { app } = require('electron')
  app.setPath('userData', process.env.DELIVE_QUIT_PROFILE)
  app.on('quit', (_event, code) => console.log('QUIT_EVENT', code))
  app.once('browser-window-created', (_event, window) => {
    window.webContents.once('did-finish-load', () => {
      assert.match(window.webContents.getURL(), /index\.html$/)
      console.log('QUIT_READY')
      setTimeout(() => app.quit(), 500)
    })
  })
  require('../dist-electron/electron/main')
}
