const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
async function main() {
  const status = { screen: 'denied', microphone: 'granted' }
  let response = 1, asked = 0, grant = true
  const dialogs = [], urls = []
  const electron = {
    systemPreferences: { getMediaAccessStatus: key => status[key], askForMediaAccess: async () => { asked++; return grant } },
    dialog: { showMessageBox: async (...args) => { dialogs.push(args.at(-1)); return {response} } },
    shell: { openExternal: async url => { urls.push(url) } },
  }
  const sandbox = { exports: {}, require: () => electron, process: { platform: 'darwin' } }
  vm.runInNewContext(fs.readFileSync('dist-electron/electron/recordingPermissions.js', 'utf8'), sandbox)
  const ensure = sandbox.exports.ensureRecordingPermissions
  assert.match(await ensure({system:true,microphone:true},null), /录屏/)
  assert.equal(dialogs.length,1); assert.equal(urls.length,0)
  response=0
  await ensure({system:true,microphone:false},null)
  assert.match(urls[0],/Privacy_ScreenCapture$/)
  status.screen='granted';status.microphone='not-determined'
  assert.equal(await ensure({system:true,microphone:true},null),null);assert.equal(asked,1)
  grant=false
  assert.match(await ensure({system:false,microphone:true},null),/麦克风/)
  assert.match(urls.at(-1),/Privacy_Microphone$/)
  const before=dialogs.length
  assert.equal(await ensure({system:false,microphone:false},null),null)
  status.screen='not-determined';status.microphone='denied'
  assert.equal(await ensure({system:true,microphone:false},null),null)
  sandbox.process.platform='win32'
  assert.equal(await ensure({system:true,microphone:true},null),null)
  assert.equal(dialogs.length,before)
  console.log('PASS: denied screen guidance, explicit settings navigation, first microphone grant/denial, unselected sources and other platforms')
}
main().catch(error => {console.error(error);process.exitCode=1})
