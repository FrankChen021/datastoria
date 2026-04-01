export class SkillLink {
  readonly skillId: string;
  readonly label: string;
  readonly title?: string;
  readonly href: string;

  constructor({ skillId, label, title }: { skillId: string; label: string; title?: string }) {
    this.skillId = skillId;
    this.label = label;
    this.title = title;
    this.href = this.buildHref();
  }

  static parse(token: string): SkillLink | null {
    const parts = SkillLink.splitEscaped(token, "|");
    if (parts.length < 2 || parts.length > 3) {
      return null;
    }

    const skillId = SkillLink.unescapeTokenValue(parts[0] ?? "").trim();
    const label = SkillLink.unescapeTokenValue(parts[1] ?? "").trim();
    const title = SkillLink.unescapeTokenValue(parts[2] ?? "").trim();
    if (!skillId || !label) {
      return null;
    }

    return new SkillLink({
      skillId,
      label,
      title: title || undefined,
    });
  }

  static buildToken(link: SkillLink): string {
    const skillId = SkillLink.escapeTokenValue(link.skillId);
    const label = SkillLink.escapeTokenValue(link.label);
    const title = link.title ? `|${SkillLink.escapeTokenValue(link.title)}` : "";
    return `[[skill:${skillId}|${label}${title}]]`;
  }

  toLinkNode() {
    return {
      type: "link" as const,
      url: this.href,
      title: this.title ?? null,
      children: [
        {
          type: "text" as const,
          value: this.label,
        },
      ],
    };
  }

  private buildHref(): string {
    return `skill://${this.skillId}`;
  }

  private static escapeTokenValue(value: string): string {
    return value.replaceAll("\\", "\\\\").replaceAll("|", "\\|").replaceAll("]", "\\]");
  }

  private static unescapeTokenValue(value: string): string {
    return value.replace(/\\([\\|\]])/g, "$1");
  }

  private static splitEscaped(value: string, separator: string): string[] {
    const parts: string[] = [];
    let current = "";
    let isEscaped = false;

    for (const char of value) {
      if (isEscaped) {
        current += `\\${char}`;
        isEscaped = false;
        continue;
      }

      if (char === "\\") {
        isEscaped = true;
        continue;
      }

      if (char === separator) {
        parts.push(current);
        current = "";
        continue;
      }

      current += char;
    }

    if (isEscaped) {
      current += "\\";
    }

    parts.push(current);
    return parts;
  }
}
