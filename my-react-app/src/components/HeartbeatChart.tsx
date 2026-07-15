import { useEffect, useState, useMemo } from 'react';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ResponsiveContainer,
} from 'recharts';
import { MONITOR_MS, POLL_BUFFER_MS } from '../api/intervals';

// ── Types ────────────────────────────────────────────────────────────────────

interface HealthPoint {
  timestamp: string;
  upCount: number;
  downCount: number;
  unknownCount: number;
  totalCount: number;
  healthScore?: number;
}

/** Internal chart row — uses epoch ms for x-axis; nulls signal a gap break */
interface ChartRow {
  t: number;
  up: number | null;
  unknown: number | null;
  down: number | null;
  // kept for tooltip lookup
  totalCount?: number;
  timestamp?: string;
  isSynthetic?: boolean;
}

interface Props {
  monitors: { id: string; status: string; lastChecked: string | null }[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Insert a null-valued break row whenever consecutive points are more than
 * `gapThresholdMs` apart so Recharts breaks the line instead of connecting.
 */
function insertGapBreaks(rows: ChartRow[], gapThresholdMs: number): ChartRow[] {
  const out: ChartRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    out.push(rows[i]);
    if (i < rows.length - 1 && rows[i + 1].t - rows[i].t > gapThresholdMs) {
      // break sentinel — halfway between the two points
      out.push({
        t: Math.round((rows[i].t + rows[i + 1].t) / 2),
        up: null,
        unknown: null,
        down: null,
      });
    }
  }
  return out;
}

/**
 * Generate up to `maxTicks` evenly-spaced ticks on clean minute boundaries
 * within [domainMin, domainMax].
 */
function generateTicks(domainMin: number, domainMax: number, maxTicks = 6): number[] {
  const spanMs = domainMax - domainMin;
  if (spanMs <= 0) return [domainMin];

  // pick a step that lands on a clean boundary (1, 5, 10, 15, 30 min …)
  const candidates = [1, 2, 5, 10, 15, 30, 60].map((m) => m * 60_000);
  const ideal = spanMs / maxTicks;
  const step = candidates.find((c) => c >= ideal) ?? candidates[candidates.length - 1];

  // first tick = next clean multiple after domainMin
  const first = Math.ceil(domainMin / step) * step;
  const ticks: number[] = [];
  for (let t = first; t <= domainMax; t += step) {
    ticks.push(t);
  }
  return ticks;
}

// ── Tooltip ──────────────────────────────────────────────────────────────────

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ChartRow }>;
}

