/**
 * Reads an HTTP response body stream line by line and invokes a callback for each line.
 */
export class HttpResponseLineReader {
  static async read(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    onLine: (line: string) => void
  ): Promise<void> {
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) onLine(trimmed);
      }
    }

    if (buffer.trim()) onLine(buffer.trim());
  }
}
