/** Tolerant JSON extraction from model output (strips code fences / surrounding prose). */
export function parseJsonLoose<T = unknown>(text: string): T {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    /* fall through */
  }
  const match = cleaned.match(/[[{][\s\S]*[\]}]/);
  if (match) {
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      /* fall through */
    }
  }
  throw new Error(`[runtime] could not parse JSON from model output: ${text.slice(0, 200)}`);
}
