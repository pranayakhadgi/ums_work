import { useEffect, useMemo, useState } from 'react';
import {
  ComposedChart, Line, LineChart, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceArea, ResponsiveContainer, Legend,
} from 'recharts';
import { CheckCircle2, XCircle, AlertTriangle, Gauge, type LucideIcon } from 'lucide-react';

interface HealthBucket {
  t: number;
  timestamp: string;
  up: number;
  down: number;
  unknown: number;
  total: number;
  healthScore: number;
  p95Latency: number;
  avgLatency: number;
}

interface AggregateHealthResponse {
  data: HealthBucket[];
}

export type MonitorStatus = 'UP' | 'DOWN' | 'UNKNOWN';

interface MonitorHistoryEntry {
  timestamp: string;
  status: MonitorStatus;
}

export interface MonitorHistory {
  id: string;
  name: string;
  url: string;
  history: MonitorHistoryEntry[];
}

interface HistoryResponse {
  window: number;
  bucketMinutes: number;
  monitors: MonitorHistory[];
}

interface HealthSummaryProps {
  instanceId?: string;
  chartWindowHours?: number;
  heatstripWindowHours?: number;
  initialMonitorCount?: number;
  downShadeThreshold?: number;
  onMonitorClick?: (monitorId: string) => void;
  className?: string;
}

function useHealthSummaryData(
  instanceId: string | undefined,
  chartWindowHours: number,
  heatstripWindowHours: number
) {
  const [buckets, setBuckets] = useState<HealthBucket[]>([]);
  const [monitorHistories, setMonitorHistories] = useState<MonitorHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const instanceParam = instanceId ? `&instanceId=${encodeURIComponent(instanceId)}` : '';
        const [healthRes, historyRes] = await Promise.all([
          fetch(`/api/monitors/aggregate/health?window=${chartWindowHours}${instanceParam}`),
          fetch(`/api/monitors/history?window=${heatstripWindowHours}&bucket=30${instanceParam}`),
        ]);
        if (!healthRes.ok || !historyRes.ok) {
          throw new Error('Failed to load health data');
        }
        const healthJson: AggregateHealthResponse = await healthRes.json();
        const historyJson: HistoryResponse = await historyRes.json();
        if (cancelled) return;
        setBuckets(healthJson.data ?? []);
        setMonitorHistories(historyJson.monitors ?? []);
        setError(null);
      } catch (err: any) {
        if (!cancelled) setError(err.message ?? 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const interval = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [instanceId, chartWindowHours, heatstripWindowHours]);

  return { buckets, monitorHistories, loading, error };
}

export function healthTone(score: number): 'good' | 'warn' | 'danger' {
  if (score >= 99) return 'good';
  if (score >= 95) return 'warn';
  return 'danger';
}

export function computeDownRanges(data: { t: string; isDown: boolean }[]): { x1: string; x2: string }[] {
  const ranges: { x1: string; x2: string }[] = [];
  let start: string | null = null;

  for (let i = 0; i < data.length; i++) {
    if (data[i].isDown && start === null) start = data[i].t;
    if (!data[i].isDown && start !== null) {
      ranges.push({ x1: start, x2: data[i - 1].t });
      start = null;
    }
  }
  if (start !== null) ranges.push({ x1: start, x2: data[data.length - 1].t });
  return ranges;
}

export function trimLeadingUnknownGlobally(
  monitors: MonitorHistory[]
): { monitors: MonitorHistory[]; trimmedHours: number } {
  if (monitors.length === 0 || monitors[0].history.length === 0) {
    return { monitors, trimmedHours: 0 };
  }

  const bucketCount = monitors[0].history.length;
  let firstMeaningfulIndex = bucketCount;
  for (const monitor of monitors) {
    for (let i = 0; i < monitor.history.length; i++) {
      if (monitor.history[i].status !== 'UNKNOWN') {
        firstMeaningfulIndex = Math.min(firstMeaningfulIndex, i);
        break;
      }
    }
  }

  if (firstMeaningfulIndex === bucketCount) {
    return { monitors, trimmedHours: 0 };
  }

  const trimmed = monitors.map(m => ({ ...m, history: m.history.slice(firstMeaningfulIndex) }));
  const first = trimmed[0].history[0];
  const last = trimmed[0].history[trimmed[0].history.length - 1];
  const spanMs = new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime();
  const trimmedHours = Math.max(1, Math.round(spanMs / (60 * 60 * 1000)));

  return { monitors: trimmed, trimmedHours };
}

