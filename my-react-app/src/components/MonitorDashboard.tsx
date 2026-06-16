import { useEffect, useState } from 'react';
import { useMonitorStore } from '../store/monitorStore';
import BulkPasteArea from './BulkAreaPaste';
import MonitorCard from './MonitorCard';
import { RefreshCw } from 'lucide-react';

export default function MonitorDashboard() {
  const { monitors, loading, error, loadMonitors } = useMonitorStore();
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    loadMonitors();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadMonitors();
    }, 30_000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadMonitors]);

  return (
    <div className='max-w-4xl mx-auto p-6 space-y-8'>
      <div className='flex items-center justify-between'>
        <h1 className='text-3xl font-bold text-grey-100'>Uptime Monitor</h1>
        <div className='flex items-center gap-2 text-sm text-gray-300 cursor-pointer'>
          <label className='flex items-center gap-2 text-sm text-gray-300 cursor-pointer'>
            <input
              type='checkbox'
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className='accent-blue-500'
            />
          </label>
          <button
            onClick={() => loadMonitors()}
            disabled={loading}
            className='flex items-center gap-1 text-sm text-gray-300 hover:text-white disabled:opacity-50'
          >
            <RefreshCw className='w-4 h-4' />
            Refresh
          </button>
        </div>
      </div>

      <BulkPasteArea />

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
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {monitors.map((monitor) => (
            <MonitorCard key={monitor.id} monitor={monitor} />
          ))}
        </div>
      )}
    </div>
  );
}
