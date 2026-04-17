import clsx from 'clsx';
import type { ReactNode } from 'react';

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={clsx('shell-panel p-3 md:p-4', className)}>{children}</section>;
}

export function SoftPanel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={clsx('shell-panel-soft p-3 md:p-4', className)}>{children}</section>;
}

export function Pill({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'good' | 'warn' | 'bad' | 'accent' }) {
  const styles: Record<typeof tone, string> = {
    default: 'pill-default',
    good: 'pill-good',
    warn: 'pill-warn',
    bad: 'pill-bad',
    accent: 'pill-accent'
  };
  return <span className={clsx('pill', styles[tone])}>{children}</span>;
}

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <Panel className="min-h-[92px]">
      <div className="label">{label}</div>
      <div className="mt-1 text-[28px] font-semibold tracking-[-0.02em] leading-none text-[color:var(--text)]">{value}</div>
      {hint ? <div className="mt-1 text-xs uppercase tracking-[0.12em] text-[color:var(--muted)]">{hint}</div> : null}
      <div className="mt-3 h-[2px] w-full bg-[color:var(--line)]">
        <div className="h-[2px] w-1/3 bg-[color:var(--accent)]" />
      </div>
    </Panel>
  );
}

export function SectionHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-start justify-between gap-3 border-b border-[color:var(--line)] pb-2">
      <div>
        <div className="label">{subtitle}</div>
        <h2 className="title-lg leading-6">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = 'ghost',
  type = 'button',
  disabled = false
}: {
  children: ReactNode;
  onClick?: (() => void) | undefined;
  variant?: 'ghost' | 'primary' | 'secondary';
  type?: 'button' | 'submit';
  disabled?: boolean;
}) {
  const variants = {
    ghost: 'btn-ghost',
    primary: 'btn-primary',
    secondary: 'btn-secondary'
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={clsx('btn', variants[variant])}>
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
      className="cp-input"
    />
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="cp-progress">
      <div className="cp-progress-bar" style={{ width: `${Math.max(4, Math.min(100, value))}%` }} />
    </div>
  );
}
