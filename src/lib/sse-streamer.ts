/**
 * Wraps a ReadableStream controller to send SSE-formatted JSON messages.
 * Uses a single TextEncoder and formats each payload as "data: <json>\n\n".
 */
export class SseStreamer {
  private readonly encoder = new TextEncoder();

  constructor(private readonly controller: ReadableStreamDefaultController<Uint8Array>) {}

  /**
   * Serializes the given object as JSON and enqueues it as an SSE data message.
   */
  streamObject(obj: unknown): void {
    this.controller.enqueue(this.encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
  }
}
