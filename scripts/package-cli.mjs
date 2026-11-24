// Build directly into the target app before macOS bundle signing.
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { Arch } from 'electron-builder'
import sign from './fix-mac-signing.mjs'

export default async function afterPack(context) {
  const platform = { darwin: 'darwin', win32: 'windows', linux: 'linux' }[context.electronPlatformName]
  const arch = { [Arch.x64]: 'amd64', [Arch.arm64]: 'arm64', [Arch.ia32]: '386', [Arch.armv7l]: 'arm' }[context.arch]
  if (!platform || !arch) throw new Error('Unsupported CLI build target')
  const dir = path.join(context.packager.getResourcesDir(context.appOutDir), 'bin')
  mkdirSync(dir, { recursive: true })
  execFileSync('go', ['build', '-trimpath', '-ldflags=-s -w', '-o',
    path.join(dir, platform === 'windows' ? 'delive.exe' : 'delive'), '.'], {
    cwd: path.join(context.packager.projectDir, 'cli'),
    env: { ...process.env, GOOS: platform, GOARCH: arch, CGO_ENABLED: '0' },
    stdio: 'inherit',
  })
  await sign(context)
}
