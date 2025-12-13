import { useEffect, useState } from "react";

interface QueryEditorState {
  selectedText: string;
  text: string;
}

let globalState: QueryEditorState = {
  selectedText: "",
  text: "",
};

const globalListeners: Set<() => void> = new Set();

// Function to update editor state (called from query-input-view)
export function updateQueryEditorState(state: Partial<QueryEditorState>) {
  let changed = false;
  
  if (state.selectedText !== undefined && globalState.selectedText !== state.selectedText) {
    globalState.selectedText = state.selectedText;
    changed = true;
  }
  
  if (state.text !== undefined && globalState.text !== state.text) {
    globalState.text = state.text;
    changed = true;
  }
  
  if (changed) {
    globalListeners.forEach((listener) => listener());
  }
}

// Hook to track editor state
export function useQueryEditor() {
  const [state, setState] = useState<QueryEditorState>(globalState);

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

