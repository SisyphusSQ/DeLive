# TOO-693 验证记录

2026-11-03，sqmc03，macOS arm64，Electron 40。使用独立 profile，不替换已安装应用，不改用户缩放设置。

| 层级 | 结果 |
| --- | --- |
| 开发检查 | 前端/Electron 构建通过；67 测试文件、508 项通过；lint 无错误，既有警告保留 |
| 原生输入 | `scripts/test-zoom-electron.cjs`：发送 Electron 原生 keyDown/keyUp，`Cmd =` 100→110、`Cmd +` 110→120、`Cmd -` 120→110、`Cmd 0`→100；设置输入框和原生页面模态对话框中一致 |
| 连续缩放/菜单 | 多次按键稳定限制 75%–150%；主要保存操作和滚动布局可用；菜单放大只影响主窗口；非法保存值回到 100%，越界夹限 |
| 字幕与焦点 | 创建真实字幕窗口，独立 session；主界面 150% 时字幕仍 100%，字体样式未变化；另一个窗口焦点下主窗口比例不变，缩放菜单不作用于其他窗口；四种缩放 accelerator 均未注册 globalShortcut |
| 打包应用 | `tmp/package-693/mac-arm64/DeLive SQ.app`，使用包内主进程、preload 和生产 UI，同一套原生输入/焦点/字幕/菜单/边界断言 PASS；ad-hoc 签名，未公证/发布 |
| 进程重启 | 上述打包应用保存 130%，退出后用同一隔离 profile 重启，原生 getZoomFactor 回读 1.3，PASS |

详细结果和截图：被 Git 忽略的 `tmp/evidence/693/{electron,packaged,packaged-restart}.json`、`zoom.png`。打包测试不是浏览器开发页，输入通过 Electron 原生事件注入，没有将其声称为手动物理键盘操作。

审查保留现有应用菜单角色和原窗口/录制快捷键实现。Electron 40 不支持最新文档中的 setZoomMode，因此使用字幕独立 session；同时补回独立 session 的 CSP 和初始语言同步，避免缩放隔离造成其他能力退化。

范围为 macOS。没有新增系统全局缩放注册；跨窗口焦点及注册表检查通过，未对用户正在使用的其他应用注入按键。未修改录音、ASR、AI 或字幕字号设置，未发版。进入提交/合并后不重复执行测试。
