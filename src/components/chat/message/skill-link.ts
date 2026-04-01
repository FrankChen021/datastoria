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
    const parts = token.split("|");
    if (parts.length < 2 || parts.length > 3) {
      return null;
    }

    const skillId = parts[0]?.trim();
    const label = parts[1]?.trim();
    const title = parts[2]?.trim();
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
    return value.replaceAll("|", "\\|").replaceAll("]", "\\]");
  }
}
