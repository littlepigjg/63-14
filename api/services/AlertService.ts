import { JsonRepository } from '../repositories/JsonRepository.js';
import { logRepository } from '../repositories/LogRepository.js';
import { notifyService } from './NotifyService.js';
import type {
  AlertThreshold,
  AlertEvent,
  AlertConfig,
  LogEntry,
  LogType,
} from '../../shared/types.js';
import crypto from 'crypto';

const CHECK_INTERVAL = 60 * 1000;
const MAX_EVENTS = 500;

interface MetricValue {
  value: number;
  timestamp: string;
}

export class AlertService {
  private repo: JsonRepository<AlertConfig>;
  private checkTimer: NodeJS.Timeout | null = null;
  private activeAlerts: Map<string, AlertEvent> = new Map();

  constructor() {
    this.repo = new JsonRepository<AlertConfig>('alerts.json', {
      thresholds: [],
      events: [],
    });
    this.initDefaultThresholds();
    this.startMonitoring();
  }

  private async initDefaultThresholds(): Promise<void> {
    const config = await this.repo.read();
    if (config.thresholds.length === 0) {
      const defaults: AlertThreshold[] = [
        {
          id: crypto.randomUUID(),
          name: '错误率过高',
          metric: 'error_rate',
          operator: 'gt',
          threshold: 0.05,
          timeWindow: 5,
          unit: 'minutes',
          enabled: true,
          notifyChannels: ['sse'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: crypto.randomUUID(),
          name: '错误数量告警',
          metric: 'error_count',
          operator: 'gt',
          threshold: 10,
          timeWindow: 5,
          unit: 'minutes',
          enabled: true,
          notifyChannels: ['sse'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: crypto.randomUUID(),
          name: '日志量突增',
          metric: 'log_volume',
          operator: 'gt',
          threshold: 100,
          timeWindow: 1,
          unit: 'minutes',
          enabled: false,
          notifyChannels: ['sse'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      config.thresholds = defaults;
      await this.repo.write(config);
    }
  }

  private startMonitoring(): void {
    if (this.checkTimer) return;

    this.checkTimer = setInterval(async () => {
      try {
        await this.checkAllThresholds();
      } catch (error) {
        console.error('Alert check failed:', error);
      }
    }, CHECK_INTERVAL);
  }

  stopMonitoring(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  async checkAllThresholds(): Promise<void> {
    const config = await this.repo.read();
    const enabledThresholds = config.thresholds.filter((t) => t.enabled);

    for (const threshold of enabledThresholds) {
      await this.checkThreshold(threshold);
    }
  }

  private async checkThreshold(threshold: AlertThreshold): Promise<void> {
    const metricValue = await this.calculateMetric(threshold);
    if (metricValue === null) return;

    const isTriggered = this.compareValue(
      metricValue.value,
      threshold.operator,
      threshold.threshold
    );

    const existingAlert = this.activeAlerts.get(threshold.id);

    if (isTriggered && !existingAlert) {
      await this.triggerAlert(threshold, metricValue.value);
    } else if (!isTriggered && existingAlert) {
      await this.resolveAlert(threshold.id);
    } else if (isTriggered && existingAlert) {
      const minInterval = this.getWindowMs(threshold) / 2;
      const lastTriggered = new Date(existingAlert.timestamp).getTime();
      if (Date.now() - lastTriggered > minInterval) {
        await this.triggerAlert(threshold, metricValue.value);
      }
    }
  }

  private async calculateMetric(threshold: AlertThreshold): Promise<MetricValue | null> {
    const windowMs = this.getWindowMs(threshold);
    const now = Date.now();
    const windowStart = new Date(now - windowMs);

    const filter: any = {
      from: windowStart.toISOString(),
      to: new Date(now).toISOString(),
    };

    if (threshold.project) {
      filter.project = threshold.project;
    }
    if (threshold.logType) {
      filter.type = threshold.logType;
    }

    const { logs } = await logRepository.getLogs(filter);

    switch (threshold.metric) {
      case 'error_rate': {
        const errorCount = logs.filter((log) => this.isErrorLog(log)).length;
        const errorRate = logs.length > 0 ? errorCount / logs.length : 0;
        return { value: errorRate, timestamp: new Date().toISOString() };
      }
      case 'error_count': {
        const errorCount = logs.filter((log) => this.isErrorLog(log)).length;
        return { value: errorCount, timestamp: new Date().toISOString() };
      }
      case 'log_volume': {
        return { value: logs.length, timestamp: new Date().toISOString() };
      }
      case 'response_time': {
        const avgResponseTime = this.calculateAvgResponseTime(logs);
        if (avgResponseTime === null) return null;
        return { value: avgResponseTime, timestamp: new Date().toISOString() };
      }
      default:
        return null;
    }
  }

  private getWindowMs(threshold: AlertThreshold): number {
    const multiplier =
      threshold.unit === 'minutes'
        ? 60 * 1000
        : threshold.unit === 'hours'
          ? 60 * 60 * 1000
          : 24 * 60 * 60 * 1000;
    return threshold.timeWindow * multiplier;
  }

  private compareValue(
    actual: number,
    operator: AlertThreshold['operator'],
    threshold: number
  ): boolean {
    switch (operator) {
      case 'gt':
        return actual > threshold;
      case 'lt':
        return actual < threshold;
      case 'gte':
        return actual >= threshold;
      case 'lte':
        return actual <= threshold;
      case 'eq':
        return actual === threshold;
      default:
        return false;
    }
  }

  private isErrorLog(log: LogEntry): boolean {
    const errorKeywords = [
      'error', '错误', '失败', 'fail', 'failed', 'exception', '异常',
      'timeout', '超时', '拒绝', 'denied', 'forbidden', '403', '404', '500',
      '无法', 'invalid', '无效', 'missing', '缺失',
    ];
    const lowerDetail = log.detail.toLowerCase();
    return errorKeywords.some((keyword) => lowerDetail.includes(keyword.toLowerCase()));
  }

  private calculateAvgResponseTime(logs: LogEntry[]): number | null {
    const responseTimes: number[] = [];

    logs.forEach((log) => {
      const match = log.detail.match(
        /(?:耗时|花费|response.*time|latency|delay)[:：\s]*(\d+(?:\.\d+)?)\s*(ms|毫秒|s|秒)?/i
      );
      if (match) {
        let time = parseFloat(match[1]);
        const unit = match[2]?.toLowerCase();
        if (unit === 's' || unit === '秒') {
          time *= 1000;
        }
        responseTimes.push(time);
      }
    });

    if (responseTimes.length === 0) return null;
    return responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
  }

  private async triggerAlert(threshold: AlertThreshold, actualValue: number): Promise<void> {
    const config = await this.repo.read();

    const severity = this.getSeverity(threshold, actualValue);

    const event: AlertEvent = {
      id: crypto.randomUUID(),
      thresholdId: threshold.id,
      thresholdName: threshold.name,
      metric: threshold.metric,
      operator: threshold.operator,
      threshold: threshold.threshold,
      actualValue,
      severity,
      timestamp: new Date().toISOString(),
      resolved: false,
      project: threshold.project,
    };

    this.activeAlerts.set(threshold.id, event);

    config.events.unshift(event);
    if (config.events.length > MAX_EVENTS) {
      config.events = config.events.slice(0, MAX_EVENTS);
    }

    await this.repo.write(config);

    if (threshold.notifyChannels.includes('sse')) {
      this.sendSSEAlert(event);
    }
  }

  private getSeverity(threshold: AlertThreshold, actualValue: number): 'info' | 'warning' | 'critical' {
    const ratio = actualValue / threshold.threshold;

    if (ratio >= 3) return 'critical';
    if (ratio >= 1.5) return 'warning';
    return 'info';
  }

  private sendSSEAlert(event: AlertEvent): void {
    const sseEvent = {
      type: 'alert',
      event,
      timestamp: new Date().toISOString(),
    };
    const message = `data: ${JSON.stringify(sseEvent)}\n\n`;

    (notifyService as any).clients.forEach((client: any) => {
      try {
        client.res.write(message);
      } catch {
        (notifyService as any).clients.delete(client.id);
      }
    });
  }

  private async resolveAlert(thresholdId: string): Promise<void> {
    const existingAlert = this.activeAlerts.get(thresholdId);
    if (!existingAlert) return;

    this.activeAlerts.delete(thresholdId);

    const config = await this.repo.read();
    const eventIndex = config.events.findIndex((e) => e.id === existingAlert.id);
    if (eventIndex >= 0) {
      config.events[eventIndex] = {
        ...config.events[eventIndex],
        resolved: true,
        resolvedAt: new Date().toISOString(),
      };
      await this.repo.write(config);
    }
  }

  async getThresholds(): Promise<AlertThreshold[]> {
    const config = await this.repo.read();
    return config.thresholds;
  }

  async getThreshold(id: string): Promise<AlertThreshold | null> {
    const config = await this.repo.read();
    return config.thresholds.find((t) => t.id === id) || null;
  }

  async addThreshold(
    data: Omit<AlertThreshold, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<AlertThreshold> {
    const config = await this.repo.read();
    const now = new Date().toISOString();
    const threshold: AlertThreshold = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    config.thresholds.push(threshold);
    await this.repo.write(config);
    return threshold;
  }

  async updateThreshold(
    id: string,
    data: Partial<Omit<AlertThreshold, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<AlertThreshold | null> {
    const config = await this.repo.read();
    const index = config.thresholds.findIndex((t) => t.id === id);
    if (index === -1) return null;

    config.thresholds[index] = {
      ...config.thresholds[index],
      ...data,
      updatedAt: new Date().toISOString(),
    };

    await this.repo.write(config);
    return config.thresholds[index];
  }

  async deleteThreshold(id: string): Promise<boolean> {
    const config = await this.repo.read();
    const index = config.thresholds.findIndex((t) => t.id === id);
    if (index === -1) return false;

    config.thresholds.splice(index, 1);
    this.activeAlerts.delete(id);

    await this.repo.write(config);
    return true;
  }

  async toggleThreshold(id: string, enabled: boolean): Promise<AlertThreshold | null> {
    return this.updateThreshold(id, { enabled });
  }

  async getEvents(
    filters?: {
      resolved?: boolean;
      severity?: 'info' | 'warning' | 'critical';
      thresholdId?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ events: AlertEvent[]; total: number }> {
    const config = await this.repo.read();
    let events = config.events;

    if (filters?.resolved !== undefined) {
      events = events.filter((e) => e.resolved === filters.resolved);
    }
    if (filters?.severity) {
      events = events.filter((e) => e.severity === filters.severity);
    }
    if (filters?.thresholdId) {
      events = events.filter((e) => e.thresholdId === filters.thresholdId);
    }

    const total = events.length;
    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;
    events = events.slice(offset, offset + limit);

    return { events, total };
  }

  async getActiveAlerts(): Promise<AlertEvent[]> {
    return Array.from(this.activeAlerts.values());
  }

  async resolveEvent(id: string): Promise<AlertEvent | null> {
    const config = await this.repo.read();
    const index = config.events.findIndex((e) => e.id === id);
    if (index === -1) return null;

    config.events[index] = {
      ...config.events[index],
      resolved: true,
      resolvedAt: new Date().toISOString(),
    };

    const thresholdId = config.events[index].thresholdId;
    this.activeAlerts.delete(thresholdId);

    await this.repo.write(config);
    return config.events[index];
  }

  async triggerManualCheck(): Promise<AlertEvent[]> {
    await this.checkAllThresholds();
    return this.getActiveAlerts();
  }

  getMetricLabel(metric: string): string {
    const labels: Record<string, string> = {
      error_rate: '错误率',
      error_count: '错误数量',
      log_volume: '日志量',
      response_time: '响应时间',
    };
    return labels[metric] || metric;
  }

  getOperatorLabel(operator: string): string {
    const labels: Record<string, string> = {
      gt: '大于',
      lt: '小于',
      gte: '大于等于',
      lte: '小于等于',
      eq: '等于',
    };
    return labels[operator] || operator;
  }

  formatThresholdValue(metric: string, value: number): string {
    switch (metric) {
      case 'error_rate':
        return `${(value * 100).toFixed(1)}%`;
      case 'response_time':
        return `${value}ms`;
      case 'log_volume':
      case 'error_count':
        return value.toString();
      default:
        return value.toString();
    }
  }
}

export const alertService = new AlertService();
