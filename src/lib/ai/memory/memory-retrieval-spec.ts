export const MEMORY_TOTAL_TOKEN_BUDGET = 500;
export const MEMORY_PINNED_TOKEN_BUDGET = 300;
export const MEMORY_DYNAMIC_TOKEN_BUDGET = 200;
export const MEMORY_PIN_SOFT_CAP = 10;
export const DEFAULT_PIN_PRIORITY = 2;
export const DEFAULT_MEMORY_PAGE_SIZE = 20;

export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
