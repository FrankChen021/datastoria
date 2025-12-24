import { Hash } from "./hash";

export interface Color {
  background: string;
  foreground: string;
  hover: string;
  text: string;
}

// Professional color palette
const APP_COLORS = [
  { background: "#EDF5FD", foreground: "#4285F4", hover: "rgb(230, 247, 249)", text: "#1976D2" },
  { background: "#F0F7F0", foreground: "#EA4335", hover: "rgb(230, 247, 249)", text: "#388E3C" },
  { background: "#FFF5E6", foreground: "#FBBC05", hover: "rgb(230, 247, 249)", text: "#F57C00" },
  { background: "#F7EEFA", foreground: "#34A853", hover: "rgb(230, 247, 249)", text: "#7B1FA2" },
  { background: "#E6F7F9", foreground: "#3498db", hover: "rgb(230, 247, 249)", text: "#0097A7" },
  { background: "#FEE9F1", foreground: "#e74c3c", hover: "rgb(230, 247, 249)", text: "#C2185B" },
  { background: "#F5F2F0", foreground: "#2ecc71", hover: "rgb(230, 247, 249)", text: "#3E2723" },
  { background: "#EEF0F9", foreground: "#f39c12", hover: "rgb(230, 247, 249)", text: "#303F9F" },
  { background: "#F4F9F0", foreground: "#9b59b6", hover: "rgb(230, 247, 249)", text: "#689F38" },
  { background: "#FFF9E6", foreground: "#1abc9c", hover: "rgb(230, 247, 249)", text: "#FFA000" },
  { background: "#E6F5F3", foreground: "#d35400", hover: "rgb(230, 247, 249)", text: "#00796B" },
  { background: "#FEF0ED", foreground: "#c0392b", hover: "rgb(230, 247, 249)", text: "#E64A19" },
] as Color[];

// Export the number of available colors for use in session ID generation
export const NUM_COLORS = APP_COLORS.length;

export class ColorGenerator {
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
