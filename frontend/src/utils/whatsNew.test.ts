import { describe, expect, it } from 'vitest'
import { getAllWhatsNew, getWhatsNewForVersion, whatsNewLineText } from './whatsNew'

describe('whatsNewLineText', () => {
  it('returns Korean copy when ko is present', () => {
    const entry = getAllWhatsNew().find((e) => e.version === '2.2.4')!
    const line = entry.features[0]
    expect(whatsNewLineText(line, 'ko')).toMatch(/베트남어|Vietnamese/)
    expect(whatsNewLineText(line, 'zh')).toBe(line.zh)
    expect(whatsNewLineText(line, 'en')).toBe(line.en)
  })

  it('falls back to English for Korean UI when ko is omitted', () => {
    const line = { zh: '中文', en: 'English only' }
    expect(whatsNewLineText(line, 'ko')).toBe('English only')
  })
})

it('does not show upstream release notes as a DeLive SQ update', () => {
  expect(getWhatsNewForVersion('2.3.0-sq.2')).toBeUndefined()
  expect(getWhatsNewForVersion('2.3.0-beta.2')?.version).toBe('2.3.0')
})
