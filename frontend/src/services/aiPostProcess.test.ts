import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  parseAiBriefingResponse,
  resolveModelForFeature,
  askQuestionForSessionStreaming,
  parseSessionMindMapResponse,
  parseSessionQaResponse,
  isAiPostProcessConfigured,
  resolveTranscriptText,
} from './aiPostProcess'
import type { TranscriptSession } from '../types'

describe('aiPostProcess', () => {
  it('parses plain json responses', () => {
    const result = parseAiBriefingResponse(JSON.stringify({
      titleSuggestion: 'Weekly Sync',
      tagSuggestions: ['planning', 'release'],
      summary: 'A concise summary',
      actionItems: ['Ship the feature'],
      keywords: ['ai', 'summary'],
      chapters: [
        { title: 'Intro', summary: 'Context' },
      ],
    }), 'gpt-test')

    expect(result.titleSuggestion).toBe('Weekly Sync')
    expect(result.tagSuggestions).toEqual(['planning', 'release'])
    expect(result.summary).toBe('A concise summary')
    expect(result.actionItems).toEqual(['Ship the feature'])
    expect(result.keywords).toEqual(['ai', 'summary'])
    expect(result.chapters).toEqual([{ title: 'Intro', summary: 'Context' }])
    expect(result.model).toBe('gpt-test')
    expect(result.status).toBe('success')
  })

  it('parses fenced json responses', () => {
    const result = parseAiBriefingResponse(
      '```json\n{"summary":"Brief","keywords":["demo"]}\n```',
      'demo-model',
    )

    expect(result.summary).toBe('Brief')
    expect(result.keywords).toEqual(['demo'])
  })

  it('detects whether ai post-process is configured', () => {
    expect(isAiPostProcessConfigured({ apiKey: '', languageHints: ['zh'], aiPostProcess: { enabled: true, model: 'legacy-model' } })).toBe(true)
    expect(isAiPostProcessConfigured({
      apiKey: '',
      languageHints: ['zh', 'en'],
      aiPostProcess: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:11434/v1',
        model: 'qwen2.5:7b',
      },
    })).toBe(true)

    expect(isAiPostProcessConfigured({
      apiKey: '',
      languageHints: ['zh', 'en'],
      aiPostProcess: {
        enabled: false,
        provider: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:11434/v1',
        model: 'qwen2.5:7b',
      },
    })).toBe(false)
  })

  it('parses session qa responses with citations', () => {
    const result = parseSessionQaResponse(JSON.stringify({
      answer: 'Alice suggested shipping this week.',
      citations: [
        { quote: 'We should ship it this week.', speakerLabel: 'Alice' },
      ],
    }), 'qwen-test')

    expect(result).toEqual({
      answer: 'Alice suggested shipping this week.',
      citations: [
        { quote: 'We should ship it this week.', speakerLabel: 'Alice' },
      ],
      model: 'qwen-test',
    })
  })

  it('parses session mind map responses', () => {
    const result = parseSessionMindMapResponse(JSON.stringify({
      title: 'Weekly Sync',
      markdown: '# Weekly Sync\n## Decisions\n### Ship this week',
    }), 'mindmap-model')

    expect(result).toEqual({
      title: 'Weekly Sync',
      markdown: '# Weekly Sync\n## Decisions\n### Ship this week',
      model: 'mindmap-model',
      status: 'success',
      error: undefined,
      generatedAt: expect.any(Number),
      updatedAt: expect.any(Number),
    })
  })
})

