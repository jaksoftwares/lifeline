'use client';

import { PASSWORD_MIN_LENGTH } from '@lifeline/domain';
import { type AuthStepResponse, type MfaSetupResponse } from '@lifeline/schemas';
import { Alert, Button, Card, Field, Input, Logo } from '@lifeline/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { ME_QUERY_KEY } from '@/lib/session';

type Step =
  | { kind: 'credentials' }
  | { kind: 'password'; challengeToken: string }
  | { kind: 'mfa-setup'; challengeToken: string }
  | { kind: 'mfa'; challengeToken: string };

/** Only same-site paths, so the sign-in page can't be used to redirect people elsewhere. */
function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

export function SignInFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>({ kind: 'credentials' });
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(call: () => Promise<AuthStepResponse>) {
    setBusy(true);
    setError(null);
    try {
      const result = await call();
      if (result.step === 'AUTHENTICATED') {
        queryClient.setQueryData(ME_QUERY_KEY, result.user);
        router.replace(safeNext(params.get('next')));
        return;
      }
      setStep(
        result.step === 'PASSWORD_CHANGE_REQUIRED'
          ? { kind: 'password', challengeToken: result.challengeToken }
          : result.step === 'MFA_SETUP_REQUIRED'
            ? { kind: 'mfa-setup', challengeToken: result.challengeToken }
            : { kind: 'mfa', challengeToken: result.challengeToken },
      );
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, 'Something went wrong. Try again.'));
      // An expired challenge means starting over.
      if (e instanceof ApiError && e.status === 401 && step.kind !== 'credentials')
        setStep({ kind: 'credentials' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-md p-8">
      <Logo />
      <p className="mt-1 text-[13px] text-slate">Healthcare Referral &amp; Transfer Coordination</p>

      <div className="mt-8 space-y-5">
        {params.get('expired') && step.kind === 'credentials' && !error && (
          <Alert tone="info" title="Your session has ended">
            Sign in again to continue.
          </Alert>
        )}
        {error && !Object.keys(error.fieldErrors).length && (
          <Alert tone="critical" title={error.message} />
        )}

        {step.kind === 'credentials' && (
          <CredentialsStep
            busy={busy}
            fieldErrors={error?.fieldErrors}
            onSubmit={(email, password) =>
              run(() =>
                api('/auth/login', {
                  method: 'POST',
                  body: { email, password },
                  skipRefresh: true,
                }),
              )
            }
          />
        )}
        {step.kind === 'password' && (
          <NewPasswordStep
            busy={busy}
            fieldErrors={error?.fieldErrors}
            onSubmit={(newPassword) =>
              run(() =>
                api('/auth/password/initial', {
                  method: 'POST',
                  body: { challengeToken: step.challengeToken, newPassword },
                  skipRefresh: true,
                }),
              )
            }
          />
        )}
        {step.kind === 'mfa-setup' && (
          <MfaSetupStep
            challengeToken={step.challengeToken}
            busy={busy}
            onSubmit={(code) =>
              run(() =>
                api('/auth/mfa/setup/confirm', {
                  method: 'POST',
                  body: { challengeToken: step.challengeToken, code },
                  skipRefresh: true,
                }),
              )
            }
          />
        )}
        {step.kind === 'mfa' && (
          <CodeStep
            busy={busy}
            title="Enter your verification code"
            description="Open your authenticator app and enter the 6-digit code for Lifeline."
            onSubmit={(code) =>
              run(() =>
                api('/auth/mfa/verify', {
                  method: 'POST',
                  body: { challengeToken: step.challengeToken, code },
                  skipRefresh: true,
                }),
              )
            }
          />
        )}
      </div>
    </Card>
  );
}

