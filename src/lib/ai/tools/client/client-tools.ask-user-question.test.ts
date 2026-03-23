import { describe, expect, it } from "vitest";
import { ClientTools } from "./client-tools";

describe("ask_user_question tool schema", () => {
  const inputSchema = (ClientTools.ask_user_question as { inputSchema: { safeParse: Function } })
    .inputSchema;
  const outputSchema = (ClientTools.ask_user_question as { outputSchema: { safeParse: Function } })
    .outputSchema;

  it("accepts a single structured question", () => {
    const result = inputSchema.safeParse({
      questions: [
        {
          header: "Optimize",
          options: [
            { id: "provide_sql", label: "Provide SQL", type: "text" },
            { id: "provide_query_id", label: "Provide query_id", type: "text" },
            {
              id: "find_expensive_query",
              label: "Find expensive query",
              type: "select",
              choices: ["duration", "cpu"],
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects multiple questions in v1", () => {
    const result = inputSchema.safeParse({
      questions: [
        {
          header: "One",
          options: [{ id: "a", label: "A", type: "text" }],
        },
        {
          header: "Two",
          options: [{ id: "b", label: "B", type: "text" }],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("accepts normalized tool output", () => {
    const result = outputSchema.safeParse({
      optionId: "provide_sql",
      label: "Provide SQL",
      type: "text",
      value: "SELECT 1",
    });

    expect(result.success).toBe(true);
  });
});
