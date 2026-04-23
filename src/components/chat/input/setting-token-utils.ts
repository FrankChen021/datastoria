import type { ClickHouseSettingInfo } from "@/lib/clickhouse/clickhouse-settings";

export const SETTING_INLINE_CODE_REGEX = /`([A-Za-z_][\w]*)`(?=[\s?!.,;:)\]}]|$)/g;

export interface SettingTokenMatch {
  value: string;
  text: string;
  start: number;
  end: number;
  setting: ClickHouseSettingInfo;
}

export function getSettingTokenMatches(
  text: string,
  settingsByName: Map<string, ClickHouseSettingInfo>
): SettingTokenMatch[] {
  const regex = new RegExp(SETTING_INLINE_CODE_REGEX.source, SETTING_INLINE_CODE_REGEX.flags);
  const matches: SettingTokenMatch[] = [];

  for (const match of text.matchAll(regex)) {
    const value = match[1];
    if (!value) {
      continue;
    }

    const setting = settingsByName.get(value);
    if (!setting) {
      continue;
    }

    const start = match.index ?? 0;
    const tokenText = match[0];
    matches.push({
      value,
      text: tokenText,
      start,
      end: start + tokenText.length,
      setting,
    });
  }

  return matches;
}

export function removeSettingTokenAt(text: string, start: number, end: number): string {
  const before = text.slice(0, start);
  const after = text.slice(end);

  if (before.endsWith(" ") && after.startsWith(" ")) {
    return before + after.slice(1);
  }

  return before + after;
}
