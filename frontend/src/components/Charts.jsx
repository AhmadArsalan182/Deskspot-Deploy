/**
 * Dependency-free charts.
 *
 * The shapes are built from plain CSS (bars, donut) and a single inline SVG
 * path (line/area), so the bundle stays small and the charts inherit the app
 * palette and re-render instantly when the window size changes.
 */

const number = (value) => new Intl.NumberFormat().format(value ?? 0);

/** Vertical bars with a caption row underneath. */
export function BarChart({ data, ariaLabel, formatValue = number, showValues = false, height = 170 }) {
  const max = Math.max(1, ...data.map((item) => item.value));

  return (
    <div className="chart" role="img" aria-label={ariaLabel}>
      <div className="chart__bars" style={{ height }}>
        {data.map((item) => (
          <div
            key={item.label}
            className="chart__bar-col"
            title={`${item.label}: ${formatValue(item.value)}`}
          >
            {showValues && <span className="chart__bar-value">{formatValue(item.value)}</span>}
            <div
              className="chart__bar"
              style={{
                height: `${Math.max(2, (item.value / max) * 100)}%`,
                ...(item.color ? { background: item.color } : {}),
              }}
            />
          </div>
        ))}
      </div>
      <div className="chart__labels">
        {data.map((item) => (
          <span key={item.label} title={item.label}>
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Area + line chart over an evenly spaced series. */
export function LineChart({ data, ariaLabel, formatValue = number, height = 180, color = "#1f6b45" }) {
  const width = 600;
  const pad = 10;
  const max = Math.max(1, ...data.map((item) => item.value));
  const step = data.length > 1 ? (width - pad * 2) / (data.length - 1) : 0;
  const y = (value) => height - pad - (value / max) * (height - pad * 2);
  const points = data.map((item, index) => [pad + index * step, y(item.value)]);
  const linePath = points.map(([x, py], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${py.toFixed(1)}`).join(" ");
  const areaPath = points.length
    ? `${linePath} L ${points[points.length - 1][0].toFixed(1)} ${height - pad} L ${points[0][0].toFixed(1)} ${height - pad} Z`
    : "";
  const peak = data.reduce((best, item) => (item.value > best.value ? item : best), data[0] ?? { value: 0 });

  return (
    <div className="chart" role="img" aria-label={ariaLabel}>
      <svg className="chart__svg" viewBox={`0 0 ${width} ${height}`} height={height} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((fraction) => (
          <line
            key={fraction}
            x1={pad}
            x2={width - pad}
            y1={height - pad - fraction * (height - pad * 2)}
            y2={height - pad - fraction * (height - pad * 2)}
            className="chart__grid"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {areaPath && <path d={areaPath} fill={color} opacity="0.12" />}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <div className="chart__labels">
        {data.map((item, index) => (
          <span
            key={item.label}
            title={`${item.label}: ${formatValue(item.value)}`}
            className={index % Math.ceil(data.length / 6 || 1) === 0 ? "" : "chart__label--quiet"}
          >
            {item.label}
          </span>
        ))}
      </div>
      <p className="chart__caption">
        Peak {formatValue(peak.value)} on {peak.label}
      </p>
    </div>
  );
}

/** Donut with a legend, driven by a conic gradient. */
export function DonutChart({ segments, ariaLabel, formatValue = number, size = 168 }) {
  const total = segments.reduce((sum, item) => sum + item.value, 0);
  const stops = segments
    .map((item, index) => {
      const before = segments.slice(0, index).reduce((sum, segment) => sum + segment.value, 0);
      const start = total > 0 ? (before / total) * 360 : 0;
      const end = total > 0 ? ((before + item.value) / total) * 360 : 0;
      return `${item.color} ${start}deg ${end}deg`;
    })
    .join(", ");

  return (
    <div className={`donut${total === 0 ? " donut--empty" : ""}`}>
      <div
        className="donut__ring"
        role="img"
        aria-label={ariaLabel}
        style={{ width: size, height: size, background: `conic-gradient(${stops})` }}
      >
        <div className="donut__hole">
          <span className="donut__total">{formatValue(total)}</span>
          <span className="donut__total-label">total</span>
        </div>
      </div>
      <ul className="donut__legend">
        {segments.map((item) => (
          <li key={item.label}>
            <span className="donut__swatch" style={{ background: item.color }} aria-hidden="true" />
            <span className="donut__legend-label">{item.label}</span>
            <span className="donut__legend-value">{formatValue(item.value)}</span>
            <span className="muted">
              {total > 0 ? `${Math.round((item.value / total) * 100)}%` : "0%"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal ranked bars, for "busiest spaces" style lists. */
export function RankedBars({ data, ariaLabel, formatValue = number }) {
  const max = Math.max(1, ...data.map((item) => item.value));

  return (
    <ul className="ranked" aria-label={ariaLabel}>
      {data.map((item) => (
        <li key={item.label}>
          <div className="ranked__row">
            <span className="ranked__label">{item.label}</span>
            <span className="ranked__value">{formatValue(item.value)}</span>
          </div>
          <div className="ranked__track" aria-hidden="true">
            <div className="ranked__fill" style={{ width: `${Math.max(3, (item.value / max) * 100)}%` }} />
          </div>
          {item.hint && <div className="ranked__hint">{item.hint}</div>}
        </li>
      ))}
    </ul>
  );
}
