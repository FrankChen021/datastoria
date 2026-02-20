"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { PanelDescriptor } from "@/components/shared/dashboard/dashboard-model";
import { BarChart3, LineChart, PieChart, Hash, Table } from "lucide-react";
import { memo, useCallback, useState } from "react";

interface WidgetTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  category: "stat" | "chart" | "table";
  createDescriptor: (title: string, sql: string) => PanelDescriptor;
}

const WIDGET_TEMPLATES: WidgetTemplate[] = [
  {
    id: "stat",
    name: "Stat",
    description: "Display a single numeric value",
    icon: <Hash className="h-8 w-8" />,
    category: "stat",
    createDescriptor: (title, sql) => ({
      type: "stat",
      titleOption: { title, showTitle: true },
      gridPos: { w: 6, h: 4 },
      datasource: { sql },
      minimapOption: { type: "area" },
    }),
  },
  {
    id: "line",
    name: "Line Chart",
    description: "Time-series data as a line chart",
    icon: <LineChart className="h-8 w-8" />,
    category: "chart",
    createDescriptor: (title, sql) => ({
      type: "line",
      titleOption: { title, showTitle: true },
      gridPos: { w: 12, h: 8 },
      datasource: { sql },
      legendOption: { placement: "bottom" },
    }),
  },
  {
    id: "bar",
    name: "Bar Chart",
    description: "Compare values as bars",
    icon: <BarChart3 className="h-8 w-8" />,
    category: "chart",
    createDescriptor: (title, sql) => ({
      type: "bar",
      titleOption: { title, showTitle: true },
      gridPos: { w: 12, h: 8 },
      datasource: { sql },
      legendOption: { placement: "bottom" },
    }),
  },
  {
    id: "pie",
    name: "Pie Chart",
    description: "Show proportions in a pie chart",
    icon: <PieChart className="h-8 w-8" />,
    category: "chart",
    createDescriptor: (title, sql) => ({
      type: "pie",
      titleOption: { title, showTitle: true },
      gridPos: { w: 8, h: 8 },
      datasource: { sql },
      legendOption: { placement: "right" },
      labelOption: { show: true, format: "percent" },
    }),
  },
  {
    id: "table",
    name: "Table",
    description: "Display data in a table format",
    icon: <Table className="h-8 w-8" />,
    category: "table",
    createDescriptor: (title, sql) => ({
      type: "table",
      titleOption: { title, showTitle: true },
      gridPos: { w: 12, h: 10 },
      datasource: { sql },
    }),
  },
];

interface DashboardWidgetPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (panel: PanelDescriptor) => void;
}

const DashboardWidgetPickerComponent = ({
  open,
  onOpenChange,
  onAdd,
}: DashboardWidgetPickerProps) => {
  const [step, setStep] = useState<"select" | "configure">("select");
  const [selectedTemplate, setSelectedTemplate] = useState<WidgetTemplate | null>(null);
  const [title, setTitle] = useState("");
  const [sql, setSql] = useState("");

  const handleSelectTemplate = useCallback((template: WidgetTemplate) => {
    setSelectedTemplate(template);
    setTitle(template.name);
    setSql(getDefaultSql(template.id));
    setStep("configure");
  }, []);

  const handleAdd = useCallback(() => {
    if (selectedTemplate && title.trim() && sql.trim()) {
      const descriptor = selectedTemplate.createDescriptor(title.trim(), sql.trim());
      onAdd(descriptor);
      // Reset state
      setStep("select");
      setSelectedTemplate(null);
      setTitle("");
      setSql("");
    }
  }, [selectedTemplate, title, sql, onAdd]);

  const handleClose = useCallback(() => {
    setStep("select");
    setSelectedTemplate(null);
    setTitle("");
    setSql("");
    onOpenChange(false);
  }, [onOpenChange]);

  const handleBack = useCallback(() => {
    setStep("select");
  }, []);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            {step === "select" ? "Add Widget" : `Configure ${selectedTemplate?.name}`}
          </DialogTitle>
        </DialogHeader>

        {step === "select" ? (
          <Tabs defaultValue="stat" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="stat">Stats</TabsTrigger>
              <TabsTrigger value="chart">Charts</TabsTrigger>
              <TabsTrigger value="table">Tables</TabsTrigger>
            </TabsList>

            {["stat", "chart", "table"].map((category) => (
              <TabsContent key={category} value={category} className="mt-4">
                <div className="grid grid-cols-2 gap-3">
                  {WIDGET_TEMPLATES.filter((t) => t.category === category).map((template) => (
                    <div
                      key={template.id}
                      className="flex flex-col items-center p-4 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => handleSelectTemplate(template)}
                    >
                      <div className="text-muted-foreground mb-2">{template.icon}</div>
                      <div className="font-medium">{template.name}</div>
                      <div className="text-xs text-muted-foreground text-center">
                        {template.description}
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="widget-title">Title</Label>
              <Input
                id="widget-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Widget title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="widget-sql">SQL Query</Label>
              <Textarea
                id="widget-sql"
                value={sql}
                onChange={(e) => setSql(e.target.value)}
                placeholder="SELECT ..."
                className="font-mono text-sm min-h-[150px]"
              />
              <p className="text-xs text-muted-foreground">
                Use {"{from}"}, {"{to}"}, {"{filterExpression}"} for dynamic filtering
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "configure" && (
            <Button variant="outline" onClick={handleBack}>
              Back
            </Button>
          )}
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          {step === "configure" && (
            <Button onClick={handleAdd} disabled={!title.trim() || !sql.trim()}>
              Add Widget
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

function getDefaultSql(templateId: string): string {
  switch (templateId) {
    case "stat":
      return "SELECT count() FROM system.query_log WHERE event_time >= {from:DateTime} AND event_time < {to:DateTime}";
    case "line":
    case "bar":
      return `SELECT
  toStartOfMinute(event_time) AS time,
  count() AS queries
FROM system.query_log
WHERE event_time >= {from:DateTime} AND event_time < {to:DateTime}
GROUP BY time
ORDER BY time`;
    case "pie":
      return `SELECT
  type,
  count() AS count
FROM system.query_log
WHERE event_time >= {from:DateTime} AND event_time < {to:DateTime}
GROUP BY type
ORDER BY count DESC`;
    case "table":
      return `SELECT *
FROM system.query_log
WHERE event_time >= {from:DateTime} AND event_time < {to:DateTime}
ORDER BY event_time DESC
LIMIT 100`;
    default:
      return "SELECT 1";
  }
}

DashboardWidgetPickerComponent.displayName = "DashboardWidgetPicker";

export const DashboardWidgetPicker = memo(DashboardWidgetPickerComponent);
