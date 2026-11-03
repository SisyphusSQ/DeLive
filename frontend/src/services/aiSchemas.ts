const string = { type: 'string' }
const strings = { type: 'array', items: string }
function object(properties: Record<string, unknown>) {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false }
}
export const briefingSchema = object({
  summary: string, actionItems: strings, keywords: strings, titleSuggestion: string, tagSuggestions: strings,
  chapters: { type: 'array', items: object({ title: string, summary: string,
    startMs: { type: ['number', 'null'] }, endMs: { type: ['number', 'null'] } }) },
})
export const qaSchema = object({ answer: string, citations: { type: 'array', items: object({
  quote: string, speakerLabel: { type: ['string', 'null'] },
}) } })
export const mindMapSchema = object({ title: string, markdown: string })
