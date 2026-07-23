import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useMonitorStore } from '../store/monitorStore';
import { useDiscoveryStore } from '../store/discoveryStore';
import { useInstanceStore } from '../store/instanceStore';
import InstanceHealth from './InstanceHealth';
import JvmMetrics from './JvmMetrics';
import DiscoveryPanel from './DiscoveryPanel';
import MonitorList from './MonitorList';
import HealthSummary from './HealthSummary';
import CommandBar from './CommandBar';
import AddInstanceModal from './AddInstanceModal';
import './Dashboard.css';
import { DISCOVERY_MS, MONITOR_MS, POLL_BUFFER_MS } from '../api/intervals';
import { ChevronDown, Plus, Loader2 } from 'lucide-react';
import { Toaster } from 'sonner';

const ClockDisplay = React.memo(() => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="clock">
      {time.toLocaleTimeString('en-US', { hour12: true })}
    </div>
  );
});

export default function MonitorDashboard() {
  const { monitors, loading, loadMonitors } = useMonitorStore();
  const { loadCandidates, candidates } = useDiscoveryStore();
  const { instances, currentInstanceId, loadInstances, setCurrentInstance } = useInstanceStore();

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedMonitorId, setHighlightedMonitorId] = useState<string | null>(null);
  const [highlightedDiscoveredId, setHighlightedDiscoveredId] = useState<string | null>(null);
  const [lastMonitorPushAt, setLastMonitorPushAt] = useState<number>(0);
  const [lastDiscoveryPushAt, setLastDiscoveryPushAt] = useState<number>(0);
  const [wsConnected, setWsConnected] = useState(false);
  const [appLoading, setAppLoading] = useState(false);
  const [showAddInstance, setShowAddInstance] = useState(false);

  const currentInstance = instances.find(i => i.id === currentInstanceId) ?? null;

  // Fetch all data scoped to the current instance
  const fetchAllForInstance = useCallback((instId: string | null) => {
    const id = instId ?? undefined;
    loadMonitors(id);
    loadCandidates(id);
  }, [loadMonitors, loadCandidates]);

  // When the selected instance changes, re-fetch all data
  useEffect(() => {
    fetchAllForInstance(currentInstanceId);
  }, [currentInstanceId, fetchAllForInstance]);

  const handleInstanceChange = (id: string) => {
    if (id === currentInstanceId) return;
    setCurrentInstance(id);
    setAppLoading(true);
    setTimeout(() => setAppLoading(false), 600);
  };

  // Load instances on mount
  useEffect(() => {
    loadInstances();
  }, [loadInstances]);

  // Initial monitors + candidates fetch is handled by the currentInstanceId effect above.

  useEffect(() => {
    const socket = new WebSocket('ws://localhost:3001');

    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'CHECK_BATCH_COMPLETE' || msg.type === 'STATE_TRANSITION') {
        loadMonitors(currentInstanceId ?? undefined);
        setLastMonitorPushAt(Date.now());
      }
    };

    socket.onopen = () => {
      console.log('[ws] Connected');
      setWsConnected(true);
      setLastMonitorPushAt(Date.now());
      setLastDiscoveryPushAt(Date.now());
    };

    socket.onclose = () => {
      console.log('[ws] Disconnected');
      setWsConnected(false);
    };

    socket.onerror = (err) => {
      console.log('[ws] Error: ', err);
      setWsConnected(false);
    };

    return () => socket.close();
  }, [loadMonitors, currentInstanceId]);

    useEffect(() => {
    const interval = setInterval(() => {
      const sinceLastPush = Date.now() - lastMonitorPushAt;
      const gracePeriod = MONITOR_MS + POLL_BUFFER_MS;

      if (sinceLastPush > gracePeriod) {
        loadMonitors(currentInstanceId ?? undefined);
      }
    }, MONITOR_MS + POLL_BUFFER_MS);
    return () => clearInterval(interval);
  }, [loadMonitors, lastMonitorPushAt, currentInstanceId]);

    useEffect(() => {
    const interval = setInterval(() => {
      const sinceLastPush = Date.now() - lastDiscoveryPushAt;
      const gracePeriod = MONITOR_MS + POLL_BUFFER_MS;

      if (sinceLastPush > gracePeriod) {
        loadCandidates(currentInstanceId ?? undefined);
      }
    }, DISCOVERY_MS + POLL_BUFFER_MS);
    return () => clearInterval(interval);
  }, [loadCandidates, lastDiscoveryPushAt, currentInstanceId]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setSearchOpen(true);
    }
    if (e.key === 'Escape') setSearchOpen(false);
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Searchable index — filtered hits for both monitors and discovered apps
  const searchItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];

    const monitorHits = monitors
      .filter(m => m.name.toLowerCase().includes(q) || m.url.toLowerCase().includes(q))
      .map(m => ({
        type: 'monitor' as const,
        id: m.id,
        title: m.name,
        subtitle: m.url,
        status: m.status,
      }));

    const discoveredHits = candidates
      .filter(c => !c.isPromoted)
      .filter(c => c.name.toLowerCase().includes(q) || c.contextPath.toLowerCase().includes(q))
      .map(c => ({
        type: 'discovered' as const,
        id: c.id,
        title: c.name,
        subtitle: c.contextPath,
        status: c.tomcatState,
      }));

    return [...monitorHits, ...discoveredHits].slice(0, 10);
  }, [searchQuery, monitors, candidates]);

  const handleSelectResult = (item: { type: 'monitor' | 'discovered'; id: string }) => {
    setSearchOpen(false);
    setSearchQuery('');
    if (item.type === 'monitor') {
      setHighlightedMonitorId(item.id);
    } else {
      setHighlightedDiscoveredId(item.id);
    }
  };

  // (filteredMonitors removed — MonitorList receives the full monitors array;
  //  search highlighting is handled via highlightedMonitorId)

  return (
    <div className="dashboard-shell">
      <div className="dashboard">
        <header className="dash-header">
          <div className="dash-header-inner">
            <div className="brand">
              <img src="/public/wiab-logo.png" className="brand-logo" alt="Uptime Monitor" />
              <div className="brand-text">
                <div className="brand-title">Uptime Monitor</div>
                <div className="brand-sub">Tomcat Health Dashboard</div>
              </div>
            </div>

            {/* Instance selector */}
            <div className="instance-selector">
              <div className="instance-dropdown-wrapper">
                <ChevronDown size={14} className="instance-chevron" aria-hidden="true" />
                <select
                  className="instance-select"
                  value={currentInstanceId ?? ''}
                  onChange={e => handleInstanceChange(e.target.value)}
                  aria-label="Select Tomcat instance"
                  disabled={instances.length === 0}
                >
                  {instances.length === 0 ? (
                    <option value="">No instances</option>
                  ) : (
                    instances.map(inst => (
                      <option key={inst.id} value={inst.id}>
                        {inst.name}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <button
                className="btn btn-icon"
                onClick={() => setShowAddInstance(true)}
                title="Add new instance"
                aria-label="Add new instance"
                type="button"
              >
                <Plus size={16} />
              </button>
            </div>

            <div className="header-right">
              <div className="live-badge">
                <span className={`pulse-dot ${wsConnected ? 'connected' : ''}`} />
                {wsConnected ? 'Live' : 'Offline'}
              </div>
              <ClockDisplay />
            </div>
          </div>
        </header>

        {currentInstance && (
          <div className="env-title-banner">
            <h1>{currentInstance.name}</h1>
          </div>
        )}

        <CommandBar onClick={() => setSearchOpen(true)} />

      <main className="dash-main">
        {appLoading ? (
          <div className="app-loading-state">
            <Loader2 size={32} className="spinner-icon" />
            <p>Loading {currentInstance?.name ?? 'instance'} topology…</p>
          </div>
        ) : (
          <>
            <HealthSummary
              instanceId={currentInstanceId ?? undefined}
              className="mb-6"
              onMonitorClick={setHighlightedMonitorId}
            />

            <MonitorList
              monitors={monitors}
              loading={loading}
              highlightedId={highlightedMonitorId}
              onHighlightDone={() => setHighlightedMonitorId(null)}
            />

            <DiscoveryPanel
              highlightedId={highlightedDiscoveredId}
              onHighlightDone={() => setHighlightedDiscoveredId(null)}
            />

            <InstanceHealth />

            <JvmMetrics />
          </>
        )}
      </main>

      {searchOpen && (
        <div className="search-overlay" onClick={() => setSearchOpen(false)}>
          <div className="search-modal" onClick={(e) => e.stopPropagation()}>
            <div className="search-input-wrapper">
              <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>

              <input
                type="text"
                placeholder="Enter application name"
                autoFocus
                className="search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setSearchOpen(false);
                  if (e.key === 'Enter' && searchItems.length > 0) {
                    handleSelectResult(searchItems[0]);
                  }
                }}
              />

              <span className="search-kbd">ESC</span>
            </div>

            {searchItems.length > 0 && (
              <div className="search-results">
                {searchItems.map((item) => (
                  <button
                    key={`${item.type}-${item.id}`}
                    className="search-result-item"
                    onClick={() => handleSelectResult(item)}
                  >
                    <div className="search-result-row">
                      <span className="search-result-title">{item.title}</span>
                      <span className={`search-result-badge ${item.status.toLowerCase()}`}>
                        {item.status}
                      </span>
                    </div>

                    <div className="search-result-row search-result-row--sub">
                      <span className="search-result-subtitle">{item.subtitle}</span>
                      <span className="search-result-type">
                        {item.type === 'monitor' ? 'Monitored' : 'Discovered'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {searchQuery.trim() && searchItems.length === 0 && (
              <div className="search-empty">No results found</div>
            )}
          </div>
        </div>
      )}

      {showAddInstance && (
        <AddInstanceModal onClose={() => setShowAddInstance(false)} />
      )}

      <Toaster position="bottom-right" richColors />
      </div>
    </div>
  );
}
