import { useState } from 'react';
import {
  AlertTriangle,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  RefreshCw,
  Bell,
  BellOff,
  AlertCircle,
  Info,
  AlertOctagon,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useLogAnalysis, useProjects } from '@/hooks';
import PageHeader from '@/components/PageHeader';
import Modal from '@/components/Modal';
import { formatTime } from '@/utils/format';
import type { AlertThreshold, LogType } from '../../shared/types';

export default function AlertConfig() {
  const {
    thresholds,
    events,
    activeAlerts,
    loading,
    addThreshold,
    updateThreshold,
    deleteThreshold,
    toggleThreshold,
    resolveEvent,
    checkAlerts,
    getMetricLabel,
    getOperatorLabel,
    formatThresholdValue,
  } = useLogAnalysis({ autoRefresh: true, refreshInterval: 60000 });
  const { projects } = useProjects();
  const [showModal, setShowModal] = useState(false);
  const [editingThreshold, setEditingThreshold] = useState<AlertThreshold | null>(null);
  const [expandedEventIds, setExpandedEventIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'thresholds' | 'events' | 'active'>('thresholds');
  type NotifyChannel = 'sse' | 'email' | 'webhook';
  const [formData, setFormData] = useState({
    name: '',
    metric: 'error_rate' as AlertThreshold['metric'],
    operator: 'gt' as AlertThreshold['operator'],
    threshold: 0.05,
    timeWindow: 5,
    unit: 'minutes' as AlertThreshold['unit'],
    enabled: true,
    notifyChannels: ['sse'] as NotifyChannel[],
    project: '',
    logType: '' as LogType | '',
  });

  const METRIC_OPTIONS = [
    { value: 'error_rate', label: '错误率', unit: '%', step: 0.01, default: 0.05 },
    { value: 'error_count', label: '错误数量', unit: '个', step: 1, default: 10 },
    { value: 'log_volume', label: '日志量', unit: '条', step: 1, default: 100 },
    { value: 'response_time', label: '响应时间', unit: 'ms', step: 1, default: 1000 },
  ] as const;

  const OPERATOR_OPTIONS = [
    { value: 'gt', label: '大于 (>)' },
    { value: 'lt', label: '小于 (<)' },
    { value: 'gte', label: '大于等于 (>=)' },
    { value: 'lte', label: '小于等于 (<=)' },
    { value: 'eq', label: '等于 (==)' },
  ] as const;

  const UNIT_OPTIONS = [
    { value: 'minutes', label: '分钟' },
    { value: 'hours', label: '小时' },
    { value: 'days', label: '天' },
  ] as const;

  const LOG_TYPE_OPTIONS: { value: LogType | ''; label: string }[] = [
    { value: '', label: '全部类型' },
    { value: 'pull', label: '配置拉取' },
    { value: 'change', label: '配置变更' },
    { value: 'encrypt', label: '加密操作' },
    { value: 'decrypt', label: '解密操作' },
    { value: 'client_register', label: '客户端注册' },
    { value: 'notify', label: '通知推送' },
  ];

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

  const severityLabels: Record<string, string> = {
    info: '信息',
    warning: '警告',
    critical: '严重',
  };

  const handleOpenModal = (threshold?: AlertThreshold) => {
    if (threshold) {
      setEditingThreshold(threshold);
      setFormData({
        name: threshold.name,
        metric: threshold.metric,
        operator: threshold.operator,
        threshold: threshold.threshold,
        timeWindow: threshold.timeWindow,
        unit: threshold.unit,
        enabled: threshold.enabled,
        notifyChannels: threshold.notifyChannels,
        project: threshold.project || '',
        logType: (threshold.logType as LogType | '') || '',
      });
    } else {
      setEditingThreshold(null);
      const defaultMetric = METRIC_OPTIONS[0];
      setFormData({
        name: '',
        metric: defaultMetric.value,
        operator: 'gt',
        threshold: defaultMetric.default,
        timeWindow: 5,
        unit: 'minutes',
        enabled: true,
        notifyChannels: ['sse'],
        project: '',
        logType: '',
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingThreshold(null);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) return;

    const data = {
      name: formData.name,
      metric: formData.metric,
      operator: formData.operator,
      threshold: formData.threshold,
      timeWindow: formData.timeWindow,
      unit: formData.unit,
      enabled: formData.enabled,
      notifyChannels: formData.notifyChannels,
      ...(formData.project ? { project: formData.project } : {}),
      ...(formData.logType ? { logType: formData.logType as LogType } : {}),
    };

    if (editingThreshold) {
      await updateThreshold(editingThreshold.id, data);
    } else {
      await addThreshold(data);
    }

    handleCloseModal();
  };

  const toggleEventExpand = (id: string) => {
    const newSet = new Set(expandedEventIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedEventIds(newSet);
  };

  const selectedMetric = METRIC_OPTIONS.find((m) => m.value === formData.metric);

  const TABS = [
    { id: 'thresholds', label: '告警阈值', icon: Bell, count: thresholds.length },
    { id: 'active', label: '活跃告警', icon: AlertCircle, count: activeAlerts.length },
    { id: 'events', label: '告警历史', icon: Clock, count: events.length },
  ] as const;

  return (
    <div className="animate-slide-in">
      <PageHeader
        title="告警配置"
        subtitle="设置日志监控阈值，异常情况及时通知"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => checkAlerts()}
              className="flex items-center gap-2 px-4 py-2 bg-[#1E293B] text-[#94A3B8] border border-[#334155] rounded-lg hover:bg-[#334155] transition-colors text-sm"
            >
              <RefreshCw className="w-4 h-4" />
              立即检查
            </button>
            <button
              onClick={() => handleOpenModal()}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500/15 text-emerald-400 rounded-lg hover:bg-emerald-500/25 transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              新建阈值
            </button>
          </div>
        }
      />

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
              {tab.count > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    activeTab === tab.id
                      ? 'bg-emerald-500/30 text-emerald-300'
                      : 'bg-[#334155] text-[#64748B]'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeTab === 'thresholds' && (
        <div className="space-y-3">
          {thresholds.length === 0 ? (
            <div className="text-center py-16 text-[#64748B]">
              <Bell className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="mb-4">暂无告警阈值</p>
              <button
                onClick={() => handleOpenModal()}
                className="px-4 py-2 bg-emerald-500/15 text-emerald-400 rounded-lg hover:bg-emerald-500/25 transition-colors text-sm"
              >
                创建第一个阈值
              </button>
            </div>
          ) : (
            thresholds.map((threshold) => {
              const SeverityIcon = severityIcons.warning;
              return (
                <div
                  key={threshold.id}
                  className="bg-[#1E293B] border border-[#334155] rounded-xl p-4 hover:border-emerald-500/30 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => toggleThreshold(threshold.id, !threshold.enabled)}
                        className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                          threshold.enabled
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-[#334155] text-[#64748B]'
                        }`}
                      >
                        {threshold.enabled ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
                      </button>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-medium text-[#F1F5F9]">{threshold.name}</h3>
                          {!threshold.enabled && (
                            <span className="text-[10px] text-[#64748B] bg-[#334155] px-1.5 py-0.5 rounded">
                              已禁用
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-[#64748B]">
                            {getMetricLabel(threshold.metric)} {getOperatorLabel(threshold.operator)}{' '}
                            {formatThresholdValue(threshold.metric, threshold.threshold)}
                          </span>
                          <span className="text-xs text-[#64748B]">
                            时间窗口: {threshold.timeWindow}
                            {threshold.unit === 'minutes' ? '分钟' : threshold.unit === 'hours' ? '小时' : '天'}
                          </span>
                          {threshold.project && (
                            <span className="text-xs text-[#64748B]">
                              项目: {threshold.project}
                            </span>
                          )}
                          {threshold.logType && (
                            <span className="text-xs text-[#64748B]">
                              类型: {threshold.logType}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenModal(threshold)}
                        className="p-2 text-[#64748B] hover:text-[#94A3B8] hover:bg-[#334155] rounded-lg transition-colors"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteThreshold(threshold.id)}
                        className="p-2 text-[#64748B] hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === 'active' && (
        <div className="space-y-3">
          {activeAlerts.length === 0 ? (
            <div className="text-center py-16 text-[#64748B]">
              <Check className="w-12 h-12 mx-auto mb-3 text-emerald-400 opacity-50" />
              <p>暂无活跃告警</p>
            </div>
          ) : (
            activeAlerts.map((alert) => {
              const SeverityIcon = severityIcons[alert.severity] || Info;
              return (
                <div
                  key={alert.id}
                  className={`bg-[#1E293B] border rounded-xl p-4 ${severityColors[alert.severity] || ''}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                        alert.severity === 'critical' ? 'bg-rose-500/20 text-rose-400' :
                        alert.severity === 'warning' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-blue-500/20 text-blue-400'
                      }`}>
                        <SeverityIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-medium text-[#F1F5F9]">{alert.thresholdName}</h3>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                            alert.severity === 'critical' ? 'bg-rose-500/20 text-rose-400' :
                            alert.severity === 'warning' ? 'bg-amber-500/20 text-amber-400' :
                            'bg-blue-500/20 text-blue-400'
                          }`}>
                            {severityLabels[alert.severity]}
                          </span>
                        </div>
                        <p className="text-xs text-[#94A3B8] mb-2">
                          {getMetricLabel(alert.metric)} {getOperatorLabel(alert.operator)}{' '}
                          {formatThresholdValue(alert.metric, alert.threshold)}，当前值:{' '}
                          <span className="text-rose-400 font-medium">
                            {formatThresholdValue(alert.metric, alert.actualValue)}
                          </span>
                        </p>
                        <p className="text-xs text-[#64748B]">
                          触发时间: {formatTime(alert.timestamp)}
                          {alert.project && ` · 项目: ${alert.project}`}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => resolveEvent(alert.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/15 text-emerald-400 rounded-lg hover:bg-emerald-500/25 transition-colors text-xs"
                    >
                      <Check className="w-3 h-3" />
                      标记解决
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === 'events' && (
        <div className="space-y-2">
          {events.length === 0 ? (
            <div className="text-center py-16 text-[#64748B]">
              <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>暂无告警历史</p>
            </div>
          ) : (
            events.map((event) => {
              const SeverityIcon = severityIcons[event.severity] || Info;
              const isExpanded = expandedEventIds.has(event.id);
              return (
                <div
                  key={event.id}
                  className={`bg-[#1E293B] border border-[#334155] rounded-xl overflow-hidden transition-colors ${
                    !event.resolved ? 'border-l-2 border-l-rose-500' : ''
                  }`}
                >
                  <div
                    className="p-4 cursor-pointer hover:bg-[#0F172A]/50 transition-colors"
                    onClick={() => toggleEventExpand(event.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          event.severity === 'critical' ? 'bg-rose-500/20 text-rose-400' :
                          event.severity === 'warning' ? 'bg-amber-500/20 text-amber-400' :
                          'bg-blue-500/20 text-blue-400'
                        }`}>
                          <SeverityIcon className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-[#F1F5F9]">
                              {event.thresholdName}
                            </span>
                            {event.resolved ? (
                              <span className="text-[10px] text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded">
                                已解决
                              </span>
                            ) : (
                              <span className="text-[10px] text-rose-400 bg-rose-500/15 px-1.5 py-0.5 rounded">
                                未解决
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#64748B] mt-0.5">
                            {formatTime(event.timestamp)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                          event.severity === 'critical' ? 'bg-rose-500/20 text-rose-400' :
                          event.severity === 'warning' ? 'bg-amber-500/20 text-amber-400' :
                          'bg-blue-500/20 text-blue-400'
                        }`}>
                          {severityLabels[event.severity]}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-[#64748B]" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-[#64748B]" />
                        )}
                      </div>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0 border-t border-[#334155]/50">
                      <div className="pt-3 space-y-2">
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-[#64748B]">指标:</span>
                          <span className="text-[#94A3B8]">{getMetricLabel(event.metric)}</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-[#64748B]">阈值:</span>
                          <span className="text-[#94A3B8]">
                            {getOperatorLabel(event.operator)} {formatThresholdValue(event.metric, event.threshold)}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-[#64748B]">实际值:</span>
                          <span className="text-rose-400 font-medium">
                            {formatThresholdValue(event.metric, event.actualValue)}
                          </span>
                        </div>
                        {event.project && (
                          <div className="flex items-center gap-4 text-xs">
                            <span className="text-[#64748B]">项目:</span>
                            <span className="text-[#94A3B8]">{event.project}</span>
                          </div>
                        )}
                        {event.resolvedAt && (
                          <div className="flex items-center gap-4 text-xs">
                            <span className="text-[#64748B]">解决时间:</span>
                            <span className="text-emerald-400">{formatTime(event.resolvedAt)}</span>
                          </div>
                        )}
                        {!event.resolved && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              resolveEvent(event.id);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/15 text-emerald-400 rounded-lg hover:bg-emerald-500/25 transition-colors text-xs mt-2"
                          >
                            <Check className="w-3 h-3" />
                            标记解决
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      <Modal
        open={showModal}
        onClose={handleCloseModal}
        title={editingThreshold ? '编辑告警阈值' : '新建告警阈值'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#94A3B8] mb-1.5">
              名称 <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="例如：错误率过高告警"
              className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-lg text-sm text-[#F1F5F9] placeholder-[#64748B] focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#94A3B8] mb-1.5">
                监控指标
              </label>
              <select
                value={formData.metric}
                onChange={(e) => {
                  const metric = e.target.value as AlertThreshold['metric'];
                  const metricOpt = METRIC_OPTIONS.find((m) => m.value === metric);
                  setFormData({
                    ...formData,
                    metric,
                    threshold: metricOpt?.default || 0,
                  });
                }}
                className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-lg text-sm text-[#F1F5F9] focus:outline-none focus:border-emerald-500/50"
              >
                {METRIC_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#94A3B8] mb-1.5">
                条件
              </label>
              <select
                value={formData.operator}
                onChange={(e) => setFormData({ ...formData, operator: e.target.value as AlertThreshold['operator'] })}
                className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-lg text-sm text-[#F1F5F9] focus:outline-none focus:border-emerald-500/50"
              >
                {OPERATOR_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#94A3B8] mb-1.5">
                阈值 ({selectedMetric?.unit})
              </label>
              <input
                type="number"
                step={selectedMetric?.step}
                value={formData.threshold}
                onChange={(e) => setFormData({ ...formData, threshold: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-lg text-sm text-[#F1F5F9] focus:outline-none focus:border-emerald-500/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#94A3B8] mb-1.5">
                时间窗口
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  value={formData.timeWindow}
                  onChange={(e) => setFormData({ ...formData, timeWindow: parseInt(e.target.value) || 1 })}
                  className="flex-1 px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-lg text-sm text-[#F1F5F9] focus:outline-none focus:border-emerald-500/50"
                />
                <select
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value as AlertThreshold['unit'] })}
                  className="w-24 px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-lg text-sm text-[#F1F5F9] focus:outline-none focus:border-emerald-500/50"
                >
                  {UNIT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#94A3B8] mb-1.5">
                项目 (可选)
              </label>
              <select
                value={formData.project}
                onChange={(e) => setFormData({ ...formData, project: e.target.value })}
                className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-lg text-sm text-[#F1F5F9] focus:outline-none focus:border-emerald-500/50"
              >
                <option value="">全部项目</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#94A3B8] mb-1.5">
                日志类型 (可选)
              </label>
              <select
                value={formData.logType}
                onChange={(e) => setFormData({ ...formData, logType: e.target.value as LogType | '' })}
                className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-lg text-sm text-[#F1F5F9] focus:outline-none focus:border-emerald-500/50"
              >
                {LOG_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="enabled"
              checked={formData.enabled}
              onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
              className="w-4 h-4 rounded border-[#334155] bg-[#0F172A] text-emerald-500 focus:ring-emerald-500/50"
            />
            <label htmlFor="enabled" className="text-xs text-[#94A3B8]">
              启用此告警阈值
            </label>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#94A3B8] mb-1.5">
              通知方式
            </label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.notifyChannels.includes('sse')}
                  onChange={(e) => {
                    const channels = formData.notifyChannels.filter((c) => c !== 'sse' as NotifyChannel);
                    if (e.target.checked) channels.push('sse' as NotifyChannel);
                    setFormData({ ...formData, notifyChannels: channels });
                  }}
                  className="w-4 h-4 rounded border-[#334155] bg-[#0F172A] text-emerald-500 focus:ring-emerald-500/50"
                />
                <span className="text-xs text-[#94A3B8]">实时推送</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.notifyChannels.includes('email')}
                  onChange={(e) => {
                    const channels = formData.notifyChannels.filter((c) => c !== 'email' as NotifyChannel);
                    if (e.target.checked) channels.push('email' as NotifyChannel);
                    setFormData({ ...formData, notifyChannels: channels });
                  }}
                  className="w-4 h-4 rounded border-[#334155] bg-[#0F172A] text-emerald-500 focus:ring-emerald-500/50"
                />
                <span className="text-xs text-[#94A3B8]">邮件</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.notifyChannels.includes('webhook')}
                  onChange={(e) => {
                    const channels = formData.notifyChannels.filter((c) => c !== 'webhook' as NotifyChannel);
                    if (e.target.checked) channels.push('webhook' as NotifyChannel);
                    setFormData({ ...formData, notifyChannels: channels });
                  }}
                  className="w-4 h-4 rounded border-[#334155] bg-[#0F172A] text-emerald-500 focus:ring-emerald-500/50"
                />
                <span className="text-xs text-[#94A3B8]">Webhook</span>
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-[#334155]">
          <button
            onClick={handleCloseModal}
            className="px-4 py-2 text-xs text-[#94A3B8] border border-[#334155] rounded-lg hover:bg-[#334155] transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!formData.name.trim() || formData.notifyChannels.length === 0}
            className="px-4 py-2 text-xs bg-emerald-500/15 text-emerald-400 rounded-lg hover:bg-emerald-500/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {editingThreshold ? '保存修改' : '创建阈值'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