const CustomTooltip = ({ active, payload }: TooltipProps) => {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  if (row.up === null) return null; // gap sentinel

  return (
    <div className="bg-[#1c202c] border border-[#2a2e3d] rounded-lg p-3 shadow-lg min-w-[140px]">
      <div className="text-xs text-[#8b90a7] mb-2">
        {row.timestamp
          ? new Date(row.timestamp).toLocaleTimeString('en-US', { hour12: true })
          : new Date(row.t).toLocaleTimeString('en-US', { hour12: true })}
        {row.isSynthetic && <span className="text-[#eab308] ml-2">(live)</span>}
      </div>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-[#22c55e]">up</span>
          <span>{row.up ?? '—'}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[#eab308]">unknown</span>
          <span>{row.unknown ?? '—'}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[#ef4444]">down</span>
          <span>{row.down ?? '—'}</span>
        </div>
        <div className="border-t border-[#2a2e3d] pt-1 mt-1 flex justify-between gap-4 text-[#8b90a7]">
          <span>total</span>
          <span>{row.totalCount ?? ((row.up ?? 0) + (row.unknown ?? 0) + (row.down ?? 0))}</span>
        </div>
      </div>
    </div>
  );
};

// ── Gap regions (for ReferenceArea shading) ──────────────────────────────────

interface GapRegion {
  x1: number;
  x2: number;
}

function findGapRegions(rows: ChartRow[]): GapRegion[] {
  return rows
    .filter((r) => r.up === null)
    .map((sentinel) => {
      // find the real points on either side of this sentinel
      const idx = rows.indexOf(sentinel);
      const before = rows[idx - 1];
      const after = rows[idx + 1];
      return {
        x1: before?.t ?? sentinel.t,
        x2: after?.t ?? sentinel.t,
      };
    });
}

// ── Chart ────────────────────────────────────────────────────────────────────

export default function HeartbeatChart({ monitors }: Props) {
  const [history, setHistory] = useState<HealthPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentHealth, setCurrentHealth] = useState<HealthPoint | null>(null);

  // Build a live "synthetic" point from the current monitors prop
  useEffect(() => {
    const total = monitors.length;
    const timer = setTimeout(() => {
      if (total === 0) {
        setCurrentHealth(null);
        return;
      }
      const up = monitors.filter((m) => m.status === 'UP').length;
      const down = monitors.filter((m) => m.status === 'DOWN').length;
      const unknown = monitors.filter((m) => m.status === 'UNKNOWN').length;
      setCurrentHealth({
        timestamp: new Date().toISOString(),
        upCount: up,
        downCount: down,
        unknownCount: unknown,
        totalCount: total,
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [monitors]);

  // Fetch historical snapshots
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
    return () => clearInterval(interval);
  }, []);

  // Convert HealthPoints → ChartRows (epoch ms), merge with live point, insert gap breaks
  const { chartData, domainMin, domainMax, xTicks, gapRegions, isSinglePoint, hasUnknownData } = useMemo(() => {
    const base: ChartRow[] = history.map((p) => ({
      t: new Date(p.timestamp).getTime(),
      up: p.upCount,
      unknown: p.unknownCount,
      down: p.downCount,
      totalCount: p.totalCount,
      timestamp: p.timestamp,
      isSynthetic: false,
    }));

    // Merge live point
    if (currentHealth) {
      const liveT = new Date(currentHealth.timestamp).getTime();
      const liveRow: ChartRow = {
        t: liveT,
        up: currentHealth.upCount,
        unknown: currentHealth.unknownCount,
        down: currentHealth.downCount,
        totalCount: currentHealth.totalCount,
        timestamp: currentHealth.timestamp,
        isSynthetic: true,
      };

      if (base.length > 0) {
        const latestT = base[base.length - 1].t;
        // Replace last point if within 2 min (same bucket)
        if (liveT - latestT < 120_000) {
          base[base.length - 1] = liveRow;
        } else {
          base.push(liveRow);
        }
      } else {
        base.push(liveRow);
      }
    }

    if (base.length === 0) {
      return { chartData: [], domainMin: 0, domainMax: 0, xTicks: [], gapRegions: [], isSinglePoint: false };
    }

    // Debug: verify data sums
    console.log('[HeartbeatChart] First 3 data points:', base.slice(0, 3).map(d => ({
      up: d.up,
      down: d.down,
      unknown: d.unknown,
      total: d.totalCount,
      sum: (d.up ?? 0) + (d.down ?? 0) + (d.unknown ?? 0),
      matches: (d.up ?? 0) + (d.down ?? 0) + (d.unknown ?? 0) === d.totalCount
    })));

    // Gap threshold: 3× the nominal poll interval
    const gapThresholdMs = (MONITOR_MS + POLL_BUFFER_MS) * 3;
    const withBreaks = insertGapBreaks(base, gapThresholdMs);
    const gaps = findGapRegions(withBreaks);

    // Check if unknown line should be rendered (has any non-zero values)
    const hasUnknownData = base.some(d => (d.unknown ?? 0) > 0);

    const isSingle = base.length === 1;
    const rawMin = base[0].t;
    const rawMax = base[base.length - 1].t;

    // For a single point: pad ±5 min so it doesn't render at the chart edge
    const dMin = isSingle ? rawMin - 5 * 60_000 : rawMin;
    const dMax = isSingle ? rawMax + 5 * 60_000 : rawMax;

    const ticks = generateTicks(dMin, dMax, 6);

    return {
      chartData: withBreaks,
      domainMin: dMin,
      domainMax: dMax,
      xTicks: ticks,
      gapRegions: gaps,
      isSinglePoint: isSingle,
      hasUnknownData,
    };
  }, [history, currentHealth]);

  // ── Render states ──────────────────────────────────────────────────────────

  const Header = (
    <div className="chart-header">
      <div className="chart-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
        System Heartbeat
      </div>
      <div className="chart-legend">
        <div className="legend-item">
          <div className="legend-dot" style={{ background: '#22c55e' }} />
          Up
        </div>
        {hasUnknownData && (
          <div className="legend-item">
            {/* dashed indicator for unknown */}
            <svg width="16" height="4" style={{ marginRight: 4 }}>
              <line x1="0" y1="2" x2="16" y2="2" stroke="#eab308" strokeWidth="2" strokeDasharray="4 2" />
            </svg>
            Unknown
          </div>
        )}
        <div className="legend-item">
          <div className="legend-dot" style={{ background: '#ef4444' }} />
          Down
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="chart-section animate-fade">
        {Header}
        <div className="h-[140px] flex items-center justify-center text-[#555a72] text-sm">
          Loading trend data…
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
        <div className="h-[140px] flex items-center justify-center text-[#555a72] text-sm">
          No monitors configured. Add endpoints to see health trends.
        </div>
      </div>
    );
  }

  return (
    <div className="chart-section animate-fade">
      {Header}

      <ResponsiveContainer width="100%" height={140}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2e3d" vertical={false} />

          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={[domainMin, domainMax]}
            ticks={xTicks}
            tickFormatter={(ms: number) =>
              new Date(ms).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              })
            }
            stroke="#555a72"
            tick={{ fontSize: 11, fill: '#8b90a7' }}
          />

          <YAxis
            stroke="#555a72"
            tick={{ fontSize: 11, fill: '#8b90a7' }}
            allowDecimals={false}
            width={28}
          />

          <Tooltip content={<CustomTooltip />} />

          {/* Gray shading over gap regions */}
          {gapRegions.map((g, i) => (
            <ReferenceArea
              key={i}
              x1={g.x1}
              x2={g.x2}
              fill="#2a2e3d"
              fillOpacity={0.5}
              strokeOpacity={0}
            />
          ))}

          {/* Up — solid green */}
          <Line
            type="linear"
            dataKey="up"
            stroke="#22c55e"
            strokeWidth={2}
            dot={isSinglePoint ? { r: 4, fill: '#22c55e', strokeWidth: 0 } : false}
            activeDot={{ r: 4 }}
            connectNulls={false}
            isAnimationActive={false}
          />

          {/* Unknown — dashed yellow (only render if has data) */}
          {hasUnknownData && (
            <Line
              type="linear"
              dataKey="unknown"
              stroke="#eab308"
              strokeWidth={2}
              strokeDasharray="4 2"
              strokeOpacity={0.8}
              dot={isSinglePoint ? { r: 4, fill: '#eab308', strokeWidth: 0 } : false}
              activeDot={{ r: 4 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}

          {/* Down — solid red */}
          <Line
            type="linear"
            dataKey="down"
            stroke="#ef4444"
            strokeWidth={2}
            dot={isSinglePoint ? { r: 4, fill: '#ef4444', strokeWidth: 0 } : false}
            activeDot={{ r: 4 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}