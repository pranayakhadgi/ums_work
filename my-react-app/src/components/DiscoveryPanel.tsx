import { useEffect, useState, useRef, useCallback } from 'react';
import { useDiscoveryStore, type DiscoveredApp } from '../store/discoveryStore';
import { useMonitorStore } from '../store/monitorStore';
import { Eye, CheckCircle2 } from 'lucide-react';

interface Props {
  highlightedId?: string | null;
  onHighlightDone?: () => void;
}

const INITIAL_SHOW = 5;

export default function DiscoveryPanel({ highlightedId, onHighlightDone }: Props) {
  const candidates = useDiscoveryStore((s) => s.candidates);
  const loading = useDiscoveryStore((s) => s.loading);
  const error = useDiscoveryStore((s) => s.error);
  const loadCandidates = useDiscoveryStore((s) => s.loadCandidates);
  const promote = useDiscoveryStore((s) => s.promote);
  const promoteAll = useDiscoveryStore((s) => s.promoteAll);

  const loadMonitors = useMonitorStore((s) => s.loadMonitors);

  const [scanning, setScanning] = useState(false);
  const [promotingAll, setPromotingAll] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // ── Optimistic promotion ───────────────────────────────────────────────────
  // The store's promote() calls loadCandidates() internally, which replaces
  // the candidates array wholesale. We track locally-promoted IDs so the row
  // can show the "Monitored" state immediately, before the server round-trip
  // and store refresh complete.
  const [optimisticPromoted, setOptimisticPromoted] = useState<Set<string>>(new Set());

  const markOptimistic = useCallback((id: string) => {
    setOptimisticPromoted((prev) => new Set(prev).add(id));
  }, []);

  // ── Stable sort ────────────────────────────────────────────────────────────
  // We compute the display order once when candidates first arrive (or after a
  // deliberate Scan). Individual promotions must not re-sort the table, which
  // would cause promoted rows to jump position.
  //
  // stableOrderRef holds [id, …] in the last computed sort order.
  // We only rebuild it when the set of IDs changes by more than just
  // isPromoted flipping (i.e. a real scan brought new/removed apps).
  const stableOrderRef = useRef<string[]>([]);
  const prevIdSetRef = useRef<string>('');

  const INFRA_PATHS = ['/synctl', '/manager', '/wsastub', '/host-manager'];
  const isInfra = (path: string) =>
    INFRA_PATHS.some((p) => path.toLowerCase().includes(p.toLowerCase()));

  // Rebuild stable order only when the ID set itself changes.
  const currentIdSet = candidates.map((c) => c.id).sort().join(',');
  if (currentIdSet !== prevIdSetRef.current) {
    prevIdSetRef.current = currentIdSet;

    const sorted = [...candidates].sort((a, b) => {
      const aActionable = a.tomcatState === 'running' && !a.isPromoted;
      const bActionable = b.tomcatState === 'running' && !b.isPromoted;
      if (aActionable && !bActionable) return -1;
      if (!aActionable && bActionable) return 1;

      const aPromotedRunning = a.tomcatState === 'running' && a.isPromoted;
      const bPromotedRunning = b.tomcatState === 'running' && b.isPromoted;
      if (aPromotedRunning && !bPromotedRunning) return -1;
      if (!aPromotedRunning && bPromotedRunning) return 1;

      return 0;
    });
    stableOrderRef.current = sorted.map((c) => c.id);
  }

  // Build the display list: IDs in stable order, with optimistic overlay applied.
  const candidateMap = new Map(candidates.map((c) => [c.id, c]));
  const sortedCandidates: DiscoveredApp[] = stableOrderRef.current
    .filter((id) => candidateMap.has(id))
    .map((id) => {
      const app = candidateMap.get(id)!;
      // Apply optimistic isPromoted without mutating the store object.
      return optimisticPromoted.has(app.id) ? { ...app, isPromoted: true } : app;
    });

  // ── Expand when highlighted row is beyond the fold ─────────────────────────
  useEffect(() => {
    if (highlightedId) {
      const idx = sortedCandidates.findIndex((c) => c.id === highlightedId);
      if (idx >= INITIAL_SHOW) setExpanded(true);
    }
    // sortedCandidates intentionally excluded — we only want to react to a new highlightedId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightedId]);

  // ── Scroll-to-row on highlight ─────────────────────────────────────────────
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  useEffect(() => {
    if (highlightedId && rowRefs.current.has(highlightedId)) {
      const row = rowRefs.current.get(highlightedId)!;
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const timer = setTimeout(() => onHighlightDone?.(), 2500);
      return () => clearTimeout(timer);
    }
  }, [highlightedId, onHighlightDone]);

  useEffect(() => { loadCandidates(); }, [loadCandidates]);

  const handleScan = async () => {
    setScanning(true);
    // A deliberate scan resets optimistic state — fresh data coming in.
    setOptimisticPromoted(new Set());
    try {
      const res = await fetch('/api/discovery', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Scan failed' }));
        console.error('[DiscoveryPanel] Scan failed:', err);
      }
    } catch (e) {
      console.error('[DiscoveryPanel] Scan error:', e);
    } finally {
      await loadCandidates();
      setScanning(false);
    }
  };

  const isLoading = loading || scanning;

  const unpromoted = candidates.filter((c) => !c.isPromoted && !optimisticPromoted.has(c.id));
  const recommended = unpromoted.filter(
    (c) => c.tomcatState === 'running' && c.sessions > 0 && !isInfra(c.contextPath)
  );

  const handlePromoteAll = async () => {
    if (recommended.length === 0) return;
    setPromotingAll(true);
    // Optimistically mark all recommended apps immediately.
    setOptimisticPromoted((prev) => {
      const next = new Set(prev);
      recommended.forEach((c) => next.add(c.id));
      return next;
    });
    await promoteAll(recommended);
    loadMonitors();
    setPromotingAll(false);
  };

  const hiddenCount = sortedCandidates.length - INITIAL_SHOW;
  const visibleCandidates = expanded ? sortedCandidates : sortedCandidates.slice(0, INITIAL_SHOW);

  return (
    <div className="discovery-panel">
      <div className="discovery-header section-header">
        <div className="section-title">
          Discovered Applications
          <span className="section-count">({candidates.length})</span>
        </div>
        <div className="section-actions">
          {recommended.length > 0 && (
            <button
              className="btn-scan"
              onClick={handlePromoteAll}
              disabled={promotingAll || loading}
            >
              {promotingAll ? 'Adding...' : 'Monitor All Running'}
            </button>
          )}
          <button className="btn-scan" onClick={handleScan} disabled={isLoading}>
            {scanning ? 'Scanning...' : 'Scan'}
          </button>
        </div>
      </div>

      {error && <div className="discovery-error error-banner">{error}</div>}

      <div className="discovery-table-wrapper">
        <table className="discovery-table">
          <thead>
            <tr>
              <th>Application</th>
              <th>State</th>
              <th style={{ textAlign: 'right' }}>Sessions</th>
              <th>Status</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && candidates.length === 0 ? (
              <>
                <tr className="discovery-skeleton-row"><td colSpan={5}></td></tr>
                <tr className="discovery-skeleton-row"><td colSpan={5}></td></tr>
                <tr className="discovery-skeleton-row"><td colSpan={5}></td></tr>
              </>
            ) : candidates.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: 0 }}>
                  <div className="empty-section">
                    <p>No applications discovered yet. Click Scan to discover Tomcat applications.</p>
                  </div>
                </td>
              </tr>
            ) : (
              visibleCandidates.map((app) => (
                <tr
                  key={app.id}
                  ref={(el) => { if (el) rowRefs.current.set(app.id, el); }}
                  className={highlightedId === app.id ? 'highlight-row' : ''}
                >
                  <td className="app-cell">
                    <span className="app-name">{app.name}</span>
                    <span className="app-path">{app.contextPath}</span>
                  </td>
                  <td>
                    <span
                      className={`state-dot ${app.tomcatState === 'running' ? 'running' : 'stopped'}`}
                      title={app.tomcatState}
                    />
                  </td>
                  <td className="sessions-cell">{app.sessions}</td>
                  <td>
                    {app.isPromoted ? (
                      <span className="monitor-badge monitored">Monitored</span>
                    ) : null}
                  </td>
                  <td>
                    {app.isPromoted ? (
                      <span className="icon-btn state-monitored">
                        <CheckCircle2 size={16} />
                      </span>
                    ) : (
                      <button
                        className="icon-btn action-monitor"
                        onClick={async () => {
                          // Optimistic update first — row changes in-place immediately.
                          markOptimistic(app.id);
                          await promote(app);
                          loadMonitors();
                        }}
                        disabled={loading}
                        title="Monitor"
                      >
                        <Eye size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {sortedCandidates.length > INITIAL_SHOW && (
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
    </div>
  );
}
