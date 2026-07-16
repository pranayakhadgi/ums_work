import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useMonitorStore } from '../store/monitorStore';
import { useDiscoveryStore } from '../store/discoveryStore';
import InstanceHealth from './InstanceHealth';
import JvmMetrics from './JvmMetrics';
import DiscoveryPanel from './DiscoveryPanel';
import MonitorList from './MonitorList';
import HeartbeatChart from './HeartbeatChart';
import MetricStrip, { type HealthBucket } from './MetricStrip';
import StatusBento from './StatusBento';
import CommandBar from './CommandBar';
import './Dashboard.css';
import { DISCOVERY_MS, MONITOR_MS, POLL_BUFFER_MS } from '../api/intervals';
import { ChevronLeft, ChevronRight, Radio, FlaskConical, Server, Cloud, Cpu, Network, Activity, Loader2 } from 'lucide-react';

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
  const { monitors, loading, error, loadMonitors } = useMonitorStore();
  const { loadCandidates, candidates } = useDiscoveryStore();

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedMonitorId, setHighlightedMonitorId] = useState<string | null>(null);
  const [highlightedDiscoveredId, setHighlightedDiscoveredId] = useState<string | null>(null);
  const [lastMonitorPushAt, setLastMonitorPushAt] = useState<number>(0);
  const [lastDiscoveryPushAt, setLastDiscoveryPushAt] = useState<number>(0);
  const [wsConnected, setWsConnected] = useState(false);
  const [healthBuckets, setHealthBuckets] = useState<HealthBucket[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [envMode, setEnvMode] = useState<string>('live');
  const [appLoading, setAppLoading] = useState(false);

  const handleEnvChange = (newEnv: string) => {
    if (newEnv === envMode) return;
    setEnvMode(newEnv);
    setAppLoading(true);
    setTimeout(() => {
      setAppLoading(false);
    }, 800);
  };

  const envDisplayNames: Record<string, string> = {
    'live': 'MultiClient OLV',
    'test': 'User Session Conduit',
    'qa': 'WSA Stub',
    'staging': 'Desktop Processing',
    'dev': 'Ship Order Notification',
    'prod-us': 'Analytics Aggregator',
    'prod-eu': 'Payment Gateway',
  };
  const currentEnvName = envDisplayNames[envMode] || envMode;

  useEffect(() => {
    const fetchBuckets = async () => {
      try {
        const res = await fetch('/api/monitors/aggregate/health?window=4&bucket=5');
        if (!res.ok) return;
        const json = await res.json();
        setHealthBuckets(json.data ?? []);
      } catch {
        // non-fatal — MetricStrip will just be empty
      }
    };
    fetchBuckets();
    const interval = setInterval(fetchBuckets, 120_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    loadMonitors();
    loadCandidates();
  }, [loadMonitors, loadCandidates]);

  useEffect(() => {
    const socket = new WebSocket('ws://localhost:3001');

    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'CHECK_BATCH_COMPLETE' || msg.type === 'STATE_TRANSITION') {
        loadMonitors();
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
  }, [loadMonitors, loadCandidates]);

    useEffect(() => {
    const interval = setInterval(() => {
      const sinceLastPush = Date.now() - lastMonitorPushAt;
      const gracePeriod = MONITOR_MS + POLL_BUFFER_MS;

      if (sinceLastPush > gracePeriod) {
        loadMonitors();
      }
    }, MONITOR_MS + POLL_BUFFER_MS);
    return () => clearInterval(interval);
  }, [loadMonitors, lastMonitorPushAt]);

    useEffect(() => {
    const interval = setInterval(() => {
      const sinceLastPush = Date.now() - lastDiscoveryPushAt;
      const gracePeriod = MONITOR_MS + POLL_BUFFER_MS;

      if (sinceLastPush > gracePeriod) {
        loadCandidates();
      }
    }, DISCOVERY_MS + POLL_BUFFER_MS);
    return () => clearInterval(interval);
  }, [loadCandidates, lastDiscoveryPushAt]);

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

  const upCount = monitors.filter(m => m.status === 'UP').length;
  const downCount = monitors.filter(m => m.status === 'DOWN').length;
  const unknownCount = monitors.filter(m => m.status === 'UNKNOWN').length;

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

  // Filter monitors based on search query (legacy — kept for backwards compat, not used by new modal)
  const filteredMonitors = searchQuery.trim() === ''
    ? monitors
    : monitors.filter(m =>
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.url.toLowerCase().includes(searchQuery.toLowerCase())
      );

  return (
    <div className="dashboard-shell">
      <aside className={`env-sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
        <button className="env-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </button>
        <nav className="env-nav">
          <button 
            className={`env-item ${envMode === 'live' ? 'active' : ''}`}
            onClick={() => handleEnvChange('live')}
          >
            <Radio size={18} />
            <span className="env-label">{envDisplayNames['live']}</span>
          </button>
          <button 
            className={`env-item ${envMode === 'test' ? 'active' : ''}`}
            onClick={() => handleEnvChange('test')}
          >
            <FlaskConical size={18} />
            <span className="env-label">{envDisplayNames['test']}</span>
          </button>
          <button 
            className={`env-item ${envMode === 'qa' ? 'active' : ''}`}
            onClick={() => handleEnvChange('qa')}
          >
            <Server size={18} />
            <span className="env-label">{envDisplayNames['qa']}</span>
          </button>
          <button 
            className={`env-item ${envMode === 'staging' ? 'active' : ''}`}
            onClick={() => handleEnvChange('staging')}
          >
            <Cloud size={18} />
            <span className="env-label">{envDisplayNames['staging']}</span>
          </button>
          <button 
            className={`env-item ${envMode === 'dev' ? 'active' : ''}`}
            onClick={() => handleEnvChange('dev')}
          >
            <Cpu size={18} />
            <span className="env-label">{envDisplayNames['dev']}</span>
          </button>
          <button 
            className={`env-item ${envMode === 'prod-us' ? 'active' : ''}`}
            onClick={() => handleEnvChange('prod-us')}
          >
            <Network size={18} />
            <span className="env-label">{envDisplayNames['prod-us']}</span>
          </button>
          <button 
            className={`env-item ${envMode === 'prod-eu' ? 'active' : ''}`}
            onClick={() => handleEnvChange('prod-eu')}
          >
            <Activity size={18} />
            <span className="env-label">{envDisplayNames['prod-eu']}</span>
          </button>
        </nav>
      </aside>
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
            <div className="header-right">
              <div className="live-badge">
                <span className={`pulse-dot ${wsConnected ? 'connected' : ''}`} />
                {wsConnected ? 'Live' : 'Offline'}
              </div>
              <ClockDisplay />
            </div>
          </div>
        </header>

        <div className="env-title-banner">
          <h1>{currentEnvName}</h1>
        </div>

        <CommandBar onClick={() => setSearchOpen(true)} />

      <main className="dash-main">
        {appLoading ? (
          <div className="app-loading-state">
            <Loader2 size={32} className="spinner-icon" />
            <p>Loading {currentEnvName} topology...</p>
          </div>
        ) : (
          <>
            <StatusBento
              up={upCount}
              down={downCount}
              unknown={unknownCount}
              total={monitors.length}
            />

            <MetricStrip buckets={healthBuckets} />

            <HeartbeatChart monitors={monitors} />

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
      </div>
    </div>
  );
}
