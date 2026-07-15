import { useEffect, useState } from 'react';
import { useDiscoveryStore, type DiscoveredApp } from '../store/discoveryStore';

export default function DiscoveryPanel() {
  const candidates = useDiscoveryStore((s) => s.candidates);
  const loading = useDiscoveryStore((s) => s.loading);
  const error = useDiscoveryStore((s) => s.error);
  const loadCandidates = useDiscoveryStore((s) => s.loadCandidates);
  const promote = useDiscoveryStore((s) => s.promote);
  const promoteAll = useDiscoveryStore((s) => s.promoteAll);
  
  const [scanning, setScanning] = useState(false);
  const [promotingAll, setPromotingAll] = useState(false);

  useEffect(() => { loadCandidates(); }, [loadCandidates]);

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

  const isLoading = loading || scanning;

  const INFRA_PATHS = ['/synctl', '/manager', '/wsastub', '/host-manager'];
  const isInfra = (path: string) => INFRA_PATHS.some(p => path.toLowerCase().includes(p.toLowerCase()));

  const unpromoted = candidates.filter(c => !c.isPromoted);
  const promoted = candidates.filter(c => c.isPromoted);

  const recommended = unpromoted.filter(c =>
    c.tomcatState === 'running' && c.sessions > 0 && !isInfra(c.contextPath)
  );
  const infrastructure = unpromoted.filter(c =>
    !recommended.some(r => r.id === c.id)
  );

  const handlePromoteAll = async () => {
    if (recommended.length === 0) return;
    setPromotingAll(true);
    await promoteAll(recommended);
    setPromotingAll(false);
  };

  const renderCard = (app: DiscoveredApp, i: number, muted = false) => (
    <div 
      key={app.id} 
      className={`discovery-card ${muted ? 'muted' : ''} ${app.isPromoted ? 'promoted' : ''}`}
      style={{ animationDelay: `${i * 0.05}s` }}
    >
      <div className="discovery-path">{app.contextPath}</div>
      <div className="discovery-name">{app.name}</div>
      <div className="discovery-meta">
        <div className={`discovery-state ${app.tomcatState}`}>
          <div className={`state-dot ${app.tomcatState}`} />
          {app.tomcatState} · {app.sessions} sessions
        </div>
        {app.isPromoted ? (
          <span className="btn-action promoted">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Monitored
          </span>
        ) : (
          <button className="btn-action" onClick={() => promote(app)} disabled={loading}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Monitor
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="discovery-panel">
      <div className="discovery-header">
        <h3>Discovery</h3>
        <button 
          className="btn-scan" 
          onClick={handleScan} 
          disabled={isLoading}
        >
          {scanning ? 'Scanning...' : 'Scan'}
        </button>
      </div>

      {error && (
        <div className="discovery-error">{error}</div>
      )}

      {recommended.length > 0 && (
        <div className="discovery-section">
          <div className="discovery-section-header">
            <span>Recommended ({recommended.length})</span>
            <button 
              className="btn-promote-all" 
              onClick={handlePromoteAll}
              disabled={promotingAll || loading}
            >
              {promotingAll ? 'Adding...' : 'Monitor All'}
            </button>
          </div>
          <div className="discovery-grid">
            {recommended.map((app, i) => renderCard(app, i, false))}
          </div>
        </div>
      )}

      {infrastructure.length > 0 && (
        <div className="discovery-section">
          <div className="discovery-section-header">
            <span>Infrastructure ({infrastructure.length})</span>
          </div>
          <div className="discovery-grid">
            {infrastructure.map((app, i) => renderCard(app, i, true))}
          </div>
        </div>
      )}

      {promoted.length > 0 && (
        <div className="discovery-section">
          <div className="discovery-section-header">
            <span>Monitored ({promoted.length})</span>
          </div>
          <div className="discovery-grid">
            {promoted.map((app, i) => renderCard(app, i, false))}
          </div>
        </div>
      )}

      {!isLoading && candidates.length === 0 && (
        <div className="discovery-empty">
          No applications discovered yet. Click Scan to discover Tomcat applications.
        </div>
      )}
    </div>
  );
}