import { describe, expect, it } from 'vitest'
import {
  buildSessionSnapshot,
  buildSourceMeta,
  restoreStoredTokens,
} from './sessionSnapshot'

describe('sessionSnapshot', () => {
  it('builds a persistence snapshot from runtime state', () => {
    const snapshot = buildSessionSnapshot({
      runtimeState: {
        finalTokens: [
          { text: 'Hello ', isFinal: true, speaker: 'speaker_1', startMs: 0, endMs: 400 },
        ],
        transcriptPrefix: '',
        finalTranscript: 'Hello ',
        nonFinalTranscript: 'world',
        currentTranscript: 'Hello world',
        currentSegments: [
          { text: 'Hello ', speakerId: 'speaker_1', isFinal: true },
        ],
        currentSpeakers: [
          { id: 'speaker_1', label: 'speaker_1', displayName: 'Speaker 1' },
        ],
        currentPostProcess: {
          summary: 'Recap',
        },
      },
      providerId: 'volc',
      providerMode: 'realtime',
      platform: 'win32',
      captureMode: 'system-audio',
    })

    expect(snapshot).toEqual({
      transcript: 'Hello world',
      tokens: [
        {
          text: 'Hello ',
          isFinal: true,
          startMs: 0,
          endMs: 400,
          speaker: 'speaker_1',
          language: undefined,
          confidence: undefined,
        },
      ],
      providerId: 'volc',
      speakers: [{ id: 'speaker_1', label: 'speaker_1', displayName: 'Speaker 1' }],
      segments: [{ text: 'Hello ', speakerId: 'speaker_1', isFinal: true }],
      sourceMeta: {
        captureMode: 'system-audio',
        platform: 'win32',
        providerMode: 'realtime',
      },
      postProcess: {
        summary: 'Recap',
      },
    })
  })

  it('restores stored tokens and builds source metadata', () => {
    expect(restoreStoredTokens([
      { text: 'Hello', isFinal: false, speaker: 'speaker_1' },
    ])).toEqual([
      { text: 'Hello', isFinal: false, speaker: 'speaker_1', startMs: undefined, endMs: undefined, language: undefined, confidence: undefined },
    ])

    expect(buildSourceMeta({
      providerId: 'local_openai',
      providerMode: 'full-session-retranscription',
      platform: 'linux',
      captureMode: 'file',
    })).toEqual({
      captureMode: 'file',
      platform: 'linux',
      providerMode: 'full-session-retranscription',
    })

  })
})
