const string = { type: 'string' }
const strings = { type: 'array', items: string }
function object(properties: Record<string, unknown>) {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false }
}
export const briefingSchema = object({
  imageIds: strings, summary: string, actionItems: strings, keywords: strings, titleSuggestion: string, tagSuggestions: strings,
  chapters: { type: 'array', items: object({ title: string, summary: string,
    startMs: { type: ['number', 'null'] }, endMs: { type: ['number', 'null'] } }) },
})
export const qaSchema = object({ imageIds: strings, answer: string, citations: { type: 'array', items: object({
  source: { type: 'string', enum: ['text', 'image'] }, imageId: { type: ['string', 'null'] },
  quote: string, speakerLabel: { type: ['string', 'null'] },
}) } })
export const mindMapSchema = object({ title: string, markdown: string, imageIds: strings })
