import { format as formatSQL } from "sql-formatter";

export class StringUtils {
  public static isAllSpace(text: string): boolean {
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) !== 32) {
        return false;
      }
    }
    return true;
  }

  public static prettyFormatQuery(query: string): string {
    try {
      return formatSQL(query);
    } catch (e) {
      return query;
    }
  }
}