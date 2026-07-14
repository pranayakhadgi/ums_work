import { useMemo } from 'react';
import { line, curveMonotoneX } from 'd3-shape';

interface StatusRailProps {
  /** Array of health scores (0-100) over time, oldest first */
  data: number[];
  /** Current status drives stroke color */
  status: 'UP' | 'DOWN' | 'UNKNOWN';
  /** Width in pixels */
  width?: number;
  /** Height in pixels */
  height?: number;
}

export default function StatusRail({ data, status, width = 120, height = 24 }: StatusRailProps) {
  const strokeColor = useMemo(() => {
    if (status === 'DOWN') return '#ef4444';
    if (status === 'UNKNOWN') return '#eab308';
    return '#22c55e';
  }, [status]);

  const pathD = useMemo(() => {
    if (data.length < 2) {
      // Flatline for single/no data
      return `M0,${height / 2} L${width},${height / 2}`;
    }

    const xScale = (i: number) => (i / (data.length - 1)) * width;
    const yScale = (v: number) => height - (v / 100) * height; 

    const generator = line<number>()
      .x((_, i) => xScale(i))
      .y((d) => yScale(d))
      .curve(curveMonotoneX);

    return generator(data) || '';
  }, [data, width, height]);

  // Gradient fill: fade from stroke color to transparent
  const gradientId = `rail-gradient-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="status-rail"
      aria-label={`Health trend: ${status}`}
      role="img"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity={0.25} />
          <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Fill area under curve */}
      <path
        d={`${pathD} L${width},${height} L0,${height} Z`}
        fill={`url(#${gradientId})`}
      />

      {/* Stroke line */}
      <path
        d={pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Current value dot */}
      {data.length > 0 && (
        <circle
          cx={width}
          cy={height - (data[data.length - 1] / 100) * height}
          r={2}
          fill={strokeColor}
        />
      )}
    </svg>
  );
}