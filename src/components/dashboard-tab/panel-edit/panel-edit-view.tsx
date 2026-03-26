"use client";

import type { PanelDescriptor } from "@/components/shared/dashboard/dashboard-model";
import { memo, useCallback } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { PanelEditHeader } from "./panel-edit-header";
import { PanelEditPreview } from "./panel-edit-preview";
import { PanelEditSidebar } from "./panel-edit-sidebar";
import { PanelEditSqlEditor } from "./panel-edit-sql-editor";
import { usePanelEditState } from "./use-panel-edit-state";

interface PanelEditViewProps {
  editingPanel?: PanelDescriptor | null;
  onSave: (panel: PanelDescriptor) => void;
  onDiscard: () => void;
}

function PanelEditViewComponent({ editingPanel, onSave, onDiscard }: PanelEditViewProps) {
  const state = usePanelEditState(editingPanel);

  const handleApply = useCallback(() => {
    const descriptor = state.buildDescriptor();
    if (descriptor) {
      onSave(descriptor);
    }
  }, [state, onSave]);

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <PanelEditHeader
        onRunQuery={state.runQuery}
        onApply={handleApply}
        onDiscard={onDiscard}
        isDirty={state.isDirty}
        isValid={state.isValid}
      />

      {/* Body: resizable panels */}
      <div className="flex-1 min-h-0">
        <PanelGroup direction="horizontal">
          {/* Left: Preview + SQL editor (vertical split) */}
          <Panel defaultSize={65} minSize={35}>
            <PanelGroup direction="vertical">
              {/* Top: Preview */}
              <Panel defaultSize={55} minSize={15}>
                <PanelEditPreview
                  descriptor={state.previewDescriptor}
                  previewKey={state.previewKey}
                />
              </Panel>

              <PanelResizeHandle className="h-1 bg-border hover:bg-primary/20 transition-colors data-[resize-handle-active]:bg-primary/30" />

              {/* Bottom: SQL editor */}
              <Panel defaultSize={45} minSize={15}>
                <PanelEditSqlEditor
                  initialSql={state.sql}
                  onSqlChange={state.setSql}
                  onRunQuery={state.runQuery}
                />
              </Panel>
            </PanelGroup>
          </Panel>

          <PanelResizeHandle className="w-1 bg-border hover:bg-primary/20 transition-colors data-[resize-handle-active]:bg-primary/30" />

          {/* Right: Configuration sidebar */}
          <Panel defaultSize={35} minSize={20} maxSize={50}>
            <PanelEditSidebar
              title={state.title}
              onTitleChange={state.setTitle}
              chartType={state.chartType}
              onChartTypeChange={state.setChartType}
              gridW={state.gridW}
              gridH={state.gridH}
              onGridSizeChange={state.setGridSize}
              statOptions={state.statOptions}
              onStatOptionsChange={state.updateStatOptions}
              timeseriesOptions={state.timeseriesOptions}
              onTimeseriesOptionsChange={state.updateTimeseriesOptions}
              pieOptions={state.pieOptions}
              onPieOptionsChange={state.updatePieOptions}
              gaugeOptions={state.gaugeOptions}
              onGaugeOptionsChange={state.updateGaugeOptions}
              tableOptions={state.tableOptions}
              onTableOptionsChange={state.updateTableOptions}
            />
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}

PanelEditViewComponent.displayName = "PanelEditView";

export const PanelEditView = memo(PanelEditViewComponent);
