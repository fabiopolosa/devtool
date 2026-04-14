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
    <Panel className="min-h-[104px]">
      <div className="label">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-[color:var(--text)]">{value}</div>
      {hint ? <div className="mt-2 text-sm text-[color:var(--muted)]">{hint}</div> : null}
      <div className="mt-3 flex items-end gap-1.5">
        {[32, 52, 44, 67, 58, 74, 64].map((height, index) => (
          <span
            key={`${label}-${index}`}
            className="w-1.5 rounded-full"
            style={{
              height: `${height / 4}px`,
              background: 'linear-gradient(180deg, var(--accent-2), var(--accent))',
              opacity: 0.5 + index * 0.06
            }}
          />
        ))}
      </div>
    </Panel>
  );
}

export function SectionHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <div className="label">{subtitle}</div>
        <h2 className="title-lg leading-7">{title}</h2>
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
    ghost: 'btn-ghost',
    primary: 'btn-primary',
    secondary: 'btn-secondary'
  };
  return (
    <button type={type} onClick={onClick} className={clsx('btn', variants[variant])}>
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
