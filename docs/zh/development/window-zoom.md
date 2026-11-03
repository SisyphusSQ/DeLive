# 主界面缩放

macOS 主窗口支持 `Cmd +` 或 `Cmd =` 放大、`Cmd -` 缩小、`Cmd 0` 恢复 100%。也可从应用“视图”菜单操作。缩放覆盖录制、回顾、设置和页面内弹窗；输入框获得焦点时同样有效。

比例每次增减 10 个百分点，限制为 75%–150%，避免无限缩小或放大后无法操作。窗口较窄时沿用现有侧栏自动折叠和滚动布局；无需调整系统分辨率。比例保存在当前应用数据目录的 `window-zoom.json`，启动和页面重新加载时恢复；不是字幕字号或会议资料，不进入云备份。

使用 Electron `webContents.setZoomFactor`，没有 CSS 整页变换。主窗口 `before-input-event` 同时阻止默认页面/菜单处理，避免一次按键重复缩放。菜单的缩放动作限定到当前主窗口，其他菜单角色保留。不增加系统全局快捷键，已有录制/窗口显示快捷键保持原实现。

Electron 40 尚无较新版本的 `setZoomMode('isolated')`。字幕采用独立内存 session 隔离同源缩放，保留原 CSP；样式、文字、初始语言从 IPC 同步，不依赖主窗口 localStorage。字幕仍由独立字号配置控制。

参考：[Electron webContents](https://www.electronjs.org/docs/latest/api/web-contents)、[菜单角色](https://www.electronjs.org/docs/latest/api/menu-item)。验证见 [TOO-693 记录](./evidence-too-693.md)。
