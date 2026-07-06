import { useEffect, useState } from 'react';
import { useDiscoveryStore, type DiscoveredApp } from '../store/discoveryStore';

export default function DiscoveryPanel() {
  const candidates = useDiscoveryStore((s) => s.candidates);
  const loading = useDiscoveryStore((s) => s.loading);
  const error = useDiscoveryStore((s) => s.error);
  const loadCandidates = useDiscoveryStore((s) => s.loadCandidates);
  const promote = useDiscoveryStore((s) => s.promote);
  const [scanning, setScanning] = useState(false);

  useEffect(() => { loadCandidates(); }, []);

  const handleScan = async () => {
    setScanning(true);
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

  const handlePromote = async (app: DiscoveredApp) => {
    await promote(app);
  };

  const isLoading = loading || scanning;

  return (
    <section className="dash-section">
      <div className="section-header">
        <div className="section-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          Discovered Applications
        </div>
        <div className="section-actions">
          <div className="section-count">{candidates.length}</div>
          <button 
            className="btn-scan"
            onClick={handleScan}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="spinning">
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/>
                </svg>
                Scanning...
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/>
                </svg>
                Scan
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          {error}
        </div>
      )}

      {candidates.length === 0 ? (
        <div className="empty-section">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <p>No applications found. Click Scan to discover from Tomcat.</p>
        </div>
      ) : (
        <div className="discovery-grid">
          {candidates.map((app, i) => (
            <div 
              key={app.id} 
              className={`discovery-card ${app.isPromoted ? 'promoted' : ''}`}
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className="discovery-path">{app.contextPath}</div>
              <div className="discovery-name">{app.name}</div>
              <div className="discovery-meta">
                <div className={`discovery-state ${app.tomcatState}`}>
                  <div className={`state-dot ${app.tomcatState}`} />
                  {app.tomcatState}
                </div>
                {app.isPromoted ? (
                  <span className="btn-action promoted">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    Monitored
                  </span>
                ) : (
                  <button 
                    className="btn-action"
                    onClick={() => handlePromote(app)}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Monitor
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}