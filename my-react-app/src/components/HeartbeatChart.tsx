import { useEffect, useState, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { HEALTH_MS, MONITOR_MS, POLL_BUFFER_MS } from '../api/intervals';

interface HealthPoint {
  timestamp: string;
  healthScore: number;
  upCount: number;
  totalCount: number;
}

interface Props {
  monitors: { id: string; status: string; lastChecked: string | null }[];
}

export default function HeartbeatChart({ monitors }: Props) {
  const [history, setHistory] = useState<HealthPoint[]>([]);
  const [loading, setLoading] = useState(true);

  // Compute current health from the monitors prop (always available, even if DB is fresh)
  const currentHealth = useMemo(() => {
    const total = monitors.length;
    if (total === 0) return null;
    const up = monitors.filter(m => m.status === 'UP').length;
    return {
      timestamp: new Date().toISOString(),
      healthScore: Math.round((up / total) * 100),
      upCount: up,
      totalCount: total,
    };
  }, [monitors]);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
      const res = await fetch('/api/monitors/aggregate/health?limit=60');
      if (!res.ok) throw new Error('Failed to fetch health trend');
      const json = await res.json();
      setHistory(json.data ?? []);
      } catch (e) {
      console.error('[HeartbeatChart] Failed to load history:', e);
      } finally {
      setLoading(false);
      }
    };
    
    fetchHistory();

    const interval = setInterval(fetchHistory, MONITOR_MS + POLL_BUFFER_MS);
    return () => clearInterval(interval);//clean the memory
  }, []);

  // Merge: historical points from DB + current synthetic point
  // If history is empty, we show just the current point so the chart isn't blank
  const chartData = useMemo(() => {
    if(!currentHealth) return [];

    if (history.length > 0) {
      // If the latest historical point is very recent (within 2 min), don't duplicate
      const latest = history[history.length - 1];
      const latestTime = new Date(latest.timestamp).getTime();
      const now = Date.now();
      if (now - latestTime < 120000 && currentHealth) {
        // Replace the last point with fresher current data
        return [...history.slice(0, -1), currentHealth];
      }
      return [...history, currentHealth];
    }
    // No history yet: show current state as a single point
    return [currentHealth];
  }, [history, currentHealth]);

  const getStrokeColor = (score: number) => {
    if (score >= 80) return '#22c55e';
    if (score >= 50) return '#eab308';
    return '#ef4444';
  };

  const gradientId = 'healthGradient';

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload as HealthPoint;
    const isSynthetic = history.length === 0;
    return (
      <div className="bg-[#1c202c] border border-[#2a2e3d] rounded-lg p-3 shadow-lg">
        <div className="text-xs text-[#8b90a7] mb-1">
          {new Date(p.timestamp).toLocaleTimeString('en-US', { hour12: true })}
          {isSynthetic && <span className="text-[#eab308] ml-2">(live)</span>}
        </div>
        <div className="text-lg font-semibold" style={{ color: getStrokeColor(p.healthScore) }}>
          {p.healthScore}% healthy
        </div>
        <div className="text-xs text-[#555a72]">
          {p.upCount} / {p.totalCount} monitors UP
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="chart-section animate-fade">
        <div className="chart-header">
          <div className="chart-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
            System Heartbeat
          </div>
        </div>
        <div className="h-[120px] flex items-center justify-center text-[#555a72] text-sm">
          Loading trend data...
        </div>
      </div>
    );
  }

  if (monitors.length === 0) {
    return (
      <div className="chart-section animate-fade">
        <div className="chart-header">
          <div className="chart-title">System Heartbeat</div>
        </div>
        <div className="h-[120px] flex items-center justify-center text-[#555a72] text-sm">
          No monitors configured. Add endpoints to see health trends.
        </div>
      </div>
    );
  }

  // Dynamic stroke: use the latest health score to color the line
  const latestScore = chartData[chartData.length - 1]?.healthScore ?? 100;
  const strokeColor = getStrokeColor(latestScore);

  return (
    <div className="chart-section animate-fade">
      <div className="chart-header">
        <div className="chart-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
          System Heartbeat
        </div>
        <div className="chart-legend">
          <div className="legend-item">
            <div className="legend-dot" style={{ background: '#22c55e' }} />
            Healthy
          </div>
          <div className="legend-item">
            <div className="legend-dot" style={{ background: '#eab308' }} />
            Degraded
          </div>
          <div className="legend-item">
            <div className="legend-dot" style={{ background: '#ef4444' }} />
            Critical
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={120}>
        <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity={0.3} />
              <stop offset="100%" stopColor={strokeColor} stopOpacity={0.05} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />

          <XAxis
            dataKey="timestamp"
            tickFormatter={(val) => {
              const d = new Date(val);
              return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
            }}
            stroke="#4a4f66"
            tick={{ fill: '#4a4f66', fontSize: 10, fontFamily: 'JetBrains Mono' }}
            tickLine={false}
            axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
            minTickGap={30}
          />

          <YAxis
            domain={[0, 100]}
            stroke="#4a4f66"
            tick={{ fill: '#4a4f66', fontSize: 10, fontFamily: 'JetBrains Mono' }}
            tickLine={false}
            axisLine={false}
            tickCount={5}
          />

          <Tooltip content={<CustomTooltip />} />

          <Area
            type="monotone"
            dataKey="healthScore"
            stroke={strokeColor}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            animationDuration={500}
            dot={chartData.length === 1 ? { r: 4, fill: strokeColor } : false}
            activeDot={{ r: 5, fill: strokeColor, stroke: '#fff', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}