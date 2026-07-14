import type { Monitor } from '../api/monitors';

interface Props {
  monitors: Monitor[];
  loading: boolean;
}

export default function MonitorList({ monitors, loading }: Props) {
  if (monitors.length === 0 && !loading) {
    return (
      <div className="empty-section">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
          <line x1="8" y1="21" x2="16" y2="21"/>
          <line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
        <p>No monitors yet. Paste URLs above or scan Tomcat.</p>
      </div>
    );
  }

  return (
    <section className="dash-section">
      <div className="section-header">
        <div className="section-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
          Monitored Endpoints
        </div>
        <div className="section-count">{monitors.length}</div>
      </div>

      <div className="monitor-grid">
        {monitors.map((m, i) => (
          <div
            key={m.id}
            className="monitor-card-compact"
            style={{ animationDelay: `${i * 0.03}s` }}
          >
            <div className="card-top">
              <div className={`status-indicator ${m.status.toLowerCase()}`} />
              <div className="monitor-name-cell">
                <span className="monitor-name">{m.name}</span>
                <span className="monitor-url">{m.url}</span>
              </div>
              <span className={`env-tag env-${m.environment.toLowerCase()}`}>
                {m.environment}
              </span>
            </div>

            <div className="card-bottom">
              <div className={`status-text ${m.status.toLowerCase()}`}>
                {m.status === 'UP' && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                )}
                {m.status === 'DOWN' && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                  </svg>
                )}
                {m.status === 'UNKNOWN' && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                )}
                {m.status}
              </div>
              <div className="last-check">
                {m.lastChecked
                  ? new Date(m.lastChecked).toLocaleTimeString('en-US', { hour12: false })
                  : 'Never'
                }
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}