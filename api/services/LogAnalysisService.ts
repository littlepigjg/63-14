import { logRepository } from '../repositories/LogRepository.js';
import type {
  LogEntry,
  LogType,
  LogAnalysisResult,
  LogAnalysisSummary,
  LogTrendAnalysis,
  LogTrendPoint,
  OperationRankingItem,
  ResponseTimeDistribution,
  ErrorAnalysis,
  AnalysisCache,
} from '../../shared/types.js';

const CACHE_DURATION = 60 * 60 * 1000;
const SAMPLE_THRESHOLD = 5000;
const MAX_LOGS_FOR_FULL_ANALYSIS = 10000;
const ERROR_LOG_TYPES: LogType[] = [];

export class LogAnalysisService {
  private cache: AnalysisCache = {
    result: null,
    cachedAt: '',
    expiresAt: '',
    isAnalyzing: false,
    lastAnalyzedLogId: null,
  };

  private analysisQueue: Promise<void> | null = null;

  async getAnalysisResult(forceRefresh: boolean = false): Promise<LogAnalysisResult> {
    const now = Date.now();
    const isCacheValid =
      this.cache.result &&
      this.cache.expiresAt &&
      now < new Date(this.cache.expiresAt).getTime();

    if (!forceRefresh && isCacheValid) {
      return {
        ...this.cache.result,
        cacheInfo: {
          cachedAt: this.cache.cachedAt,
          expiresAt: this.cache.expiresAt,
          isStale: false,
        },
      };
    }

    if (this.cache.isAnalyzing) {
      if (this.cache.result) {
        return {
          ...this.cache.result,
          cacheInfo: {
            cachedAt: this.cache.cachedAt,
            expiresAt: this.cache.expiresAt,
            isStale: true,
          },
        };
      }
      await this.analysisQueue;
      return this.getAnalysisResult(false);
    }

    this.analysisQueue = this.performAnalysis(forceRefresh);
    await this.analysisQueue;

    return {
      ...this.cache.result!,
      cacheInfo: {
        cachedAt: this.cache.cachedAt,
        expiresAt: this.cache.expiresAt,
        isStale: false,
      },
    };
  }

  async triggerAnalysis(): Promise<void> {
    if (this.cache.isAnalyzing) return;
    this.analysisQueue = this.performAnalysis(true);
    await this.analysisQueue;
  }

  getAnalysisStatus(): { isAnalyzing: boolean; cachedAt: string; expiresAt: string } {
    return {
      isAnalyzing: this.cache.isAnalyzing,
      cachedAt: this.cache.cachedAt,
      expiresAt: this.cache.expiresAt,
    };
  }

  private async performAnalysis(forceFull: boolean = false): Promise<void> {
    this.cache.isAnalyzing = true;

    try {
      const { logs: allLogs } = await logRepository.getLogs({ limit: 100000, offset: 0 });
      const totalLogs = allLogs.length;

      let logsToAnalyze: LogEntry[];
      let analysisMode: 'full' | 'sampled' | 'incremental';
      let sampleRate = 1;
      let lastLogId = this.cache.lastAnalyzedLogId;

      if (!forceFull && lastLogId && totalLogs > 0) {
        const lastIndex = allLogs.findIndex((l) => l.id === lastLogId);
        if (lastIndex > 0 && lastIndex < totalLogs - 1) {
          logsToAnalyze = allLogs.slice(lastIndex + 1);
          analysisMode = 'incremental';
        } else {
          logsToAnalyze = allLogs;
          analysisMode = totalLogs > MAX_LOGS_FOR_FULL_ANALYSIS ? 'sampled' : 'full';
        }
      } else {
        logsToAnalyze = allLogs;
        analysisMode = totalLogs > MAX_LOGS_FOR_FULL_ANALYSIS ? 'sampled' : 'full';
      }

      if (analysisMode === 'sampled' && logsToAnalyze.length > SAMPLE_THRESHOLD) {
        sampleRate = SAMPLE_THRESHOLD / logsToAnalyze.length;
        logsToAnalyze = this.sampleLogs(logsToAnalyze, sampleRate);
      }

      const sortedLogs = [...logsToAnalyze].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      const summary = this.analyzeSummary(sortedLogs, totalLogs, sampleRate, analysisMode);
      const trend = this.analyzeTrend(sortedLogs);
      const operationRanking = this.analyzeOperationRanking(sortedLogs);
      const responseTimeDistribution = this.analyzeResponseTime(sortedLogs);
      const errorAnalysis = this.analyzeErrors(sortedLogs, totalLogs);

      const now = new Date();
      const expiresAt = new Date(now.getTime() + CACHE_DURATION);

      if (analysisMode === 'incremental' && this.cache.result) {
        this.cache.result = this.mergeIncrementalResults(
          this.cache.result,
          { summary, trend, operationRanking, responseTimeDistribution, errorAnalysis },
          sortedLogs.length
        );
      } else {
        this.cache.result = {
          summary,
          trend,
          operationRanking,
          responseTimeDistribution,
          errorAnalysis,
          cacheInfo: {
            cachedAt: now.toISOString(),
            expiresAt: expiresAt.toISOString(),
            isStale: false,
          },
        };
      }

      this.cache.cachedAt = now.toISOString();
      this.cache.expiresAt = expiresAt.toISOString();
      this.cache.lastAnalyzedLogId = allLogs.length > 0 ? allLogs[allLogs.length - 1].id : null;
    } finally {
      this.cache.isAnalyzing = false;
      this.analysisQueue = null;
    }
  }

