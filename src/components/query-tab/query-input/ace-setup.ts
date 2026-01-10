// Initialize ace globally before ext-language_tools is loaded
// This must be imported before ext-language_tools

// Make ace available globally for ext-language_tools
// Use both window and globalThis for maximum compatibility
declare global {
  interface Window {
    ace: typeof import("ace-builds/src-noconflict/ace");
  }
}

// Lazy load ace only on client-side
let aceModule: typeof import("ace-builds/src-noconflict/ace") | null = null;

async function initAce() {
  if (typeof window === "undefined") {
    throw new Error("Ace can only be initialized in browser environment");
  }

  if (aceModule) {
    return aceModule;
  }

  // Dynamic import only happens on client-side
  aceModule = (await import("ace-builds/src-noconflict/ace")).default;

  // Set on window and globalThis to ensure it's available
  window.ace = aceModule;
  (globalThis as { ace?: typeof aceModule }).ace = aceModule;

  return aceModule;
}

export { initAce };
