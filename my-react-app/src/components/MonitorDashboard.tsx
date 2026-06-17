import { useEffect, useState } from 'react';
import { useMonitorStore } from '../store/monitorStore';
import BulkPasteArea from './BulkAreaPaste';
import MonitorCard from './MonitorCard';
import { RefreshCw } from 'lucide-react';

export default function MonitorDashboard() {
  const { monitors, loading, error, loadMonitors, discover } = useMonitorStore();
  const [autoRefresh, setAutoRefresh] = useState(false);

  // initial load
  useEffect(() => {
    loadMonitors();
  }, []);

  // auto-refresh every 30 s when toggled on
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => loadMonitors(), 30_000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadMonitors]);

  return (
    <div className="dashboard">
      {/* ── Header ── */}
      <div className="dashboard-header">
        <h1 className="dashboard-title">
          <span className="dot" />
          Uptime Monitor
        </h1>

        <div className="header-actions">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>

          <button
            id="btn-refresh"
            onClick={() => loadMonitors()}
            disabled={loading}
            className="btn btn-secondary"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'spinning' : ''}`} size={14} />
            Refresh
          </button>

          <button
            id="btn-scan"
            onClick={() => discover()}
            disabled={loading}
            className="btn btn-success"
          >
            {loading ? 'Scanning…' : 'Scan Tomcat Server'}
          </button>
        </div>
      </div>

      {/* ── Bulk paste panel ── */}
      <div className="panel">
        <p className="panel-title">Add monitors</p>
        <BulkPasteArea />
      </div>

      {/* ── Feedback states ── */}
      {loading && monitors.length === 0 && (
        <div className="msg-loading">Loading monitors…</div>
      )}

      {error && (
        <div className="msg-error">{error}</div>
      )}

      {!loading && monitors.length === 0 && !error && (
        <div className="msg-empty">
          No monitors yet — paste some URLs above or click <strong>Scan Tomcat Server</strong>.
        </div>
      )}

      {/* ── Monitor grid ── */}
      {monitors.length > 0 && (
        <div className="monitor-grid">
          {monitors.map((monitor) => (
            <MonitorCard key={monitor.id} monitor={monitor} />
          ))}
        </div>
      )}
    </div>
  );
}