  private sampleLogs(logs: LogEntry[], sampleRate: number): LogEntry[] {
    const result: LogEntry[] = [];
    const step = Math.ceil(1 / sampleRate);
    for (let i = 0; i < logs.length; i += step) {
      result.push(logs[i]);
    }
    return result;
  }

  private analyzeSummary(
    logs: LogEntry[],
    totalLogs: number,
    sampleRate: number,
    analysisMode: 'full' | 'sampled' | 'incremental'
  ): LogAnalysisSummary {
    const totalByType: Record<LogType, number> = {
      pull: 0,
      change: 0,
      encrypt: 0,
      decrypt: 0,
      client_register: 0,
      notify: 0,
    };
    const totalByProject: Record<string, number> = {};
    const totalByClient: Record<string, number> = {};
    let errorCount = 0;

    logs.forEach((log) => {
      totalByType[log.type] = (totalByType[log.type] || 0) + 1;

      if (log.project) {
        totalByProject[log.project] = (totalByProject[log.project] || 0) + 1;
      }

      if (log.clientName) {
        totalByClient[log.clientName] = (totalByClient[log.clientName] || 0) + 1;
      }

      if (ERROR_LOG_TYPES.includes(log.type) || this.detectErrorInDetail(log.detail)) {
        errorCount++;
      }
    });

    const estimatedTotal = analysisMode === 'sampled' ? totalLogs : logs.length;
    const errorRate = estimatedTotal > 0 ? errorCount / estimatedTotal : 0;

    const timestamps = logs.map((l) => new Date(l.timestamp).getTime());
    const startTime = timestamps.length > 0 ? new Date(Math.min(...timestamps)).toISOString() : new Date().toISOString();
    const endTime = timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : new Date().toISOString();

    return {
      totalLogs: estimatedTotal,
      totalByType,
      totalByProject,
      totalByClient,
      errorRate,
      timeRange: {
        start: startTime,
        end: endTime,
      },
      analyzedAt: new Date().toISOString(),
      sampleRate,
      analysisMode,
      lastLogId: logs.length > 0 ? logs[logs.length - 1].id : undefined,
    };
  }

