import type { LanguageModel } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const streamTextMock = vi.fn();
const wrapLanguageModelMock = vi.fn(
  ({ model }: { model: unknown }) => ({ wrappedModel: model }) as const
);
const extractJsonMiddlewareMock = vi.fn(() => "extract-json-middleware");

vi.mock("ai", () => ({
  streamText: streamTextMock,
  wrapLanguageModel: wrapLanguageModelMock,
  extractJsonMiddleware: extractJsonMiddlewareMock,
  Output: {
    object: ({ schema }: { schema: unknown }) => ({ schema }),
  },
}));

describe("streamObject", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("wraps v3 models with JSON extraction when enabled", async () => {
    const { streamObject } = await import("./stream-utils");

    const model = { specificationVersion: "v3", modelId: "fake" } as unknown as LanguageModel;
    const schema = z.object({});
    streamTextMock.mockReturnValue({
      output: Promise.resolve({}),
    });

    await streamObject({
      model,
      prompt: "hello",
      schema,
      supportsStructuredOutputs: true,
      temperature: 0.2,
    });

    expect(extractJsonMiddlewareMock).toHaveBeenCalledWith({
      transform: expect.any(Function),
    });
    expect(wrapLanguageModelMock).toHaveBeenCalledWith({
      model,
      middleware: "extract-json-middleware",
    });
    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { wrappedModel: model },
        prompt: "hello",
        temperature: 0.2,
        output: expect.objectContaining({
          schema,
        }),
      })
    );
  });

  it("leaves non-v3 models unchanged", async () => {
    const { streamObject } = await import("./stream-utils");

    const model = { specificationVersion: "v2", modelId: "fake" } as unknown as LanguageModel;
    streamTextMock.mockReturnValue({
      output: Promise.resolve({}),
    });

    await streamObject({
      model,
      prompt: "hello",
      schema: z.object({}),
      supportsStructuredOutputs: true,
    });

    expect(wrapLanguageModelMock).not.toHaveBeenCalled();
    expect(extractJsonMiddlewareMock).not.toHaveBeenCalled();
    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model,
      })
    );
  });

  it("falls back to plain text parsing when structured outputs are disabled", async () => {
    const { streamObject } = await import("./stream-utils");

    const model = { specificationVersion: "v2", modelId: "fake" } as unknown as LanguageModel;
    streamTextMock.mockReturnValue({
      text: Promise.resolve('{"findings":"ok","proposals":[]}'),
    });

    const result = await streamObject({
      model,
      prompt: "hello",
      schema: z.object({
        findings: z.string(),
        proposals: z.array(z.object({})),
      }),
      supportsStructuredOutputs: false,
    });

    expect(result).toEqual({ findings: "ok", proposals: [] });
    expect(wrapLanguageModelMock).not.toHaveBeenCalled();
    expect(extractJsonMiddlewareMock).not.toHaveBeenCalled();
    expect(streamTextMock).toHaveBeenCalledWith(
      expect.not.objectContaining({
        output: expect.anything(),
      })
    );
  });

  it("strips fenced JSON before validating plain text fallback", async () => {
    const { streamObject } = await import("./stream-utils");

    const model = { specificationVersion: "v2", modelId: "fake" } as unknown as LanguageModel;
    streamTextMock.mockReturnValue({
      text: Promise.resolve('```json\n{"findings":"ok","proposals":[]}\n```'),
    });

    const result = await streamObject({
      model,
      prompt: "hello",
      schema: z.object({
        findings: z.string(),
        proposals: z.array(z.object({})),
      }),
      supportsStructuredOutputs: false,
    });

    expect(result).toEqual({ findings: "ok", proposals: [] });
  });
});
