> [DeLive SQ 2.3.0-sq.1 預發佈版](https://github.com/SisyphusSQ/DeLive/releases/tag/v2.3.0-sq.1) 提供 macOS Apple Silicon（arm64）DMG/ZIP：Developer ID 正式簽章、未公證、手動更新，資料與原版分開且不自動遷移。下文官網、徽章及其他下載連結屬於上游專案；本 fork 的安裝、權限恢復及發佈流程見 [建置說明](docs/zh/development/build.md)。

<div align="center">

<img src="assets/header.png" width="100%" alt="DeLive Banner" />

---

系統音訊擷取 | 多 Provider ASR | 本地優先的 AI 複盤工作台

[English](./README.md) | [简体中文](./README_ZH.md) | 繁體中文 | [日本語](./README_JA.md)

[![版本](https://img.shields.io/github/v/release/XimilalaXiang/DeLive?label=版本&color=blue)](https://github.com/XimilalaXiang/DeLive/releases)
[![授權](https://img.shields.io/github/license/XimilalaXiang/DeLive?label=授權&color=green)](https://github.com/XimilalaXiang/DeLive/blob/main/LICENSE)
[![Platform](https://img.shields.io/badge/Windows-0078D6?logo=windows&logoColor=white)](https://github.com/XimilalaXiang/DeLive/releases)
[![Platform](https://img.shields.io/badge/macOS-000000?logo=apple&logoColor=white)](https://github.com/XimilalaXiang/DeLive/releases)
[![Platform](https://img.shields.io/badge/Linux-FCC624?logo=linux&logoColor=black)](https://github.com/XimilalaXiang/DeLive/releases)
[![下載量](https://img.shields.io/github/downloads/XimilalaXiang/DeLive/total?label=下載量&color=orange)](https://github.com/XimilalaXiang/DeLive/releases)
[![Stars](https://img.shields.io/github/stars/XimilalaXiang/DeLive?style=social)](https://github.com/XimilalaXiang/DeLive)
[![文檔](https://img.shields.io/badge/文檔-VitePress-646cff?logo=vitepress&logoColor=white)](https://docs.delive.me/zh/)

</div>

<div align="center">

🌐 **[官方網站](https://delive.me)** · 📖 **[專案文檔](https://docs.delive.me/zh/)** · 📋 **[使用指南](https://docs.delive.me/zh/guide/getting-started)** · ⬇️ **[立即下載](https://github.com/XimilalaXiang/DeLive/releases/latest)**

</div>

DeLive 是一個面向系統音訊的桌面轉錄工作台。它會擷取電腦正在播放的聲音，按所選 Provider 的能力選擇最合適的轉錄鏈路（共支援 4 種 ASR 後端），把會話保存在本機，並在錄製結束後提供完整的 AI 複盤工作台——支援 AI 糾錯、富文本 Markdown 對話、結構化 briefing、會話問答和思維導圖整理。同時支援上傳音訊/影片檔案進行離線轉錄，雲端與本地共 4 種 Provider 均可用於檔案轉錄。

## 示範

中文產品演示，快速了解 DeLive 的核心能力。

<div align="center">

https://github.com/user-attachments/assets/d363c237-e112-4f47-b72e-252aef45e6b4

</div>

**章節**

1. 整體瀏覽
2. 即時轉錄 + 多人辨識
3. AI 摘要 + 思維導圖 + AI 對話 + AI 糾錯
4. 檔案轉錄
5. MCP 呼叫
6. Skill 呼叫

<div align="center">

#

| 即時轉錄 | MCP 整合 |
|:---:|:---:|
| 4 種 ASR 引擎即時轉錄 | 外部 AI 工具透過 MCP 協定存取 DeLive |
| <img width="300" src="assets/screenshot-live.png" alt="即時轉錄" /> | <img width="300" src="assets/screenshot-mcp-integration.png" alt="MCP 整合" /> |

| AI 概覽 | AI 糾錯 | AI 對話 |
|:---:|:---:|:---:|
| 摘要、行動項、關鍵詞與章節 | 直接糾錯 & 先檢測後糾錯，並排對比 | 多執行緒對話，帶引用片段 |
| <img width="300" src="assets/screenshot-ai-overview.png" alt="AI 概覽" /> | <img width="300" src="assets/screenshot-ai-correction.png" alt="AI 糾錯" /> | <img width="300" src="assets/screenshot-ai-chat.png" alt="AI 對話" /> |

#

</div>

## 🎯 核心功能

- **系統音訊擷取** — 網頁影片、直播、會議、課程、Podcast，只要共享系統音訊即可接入
- **四種 ASR 服務** — 火山引擎、本地 OpenAI 相容、本地 FunASR / SenseVoice、本地 whisper.cpp
- **檔案轉錄** — 火山是預設雲端服務，檔案轉錄也可使用三種本地服務。
- **AI 複盤工作台** — 糾錯（直接糾錯 / 先檢測後糾錯）、結構化 briefing、多執行緒對話、問答、思維導圖
- **主題功能** — 將會話歸類到專案容器中
- **本地優先** — 會話、標籤、主題、設定保存在本機；可選 S3/WebDAV 雲端備份
- **開放 API 與 MCP** — 本地 REST API、即時 WebSocket、MCP 伺服器，供 AI Agent 使用
- **多語言介面** — 简体中文、English、한국어
- **跨平台** — Windows、macOS、Linux

> 📖 完整功能介紹：[文檔](https://docs.delive.me/zh/guide/what-is-delive)

## 📥 下載安裝

<div align="center">

[![Windows](https://img.shields.io/badge/Windows-下載-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/XimilalaXiang/DeLive/releases/latest)
[![macOS](https://img.shields.io/badge/macOS-下載-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/XimilalaXiang/DeLive/releases/latest)
[![Linux](https://img.shields.io/badge/Linux-下載-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://github.com/XimilalaXiang/DeLive/releases/latest)

</div>

| 平台 | 檔案 |
|------|------|
| Windows | `.exe` 安裝程式、免安裝版 `.exe` |
| macOS | `.dmg`、`.zip`（Intel x64 和 Apple Silicon arm64） |
| Linux | `.AppImage`、`.deb` |

## 🔌 支援的 ASR Provider

| Provider | 類型 | 傳輸模式 | 檔案轉錄 | 亮點 |
|----------|------|----------|----------|------|
| **火山引擎** | 雲端 | 即時串流 | 支援 | 中文場景友善，內建代理 |
| **本地 OpenAI-compatible** | 本地 | 視窗批次 | 支援 | 適配 Ollama 或相容閘道 |
| **本地 FunASR / SenseVoice** | 本地 | 視窗批次 | 支援 | 自建 funasr-server；SenseVoice（情感 + 音訊事件）、Paraformer，無 API 費用 |
| **本地 whisper.cpp** | 本地 | Electron 管理 | 支援 | 全本地運行，DeLive 管理 binary 和模型 |

> 📖 Provider 設定詳情：[API Key 指南](https://docs.delive.me/zh/guide/api-keys) · [Provider 對比](https://docs.delive.me/zh/guide/providers)

## 🚀 快速開始

```bash
git clone https://github.com/XimilalaXiang/DeLive.git
cd DeLive
npm run install:all
npm run dev
```

> 📖 完整開發指南：[環境搭建](https://docs.delive.me/zh/development/setup) · [建置打包](https://docs.delive.me/zh/development/build) · [測試](https://docs.delive.me/zh/development/testing)

## 🏗️ 系統架構

```mermaid
graph TB
    subgraph "桌面殼層"
        EM[Electron 主程序]
        WIN[主視窗]

        DESK[系統匣 / 快捷鍵 / 自啟動 / 更新]
        SEC[IPC 安全 / SafeStorage / Diagnostics]
    end

    subgraph "渲染層"
        UI[React App]
        STORES[Zustand Stores]
        CFG[Provider 與 Runtime 設定]
        PREV[歷史 / 預覽 / AI 工作台]
    end

    subgraph "編排層"
        ASR[useASR]
        CAPMGR[CaptureManager]
        PROVSESS[ProviderSessionManager]

    end

    subgraph "擷取管線"
        GDM[getDisplayMedia]
        MR[MediaRecorder<br/>WebM / Opus]
        AP[AudioWorklet<br/>PCM16 16kHz]
    end

    subgraph "Provider 層"
        REG[Provider Registry]

        VOL[Volcengine]

        LOA[Local OpenAI-compatible]

        FUN[FunASR / SenseVoice]
        WCP[whisper.cpp Runtime]
    end

    subgraph "Electron 服務"
        PROXY[內建多 Provider 代理]
        RTM[本地 Runtime 控制器]
    end

    subgraph "持久化"
        REPO[Session Repository]
        IDB[IndexedDB]
        LS[localStorage]
        SAFE[safeStorage]
    end

    UI --> STORES
    UI --> CFG
    UI --> PREV
    UI --> ASR
    ASR --> CAPMGR
    ASR --> PROVSESS

    CAPMGR --> GDM
    GDM --> MR
    GDM --> AP
    PROVSESS --> REG

    AP --> VOL & ELB & MIS & GLA & DPG & AAI & CFL & SIL & GRQ & SDB & WCP
    VOL & MIS & DPG & AAI & ELB & GLA & SDB --> PROXY
    WCP --> RTM
    STORES --> REPO
    REPO --> IDB & LS
    CFG --> SAFE
    UI --> EM
    EM --> WIN & CAP & DESK & SEC & PROXY & RTM

    style UI fill:#61dafb,color:#000
    style EM fill:#334155,color:#fff

    style REG fill:#f59e0b,color:#000
    style PROXY fill:#10b981,color:#fff
    style RTM fill:#0f766e,color:#fff
    style SEC fill:#ef4444,color:#fff
    style SAFE fill:#a855f7,color:#fff
    style IDB fill:#3b82f6,color:#fff
```

> 📖 詳細架構：[架構總覽](https://docs.delive.me/zh/architecture/overview) · [Provider 架構](https://docs.delive.me/zh/architecture/providers) · [Electron IPC](https://docs.delive.me/zh/architecture/electron-ipc) · [資料流](https://docs.delive.me/zh/architecture/data) · [安全](https://docs.delive.me/zh/architecture/security)

## 📁 專案結構

```text
DeLive/
├── electron/          # Electron 主程序、視窗、系統匣、IPC、更新、runtime、Open API 伺服器
├── frontend/          # React 渲染層、Provider、Store、UI 元件、測試
├── shared/            # 共用 TypeScript 契約與代理 helper
├── server/            # 主要用於除錯的獨立代理伺服器
├── mcp/               # MCP 伺服器，供 AI Agent 使用（Claude、Cursor 等）
├── skills/            # Agent Skill 定義
├── scripts/           # 圖示生成、runtime 預置、release notes
├── docs/              # VitePress 文檔站原始碼
├── landing/           # Landing page 原始碼
└── package.json
```

> 📖 完整專案結構：[專案結構](https://docs.delive.me/zh/development/structure)

## 🔧 技術棧

| 層級 | 技術 |
|------|------|
| 桌面應用 | Electron 40 |
| 前端 | React 18.3 + TypeScript 5.6 + Vite 6 |
| 樣式 | Tailwind CSS 3.4 |
| 狀態管理 | Zustand 4.5 |
| 測試 | Vitest 4（373 測試 / 44 檔案） |
| 持久化 | IndexedDB、localStorage、Electron safeStorage |
| 打包 | electron-builder + GitHub Actions |

## 🌐 開放 API 與 MCP

DeLive 透過本地 REST API、即時 WebSocket 和 MCP 伺服器對外開放轉錄資料——預設關閉，可選 Bearer Token 驗證。

> 📖 完整 API 參考：[REST](https://docs.delive.me/zh/api/rest) · [WebSocket](https://docs.delive.me/zh/api/websocket) · [MCP 伺服器](https://docs.delive.me/zh/api/mcp) · [驗證](https://docs.delive.me/zh/api/authentication) · [Agent Skill](https://docs.delive.me/zh/api/agent-skill)

## ⚠️ 注意事項

- **系統需求**：Windows 10+、macOS 13+、或具備 PulseAudio loopback 的 Linux。
- **Provider 代理**內建在 Electron 中，正常桌面使用無需單獨後端。
- **系統匣行為**：關閉主視窗預設隱藏到系統匣。
- **自動更新**：支援 Windows、macOS 和 Linux AppImage。

### 🛡️ Windows SmartScreen 提示

首次執行時 Windows 可能彈出 SmartScreen 警告。點選 **更多資訊** → **仍要執行**。

## 📄 授權

Apache License 2.0

## 🙏 致謝

- [BiBi-Keyboard](https://github.com/BryceWG/BiBi-Keyboard) — 多 Provider 架構靈感
- [字節跳動](https://www.bytedance.com) — 火山引擎語音辨識服務與飛書 AI 校園挑戰賽支持
- [LINUX.DO](https://linux.do) 社群 — 在這裡學到了很多，感謝社群一直以來的慷慨幫助與支持

---

<div align="center">

[![Star History Chart](https://api.star-history.com/svg?repos=XimilalaXiang/DeLive&type=date&legend=top-left)](https://www.star-history.com/#XimilalaXiang/DeLive&type=date&legend=top-left)

**Made by [XimilalaXiang](https://github.com/XimilalaXiang)**

</div>
