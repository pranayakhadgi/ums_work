import { motion } from 'motion/react';
import StatusRail from './StatusRail';
import type { Monitor } from '../api/monitors';

interface MonitorRowProps {
  monitor: Monitor;
  /** Aggregate health history for the rail (0-100 scores) */
  healthHistory: number[];
  /** Is this row expanded (DOWN/UNKNOWN or user-clicked)? */
  isExpanded?: boolean;
  onClick?: () => void;
}

/**
 * MonitorRow — Single row in the re-sortable list.
 * 
 * Design contract:
 * - Vertical list reorder only (grid span deferred to v2).
 * - Expanded tile max-height: 120px, overflow hidden.
 * - StatusRail height: 24px compact, 48px expanded.
 * - motion layout="position" for FLIP-safe reorder.
 */
export default function MonitorRow({ monitor, healthHistory, isExpanded = false, onClick }: MonitorRowProps) {
  const status = monitor.status as 'UP' | 'DOWN' | 'UNKNOWN';

  const statusColor = {
    UP: '#22c55e',
    DOWN: '#ef4444',
    UNKNOWN: '#eab308',
  }[status];

  const railHeight = isExpanded ? 48 : 24;

  return (
    <motion.div
      layout="position"
      layoutId={monitor.id}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={`monitor-row ${isExpanded ? 'expanded' : ''}`}
      onClick={onClick}
      style={{ 
        borderLeft: `3px solid ${statusColor}`,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {/* Left: status indicator + name */}
      <div className="monitor-row-main">
        <div className="monitor-name-cell">
          <span className="monitor-name">{monitor.name}</span>
          <span className="monitor-url">{monitor.url}</span>
        </div>

        <span className={`env-tag env-${monitor.environment.toLowerCase()}`}>
          {monitor.environment}
        </span>

        <span className={`status-text ${status.toLowerCase()}`}>
          {status}
        </span>

        <span className="last-check">
          {monitor.lastChecked 
            ? `${Math.round((Date.now() - new Date(monitor.lastChecked).getTime()) / 60000)}m ago`
            : 'Never'
          }
        </span>
      </div>

      {/* Right: Status Rail */}
      <div className="monitor-row-rail">
        <StatusRail 
          data={healthHistory} 
          status={status} 
          height={railHeight}
          width={isExpanded ? 200 : 120}
        />
      </div>

      {/* Expanded: error details */}
      {isExpanded && monitor.errorMessage && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="monitor-row-detail"
        >
          <div className="error-detail">
            <span className="error-label">{monitor.errorCategory}</span>
            <span className="error-message">{monitor.errorMessage}</span>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}