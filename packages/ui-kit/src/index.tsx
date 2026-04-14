import type { PropsWithChildren } from "react";
import { clsx } from "clsx";

export const Panel = ({
  title,
  subtitle,
  children,
  className
}: PropsWithChildren<{ title?: string; subtitle?: string; className?: string }>) => (
  <section className={clsx("rounded-lg border border-slate-200 bg-white p-4 shadow-sm", className)}>
    {title ? <h3 className="text-sm font-semibold text-slate-800">{title}</h3> : null}
    {subtitle ? <p className="mb-3 text-xs text-slate-500">{subtitle}</p> : null}
    {children}
  </section>
);

export const StatusBadge = ({
  label,
  tone = "neutral"
}: {
  label: string;
  tone?: "neutral" | "ok" | "warn" | "error";
}) => {
  const color = {
    neutral: "bg-slate-100 text-slate-700",
    ok: "bg-emerald-100 text-emerald-700",
    warn: "bg-amber-100 text-amber-700",
    error: "bg-rose-100 text-rose-700"
  }[tone];

  return <span className={clsx("rounded px-2 py-1 text-xs font-medium", color)}>{label}</span>;
};

export const DataTable = ({ headers, rows }: { headers: string[]; rows: Array<Array<string | number>> }) => (
  <div className="overflow-auto rounded border border-slate-200">
    <table className="min-w-full text-left text-sm">
      <thead className="bg-slate-50 text-slate-600">
        <tr>
          {headers.map((header) => (
            <th key={header} className="px-3 py-2 font-medium">
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-t border-slate-100">
            {row.map((cell, j) => (
              <td key={j} className="px-3 py-2 text-slate-700">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
