export interface QueryContext {
  [prop: string]: unknown;

  opentelemetry_start_trace_probability?: boolean;
  isProcessorTracingEnabled?: boolean;
  output_format_pretty_row_numbers?: boolean;
  output_format_pretty_max_rows?: number;
  max_execution_time?: number;
  default_format?: string;
}

