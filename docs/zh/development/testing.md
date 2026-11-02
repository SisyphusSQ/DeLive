# 测试

## 框架

DeLive 使用 **Vitest** 进行前端测试，配置如下：

- **环境：** `node`（非 jsdom — 测试中无 DOM API）
- **全局：** `true`（无需导入 `describe`、`it`、`expect`）
- **包含模式：** `src/**/*.test.ts`
- **别名：** `@` → `frontend/src`

## 运行测试

```bash
npm run test:frontend
```

或从 frontend 目录：

```bash
cd frontend && npx vitest run
```

开发时的监视模式：

```bash
cd frontend && npx vitest
```

## 测试覆盖

当前套件：**44 个文件中 373 个测试**。

### 已测试

| 区域 | 文件 | 覆盖范围 |
|------|------|---------|
| 会话 Schema 和规范化 | `sessionSchema.test.ts` | Schema 升级、字段规范化 |
| 会话元数据 | `sessionMetadata.test.ts` | 标题生成、时间格式化 |
| 会话生命周期 | `sessionLifecycle.test.ts` | 草稿创建、源元数据 |
| 会话仓库 | `sessionRepository.test.ts` | 缓存操作、持久化 |
| 会话快照 | `sessionSnapshot.test.ts` | 内容检测、快照构建 |
| 转录稳定器 | `transcriptStabilizer.test.ts` | 稳定前缀检测 |
| 窗口转录 | `windowedTranscript.test.ts` | 重叠处理、文本合并 |
| 转录状态 | `transcriptState.test.ts` | 事件应用 |
| 存储工具 | `storage.test.ts`、`backupStorage.test.ts` | ID 生成、备份规范化 |
| Provider 配置 | `providerConfig.test.ts` | 配置构建、验证 |
| Provider 基类 | `providers/__tests__/base.test.ts` | 状态机、事件发射器 |
| 窗口批处理 Provider | `providers/__tests__/windowedBatch.test.ts` | 滚动缓冲区、调度、稳定化 |
| ASR 类型 | `types/asr/common.test.ts` | 类型守卫、能力检查 |
| 字幕导出 | `subtitleExport.test.ts` | SRT/VTT 生成 |
| 字幕换行 | `captionLineWrap.test.ts` | 文本换行逻辑 |
| AI 后处理 | `aiPostProcess.test.ts` | 响应解析 |
| 滚动缓冲区 | `rollingAudioBuffer.test.ts` | 缓冲区管理 |
| API IPC 响应器 | `useApiIpcResponder.test.ts` | 数据转换 |

### 未测试

- **React 组件** — 无 `.test.tsx` 文件（node 环境，无 jsdom）
- **Electron 主进程** — 录音资产和文件任务核心由 Vitest 验证，桌面 IPC/UI 由独立集成脚本验证
- **MCP 服务器** — 独立包，不在 CI 中
- **真实云端集成** — 未执行火山和对象存储真实调用，见 TOO-686

## 编写测试

测试遵循以下模式：

```typescript
import { describe, it, expect } from 'vitest'
import { yourFunction } from '../yourModule'

describe('yourFunction', () => {
  it('should handle normal case', () => {
    expect(yourFunction('input')).toBe('expected')
  })

  it('should handle edge case', () => {
    expect(yourFunction('')).toBeNull()
  })
})
```

## CI 集成

测试作为 `npm run check` 的一部分在 **CI 管线**（push/PR 时）和 **发布管线**（构建前）中运行。

## DeLive 会议开发证据

- [原音存储与恢复](./recording-assets.md) / [TOO-682 证据](./evidence-too-682.md)
- [火山实时 2.0](./volc-realtime.md) / [TOO-683 证据](./evidence-too-683.md)
- [标准文件转写与临时存储](./volc-file.md) / [TOO-684 证据](./evidence-too-684.md)

隔离 Electron 脚本使用合成音频和服务替身，不代表真实计费服务或正式硬件会议通过。

- [回放、版本与校对](./review-playback.md) / [TOO-685 证据](./evidence-too-685.md)
- [TOO-686 正式验收交接](./handoff-too-686.md)（仅交接，未启动）