export function sortBySeverity(monitors: MonitorHistory[]): MonitorHistory[] {
  const severity: Record<MonitorStatus, number> = { DOWN: 0, UNKNOWN: 1, UP: 2 };
  return [...monitors].sort((a, b) => {
    const lastA = a.history[a.history.length - 1]?.status ?? 'UNKNOWN';
    const lastB = b.history[b.history.length - 1]?.status ?? 'UNKNOWN';
    const diff = severity[lastA] - severity[lastB];
    return diff !== 0 ? diff : a.name.localeCompare(b.name);
  });
}

function formatTick(t: string): string {
  return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function StatCard({
  label, value, subtext, tone, icon: Icon,
}: {
  label: string;
  value: string;
  subtext?: string;
  tone: 'good' | 'warn' | 'danger' | 'neutral';
  icon?: LucideIcon;
}) {
  const toneClasses: Record<string, string> = {
    good: 'border-t-emerald-500 bg-[var(--bg-card)] text-emerald-400',
    warn: 'border-t-amber-500 bg-[var(--bg-card)] text-amber-400',
    danger: 'border-t-red-500 bg-[var(--bg-card)] text-red-400',
    neutral: 'border-t-blue-500 bg-[var(--bg-card)] text-slate-200',
  };
  return (
    <div className={`rounded-lg border border-[var(--border)] border-t-2 p-3 ${toneClasses[tone]}`}>
      <div className="flex items-center gap-1.5 text-xs opacity-70 mb-1">
        {Icon && <Icon size={12} />}
        {label}
      </div>
      <div className="text-xl font-semibold text-slate-100">{value}</div>
      {subtext && <div className="text-xs opacity-60 mt-0.5">{subtext}</div>}
    </div>
  );
}

function StatRow({ buckets }: { buckets: HealthBucket[] }) {
  const latest = buckets[buckets.length - 1];
  const uptimePct = latest && latest.total > 0 ? (latest.up / latest.total) * 100 : 0;
  const p95Series = useMemo(() => buckets.map(b => ({ p95: b.p95Latency })), [buckets]);

  if (!latest) {
    return <div className="text-sm text-slate-400 py-4">No health data for this window.</div>;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      <StatCard
        label="Health Score"
        value={`${Math.round(latest.healthScore)}%`}
        subtext={latest.down === 0 ? 'All systems responding' : 'Requires attention'}
        tone={healthTone(latest.healthScore)}
        icon={latest.down === 0 ? CheckCircle2 : AlertTriangle}
      />
      <StatCard
        label="Uptime"
        value={`${uptimePct.toFixed(1)}%`}
        subtext="over current window"
        tone={healthTone(uptimePct)}
        icon={Gauge}
      />
      <StatCard
        label="Monitors"
        value={`${latest.up}/${latest.total}`}
        subtext={`${latest.down} down · ${latest.unknown} unknown`}
        tone={latest.down > 0 ? 'danger' : 'neutral'}
        icon={latest.down > 0 ? XCircle : CheckCircle2}
      />
      <div className="rounded-lg border border-[var(--border)] border-t-2 border-t-purple-500 bg-[var(--bg-card)] p-3">
        <div className="text-xs text-slate-400 mb-1">p95 Latency</div>
        <div className="flex items-end justify-between">
          <span className="text-xl font-semibold text-slate-100">{Math.round(latest.p95Latency)}ms</span>
          <div className="w-20 h-8">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={p95Series}>
                <Line type="monotone" dataKey="p95" stroke="#a78bfa" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function HealthChart({
  buckets, downShadeThreshold,
}: { buckets: HealthBucket[]; downShadeThreshold: number }) {
  const data = useMemo(
    () => buckets.map(b => ({
      t: b.timestamp,
      healthScore: b.healthScore,
      p95Latency: b.p95Latency,
      isDown: b.total > 0 && (b.down / b.total) > downShadeThreshold,
    })),
    [buckets, downShadeThreshold]
  );

  const downRanges = useMemo(() => computeDownRanges(data), [data]);

  if (data.length === 0) {
    return <div className="text-sm text-slate-400 py-4">No chart data for this window.</div>;
  }

  return (
    <div className="h-64 sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="t" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={formatTick} minTickGap={40} />
          <YAxis yAxisId="score" domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} width={36} />
          <YAxis yAxisId="latency" orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} width={44} />
          <Tooltip labelFormatter={formatTick} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {downRanges.map((r, i) => (
            <ReferenceArea key={i} yAxisId="score" x1={r.x1} x2={r.x2} fill="#ef4444" fillOpacity={0.18} strokeOpacity={0} />
          ))}
          <Line yAxisId="score" type="monotone" dataKey="healthScore" name="Health Score" stroke="#0ea5e9" strokeWidth={2} dot={false} />
          <Line yAxisId="latency" type="monotone" dataKey="p95Latency" name="p95 Latency (ms)" stroke="#a855f7" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

const STATUS_COLORS: Record<MonitorStatus, string> = {
  UP: '#22c55e',
  DOWN: '#ef4444',
  UNKNOWN: '#475569',
};

function MonitorHeatstripRow({
  monitor,
  onMonitorClick,
}: {
  monitor: MonitorHistory;
  onMonitorClick?: (monitorId: string) => void;
}) {
  const content = (
    <>
      <div className="w-48 truncate text-xs text-slate-300 shrink-0" title={monitor.name}>
        {monitor.name}
      </div>
      <div className="flex gap-[2px]">
        {monitor.history.map((entry, i) => (
          <div
            key={i}
            className="w-2 h-4 sm:w-2.5 sm:h-5 rounded-[1px]"
            style={{ backgroundColor: STATUS_COLORS[entry.status] }}
            title={`${new Date(entry.timestamp).toLocaleString()}: ${entry.status}`}
          />
        ))}
      </div>
    </>
  );

  if (onMonitorClick) {
    return (
      <button
        type="button"
        onClick={() => onMonitorClick(monitor.id)}
        className="flex items-center gap-2 min-w-max hover:bg-white/5 rounded px-1 -mx-1 transition-colors text-left w-full"
      >
        {content}
      </button>
    );
  }

  return <div className="flex items-center gap-2 min-w-max">{content}</div>;
}

function MonitorHeatstrip({
  monitors,
  initialCount,
  onMonitorClick,
}: {
  monitors: MonitorHistory[];
  initialCount: number;
  onMonitorClick?: (monitorId: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);

  const { monitors: trimmedMonitors, trimmedHours } = useMemo(
    () => trimLeadingUnknownGlobally(monitors),
    [monitors]
  );
  const sorted = useMemo(() => sortBySeverity(trimmedMonitors), [trimmedMonitors]);
  const visible = showAll ? sorted : sorted.slice(0, initialCount);

  if (monitors.length === 0) {
    return <div className="text-sm text-slate-400 py-4">No monitor history available for this window.</div>;
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-slate-300">
          Status Timeline (last {trimmedHours > 0 ? trimmedHours : '…'}h)
        </h3>
        {sorted.length > initialCount && (
          <button
            onClick={() => setShowAll(s => !s)}
            className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
          >
            {showAll ? 'Show less' : `Show all (${sorted.length})`}
          </button>
        )}
      </div>
      <div className="space-y-1.5 overflow-x-auto">
        {visible.map(monitor => (
          <MonitorHeatstripRow key={monitor.id} monitor={monitor} onMonitorClick={onMonitorClick} />
        ))}
      </div>
    </div>
  );
}

export default function HealthSummary({
  instanceId,
  chartWindowHours = 4,
  heatstripWindowHours = 24,
  initialMonitorCount = 8,
  downShadeThreshold = 0.10,
  onMonitorClick,
  className = '',
}: HealthSummaryProps) {
  const { buckets, monitorHistories, loading, error } = useHealthSummaryData(
    instanceId, chartWindowHours, heatstripWindowHours
  );

  if (loading && buckets.length === 0) {
    return (
      <div className={`rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] p-4 text-slate-400 ${className}`}>
        Loading health summary…
      </div>
    );
  }
  if (error) {
    return (
      <div className={`rounded-xl border border-red-800 bg-red-950/40 p-4 text-red-300 ${className}`}>
        Failed to load health data: {error}
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] p-4 ${className}`}>
      <StatRow buckets={buckets} />
      <HealthChart buckets={buckets} downShadeThreshold={downShadeThreshold} />
      <MonitorHeatstrip
        monitors={monitorHistories}
        initialCount={initialMonitorCount}
        onMonitorClick={onMonitorClick}
      />
    </div>
  );
}
