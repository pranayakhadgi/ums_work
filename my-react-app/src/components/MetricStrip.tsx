import { useEffect, useState, useRef } from 'react';
import { Activity, Clock, TrendingUp } from 'lucide-react';

// ── CSS token accessor ─────────────────────────────────────────────────────────
function getCssToken(name: string, fallback: string): string {
  if (typeof document !== 'undefined') {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (v) return v;
  }
  return fallback;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HealthBucket {
  t: number;
  timestamp: string;
  up: number;
  down: number;
  unknown: number;
  total: number;
  avgLatency?: number;
  p95Latency?: number;
  healthScore?: number;
  degradedRate?: number;
  downRate?: number;
}

interface Props {
  buckets: HealthBucket[];
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

// ── Inline Sparkline ──────────────────────────────────────────────────────────

interface SparklineProps {
  values: number[];
  color: string;
  /** explicit range — if omitted, derived from values */
  minVal?: number;
  maxVal?: number;
}

function InlineSparkline({ values, color, minVal, maxVal }: SparklineProps) {
  if (!values.length) return null;

  const min = minVal ?? Math.min(...values);
  const max = maxVal ?? Math.max(...values, min + 1); // avoid div/0
  const range = max - min || 1;
  const W = values.length;
  const H = 16;
  const BAR_W = 0.7;

  return (
    <svg
      width={W * 2}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden="true"
      className="ms-sparkline"
    >
      {values.map((v, i) => {
        const barH = Math.max(((v - min) / range) * H, 1);
        return (
          <rect
            key={i}
            x={i + (1 - BAR_W) / 2}
            y={H - barH}
            width={BAR_W}
            height={barH}
            fill={color}
            opacity={0.55}
          />
        );
      })}
    </svg>
  );
}

// ── Pill Component ────────────────────────────────────────────────────────────

interface PillProps {
  label: string;
  icon: React.ReactNode;
  value: number;
  unit?: string;
  sparkValues: number[];
  color: string;
  /** Optional colour override for the value text */
  valueColor?: string;
  ariaLabel: string;
}

function MetricPill({
  label,
  icon,
  value,
  unit = '',
  sparkValues,
  color,
  valueColor,
  ariaLabel,
}: PillProps) {
  const animated = useCountUp(value);

  return (
    <div
      className="ms-pill"
      role="meter"
      aria-label={ariaLabel}
      aria-valuenow={value}
    >
      <div className="ms-pill-icon" aria-hidden="true">{icon}</div>
      <span className="ms-pill-label">{label}</span>
      <InlineSparkline values={sparkValues} color={color} />
      <span
        className="ms-pill-value"
        style={valueColor ? { color: valueColor } : undefined}
      >
        {animated}{unit}
      </span>
    </div>
  );
}

// ── MetricStrip ───────────────────────────────────────────────────────────────

export default function MetricStrip({ buckets }: Props) {
  if (!buckets.length) return null;

  // Use only buckets that have data (total > 0) for latency/score
  const dataBuckets = buckets.filter((b) => b.total > 0);

  // Current values = last data bucket (most recent)
  const latest = dataBuckets[dataBuckets.length - 1];
  const avgLatency = latest?.avgLatency ?? 0;
  const healthScore = latest?.healthScore ?? 100;

  // Uptime % across the window: sum(up) / sum(total)
  const totalUp = buckets.reduce((s, b) => s + b.up, 0);
  const totalAll = buckets.reduce((s, b) => s + b.total, 0);
  const uptimePct = totalAll > 0 ? Math.round((totalUp / totalAll) * 100) : 100;

  // Sparkline value arrays — use all 30 buckets (zeros for empty ones)
  const latencyValues = buckets.map((b) => b.avgLatency ?? 0);
  const scoreValues = buckets.map((b) => b.healthScore ?? 100);
  const uptimeValues = buckets.map((b) =>
    b.total > 0 ? Math.round((b.up / b.total) * 100) : 100,
  );

  // Colour the latency pill by severity — use CSS tokens not hardcoded hex
  const colorUp      = 'var(--status-up)';
  const colorDown    = 'var(--status-down)';
  const colorUnknown = 'var(--status-unknown)';

  let latencyColor = colorUp; // good
  if (avgLatency > 1000) latencyColor = colorDown;
  else if (avgLatency > 400) latencyColor = colorUnknown;

  // Colour the score pill by value
  let scoreColor = colorUp;
  if (healthScore < 50) scoreColor = colorDown;
  else if (healthScore < 75) scoreColor = colorUnknown;

  return (
    <div
      className="metric-strip"
      role="region"
      aria-label="System health metrics strip"
    >
      <MetricPill
        label="Avg latency"
        icon={<Clock size={12} strokeWidth={2} color={latencyColor} />}
        value={avgLatency}
        unit="ms"
        sparkValues={latencyValues}
        color={latencyColor}
        valueColor={latencyColor}
        ariaLabel={`Average latency: ${avgLatency}ms`}
      />

      <div className="ms-divider" aria-hidden="true" />

      <MetricPill
        label="Health score"
        icon={<Activity size={12} strokeWidth={2} color={scoreColor} />}
        value={healthScore}
        unit="/100"
        sparkValues={scoreValues}
        color={scoreColor}
        valueColor={scoreColor}
        ariaLabel={`Health score: ${healthScore} out of 100`}
      />

      <div className="ms-divider" aria-hidden="true" />

      <MetricPill
        label="Uptime"
        icon={<TrendingUp size={12} strokeWidth={2} color={getCssToken('--accent', '#4f6ef7')} />}
        value={uptimePct}
        unit="%"
        sparkValues={uptimeValues}
        color={getCssToken('--accent', '#4f6ef7')}
        ariaLabel={`Uptime: ${uptimePct}% over last 30 minutes`}
      />
    </div>
  );
}

