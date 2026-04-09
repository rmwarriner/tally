export type OutputFormat = "table" | "json" | "csv";

export interface GlobalOptions {
  api?: string;
  book?: string;
  color?: boolean;
  format?: OutputFormat;
  noColor?: boolean;
  token?: string;
}

export interface ResolvedConfig {
  apiUrl: string;
  currentBook?: string;
  token: string;
}

export interface DateRangeOptions {
  begin?: string;
  end?: string;
  period?: string;
}

export interface DateRange {
  from: string;
  to: string;
}
