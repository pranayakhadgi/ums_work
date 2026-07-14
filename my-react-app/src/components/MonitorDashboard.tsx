import React, { useEffect, useState, useCallback } from 'react';
import { useMonitorStore } from '../store/monitorStore';
import { useDiscoveryStore } from '../store/discoveryStore';
import InstanceHealth from './InstanceHealth';
import JvmMetrics from './JvmMetrics';
import DiscoveryPanel from './DiscoveryPanel';
import MonitorList from './MonitorList';
import HeartbeatChart from './HeartbeatChart';
import StatusBento from './StatusBento';
import CommandBar from './CommandBar';
import './Dashboard.css';
import { DISCOVERY_MS, MONITOR_MS, POLL_BUFFER_MS } from '../api/intervals';

// Memoized clock component.
// Only this component re-renders every second instead of the entire dashboard.
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
  const { candidates, loadCandidates } = useDiscoveryStore();

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [lastMonitorPushAt, setLastMonitorPushAt] = useState<number>(0);
  const [lastDiscoveryPushAt, setLastDiscoveryPushAt] = useState<number>(0);
  const [wsConnected, setWsConnected] = useState(false);

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
      console.log('[ws] Disconnected')
      setWsConnected(false)
    };

    socket.onerror = (err) => {
      console.log('[ws] Error: ', err);
      setWsConnected(false);
    }

    return () => socket.close();
  }, [loadMonitors, loadCandidates]);

  //monitor 30s
  useEffect(() => {
    const interval = setInterval(() => {
      const sinceLastPush = Date.now() - lastMonitorPushAt;
      const gracePeriod = MONITOR_MS + POLL_BUFFER_MS;

      if(sinceLastPush > gracePeriod){
        loadMonitors();
      }
    }, MONITOR_MS + POLL_BUFFER_MS);
    return () => clearInterval(interval);
  }, [loadMonitors, lastMonitorPushAt]);

  //discovery 60s
  useEffect(() => {
    const interval = setInterval(() => {
      const sinceLastPush = Date.now() - lastDiscoveryPushAt;
      const gracePeriod = MONITOR_MS + POLL_BUFFER_MS;

      if(sinceLastPush > gracePeriod){
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

  // Filter monitors based on search query
  const filteredMonitors = searchQuery.trim() === ''
    ? monitors
    : monitors.filter(m =>
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.url.toLowerCase().includes(searchQuery.toLowerCase())
      );

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="dash-header">
        <div className="dash-header-inner">
          <div className="brand">
            <img
              src="/wiab-logo.svg"
              alt="WiAB"
              className="brand-logo"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/wiab-logo.png';
                (e.target as HTMLImageElement).onerror = null;
              }}
            />
            <div className="brand-text">
              <div className="brand-title">Uptime Tomcat Server Monitor</div>
            </div>
          </div>

          <div className="header-right">
            <div className="live-badge">
              <div className={`pulse-dot ${wsConnected ? 'connected' : 'disconnected'}`}/>
              <span>{wsConnected ? 'Live' : 'Polling'}</span>
            </div>

            <ClockDisplay />
          </div>
        </div>
      </header>

      {/* Command Bar */}
      <CommandBar onClick={() => setSearchOpen(true)} />

      {/* Main Content */}
      <main className="dash-main">
        <StatusBento
          up={upCount}
          down={downCount}
          unknown={unknownCount}
          total={monitors.length}
        />

        {/* Pass filtered monitors to charts and list */}
        <HeartbeatChart monitors={filteredMonitors} />
        <MonitorList monitors={filteredMonitors} loading={loading} />

        <DiscoveryPanel />
        <InstanceHealth />
        <JvmMetrics />

        {error && (
          <div className="error-banner">
            {error}
          </div>
        )}
      </main>

      {/* Search Modal */}
      {searchOpen && (
        <div className="search-modal" onClick={() => setSearchOpen(false)}>
          <div className="search-box" onClick={e => e.stopPropagation()}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>

            <input
              type="text"
              placeholder="Search monitors, apps, or commands..."
              autoFocus
              className="search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <span className="search-kbd">ESC</span>
          </div>
        </div>
      )}
    </div>
  );
}