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

### 自用签名与录屏授权（2026-11-03）

以下保留旧开发证书不可用时的临时处理记录；正式签名流程见后文“Developer ID 正式签名与公证”。当时按 Codex Pulse 同款方式使用完整 ad-hoc 签名，不依赖 Apple Development 证书。开发证书方案已撤回：本机证书在线检查返回 `CSSMERR_TP_CERT_REVOKED`，对应开发签名包不可用。

固定安装位置为 `/Applications/DeLive SQ.app`，用户数据仍为 `/Users/suqing/Library/Application Support/DeLive SQ`，不迁移或清理。重新打包后代码哈希可能变化，固定路径不能保证旧录屏授权继续有效。若系统开关已开启但仍反复弹窗，先完全退出应用，再仅重置本应用的录屏权限：

```bash
tccutil reset ScreenCapture io.github.sisyphussq.delive
```

重新打开安装目录中的应用，触发捕获，在系统设置授权，再按提示重启。本轮已生成 `release/adhoc-local/` 下的 DMG/ZIP，deep/strict 签名检查通过；已安装到上述固定路径并确认界面正常打开，仅 DeLive 的 ScreenCapture 授权已重置。实际录屏和系统音频待用户重新授权后验证。首次授权必须由用户完成；不重置其他应用权限，不关闭系统安全保护。ad-hoc 包未经 Developer ID 签名或公证，不宣称可信公开分发。

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

1. Ubuntu runner，Node 22
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


### 退出崩溃修复（2026-11-04）

