// Small, dependency-free charts. One hue (brand teal, validated for contrast on white);
// values and labels are always printed in ink, so nothing relies on colour alone.
import type { ReactNode } from 'react';
import { Card } from './ui';

export function StatTile({
  label,
  value,
  sub,
  hero = false,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  hero?: boolean;
}) {
  return (
    <Card className="p-5">
      <p className="text-sm text-slate-600">{label}</p>
      <p className={`mt-1 font-semibold tracking-tight ${hero ? 'text-5xl' : 'text-2xl'}`}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </Card>
  );
}

export function ChartCard({
  title,
  subtitle,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={`p-5 ${className}`}>
      <h2 className="font-semibold">{title}</h2>
      {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </Card>
  );
}

/** Columns over time for a single series. Hover a column for its exact value. */
export function ColumnChart({
  data,
  unit,
}: {
  data: { label: string; value: number }[];
  unit: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const tickEvery = Math.ceil(data.length / 6);
  return (
    <div>
      <div className="flex items-start gap-2">
        <span className="w-6 text-right text-xs tabular-nums text-slate-400">{max}</span>
        <div className="relative flex h-40 flex-1 items-end gap-[2px] border-b border-slate-300">
          <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-slate-200" />
          {data.map((d, i) => (
            <div key={i} className="group relative flex h-full flex-1 items-end justify-center">
              <div
                className="w-full max-w-6 rounded-t bg-brand-500 transition-colors group-hover:bg-brand-700"
                style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value ? 2 : 0 }}
              />
              <div className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs text-white shadow group-hover:block">
                {d.label}: <strong>{d.value}</strong> {unit}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="ml-8 mt-1 flex gap-[2px]">
        {data.map((d, i) => (
          <span key={i} className="flex-1 text-center text-[10px] text-slate-500">
            {i % tickEvery === 0 ? d.label : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Ranked horizontal bars, one hue, value printed beside each bar. */
export function BarList({
  items,
  format = (v) => String(v),
  empty = 'No data for this period.',
  keepOrder = false,
}: {
  items: { label: string; value: number }[];
  format?: (value: number) => string;
  empty?: string;
  /** Keep the given order (e.g. stages of a journey) instead of largest first. */
  keepOrder?: boolean;
}) {
  const rows = keepOrder ? items : [...items].sort((a, b) => b.value - a.value);
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length || rows.every((r) => !r.value))
    return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="text-sm">
          <div className="mb-1 flex justify-between gap-3">
            <span className="truncate text-slate-700">{r.label}</span>
            <span className="font-semibold tabular-nums">{format(r.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full bg-brand-500"
              style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value ? 4 : 0 }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