describe('resolveTranscriptText', () => {
  const baseSession = {
    id: 'test-1',
    title: 'Test',
    transcript: '  original raw transcript  ',
    createdAt: Date.now(),
    segments: [],
    speakers: [],
  } as unknown as TranscriptSession

  const sessionWithCorrection = {
    ...baseSession,
    correction: {
      status: 'done' as const,
      mode: 'quick' as const,
      correctedText: '  corrected clean transcript  ',
    },
  } as unknown as TranscriptSession

  const sessionCorrecting = {
    ...baseSession,
    correction: {
      status: 'correcting' as const,
      mode: 'quick' as const,
      correctedText: 'partial output',
    },
  } as unknown as TranscriptSession

  const sessionReset = {
    ...baseSession,
    correction: {
      status: 'idle' as const,
      mode: 'quick' as const,
      correctedText: undefined,
    },
  } as unknown as TranscriptSession

  const sessionEmptyCorrection = {
    ...baseSession,
    correction: {
      status: 'done' as const,
      mode: 'quick' as const,
      correctedText: '   ',
    },
  } as unknown as TranscriptSession

  it('auto: uses corrected text when available and done', () => {
    expect(resolveTranscriptText(sessionWithCorrection, 'auto'))
      .toBe('corrected clean transcript')
  })

  it('auto: falls back to original when no correction', () => {
    expect(resolveTranscriptText(baseSession, 'auto'))
      .toBe('original raw transcript')
  })

  it('auto: falls back to original when correction is still in progress', () => {
    expect(resolveTranscriptText(sessionCorrecting, 'auto'))
      .toBe('original raw transcript')
  })

  it('auto: falls back to original after reset (status=idle, correctedText=undefined)', () => {
    expect(resolveTranscriptText(sessionReset, 'auto'))
      .toBe('original raw transcript')
  })

  it('auto: falls back to original when correctedText is whitespace-only', () => {
    expect(resolveTranscriptText(sessionEmptyCorrection, 'auto'))
      .toBe('original raw transcript')
  })

  it('original: always uses original transcript even when corrected exists', () => {
    expect(resolveTranscriptText(sessionWithCorrection, 'original'))
      .toBe('original raw transcript')
  })

  it('corrected: uses corrected text when available', () => {
    expect(resolveTranscriptText(sessionWithCorrection, 'corrected'))
      .toBe('corrected clean transcript')
  })

  it('corrected: falls back to original when no correction available', () => {
    expect(resolveTranscriptText(baseSession, 'corrected'))
      .toBe('original raw transcript')
  })

  it('undefined preference defaults to auto behavior', () => {
    expect(resolveTranscriptText(sessionWithCorrection, undefined))
      .toBe('corrected clean transcript')
    expect(resolveTranscriptText(baseSession, undefined))
      .toBe('original raw transcript')
  })

  it('trims whitespace from both original and corrected text', () => {
    expect(resolveTranscriptText(baseSession, 'original'))
      .toBe('original raw transcript')
    expect(resolveTranscriptText(sessionWithCorrection, 'corrected'))
      .toBe('corrected clean transcript')
  })
})


describe('AI model readiness and streaming validation', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses selected models without overriding explicit defaults or feature assignments', () => {
    const config = { enabled: true, selectedModels: [' ', ' chosen '] }
    expect(resolveModelForFeature(config, 'chat')).toBe('chosen')
    expect(resolveModelForFeature({ ...config, model: 'legacy' }, 'chat')).toBe('legacy')
    expect(resolveModelForFeature({ ...config, defaultModel: 'default' }, 'chat')).toBe('default')
    expect(resolveModelForFeature({ ...config, defaultModel: 'default', modelAssignment: { chat: 'chat-only' } }, 'chat')).toBe('chat-only')
    expect(resolveModelForFeature({ enabled: true, availableModels: ['unselected'] }, 'chat')).toBe('')
  })

  it('checks the requested feature instead of always checking briefing', () => {
    const settings = { apiKey: '', languageHints: [], aiPostProcess: { enabled: true, modelAssignment: { chat: 'chat-only' } } }
    expect(isAiPostProcessConfigured(settings, 'chat')).toBe(true)
    expect(isAiPostProcessConfigured(settings, 'briefing')).toBe(false)
    expect(isAiPostProcessConfigured(settings, 'mindmap')).toBe(false)
    expect(isAiPostProcessConfigured({ ...settings, aiPostProcess: { enabled: true, selectedModels: ['chosen'] } }, 'chat')).toBe(true)
    expect(isAiPostProcessConfigured({ ...settings, aiPostProcess: { enabled: false, selectedModels: ['chosen'] } }, 'chat')).toBe(false)
  })

  it.each(['disabled', 'missing-model', 'missing-input', 'empty-question'])('settles streaming validation error: %s', async (reason) => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const callbacks = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() }
    const session: TranscriptSession = { id: 'qa', title: 'test', transcript: reason === 'missing-input' ? '' : 'transcript', segments: [], createdAt: 1, updatedAt: 1, date: '', time: '' }
    await expect(askQuestionForSessionStreaming(session, reason === 'empty-question' ? ' ' : 'question', {
      apiKey: '', languageHints: [], aiPostProcess: { enabled: reason !== 'disabled', model: reason === 'missing-model' ? '' : 'test' },
    }, callbacks)).resolves.toBeUndefined()
    expect(callbacks.onError).toHaveBeenCalledExactlyOnceWith(expect.any(Error))
    expect(callbacks.onDone).not.toHaveBeenCalled()
    expect(callbacks.onChunk).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
})
