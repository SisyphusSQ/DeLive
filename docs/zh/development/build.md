# 构建与发布

2026-11-03 本机结果见 [TOO-686 验收记录](./evidence-too-686-live.md)：已修复两类真实响应误判；独立包的生成语音实时转写、落盘、重开、回放、校对与导出通过。现场设备、多人和长会测试仍待用户实测。

## Fork 当前独立包（TOO-686）

- 本机 sqmc03：`/Users/suqing/Coding/app/DeLive`。产品名 **DeLive SQ**，appId `io.github.sisyphussq.delive`，独立用户数据目录 `/Users/suqing/Library/Application Support/DeLive SQ`。与原版分开，不自动迁移旧数据。
- arm64 DMG、ZIP 与 `release/SHA256SUMS` 已生成。采用 ad-hoc 签名，无 Developer ID / Apple 公证，不宣称 Gatekeeper trusted。首次打开可能需在“系统设置 → 隐私与安全性”选择“仍要打开”。
- 更新入口隐藏；启动检查、下载、安装和退出自动安装均关闭，`build.publish=null`。旧自动检查偏好不能重新开启更新。包内不含上游 `app-update.yml`。
- 原音本地保留。用户暂不配置对象存储；实时转写不依赖对象存储，火山标准文件转写需要服务可下载的音频 URL，对应真实验收仍 BLOCKED。
- 火山 API Key 在应用“设置 → 火山引擎”录入，真实安全存储与重启解密已验证。本机新数据目录内留有生成语音验收会话和加密凭据；原版数据未迁移。安装包不含凭据、测试 profile 或证据。
- 保留上游 Apache-2.0 LICENSE 和版权。安装包仅本地生成，未公开发布或安装至 `/Applications`；代码交付状态以 GitHub PR 为准。以下历史环境记录不代表当前状态。

仅构建与本地打包（不含测试、不会发布）：

```bash
npm run build
npx electron-builder --mac --arm64 --publish never
shasum -a 256 release/*.dmg release/*.zip > release/SHA256SUMS
```

### 本机环境准备结果（2026-11-02）

- sqmc03：macOS 27.0.1 / arm64 / Node 22.22.2 / npm 10.9.7。根目录、`frontend/`、`server/` 已按锁文件安装依赖；完整 `npm run build` 与独立服务端构建成功，未变更锁文件。
- 编译后的开发 Electron 已短暂启动并退出，界面正常加载、录制控件存在、本地代理端口为 23456、`supportsAutoUpdate=false`。真实 `safeStorage` 可用，使用非秘密样本完成加密/解密往返；这不代表正式独立包已验收。
- 用户提供的火山 API Key 保存在仓库外 `/Users/suqing/.config/delive/volc-api-key.txt`，权限为 `0600`；本次未导入应用。真实 WebSocket 握手返回 HTTP 403：`[resource_id=volc.seedasr.sauc.duration] requested resource not granted`。需检查该 Key 对应账号/项目的豆包流式语音识别模型 2.0 小时版开通与授权，再验证。握手失败前未发送音频，不能据此宣称 Key 全部无效或其他资源可用。
- 同日后续复测：用户已开通流式语音识别 2.0 和录音文件识别 2.0，控制台两项均显示剩余 20/20 小时；本地 Key 与该项目已启用 Key 的摘要匹配。20:48 首次复测仍为 403，20:51 实时接口握手成功，发送 0.4 秒生成静音后收到两条响应及最终帧。标准文件接口仅查询随机任务 ID，返回 HTTP 200 / `45000092`（任务不存在），证明该次查询未被鉴权拒绝，不代表上传/转写链路通过。没有上传会议音频、提交文件任务或改动账号配置。证据为 `tmp/evidence/686-volc-activation-recheck.json`；此前资源未授权状态已解除，实际计费/额度扣减尚未核对。
- 本地证据：`tmp/evidence/686-environment.json`、`tmp/evidence/686-local-startup.png`、`tmp/evidence/686-volc-key-probe.json`；临时用户数据位于 `tmp/too-686-env/profile/`，均被 Git 忽略，不含导入的真实 Key。
- 正式录音、云端实时转写、标准文件转写、独立安装包仍未验收；对象存储仍按用户要求暂不配置。本次未提交、推送、生成安装包或发布。

## 构建流程

```bash
npm run build
```

