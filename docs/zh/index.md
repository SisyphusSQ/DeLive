---
layout: home
hero:
  name: DeLive
  text: 桌面转录工作台
  tagline: 捕获系统音频 · 四种 ASR 后端转录 · AI 复盘 — 纠错、摘要、对话、思维导图，全部本地优先
  image:
    src: /logo.svg
    alt: DeLive
  actions:
    - theme: brand
      text: 下载 v2.2.4
      link: https://github.com/XimilalaXiang/DeLive/releases/latest
    - theme: alt
      text: 快速开始 →
      link: /zh/guide/getting-started
    - theme: alt
      text: API 参考
      link: /zh/api/rest
features:
  - icon: 🎙️
    title: 四种 ASR 后端，统一界面
    details: 默认使用火山实时 2.0 和标准文件转写 2.0，支持本地 OpenAI 兼容、FunASR / SenseVoice 与 whisper.cpp。
  - icon: 🧠
    title: AI 复盘工作台
    details: 全页工作台，四个标签页 — 转录（带 AI 侧边栏）、总结（概览、行动项、关键词）、多线程对话（流式输出）、Markmap 思维导图。AI 纠错支持智能文本源选择。
  - icon: 🔒
    title: 本地优先 & 安全
    details: 会话存储在 IndexedDB，密钥通过 safeStorage 加密，上下文隔离、可信窗口 IPC、CSP 注入、导航守卫。本地保存会话；调用远端转写或 AI 服务时，所需资料会发送给所选服务。
  - icon: 🌐
    title: 开放 API 与 MCP 生态
    details: 本地 REST API（8 个端点）、实时 WebSocket 流、独立 MCP 服务器（支持 Claude Desktop 和 Cursor）、Agent Skill 定义、Agent Skills 一键调用转录 — AI 集成一步到位。
  - icon: 📁
    title: 文件转录
    details: 上传音频/视频文件，可使用全部 4 种 Provider 转录，从云端引擎到完全本地的 whisper.cpp 与 FunASR / SenseVoice。说话人分离、词级时间戳和语言检测视 Provider 能力而定。
  - icon: 🎨
    title: 八套主题，明暗切换
    details: 紫罗兰、青蓝、玫瑰、绿色、琥珀、樱粉、石板灰、橙韵八种配色。全新持久化侧栏导航和命令面板（Ctrl+K）。
---

<style>
:root {
  --vp-home-hero-name-color: transparent;
  --vp-home-hero-name-background: -webkit-linear-gradient(120deg, #0ea5e9 30%, #6366f1);
  --vp-home-hero-image-background-image: linear-gradient(-45deg, #0ea5e940 50%, #6366f140 50%);
  --vp-home-hero-image-filter: blur(44px);
}

@media (min-width: 640px) {
  :root {
    --vp-home-hero-image-filter: blur(56px);
  }
}

@media (min-width: 960px) {
  :root {
    --vp-home-hero-image-filter: blur(68px);
  }
}

.screenshots {
  max-width: 1152px;
  margin: 0 auto;
  padding: 48px 24px 0;
}

.screenshots h2 {
  text-align: center;
  font-size: 1.8rem;
  font-weight: 700;
  margin-bottom: 8px;
}

.screenshots .subtitle {
  text-align: center;
  color: var(--vp-c-text-2);
  margin-bottom: 32px;
  font-size: 1.05rem;
}

.screenshot-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin-bottom: 24px;
}

@media (max-width: 768px) {
  .screenshot-grid {
    grid-template-columns: 1fr;
  }
}

.screenshot-card {
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  overflow: hidden;
  background: var(--vp-c-bg-soft);
  transition: transform 0.2s, box-shadow 0.2s;
}

.screenshot-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.08);
}

.screenshot-card img {
  width: 100%;
  display: block;
}

.screenshot-card .caption {
  padding: 12px 16px;
  font-size: 0.9rem;
  font-weight: 600;
  text-align: center;
  color: var(--vp-c-text-1);
}

.whats-new {
  max-width: 1152px;
  margin: 0 auto;
  padding: 48px 24px;
}

.whats-new h2 {
  text-align: center;
  font-size: 1.8rem;
  font-weight: 700;
  margin-bottom: 8px;
}

.whats-new .subtitle {
  text-align: center;
  color: var(--vp-c-text-2);
  margin-bottom: 32px;
  font-size: 1.05rem;
}

.new-features {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

@media (max-width: 768px) {
  .new-features {
    grid-template-columns: 1fr;
  }
}

.new-feature {
  padding: 20px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
}

.new-feature .icon {
  font-size: 1.4rem;
  margin-bottom: 8px;
}

.new-feature h3 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 6px;
}

