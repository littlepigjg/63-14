import { useState, useMemo } from 'react';
import {
  BarChart3,
  TrendingUp,
  AlertTriangle,
  Clock,
  RefreshCw,
  Database,
  Activity,
  Zap,
  ArrowUp,
  ArrowDown,
  Minus,
  AlertCircle,
  CheckCircle,
  XCircle,
  Info,
  AlertOctagon,
} from 'lucide-react';
import { useLogAnalysis } from '@/hooks';
import PageHeader from '@/components/PageHeader';
import { formatTime } from '@/utils/format';

export default function LogAnalysis() {
  const {
    analysisResult,
    loading,
    isAnalyzing,
    refreshAnalysis,
    getMetricLabel,
    getOperatorLabel,
    formatThresholdValue,
  } = useLogAnalysis({ autoRefresh: true, refreshInterval: 60000 });
  const [activeTab, setActiveTab] = useState<'overview' | 'trend' | 'operations' | 'errors'>('overview');

  const analysisModeLabel = useMemo(() => {
    if (!analysisResult) return '';
    const mode = analysisResult.summary.analysisMode;
    const labels: Record<string, string> = {
      full: '全量分析',
      sampled: '采样分析',
      incremental: '增量分析',
    };
    return labels[mode] || mode;
  }, [analysisResult]);

  const sampleRatePercent = useMemo(() => {
    if (!analysisResult) return 100;
    return Math.round(analysisResult.summary.sampleRate * 100);
  }, [analysisResult]);

  const maxTrendCount = useMemo(() => {
    if (!analysisResult) return 1;
    return Math.max(...analysisResult.trend.points.map((p) => p.count), 1);
  }, [analysisResult]);

  const logTypeColors: Record<string, string> = {
    pull: 'bg-blue-500',
    change: 'bg-emerald-500',
    encrypt: 'bg-amber-500',
    decrypt: 'bg-purple-500',
    client_register: 'bg-rose-500',
    notify: 'bg-cyan-500',
  };

  const logTypeLabels: Record<string, string> = {
    pull: '配置拉取',
    change: '配置变更',
    encrypt: '加密操作',
    decrypt: '解密操作',
    client_register: '客户端注册',
    notify: '通知推送',
  };

  const severityColors: Record<string, string> = {
    info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    warning: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    critical: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  };

  const severityIcons: Record<string, React.ElementType> = {
    info: Info,
    warning: AlertTriangle,
    critical: AlertOctagon,
  };

  const TABS = [
    { id: 'overview', label: '概览', icon: Activity },
    { id: 'trend', label: '趋势分析', icon: TrendingUp },
    { id: 'operations', label: '操作排行', icon: BarChart3 },
    { id: 'errors', label: '错误分析', icon: AlertTriangle },
  ] as const;

  if (loading && !analysisResult) {
    return (
      <div className="animate-slide-in">
        <PageHeader title="日志分析" subtitle="系统自动分析日志内容，提取关键指标" />
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3 text-[#64748B]">
            <RefreshCw className="w-6 h-6 animate-spin" />
            <span>正在分析日志数据...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!analysisResult) {
    return (
      <div className="animate-slide-in">
        <PageHeader title="日志分析" subtitle="系统自动分析日志内容，提取关键指标" />
        <div className="text-center py-20 text-[#64748B]">
          <BarChart3 className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p className="mb-4">暂无分析数据</p>
          <button
            onClick={() => refreshAnalysis()}
            className="px-4 py-2 bg-emerald-500/15 text-emerald-400 rounded-lg hover:bg-emerald-500/25 transition-colors"
          >
            开始分析
          </button>
        </div>
      </div>
    );
  }

  const { summary, trend, operationRanking, responseTimeDistribution, errorAnalysis, cacheInfo } =
    analysisResult;

  return (
    <div className="animate-slide-in">
      <PageHeader
        title="日志分析"
        subtitle="系统自动分析日志内容，提取关键指标"
        actions={
          <div className="flex items-center gap-2">
            {isAnalyzing && (
              <span className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded-md border border-amber-500/20">
                <RefreshCw className="w-3 h-3 animate-spin" />
                分析中...
              </span>
            )}
            {cacheInfo.isStale && !isAnalyzing && (
              <span className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded-md border border-amber-500/20">
                <AlertCircle className="w-3 h-3" />
                数据已过期
              </span>
            )}
            <span className="flex items-center gap-1.5 text-xs text-[#64748B] bg-[#1E293B] px-2 py-1 rounded-md border border-[#334155]">
              <Database className="w-3 h-3" />
              {analysisModeLabel}
              {summary.sampleRate < 1 && ` (${sampleRatePercent}%)`}
            </span>
            <span className="text-xs text-[#64748B]">
              缓存于 {formatTime(cacheInfo.cachedAt)}
            </span>
            <button
              onClick={() => refreshAnalysis()}
              disabled={isAnalyzing}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500/15 text-emerald-400 rounded-lg hover:bg-emerald-500/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              <RefreshCw className={`w-4 h-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
              刷新分析
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={Database}
          label="日志总数"
          value={summary.totalLogs.toLocaleString()}
          color="emerald"
        />
        <StatCard
          icon={AlertTriangle}
          label="错误总数"
          value={errorAnalysis.totalErrors.toLocaleString()}
          color="rose"
        />
        <StatCard
          icon={AlertCircle}
          label="错误率"
          value={`${(summary.errorRate * 100).toFixed(2)}%`}
          color={summary.errorRate > 0.05 ? 'rose' : 'amber'}
        />
        <StatCard
          icon={Zap}
          label="操作类型"
          value={Object.values(summary.totalByType).filter((v) => v > 0).length.toString()}
          color="blue"
        />
      </div>

      <div className="flex items-center gap-1 bg-[#1E293B] border border-[#334155] rounded-lg p-1 mb-6">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'text-[#64748B] hover:text-[#94A3B8]'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-5">
            <h3 className="text-sm font-semibold text-[#F1F5F9] mb-4">日志类型分布</h3>
            <div className="space-y-3">
              {Object.entries(summary.totalByType)
                .filter(([, count]) => count > 0)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => {
                  const percentage = summary.totalLogs > 0 ? (count / summary.totalLogs) * 100 : 0;
                  return (
                    <div key={type}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${logTypeColors[type] || 'bg-gray-500'}`} />
                          <span className="text-xs text-[#94A3B8]">{logTypeLabels[type] || type}</span>
                        </div>
                        <span className="text-xs text-[#64748B]">
                          {count.toLocaleString()} ({percentage.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="h-2 bg-[#0F172A] rounded-full overflow-hidden">
                        <div
                          className={`h-full ${logTypeColors[type] || 'bg-gray-500'} rounded-full transition-all duration-500`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-5">
            <h3 className="text-sm font-semibold text-[#F1F5F9] mb-4">项目分布 Top 5</h3>
            <div className="space-y-3">
              {Object.entries(summary.totalByProject)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([project, count], idx) => {
                  const percentage = summary.totalLogs > 0 ? (count / summary.totalLogs) * 100 : 0;
                  const colors = [
                    'bg-emerald-500',
                    'bg-blue-500',
                    'bg-amber-500',
                    'bg-rose-500',
                    'bg-purple-500',
                  ];
                  return (
                    <div key={project}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${colors[idx % colors.length]}`} />
                          <span className="text-xs text-[#94A3B8]">{project}</span>
                        </div>
                        <span className="text-xs text-[#64748B]">
                          {count.toLocaleString()} ({percentage.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="h-2 bg-[#0F172A] rounded-full overflow-hidden">
                        <div
                          className={`h-full ${colors[idx % colors.length]} rounded-full transition-all duration-500`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              {Object.keys(summary.totalByProject).length === 0 && (
                <div className="text-center py-8 text-[#64748B] text-sm">暂无项目数据</div>
              )}
            </div>
          </div>

          {responseTimeDistribution && responseTimeDistribution.length > 0 && (
            <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-5">
              <h3 className="text-sm font-semibold text-[#F1F5F9] mb-4">响应时间分布</h3>
              <div className="space-y-3">
                {responseTimeDistribution.map((item, idx) => {
                  const total = responseTimeDistribution.reduce((sum, r) => sum + r.count, 0);
                  const percentage = total > 0 ? (item.count / total) * 100 : 0;
                  const colors = [
                    'bg-emerald-500',
                    'bg-blue-500',
                    'bg-amber-500',
                    'bg-rose-500',
                    'bg-purple-500',
                  ];
                  return (
                    <div key={item.range}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${colors[idx % colors.length]}`} />
                          <span className="text-xs text-[#94A3B8]">{item.range}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-[#64748B]">
                            平均: {item.avg.toFixed(0)}ms
                          </span>
                          <span className="text-xs text-[#64748B]">
                            {item.count.toLocaleString()} ({percentage.toFixed(1)}%)
                          </span>
                        </div>
                      </div>
                      <div className="h-2 bg-[#0F172A] rounded-full overflow-hidden">
                        <div
                          className={`h-full ${colors[idx % colors.length]} rounded-full transition-all duration-500`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-5">
            <h3 className="text-sm font-semibold text-[#F1F5F9] mb-4">热门客户端 Top 5</h3>
            <div className="space-y-3">
              {Object.entries(summary.totalByClient)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([client, count], idx) => {
                  const percentage = summary.totalLogs > 0 ? (count / summary.totalLogs) * 100 : 0;
                  const colors = [
                    'bg-cyan-500',
                    'bg-teal-500',
                    'bg-indigo-500',
                    'bg-pink-500',
                    'bg-orange-500',
                  ];
                  return (
                    <div key={client}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${colors[idx % colors.length]}`} />
                          <span className="text-xs text-[#94A3B8]">{client}</span>
                        </div>
                        <span className="text-xs text-[#64748B]">
                          {count.toLocaleString()} ({percentage.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="h-2 bg-[#0F172A] rounded-full overflow-hidden">
                        <div
                          className={`h-full ${colors[idx % colors.length]} rounded-full transition-all duration-500`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              {Object.keys(summary.totalByClient).length === 0 && (
                <div className="text-center py-8 text-[#64748B] text-sm">暂无客户端数据</div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'trend' && (
        <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-5">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-sm font-semibold text-[#F1F5F9]">日志量趋势</h3>
              <p className="text-xs text-[#64748B] mt-1">
                时间范围: {formatTime(trend.timeRange.start)} - {formatTime(trend.timeRange.end)}
                {' · '}
                时间粒度: {trend.timeGranularity === 'hour' ? '小时' : trend.timeGranularity === 'day' ? '天' : '周'}
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-emerald-500" />
                <span className="text-[#94A3B8]">总日志</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-rose-500" />
                <span className="text-[#94A3B8]">错误日志</span>
              </div>
            </div>
          </div>

          {trend.points.length > 0 ? (
            <div className="relative h-80">
              <svg className="w-full h-full" viewBox={`0 0 ${trend.points.length * 60} 320`} preserveAspectRatio="none">
                <line x1="0" y1="40" x2="100%" y2="40" stroke="#334155" strokeWidth="1" strokeDasharray="4" />
                <line x1="0" y1="110" x2="100%" y2="110" stroke="#334155" strokeWidth="1" strokeDasharray="4" />
                <line x1="0" y1="180" x2="100%" y2="180" stroke="#334155" strokeWidth="1" strokeDasharray="4" />
                <line x1="0" y1="250" x2="100%" y2="250" stroke="#334155" strokeWidth="1" strokeDasharray="4" />

                {trend.points.map((point, idx) => {
                  const x = idx * 60 + 30;
                  const height = (point.count / maxTrendCount) * 210;
                  const errorHeight = (point.errorCount / Math.max(maxTrendCount, 1)) * 210;
                  const y = 260 - height;
                  const errorY = 260 - errorHeight;

                  return (
                    <g key={point.timestamp}>
                      <rect
                        x={x - 20}
                        y={y}
                        width="35"
                        height={height}
                        fill="#10B981"
                        fillOpacity="0.6"
                        rx="2"
                        className="transition-all duration-300 hover:fill-opacity-80"
                      />
                      {point.errorCount > 0 && (
                        <rect
                          x={x - 20}
                          y={errorY}
                          width="35"
                          height={errorHeight}
                          fill="#F43F5E"
                          fillOpacity="0.8"
                          rx="2"
                          className="transition-all duration-300 hover:fill-opacity-100"
                        />
                      )}
                      <text
                        x={x}
                        y="295"
                        textAnchor="middle"
                        fill="#64748B"
                        fontSize="10"
                      >
                        {formatTime(point.timestamp).split(' ')[1]?.split(':').slice(0, 2).join(':') || formatTime(point.timestamp).split(' ')[0]}
                      </text>
                      <title>
                        {`时间: ${formatTime(point.timestamp)}\n日志量: ${point.count}\n错误量: ${point.errorCount}`}
                      </title>
                    </g>
                  );
                })}

                <text x="10" y="45" fill="#64748B" fontSize="10">{maxTrendCount}</text>
                <text x="10" y="115" fill="#64748B" fontSize="10">{Math.round(maxTrendCount * 0.75)}</text>
                <text x="10" y="185" fill="#64748B" fontSize="10">{Math.round(maxTrendCount * 0.5)}</text>
                <text x="10" y="255" fill="#64748B" fontSize="10">{Math.round(maxTrendCount * 0.25)}</text>
                <text x="10" y="275" fill="#64748B" fontSize="10">0</text>
              </svg>
            </div>
          ) : (
            <div className="text-center py-16 text-[#64748B] text-sm">暂无趋势数据</div>
          )}

          {trend.points.length > 0 && (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#334155]">
                    <th className="text-left py-2 px-3 text-[#64748B] font-medium">时间</th>
                    <th className="text-right py-2 px-3 text-[#64748B] font-medium">日志量</th>
                    <th className="text-right py-2 px-3 text-[#64748B] font-medium">错误量</th>
                    <th className="text-right py-2 px-3 text-[#64748B] font-medium">错误率</th>
                  </tr>
                </thead>
                <tbody>
                  {trend.points.slice(-10).reverse().map((point) => (
                    <tr key={point.timestamp} className="border-b border-[#334155]/50 hover:bg-[#0F172A]/30">
                      <td className="py-2 px-3 text-[#94A3B8]">{formatTime(point.timestamp)}</td>
                      <td className="py-2 px-3 text-right text-[#94A3B8]">{point.count.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right text-rose-400">{point.errorCount.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right">
                        <span className={point.count > 0 && point.errorCount / point.count > 0.05 ? 'text-rose-400' : 'text-[#94A3B8]'}>
                          {point.count > 0 ? `${((point.errorCount / point.count) * 100).toFixed(2)}%` : '0%'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'operations' && (
        <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[#F1F5F9] mb-4">热门操作排行</h3>
          {operationRanking.length > 0 ? (
            <div className="space-y-3">
              {operationRanking.map((item, idx) => {
                const trendIcons: Record<string, React.ElementType> = {
                  up: ArrowUp,
                  down: ArrowDown,
                  stable: Minus,
                };
                const trendColors: Record<string, string> = {
                  up: 'text-emerald-400',
                  down: 'text-rose-400',
                  stable: 'text-[#64748B]',
                };
                const TrendIcon = trendIcons[item.trend];
                const rankColors = ['text-amber-400', 'text-[#94A3B8]', 'text-amber-600', 'text-[#64748B]'];

                return (
                  <div
                    key={item.operation}
                    className="flex items-center gap-4 p-3 bg-[#0F172A] rounded-lg hover:bg-[#0F172A]/80 transition-colors"
                  >
                    <div className={`w-8 h-8 flex items-center justify-center font-bold text-sm ${rankColors[idx] || 'text-[#64748B]'}`}>
                      #{idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm text-[#F1F5F9] font-medium">{item.operation}</span>
                        <TrendIcon className={`w-3 h-3 ${trendColors[item.trend]}`} />
                      </div>
                      <div className="h-1.5 bg-[#1E293B] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                          style={{ width: `${item.percentage}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm text-[#F1F5F9] font-medium">
                        {item.count.toLocaleString()}
                      </div>
                      <div className="text-xs text-[#64748B]">{item.percentage.toFixed(1)}%</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16 text-[#64748B] text-sm">暂无操作数据</div>
          )}
        </div>
      )}

      {activeTab === 'errors' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-rose-500/15 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-[#F1F5F9]">
                    {errorAnalysis.totalErrors.toLocaleString()}
                  </div>
                  <div className="text-xs text-[#64748B]">错误总数</div>
                </div>
              </div>
            </div>
            <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-amber-500/15 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-[#F1F5F9]">
                    {(errorAnalysis.errorRate * 100).toFixed(2)}%
                  </div>
                  <div className="text-xs text-[#64748B]">总体错误率</div>
                </div>
              </div>
            </div>
            <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-blue-500/15 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-[#F1F5F9]">
                    {Object.keys(errorAnalysis.errorsByType).length}
                  </div>
                  <div className="text-xs text-[#64748B]">错误类型</div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-5">
              <h3 className="text-sm font-semibold text-[#F1F5F9] mb-4">错误类型分布</h3>
              <div className="space-y-3">
                {Object.entries(errorAnalysis.errorsByType)
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count], idx) => {
                    const total = errorAnalysis.totalErrors || 1;
                    const percentage = (count / total) * 100;
                    const colors = ['bg-rose-500', 'bg-amber-500', 'bg-orange-500', 'bg-red-500'];
                    return (
                      <div key={type}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${colors[idx % colors.length]}`} />
                            <span className="text-xs text-[#94A3B8]">{logTypeLabels[type] || type}</span>
                          </div>
                          <span className="text-xs text-[#64748B]">
                            {count.toLocaleString()} ({percentage.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="h-2 bg-[#0F172A] rounded-full overflow-hidden">
                          <div
                            className={`h-full ${colors[idx % colors.length]} rounded-full transition-all duration-500`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                {Object.keys(errorAnalysis.errorsByType).length === 0 && (
                  <div className="text-center py-8 text-[#64748B] text-sm flex items-center justify-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    暂无错误数据
                  </div>
                )}
              </div>
            </div>

            <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-5">
              <h3 className="text-sm font-semibold text-[#F1F5F9] mb-4">按项目错误分布</h3>
              <div className="space-y-3">
                {Object.entries(errorAnalysis.errorsByProject)
                  .sort((a, b) => b[1] - a[1])
                  .map(([project, count], idx) => {
                    const total = errorAnalysis.totalErrors || 1;
                    const percentage = (count / total) * 100;
                    const colors = ['bg-rose-500', 'bg-amber-500', 'bg-orange-500', 'bg-red-500', 'bg-pink-500'];
                    return (
                      <div key={project}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${colors[idx % colors.length]}`} />
                            <span className="text-xs text-[#94A3B8]">{project}</span>
                          </div>
                          <span className="text-xs text-[#64748B]">
                            {count.toLocaleString()} ({percentage.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="h-2 bg-[#0F172A] rounded-full overflow-hidden">
                          <div
                            className={`h-full ${colors[idx % colors.length]} rounded-full transition-all duration-500`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                {Object.keys(errorAnalysis.errorsByProject).length === 0 && (
                  <div className="text-center py-8 text-[#64748B] text-sm flex items-center justify-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    暂无项目错误数据
                  </div>
                )}
              </div>
            </div>
          </div>

          {errorAnalysis.topErrorMessages.length > 0 && (
            <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-5">
              <h3 className="text-sm font-semibold text-[#F1F5F9] mb-4">Top 10 错误信息</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#334155]">
                      <th className="text-left py-2 px-3 text-[#64748B] font-medium w-12">排名</th>
                      <th className="text-left py-2 px-3 text-[#64748B] font-medium">错误信息</th>
                      <th className="text-right py-2 px-3 text-[#64748B] font-medium w-24">出现次数</th>
                      <th className="text-right py-2 px-3 text-[#64748B] font-medium w-24">占比</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errorAnalysis.topErrorMessages.map((item, idx) => {
                      const total = errorAnalysis.totalErrors || 1;
                      const percentage = (item.count / total) * 100;
                      return (
                        <tr key={idx} className="border-b border-[#334155]/50 hover:bg-[#0F172A]/30">
                          <td className="py-2 px-3 text-[#64748B]">#{idx + 1}</td>
                          <td className="py-2 px-3 text-[#94A3B8] max-w-md truncate" title={item.message}>
                            {item.message}
                          </td>
                          <td className="py-2 px-3 text-right text-rose-400">{item.count.toLocaleString()}</td>
                          <td className="py-2 px-3 text-right text-[#94A3B8]">{percentage.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    emerald: 'bg-emerald-500/15 text-emerald-400',
    blue: 'bg-blue-500/15 text-blue-400',
    amber: 'bg-amber-500/15 text-amber-400',
    rose: 'bg-rose-500/15 text-rose-400',
    purple: 'bg-purple-500/15 text-purple-400',
    cyan: 'bg-cyan-500/15 text-cyan-400',
  };
  return (
    <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorClasses[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <div className="text-2xl font-bold text-[#F1F5F9]">{value}</div>
          <div className="text-xs text-[#64748B]">{label}</div>
        </div>
      </div>
    </div>
  );
}
