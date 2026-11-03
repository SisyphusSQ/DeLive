/**
 * useASR — 通用 ASR Hook（编排层）
 *
 * 将 CaptureManager、ProviderSessionManager、CaptionBridge 组合在一起，
 * 对外只暴露 startRecording / stopRecording。
 */

import { useCallback, useRef, useEffect } from 'react'
import { useSettingsStore } from '../stores/settingsStore'
import { useSessionStore } from '../stores/sessionStore'
import { useRecordingStore } from '../stores/recordingStore'
import { sessionRepository } from '../utils/sessionRepository'
import { useTopicStore } from '../stores/topicStore'
import { CaptureManager } from '../services/captureManager'
import { CaptionBridge } from '../services/captionBridge'
import { ProviderSessionManager } from '../services/providerSession'
import type { ASRVendor } from '../types/asr'
import type { ProviderConfigData } from '../types'

interface UseASROptions {
  onError?: (message: string) => void
  onStarted?: () => void
  onFinished?: () => void
}

export function useASR(options: UseASROptions = {}) {
  const captureRef = useRef(new CaptureManager())
  const captionRef = useRef(new CaptionBridge())
  const providerSessionRef = useRef(new ProviderSessionManager())
  const isRestartingRef = useRef(false)
  const lastRestartTimeRef = useRef(0)
  const selectedVendorRef = useRef<ASRVendor | null>(null)
  const stopRecordingRef = useRef<() => Promise<void>>(async () => {})

  const { settings } = useSettingsStore()
  const {
    applyTranscriptEvent,
    setRecordingState,
    startNewSession,
    endCurrentSession,
  } = useSessionStore()

  // ── 停止录制 ──────────────────────────────────────

  const stopRecording = useCallback(async () => {
    if (useSessionStore.getState().recordingState === 'stopping') return
    console.log('[useASR] 停止录制...')
    setRecordingState('stopping')

    let audioSaved = false
    try {
      const audio = await captureRef.current.stop()
      audioSaved = audio?.status === 'completed'
      if (audio) useSessionStore.setState({ sessions: sessionRepository.updateMetadata(audio.sessionId, { audioRecordingId: audio.sessionId, duration: audio.durationMs, wasInterrupted: audio.status === 'interrupted' }) })
    } catch (error) { options.onError?.('原音保存失败：' + (error as Error).message) }
    const provider = providerSessionRef.current.currentProvider
    const finishingVolc = provider?.id === 'volc' && provider.isConnected
    await providerSessionRef.current.disconnect()
    const { realtime, currentTranscript } = useSessionStore.getState()
    if (audioSaved && finishingVolc && realtime?.length && realtime.every(result => result.status === 'complete')) {
      useRecordingStore.getState().update({ asrStatus: currentTranscript.trim() ? '转写完成；原音已保留' : '未识别到语音；原音已保留' })
    }
    captionRef.current.clear()

    selectedVendorRef.current = null
    endCurrentSession()
    setRecordingState('idle')
    console.log('[useASR] 录制已停止')
  }, [setRecordingState, endCurrentSession, options])

  stopRecordingRef.current = stopRecording

  // ── 组件卸载清理 ──────────────────────────────────

  useEffect(() => {
    const capture = captureRef.current
    const providerSession = providerSessionRef.current

    return () => {
      void capture.stop().catch(error => console.error(error))
      void providerSession.disconnect()
    }
  }, [])

  // ── Provider 事件 → Store + 字幕 ──────────────────

  const buildProviderCallbacks = useCallback(() => ({
    onRealtime(snapshot: import('../types/realtime').RealtimeRecognition) {
      applyTranscriptEvent({ type: 'realtime', snapshot })
      const state = useSessionStore.getState()
      captionRef.current.update(state.currentTranscript, '', '', '')
      if (snapshot.status === 'incomplete') useRecordingStore.getState().update({ asrStatus: '转写未完成；原音保留，可重新连接' })
    },
    onTokens(tokens: import('../types/asr').TranscriptToken[]) {
      applyTranscriptEvent({ type: 'tokens', tokens })

      const s = useSessionStore.getState()
      captionRef.current.update(
        s.finalTranscript,
        s.nonFinalTranscript,
        s.finalTranslatedTranscript,
        s.nonFinalTranslatedTranscript,
      )
    },

    onPartial(text: string) {
      applyTranscriptEvent({ type: 'partial-text', text })
      const s = useSessionStore.getState()
      captionRef.current.update(
        s.finalTranscript,
        text,
        s.finalTranslatedTranscript,
        s.nonFinalTranslatedTranscript,
      )
    },

    onFinal(text: string) {
      applyTranscriptEvent({ type: 'final-text', text })
      const s = useSessionStore.getState()
      captionRef.current.update(
        s.finalTranscript,
        '',
        s.finalTranslatedTranscript,
        '',
      )
    },

    onError(error: import('../types/asr').ASRError) {
      const currentState = useSessionStore.getState().recordingState
      if (currentState === 'switching') {
        console.warn('[useASR] 配置切换中收到 Provider 错误（忽略）:', error.code, error.message)
        return
      }
      options.onError?.(`${error.code}: ${error.message}`)
      useRecordingStore.getState().update({ asrStatus: currentState === 'stopping' ? '转写未完成；原音已保留' : '转写失败；本地原音继续保存' })
      void providerSessionRef.current.disconnect()
    },

    onFinished() {
      options.onFinished?.()
    },
  }), [applyTranscriptEvent, options])

  // ── 设备变化后自动重启采集 ─────────────────────────

  const restartCapture = useCallback(async () => {
    if (isRestartingRef.current || useSessionStore.getState().recordingState !== 'recording') return
    const now = Date.now()
    if (now - lastRestartTimeRef.current < 1500) return
    isRestartingRef.current = true
    setRecordingState('switching')
    lastRestartTimeRef.current = now
    try {
      const capture = captureRef.current
      await capture.restartStreamOnly()
      const vendor = selectedVendorRef.current
      if (vendor) {
        try {
          const psm = providerSessionRef.current
          const setup = psm.resolveSetup(vendor, useSettingsStore.getState().settings)
          await psm.reconnect(vendor, { ...setup.connectConfig, timelineOffsetMs: () => captureRef.current.elapsedMs }, buildProviderCallbacks())
          await capture.switchPipeline(setup.providerInfo.capabilities)
        } catch (error) {
          await providerSessionRef.current.disconnect()
          useRecordingStore.getState().update({ asrStatus: '转写重连失败；本地原音继续保存' })
          options.onError?.((error as Error).message)
        }
      }
      setRecordingState('recording')
    } catch (error) {
      options.onError?.('设备重新采集失败：' + (error as Error).message)
      await stopRecordingRef.current()
    } finally { captureRef.current.finishRestart(); isRestartingRef.current = false }
  }, [buildProviderCallbacks, options, setRecordingState])

  // ── 开始录制 ──────────────────────────────────────

  const startRecording = useCallback(async () => {
    if (useSessionStore.getState().recordingState !== 'idle') return
    const vendorId = (settings.currentVendor || 'soniox') as ASRVendor
    const psm = providerSessionRef.current
    const capture = captureRef.current
    const config = useRecordingStore.getState()
    config.update({ error: '', sources: [], asrStatus: config.localOnly ? '仅录音' : '准备连接转写' })
    captionRef.current.clear()
    setRecordingState('starting')
    try {
      await capture.acquireStream({
        system: config.system, microphone: config.microphone, microphoneId: config.microphoneId,
        onSource: source => {
          const current = useRecordingStore.getState()
          current.update({ sources: [...current.sources.filter(s => s.source !== source.source), source] })
        },
        onError: error => {
          useRecordingStore.getState().update({ error: error.message })
          options.onError?.(error.message)
          if (!error.message.startsWith('ASR')) void stopRecordingRef.current()
        },
      })
      const id = startNewSession()
      await capture.startArchive(id)
      useSessionStore.setState({ sessions: sessionRepository.updateMetadata(id, { audioRecordingId: id, sourceMeta: { captureMode: 'mixed', platform: window.electronAPI?.platform ?? 'unknown', providerMode: 'unknown' } }) })
      const topicId = useTopicStore.getState().activeTopicId
      if (topicId) useSessionStore.getState().updateSessionTopic(id, topicId)
      const callbacks = {
        onAudioData: (data: Blob | ArrayBuffer) => psm.sendAudio(data),
        onTrackEnded: () => { void stopRecordingRef.current() },
        onDeviceChange: () => { void restartCapture() },
      }
      // Bind capture lifecycle even when transcription is disabled.
      await capture.startWithStream({ audioInputMode: 'pcm16' }, callbacks)
      setRecordingState('recording')
      options.onStarted?.()
      if (!config.localOnly) {
        try {
          const setup = psm.resolveSetup(vendorId, settings)
          await psm.connect(vendorId, { ...setup.connectConfig, timelineOffsetMs: () => captureRef.current.elapsedMs }, buildProviderCallbacks())
          if (useSessionStore.getState().recordingState !== 'recording') { await psm.disconnect(); return }
          await capture.switchPipeline(setup.providerInfo.capabilities)
          selectedVendorRef.current = vendorId
          config.update({ asrStatus: '转写已连接' })
        } catch (error) {
          await psm.disconnect()
          config.update({ asrStatus: '转写未连接；本地原音继续保存' })
          options.onError?.((error as Error).message)
        }
      }
    } catch (error) {
      options.onError?.((error as Error).message)
      await stopRecordingRef.current()
    }
  }, [settings, setRecordingState, startNewSession, options, buildProviderCallbacks, restartCapture])

  const switchConfig = useCallback(async (configPatch: Partial<ProviderConfigData>, changeDescription: string) => {
    const vendorId = selectedVendorRef.current
    if (!vendorId) return
    const currentState = useSessionStore.getState().recordingState
    if (currentState !== 'recording') return

    const previousConfig = useSettingsStore.getState().settings.providerConfigs?.[vendorId]

    try {
      setRecordingState('switching')

      await useSettingsStore.getState().updateProviderConfig(vendorId, configPatch)

      const newSettings = useSettingsStore.getState().settings
      const psm = providerSessionRef.current
      const setup = psm.resolveSetup(vendorId, newSettings)

      applyTranscriptEvent({ type: 'config-change', description: changeDescription })

      // 关键：先停止 MediaRecorder 的数据产出，防止旧数据（无 WebM 头）被发到新连接
      captureRef.current.pauseRecorder()

      await psm.reconnect(vendorId, { ...setup.connectConfig, timelineOffsetMs: () => captureRef.current.elapsedMs }, buildProviderCallbacks())

      // reconnect 完成后再重启 MediaRecorder，生成新的 WebM 文件头
      captureRef.current.restartRecorder(setup.providerInfo.capabilities)

      setRecordingState('recording')
      console.log('[useASR] 配置热切换成功:', changeDescription)
    } catch (error) {
      console.error('[useASR] 配置热切换失败:', error)

      if (previousConfig) {
        const currentSettings = useSettingsStore.getState().settings
        useSettingsStore.setState({ settings: { ...currentSettings, providerConfigs: { ...currentSettings.providerConfigs, [vendorId]: previousConfig } } })
      }

      try {
        const fallbackSettings = useSettingsStore.getState().settings
        const psm = providerSessionRef.current
        const fallbackSetup = psm.resolveSetup(vendorId, fallbackSettings)

        captureRef.current.pauseRecorder()
        await psm.reconnect(vendorId, { ...fallbackSetup.connectConfig, timelineOffsetMs: () => captureRef.current.elapsedMs }, buildProviderCallbacks())
        captureRef.current.restartRecorder(fallbackSetup.providerInfo.capabilities)

        setRecordingState('recording')
        options.onError?.('配置切换失败，已恢复之前的配置')
      } catch {
        await providerSessionRef.current.disconnect()
        setRecordingState('recording')
        useRecordingStore.getState().update({ asrStatus: '转写失败；本地原音继续保存' })
        options.onError?.('配置切换失败且无法恢复，本地原音继续保存')
      }
    }
  }, [setRecordingState, applyTranscriptEvent, buildProviderCallbacks, options])

  const switchProvider = useCallback(async (newVendorId: ASRVendor) => {
    const oldVendorId = selectedVendorRef.current
    if (!oldVendorId || oldVendorId === newVendorId) return
    const currentState = useSessionStore.getState().recordingState
    if (currentState !== 'recording') return

    const psm = providerSessionRef.current

    let newSetup: ReturnType<typeof psm.resolveSetup>
    try {
      newSetup = psm.resolveSetup(newVendorId, useSettingsStore.getState().settings)
    } catch (e) {
      options.onError?.((e as Error).message)
      return
    }

    try {
      setRecordingState('switching')

      const oldName = oldVendorId
      const newName = newVendorId
      applyTranscriptEvent({
        type: 'config-change',
        description: `Provider: ${oldName} → ${newName}`,
      })

      captureRef.current.pauseRecorder()

      await psm.reconnect(newVendorId, { ...newSetup.connectConfig, timelineOffsetMs: () => captureRef.current.elapsedMs }, buildProviderCallbacks())

      await captureRef.current.switchPipeline(newSetup.providerInfo.capabilities)

      useSettingsStore.getState().setCurrentVendor(newVendorId)
      selectedVendorRef.current = newVendorId

      setRecordingState('recording')
      console.log(`[useASR] Provider 热切换成功: ${oldName} → ${newName}`)
    } catch (error) {
      console.error('[useASR] Provider 热切换失败:', error)

      try {
        const fallbackSettings = useSettingsStore.getState().settings
        const fallbackSetup = psm.resolveSetup(oldVendorId, fallbackSettings)

        captureRef.current.pauseRecorder()
        await psm.reconnect(oldVendorId, { ...fallbackSetup.connectConfig, timelineOffsetMs: () => captureRef.current.elapsedMs }, buildProviderCallbacks())
        await captureRef.current.switchPipeline(fallbackSetup.providerInfo.capabilities)

        selectedVendorRef.current = oldVendorId
        setRecordingState('recording')
        options.onError?.('Provider 切换失败，已恢复之前的配置')
      } catch {
        await providerSessionRef.current.disconnect()
        setRecordingState('recording')
        useRecordingStore.getState().update({ asrStatus: '转写失败；本地原音继续保存' })
        options.onError?.('Provider 切换失败且无法恢复，本地原音继续保存')
      }
    }
  }, [setRecordingState, applyTranscriptEvent, buildProviderCallbacks, options])

  const reconnectTranscription = useCallback(async () => {
    if (useSessionStore.getState().recordingState !== 'recording') return
    setRecordingState('switching')
    const psm = providerSessionRef.current
    try {
      const vendor = useSettingsStore.getState().settings.currentVendor as ASRVendor
      const setup = psm.resolveSetup(vendor, useSettingsStore.getState().settings)
      captureRef.current.pauseRecorder()
      await psm.reconnect(vendor, { ...setup.connectConfig, timelineOffsetMs: () => captureRef.current.elapsedMs }, buildProviderCallbacks())
      await captureRef.current.switchPipeline(setup.providerInfo.capabilities)
      selectedVendorRef.current = vendor
      useRecordingStore.getState().update({ asrStatus: '转写已重新连接；说话人编号独立，断线期间请使用会后稿补全' })
    } catch (error) {
      await psm.disconnect()
      options.onError?.((error as Error).message)
      useRecordingStore.getState().update({ asrStatus: '转写重连失败；本地原音继续保存' })
    } finally { setRecordingState('recording') }
  }, [buildProviderCallbacks, options, setRecordingState])

  const getMediaStream = useCallback(() => captureRef.current.currentStream, [])

  return {
    startRecording,
    stopRecording,
    switchConfig,
    switchProvider,
    getMediaStream,
    reconnectTranscription,
  }
}
