// Lightweight dependency-free SVG charts used by the Business Reports page.
// Follows the FreshGo design tokens (forest / jade accents, cream grid).

export type ChartDatum = {
  label: string;
  value: number;
};

export function MultiLineChart({
  labels,
  series,
  height = 220,
}: {
  labels: string[];
  series: { name: string; color: string; values: number[] }[];
  height?: number;
}) {
  const width = 560;
  const padL = 46;
  const padR = 12;
  const padT = 14;
  const padB = 26;
  const all = series.flatMap((s) => s.values);
  const max = Math.max(1, ...all);
  const niceMax = max <= 10 ? Math.ceil(max) : Math.ceil(max / 10) * 10;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const counts = Math.max(labels.length, 2);

  const x = (i: number) => padL + (counts === 1 ? innerW / 2 : (i / (counts - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / niceMax) * innerH;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={series.map((s) => s.name).join(', ')}>
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const gy = padT + innerH - t * innerH;
        return (
          <g key={t}>
            <line x1={padL} y1={gy} x2={width - padR} y2={gy} stroke="#eee2d2" strokeWidth="1" />
            <text x={padL - 6} y={gy + 3.5} textAnchor="end" fontSize="9" fill="#9b8c78">
              {Math.round(t * niceMax)}
            </text>
          </g>
        );
      })}
      {labels.map((label, i) => (
        <text key={`${label}-${i}`} x={x(i)} fontSize="9" fill="#9b8c78">
          <tspan x={x(i)} y={height - 2} textAnchor="middle">{label}</tspan>
        </text>
      ))}
      {series.map((s) => {
        const path = s.values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
        return (
          <g key={s.name}>
            <path d={path} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {s.values.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r="3" fill="#fff" stroke={s.color} strokeWidth="2" />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

export function BarChart({
  items,
  color = '#1f5c4d',
  height = 200,
  format = (v: number) => String(v),
}: {
  items: ChartDatum[];
  color?: string;
  height?: number;
  format?: (v: number) => string;
}) {
  const width = 560;
  const padL = 46;
  const padR = 12;
  const padT = 14;
  const padB = 30;
  const max = Math.max(1, ...items.map((i) => i.value));
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const barW = Math.max(6, innerW / Math.max(items.length, 1) * 0.62);
  const step = innerW / Math.max(items.length, 1);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Bar chart">
      {items.length === 0 && (
        <text x={width / 2} y={height / 2} textAnchor="middle" fontSize="12" fill="#c9baa4">No data</text>
      )}
      {items.map((item, i) => {
        const h = (item.value / max) * innerH;
        const x = padL + i * step + (step - barW) / 2;
        const y = padT + innerH - h;
        return (
          <g key={`${item.label}-${i}`}>
            <rect x={x} y={y} width={barW} height={h} rx="4" fill={color} opacity="0.9" />
            <text x={x + barW / 2} y={y - 5} textAnchor="middle" fontSize="9" fontWeight="600" fill="#5b6b5a">
              {format(item.value)}
            </text>
            <text x={x + barW / 2} y={height - 12} textAnchor="middle" fontSize="9" fill="#9b8c78">
              {item.label}
            </text>
          </g>
        );
      })}
      {[0, 0.5, 1].map((t) => (
        <line
          key={t}
          x1={padL}
          y1={padT + innerH - t * innerH}
          x2={width - padR}
          y2={padT + innerH - t * innerH}
          stroke="#eee2d2"
          strokeWidth="1"
        />
      ))}
    </svg>
  );
}