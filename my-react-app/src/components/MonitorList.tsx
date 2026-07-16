import { useEffect, useState, useRef } from 'react';
import type { Monitor } from '../api/monitors';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  monitors: Monitor[];
  loading: boolean;
  highlightedId?: string | null;
  onHighlightDone?: () => void;
}

interface CheckHistoryEntry {
  status: string;
  responseTimeMs: number | null;
  checkedAt: string;
}

// ── Relative time ─────────────────────────────────────────────────────────────

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return 'never';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diffMs / 1000);
  if (secs < 5)  return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Inline status sparkline — last N checks, oldest left, newest right ────────

function StatusSparkline({ history }: { history: CheckHistoryEntry[] }) {
  const W = 4;
  const H = 16;
  const GAP = 2;
  const total = history.length;
  if (total === 0) {
    return (
      <svg width={10 * (W + GAP)} height={H} aria-label="No check history" aria-hidden="true">
        {Array.from({ length: 10 }).map((_, i) => (
          <rect key={i} x={i * (W + GAP)} y={4} width={W} height={H - 8}
            fill="var(--border)" rx={1} opacity={0.5} />
        ))}
      </svg>
    );
  }

  return (
    <svg
      width={total * (W + GAP) - GAP}
      height={H}
      aria-label={`Last ${total} checks`}
      aria-hidden="true"
    >
      {history.map((c, i) => {
        const color =
          c.status === 'UP' ? 'var(--status-up)' :
          c.status === 'DOWN' ? 'var(--status-down)' :
          'var(--status-unknown)';
        // Taller bar = higher latency (relative to 500ms cap), floor at 4px
        const latency = c.responseTimeMs ?? 0;
        const barH = Math.max(4, Math.min(H, 4 + (latency / 500) * (H - 4)));
        return (
          <rect
            key={i}
            x={i * (W + GAP)}
            y={H - barH}
            width={W}
            height={barH}
            fill={color}
            rx={1}
            opacity={0.75}
          />
        );
      })}
    </svg>
  );
}

// ── Per-monitor history hook ──────────────────────────────────────────────────

function useMonitorHistory(monitorId: string): CheckHistoryEntry[] {
  const [history, setHistory] = useState<CheckHistoryEntry[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    fetch(`/api/monitors/${monitorId}/history?limit=10`, { signal: controller.signal })
      .then((r) => r.json())
      .then((json) => {
        // Backend returns { history: CheckResult[] } ordered newest first; reverse for sparkline
        const raw: Array<{ status: string; responseTimeMs: number | null; checkedAt: string }> =
          json.history ?? [];
        setHistory([...raw].reverse().slice(-10));
      })
      .catch(() => {/* aborted or network error — leave empty */});

    return () => controller.abort();
  }, [monitorId]);

  return history;
}

// ── Monitor row ───────────────────────────────────────────────────────────────

