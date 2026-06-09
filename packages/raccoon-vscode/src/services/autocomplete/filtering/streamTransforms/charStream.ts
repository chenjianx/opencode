/**
 * Character-level stream transforms, ported from continue-rac
 * (core/autocomplete/filtering/streamTransforms/charStream.ts).
 */

export async function* stopAtStopTokens(
  stream: AsyncGenerator<string>,
  stopTokens: string[],
): AsyncGenerator<string> {
  if (stopTokens.length === 0) {
    for await (const char of stream) {
      yield char
    }
    return
  }

  const maxStopTokenLength = Math.max(...stopTokens.map((token) => token.length))
  let buffer = ""

  for await (const chunk of stream) {
    buffer += chunk

    while (buffer.length >= maxStopTokenLength) {
      let found = false
      for (const stopToken of stopTokens) {
        if (buffer.startsWith(stopToken)) {
          found = true
          return
        }
      }

      if (!found) {
        yield buffer[0]!
        buffer = buffer.slice(1)
      }
    }
  }
  // Filter out the possible stop tokens from remaining buffer
  stopTokens.forEach((token) => {
    buffer = buffer.replace(token, "")
  })

  // Yield any remaining characters in the buffer
  for (const char of buffer) {
    yield char
  }
}

export async function* stopAtStartOf(
  stream: AsyncGenerator<string>,
  suffix: string,
  sequenceLength = 20,
): AsyncGenerator<string> {
  if (suffix.length < sequenceLength) {
    for await (const chunk of stream) {
      yield chunk
    }
    return
  }
  const targetPart = suffix.trimStart().slice(0, Math.floor(sequenceLength * 1.5))

  let buffer = ""

  for await (const chunk of stream) {
    buffer += chunk

    if (buffer.length >= sequenceLength && targetPart.includes(buffer)) {
      return
    }

    while (buffer.length > sequenceLength) {
      yield buffer[0]!
      buffer = buffer.slice(1)
    }
  }

  if (buffer.length > 0) {
    yield buffer
  }
}
