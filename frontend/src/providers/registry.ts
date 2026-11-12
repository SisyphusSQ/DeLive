/**
 * ASR Provider 注册表
 * 管理所有可用的 ASR 提供商
 */

import { DEFAULT_ASR_VENDOR } from '../types/asr/common'
import type {
  ASRProvider,
  ASRProviderInfo,
  ProviderRegistryEntry,
  ASRVendor,
} from '../types/asr'
import { VolcProvider } from './implementations/VolcProvider'
import { LocalOpenAIProvider } from './implementations/LocalOpenAIProvider'
import { WhisperCppRuntimeProvider } from './implementations/WhisperCppRuntimeProvider'
import { SenseVoiceProvider } from './implementations/SenseVoiceProvider'

// Provider 注册表
class ProviderRegistry {
  private providers: Map<ASRVendor, ProviderRegistryEntry> = new Map()

  // 注册提供商
  register(entry: ProviderRegistryEntry): void {
    this.providers.set(entry.info.id, entry)
    console.log(`[ProviderRegistry] Registered provider: ${entry.info.name}`)
  }

  // 获取提供商信息
  getInfo(vendorId: ASRVendor): ASRProviderInfo | undefined {
    return this.providers.get(vendorId)?.info
  }

  // 创建提供商实例
  create(vendorId: ASRVendor): ASRProvider | undefined {
    const entry = this.providers.get(vendorId)
    if (!entry) {
      console.error(`[ProviderRegistry] Provider not found: ${vendorId}`)
      return undefined
    }
    return entry.create()
  }

  // 获取所有已注册的提供商信息
  getAllProviders(): ASRProviderInfo[] {
    return Array.from(this.providers.values()).map(entry => entry.info)
  }

  // 获取所有云端提供商
  getCloudProviders(): ASRProviderInfo[] {
    return this.getAllProviders().filter(p => p.type === 'cloud')
  }

  // 获取所有本地提供商
  getLocalProviders(): ASRProviderInfo[] {
    return this.getAllProviders().filter(p => p.type === 'local')
  }

  // 检查提供商是否已注册
  has(vendorId: ASRVendor): boolean {
    return this.providers.has(vendorId)
  }
}

// 创建单例注册表
export const providerRegistry = new ProviderRegistry()

function registerDefaultProviders(): void {
  providerRegistry.register({
    info: new VolcProvider().info,
    create: () => new VolcProvider(),
  })

  providerRegistry.register({
    info: new LocalOpenAIProvider().info,
    create: () => new LocalOpenAIProvider(),
  })

  providerRegistry.register({
    info: new WhisperCppRuntimeProvider().info,
    create: () => new WhisperCppRuntimeProvider(),
  })

  providerRegistry.register({
    info: new SenseVoiceProvider().info,
    create: () => new SenseVoiceProvider(),
  })
}

// 初始化注册
registerDefaultProviders()

// 便捷工厂函数
export function createProvider(vendorId: ASRVendor): ASRProvider | undefined {
  return providerRegistry.create(vendorId)
}

// 获取默认提供商 ID
export function getDefaultVendor(): ASRVendor {
  return DEFAULT_ASR_VENDOR
}
