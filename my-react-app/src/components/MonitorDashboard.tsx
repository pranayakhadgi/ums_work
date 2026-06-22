import { useEffect, useState } from 'react';
import { useMonitorStore } from '../store/monitorStore';
import BulkPasteArea from './BulkAreaPaste';
import MonitorCard from './MonitorCard';
import { RefreshCw } from 'lucide-react';

export default function MonitorDashboard() {
  const { monitors, loading, error, loadMonitors, discover } = useMonitorStore();
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    loadMonitors();
  }, [loadMonitors]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadMonitors();
    }, 30_000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadMonitors]);

  return (
    <div className='w-full max-w-6xl mx-auto p-4 space-y-6'>
      <div className='flex flex-col md:flex-row md:items-center md:justify-between gap-4'>
        <h1 className='text-3xl font-bold text-gray-100'>
          Uptime Monitor - Prototype
          </h1>
        <div className='flex items-center gap-4'>

          {/* Checkbox */}
          <label className='flex items-center gap-2 text-sm text-gray-300 cursor-pointer'>
            <input
              type='checkbox'
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className='w-4 h-4 accent-blue-500'
            />
            Auto Refresh
          </label>
          <button
            onClick={() => loadMonitors()}
            disabled={loading}
            className='flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 rounded-md transition-colors disabled:opacity-50'
          >
            <RefreshCw className='w-4 h-4' />
            Refresh
          </button>
        </div>
      </div>

      <BulkPasteArea />

      <button
        onClick={() => useMonitorStore.getState().discover()}
        disabled={loading}
        className='inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors'
      >
        { loading ? 'Scanning...' : 'Scan Tomcat Server' }
      </button>

      {loading && monitors.length === 0 && (
        <div className='text-center text-gray-400'>Loading monitors...</div>
      )}

      {error && (
        <div className='bg-red-900/30 border border-red-700 text-red-300 p-4 rounded-lg'>
          {error}
        </div>
      )}

      {!loading && monitors.length === 0 && !error && (
        <div className='text-center text-gray-500 py-12'>
          No monitors yet. Paste some URLs above.
        </div>
      )}

      {monitors.length > 0 && (
        <div className="w-full">
        <div className='monitor-grid'>
          {monitors.map((monitor) => (
            <MonitorCard key={monitor.id} monitor={monitor} />
          ))}
        </div>
        </div>
      )}
    </div>
  );
}