运行三个步骤：
1. **`generate-icons`** — 将 `frontend/public/favicon.svg` 转换为 PNG、ICO 和 ICNS
2. **`build:client`** — TypeScript 检查 + React 前端 Vite 生产构建
3. **`build:electron`** — Electron 主进程 TypeScript 编译

## 平台构建

```bash
npm run dist:win     # Windows (.exe + 便携版)
npm run dist:mac     # macOS (DMG + ZIP，arm64)
npm run dist:linux   # Linux (.AppImage + .deb)
npm run dist:all     # 所有平台
```

产物写入 `release/`。

### Electron Builder 配置

`electron-builder` 配置在根 `package.json` 的 `"build"` 键下：

| 设置 | 值 |
|------|---|
| App ID | `io.github.sisyphussq.delive` |
| 产品名称 | `DeLive SQ` |
| 输出 | `release/` |
| Windows | NSIS 安装包 + 便携版，x64 |
| macOS | DMG + ZIP，arm64 |
| Linux | AppImage + deb，x64 |
| 发布 | `null`，应用内更新关闭；仅本地打包 |

### whisper.cpp Runtime（可选）

在构建中打包 whisper.cpp 二进制文件：

```bash
npm run fetch:whisper-runtime -- --target win32
npm run stage:whisper-runtime -- --binary /path/to/whisper-server --target linux
```

如果构建时 `local-runtimes/whisper_cpp/whisper-server` 存在，`electron-builder` 将其打包为额外资源。

## CI/CD 管线（继承上游，未作为本次发行入口）

### 持续集成（`.github/workflows/ci.yml`）

每次 push（标签除外）和 PR 时运行：

1. Ubuntu runner，Node 20
2. `npm ci` 安装根目录、frontend 和 server
3. `npm run check`（lint + 测试 + 构建）

### 发布（`.github/workflows/release.yml`）

推送匹配 `v*` 的标签时触发：

**阶段 1：质量检查**（Ubuntu）
- Lint、测试和验证构建

**阶段 2：构建**（3 平台矩阵）
- Windows、macOS、Linux runner
- 完整构建 + `electron-builder --publish never`
- 上传产物

**阶段 3：发布**（Ubuntu）
- 下载所有平台产物
- 从 `CHANGELOG.md` 生成发布说明
- 创建包含所有平台文件的 GitHub Release

## 创建发布（历史机制，需另行授权）

以下标签流程仍会触发仓库 Release workflow；`publish=null` 仅关闭 electron-builder 的发布配置，不禁用 GitHub Actions。此次未执行。

1. 更新 `package.json` 中的 `version`
2. 更新 `CHANGELOG.md` 的新版本条目
3. 提交并推送
4. 创建并推送标签：

```bash
git tag v1.8.0
git push origin v1.8.0
```

发布管线将自动构建所有平台并创建 GitHub Release。

## 辅助脚本

| 脚本 | 用途 |
|------|------|
| `scripts/generate-icons.mjs` | SVG → PNG（多尺寸）、ICO、ICNS、Linux 图标目录 |
| `scripts/fetch-whisper-runtime.mjs` | 从 GitHub releases 下载 whisper.cpp 二进制 |
| `scripts/stage-whisper-runtime.mjs` | 将本地二进制复制到打包目录 |
| `scripts/generate-release-notes.mjs` | 解析 CHANGELOG.md 生成双语发布说明 |

## 后续上游同步维护

现有远端 `origin` 是 `SisyphusSQ/DeLive`，`upstream` 是 `XimilalaXiang/DeLive`。后续同步应先在单独的 `suqing/` 分支回读上游差异，保留当前工作区修改；上游同步作为后续单独任务执行。

重点审查独立 appId / productName / userData、关闭更新的主进程及 preload 能力、火山完整快照契约、录音资产和稿件版本契约，避免同步上游时恢复上游更新源或覆盖人工稿。凭据和已有录音不进入源码同步。

开发或冲突修复阶段按受影响行为验证；提交/发版收尾复用已有证据，不重复测试。重新打包后核对签名、归档和 SHA256；若 ad-hoc 应用再次请求钥匙串访问，由用户在本机授权。保持原版数据分开，不自动迁移或清理；迁移需另行明确范围。公开发布与启用更新另需授权，不能直接把继承的标签发布流程当作已批准的发行入口。
