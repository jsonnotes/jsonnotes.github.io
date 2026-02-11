export type RefToken = { type: "text", value: string } | { type: "ref", value: string }

export const splitRefs = (text: string): RefToken[] => {
  const out: RefToken[] = []
  const re = /#([a-f0-9]{32})/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text))) {
    const start = match.index
    if (start > last) out.push({ type: "text", value: text.slice(last, start) })
    out.push({ type: "ref", value: match[1] })
    last = start + match[0].length
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) })
  return out
}
