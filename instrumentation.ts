export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startCodeSearchWarmup } = await import("@/lib/code-search/bootstrap");
    startCodeSearchWarmup();
  }
}
