import type { PersistedFeedbackEvent } from "./server-session-repository";

type ReportPoint = {
  label: string;
  count: number;
};

export type FeedbackReport = {
  totalFeedback: number;
  solvedCount: number;
  solvedRate: number;
  topErrorCodes: ReportPoint[];
  negativeReasons: ReportPoint[];
};

function parsePayload(event: PersistedFeedbackEvent): { errorCode?: string | null } {
  try {
    return JSON.parse(event.payload_text) as { errorCode?: string | null };
  } catch {
    return {};
  }
}

export function buildFeedbackReport(events: PersistedFeedbackEvent[]): FeedbackReport {
  const totalFeedback = events.length;
  const solvedCount = events.filter((event) => event.solved).length;
  const negativeReasons = new Map<string, number>();
  const errorCodes = new Map<string, number>();

  for (const event of events) {
    if (!event.solved && event.reason_code) {
      negativeReasons.set(event.reason_code, (negativeReasons.get(event.reason_code) ?? 0) + 1);
    }

    const errorCode = parsePayload(event).errorCode;
    if (errorCode) {
      errorCodes.set(errorCode, (errorCodes.get(errorCode) ?? 0) + 1);
    }
  }

  const toSortedPoints = (values: Map<string, number>) =>
    [...values.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([label, count]) => ({ label, count }));

  return {
    totalFeedback,
    solvedCount,
    solvedRate: totalFeedback === 0 ? 0 : Math.round((solvedCount / totalFeedback) * 100),
    topErrorCodes: toSortedPoints(errorCodes).slice(0, 5),
    negativeReasons: toSortedPoints(negativeReasons),
  };
}
