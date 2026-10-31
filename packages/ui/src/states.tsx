import { Loader2, type LucideIcon } from 'lucide-react';
import { type ReactNode } from 'react';
import { cn } from './cn';

export function EmptyState({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      {Icon && <Icon aria-hidden className="mb-3 size-8 text-muted" strokeWidth={1.5} />}
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-slate">{children}</div>}
    </div>
  );
}

export function Loading({ label, className }: { label: string; className?: string }) {
  return (
    <div
      role="status"
      className={cn('flex items-center justify-center gap-2 py-12 text-sm text-slate', className)}
    >
      <Loader2 aria-hidden className="size-4 animate-spin" />
      {label}
    </div>
  );
}
