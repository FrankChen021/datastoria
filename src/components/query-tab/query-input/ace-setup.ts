// Initialize ace globally before ext-language_tools is loaded
// This must be imported before ext-language_tools
import aceModule from 'ace-builds/src-noconflict/ace';

// Make ace available globally for ext-language_tools
// Use both window and globalThis for maximum compatibility
declare global {
  interface Window {
    ace: typeof aceModule;
  }
}

// Set on window and globalThis to ensure it's available
if (typeof window !== 'undefined') {
  window.ace = aceModule;
}
if (typeof globalThis !== 'undefined') {
  (globalThis as { ace?: typeof aceModule }).ace = aceModule;
}

export default aceModule;
