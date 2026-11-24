// The CLI listener shares meeting handlers, never the Open API's TCP listener.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { execFile } from 'node:child_process'
import { rmSync } from 'node:fs'
import { lstat, mkdir, realpath, rename, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { ListenOptions } from 'node:net'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { handleMeetingRequest } from './apiServer'

async function listen(server: Server, options: ListenOptions): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options, () => {
      server.off('error', reject)
      resolve()
    })
  })
}

async function unixListener(profile: string): Promise<() => void> {
  // A short path also works for deeply nested profiles on macOS.
  const uid = process.getuid!()
  const dir = join('/tmp', 'delive-cli-' + uid)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const info = await lstat(dir)
  if (!info.isDirectory() || info.uid !== uid || (info.mode & 0o077) !== 0) {
    throw new Error('CLI socket directory must be private and owned by the current user')
  }
  const name = createHash('sha256').update(await realpath(profile)).digest('hex').slice(0, 32)
  const path = join(dir, name + '.sock')
  // The desktop process already holds the single-instance lock for this profile.
  await rm(path, { force: true })
  const server = createServer(handleMeetingRequest)
  await listen(server, { path })
  return () => { server.close() }
}

// File.Create installs this DACL at creation, before the endpoint is written.
// Both the name and content are supplied as data, outside the command line.
const createPrivateFile = `
$ErrorActionPreference = 'Stop'
$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = New-Object System.Security.AccessControl.FileSecurity
$acl.SetAccessRuleProtection($true, $false)
$acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','Allow'))
$file = [System.IO.File]::Create($env:DELIVE_ENDPOINT_TEMP,4096,[System.IO.FileOptions]::None,$acl)
try {
  $data = [System.Text.Encoding]::UTF8.GetBytes($env:DELIVE_ENDPOINT_DATA)
  $file.Write($data,0,$data.Length)
} finally { $file.Dispose() }
`

async function windowsListener(profile: string): Promise<() => void> {
  const secret = randomBytes(32).toString('hex')
  const expected = Buffer.from('Bearer ' + secret)
  const server = createServer((req, res) => {
    const supplied = Buffer.from(req.headers.authorization ?? '')
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      res.writeHead(403).end()
      return
    }
    void handleMeetingRequest(req, res)
  })
  await listen(server, { host: '127.0.0.1', port: 0 })
  const file = join(profile, 'cli-endpoint.json')
  const temporary = file + '.' + randomBytes(12).toString('hex')
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('CLI port unavailable')
    const payload = JSON.stringify({ port: address.port, secret })
    const powershell = join(process.env.SystemRoot!, 'System32/WindowsPowerShell/v1.0/powershell.exe')
    await promisify(execFile)(powershell, ['-NoProfile', '-NonInteractive', '-Command', createPrivateFile], {
      windowsHide: true, env: { ...process.env, DELIVE_ENDPOINT_TEMP: temporary, DELIVE_ENDPOINT_DATA: payload },
    })
    await rename(temporary, file)
    return () => {
      server.close()
      try { rmSync(file, { force: true }) } catch (error) { console.warn('[CLI] Endpoint cleanup failed', error) }
    }
  } catch (error) {
    server.close()
    throw error
  } finally {
    await rm(temporary, { force: true })
  }
}

export function startCliServer(profile: string): Promise<() => void> {
  return process.platform === 'win32' ? windowsListener(profile) : unixListener(profile)
}
