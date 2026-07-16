import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Customized,
} from 'recharts';
import { Clock } from 'lucide-react';
import { MONITOR_MS, POLL_BUFFER_MS } from '../api/intervals';

// ── Types ──────────────────────────────────────────────────────────────────────

interface HealthPoint {
  timestamp: string;
  t: number;
  up: number;
  down: number;
  unknown: number;
  total: number;
  healthScore?: number;
  avgLatency?: number;
  p95Latency?: number;
  degradedRate?: number;
  downRate?: number;
  errorBreakdown?: Record<string, number>;
}

/**
 * Internal chart row.
 * - Rate fields (upRate/downRate/unknownRate) are 0–100 and drive the plotted lines.
 *   null means gap sentinel — Recharts will break the line here.
 * - Raw counts (up/down/unknown/totalCount) are kept only for tooltip display.
 */
interface ChartRow {
  t: number;
  // Plotted values — rates (0-100) or null for gap break sentinels
  upRate: number | null;
  downRate: number | null;
  unknownRate: number | null;
  // Raw counts for tooltip
  up?: number;
  down?: number;
  unknown?: number;
  totalCount?: number;
  // Extra fields for expanded tooltip
  healthScore?: number;
  avgLatency?: number;
  p95Latency?: number;
  errorBreakdown?: Record<string, number>;
  timestamp?: string;
  isSynthetic?: boolean;
}

interface Props {
  monitors: { id: string; status: string; lastChecked: string | null }[];
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  row: ChartRow | null;
  expanded: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Convert raw counts to 0–100 rate, or null if no checks in bucket. */
function toRate(count: number, total: number): number | null {
  return total > 0 ? Math.round((count / total) * 100) : null;
}

// ── Count-Up Hook ─────────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 150): number {
  const [value, setValue] = useState(target);
  const prevRef = useRef(target);

  useEffect(() => {
    const from = prevRef.current;
    if (from === target) return;
    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (progress < 1) requestAnimationFrame(animate);
      else prevRef.current = target;
    };
    requestAnimationFrame(animate);
  }, [target, duration]);

  return value;
}

// ── CSS token constants for use in Recharts SVG props ─────────────────────────

function getCssVar(name: string, fallback: string): string {
  if (typeof document !== 'undefined') {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (v) return v;
  }
  return fallback;
}

const C = {
  up:       () => getCssVar('--status-up',      '#22c55e'),
  down:     () => getCssVar('--status-down',    '#ef4444'),
  unknown:  () => getCssVar('--status-unknown', '#eab308'),
  border:   () => getCssVar('--border',         '#2a2e3d'),
  textSec:  () => getCssVar('--text-secondary', '#8b90a7'),
  textMut:  () => getCssVar('--text-muted',     '#555a72'),
};

// ── Chart Definitions (gradients) ─────────────────────────────────────────────

function ChartDefs() {
  const up      = C.up();
  const down    = C.down();
  const unknown = C.unknown();
  const textSec = C.textSec();

  return (
    <defs>
      <linearGradient id="grad-up" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={up} stopOpacity={0.35} />
        <stop offset="100%" stopColor={up} stopOpacity={0.02} />
      </linearGradient>
      <linearGradient id="grad-down" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={down} stopOpacity={0.35} />
        <stop offset="100%" stopColor={down} stopOpacity={0.02} />
      </linearGradient>
      <linearGradient id="grad-unknown" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={unknown} stopOpacity={0.25} />
        <stop offset="100%" stopColor={unknown} stopOpacity={0.02} />
      </linearGradient>
      <pattern id="hatch-unknown" patternUnits="userSpaceOnUse" width="4" height="4">
        <path d="M-1,1 l2,-2 M0,4 l4,-4 M3,5 l2,-2" stroke={textSec} strokeWidth={0.5} opacity={0.3} />
      </pattern>
    </defs>
  );
}

// ── Tooltip Card ──────────────────────────────────────────────────────────────

interface TooltipCardProps {
  state: TooltipState;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onToggleExpand: () => void;
}