function MonitorRow({
  monitor,
  index,
  isHighlighted,
  onHighlightDone,
}: {
  monitor: Monitor;
  index: number;
  isHighlighted?: boolean;
  onHighlightDone?: () => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const history = useMonitorHistory(monitor.id);
  const [relTime, setRelTime] = useState(() => relativeTime(monitor.lastChecked));
  const status = monitor.status.toLowerCase() as 'up' | 'down' | 'unknown';

  // Highlight + scroll effect
  useEffect(() => {
    if (isHighlighted && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const t = setTimeout(() => onHighlightDone?.(), 2500);
      return () => clearTimeout(t);
    }
  }, [isHighlighted, onHighlightDone]);

  // Live-update the relative time every 30s
  useEffect(() => {
    setRelTime(relativeTime(monitor.lastChecked));
    const id = setInterval(() => setRelTime(relativeTime(monitor.lastChecked)), 30_000);
    return () => clearInterval(id);
  }, [monitor.lastChecked]);

  // Most-recent latency from the last check in history (newest = last after reverse)
  const latestCheck = history[history.length - 1];
  const latencyMs = latestCheck?.responseTimeMs ?? null;

  return (
    <div
      ref={rowRef}
      className={`monitor-row-compact ${isHighlighted ? 'highlight-row' : ''}`}
      style={{ animationDelay: `${index * 0.025}s` }}
      role="row"
    >
      {/* Status dot — true circle, pulse animation for DOWN */}
      <span
        className={`mrc-dot mrc-dot--${status}`}
        aria-label={`Status: ${monitor.status}`}
        role="img"
      />

      {/* Name + URL */}
      <div className="mrc-identity">
        <span className="mrc-name">{monitor.name}</span>
        <span className="mrc-url">{monitor.url}</span>
      </div>

      {/* Environment pill — rectangular, not circular */}
      <span className={`mrc-env env-${monitor.environment.toLowerCase()}`}>
        {monitor.environment}
      </span>

      {/* Mini sparkline — last 10 checks */}
      <div className="mrc-spark" aria-label="Recent check history">
        <StatusSparkline history={history} />
      </div>

      {/* Latency */}
      <span className="mrc-latency" aria-label={latencyMs !== null ? `${latencyMs}ms latency` : 'No latency data'}>
        {latencyMs !== null ? `${latencyMs}ms` : '—'}
      </span>

      {/* Relative time */}
      <span className="mrc-time" aria-label={`Last checked ${relTime}`}>
        {relTime}
      </span>
    </div>
  );
}

// ── MonitorList ───────────────────────────────────────────────────────────────

const INITIAL_SHOW = 5;

export default function MonitorList({ monitors, loading, highlightedId, onHighlightDone }: Props) {
  const [expanded, setExpanded] = useState(false);

  // When the highlighted row sits beyond the fold, auto-expand so the scroll
  // effect can actually reach it.
  useEffect(() => {
    if (highlightedId) {
      const idx = monitors.findIndex((m) => m.id === highlightedId);
      if (idx >= INITIAL_SHOW) setExpanded(true);
    }
  }, [highlightedId, monitors]);

  if (loading && monitors.length === 0) {
    // Shimmer skeleton — same visual language as hatch bands, not a generic spinner
    return (
      <section className="dash-section" aria-label="Monitored endpoints loading">
        <div className="section-header">
          <div className="section-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            Monitored Endpoints
          </div>
        </div>
        <div className="monitor-list-rows" role="table" aria-label="Monitors loading">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="monitor-row-skeleton" aria-hidden="true" />
          ))}
        </div>
      </section>
    );
  }

  if (monitors.length === 0) {
    return (
      <section className="dash-section">
        <div className="section-header">
          <div className="section-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            Monitored Endpoints
          </div>
        </div>
        <div className="empty-section">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          <p>No monitors yet. Paste URLs above or scan Tomcat.</p>
        </div>
      </section>
    );
  }

  const hiddenCount = monitors.length - INITIAL_SHOW;
  const visibleMonitors = expanded ? monitors : monitors.slice(0, INITIAL_SHOW);

  return (
    <section className="dash-section" aria-label="Monitored endpoints">
      <div className="section-header">
        <div className="section-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          Monitored Endpoints
        </div>
        <div className="section-count">{monitors.length}</div>
      </div>

      <div className="monitor-list-rows" role="table" aria-label="Monitor status list">
        {/* Column header row */}
        <div className="monitor-row-header" role="row" aria-hidden="true">
          <span />
          <span>Name / URL</span>
          <span>Env</span>
          <span>Last 10</span>
          <span>Latency</span>
          <span>Checked</span>
        </div>

        {visibleMonitors.map((m, i) => (
          <MonitorRow
            key={m.id}
            monitor={m}
            index={i}
            isHighlighted={highlightedId === m.id}
            onHighlightDone={onHighlightDone}
          />
        ))}
      </div>

      {monitors.length > INITIAL_SHOW && (
        <div className="show-more-divider">
          <button
            className="show-more-toggle"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? 'Show less' : `Show ${hiddenCount} more`}
          </button>
        </div>
      )}
    </section>
  );
}

