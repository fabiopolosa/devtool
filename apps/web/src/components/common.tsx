import clsx from 'clsx';
import type { ReactNode } from 'react';

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={clsx('shell-panel p-4 md:p-5', className)}>{children}</section>;
}

export function SoftPanel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={clsx('shell-panel-soft p-4 md:p-5', className)}>{children}</section>;
}

export function Pill({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'good' | 'warn' | 'bad' | 'accent' }) {
  const styles: Record<typeof tone, string> = {
    default: 'bg-white/5 text-slate-200 border-white/10',
    good: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/20',
    warn: 'bg-amber-400/10 text-amber-300 border-amber-400/20',
    bad: 'bg-rose-400/10 text-rose-300 border-rose-400/20',
    accent: 'bg-cyan-400/10 text-cyan-300 border-cyan-400/20'
  };
  return <span className={clsx('pill', styles[tone])}>{children}</span>;
}

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <Panel className="min-h-[112px]">
      <div className="label">{label}</div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-white">{value}</div>
      {hint ? <div className="mt-2 text-sm text-slate-400">{hint}</div> : null}
    </Panel>
  );
}

export function SectionHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <div className="label">{subtitle}</div>
        <h2 className="title-lg">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = 'ghost',
  type = 'button'
}: {
  children: ReactNode;
  onClick?: (() => void) | undefined;
  variant?: 'ghost' | 'primary' | 'secondary';
  type?: 'button' | 'submit';
}) {
  const variants = {
    ghost: 'border border-white/10 bg-white/5 text-white hover:bg-white/10',
    primary: 'border border-cyan-400/30 bg-cyan-400/15 text-cyan-100 hover:bg-cyan-400/20',
    secondary: 'border border-indigo-400/25 bg-indigo-400/10 text-indigo-100 hover:bg-indigo-400/20'
  };
  return (
    <button type={type} onClick={onClick} className={clsx('rounded-xl px-3 py-2 text-sm font-medium transition', variants[variant])}>
      {children}
    </button>
  );
}

export function Input({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/40"
    />
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 rounded-full bg-white/5">
      <div className="h-2 rounded-full bg-gradient-to-r from-cyan-400 to-indigo-400" style={{ width: `${Math.max(4, Math.min(100, value))}%` }} />
    </div>
  );
}