function CredentialsStep({
  busy,
  fieldErrors,
  onSubmit,
}: {
  busy: boolean;
  fieldErrors?: Record<string, string>;
  onSubmit: (email: string, password: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <form
      className="space-y-4"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit(email, password);
      }}
    >
      <h1 className="font-display text-2xl font-bold">Sign in</h1>
      <Field label="Work email" error={fieldErrors?.email}>
        {(p) => (
          <Input
            {...p}
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}
      </Field>
      <Field label="Password" error={fieldErrors?.password}>
        {(p) => (
          <Input
            {...p}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
      </Field>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
      <p className="text-xs text-slate">
        Forgotten your password or lost your phone? Contact your facility or network administrator.
      </p>
    </form>
  );
}

function NewPasswordStep({
  busy,
  fieldErrors,
  onSubmit,
}: {
  busy: boolean;
  fieldErrors?: Record<string, string>;
  onSubmit: (password: string) => void;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const mismatch = confirm.length > 0 && confirm !== password;
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!mismatch) onSubmit(password);
      }}
    >
      <div>
        <h1 className="font-display text-2xl font-bold">Choose your password</h1>
        <p className="mt-1 text-sm text-slate">
          You signed in with a temporary password. Choose a new one that only you know.
        </p>
      </div>
      <Field
        label="New password"
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        error={fieldErrors?.newPassword}
      >
        {(p) => (
          <Input
            {...p}
            type="password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
      </Field>
      <Field
        label="Confirm new password"
        error={mismatch ? 'The passwords don’t match.' : undefined}
      >
        {(p) => (
          <Input
            {...p}
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        )}
      </Field>
      <Button type="submit" className="w-full" disabled={busy || mismatch}>
        {busy ? 'Saving…' : 'Save password and continue'}
      </Button>
    </form>
  );
}

function MfaSetupStep({
  challengeToken,
  busy,
  onSubmit,
}: {
  challengeToken: string;
  busy: boolean;
  onSubmit: (code: string) => void;
}) {
  const [setup, setSetup] = useState<MfaSetupResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api<MfaSetupResponse>('/auth/mfa/setup', {
      method: 'POST',
      body: { challengeToken },
      skipRefresh: true,
    })
      .then(setSetup)
      .catch((e: unknown) =>
        setLoadError(e instanceof ApiError ? e.message : 'We couldn’t start setup. Try again.'),
      );
  }, [challengeToken]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold">Set up two-step verification</h1>
        <p className="mt-1 text-sm text-slate">
          Your role gives access to administrative or audit information, so Lifeline asks for a code
          from an authenticator app each time you sign in.
        </p>
      </div>
      {loadError && <Alert tone="critical" title={loadError} />}
      {setup && (
        <>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink">
            <li>
              Install an authenticator app, such as Google Authenticator or Microsoft Authenticator.
            </li>
            <li>Scan this code with the app.</li>
            <li>Enter the 6-digit code the app shows.</li>
          </ol>
          <div className="flex justify-center rounded-md border border-border bg-surface p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL generated by the API */}
            <img
              src={setup.qrCodeDataUrl}
              alt="QR code for your authenticator app"
              width={180}
              height={180}
            />
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-teal-deep">Can’t scan the code?</summary>
            <p className="mt-2 text-slate">Enter this key in your app instead:</p>
            <code className="mt-1 block rounded-sm bg-surface-blue px-3 py-2 font-mono text-[13px] tracking-wider break-all text-ink">
              {setup.secret.match(/.{1,4}/g)?.join(' ')}
            </code>
          </details>
          <CodeStep busy={busy} onSubmit={onSubmit} submitLabel="Confirm and sign in" />
        </>
      )}
    </div>
  );
}

function CodeStep({
  busy,
  title,
  description,
  submitLabel = 'Verify',
  onSubmit,
}: {
  busy: boolean;
  title?: string;
  description?: string;
  submitLabel?: string;
  onSubmit: (code: string) => void;
}) {
  const [code, setCode] = useState('');
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(code);
      }}
    >
      {title && (
        <div>
          <h1 className="font-display text-2xl font-bold">{title}</h1>
          {description && <p className="mt-1 text-sm text-slate">{description}</p>}
        </div>
      )}
      <Field label="6-digit code">
        {(p) => (
          <Input
            {...p}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            className="tabular text-lg tracking-[0.3em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
        )}
      </Field>
      <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
        {busy ? 'Checking…' : submitLabel}
      </Button>
    </form>
  );
}
