import { Hash } from "./hash";

export interface Color {
  background: string;
  foreground: string;
  hover: string;
  text: string;
}

// Dark-mode friendly palette: softer saturation, good contrast on dark backgrounds.
// Foreground is used for timeline bars and topo strokes; avoids harsh yellow/orange.
const APP_COLORS = [
  { background: "#1e3a5f", foreground: "#60a5fa", hover: "rgb(56, 189, 248)", text: "#93c5fd" },
  { background: "#1e3d2f", foreground: "#4ade80", hover: "rgb(52, 211, 153)", text: "#86efac" },
  { background: "#1e3d38", foreground: "#2dd4bf", hover: "rgb(45, 212, 191)", text: "#5eead4" },
  { background: "#3d2a4a", foreground: "#a78bfa", hover: "rgb(167, 139, 250)", text: "#c4b5fd" },
  { background: "#1e3a4a", foreground: "#38bdf8", hover: "rgb(56, 189, 248)", text: "#7dd3fc" },
  { background: "#3d2a2e", foreground: "#f472b6", hover: "rgb(244, 114, 182)", text: "#f9a8d4" },
  { background: "#2a3d1e", foreground: "#84cc16", hover: "rgb(132, 204, 22)", text: "#a3e635" },
  { background: "#3d351e", foreground: "#ca8a04", hover: "rgb(202, 138, 4)", text: "#eab308" },
  { background: "#2e2a3d", foreground: "#818cf8", hover: "rgb(129, 140, 248)", text: "#a5b4fc" },
  { background: "#1e3d35", foreground: "#34d399", hover: "rgb(52, 211, 153)", text: "#6ee7b7" },
  { background: "#3d2e1e", foreground: "#fb923c", hover: "rgb(251, 146, 60)", text: "#fdba74" },
  { background: "#3d1e2a", foreground: "#f87171", hover: "rgb(248, 113, 113)", text: "#fca5a5" },
] as Color[];

// Export the number of available colors for use in session ID generation
export const NUM_COLORS = APP_COLORS.length;

class ColorGenerator {
  private cache: Map<string, number>;

  constructor() {
    this.cache = new Map();
  }

  getColor(key: string): Color {
    let i = this.cache.get(key);
    if (i == null) {
      i = Hash.hash(key) % APP_COLORS.length;
      this.cache.set(key, i);
    }
    return APP_COLORS[i];
  }

  clear() {
    this.cache.clear();
  }
}

// Export a global colorGenerator instance
export const colorGenerator = new ColorGenerator();
