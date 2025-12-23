import type { AppUIMessage } from "@/lib/ai/client-tools";
import { tools } from "@/lib/ai/client-tools";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { getLanguageModel } from "@/lib/ai/provider";
import type { ChatContext } from "@/lib/chat/types";
import { convertToModelMessages, smoothStream, streamText } from "ai";
import { v7 as uuidv7 } from "uuid";

// Force dynamic rendering (no static generation)
export const dynamic = "force-dynamic";

/**
 * POST /api/chat
 *
 * Handles AI chat requests for ClickHouse SQL assistance
 * - Accepts full conversation history from client
 * - Returns streaming response using Server-Sent Events
 * - Stateless: does not persist messages (client handles storage)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    let chatId: string;
    let messages: AppUIMessage[];
    let context: ChatContext | undefined;

    if (Array.isArray(body.messages)) {
      messages = body.messages;
      chatId = body.chatId || body.id || "default-chat";
      context = body.context || body.body?.context;
    } else if (body.chatId && body.messages) {
      ({ chatId, messages, context } = body);
    } else {
      console.error("Unrecognized request format:", Object.keys(body));
      return new Response("Invalid request format", { status: 400 });
    }

    if (!chatId) {
      return new Response("Missing chatId", { status: 400 });
    }

    if (!messages || messages.length === 0) {
      return new Response("Missing messages", { status: 400 });
    }

    // Get the appropriate model (mock or real based on USE_MOCK_LLM env var)
    let model;
    try {
      model = getLanguageModel();
    } catch (error) {
      return new Response(
        error instanceof Error
          ? error.message
          : "No AI API key configured. Set OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, or ANTHROPIC_API_KEY",
        { status: 500 }
      );
    }

    const baseSystemPrompt = buildSystemPrompt(context);
    const appMessages: AppUIMessage[] = messages;

    const systemPrompt = [
      baseSystemPrompt,
      "",
      "You can use the following tools to help you generate the SQL code:",
      ...Object.entries(tools).map(([toolName, toolDef]) => {
        const desc =
          typeof toolDef.description === "string"
            ? toolDef.description
            : Array.isArray(toolDef.description)
              ? (toolDef.description as string[]).join("\n")
              : "";
        return `- ${toolName}: ${desc}`;
      }),
    ].join("\n");

    const convertedMessages = convertToModelMessages(appMessages);

    const result = streamText({
      model,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        ...convertedMessages,
      ],
      tools,
      experimental_transform: smoothStream(),

      // DON'T DELETE THIS, it will be used for debugging if LLM providers respond unexpected response
      // includeRawChunks: true,  // <- log raw provider events
      // onChunk: ({ chunk }) => {
      //   if (chunk.type === 'raw') {
      //     console.log('RAW PROVIDER CHUNK:', JSON.stringify(chunk));

      //     // Check for OpenAI error responses in raw chunks
      //     // eslint-disable-next-line @typescript-eslint/no-explicit-any
      //     const rawValue = (chunk as any).rawValue;
      //     if (rawValue?.type === 'response.failed' && rawValue?.response?.error) {
      //       const error = rawValue.response.error;
      //       providerError = {
      //         code: error.code,
      //         message: error.message || 'Unknown error from OpenAI',
      //       };
      //       console.error('❌ OpenAI provider error detected:', providerError);
      //     }
      //   }
      // },
      // onError: ({ error }) => {
      //   console.error('STREAM ERROR:', error);
      //   // If we have a provider error, include it in the error
      //   if (providerError) {
      //     throw new Error(`OpenAI API Error (${providerError.code}): ${providerError.message}`);
      //   }
      // },
    });

    try {
      const stream = result.toUIMessageStream({
        originalMessages: appMessages,
        generateMessageId: () => uuidv7(),
        onFinish: async () => {
          // Stream completed successfully
        },
        onError: (error) => {
          console.error("Stream error:", error);

          if (error instanceof Error) {
            if (error.message.includes("insufficient_quota")) {
              return "OpenAI API quota exceeded. Please check your billing and plan details.";
            }
            if (error.message.includes("invalid_api_key")) {
              return "Invalid OpenAI API key. Please check your API key configuration.";
            }
            if (error.message.includes("rate_limit")) {
              return "OpenAI API rate limit exceeded. Please try again later.";
            }
          }

          return "Sorry, I was unable to generate a response due to an error. Please try again.";
        },
      });

      const sseStream = stream
        .pipeThrough(
          new TransformStream({
            transform(chunk, controller) {
              const data = JSON.stringify(chunk);
              controller.enqueue(`data: ${data}\n\n`);
            },
          })
        )
        .pipeThrough(new TextEncoderStream());

      return new Response(sseStream, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    } catch (streamError) {
      console.error("Error in stream conversion:", streamError);
      throw streamError;
    }
  } catch (error) {
    console.error("Chat API error:", error);
    console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace");

    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
        location: "API route handler",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
