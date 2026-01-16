import { create } from "zustand";
import type { StageStatus } from "./client-tool-types";

/**
 * Progress Stage - Represents a single stage in the tool execution
 */
export interface ProgressStage {
  stage: string;
  progress: number;
  status: StageStatus;
  error?: string;
}

/**
 * Tool Progress - Represents the progress state of a single tool execution
 */
export interface ToolProgress {
  toolCallId: string;
  toolName: string;
  stage: string; // Current/last stage
  progress: number; // 0-100
  stages: ProgressStage[]; // History of all stages for this tool call
}

/**
 * Tool Progress Store State
 */
interface ToolProgressState {
  progresses: Map<string, ToolProgress>;
  updateProgress: (
    toolCallId: string,
    update: Partial<ToolProgress> & {
      stage: string;
      stageStatus: StageStatus;
      stageError?: string;
    }
  ) => void;
  clearProgress: (toolCallId: string) => void;
  clearAllProgress: () => void;
  getProgress: (toolCallId: string) => ToolProgress | undefined;
}

/**
 * Zustand store for tracking tool execution progress
 *
 * Design rationale: Selective re-renders using Zustand subscriptions
 * - Only components watching a specific toolCallId re-render when that tool's progress updates
 * - Uses Map for O(1) lookups by toolCallId
 */
export const useToolProgressStore = create<ToolProgressState>((set, get) => ({
  progresses: new Map<string, ToolProgress>(),

  updateProgress: (
    toolCallId: string,
    update: Partial<ToolProgress> & {
      stage: string;
      stageStatus: StageStatus;
      stageError?: string;
    }
  ) => {
    set((state) => {
      const existing = state.progresses.get(toolCallId);
      const newProgress: ToolProgress = {
        toolCallId,
        toolName: update.toolName || existing?.toolName || "unknown",
        stage: update.stage,
        progress: update.progress !== undefined ? update.progress : existing?.progress || 0,
        stages: existing?.stages || [],
      };

      // Add or update the stage in the stages array
      const stageProgress = update.progress !== undefined ? update.progress : newProgress.progress;
      
      // Check if this stage already exists
      const existingStageIndex = newProgress.stages.findIndex((s) => s.stage === update.stage);
      
      if (existingStageIndex >= 0) {
        // Update existing stage
        const existingStage = newProgress.stages[existingStageIndex]!;
        newProgress.stages[existingStageIndex] = {
          ...existingStage,
          progress: stageProgress,
          status: update.stageStatus,
          // Only update error if provided
          ...(update.stageError !== undefined && { error: update.stageError }),
        };
      } else {
        // Add new stage
        newProgress.stages.push({
          stage: update.stage,
          progress: stageProgress,
          status: update.stageStatus,
          error: update.stageError,
        });
      }

      const newProgresses = new Map(state.progresses);
      newProgresses.set(toolCallId, newProgress);
      return { progresses: newProgresses };
    });
  },

  clearProgress: (toolCallId: string) => {
    set((state) => {
      const newProgresses = new Map(state.progresses);
      newProgresses.delete(toolCallId);
      return { progresses: newProgresses };
    });
  },

  clearAllProgress: () => {
    set(() => ({
      progresses: new Map<string, ToolProgress>(),
    }));
  },

  getProgress: (toolCallId: string) => {
    return get().progresses.get(toolCallId);
  },
}));
