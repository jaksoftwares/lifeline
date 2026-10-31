import { cva, type VariantProps } from 'class-variance-authority';
import { type ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

// Primary uses Deep Teal: standard teal with white text is ~4.1:1, below WCAG AA for 14px text.
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-sm font-medium transition-colors ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-deep ' +
    'disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-teal-deep text-white hover:bg-navy',
        secondary: 'border border-border-strong bg-surface text-ink hover:bg-surface-subtle',
        ghost: 'text-slate hover:bg-surface-blue hover:text-ink',
        critical: 'bg-critical text-white hover:bg-critical/90',
      },
      size: {
        sm: 'h-8 px-3 text-[13px]',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-5 text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
