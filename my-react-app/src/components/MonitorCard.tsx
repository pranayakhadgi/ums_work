import type { Monitor } from '../api/monitors';
import { CheckCircle, XCircle, AlertTriangle, Clock } from 'lucide-react';
import clsx from 'clsx';

interface Props {
  monitor: Monitor;
}

// shows the uptime monitor status based on the fetch status
export default function MonitorCard({ monitor }: Props) {
  const statusIcon = () => {
    switch (monitor.status) {
      case 'UP':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'DOWN':
        return <XCircle className="w-5 h-5 text-red-400" />;
      default:
        return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
    }
  };

  // returns timestamp for lastchecked
  const lastCheckedText = monitor.lastChecked
    ? `Last Checked: ${new Date(monitor.lastChecked).toLocaleDateString()}`
    : 'Not checked yet';

  return (
    <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 shadow-md">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold text-gray-100 truncate max-w-[70%]">
          {monitor.name}
        </h3>
        <span className={clsx(
          'px-2 py-1 rounded-full text-xs font-medium',
          monitor.environment === 'Prod'
            ? 'bg-purple-900 text-purple-300'
            : monitor.environment === 'QA'
              ? 'bg-blue-900 text-blue-300'
              : 'bg-gray-700 text-gray-300'
        )}>
          {monitor.environment}
        </span>
      </div>
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
        {statusIcon()}
        <span>{monitor.status}</span>
      </div>
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <Clock className="w-3 h-3" />
        <span>{lastCheckedText}</span>
      </div>
      <a
        href={monitor.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-blue-400 hover:underline mt-2 block truncate"
      >
        {monitor.url}
      </a>
    </div>
  );
}
