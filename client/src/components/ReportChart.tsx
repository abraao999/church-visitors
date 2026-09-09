import type { ReportSeriesPoint } from '../types';

type ChartKind = 'bar' | 'line' | 'donut';

interface Props {
  title: string;
  series: ReportSeriesPoint[];
  compare?: ReportSeriesPoint[];
  kind?: ChartKind;
  empty?: string;
}

function maxValue(series: ReportSeriesPoint[]) {
  return Math.max(1, ...series.map((item) => item.value));
}

export function ReportChart({ title, series, compare, kind = 'bar', empty = 'Sem dados neste período.' }: Props) {
  const total = series.reduce((sum, item) => sum + item.value, 0);
  const headingId = title.replace(/\s+/g, '-').toLowerCase();

  return (
    <article className="report-chart card" aria-labelledby={headingId}>
      <h3 id={headingId}>{title}</h3>
      {series.length === 0 || total === 0 ? (
        <p className="report-empty">{empty}</p>
      ) : kind === 'donut' ? (
        <Donut series={series} />
      ) : kind === 'line' ? (
        <Line series={series} compare={compare} />
      ) : (
        <Bars series={series} />
      )}
      <table className="report-chart-table">
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr>
            <th scope="col">Categoria</th>
            <th scope="col">Valor</th>
          </tr>
        </thead>
        <tbody>
          {series.map((item) => (
            <tr key={item.label}>
              <td>{item.label}</td>
              <td>{item.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}

function Bars({ series }: { series: ReportSeriesPoint[] }) {
  const top = maxValue(series);
  return (
    <ul className="report-bars">
      {series.map((item) => (
        <li key={item.label}>
          <span>{item.label}</span>
          <div className="report-bar-track" aria-hidden="true">
            <div className="report-bar-fill" style={{ width: `${(item.value / top) * 100}%` }} />
          </div>
          <strong>{item.value}</strong>
        </li>
      ))}
    </ul>
  );
}

function Line({ series, compare }: { series: ReportSeriesPoint[]; compare?: ReportSeriesPoint[] }) {
  const width = 360;
  const height = 160;
  const top = maxValue([...series, ...(compare || [])]);
  const points = (items: ReportSeriesPoint[]) =>
    items
      .map((item, index) => {
        const x = items.length === 1 ? width / 2 : (index / (items.length - 1)) * (width - 24) + 12;
        const y = height - 16 - (item.value / top) * (height - 36);
        return `${x},${y}`;
      })
      .join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Gráfico de linhas">
      <polyline fill="none" stroke="var(--primary)" strokeWidth="2.5" points={points(series)} />
      {compare && compare.length > 0 && (
        <polyline fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeDasharray="4 4" points={points(compare)} />
      )}
      {series.map((item, index) => {
        const x = series.length === 1 ? width / 2 : (index / (series.length - 1)) * (width - 24) + 12;
        const y = height - 16 - (item.value / top) * (height - 36);
        return <circle key={item.label} cx={x} cy={y} r="3.5" fill="var(--primary)" />;
      })}
    </svg>
  );
}

function Donut({ series }: { series: ReportSeriesPoint[] }) {
  const total = series.reduce((sum, item) => sum + item.value, 0);
  let offset = 0;
  const colors = ['var(--primary)', '#38bdf8', '#f59e0b', '#22c55e'];
  return (
    <div className="report-donut">
      <svg viewBox="0 0 42 42" role="img" aria-label="Gráfico de proporção">
        {series.map((item, index) => {
          const length = (item.value / total) * 100;
          const circle = (
            <circle
              key={item.label}
              cx="21"
              cy="21"
              r="15.9"
              fill="none"
              stroke={colors[index % colors.length]}
              strokeWidth="6"
              strokeDasharray={`${length} ${100 - length}`}
              strokeDashoffset={-offset}
            />
          );
          offset += length;
          return circle;
        })}
      </svg>
      <ul>
        {series.map((item, index) => (
          <li key={item.label}>
            <i style={{ background: colors[index % colors.length] }} aria-hidden="true" />
            {item.label} · {item.value}
          </li>
        ))}
      </ul>
    </div>
  );
}
