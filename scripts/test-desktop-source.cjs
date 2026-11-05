const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')

async function main() {
  let permission = 'denied'
  let calls = 0
  let fail = false
  const handlers = new Map()
  const electron = {
    systemPreferences: { getMediaAccessStatus: () => permission },
    desktopCapturer: { getSources: async () => {
      calls++
      if (fail) throw new Error('capture unavailable')
      return [{ id: 'screen:1', name: 'Screen', thumbnail: { toDataURL: () => 'preview' } }]
    } },
  }
  const sandbox = { exports: {}, require: () => electron, process: { platform: 'darwin' }, console: { error() {} } }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist-electron/electron/desktopSource.js'), 'utf8'), sandbox)
  const controller = sandbox.exports.createDesktopSourceController({ getMainWindow: () => null })
  sandbox.exports.registerDesktopSourceIpc({
    ipcMain: { removeHandler() {}, handle: (name, fn) => handlers.set(name, fn) }, controller,
  })
  const list = handlers.get('get-desktop-sources')
  for (permission of ['denied', 'restricted']) {
    await assert.rejects(list(), /SCREEN_CAPTURE_PERMISSION_REQUIRED/)
  }
  assert.equal(calls, 0, '已拒绝权限时不重复请求捕获')
  permission = 'not-determined'
  assert.equal((await list())[0].id, 'screen:1', '首次请求仍允许触发系统授权')
  permission = 'granted'
  assert.equal((await list())[0].isScreen, true)
  fail = true
  await assert.rejects(list(), /capture unavailable/, '捕获异常必须传递，不能伪装为空列表')
  console.log('PASS: 权限拒绝、首次请求、已授权列表及错误传播')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
