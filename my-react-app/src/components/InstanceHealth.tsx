import { useState, useEffect } from 'react';
import { fetchLatestHealth } from '../api/health';
import { useInstanceStore } from '../store/instanceStore';
import { HEALTH_MS, POLL_BUFFER_MS } from '../api/intervals';

interface HealthSnapshot {
  id: string;
  connectorName: string;
  collectedAt: string;
  threadInfo?: {
    maxThreads?: number;
    currentThreadCount?: number;
    currentThreadsBusy?: number;
    keepAliveCount?: number;
  } | null;
  requestInfo?: {
    maxProcessingTime?: number;
    processingTime?: number;
    requestCount?: number;
    errorCount?: number;
    bytesReceived?: number;
    bytesSent?: number;
  } | null;
  memoryInfo?: {
    freeMemory?: number;
    totalMemory?: number;
    maxMemory?: number;
  } | null;
}

export default function InstanceHealth() {
  const [health, setHealth] = useState<HealthSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const { currentInstanceId } = useInstanceStore();

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetchLatestHealth(currentInstanceId ?? undefined);
        if (res.success && Array.isArray(res.data)) {
          setHealth(res.data);
        }
      } catch (e) {
        console.error('[InstanceHealth] Failed:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, HEALTH_MS + POLL_BUFFER_MS);
    return () => clearInterval(interval);
  }, [currentInstanceId]);

  const fmtMem = (bytes?: number) => {
    if (bytes == null || bytes === 0) return '0.0';
    return (bytes / 1024 / 1024).toFixed(1);
  };

  if (loading) return (
    <section className="dash-section">
      <div className="section-header">
        <div className="section-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
          Instance Health
        </div>
      </div>
      <div className="skeleton-grid">
        {[1, 2].map(i => (
          <div key={i} className="skeleton-card" />
        ))}
      </div>
    </section>
  );

  return (
    <section className="dash-section">
      <div className="section-header">
        <div className="section-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
          Instance Health
        </div>
        <div className="section-count">{health.length} connectors</div>
      </div>

      {health.length === 0 ? (
        <div className="empty-section">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
          <p>No health data collected yet.</p>
        </div>
      ) : (
        <div className="health-grid">
          {health.map((h, i) => (
            <div 
              key={h.id} 
              className="health-card"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div className="health-header">
                <div className="health-name">
                  <div className="health-dot" />
                  {h.connectorName}
                </div>
                <div className="health-time">
                  {new Date(h.collectedAt).toLocaleTimeString('en-US', { hour12: false })}
                </div>
              </div>
              <div className="health-metrics">
                <div className="metric">
                  <div className="metric-label">Threads</div>
                  <div className="metric-value small">
                    {h.threadInfo?.currentThreadsBusy ?? 0} / {h.threadInfo?.maxThreads ?? 0}
                  </div>
                </div>
                <div className="metric">
                  <div className="metric-label">Requests</div>
                  <div className="metric-value">
                    {(h.requestInfo?.requestCount ?? 0).toLocaleString()}
                  </div>
                </div>
                <div className="metric">
                  <div className="metric-label">Errors</div>
                  <div className="metric-value" style={{ color: 'var(--text-primary)' }}>
                    {h.requestInfo?.errorCount ?? 0}
                  </div>
                </div>
                <div className="metric">
                  <div className="metric-label">Memory</div>
                  <div className="metric-value" style={{ color: 'var(--accent)' }}>
                    {fmtMem(h.memoryInfo?.freeMemory)} MB
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
