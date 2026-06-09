/**
 * Convert a stream of arbitrary string chunks into a stream of lines. Each
 * yielded value is a single line (without its trailing newline). Extracted from
 * continue-rac's core/diff/util.ts (streamLines), the only consumer being the
 * autocomplete StreamTransformPipeline.
 */
export async function* streamLines(stream: AsyncGenerator<string>): AsyncGenerator<string> {
  let buffer = ""
  for await (const chunk of stream) {
    buffer += chunk
    let newlineIndex = buffer.indexOf("\n")
    while (newlineIndex !== -1) {
      yield buffer.slice(0, newlineIndex)
      buffer = buffer.slice(newlineIndex + 1)
      newlineIndex = buffer.indexOf("\n")
    }
  }
  if (buffer.length > 0) {
    yield buffer
  }
}
