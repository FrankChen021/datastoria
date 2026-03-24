"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { BasePath } from "@/lib/base-path";
import { useEffect, useState } from "react";

type FeedbackReportResponse = {
  filters: {
    source?: string;
    days?: number;
  };
  report: {
    totalFeedback: number;
    solvedCount: number;
    solvedRate: number;
    topErrorCodes: Array<{ label: string; count: number }>;
    negativeReasons: Array<{ label: string; count: number }>;
  };
};

export function AutoExplainFeedbackReport() {
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<FeedbackReportResponse["report"] | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "forbidden" | "error">("idle");

  useEffect(() => {
    let cancelled = false;

    const loadReport = async () => {
      setStatus("loading");
      try {
        const params = new URLSearchParams({
          source: "auto_explain_error",
          days: String(days),
        });
        const response = await fetch(BasePath.getURL(`/api/ai/chat/feedback/report?${params}`), {
          cache: "no-store",
        });

        if (response.status === 403) {
          if (!cancelled) {
            setStatus("forbidden");
          }
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to load report");
        }

        const data = (await response.json()) as FeedbackReportResponse;
        if (!cancelled) {
          setReport(data.report);
          setStatus("idle");
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
        }
      }
    };

    void loadReport();

    return () => {
      cancelled = true;
    };
  }, [days]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Inline Diagnosis Feedback</CardTitle>
        <CardDescription>
          Internal quality view for auto explain outcomes, failure reasons, and top error codes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          {[7, 30, 90].map((option) => (
            <Button
              key={option}
              variant={days === option ? "default" : "outline"}
              size="sm"
              onClick={() => setDays(option)}
            >
              Last {option} days
            </Button>
          ))}
        </div>

        {status === "loading" && (
          <div className="text-sm text-muted-foreground">Loading report...</div>
        )}
        {status === "error" && (
          <div className="text-sm text-destructive">
            Could not load the internal report right now.
          </div>
        )}
        {status === "forbidden" && (
          <div className="text-sm text-muted-foreground">
            This internal report is only available to authorized users.
          </div>
        )}

        {report && (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardDescription>Total feedback</CardDescription>
                  <CardTitle className="text-2xl">{report.totalFeedback}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardDescription>Solved count</CardDescription>
                  <CardTitle className="text-2xl">{report.solvedCount}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardDescription>Solved rate</CardDescription>
                  <CardTitle className="text-2xl">{report.solvedRate}%</CardTitle>
                </CardHeader>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Table>
                <TableBody>
                  <TableRow className="hover:bg-transparent">
                    <TableCell className="px-0 pb-2 text-sm font-medium">Top error codes</TableCell>
                    <TableCell className="px-0 pb-2 text-right text-sm text-muted-foreground">
                      Count
                    </TableCell>
                  </TableRow>
                  {report.topErrorCodes.length === 0 ? (
                    <TableRow>
                      <TableCell className="px-0 text-sm text-muted-foreground" colSpan={2}>
                        No feedback recorded for this window.
                      </TableCell>
                    </TableRow>
                  ) : (
                    report.topErrorCodes.map((item) => (
                      <TableRow key={item.label}>
                        <TableCell className="px-0 font-mono">{item.label}</TableCell>
                        <TableCell className="px-0 text-right">{item.count}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              <Table>
                <TableBody>
                  <TableRow className="hover:bg-transparent">
                    <TableCell className="px-0 pb-2 text-sm font-medium">
                      Negative reason breakdown
                    </TableCell>
                    <TableCell className="px-0 pb-2 text-right text-sm text-muted-foreground">
                      Count
                    </TableCell>
                  </TableRow>
                  {report.negativeReasons.length === 0 ? (
                    <TableRow>
                      <TableCell className="px-0 text-sm text-muted-foreground" colSpan={2}>
                        No negative feedback captured for this window.
                      </TableCell>
                    </TableRow>
                  ) : (
                    report.negativeReasons.map((item) => (
                      <TableRow key={item.label}>
                        <TableCell className="px-0">{item.label}</TableCell>
                        <TableCell className="px-0 text-right">{item.count}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
