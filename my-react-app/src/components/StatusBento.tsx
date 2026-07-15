
interface Props {
  up: number;
  down: number;
  unknown: number;
  total: number;
}

export default function StatusBento({ up, down, unknown, total }: Props) {
  const cards = [
    { 
      label: 'Online', 
      value: up, 
      color: 'var(--up)', 
      dim: 'var(--up-dim)', 
      glow: 'var(--up-glow)',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
      )
    },
    { 
      label: 'Offline', 
      value: down, 
      color: 'var(--down)', 
      dim: 'var(--down-dim)', 
      glow: 'var(--down-glow)',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
      )
    },
    { 
      label: 'Unknown', 
      value: unknown, 
      color: 'var(--unknown)', 
      dim: 'var(--unknown-dim)', 
      glow: 'var(--unknown-glow)',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      )
    },
    { 
      label: 'Total', 
      value: total, 
      color: 'var(--accent)', 
      dim: 'var(--accent-dim)', 
      glow: 'var(--accent-glow)',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
      )
    },
  ];

  return (
    <div className="bento-grid">
      {cards.map((card, i) => (
        <div 
          key={card.label}
          className="bento-card"
          style={{ 
            animationDelay: `${i * 0.05}s`,
            ['--card-accent' as string]: card.color,
            ['--card-dim' as string]: card.dim,
            ['--card-glow' as string]: card.glow,
          }}
        >
          <div className="card-top-line" style={{ background: card.color }} />
          <div className="card-label">
            <span style={{ color: card.color }}>{card.icon}</span>
            {card.label}
          </div>
          <div className="card-value" style={{ color: card.color }}>
            {card.value}
          </div>
          <div className="card-sub">
            {card.label === 'Online' && 'All systems responding'}
            {card.label === 'Offline' && 'Requires attention'}
            {card.label === 'Unknown' && 'Awaiting first check'}
            {card.label === 'Total' && 'Endpoints tracked'}
          </div>
          {card.label === 'Total' && <Sparkline />}
        </div>
      ))}
    </div>
  );
}

function Sparkline() {
  const bars = [60, 40, 80, 30, 70, 50, 90, 20, 45, 65, 35, 75];
  return (
    <div className="sparkline">
      {bars.map((h, i) => (
        <div 
          key={i} 
          className="spark-bar" 
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}