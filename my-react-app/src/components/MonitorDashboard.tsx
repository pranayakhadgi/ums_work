import { useEffect, useState } from 'react';
import { useMonitorStore } from '../store/monitorStore';
import BulkPasteArea from './BulkAreaPaste';
import MonitorCard from './MonitorCard';
import { Activity, RefreshCw, Radio, Server, Database, Cpu } from 'lucide-react';
import DiscoveryPanel from './DiscoveryPanel';
import InstanceHealth from './InstanceHealth';
import JvmMetrics from './JvmMetrics';

export default function MonitorDashboard() {
  const { monitors, loading, error, loadMonitors } = useMonitorStore();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useEffect(() => {
    loadMonitors();
  }, [loadMonitors]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadMonitors();
      setLastUpdated(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadMonitors]);

  const upCount = monitors.filter(m => m.status === 'UP').length;
  const downCount = monitors.filter(m => m.status === 'DOWN').length;
  const unknownCount = monitors.filter(m => m.status === 'UNKNOWN').length;

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div>
          <h1 className="dashboard-title">
            <Radio size={24} className="text-emerald-400" />
            Uptime Monitor
            <span className="text-xs font-normal text-gray-500 ml-2 px-2 py-1 bg-gray-800 rounded-full">
              Prototype v1.0
            </span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Tomcat Estate Monitoring • {monitors.length} endpoints tracked
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-600">
            Updated {lastUpdated.toLocaleTimeString()}
          </span>
          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer bg-gray-800 px-3 py-1.5 rounded-lg">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-3.5 h-3.5 accent-emerald-500"
            />
            Live
          </label>
          <button
            onClick={() => { loadMonitors(); setLastUpdated(new Date()); }}
            disabled={loading}
            className="btn btn-secondary"
          >
            <RefreshCw size={14} className={loading ? 'spinning' : ''} />
            Refresh
          </button>
        </div>
      </header>

      {/* Status Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <Server size={20} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{upCount}</p>
            <p className="text-xs text-gray-500 uppercase tracking-wider">Online</p>
          </div>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
            <Activity size={20} className="text-red-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{downCount}</p>
            <p className="text-xs text-gray-500 uppercase tracking-wider">Offline</p>
          </div>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
            <Database size={20} className="text-yellow-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{unknownCount}</p>
            <p className="text-xs text-gray-500 uppercase tracking-wider">Unknown</p>
          </div>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <Cpu size={20} className="text-blue-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{monitors.length}</p>
            <p className="text-xs text-gray-500 uppercase tracking-wider">Total</p>
          </div>
        </div>
      </div>

      {/* Bulk Add */}
      <div className="bg-gray-800/30 border border-gray-700 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
          <Activity size={14} />
          Add Monitors
        </h3>
        <BulkPasteArea />
      </div>

      {/* Monitor Grid */}
      {monitors.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              Monitored Endpoints
            </h2>
            <span className="text-xs text-gray-600">{monitors.length} total</span>
          </div>
          <div className="monitor-grid">
            {monitors.map((monitor) => (
              <MonitorCard key={monitor.id} monitor={monitor} />
            ))}
          </div>
        </div>
      )}

      {monitors.length === 0 && !loading && !error && (
        <div className="text-center py-16 border border-dashed border-gray-700 rounded-xl">
          <Server size={32} className="mx-auto text-gray-600 mb-3" />
          <p className="text-gray-500">No monitors yet. Paste URLs above or scan Tomcat.</p>
        </div>
      )}

      {error && (
        <div className="bg-red-900/20 border border-red-700/50 text-red-300 p-4 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Discovery & Health Sections */}
      <DiscoveryPanel />
      <InstanceHealth />
      <JvmMetrics />
    </div>
  );
}