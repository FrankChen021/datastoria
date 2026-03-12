export class BasePath {
  private static normalize(basePath: string | undefined): string {
    if (!basePath || basePath === "/") {
      return "";
    }

    const prefixed = basePath.startsWith("/") ? basePath : `/${basePath}`;
    const trimmed = prefixed.endsWith("/") ? prefixed.slice(0, -1) : prefixed;
    return trimmed === "/" ? "" : trimmed;
  }

  static getBasePath(): string {
    return BasePath.normalize(process.env.NEXT_PUBLIC_BASE_PATH);
  }

  static getURL(pathname: string): string {
    const normalizedPathname = pathname.startsWith("/") ? pathname : `/${pathname}`;
    return `${BasePath.getBasePath()}${normalizedPathname}`;
  }

  static startsWithBasePath(pathname: string): boolean {
    const basePath = BasePath.getBasePath();
    if (!basePath) {
      return true;
    }
    return pathname === basePath || pathname.startsWith(`${basePath}/`);
  }

  static getAuthBasePath(): string {
    return BasePath.getURL("/api/auth");
  }
}
