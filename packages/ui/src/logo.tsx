import { cn } from './cn';

/**
 * Placeholder symbol: two linked points joined by a continuous path, following the
 * "connected pathway" direction in the brand guidelines. Replace with the approved
 * vector artwork once the logo is finalised.
 */
export function LogoSymbol({
  className,
  title = 'Lifeline',
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg viewBox="0 0 32 32" role="img" aria-label={title} className={cn('size-8', className)}>
      <path
        d="M8 22c0-6 4-8 8-8s8-2 8-8"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="8" cy="23" r="4" fill="currentColor" />
      <circle cx="24" cy="9" r="4" fill="var(--color-teal, #0F8B8D)" />
    </svg>
  );
}

export function Logo({ className, inverse = false }: { className?: string; inverse?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2',
        inverse ? 'text-white' : 'text-navy',
        className,
      )}
    >
      <LogoSymbol title="" className="size-7" />
      <span className="font-display text-xl font-bold tracking-tight">Lifeline</span>
    </span>
  );
}
