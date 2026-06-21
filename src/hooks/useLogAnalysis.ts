import { useState, useCallback, useEffect, useRef } from 'react';
import { api } from '@/utils/api';
import { useSSE } from './useSSE';
import { useDocumentVisibility } from './useDocumentVisibility';
import type {
  LogAnalysisResult,
  AlertThreshold,
  AlertEvent,
} from '../../shared/types';

interface UseLogAnalysisOptions {
  autoRefresh?: boolean;
  refreshOnVisible?: boolean;
  refreshInterval?: number;
}

export function useLogAnalysis(options: UseLogAnalysisOptions = {}) {
  const {
    autoRefresh = true,
    refreshOnVisible = true,
    refreshInterval = 60000,
  } = options;

  const [analysisResult, setAnalysisResult] = useState<LogAnalysisResult | null>(null);
  const [thresholds, setThresholds] = useState<AlertThreshold[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<AlertEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isVisible } = useDocumentVisibility();
  const lastFetchRef = useRef<number>(0);
  const MIN_REFRESH_INTERVAL = 2000;

  const fetchAnalysis = useCallback(
    async (forceRefresh: boolean = false) => {
      const now = Date.now();
      if (!forceRefresh && now - lastFetchRef.current < MIN_REFRESH_INTERVAL) {
        return;
      }
      lastFetchRef.current = now;

      setLoading(true);
      setError(null);
      try {
        const res = await api.get<LogAnalysisResult>(
          `/analysis${forceRefresh ? '?forceRefresh=true' : ''}`
        );
        if (res.success && res.data) {
          setAnalysisResult(res.data);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch analysis');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const fetchAnalysisStatus = useCallback(async () => {
    try {
      const res = await api.get<{ isAnalyzing: boolean; cachedAt: string; expiresAt: string }>(
        '/analysis/status'
      );
      if (res.success && res.data) {
        setIsAnalyzing(res.data.isAnalyzing);
      }
    } catch {
      // ignore
    }
  }, []);

  const refreshAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<LogAnalysisResult>('/analysis/refresh');
      if (res.success && res.data) {
        setAnalysisResult(res.data);
        setIsAnalyzing(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh analysis');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchThresholds = useCallback(async () => {
    try {
      const res = await api.get<AlertThreshold[]>('/analysis/alerts/thresholds');
      if (res.success && res.data) {
        setThresholds(res.data);
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchEvents = useCallback(async (filters?: {
    resolved?: boolean;
    severity?: 'info' | 'warning' | 'critical';
    limit?: number;
  }) => {
    try {
      const params = new URLSearchParams();
      if (filters?.resolved !== undefined) params.set('resolved', filters.resolved.toString());
      if (filters?.severity) params.set('severity', filters.severity);
      if (filters?.limit) params.set('limit', filters.limit.toString());

      const res = await api.get<{ events: AlertEvent[]; total: number }>(
        `/analysis/alerts/events?${params.toString()}`
      );
      if (res.success && res.data) {
        setEvents(res.data.events);
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchActiveAlerts = useCallback(async () => {
    try {
      const res = await api.get<AlertEvent[]>('/analysis/alerts/active');
      if (res.success && res.data) {
        setActiveAlerts(res.data);
      }
    } catch {
      // ignore
    }
  }, []);

  const addThreshold = useCallback(
    async (
      data: Omit<AlertThreshold, 'id' | 'createdAt' | 'updatedAt'>
    ): Promise<AlertThreshold | null> => {
      try {
        const res = await api.post<AlertThreshold>('/analysis/alerts/thresholds', data);
        if (res.success && res.data) {
          await fetchThresholds();
          return res.data;
        }
        return null;
      } catch {
        return null;
      }
    },
    [fetchThresholds]
  );

  const updateThreshold = useCallback(
    async (
      id: string,
      data: Partial<Omit<AlertThreshold, 'id' | 'createdAt' | 'updatedAt'>>
    ): Promise<AlertThreshold | null> => {
      try {
        const res = await api.put<AlertThreshold>(`/analysis/alerts/thresholds/${id}`, data);
        if (res.success && res.data) {
          await fetchThresholds();
          return res.data;
        }
        return null;
      } catch {
        return null;
      }
    },
    [fetchThresholds]
  );

  const deleteThreshold = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const res = await api.delete<{ message: string }>(
          `/analysis/alerts/thresholds/${id}`
        );
        if (res.success) {
          await fetchThresholds();
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    [fetchThresholds]
  );

  const toggleThreshold = useCallback(
    async (id: string, enabled: boolean): Promise<AlertThreshold | null> => {
      try {
        const res = await api.post<AlertThreshold>(
          `/analysis/alerts/thresholds/${id}/toggle`,
          { enabled }
        );
        if (res.success && res.data) {
          await fetchThresholds();
          return res.data;
        }
        return null;
      } catch {
        return null;
      }
    },
    [fetchThresholds]
  );

  const resolveEvent = useCallback(
    async (id: string): Promise<AlertEvent | null> => {
      try {
        const res = await api.post<AlertEvent>(`/analysis/alerts/events/${id}/resolve`);
        if (res.success && res.data) {
          await Promise.all([fetchEvents(), fetchActiveAlerts()]);
          return res.data;
        }
        return null;
      } catch {
        return null;
      }
    },
    [fetchEvents, fetchActiveAlerts]
  );

  const checkAlerts = useCallback(async () => {
    try {
      await api.post<AlertEvent[]>('/analysis/alerts/check');
      await Promise.all([fetchEvents(), fetchActiveAlerts()]);
    } catch {
      // ignore
    }
  }, [fetchEvents, fetchActiveAlerts]);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      fetchAnalysis(true),
      fetchThresholds(),
      fetchEvents({ limit: 50 }),
      fetchActiveAlerts(),
      fetchAnalysisStatus(),
    ]);
  }, [fetchAnalysis, fetchThresholds, fetchEvents, fetchActiveAlerts, fetchAnalysisStatus]);

  useEffect(() => {
    fetchAnalysis();
    fetchThresholds();
    fetchEvents({ limit: 50 });
    fetchActiveAlerts();
    fetchAnalysisStatus();
  }, [fetchAnalysis, fetchThresholds, fetchEvents, fetchActiveAlerts, fetchAnalysisStatus]);

  useEffect(() => {
    if (!refreshOnVisible || !isVisible) return;

    const timer = setTimeout(() => {
      lastFetchRef.current = 0;
      refreshAll();
    }, 100);

    return () => clearTimeout(timer);
  }, [isVisible, refreshOnVisible, refreshAll]);

  useEffect(() => {
    if (!autoRefresh) return;

    const timer = setInterval(() => {
      refreshAll();
    }, refreshInterval);

    return () => clearInterval(timer);
  }, [autoRefresh, refreshInterval, refreshAll]);

  useSSE({
    enabled: autoRefresh,
    filter: { eventTypes: ['alert'] },
    onAlert: () => {
      fetchEvents({ limit: 50 });
      fetchActiveAlerts();
    },
  });

  const getMetricLabel = (metric: string): string => {
    const labels: Record<string, string> = {
      error_rate: '错误率',
      error_count: '错误数量',
      log_volume: '日志量',
      response_time: '响应时间',
    };
    return labels[metric] || metric;
  };

  const getOperatorLabel = (operator: string): string => {
    const labels: Record<string, string> = {
      gt: '大于',
      lt: '小于',
      gte: '大于等于',
      lte: '小于等于',
      eq: '等于',
    };
    return labels[operator] || operator;
  };

  const formatThresholdValue = (metric: string, value: number): string => {
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
  };

  return {
    analysisResult,
    thresholds,
    events,
    activeAlerts,
    loading,
    isAnalyzing,
    error,
    fetchAnalysis,
    refreshAnalysis,
    fetchThresholds,
    fetchEvents,
    fetchActiveAlerts,
    addThreshold,
    updateThreshold,
    deleteThreshold,
    toggleThreshold,
    resolveEvent,
    checkAlerts,
    refreshAll,
    getMetricLabel,
    getOperatorLabel,
    formatThresholdValue,
  };
}