- Electron 从 40.0.0 固定升级至 40.10.6，同一主版本内包含 [退出时原生对象回收崩溃修复](https://github.com/electron/electron/pull/50693)。安装依赖要求 Node >=22.12.0，CI 同步使用 Node 22。
- `node scripts/test-quit-electron.cjs` 在临时独立用户目录启动真实主进程与页面，再通过 `app.quit()` 退出；断言退出码 0、没有终止信号、收到 quit 事件。临时目录自动移除，结果写入 `tmp/evidence/quit/electron-<version>.json`。
- 40.0.0 的空白配置检查也能通过，不能据此否定真实安装包的退出崩溃。最终以更新后安装包的实际退出、重开及系统崩溃报告回读为准。
- 本机安装包验证：40.10.6 打开已有会话和对话后，通过 Cmd+Q 正常退出，进程结束且未新增崩溃报告；随后重新打开成功，8 条原有录音与对话记录保留。该结果不代表长时间录音或所有退出场景均已覆盖。

### 本机更新与系统权限的签名一致性

2026-11-04 的系统 TCC 日志确认：旧包授权保存的是 ad-hoc `cdhash`，换包后新哈希无法满足录屏授权条件，导致系统设置开关仍开着但屏幕列表加载失败。不能靠重复重启或改权限提示解决。

- 本机 macOS 打包默认选择钥匙串中唯一可用的 Developer ID Application 证书；带撤销或过期错误的条目不会自动选中，多张或没有时停止，使用 `DELIVE_MAC_SIGN_IDENTITY` 显式选择。后续更新保持相同开发团队、appId 与签名要求。
- `scripts/fix-mac-signing.mjs` 使用已有的 `@electron/osx-sign` 逐层签名，完成资源封印与证书撤销验证，不再默默以 ad-hoc 替代证书。`node scripts/test-mac-signing.mjs` 验证证书选择与拒绝分支。
- CI 当前没有发行证书，明确设置 `DELIVE_ALLOW_ADHOC=1` 维持临时产物；这种包不保证更新后权限延续，不用于覆盖本机持续安装的证书签名包。正式分发需另行配置 Developer ID 与公证。
- 首次从临时签名切换到证书签名，需要用户在系统设置重新授予 DeLive SQ 录屏/麦克风权限，钥匙串也可能重新确认。不要关闭系统保护、修改 TCC 数据库或把 API 密钥改为明文。

- 证书签名完成后必须在线检查 OCSP 撤销状态；`security find-identity -v` 与普通 `codesign --verify` 不足以证明证书可启动。2026-11-04 的旧开发证书曾同时通过这两项，但 AMFI 报 `CSSMERR_TP_CERT_REVOKED`，OCSP 也确认撤销，当时已恢复安装前的应用包。2026-11-05 已换为下节的 Developer ID 正式证书；录音与跨更新权限验收单独记录。

### Developer ID 正式签名与公证（2026-11-05）

正式团队为 `9FZ62TNHWJ`，应用标识仍为 `io.github.sisyphussq.delive`。sqmc03 已创建并安装 `Developer ID Application: zheng zhao (9FZ62TNHWJ)`，证书 SHA-1 为 `85A757A7E208901262FF9C5AFFFAF4712DDD0B88`，到期日为 2027-12-05。私钥由本机钥匙串生成并保管；源码和安装包不包含私钥或公证凭据。

三台机器分别生成私钥，没有跨机器复制私钥。证书均于 2027-12-05 到期：

| 机器 | Developer ID 证书 SHA-1 | 已完成验证 |
| --- | --- | --- |
| sqmc03 | `85A757A7E208901262FF9C5AFFFAF4712DDD0B88` | OCSP、应用深层签名检查、安装与启动 |
| sqmc04 | `981F285EEBDA59037B8FBEE3D53BCD71E0C795C5` | OCSP、临时文件签名及执行 |
| sqmc05 | `FCEB3ED0C43137FCB3A425A2A37A8318432F9812` | OCSP、临时文件签名及执行 |

sqmc05 另补齐 Apple 官方 [Developer ID G2 中间证书](https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer)，没有改变系统根证书信任设置。远端通过 Tailscale 与现有 SSH 密钥、严格主机校验访问；登录钥匙串由用户在终端安全解锁，密码未进入脚本或日志。公钥证书和请求保留在各机 `/Users/suqing/.config/apple-developer/requests/`。锁定的钥匙串仍需本人解锁才能签名，不自动保存登录密码或关闭自动锁定。

正式包使用 Electron 签名库的 Hardened Runtime 与安全时间戳；主应用只声明 JIT 和麦克风输入 entitlement，嵌套代码沿用库为 Electron 提供的配置。签名后检查代码封印和 OCSP；显式启用公证时，再用 Xcode 的 `notarytool` 提交 Apple 公证，成功后由 `stapler` 装订票据。本机实测 S3 加速端点连接超时，普通 S3 端点可连通，因此提交固定使用 Apple 支持的 `--no-s3-acceleration`，见 [官方网络要求](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow)。`build.mac.identity=null` 用于关闭 electron-builder 的重复签名，实际签名与可选公证由 `afterPack` hook 完成。

默认仅进行 Developer ID 签名，不上架、不公开发布，也不等待 Apple 公证。需要公证时，先在本机终端执行下列命令，在安全提示中输入 Apple 应用专用密码；不要使用 Apple 账号登录密码，不把密码写入仓库或命令参数：

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun notarytool store-credentials delive-notary \
  --apple-id your-apple-id@example.com --team-id 9FZ62TNHWJ
```

构建与签名（不会发布）：

```bash
npm run build
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
DELIVE_MAC_SIGN_IDENTITY=85A757A7E208901262FF9C5AFFFAF4712DDD0B88 \
  npx electron-builder --mac --arm64 --publish never \
  --config.directories.output=release/developer-id
```

需要额外公证时，在打包命令前增加 `APPLE_KEYCHAIN_PROFILE=delive-notary`。OCSP 或显式启用的公证失败都会中止；不把失败伪装为成功。`DELIVE_ALLOW_ADHOC=1` 只保留给明确的临时包和现有 CI，不要求公证凭据，不用于覆盖持续安装的正式签名应用。

首次由 ad-hoc 切换到 Developer ID 时，系统可能要求重新确认录屏、麦克风或钥匙串访问。实际录音与跨更新权限延续须单独验收；不能仅凭证书、公证或构建成功判定已经通过。

2026-11-05 的实机迁移中，系统设置开关已开启，TCC 仍报告 `Failed to match existing code requirement`：录屏、系统音频和麦克风的旧授权保存的是 ad-hoc `cdhash`，与正式签名不匹配。仅切换开关或重启应用未替换这些旧记录。已确认该原因后，先完全退出 DeLive SQ，再只重置本应用的三项授权：

```bash
tccutil reset ScreenCapture io.github.sisyphussq.delive
tccutil reset Microphone io.github.sisyphussq.delive
tccutil reset AudioCapture io.github.sisyphussq.delive
```

重新打开 `/Applications/DeLive SQ.app`，在“录屏与系统录音”上方列表点击添加，明确选择这个安装路径。由用户完成系统验证后按提示退出并重新打开，再在首次采集时确认麦克风等系统授权。此操作不清理会话和原音，不重置其他应用，不修改 TCC 数据库或系统保护。仅用于已证实旧身份失配的首次迁移，不应在常规更新时重复执行。

本次实机结果：系统提示音录音、系统声音与麦克风双音源采集及分片落盘通过。随后重新生成仅签名包并替换安装，应用代码哈希由 `d2b8965fcbf242639b214f433472c705c3b2bb96` 变为 `bdfe0f69c0f935143b60db6e8d448f87cfe0ea54`，开发团队与 appId 的签名身份要求完全相同；新包无需再次授权即可采集两个音源。换包后约 47.8 秒的验证录音已完成，系统声音和麦克风均有非静音采样。原有 8 条原音记录保留，另留 3 条本地验证录音；测试期间未调用云转写，结束后恢复系统声音、麦克风开启及普通转写模式，应用保持待录制。

最终 DMG、ZIP 和 `SHA256SUMS` 位于 `release/signed-local/`，当前安装为 `/Applications/DeLive SQ.app`，前一个正式签名包保存在 `release/signed-local/previous-install/`。验证记录为 `tmp/evidence/signing-20261105/final-verification.json`，前后 TCC 日志与签名身份快照位于同目录。构建、打包与实际换包采集已验证；没有执行上架、公开发布或 Git 提交。云转写、长会议、回声和音质不属于本次验收结论。

可选公证曾成功上传，申请 ID 为 `001ab590-52ff-4cbf-bdef-f17992820ed8`；最近可见状态仍为处理中，后续查询超时。按本地仅签名范围已结束本机等待进程，没有取得完成回执或装订票据，不宣称这些产物已公证。

### 录音权限提示（2026-11-04）

开始录制前按已勾选的音源检查 macOS 权限。录屏权限拒绝/受限、麦克风权限不可用时弹原生说明窗口，提供“打开系统设置”和“取消”；首次麦克风请求使用系统授权窗口，首次录屏请求仍由原来的屏幕选择器触发。未授权不会进入采集；错误持续显示在录音区。新 IPC 校验调用方与参数，仅打开固定权限设置地址。

已验证：权限处理分支脚本、6 项采集测试、前后端构建通过；安装包实际点击开始录制弹出录屏权限说明，退出弹窗后恢复可重试状态并保留错误文字。此改动提供显式恢复入口，不代表修复 ad-hoc 更新后的身份延续；未完成授权后的实际录音验收。
