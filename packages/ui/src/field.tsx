import {
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
} from 'react';
import { cn } from './cn';

const controlClass =
  'block w-full rounded-sm border border-border-strong bg-surface px-3 text-sm text-ink ' +
  'placeholder:text-muted focus:border-teal-deep focus:outline-2 focus:outline-offset-0 focus:outline-teal-deep/30 ' +
  'aria-[invalid=true]:border-critical disabled:bg-surface-subtle disabled:text-muted';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClass, 'h-10', className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(controlClass, 'h-10', className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={cn(controlClass, 'min-h-24 py-2 leading-relaxed', className)} {...props} />
  );
}

interface FieldProps {
  label: string;
  /** Pass the control as a render function so it receives the ids that link label, hint and error. */
  children: (control: {
    id: string;
    'aria-describedby'?: string;
    'aria-invalid'?: boolean;
  }) => ReactNode;
  hint?: string;
  error?: string;
  optional?: boolean;
  className?: string;
}

/** Visible label, optional hint and inline error, per the brand form guidelines. */
export function Field({ label, children, hint, error, optional, className }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-[13px] font-medium text-ink">
        {label}
        {optional && <span className="ml-1 font-normal text-muted">(optional)</span>}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && (
        <p id={hintId} className="text-xs text-slate">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-critical">
          {error}
        </p>
      )}
    </div>
  );
}
