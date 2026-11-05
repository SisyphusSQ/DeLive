import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const version = process.argv[2] ?? process.env.RELEASE_VERSION
const repo = process.env.GITHUB_REPOSITORY ?? ''
const workspace = process.env.GITHUB_WORKSPACE
  ? path.resolve(process.env.GITHUB_WORKSPACE)
  : process.cwd()

if (!version) {
  fail('Missing release version. Usage: node scripts/generate-release-notes.mjs <version>')
}

const changelogPath = path.join(workspace, 'CHANGELOG.md')

if (!existsSync(changelogPath)) {
  fail(`CHANGELOG.md not found at ${changelogPath}`)
}

const changelog = readFileSync(changelogPath, 'utf8')
const sections = parseChangelogSections(changelog)
const currentIndex = sections.findIndex((section) => section.version === version)

if (currentIndex === -1) {
  const knownVersions = sections.slice(0, 5).map((section) => section.version).join(', ')
  fail(`Version ${version} was not found in CHANGELOG.md. Known versions: ${knownVersions}`)
}

const currentSection = sections[currentIndex]
const previousSection = sections[currentIndex + 1]
const downloadRows = collectDownloadRows(workspace, version)

if (downloadRows.length === 0) {
  fail('No release assets were found in release/<version>')
}

const lines = [
  `## DeLive SQ ${version}`,
  '',
]

if (currentSection.date) {
  lines.push(`> 发布日期： ${currentSection.date}`, '')
}

lines.push(
  '### 下载',
  '',
  '| 平台 | 文件 | 说明 |',
  '|-----------------|-------------|---------------------|',
)

for (const row of downloadRows) {
  lines.push(`| ${row.platform} | ${formatAssetLink(row.filename, repo, version)} | ${row.description} |`)
}

lines.push(
  '',
  '### 更新内容',
  '',
  currentSection.body,
  '',
  '### 使用说明',
  '',
  '1. 下载对应平台的安装包',
  '2. 打开 DMG，将 DeLive SQ.app 拖到“应用程序”；也可解压 ZIP 后安装',
  '3. 在设置中配置 ASR 服务商的 API 密钥',
  '4. 授予所选音源的系统权限后开始录制；后续版本需手动下载安装',
  '',
  '> 本版本已使用 Developer ID Application 签名，未进行 Apple 公证。首次从互联网下载后，系统可能阻止打开；请确认来源后在“系统设置 → 隐私与安全性”中允许运行，不要关闭系统安全保护。',
)

if (repo && previousSection) {
  lines.push(
    '',
    '---',
    '',
    `**完整变更记录**： https://github.com/${repo}/compare/v${previousSection.version}...v${version}`,
  )
}

process.stdout.write(`${normalizeSpacing(lines.join('\n'))}\n`)

function parseChangelogSections(source) {
  const headingPattern = /^## \[(?<version>[^\]]+)\](?: - (?<date>.+))?$/gm
  const matches = [...source.matchAll(headingPattern)]

  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? source.length) : source.length
    const body = cleanSectionBody(source.slice(start, end))

    return {
      version: match.groups?.version?.trim() ?? '',
      date: match.groups?.date?.trim() ?? '',
      body,
    }
  }).filter((section) => section.version && section.body)
}

function collectDownloadRows(rootDir, releaseVersion) {
  const escapedVersion = escapeRegExp(releaseVersion)
  const specs = [
    {
      dir: path.join('release', releaseVersion),
      platform: 'macOS arm64',
      pattern: new RegExp(`^DeLive-SQ-${escapedVersion}-mac-arm64\\.dmg$`),
      description: 'Apple Silicon 安装包',
    },
    {
      dir: path.join('release', releaseVersion),
      platform: 'macOS arm64',
      pattern: new RegExp(`^DeLive-SQ-${escapedVersion}-mac-arm64\\.zip$`),
      description: 'Apple Silicon ZIP 归档',
    },
    {
      dir: path.join('release', releaseVersion),
      platform: '校验文件',
      pattern: /^SHA256SUMS$/,
      description: 'DMG 与 ZIP 的 SHA-256 校验值',
    },
  ]

  return specs.flatMap((spec) => {
    const dirPath = path.join(rootDir, spec.dir)

    if (!existsSync(dirPath)) {
      return []
    }

    const filename = readdirSync(dirPath).find((entry) => spec.pattern.test(entry))

    if (!filename) {
      return []
    }

    return [{
      platform: spec.platform,
      filename,
      description: spec.description,
    }]
  })
}

function formatAssetLink(filename, repoName, releaseVersion) {
  if (!repoName) {
    return `\`${filename}\``
  }

  const encodedFilename = encodeURIComponent(filename)
  const url = `https://github.com/${repoName}/releases/download/v${releaseVersion}/${encodedFilename}`
  return `[${filename}](${url})`
}

function normalizeSpacing(markdown) {
  return markdown
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
}

function cleanSectionBody(body) {
  return body
    .replace(/\r\n/g, '\n')
    .replace(/\n---\s*$/u, '')
    .trim()
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function fail(message) {
  console.error(message)
  process.exit(1)
}