  private analyzeTrend(logs: LogEntry[]): LogTrendAnalysis {
    if (logs.length === 0) {
      return {
        points: [],
        timeGranularity: 'hour',
        timeRange: { start: new Date().toISOString(), end: new Date().toISOString() },
      };
    }

    const sortedLogs = [...logs].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const startTime = new Date(sortedLogs[0].timestamp);
    const endTime = new Date(sortedLogs[sortedLogs.length - 1].timestamp);
    const durationMs = endTime.getTime() - startTime.getTime();

    let granularity: 'hour' | 'day' | 'week' = 'hour';
    let intervalMs = 60 * 60 * 1000;

    if (durationMs > 30 * 24 * 60 * 60 * 1000) {
      granularity = 'week';
      intervalMs = 7 * 24 * 60 * 60 * 1000;
    } else if (durationMs > 3 * 24 * 60 * 60 * 1000) {
      granularity = 'day';
      intervalMs = 24 * 60 * 60 * 1000;
    }

    const points: LogTrendPoint[] = [];
    let currentBucketStart = new Date(startTime);
    currentBucketStart = this.floorToGranularity(currentBucketStart, granularity);

    const bucketEnd = this.ceilToGranularity(new Date(endTime), granularity);

    while (currentBucketStart <= bucketEnd) {
      const bucketEndTime = new Date(currentBucketStart.getTime() + intervalMs);
      const bucketLogs = sortedLogs.filter((log) => {
        const logTime = new Date(log.timestamp).getTime();
        return logTime >= currentBucketStart.getTime() && logTime < bucketEndTime.getTime();
      });

      const errorCount = bucketLogs.filter(
        (log) => ERROR_LOG_TYPES.includes(log.type) || this.detectErrorInDetail(log.detail)
      ).length;

      points.push({
        timestamp: currentBucketStart.toISOString(),
        count: bucketLogs.length,
        errorCount,
      });

      currentBucketStart = bucketEndTime;
    }

    return {
      points,
      timeGranularity: granularity,
      timeRange: {
        start: startTime.toISOString(),
        end: endTime.toISOString(),
      },
    };
  }

  private analyzeOperationRanking(logs: LogEntry[]): OperationRankingItem[] {
    const operationCounts: Record<string, number> = {};
    const typeLabels: Record<LogType, string> = {
      pull: '配置拉取',
      change: '配置变更',
      encrypt: '加密操作',
      decrypt: '解密操作',
      client_register: '客户端注册',
      notify: '通知推送',
    };

    logs.forEach((log) => {
      const label = typeLabels[log.type] || log.type;
      operationCounts[label] = (operationCounts[label] || 0) + 1;
    });

    const totalOperations = logs.length;
    const halfPoint = Math.floor(logs.length / 2);
    const firstHalf = logs.slice(0, halfPoint);
    const secondHalf = logs.slice(halfPoint);

    const firstHalfCounts: Record<string, number> = {};
    const secondHalfCounts: Record<string, number> = {};

    firstHalf.forEach((log) => {
      const label = typeLabels[log.type] || log.type;
      firstHalfCounts[label] = (firstHalfCounts[label] || 0) + 1;
    });

    secondHalf.forEach((log) => {
      const label = typeLabels[log.type] || log.type;
      secondHalfCounts[label] = (secondHalfCounts[label] || 0) + 1;
    });

    const ranking: OperationRankingItem[] = Object.entries(operationCounts)
      .map(([operation, count]) => {
        const firstCount = firstHalfCounts[operation] || 0;
        const secondCount = secondHalfCounts[operation] || 0;
        const firstNormalized = firstCount / Math.max(1, firstHalf.length);
        const secondNormalized = secondCount / Math.max(1, secondHalf.length);
        const change = secondNormalized - firstNormalized;

        let trend: 'up' | 'down' | 'stable' = 'stable';
        if (change > 0.05) trend = 'up';
        else if (change < -0.05) trend = 'down';

        return {
          operation,
          count,
          percentage: totalOperations > 0 ? (count / totalOperations) * 100 : 0,
          trend,
        };
      })
      .sort((a, b) => b.count - a.count);

    return ranking;
  }

  private analyzeResponseTime(logs: LogEntry[]): ResponseTimeDistribution[] {
    const responseTimes: number[] = [];

    logs.forEach((log) => {
      const match = log.detail.match(/(?:耗时|花费|response.*time|latency|delay)[:：\s]*(\d+(?:\.\d+)?)\s*(ms|毫秒|s|秒)?/i);
      if (match) {
        let time = parseFloat(match[1]);
        const unit = match[2]?.toLowerCase();
        if (unit === 's' || unit === '秒') {
          time *= 1000;
        }
        responseTimes.push(time);
      }
    });

    if (responseTimes.length === 0) {
      return [];
    }

    const ranges = [
      { min: 0, max: 100, label: '0-100ms' },
      { min: 100, max: 500, label: '100-500ms' },
      { min: 500, max: 1000, label: '500ms-1s' },
      { min: 1000, max: 3000, label: '1s-3s' },
      { min: 3000, max: Infinity, label: '>3s' },
    ];

    return ranges.map((range) => {
      const timesInRange = responseTimes.filter((t) => t >= range.min && t < range.max);
      return {
        range: range.label,
        count: timesInRange.length,
        min: timesInRange.length > 0 ? Math.min(...timesInRange) : 0,
        max: timesInRange.length > 0 ? Math.max(...timesInRange) : 0,
        avg: timesInRange.length > 0 ? timesInRange.reduce((a, b) => a + b, 0) / timesInRange.length : 0,
      };
    });
  }