function TooltipCard({ state, containerRef, onToggleExpand }: TooltipCardProps) {
  if (!state.visible || !state.row) return null;

  const row = state.row;
  const total = row.totalCount || 0;
  const upPct = total > 0 ? Math.round(((row.up || 0) / total) * 100) : 0;
  const downPct = total > 0 ? Math.round(((row.down || 0) / total) * 100) : 0;
  const unknownPct = total > 0 ? Math.round(((row.unknown || 0) / total) * 100) : 0;

  return (
    <div
      className={`chart-tooltip ${state.expanded ? 'expanded' : ''}`}
      style={{
        position: 'absolute',
        left: state.x,
        top: state.y,
        pointerEvents: 'auto',
      }}
    >
      <div className="tooltip-header" onClick={onToggleExpand}>
        <Clock size={12} />
        <span>
          {row.timestamp
            ? new Date(row.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
            : 'Now'}
        </span>
        {row.isSynthetic && <span className="tooltip-synthetic">Live</span>}
      </div>

      <div className="tooltip-body">
        <div className="tooltip-row">
          <span className="dot" style={{ background: C.up() }} />
          <span>Up</span>
          <span className="value">{row.up || 0} ({upPct}%)</span>
        </div>
        <div className="tooltip-row">
          <span className="dot" style={{ background: C.down() }} />
          <span>Down</span>
          <span className="value">{row.down || 0} ({downPct}%)</span>
        </div>
        {row.unknown ? (
          <div className="tooltip-row">
            <span className="dot" style={{ background: C.unknown() }} />
            <span>Unknown</span>
            <span className="value">{row.unknown} ({unknownPct}%)</span>
          </div>
        ) : null}

        {state.expanded && (
          <>
            {typeof row.healthScore === 'number' && (
              <div className="tooltip-row">
                <span>Health Score</span>
                <span className="value">{row.healthScore}</span>
              </div>
            )}
            {typeof row.avgLatency === 'number' && (
              <div className="tooltip-row">
                <span>Avg Latency</span>
                <span className="value">{row.avgLatency}ms</span>
              </div>
            )}
            {typeof row.p95Latency === 'number' && (
              <div className="tooltip-row">
                <span>P95 Latency</span>
                <span className="value">{row.p95Latency}ms</span>
              </div>
            )}
            {row.errorBreakdown && Object.keys(row.errorBreakdown).length > 0 && (
              <div className="tooltip-errors">
                {Object.entries(row.errorBreakdown).map(([cat, count]) => (
                  <div key={cat} className="tooltip-error-row">
                    <span>{cat}</span>
                    <span>{count}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {!state.expanded && (
          <div className="tooltip-hint">Click to expand</div>
        )}
      </div>
    </div>
  );
}

// ── Hatch Bands for unknown regions ───────────────────────────────────────────

interface HatchBandsProps {
  formattedGraphicalItems: any[];
  offset: number;
}

function HatchBands({ formattedGraphicalItems, offset }: HatchBandsProps) {
  if (!formattedGraphicalItems || formattedGraphicalItems.length === 0) return null;

  // Find the unknown area's graphical items
  const unknownItem = formattedGraphicalItems.find(
    (item: any) => item?.dataKey === 'unknownRate'
  );
  if (!unknownItem?.points || unknownItem.points.length === 0) return null;

  const points: Array<{ x: number; y: number }> = unknownItem.points;
  const bands: Array<{ x: number; width: number }> = [];
  let currentBand: { x: number; width: number } | null = null;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.y != null && p.y > 0) {
      const x = p.x - offset;
      if (!currentBand) {
        currentBand = { x, width: 1 };
      } else {
        currentBand.width += 1;
      }
    } else {
      if (currentBand) {
        bands.push(currentBand);
        currentBand = null;
      }
    }
  }
  if (currentBand) bands.push(currentBand);

  return (
    <g>
      {bands.map((band, i) => (
        <rect
          key={i}
          x={band.x}
          y={0}
          width={band.width}
          height={300}
          fill="url(#hatch-unknown)"
          opacity={0.4}
        />
      ))}
    </g>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

function HeartbeatChart({ monitors }: Props) {
  const [history, setHistory] = useState<HealthPoint[]>([]);
  const [firstFetchDone, setFirstFetchDone] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    row: null,
    expanded: false,
  });
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch aggregate health history
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch('/api/monitors/aggregate/health?window=4&bucket=5');
        if (!res.ok) return;
        const json = await res.json();
        setHistory(json.data ?? []);
        setFirstFetchDone(true);
      } catch {
        // non-fatal
      }
    };
    fetchHistory();
    const interval = setInterval(fetchHistory, 120_000);
    return () => clearInterval(interval);
  }, []);

  // Synthetic current-health point from live monitor props
  const currentHealth = useMemo<ChartRow | null>(() => {
    if (monitors.length === 0) return null;
    const up = monitors.filter(m => m.status === 'UP').length;
    const down = monitors.filter(m => m.status === 'DOWN').length;
    const unknown = monitors.filter(m => m.status === 'UNKNOWN').length;
    const total = monitors.length;
    return {
      t: Date.now(),
      upRate: total > 0 ? Math.round((up / total) * 100) : null,
      downRate: total > 0 ? Math.round((down / total) * 100) : null,
      unknownRate: total > 0 ? Math.round((unknown / total) * 100) : null,
      up,
      down,
      unknown,
      totalCount: total,
      isSynthetic: true,
    };
  }, [monitors]);

  const toggleExpand = useCallback(() => {
    setTooltip(prev => ({ ...prev, expanded: !prev.expanded }));
  }, []);

  const { chartData, hasUnknownData, isSinglePoint } = useMemo(() => {
    const base: ChartRow[] = history.map((h) => {
      const total = h.total || 0;
      return {
        t: h.t,
        upRate: toRate(h.up, total),
        downRate: toRate(h.down, total),
        unknownRate: toRate(h.unknown, total),
        up: h.up,
        down: h.down,
        unknown: h.unknown,
        totalCount: h.total,
        healthScore: h.healthScore,
        avgLatency: h.avgLatency,
        p95Latency: h.p95Latency,
        errorBreakdown: h.errorBreakdown,
        timestamp: h.timestamp,
      };
    });

    if (currentHealth) {
      base.push(currentHealth);
    }

    const hasUnknownData = base.some(r => (r.unknown ?? 0) > 0);
    const isSinglePoint = base.length === 1;

    return { chartData: base, hasUnknownData, isSinglePoint };
  }, [history, currentHealth]);

  // Shimmer gate
  if (!firstFetchDone) {
    return (
      <div className="dash-section">
        <div className="section-header">
          <div className="section-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            Health Trend
          </div>
        </div>
        <div className="chart-skeleton" />
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="dash-section">
        <div className="section-header">
          <div className="section-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            Health Trend
          </div>
        </div>
        <div className="empty-section">
          <p>No health data available.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dash-section" ref={containerRef}>
      <div className="section-header">
        <div className="section-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          Health Trend
        </div>
      </div>

      <div className="chart-wrapper">
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart
            data={chartData}
            animationDuration={0}
            animationEasing="linear"
            margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
            onClick={(state: any) => {
              if (state && state.activePayload && state.activePayload[0]) {
                const payload = state.activePayload[0].payload as ChartRow;
                setTooltip({
                  visible: true,
                  x: state.chartX + 12,
                  y: state.chartY - 12,
                  row: payload,
                  expanded: false,
                });
              } else {
                setTooltip(prev => ({ ...prev, visible: false }));
              }
            }}
          >
            <ChartDefs />

            <CartesianGrid strokeDasharray="3 3" stroke={C.border()} vertical={false} />

            <XAxis
              dataKey="t"
              type="category"
              tickFormatter={(ms: number) =>
                new Date(ms).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                })
              }
              stroke={C.textMut()}
              tick={{ fontSize: 11, fill: C.textSec() }}
            />

            <YAxis
              domain={[0, 100]}
              tickFormatter={(v: number) => `${v}%`}
              stroke={C.textMut()}
              tick={{ fontSize: 11, fill: C.textSec() }}
              width={40}
            />

            {/* Unknown % — rendered first so it sits behind */}
            {hasUnknownData && (
              <Area
                type="monotoneX"
                dataKey="unknownRate"
                stroke={C.unknown()}
                strokeWidth={1}
                fill="url(#grad-unknown)"
                dot={false}
                activeDot={false}
                connectNulls={false}
                isAnimationActive={false}
                aria-label="Percentage of monitors unknown over time"
              />
            )}

            {/* Up % */}
            <Area
              type="monotoneX"
              dataKey="upRate"
              stroke={C.up()}
              strokeWidth={2}
              fill="url(#grad-up)"
              dot={false}
              activeDot={{ r: 3, fill: C.up(), strokeWidth: 0 }}
              connectNulls={false}
              isAnimationActive={false}
              aria-label="Percentage of monitors up over time"
            />

            {/* Down % — spike dots on non-zero buckets */}
            <Area
              type="monotoneX"
              dataKey="downRate"
              stroke={C.down()}
              strokeWidth={2}
              fill="url(#grad-down)"
              dot={false}
              activeDot={{ r: 4, fill: C.down(), strokeWidth: 0 }}
              connectNulls={false}
              isAnimationActive={false}
              aria-label="Percentage of monitors down over time"
            />

            <Customized
              component={(props: any) => (
                <HatchBands
                  formattedGraphicalItems={props.formattedGraphicalItems}
                  offset={props.offset}
                />
              )}
            />
          </ComposedChart>
        </ResponsiveContainer>

        <TooltipCard
          state={tooltip}
          containerRef={containerRef}
          onToggleExpand={toggleExpand}
        />
      </div>
    </div>
  );
}

export default React.memo(HeartbeatChart);

