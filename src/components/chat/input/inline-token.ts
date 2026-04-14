export interface InlineTokenMatch {
  text: string;
  start: number;
  end: number;
}

export abstract class InlineToken<TPayload, TMatch extends InlineTokenMatch = InlineTokenMatch> {
  protected constructor(
    readonly prefix: string,
    readonly suffix: string,
    readonly pattern: RegExp
  ) {}

  createToken(payload: string): string {
    return `${this.prefix}${encodeURIComponent(payload)}${this.suffix}`;
  }

  getMatches(input: string): TMatch[] {
    const matches: TMatch[] = [];

    for (const match of input.matchAll(this.pattern)) {
      const tokenText = match[0];
      const encodedPayload = match[1];
      const start = match.index ?? -1;
      if (start < 0 || encodedPayload === undefined) {
        continue;
      }

      const payload = this.decode(encodedPayload);
      matches.push(this.createMatch(tokenText, start, start + tokenText.length, payload));
    }

    return matches;
  }

  replace(input: string, render: (payload: TPayload, match: TMatch) => string): string {
    return input.replaceAll(this.pattern, (tokenText: string, encodedPayload: string) => {
      const payload = this.decode(encodedPayload);
      return render(payload, this.createMatch(tokenText, -1, -1, payload));
    });
  }

  removeAt(input: string, start: number, end: number): string {
    const before = input.slice(0, start).replace(/[ \t]+$/, "");
    const after = input.slice(end).replace(/^[ \t]+/, "");

    if (!before.length) {
      return after;
    }

    if (!after.length) {
      return before;
    }

    return `${before} ${after}`;
  }

  protected abstract decode(encodedPayload: string): TPayload;
  protected abstract createMatch(
    text: string,
    start: number,
    end: number,
    payload: TPayload
  ): TMatch;
}
