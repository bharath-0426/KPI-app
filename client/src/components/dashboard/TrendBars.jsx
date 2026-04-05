export default function TrendBars({ trend }) {
  if (!trend || trend.length === 0)
    return <p className="text-xs text-gray-400 mt-4">No closed periods yet.</p>;

  const scores = trend.map(t => t.score ?? 0);
  const maxVal = Math.max(...scores, 1);
  const barW = 24, gap = 6, chartH = 52;
  const totalW = trend.length * (barW + gap) - gap;

  return (
    <svg width={totalW} height={chartH + 20} className="overflow-visible">
      {trend.map((t, i) => {
        const h = t.score !== null ? Math.max(3, (t.score / maxVal) * chartH) : 2;
        const x = i * (barW + gap);
        const y = chartH - h;
        const isLast = i === trend.length - 1;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={h} rx={3}
              fill={isLast ? '#111827' : '#e5e7eb'} />
            {t.score !== null && (
              <text x={x + barW / 2} y={y - 3} textAnchor="middle" fontSize={9}
                fill={isLast ? '#111827' : '#9ca3af'}>
                {t.score}%
              </text>
            )}
            <text x={x + barW / 2} y={chartH + 14} textAnchor="middle" fontSize={8} fill="#9ca3af">
              {(t.label || '').split(' ').slice(-1)[0]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
