import {
  AlertTriangle,
  CheckCircle2,
  Info,
  type LucideIcon,
  Circle,
  OctagonAlert,
} from 'lucide-react';
import { type ReactNode } from 'react';
import { cn } from './cn';

export type StatusTone = 'success' | 'warning' | 'critical' | 'info' | 'neutral';

const toneStyles: Record<StatusTone, { chip: string; icon: string; Icon: LucideIcon }> = {
  success: { chip: 'border-success/40 bg-success/10', icon: 'text-success', Icon: CheckCircle2 },
  warning: { chip: 'border-warning/50 bg-warning/10', icon: 'text-warning', Icon: AlertTriangle },
  critical: {
    chip: 'border-critical/50 bg-critical/10',
    icon: 'text-critical',
    Icon: OctagonAlert,
  },
  info: { chip: 'border-info/40 bg-info/10', icon: 'text-info', Icon: Info },
  neutral: { chip: 'border-neutral/40 bg-neutral/10', icon: 'text-neutral', Icon: Circle },
};

/**
 * Status is always carried by the text label; colour and icon reinforce it.
 * Text stays in ink because amber and green text fail AA contrast at chip size.
 */
export function StatusChip({
  tone,
  children,
  className,
}: {
  tone: StatusTone;
  children: ReactNode;
  className?: string;
}) {
  const { chip, icon, Icon } = toneStyles[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-ink',
        chip,
        className,
      )}
    >
      <Icon aria-hidden className={cn('size-3.5', icon)} strokeWidth={2.25} />
      {children}
    </span>
  );
}

export function Alert({
  tone,
  title,
  children,
  className,
}: {
  tone: StatusTone;
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  const { chip, icon, Icon } = toneStyles[tone];
  return (
    <div
      role={tone === 'critical' || tone === 'warning' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-md border px-4 py-3 text-sm text-ink', chip, className)}
    >
      <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', icon)} />
      <div>
        <p className="font-semibold">{title}</p>
        {children && <div className="mt-0.5 text-slate">{children}</div>}
      </div>
    </div>
  );
}
