import type { Monitor } from '../api/monitors';
import { CheckCircle, XCircle, AlertTriangle, Clock } from 'lucide-react';

interface Props {
  monitor: Monitor;
}

function envClass(env: string) {
  switch (env) {
    case 'Prod': return 'env-badge env-prod';
    case 'QA':   return 'env-badge env-qa';
    default:      return 'env-badge env-dev';
  }
}

function statusClass(status: string) {
  switch (status) {
    case 'UP':   return 'card-status status-up';
    case 'DOWN': return 'card-status status-down';
    default:      return 'card-status status-unknown';
  }
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'UP':   return <CheckCircle size={14} />;
    case 'DOWN': return <XCircle size={14} />;
    default:      return <AlertTriangle size={14} />;
  }
}

// shows the uptime monitor status based on the fetch status
export default function MonitorCard({ monitor }: Props) {
  const lastCheckedText = monitor.lastChecked
    ? `Last checked: ${new Date(monitor.lastChecked).toLocaleString()}`
    : 'Not checked yet';

  return (
    <div className="monitor-card">
      {/* Name + environment badge */}
      <div className="card-header">
        <h3 className="card-name">{monitor.name}</h3>
        <span className={envClass(monitor.environment)}>{monitor.environment}</span>
      </div>

      {/* Status pill */}
      <div className={statusClass(monitor.status)}>
        <StatusIcon status={monitor.status} />
        <span>{monitor.status}</span>
      </div>

      {/* Timestamp */}
      <div className="card-time">
        <Clock size={11} />
        <span>{lastCheckedText}</span>
      </div>

      {/* URL */}
      <a
        href={monitor.url}
        target="_blank"
        rel="noopener noreferrer"
        className="card-url"
      >
        {monitor.url}
      </a>
    </div>
  );
}