  private analyzeErrors(logs: LogEntry[], totalLogs: number): ErrorAnalysis {
    const errors = logs.filter(
      (log) => ERROR_LOG_TYPES.includes(log.type) || this.detectErrorInDetail(log.detail)
    );

    const errorsByType: Record<string, number> = {};
    const errorMessageCounts: Record<string, number> = {};
    const errorsByProject: Record<string, number> = {};

    errors.forEach((log) => {
      errorsByType[log.type] = (errorsByType[log.type] || 0) + 1;

      const errorMsg = this.extractErrorMessage(log.detail);
      if (errorMsg) {
        errorMessageCounts[errorMsg] = (errorMessageCounts[errorMsg] || 0) + 1;
      }

      if (log.project) {
        errorsByProject[log.project] = (errorsByProject[log.project] || 0) + 1;
      }
    });

    const topErrorMessages = Object.entries(errorMessageCounts)
      .map(([message, count]) => ({ message, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalErrors: errors.length,
      errorRate: totalLogs > 0 ? errors.length / totalLogs : 0,
      errorsByType,
      topErrorMessages,
      errorsByProject,
    };
  }

  private detectErrorInDetail(detail: string): boolean {
    const errorKeywords = [
      'error', '错误', '失败', 'fail', 'failed', 'exception', '异常',
      'timeout', '超时', '拒绝', 'denied', 'forbidden', '403', '404', '500',
      '无法', 'invalid', '无效', 'missing', '缺失',
    ];
    const lowerDetail = detail.toLowerCase();
    return errorKeywords.some((keyword) => lowerDetail.includes(keyword.toLowerCase()));
  }

  private extractErrorMessage(detail: string): string | null {
    const patterns = [
      /(?:error|错误|exception|异常)[:：\s]*([^\n，。；]+)/i,
      /(?:failed|失败)[:：\s]*([^\n，。；]+)/i,
      /(?:message|msg)[:：\s]*([^\n，。；]+)/i,
    ];

    for (const pattern of patterns) {
      const match = detail.match(pattern);
      if (match && match[1]?.trim()) {
        return match[1].trim().substring(0, 100);
      }
    }

    if (this.detectErrorInDetail(detail)) {
      return detail.substring(0, 100);
    }

    return null;
  }

  private floorToGranularity(date: Date, granularity: 'hour' | 'day' | 'week'): Date {
    const result = new Date(date);
    result.setMinutes(0, 0, 0);

    if (granularity === 'hour') {
      return result;
    }

    result.setHours(0);
    if (granularity === 'day') {
      return result;
    }

    const day = result.getDay();
    const diff = result.getDate() - day + (day === 0 ? -6 : 1);
    result.setDate(diff);
    return result;
  }

  private ceilToGranularity(date: Date, granularity: 'hour' | 'day' | 'week'): Date {
    const result = this.floorToGranularity(date, granularity);
    if (granularity === 'hour') {
      result.setHours(result.getHours() + 1);
    } else if (granularity === 'day') {
      result.setDate(result.getDate() + 1);
    } else {
      result.setDate(result.getDate() + 7);
    }
    return result;
  }

  private mergeIncrementalResults(
    existing: LogAnalysisResult,
    incremental: {
      summary: LogAnalysisSummary;
      trend: LogTrendAnalysis;
      operationRanking: OperationRankingItem[];
      responseTimeDistribution?: ResponseTimeDistribution[];
      errorAnalysis: ErrorAnalysis;
    },
    newLogsCount: number
  ): LogAnalysisResult {
    const mergedSummary: LogAnalysisSummary = {
      ...existing.summary,
      totalLogs: existing.summary.totalLogs + incremental.summary.totalLogs,
      totalByType: { ...existing.summary.totalByType },
      totalByProject: { ...existing.summary.totalByProject },
      totalByClient: { ...existing.summary.totalByClient },
      timeRange: {
        start: existing.summary.timeRange.start,
        end: incremental.summary.timeRange.end,
      },
      analyzedAt: incremental.summary.analyzedAt,
      lastLogId: incremental.summary.lastLogId,
    };

    Object.entries(incremental.summary.totalByType).forEach(([type, count]) => {
      mergedSummary.totalByType[type as LogType] =
        (mergedSummary.totalByType[type as LogType] || 0) + count;
    });

    Object.entries(incremental.summary.totalByProject).forEach(([project, count]) => {
      mergedSummary.totalByProject[project] =
        (mergedSummary.totalByProject[project] || 0) + count;
    });

    Object.entries(incremental.summary.totalByClient).forEach(([client, count]) => {
      mergedSummary.totalByClient[client] =
        (mergedSummary.totalByClient[client] || 0) + count;
    });

    const mergedTrendPoints = [...existing.trend.points];
    incremental.trend.points.forEach((newPoint) => {
      const existingIndex = mergedTrendPoints.findIndex(
        (p) => p.timestamp === newPoint.timestamp
      );
      if (existingIndex >= 0) {
        mergedTrendPoints[existingIndex] = {
          timestamp: newPoint.timestamp,
          count: mergedTrendPoints[existingIndex].count + newPoint.count,
          errorCount: mergedTrendPoints[existingIndex].errorCount + newPoint.errorCount,
        };
      } else {
        mergedTrendPoints.push(newPoint);
      }
    });
    mergedTrendPoints.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const mergedOperationRanking = [...existing.operationRanking];
    incremental.operationRanking.forEach((newItem) => {
      const existingIndex = mergedOperationRanking.findIndex(
        (item) => item.operation === newItem.operation
      );
      if (existingIndex >= 0) {
        mergedOperationRanking[existingIndex].count += newItem.count;
      } else {
        mergedOperationRanking.push(newItem);
      }
    });

    const totalOps = mergedOperationRanking.reduce((sum, item) => sum + item.count, 0);
    mergedOperationRanking.forEach((item) => {
      item.percentage = totalOps > 0 ? (item.count / totalOps) * 100 : 0;
    });
    mergedOperationRanking.sort((a, b) => b.count - a.count);

    const mergedErrorAnalysis: ErrorAnalysis = {
      totalErrors: existing.errorAnalysis.totalErrors + incremental.errorAnalysis.totalErrors,
      errorRate:
        mergedSummary.totalLogs > 0
          ? (existing.errorAnalysis.totalErrors + incremental.errorAnalysis.totalErrors) /
            mergedSummary.totalLogs
          : 0,
      errorsByType: { ...existing.errorAnalysis.errorsByType },
      topErrorMessages: [...existing.errorAnalysis.topErrorMessages],
      errorsByProject: { ...existing.errorAnalysis.errorsByProject },
    };

    Object.entries(incremental.errorAnalysis.errorsByType).forEach(([type, count]) => {
      mergedErrorAnalysis.errorsByType[type] =
        (mergedErrorAnalysis.errorsByType[type] || 0) + count;
    });

    Object.entries(incremental.errorAnalysis.errorsByProject).forEach(([project, count]) => {
      mergedErrorAnalysis.errorsByProject[project] =
        (mergedErrorAnalysis.errorsByProject[project] || 0) + count;
    });

    incremental.errorAnalysis.topErrorMessages.forEach((newMsg) => {
      const existingIndex = mergedErrorAnalysis.topErrorMessages.findIndex(
        (m) => m.message === newMsg.message
      );
      if (existingIndex >= 0) {
        mergedErrorAnalysis.topErrorMessages[existingIndex].count += newMsg.count;
      } else {
        mergedErrorAnalysis.topErrorMessages.push(newMsg);
      }
    });
    mergedErrorAnalysis.topErrorMessages.sort((a, b) => b.count - a.count);
    mergedErrorAnalysis.topErrorMessages = mergedErrorAnalysis.topErrorMessages.slice(0, 10);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + CACHE_DURATION);

    return {
      summary: mergedSummary,
      trend: {
        ...existing.trend,
        points: mergedTrendPoints,
        timeRange: {
          start: existing.trend.timeRange.start,
          end: incremental.trend.timeRange.end,
        },
      },
      operationRanking: mergedOperationRanking,
      responseTimeDistribution: incremental.responseTimeDistribution,
      errorAnalysis: mergedErrorAnalysis,
      cacheInfo: {
        cachedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        isStale: false,
      },
    };
  }
}

export const logAnalysisService = new LogAnalysisService();
