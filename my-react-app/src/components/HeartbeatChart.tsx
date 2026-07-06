import { useEffect, useRef, useMemo } from 'react';
import type { Monitor } from '../api/monitors';

interface Props {
  monitors: Monitor[];
}

export default function HeartbeatChart({ monitors }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const data = useMemo(() => {
    // Generate 60 data points of simulated status history
    const points = [];
    const now = Date.now();
    for (let i = 0; i < 60; i++) {
      const time = now - (60 - i) * 60000;
      // Weighted random: mostly UP, some DOWN, few UNKNOWN
      const r = Math.random();
      let status: 'UP' | 'DOWN' | 'UNKNOWN';
      if (r > 0.92) status = 'DOWN';
      else if (r > 0.85) status = 'UNKNOWN';
      else status = 'UP';
      points.push({ time, status });
    }
    return points;
  }, [monitors.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const barCount = data.length;
    const barWidth = (w - 40) / barCount;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.02)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = (h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Draw bars
    data.forEach((pt, i) => {
      const x = 20 + i * barWidth;
      let color: string;
      let barHeight: number;

      if (pt.status === 'UP') {
        color = '#22c55e';
        barHeight = h * 0.35 + Math.random() * h * 0.45;
      } else if (pt.status === 'DOWN') {
        color = '#ef4444';
        barHeight = h * 0.12;
      } else {
        color = '#eab308';
        barHeight = h * 0.2 + Math.random() * h * 0.25;
      }

      // Glow
      ctx.shadowColor = color;
      ctx.shadowBlur = pt.status === 'DOWN' ? 10 : 4;
      ctx.fillStyle = color;
      ctx.fillRect(x, h - barHeight - 10, barWidth - 2, barHeight);
      ctx.shadowBlur = 0;
    });

    // Time labels
    ctx.fillStyle = '#4a4f66';
    ctx.font = '10px JetBrains Mono';
    ctx.textAlign = 'center';
    for (let i = 0; i < 5; i++) {
      const idx = Math.min(Math.floor((data.length - 1) * (i / 4)), data.length - 1);
      const x = 20 + idx * barWidth + barWidth / 2;
      const date = new Date(data[idx].time);
      ctx.fillText(
        `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`,
        x,
        h - 2
      );
    }
  }, [data]);

  return (
    <div className="chart-section animate-fade">
      <div className="chart-header">
        <div className="chart-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
          System Heartbeat
        </div>
        <div className="chart-legend">
          <div className="legend-item">
            <div className="legend-dot" style={{ background: '#22c55e' }} />
            UP
          </div>
          <div className="legend-item">
            <div className="legend-dot" style={{ background: '#ef4444' }} />
            DOWN
          </div>
          <div className="legend-item">
            <div className="legend-dot" style={{ background: '#eab308' }} />
            UNKNOWN
          </div>
        </div>
      </div>
      <canvas 
        ref={canvasRef} 
        style={{ width: '100%', height: '100px' }}
      />
    </div>
  );
}