export interface ConfigItem {
  key: string;
  value: string;
  description: string;
  encrypted: boolean;
  iv?: string;
  tag?: string;
  updatedAt: string;
  updatedBy: string;
}

export interface Environment {
  name: string;
  configs: ConfigItem[];
}

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  environments: Environment[];
}

export interface LogEntry {
  id: string;
  timestamp: string;
  type: 'pull' | 'change' | 'encrypt' | 'decrypt' | 'client_register' | 'notify';
  clientIp: string;
  clientName: string;
  project: string;
  environment: string;
  detail: string;
}

export interface ClientInfo {
  id: string;
  name: string;
  ip: string;
  token: string;
  lastHeartbeat: string;
  online: boolean;
}

export interface ConfigData {
  encryptionKey: string;
  projects: Project[];
}

export interface LogsData {
  logs: LogEntry[];
}

export interface ClientsData {
  clients: ClientInfo[];
}

export interface PullResponse {
  configs: Record<string, string>;
  version: string;
  pulledAt: string;
}

export type LogType = LogEntry['type'];

export interface LogAnalysisSummary {
  totalLogs: number;
  totalByType: Record<LogType, number>;
  totalByProject: Record<string, number>;
  totalByClient: Record<string, number>;
  errorRate: number;
  timeRange: {
    start: string;
    end: string;
  };
  analyzedAt: string;
  sampleRate: number;
  analysisMode: 'full' | 'sampled' | 'incremental';
  lastLogId?: string;
}

export interface LogTrendPoint {
  timestamp: string;
  count: number;
  errorCount: number;
}

export interface LogTrendAnalysis {
  points: LogTrendPoint[];
  timeGranularity: 'hour' | 'day' | 'week';
  timeRange: {
    start: string;
    end: string;
  };
}

export interface OperationRankingItem {
  operation: string;
  count: number;
  percentage: number;
  trend: 'up' | 'down' | 'stable';
}

export interface ResponseTimeDistribution {
  range: string;
  count: number;
  min: number;
  max: number;
  avg: number;
}

export interface ErrorAnalysis {
  totalErrors: number;
  errorRate: number;
  errorsByType: Record<string, number>;
  topErrorMessages: Array<{ message: string; count: number }>;
  errorsByProject: Record<string, number>;
}

export interface LogAnalysisResult {
  summary: LogAnalysisSummary;
  trend: LogTrendAnalysis;
  operationRanking: OperationRankingItem[];
  responseTimeDistribution?: ResponseTimeDistribution[];
  errorAnalysis: ErrorAnalysis;
  cacheInfo: {
    cachedAt: string;
    expiresAt: string;
    isStale: boolean;
  };
}

export interface AlertThreshold {
  id: string;
  name: string;
  metric: 'error_rate' | 'error_count' | 'log_volume' | 'response_time';
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
  threshold: number;
  timeWindow: number;
  unit: 'minutes' | 'hours' | 'days';
  enabled: boolean;
  notifyChannels: ('sse' | 'email' | 'webhook')[];
  project?: string;
  logType?: LogType;
  createdAt: string;
  updatedAt: string;
}

export interface AlertEvent {
  id: string;
  thresholdId: string;
  thresholdName: string;
  metric: string;
  operator: string;
  threshold: number;
  actualValue: number;
  severity: 'info' | 'warning' | 'critical';
  timestamp: string;
  resolved: boolean;
  resolvedAt?: string;
  project?: string;
}

export interface AlertConfig {
  thresholds: AlertThreshold[];
  events: AlertEvent[];
}

export interface AnalysisCache {
  result: LogAnalysisResult | null;
  cachedAt: string;
  expiresAt: string;
  isAnalyzing: boolean;
  lastAnalyzedLogId: string | null;
}
