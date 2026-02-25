import { useEffect, useState } from "react";

interface QueryInputState {
  selectedText: string;
  text: string;
  cursorRow: number;
  cursorColumn: number;
}

const globalState: QueryInputState = {
  selectedText: "",
  text: "",
  cursorRow: 0,
  cursorColumn: 0,
};

const globalListeners: Set<() => void> = new Set();

// Function to update editor state (called from query-input-view)
export function updateQueryInputState(state: Partial<QueryInputState>) {
  let changed = false;

  if (state.selectedText !== undefined && globalState.selectedText !== state.selectedText) {
    globalState.selectedText = state.selectedText;
    changed = true;
  }

  if (state.text !== undefined && globalState.text !== state.text) {
    globalState.text = state.text;
    changed = true;
  }

  if (state.cursorRow !== undefined && globalState.cursorRow !== state.cursorRow) {
    globalState.cursorRow = state.cursorRow;
    changed = true;
  }

  if (state.cursorColumn !== undefined && globalState.cursorColumn !== state.cursorColumn) {
    globalState.cursorColumn = state.cursorColumn;
    changed = true;
  }

  if (changed) {
    globalListeners.forEach((listener) => listener());
  }
}

// Hook to track editor state
export function useQueryInput() {
  const [state, setState] = useState<QueryInputState>(globalState);

  useEffect(() => {
    const listener = () => {
      setState({ ...globalState });
    };
    globalListeners.add(listener);
    return () => {
      globalListeners.delete(listener);
    };
  }, []);

  return state;
}
