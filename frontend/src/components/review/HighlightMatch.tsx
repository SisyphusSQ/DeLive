export function HighlightMatch({ text, query }: { text: string; query: string }) {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return <>{text}</>
  const lower = text.toLocaleLowerCase()
  const parts = []
  let start = 0
  for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, start)) {
    parts.push(text.slice(start, at), <mark key={at}>{text.slice(at, at + needle.length)}</mark>)
    start = at + needle.length
  }
  return <>{parts}{text.slice(start)}</>
}
