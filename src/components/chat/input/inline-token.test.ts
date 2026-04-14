import { describe, expect, it } from "vitest";
import { InlineToken, type InlineTokenMatch } from "./inline-token";

interface TestTokenMatch extends InlineTokenMatch {
  value: string;
}

class TestToken extends InlineToken<string, TestTokenMatch> {
  constructor() {
    super("<<test:", ">>", /<<test:([^>]+)>>/g);
  }

  protected decode(encodedPayload: string): string {
    return decodeURIComponent(encodedPayload);
  }

  protected createMatch(text: string, start: number, end: number, payload: string): TestTokenMatch {
    return {
      text,
      start,
      end,
      value: payload,
    };
  }
}

const testToken = new TestToken();

describe("token utils", () => {
  it("creates and parses encoded inline tokens through a shared codec", () => {
    const token = testToken.createToken("hello world");

    expect(testToken.getMatches(`Use ${token} now`)).toEqual([
      {
        text: token,
        start: 4,
        end: 4 + token.length,
        value: "hello world",
      },
    ]);
  });

  it("replaces encoded inline tokens with a codec-specific renderer", () => {
    const token = testToken.createToken("hello world");

    expect(testToken.replace(token, (value) => `[${value}]`)).toBe("[hello world]");
  });

  it("removes inline tokens without leaving double spaces behind", () => {
    const token = testToken.createToken("hello world");

    expect(testToken.removeAt(`Use ${token} now`, 4, 4 + token.length)).toBe("Use now");
  });

  it("removes inline tokens without inserting stray spaces between lines", () => {
    const token = testToken.createToken("hello world");

    expect(testToken.removeAt(`Use\n${token}\nnow`, 4, 4 + token.length)).toBe("Use\nnow");
  });
});