.new-feature p {
  font-size: 0.88rem;
  color: var(--vp-c-text-2);
  line-height: 1.5;
  margin: 0;
}

.platforms {
  max-width: 1152px;
  margin: 0 auto;
  padding: 24px 24px 64px;
  text-align: center;
}

.platforms h2 {
  font-size: 1.8rem;
  font-weight: 700;
  margin-bottom: 8px;
}

.platforms .subtitle {
  color: var(--vp-c-text-2);
  margin-bottom: 24px;
  font-size: 1.05rem;
}

.platform-badges {
  display: flex;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
}

.platform-badges a img {
  height: 40px;
}
</style>

<div class="screenshots">
  <h2>功能一览</h2>
  <p class="subtitle">实时转录、AI 复盘、智能归档 — 尽在一个桌面应用</p>
  <div class="screenshot-grid">
    <div class="screenshot-card">
      <img src="/images/screenshot-live.png" alt="实时转录" />
      <div class="caption">实时转录</div>
    </div>
    <div class="screenshot-card">
      <img src="/images/screenshot-mcp-integration.png" alt="MCP 集成" />
      <div class="caption">MCP 集成</div>
    </div>
    <div class="screenshot-card">
      <img src="/images/screenshot-ai-overview.png" alt="AI 概览" />
      <div class="caption">AI 概览与 Briefing</div>
    </div>
    <div class="screenshot-card">
      <img src="/images/screenshot-ai-correction.png" alt="AI 纠错" />
      <div class="caption">AI 转录纠错</div>
    </div>
    <div class="screenshot-card">
      <img src="/images/screenshot-ai-chat.png" alt="AI 对话" />
      <div class="caption">AI 对话（带引用）</div>
    </div>
    <div class="screenshot-card">
      <img src="/images/screenshot-mindmap.png" alt="思维导图" />
      <div class="caption">思维导图可视化</div>
    </div>
    <div class="screenshot-card">
      <img src="/images/screenshot-review-history.png" alt="复盘历史" />
      <div class="caption">复盘与历史</div>
    </div>
    <div class="screenshot-card">
      <img src="/images/screenshot-topics-view.png" alt="主题管理" />
      <div class="caption">主题归类管理</div>
    </div>
    <div class="screenshot-card">
      <img src="/images/screenshot-settings-api.png" alt="设置" />
      <div class="caption">设置与配置</div>
    </div>
  </div>
</div>

<div class="whats-new">
  <h2>最新特性</h2>
  <p class="subtitle">双来源录制、火山与本地转写、原音回放与版本审阅</p>
  <div class="new-features">
    <div class="new-feature">
      <div class="icon">📁</div>
      <h3>火山与本地文件转写</h3>
      <p>火山标准文件转写支持导入和会议原音。三种本地服务也支持文件转写。</p>
    </div>
    <div class="new-feature">
      <div class="icon">🖥️</div>
      <h3>FunASR / SenseVoice</h3>
      <p>可连接自建的 <code>funasr-server</code>。可选 SenseVoice（情感与音频事件标签）、Paraformer 或 Fun-ASR-Nano，无 API 费用。</p>
    </div>
    <div class="new-feature">
      <div class="icon">🇰🇷</div>
      <h3>韩语界面</h3>
      <p>提供中文、英文和韩语界面，涵盖托盘菜单、主进程文案和本地化错误信息。</p>
    </div>
    <div class="new-feature">
      <div class="icon">🔌</div>
      <h3>代理端口更稳健</h3>
      <p>内置代理依次尝试 23456–23460 端口，均被占用时改用系统分配的空闲端口；代理启动失败时主窗口仍会打开。</p>
    </div>
  </div>
</div>

<div class="platforms">
  <h2>跨平台支持</h2>
  <p class="subtitle">Windows、macOS（Intel 与 Apple Silicon）、Linux 全平台覆盖</p>
  <div class="platform-badges">
    <a href="https://github.com/XimilalaXiang/DeLive/releases/latest"><img src="https://img.shields.io/badge/Windows-下载-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Windows" /></a>
    <a href="https://github.com/XimilalaXiang/DeLive/releases/latest"><img src="https://img.shields.io/badge/macOS-下载-000000?style=for-the-badge&logo=apple&logoColor=white" alt="macOS" /></a>
    <a href="https://github.com/XimilalaXiang/DeLive/releases/latest"><img src="https://img.shields.io/badge/Linux-下载-FCC624?style=for-the-badge&logo=linux&logoColor=black" alt="Linux" /></a>
  </div>
</div>


[会议双来源录音与原音资产说明](./development/recording-assets)

[火山实时 2.0 与匿名说话人](./development/volc-realtime)

[火山文件转写、逐句校正与历史校正版恢复](./development/transcript-reconciliation)
