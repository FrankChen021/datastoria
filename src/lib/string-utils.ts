const ID_TRUNCATE_MAX = 22;
const ID_TRUNCATE_START = 8;
const ID_TRUNCATE_END = 8;

export class StringUtils {
  public static truncateIdMiddle(
    id: string,
    maxLength = ID_TRUNCATE_MAX
  ): {
    truncated: string;
    wasTruncated: boolean;
  } {
    if (!id || id.length <= maxLength) {
      return { truncated: id, wasTruncated: false };
    }
    const start = id.slice(0, ID_TRUNCATE_START);
    const end = id.slice(-ID_TRUNCATE_END);
    return { truncated: `${start}…${end}`, wasTruncated: true };
  }

  public static isAllSpace(text: string): boolean {
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) !== 32) {
        return false;
      }
    }
    return true;
  }
}
