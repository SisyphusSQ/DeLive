/** Keep local macOS permission grants tied to a certificate, not a build hash. */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { signAsync } from '@electron/osx-sign';

export function resolveMacSigningIdentity(env, identities = '') {
  const explicit = env.DELIVE_MAC_SIGN_IDENTITY?.trim();
  if (explicit && explicit !== '-') return explicit;
  if (env.DELIVE_ALLOW_ADHOC === '1') return '-';
  if (explicit === '-') throw new Error('临时签名需要显式设置 DELIVE_ALLOW_ADHOC=1；更新后可能丢失系统权限。');
  const available = [...identities.matchAll(/^\s*\d+\) ([A-F0-9]{40}) "Developer ID Application:[^"\n]+"[ \t]*$/gm)];
  if (available.length === 1) return available[0][1];
  throw new Error('需要稳定的 Developer ID Application 签名证书。请设置 DELIVE_MAC_SIGN_IDENTITY 为有效证书名称或 SHA-1；仅临时测试包可设置 DELIVE_ALLOW_ADHOC=1。');
}

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const identities = process.env.DELIVE_MAC_SIGN_IDENTITY || process.env.DELIVE_ALLOW_ADHOC === '1'
    ? '' : execFileSync('security', ['find-identity', '-p', 'codesigning', '-v'], { encoding: 'utf8' });
  const identity = resolveMacSigningIdentity(process.env, identities);
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const keychainProfile = process.env.APPLE_KEYCHAIN_PROFILE?.trim();
  if (identity === '-') {
    console.warn('[fix-mac-signing] 临时签名：换包后录屏、麦克风和钥匙串授权可能失效，不用于本机持续安装。');
    execFileSync('codesign', ['--force', '--deep', '--sign', identity, appPath], { stdio: 'inherit' });
  } else {
    console.log('[fix-mac-signing] 正在逐层签署 Developer ID 应用');
    await signAsync({
      app: appPath,
      identity,
      platform: 'darwin',
      // Chromium 语言包由资源封印保护，无需单独签名和时间戳。
      ignore: file => file.endsWith('.pak'),
      optionsForFile: file => file === appPath ? {
        entitlements: ['com.apple.security.cs.allow-jit', 'com.apple.security.device.audio-input'],
      } : {},
    });
  }
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], { stdio: 'inherit' });
  if (identity !== '-') {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'delive-signing-'));
    try {
      execFileSync('codesign', ['-d', `--extract-certificates=${path.join(directory, 'cert-')}`, appPath], { stdio: 'inherit' });
      const certificates = readdirSync(directory).sort().flatMap(file => ['-c', path.join(directory, file)]);
      // Static codesign verification alone accepts locally cached, revoked identities.
      execFileSync('security', ['verify-cert', ...certificates, '-p', 'codeSign', '-R', 'ocsp', '-R', 'require'], { stdio: 'inherit' });
      if (keychainProfile) {
        const archive = path.join(directory, 'DeLiveSQ.zip');
        execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', appPath, archive], { stdio: 'inherit' });
        console.log('[fix-mac-signing] 正在提交 Apple 公证');
        // 当前网络无法访问 S3 加速端点，使用 Apple 支持的直传入口。
        execFileSync('xcrun', ['notarytool', 'submit', archive, '--keychain-profile', keychainProfile, '--no-s3-acceleration', '--wait'], { stdio: 'inherit' });
        execFileSync('xcrun', ['stapler', 'staple', appPath], { stdio: 'inherit' });
        console.log('[fix-mac-signing] Apple 公证与票据装订完成');
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
  console.log('[fix-mac-signing] 签名与资源封印检查通过');
}
