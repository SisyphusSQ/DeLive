// Run against an unpacked desktop build with a new, empty profile.
import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'

const cli = path.resolve(process.argv[2])
const root = path.resolve(path.dirname(cli), '../..')
const app = process.platform === 'darwin' ? path.join(root, 'MacOS/DeLive SQ')
  : path.join(root, process.platform === 'win32' ? 'DeLive SQ.exe' : 'delive-sq')
const profile = await mkdtemp(path.join(os.tmpdir(), 'delive-cli-test-'))
const env = { ...process.env, DELIVE_USER_DATA_DIR: profile }
delete env.DELIVE_API_TOKEN
delete env.DELIVE_API_URL
const child = spawn(app, ['--user-data-dir=' + profile, '--use-mock-keychain'], {
  env, stdio: ['ignore', 'pipe', 'inherit'],
})
const exited = once(child, 'exit')
let log = ''
child.stdout.setEncoding('utf8').on('data', chunk => { log = (log + chunk).slice(-8192) })
const run = async args => JSON.parse((await promisify(execFile)(cli, args, { env, timeout: 8000 })).stdout)
try {
  const deadline = Date.now() + 45000
  let library
  while (!library) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error('Desktop app exited during startup')
    try { library = await run(['meetings', 'list']) }
    catch (error) {
      if (Date.now() > deadline) throw error
      await delay(250)
    }
  }
  assert.deepEqual(library.sessions, [])
  assert.equal((await run(['health'])).apiEnabled, false)
  const port = log.match(/\[Main\].*端口: (\d+)/)?.[1]
  assert.ok(port, 'desktop Open API port')
  const res = await fetch('http://127.0.0.1:' + port + '/api/v1/sessions')
  assert.equal(res.status, 403)
  console.log('Bundled CLI can read meetings with Open API disabled; HTTP requires authorization.')
} finally {
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  await exited
  await rm(profile, { recursive: true, force: true, maxRetries: 3 })
}
