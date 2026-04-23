import type { Mention, MentionMetadata, MessageMetadata } from "@/lib/ai/ai-types";
import type { Connection } from "@/lib/connection/connection";
import type { UIMessage } from "ai";

const INLINE_CODE_TOKEN_REGEX = /`([^`\n]+)`(?=[\s?!.,;:)\]}]|$)/g;
const DATABASE_COMMENT_MAX_LENGTH = 200;

function normalizeComment(comment: string): string {
  const normalized = comment.replace(/\s+/g, " ").trim();
  if (normalized.length <= DATABASE_COMMENT_MAX_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, DATABASE_COMMENT_MAX_LENGTH - 1).trimEnd()}…`;
}

export class MentionContext {
  static toMetadata(
    text: string,
    connection: Pick<Connection, "metadata">
  ): MentionMetadata | undefined {
    const mentions: Mention[] = [];
    const seen = new Set<string>();
    const tableNames = connection.metadata.tableNames;
    const databaseNames = connection.metadata.databaseNames;
    const settingsByName = connection.metadata.clickhouseSettings;

    for (const match of text.matchAll(INLINE_CODE_TOKEN_REGEX)) {
      const token = match[1]?.trim();
      if (!token) {
        continue;
      }

      if (tableNames?.has(token)) {
        const tableInfo = tableNames.get(token);
        const engine = tableInfo?.engine?.trim();
        if (engine) {
          const key = `table:${token}`;
          if (!seen.has(key)) {
            mentions.push({ kind: "table", name: token, engine });
            seen.add(key);
          }
        }
        continue;
      }

      if (settingsByName?.has(token)) {
        const settingInfo = settingsByName.get(token);
        const type = settingInfo?.type?.trim();
        if (type) {
          const key = `setting:${token}`;
          if (!seen.has(key)) {
            mentions.push({ kind: "setting", name: token, type });
            seen.add(key);
          }
        }
        continue;
      }

      if (databaseNames?.has(token)) {
        const databaseInfo = databaseNames.get(token);
        const engine = databaseInfo?.engine?.trim();
        if (engine) {
          const key = `database:${token}`;
          if (!seen.has(key)) {
            const mention: Mention = { kind: "database", name: token, engine };
            const comment =
              token !== "system" && typeof databaseInfo?.comment === "string"
                ? normalizeComment(databaseInfo.comment)
                : undefined;
            if (comment) {
              mention.comment = comment;
            }
            mentions.push(mention);
            seen.add(key);
          }
        }
      }
    }

    return mentions.length > 0 ? { version: 1, mentions } : undefined;
  }

  static toContext(mentions: Mention[]): string {
    const databases = mentions.filter((mention): mention is Extract<Mention, { kind: "database" }> => {
      return mention.kind === "database";
    });
    const tables = mentions.filter((mention): mention is Extract<Mention, { kind: "table" }> => {
      return mention.kind === "table";
    });
    const settings = mentions.filter((mention): mention is Extract<Mention, { kind: "setting" }> => {
      return mention.kind === "setting";
    });

    const sections: string[] = ["[system-added context]"];

    if (databases.length > 0) {
      sections.push("Mentioned databases:");
      for (const mention of databases) {
        sections.push(
          mention.comment
            ? `- ${mention.name} (engine: ${mention.engine}, comment: ${mention.comment})`
            : `- ${mention.name} (engine: ${mention.engine})`
        );
      }
    }

    if (tables.length > 0) {
      sections.push("Mentioned tables:");
      for (const mention of tables) {
        sections.push(`- ${mention.name} (engine: ${mention.engine})`);
      }
    }

    if (settings.length > 0) {
      sections.push("Mentioned settings:");
      for (const mention of settings) {
        sections.push(`- ${mention.name} (type: ${mention.type})`);
      }
    }

    return sections.length > 1 ? sections.join("\n") : "";
  }

  static inject<TMessage extends UIMessage>(messages: TMessage[]): TMessage[] {
    const activeMentionsByKind = new Map<Mention["kind"], Mention[]>();

    return messages.map((message) => {
      if (message.role !== "user") {
        return message;
      }

      const mentionMetadata = (message.metadata as MessageMetadata | undefined)?.mentionMetadata;
      const validMentionMetadata =
        mentionMetadata &&
        mentionMetadata.version === 1 &&
        Array.isArray(mentionMetadata.mentions)
          ? mentionMetadata
          : undefined;
      if (validMentionMetadata) {
        for (const kind of ["database", "table", "setting"] as const) {
          const mentions = validMentionMetadata.mentions.filter((mention) => mention.kind === kind);
          if (mentions.length > 0) {
            activeMentionsByKind.set(kind, mentions);
          }
        }
      }

      if (activeMentionsByKind.size === 0) {
        return message;
      }

      const contextText = MentionContext.toContext([
        ...(activeMentionsByKind.get("database") ?? []),
        ...(activeMentionsByKind.get("table") ?? []),
        ...(activeMentionsByKind.get("setting") ?? []),
      ]);

      if (!contextText) {
        return message;
      }

      const parts = [...(message.parts ?? [])];
      const lastTextPartIndex = [...parts]
        .reverse()
        .findIndex(
          (part): part is Extract<(typeof parts)[number], { type: "text"; text: string }> =>
            part.type === "text" && typeof part.text === "string"
        );

      if (lastTextPartIndex === -1) {
        return {
          ...message,
          parts: [{ type: "text", text: contextText }, ...parts],
        };
      }

      const targetIndex = parts.length - 1 - lastTextPartIndex;
      const targetPart = parts[targetIndex] as Extract<(typeof parts)[number], { type: "text" }>;

      return {
        ...message,
        parts: parts.map((part, index) =>
          index === targetIndex && part.type === "text"
            ? { ...targetPart, text: `${targetPart.text}\n\n${contextText}` }
            : part
        ),
      };
    });
  }
}
