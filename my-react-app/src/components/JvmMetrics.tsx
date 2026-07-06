import { useState, useEffect } from 'react';
import { fetchLatestJvm } from '../api/health';

interface JvmSnapshot {
  id: string;
  collectedAt: string;
  runtimeInfo?: {
    vmName?: string;
    vmVersion?: string;
    vmVendor?: string;
    uptime?: number;
  } | null;
  memoryPools?: Array<{
    name: string;
    type: string;
    used: number;
    committed: number;
    max: number;
  }> | null;
  gcInfo?: Array<{
    name: string;
    collectionCount: number;
    collectionTime: number;
  }> | null;
  osInfo?: {
    osName?: string;
    osVersion?: string;
    architecture?: string;
    availableProcessors?: number;
    systemLoadAverage?: number;
  } | null;
}

export default function JvmMetrics() {
  const [snapshots, setSnapshots] = useState<JvmSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetchLatestJvm();
        if (res.success && Array.isArray(res.data)) {
          setSnapshots(res.data);
        }
      } catch (e) {
        console.error('[JvmMetrics] Failed:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return (
    <section className="dash-section">
      <div className="section-header">
        <div className="section-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/>
          </svg>
          JVM Diagnostics
        </div>
      </div>
      <div className="skeleton-grid">
        {[1, 2, 3].map(i => <div key={i} className="skeleton-card" />)}
      </div>
    </section>
  );

  const latest = snapshots[0];
  if (!latest) return (
    <section className="dash-section">
      <div className="section-header">
        <div className="section-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/>
          </svg>
          JVM Diagnostics
        </div>
      </div>
      <div className="empty-section">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/>
        </svg>
        <p>No JVM data available.</p>
      </div>
    </section>
  );

  const memPools = latest.memoryPools ?? [];
  const gcCollectors = latest.gcInfo ?? [];

  const fmtMem = (bytes: number) => {
    if (!bytes || bytes === 0) return '0.0';
    return (bytes / 1024 / 1024).toFixed(1);
  };

  return (
    <section className="dash-section">
      <div className="section-header">
        <div className="section-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/>
          </svg>
          JVM Diagnostics
        </div>
      </div>

      {/* Top Metric Cards */}
      <div className="jvm-bento">
        <div className="jvm-metric-card">
          <div className="jvm-metric-label">JVM Version</div>
          <div className="jvm-metric-value">{latest.runtimeInfo?.vmVersion ?? '—'}</div>
          <div className="jvm-metric-sub">{latest.runtimeInfo?.vmName ?? '—'}</div>
        </div>
        <div className="jvm-metric-card">
          <div className="jvm-metric-label">Uptime</div>
          <div className="jvm-metric-value">
            {Math.floor((latest.runtimeInfo?.uptime || 0) / 3600000)}h{' '}
            {Math.floor(((latest.runtimeInfo?.uptime || 0) % 3600000) / 60000)}m
          </div>
          <div className="jvm-metric-sub">Since last restart</div>
        </div>
        <div className="jvm-metric-card">
          <div className="jvm-metric-label">OS Load</div>
          <div className="jvm-metric-value">{latest.osInfo?.systemLoadAverage ?? 0}</div>
          <div className="jvm-metric-sub">
            {latest.osInfo?.osName ?? '—'} · {latest.osInfo?.availableProcessors ?? 0} cores
          </div>
        </div>
      </div>

      {/* FIXED: Memory Pools as Cards */}
      {memPools.length > 0 && (
        <div className="memory-section">
          <div className="section-header" style={{ marginBottom: '16px' }}>
            <div className="section-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                <rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/>
              </svg>
              Memory Pools
            </div>
          </div>
          <div className="memory-pools-grid">
            {memPools.map((pool, idx) => {
              const used = pool.used || 0;
              const max = pool.max === -1 ? Infinity : (pool.max || 1);
              const pct = Math.min((used / max) * 100, 100);
              return (
                <div key={idx} className="memory-pool-card">
                  <div className="pool-header">
                    <span className="pool-name">{pool.name}</span>
                    <span className="pool-type">{pool.type}</span>
                  </div>
                  <div className="pool-bar-bg">
                    <div className="pool-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="pool-stats">
                    <span className="pool-stat">{fmtMem(used)} MB</span>
                    <span className="pool-stat">/ {pool.max === -1 ? '∞' : fmtMem(pool.max)} MB</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* FIXED: Garbage Collectors Grid */}
      {gcCollectors.length > 0 && (
        <div className="memory-section">
          <div className="section-header" style={{ marginBottom: '16px' }}>
            <div className="section-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><path d="M8 12h8"/>
              </svg>
              Garbage Collectors
            </div>
          </div>
          <div className="gc-grid">
            {gcCollectors.map((gc, idx) => (
              <div key={idx} className="gc-card">
                <div className="gc-header">{gc.name}</div>
                <div className="pool-stats">
                  <span className="pool-stat">Collections</span>
                  <span className="pool-stat">{gc.collectionCount.toLocaleString()}</span>
                </div>
                <div className="pool-stats">
                  <span className="pool-stat">Total time</span>
                  <span className="pool-stat">{gc.collectionTime.toLocaleString()}ms</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}